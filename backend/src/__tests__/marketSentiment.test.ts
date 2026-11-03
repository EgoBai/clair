import { describe, it, expect } from 'vitest';
import {
  calculateATR,
  calculateBollingerBands,
  calculateEMA,
  calculateRSI,
} from '../indicators/technical';

/**
 * 市场情绪与指标测试（批次 7：绑定生产实现）
 *
 * 生产实现（唯一真源）：backend/src/indicators/technical.ts
 * - EMA：前 period-1 个 null，index=period-1 为前 period 个值的 SMA 种子。
 * - RSI：Wilder 平滑，前 period 个 null；不足 period+1 个价格时全为 null
 *   （旧副本返回 50 是伪造中性值，已改口径）。
 * - ATR：返回 { atr, trueRange }，trueRange[0] 为 null（首根缺前收），
 *   atr 首个有效值在 index=period；数据不足返回 null（旧副本用 0 顶替空态，已改口径）。
 * - 布林带：上下轨由生产 calculateBollingerBands 计算（总体标准差口径）；
 *   position/signal 是测试侧派生观测——生产 frontend 的 calculateBBPosition
 *   只返回 position 数组，没有 overbought/oversold 阈值，不能虚构生产实现。
 *
 * 未迁移（后端无生产实现，保留本地 helper，不虚构生产代码）：
 * - 涨跌家数比、恐惧贪婪指数、TRIN、市场宽度聚合、OBV。
 * - McClellan 振荡器的组合逻辑未迁移；其 EMA 基元已改用生产实现。
 * - 前端 featureEngineeringEngine / momentumOscillatorEngine 有同名 RSI/OBV 副本，
 *   但仅被自身测试引用、未被产品页面使用，且预热期与边界口径不同，本批不绑定。
 */

interface DayData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  upCount: number;
  downCount: number;
  flatCount: number;
  limitUpCount: number;
  limitDownCount: number;
  newHighCount: number;
  newLowCount: number;
}

interface SentimentScore {
  date: string;
  score: number;
  level: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
  components: Record<string, number>;
}

// 未迁移：后端无涨跌家数比纯函数（marketBreadthService 走真实行情 + DB，无此纯函数口径）。
function calculateAdvanceDeclineRatio(data: DayData): number {
  const total = data.upCount + data.downCount + data.flatCount;
  return total > 0 ? Math.round((data.upCount / (data.upCount + data.downCount || 1)) * 100) / 100 : 0.5;
}

// 未迁移：McClellan 组合逻辑；EMA 基元已改用生产实现（null 预热需显式处理）。
function calculateMcClellanOscillator(advances: number[], declines: number[], period = 19): number {
  if (advances.length < period || declines.length < period) return 0;
  const diff = advances.map((a, i) => a - declines[i]);
  const emaShort = calculateEMA(diff, 10);
  const emaLong = calculateEMA(diff, period);
  const shortLast = emaShort[emaShort.length - 1];
  const longLast = emaLong[emaLong.length - 1];
  if (shortLast === null || shortLast === undefined || longLast === null || longLast === undefined) return 0;
  return Math.round((shortLast - longLast) * 100) / 100;
}

// 未迁移：后端无恐惧贪婪指数生产实现。
function calculateFearGreedIndex(dayData: DayData, prevData?: DayData): SentimentScore {
  const components: Record<string, number> = {};

  // 1. Price momentum (vs 5-day avg, simplified)
  components.priceMomentum = dayData.close > dayData.open ? 60 : 40;

  // 2. Advance/Decline
  components.advanceDecline = calculateAdvanceDeclineRatio(dayData) * 100;

  // 3. Limit up/down sentiment
  const limitNet = dayData.limitUpCount - dayData.limitDownCount;
  components.limitActivity = Math.max(0, Math.min(100, 50 + limitNet * 2));

  // 4. New highs vs lows
  const newHighNet = dayData.newHighCount - dayData.newLowCount;
  components.newHighLow = Math.max(0, Math.min(100, 50 + newHighNet));

  // 5. Volume (relative)
  components.volume = dayData.amount > 1e12 ? 70 : dayData.amount > 5e11 ? 50 : 30;

  const avg = Object.values(components).reduce((a, b) => a + b, 0) / Object.values(components).length;
  const score = Math.round(avg);

  let level: SentimentScore['level'];
  if (score <= 25) level = 'extreme_fear';
  else if (score <= 40) level = 'fear';
  else if (score <= 60) level = 'neutral';
  else if (score <= 75) level = 'greed';
  else level = 'extreme_greed';

  return { date: dayData.date, score, level, components };
}

// 未迁移：后端无 TRIN 生产实现。
function calculateTRIN(upVolume: number, downVolume: number, upCount: number, downCount: number): number {
  if (downVolume === 0 || downCount === 0) return 0;
  const advRatio = upCount / downCount;
  const volRatio = upVolume / downVolume;
  return Math.round((advRatio / volRatio) * 1000) / 1000;
}

// 未迁移：后端 marketBreadthService 为 async 类且依赖真实行情 + PG，无同口径纯函数。
function calculateMarketBreadth(stocks: { code: string; change: number; volume: number }[]): {
  advancers: number;
  decliners: number;
  unchanged: number;
  upVolume: number;
  downVolume: number;
  trin: number;
  breadth: number;
} {
  let advancers = 0, decliners = 0, unchanged = 0;
  let upVolume = 0, downVolume = 0;

  for (const s of stocks) {
    if (s.change > 0) { advancers++; upVolume += s.volume; }
    else if (s.change < 0) { decliners++; downVolume += s.volume; }
    else unchanged++;
  }

  const trin = calculateTRIN(upVolume, downVolume, advancers, decliners);
  const breadth = advancers - decliners;

  return { advancers, decliners, unchanged, upVolume, downVolume, trin, breadth };
}

// 布林带上下轨绑定生产实现；position 与 overbought/oversold signal 是测试侧派生观测。
function calculateBollingerPosition(close: number, prices: number[], period = 20, multiplier = 2): {
  upper: number;
  middle: number;
  lower: number;
  position: number; // -1 to 1, where 0 = middle
  signal: 'overbought' | 'oversold' | 'neutral';
} {
  if (prices.length < period) {
    return { upper: close, middle: close, lower: close, position: 0, signal: 'neutral' };
  }
  const bands = calculateBollingerBands(prices, period, multiplier);
  const last = prices.length - 1;
  const upper = bands.upper[last];
  const middle = bands.middle[last];
  const lower = bands.lower[last];
  if (upper === null || middle === null || lower === null) {
    return { upper: close, middle: close, lower: close, position: 0, signal: 'neutral' };
  }
  const range = upper - lower;
  const position = range > 0 ? ((close - middle) / (range / 2)) : 0;

  let signal: 'overbought' | 'oversold' | 'neutral' = 'neutral';
  if (position > 0.8) signal = 'overbought';
  else if (position < -0.8) signal = 'oversold';

  return {
    upper: Math.round(upper * 100) / 100,
    middle: Math.round(middle * 100) / 100,
    lower: Math.round(lower * 100) / 100,
    position: Math.round(position * 1000) / 1000,
    signal,
  };
}

// 未迁移：后端无 OBV 生产实现（前端副本首值为 volume[0]，口径不同）。
function calculateOBV(prices: number[], volumes: number[]): number[] {
  if (prices.length === 0) return [];
  const obv = [0];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > prices[i - 1]) obv.push(obv[i - 1] + volumes[i]);
    else if (prices[i] < prices[i - 1]) obv.push(obv[i - 1] - volumes[i]);
    else obv.push(obv[i - 1]);
  }
  return obv;
}

describe('Market Sentiment & Indicators', () => {
  describe('Advance/Decline Ratio', () => {
    it('should calculate correctly', () => {
      const day: DayData = { date: '2024-01-01', open: 3000, high: 3050, low: 2980, close: 3020, volume: 1e9, amount: 1e12, upCount: 3000, downCount: 1000, flatCount: 500, limitUpCount: 50, limitDownCount: 10, newHighCount: 20, newLowCount: 5 };
      expect(calculateAdvanceDeclineRatio(day)).toBe(0.75);
    });

    it('should return 0.5 for zero counts', () => {
      const day: DayData = { date: '2024-01-01', open: 3000, high: 3050, low: 2980, close: 3020, volume: 1e9, amount: 1e12, upCount: 0, downCount: 0, flatCount: 0, limitUpCount: 0, limitDownCount: 0, newHighCount: 0, newLowCount: 0 };
      expect(calculateAdvanceDeclineRatio(day)).toBe(0.5);
    });

    it('should return 1 for all advances', () => {
      const day: DayData = { date: '2024-01-01', open: 3000, high: 3050, low: 2980, close: 3020, volume: 1e9, amount: 1e12, upCount: 4500, downCount: 0, flatCount: 0, limitUpCount: 100, limitDownCount: 0, newHighCount: 50, newLowCount: 0 };
      expect(calculateAdvanceDeclineRatio(day)).toBe(1);
    });
  });

  describe('EMA', () => {
    it('should calculate EMA with SMA seed and null warmup', () => {
      const ema = calculateEMA([1, 2, 3, 4, 5], 3);
      expect(ema).toHaveLength(5);
      expect(ema[0]).toBeNull();
      expect(ema[1]).toBeNull();
      expect(ema[2]).toBe(2); // 前 3 个值的 SMA 种子
      expect(ema[3]).toBe(3);
      expect(ema[4]).toBe(4);
    });

    it('should return empty for empty input', () => {
      expect(calculateEMA([], 3)).toHaveLength(0);
    });

    it('should approach latest value', () => {
      const values = Array.from({ length: 50 }, () => 10);
      const ema = calculateEMA(values, 10);
      expect(ema[ema.length - 1]).toBeCloseTo(10, 1);
    });
  });

  describe('RSI', () => {
    it('should calculate RSI for uptrend', () => {
      const prices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
      const rsi = calculateRSI(prices, 14);
      expect(rsi).toHaveLength(prices.length);
      expect(rsi[14]).toBe(100);
    });

    it('should calculate RSI for downtrend', () => {
      const prices = [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
      const rsi = calculateRSI(prices, 14);
      expect(rsi[14]).toBe(0);
    });

    it('should return null for insufficient data', () => {
      expect(calculateRSI([1, 2, 3], 14)).toEqual([null, null, null]);
    });

    it('should return 100 for all gains', () => {
      const prices = Array.from({ length: 16 }, (_, i) => i);
      const rsi = calculateRSI(prices, 14);
      expect(rsi[14]).toBe(100);
      expect(rsi[15]).toBe(100);
    });
  });

  describe('Fear & Greed Index', () => {
    const bullishDay: DayData = { date: '2024-01-01', open: 3000, high: 3100, low: 2990, close: 3080, volume: 2e9, amount: 2e12, upCount: 4000, downCount: 500, flatCount: 100, limitUpCount: 80, limitDownCount: 5, newHighCount: 60, newLowCount: 2 };

    it('should detect greed on bullish day', () => {
      const sentiment = calculateFearGreedIndex(bullishDay);
      expect(['greed', 'extreme_greed', 'neutral']).toContain(sentiment.level);
      expect(sentiment.score).toBeGreaterThan(50);
    });

    it('should detect fear on bearish day', () => {
      const bearishDay: DayData = { date: '2024-01-01', open: 3000, high: 3010, low: 2900, close: 2920, volume: 1e9, amount: 8e11, upCount: 500, downCount: 4000, flatCount: 100, limitUpCount: 5, limitDownCount: 80, newHighCount: 2, newLowCount: 60 };
      const sentiment = calculateFearGreedIndex(bearishDay);
      expect(['fear', 'extreme_fear']).toContain(sentiment.level);
    });

    it('should include all components', () => {
      const sentiment = calculateFearGreedIndex(bullishDay);
      expect(sentiment.components).toHaveProperty('priceMomentum');
      expect(sentiment.components).toHaveProperty('advanceDecline');
      expect(sentiment.components).toHaveProperty('limitActivity');
      expect(sentiment.components).toHaveProperty('newHighLow');
      expect(sentiment.components).toHaveProperty('volume');
    });

    it('should have score between 0 and 100', () => {
      const sentiment = calculateFearGreedIndex(bullishDay);
      expect(sentiment.score).toBeGreaterThanOrEqual(0);
      expect(sentiment.score).toBeLessThanOrEqual(100);
    });
  });

  describe('TRIN', () => {
    it('should calculate TRIN', () => {
      const trin = calculateTRIN(1e9, 5e8, 3000, 1500);
      expect(trin).toBe(1);
    });

    it('should handle >1 TRIN (bearish)', () => {
      const trin = calculateTRIN(5e8, 1e9, 3000, 1500);
      expect(trin).toBeGreaterThan(1);
    });

    it('should return 0 for zero denominators', () => {
      expect(calculateTRIN(1e9, 0, 1000, 0)).toBe(0);
    });
  });

  describe('Market Breadth', () => {
    it('should calculate breadth indicators', () => {
      const stocks = [
        { code: '1', change: 2, volume: 1e6 },
        { code: '2', change: -1, volume: 2e6 },
        { code: '3', change: 3, volume: 3e6 },
        { code: '4', change: -2, volume: 4e6 },
        { code: '5', change: 0, volume: 1e6 },
      ];
      const breadth = calculateMarketBreadth(stocks);
      expect(breadth.advancers).toBe(2);
      expect(breadth.decliners).toBe(2);
      expect(breadth.unchanged).toBe(1);
      expect(breadth.breadth).toBe(0);
    });

    it('should handle empty array', () => {
      const breadth = calculateMarketBreadth([]);
      expect(breadth.advancers).toBe(0);
      expect(breadth.breadth).toBe(0);
    });
  });

  describe('Bollinger Bands', () => {
    it('should calculate bands', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5);
      const bb = calculateBollingerPosition(prices[prices.length - 1], prices);
      expect(bb.upper).toBeGreaterThan(bb.lower);
      expect(bb.position).toBeGreaterThanOrEqual(-1);
      expect(bb.position).toBeLessThanOrEqual(1);
    });

    it('should detect overbought', () => {
      const prices = Array.from({ length: 25 }, (_, i) => 100 + i * 0.1);
      const bb = calculateBollingerPosition(110, prices);
      expect(bb.signal).toBe('overbought');
    });

    it('should detect oversold', () => {
      const prices = Array.from({ length: 25 }, (_, i) => 100 - i * 0.1);
      const bb = calculateBollingerPosition(90, prices);
      expect(bb.signal).toBe('oversold');
    });

    it('should handle insufficient data', () => {
      const bb = calculateBollingerPosition(100, [100, 101]);
      expect(bb.signal).toBe('neutral');
    });
  });

  describe('ATR', () => {
    it('should calculate ATR', () => {
      const highs = [10, 11, 12, 11, 13, 12, 14, 13, 11, 12, 13, 14, 15, 14, 16, 15].map(x => x + 1);
      const lows = [10, 11, 12, 11, 13, 12, 14, 13, 11, 12, 13, 14, 15, 14, 16, 15].map(x => x - 1);
      const closes = [10, 11, 12, 11, 13, 12, 14, 13, 11, 12, 13, 14, 15, 14, 16, 15];
      const { atr } = calculateATR(highs, lows, closes, 14);
      const lastAtr = atr[atr.length - 1];
      expect(lastAtr).not.toBeNull();
      expect(lastAtr!).toBeGreaterThan(0);
    });

    it('should return null for insufficient data', () => {
      const { atr, trueRange } = calculateATR([1], [0], [0.5], 14);
      expect(atr).toEqual([null]);
      expect(trueRange).toEqual([null]);
    });
  });

  describe('OBV', () => {
    it('should calculate on-balance volume', () => {
      const prices = [10, 11, 10, 12, 11];
      const volumes = [0, 1000, 2000, 1500, 3000];
      const obv = calculateOBV(prices, volumes);
      expect(obv).toHaveLength(5);
      expect(obv[0]).toBe(0);
      expect(obv[1]).toBe(1000); // up
      expect(obv[2]).toBe(-1000); // down
      expect(obv[3]).toBe(500); // up
      expect(obv[4]).toBe(-2500); // down
    });

    it('should handle flat prices', () => {
      const prices = [10, 10, 10];
      const volumes = [0, 1000, 2000];
      const obv = calculateOBV(prices, volumes);
      expect(obv).toEqual([0, 0, 0]);
    });

    it('should return empty for empty input', () => {
      expect(calculateOBV([], [])).toHaveLength(0);
    });
  });
});
