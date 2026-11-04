import { describe, it, expect } from 'vitest';
import { calculateEMA, calculateMACD } from '../utils/featureEngineeringEngine';
import { calculateSMA } from '../utils/chartDataProcessing';
import { detectPatterns, type OHLCV } from '../utils/chartPatternEngine';
import { calculateKDJ } from '../../../backend/src/indicators/technical';

/**
 * 高级图表工具（frontend 影子测试 → 生产实现绑定）
 * =============================================================================
 * 一、原自抄实现的问题
 * 1. calcSMA 在 n<period 时用「最后一个值或 0」填充（values.map(() => values[n-1] || 0)），
 *    预热段还返回前缀均值；这是凭空造值，不是缺失预热，违反「禁零值顶替空态」。
 * 2. calcMACD 在 prices.length<slow 时直接返回全 0 对象（同样是零值顶替空态）；正常路径
 *    还把结果 Math.round(*1000)，而生产导出保留原始 double，人为降低精度。
 * 3. calcKDJ 从 i=0 就用 50 平滑，且返回 {k,d,j}[]；生产 calculateKDJ 前 period-1 位是
 *    null 预热，首根 K/D 直接置 50，再逐根平滑，返回三条等长数组。
 * 4. detectCandlePatterns 用 reliability 字段，生产 PatternResult 用 confidence；吞没形态
 *    startIndex 指向吞没前一根（i-1）；锤子线生产多一条 body/range>0.05 阈值，并按前一根
 *    阴阳决定「锤子线/上吊线」。
 * 5. KDJ 夹具的 close/volume 用无种子随机数生成，不可复现。
 *
 * 二、绑定生产实现（file:line）
 * - calcEMA → frontend/src/utils/featureEngineeringEngine.ts:45 calculateEMA(prices, period)
 *   首值作种子、无 null 预热、长度=n，与自抄逐行同构。未选
 *   backend/src/utils/futureValueUtils.ts:89 calcEMA 与 backend/src/indicators/technical.ts:139
 *   calculateEMA：两者都是 null 预热 + SMA 作种子，契约不同。
 * - calcSMA → frontend/src/utils/chartDataProcessing.ts:73 calculateSMA(data, period)
 *   i<period-1 返回 null；生产不做前缀均值填充。
 * - calcMACD → frontend/src/utils/featureEngineeringEngine.ts:85 calculateMACD(prices, fast, slow, signal)
 *   三条等长 number[]，histogram = macd - signal，内部 EMA 首值种子。未选
 *   backend/src/utils/futureValueUtils.ts:109 calcMACD：histogram 为 2*(dif-dea)、dif/dea
 *   为 null 预热且 dea 有位移；也未选 backend/src/indicators/technical.ts:168：null 预热 +
 *   SMA 种子，口径不同。
 * - calcKDJ → backend/src/indicators/technical.ts:289 calculateKDJ(high[], low[], close[], period)
 * - detectCandlePatterns → frontend/src/utils/chartPatternEngine.ts:136 detectPatterns(candles)
 *   PatternResult（:15）含 confidence/startIndex/endIndex/description，OHLCV 复用该文件 :6。
 *
 * 三、未迁移清单及原因（保留本地内联）
 * - calcVolumeProfile：backend/src/services/volumeProfileEngine.ts:33 computeVolumeProfile 与
 *   frontend/src/utils/volumeProfileEngine.ts:37 buildVolumeProfile 都按绝对价格/priceStep 分桶，
 *   返回标量 poc/vah/val；自抄按 [min low,max high] 等分 numBins 并返回带 poc 标记的桶数组，契约不同。
 * - calcStochasticRSI：frontend/src 与 backend/src 非测试源码均无该指标导出
 *   （featureEngineeringEngine.ts:192 calculateStochastic 是 KD 随机指标，不是 RSI 随机化）。
 * - pivotPoints：仓库只有 backend/src/services/patternRecognitionEngine.ts:85 findPivots（摆动高低点），
 *   无经典 floor-trader pivot 导出。
 * - fibRetracement：frontend/src/utils/elliottWaveEngine.ts:307 calculateFibonacciLevels 返回
 *   retracement/projection 映射对象，不是 7 层数组。
 *
 * 四、旧断言订正
 * - SMA「不足数据」旧断言只查长度 2；生产返回 [null,null]，自抄返回 [2,2]（末值填充），
 *   新断言精确断言 [null,null]。
 * - MACD「不足数据返回全零」旧断言错误：生产无 length<slow 守卫，[1,2,3] 时只有索引 0 因两个
 *   EMA 都从 prices[0] 起步而为 0，索引 1/2 非零；新断言按生产给出 [0, 0.0798, 0.2211]。
 * - KDJ 旧断言把结果当 {k,d,j}[]；生产返回 {k[],d[],j[]}，且前 8 位 null，改为数组断言。
 * - 锤子线旧夹具 body=0，生产要求 body/range>0.05，实际只会命中十字星；旧注释
 *   「qualifies as doji/hammer」错误，新断言明确只有十字星，另加一根真正满足阈值的夹具。
 * - 蜡烛形态 reliability 旧字段在生产不存在，统一改 confidence。
 */

// 未迁移：生产无同契约导出（见文件头第三节），保留内联。
function calcVolumeProfile(data: OHLCV[], numBins = 10): { price: number; volume: number; poc: boolean }[] {
  if (data.length === 0) return [];
  const minPrice = Math.min(...data.map(d => d.low));
  const maxPrice = Math.max(...data.map(d => d.high));
  const binSize = (maxPrice - minPrice) / numBins || 1;
  const bins = Array.from({ length: numBins }, (_, i) => ({
    price: minPrice + (i + 0.5) * binSize,
    volume: 0,
    poc: false,
  }));

  for (const d of data) {
    const midPrice = (d.high + d.low) / 2;
    const idx = Math.min(Math.floor((midPrice - minPrice) / binSize), numBins - 1);
    if (idx >= 0) bins[idx].volume += d.volume;
  }

  const maxVol = Math.max(...bins.map(b => b.volume));
  const pocIdx = bins.findIndex(b => b.volume === maxVol);
  if (pocIdx >= 0) bins[pocIdx].poc = true;

  return bins;
}

// 未迁移：生产无同契约导出（见文件头第三节），保留内联。
function calcStochasticRSI(prices: number[], rsiPeriod = 14, stochPeriod = 14): number[] {
  if (prices.length < rsiPeriod + stochPeriod) return prices.map(() => 50);

  const rsiValues: number[] = [];
  for (let i = rsiPeriod; i < prices.length; i++) {
    let gain = 0, loss = 0;
    for (let j = i - rsiPeriod + 1; j <= i; j++) {
      const change = prices[j] - prices[j - 1];
      if (change > 0) gain += change;
      else loss -= change;
    }
    const avgGain = gain / rsiPeriod;
    const avgLoss = loss / rsiPeriod;
    rsiValues.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }

  const result: number[] = [];
  for (let i = 0; i < stochPeriod - 1 && i < rsiValues.length; i++) result.push(50);
  for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
    const slice = rsiValues.slice(i - stochPeriod + 1, i + 1);
    const min = Math.min(...slice);
    const max = Math.max(...slice);
    result.push(max - min > 0 ? Math.round((rsiValues[i] - min) / (max - min) * 100) : 50);
  }
  while (result.length < prices.length) result.unshift(50);
  return result;
}

// 未迁移：生产无同契约导出（见文件头第三节），保留内联。
function pivotPoints(high: number, low: number, close: number): {
  pivot: number;
  r1: number; r2: number; r3: number;
  s1: number; s2: number; s3: number;
} {
  const pivot = (high + low + close) / 3;
  return {
    pivot: Math.round(pivot * 100) / 100,
    r1: Math.round((2 * pivot - low) * 100) / 100,
    r2: Math.round((pivot + (high - low)) * 100) / 100,
    r3: Math.round((high + 2 * (pivot - low)) * 100) / 100,
    s1: Math.round((2 * pivot - high) * 100) / 100,
    s2: Math.round((pivot - (high - low)) * 100) / 100,
    s3: Math.round((low - 2 * (high - pivot)) * 100) / 100,
  };
}

// 未迁移：生产无同契约导出（见文件头第三节），保留内联。
function fibRetracement(high: number, low: number): { level: number; price: number }[] {
  const diff = high - low;
  const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  return levels.map(level => ({
    level,
    price: Math.round((high - diff * level) * 100) / 100,
  }));
}

describe('Advanced Chart Utilities', () => {
  describe('EMA', () => {
    it('should calculate EMA correctly', () => {
      const result = calculateEMA([1, 2, 3, 4, 5], 3);
      expect(result).toHaveLength(5);
      expect(result[0]).toBe(1);
      // k=2/(3+1)=0.5，首值作种子，逐点递推；生产不做四舍五入。
      expect(result).toEqual([1, 1.5, 2.25, 3.125, 4.0625]);
      expect(result[result.length - 1]).toBeGreaterThan(result[0]);
    });

    it('should handle single value', () => {
      expect(calculateEMA([10], 3)).toEqual([10]);
    });

    it('should handle empty array', () => {
      expect(calculateEMA([], 3)).toHaveLength(0);
      expect(calculateEMA([], 3)).toEqual([]);
    });
  });

  describe('SMA', () => {
    it('should calculate SMA', () => {
      const result = calculateSMA([1, 2, 3, 4, 5], 3);
      expect(result).toHaveLength(5);
      expect(result[2]).toBe(2); // (1+2+3)/3
      expect(result[4]).toBe(4); // (3+4+5)/3
      // chartDataProcessing.ts:73：i<period-1 为 null，不做前缀均值填充。
      expect(result).toEqual([null, null, 2, 3, 4]);
    });

    it('should handle insufficient data', () => {
      const result = calculateSMA([1, 2], 5);
      expect(result).toHaveLength(2);
      // 自抄版本返回 [2,2]（末值填充），生产返回全 null。
      expect(result).toEqual([null, null]);
    });
  });

  describe('MACD', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);

    it('should calculate MACD', () => {
      const result = calculateMACD(prices);
      expect(result.macd).toHaveLength(prices.length);
      expect(result.signal).toHaveLength(prices.length);
      expect(result.histogram).toHaveLength(prices.length);
      // 首点两个 EMA 都等于 prices[0]，故 macd/signal/histogram 均为 0。
      expect(result.macd[0]).toBe(0);
      expect(result.signal[0]).toBe(0);
      expect(result.histogram[0]).toBe(0);
      for (const r of result.macd) {
        expect(typeof r).toBe('number');
      }
      for (const r of result.signal) {
        expect(typeof r).toBe('number');
      }
      for (const r of result.histogram) {
        expect(typeof r).toBe('number');
      }
    });

    it('histogram = macd - signal', () => {
      const result = calculateMACD(prices);
      for (let i = 0; i < result.macd.length; i++) {
        // featureEngineeringEngine.ts:96：histogram 直接由同一次减法得到，无 2 倍口径。
        expect(result.histogram[i]).toBe(result.macd[i] - result.signal[i]);
      }
    });

    it('should return zeros for insufficient data', () => {
      // 生产无 length<slow 守卫；[1,2,3] 时两个 EMA 都从 prices[0] 起步，
      // 因此仅索引 0 为 0，索引 1/2 已有真实差值（自抄全零断言在此处错误）。
      const result = calculateMACD([1, 2, 3], 12, 26, 9);
      expect(result.macd).toHaveLength(3);
      expect(result.signal).toHaveLength(3);
      expect(result.histogram).toHaveLength(3);
      expect(result.macd[0]).toBe(0);
      expect(result.signal[0]).toBe(0);
      expect(result.histogram[0]).toBe(0);
      expect(result.macd[1]).toBeCloseTo(0.0798, 4);
      expect(result.macd[2]).toBeCloseTo(0.2211, 4);
      expect(result.histogram[2]).toBeCloseTo(0.1641, 4);
    });
  });

  describe('KDJ', () => {
    // 确定性夹具：正弦 OHLC，close 另加正弦偏移；全部为固定值，无随机数。
    const data: OHLCV[] = Array.from({ length: 20 }, (_, i) => {
      const base = 100 + Math.sin(i / 3) * 5;
      return {
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        open: base,
        high: base + 5,
        low: base - 5,
        close: base + Math.sin(i / 2) * 2,
        volume: 1e6,
      };
    });
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const closes = data.map(d => d.close);

    it('should calculate KDJ', () => {
      const result = calculateKDJ(highs, lows, closes, 9);
      expect(result.k).toHaveLength(data.length);
      expect(result.d).toHaveLength(data.length);
      expect(result.j).toHaveLength(data.length);
      // technical.ts:302-309：前 period-1 位为 null 预热。
      for (let i = 0; i < 8; i++) {
        expect(result.k[i]).toBeNull();
        expect(result.d[i]).toBeNull();
        expect(result.j[i]).toBeNull();
      }
      // technical.ts:323-325：首根 K/D 直接置 50，不由 50 平滑而来。
      expect(result.k[8]).toBe(50);
      expect(result.d[8]).toBe(50);
      expect(result.j[8]).toBe(50);
      expect(result.k[19]).toBeCloseTo(56.0419, 4);
      expect(result.d[19]).toBeCloseTo(46.1736, 4);
      expect(result.j[19]).toBeCloseTo(75.7783, 4);
    });

    it('should handle empty data', () => {
      const result = calculateKDJ([], [], [], 9);
      expect(result.k).toHaveLength(0);
      expect(result.d).toHaveLength(0);
      expect(result.j).toHaveLength(0);
    });

    it('K should typically be between 0 and 100', () => {
      const result = calculateKDJ(highs, lows, closes, 9);
      for (let i = 8; i < result.k.length; i++) {
        const k = result.k[i] as number;
        const d = result.d[i] as number;
        const j = result.j[i] as number;
        expect(k).toBeGreaterThanOrEqual(0);
        expect(k).toBeLessThanOrEqual(100);
        // j = 3k - 2d（technical.ts:346），k/d 各自四舍五入到 4 位，容差 3 位。
        expect(j).toBeCloseTo(3 * k - 2 * d, 3);
      }
    });
  });

  describe('Candle Pattern Detection', () => {
    it('should detect doji', () => {
      const data: OHLCV[] = [
        { date: '2024-01-01', open: 100, high: 105, low: 95, close: 100.5, volume: 1e6 },
        { date: '2024-01-02', open: 100, high: 105, low: 95, close: 100, volume: 1e6 },
        { date: '2024-01-03', open: 100, high: 110, low: 90, close: 100, volume: 1e6 },
      ];
      const patterns = detectPatterns(data);
      expect(patterns).toHaveLength(1);
      expect(patterns[0]).toMatchObject({
        name: '十字星',
        type: 'neutral',
        confidence: 0.6,
        startIndex: 2,
        endIndex: 2,
      });
      expect(typeof patterns[0].description).toBe('string');
    });

    it('should detect hammer or engulfing patterns', () => {
      const data: OHLCV[] = [
        { date: '1', open: 100, high: 102, low: 98, close: 99, volume: 1e6 },
        { date: '2', open: 100, high: 102, low: 98, close: 99, volume: 1e6 },
        { date: '3', open: 97, high: 97.05, low: 90, close: 97, volume: 1e6 },
      ];
      const patterns = detectPatterns(data);
      // body=0 → 生产锤子线要求 body/range>0.05，不成立；仅命中十字星。
      expect(patterns).toHaveLength(1);
      expect(patterns.map(p => p.name)).toEqual(['十字星']);
      expect(patterns.some(p => p.name === '锤子线')).toBe(false);
    });

    it('should detect hammer with production threshold', () => {
      const data: OHLCV[] = [
        { date: '1', open: 102, high: 103, low: 99, close: 100, volume: 1e6 },
        { date: '2', open: 101, high: 101.5, low: 99.5, close: 100, volume: 1e6 },
        { date: '3', open: 98, high: 100.8, low: 90, close: 100.5, volume: 1e6 },
      ];
      const patterns = detectPatterns(data);
      // body=2.5、lowerShadow=8、upperShadow=0.8、range=10.8 → 0.231>0.05 且 8>5、0.8<1.25；
      // 前一根阴线 → 锤子线/bullish/confidence 0.65（chartPatternEngine.ts:56-67）。
      expect(patterns).toHaveLength(1);
      expect(patterns[0]).toMatchObject({
        name: '锤子线',
        type: 'bullish',
        confidence: 0.65,
        startIndex: 2,
        endIndex: 2,
      });
    });

    it('should return empty for insufficient data', () => {
      expect(detectPatterns([{ date: '1', open: 1, high: 2, low: 0, close: 1, volume: 1 }])).toHaveLength(0);
    });

    it('should return empty for empty data', () => {
      expect(detectPatterns([])).toHaveLength(0);
    });

    it('should detect engulfing pattern', () => {
      const data: OHLCV[] = [
        { date: '1', open: 100, high: 105, low: 95, close: 100, volume: 1e6 },
        { date: '2', open: 102, high: 103, low: 97, close: 98, volume: 1e6 },
        { date: '3', open: 96, high: 106, low: 95, close: 104, volume: 1e6 },
      ];
      const patterns = detectPatterns(data);
      expect(patterns).toHaveLength(1);
      // 吞没形态 startIndex 指向前一根（chartPatternEngine.ts:83-91）。
      expect(patterns[0]).toMatchObject({
        name: '看涨吞没',
        type: 'bullish',
        confidence: 0.7,
        startIndex: 1,
        endIndex: 2,
      });
    });
  });

  describe('Volume Profile', () => {
    const data: OHLCV[] = Array.from({ length: 30 }, (_, i) => ({
      date: `d${i}`,
      open: 100 + i,
      high: 105 + i,
      low: 95 + i,
      close: 100 + i,
      volume: 1e6 + i * 1e5,
    }));

    it('should calculate volume profile', () => {
      const profile = calcVolumeProfile(data, 10);
      expect(profile).toHaveLength(10);
      const totalVol = profile.reduce((s, b) => s + b.volume, 0);
      expect(totalVol).toBeGreaterThan(0);
    });

    it('should identify POC', () => {
      const profile = calcVolumeProfile(data, 10);
      const pocBuckets = profile.filter(b => b.poc);
      expect(pocBuckets).toHaveLength(1);
    });

    it('should handle empty data', () => {
      expect(calcVolumeProfile([], 10)).toHaveLength(0);
    });
  });

  describe('Stochastic RSI', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);

    it('should calculate StochRSI', () => {
      const result = calcStochasticRSI(prices);
      expect(result).toHaveLength(prices.length);
      for (const v of result) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    });

    it('should handle insufficient data', () => {
      const result = calcStochasticRSI([1, 2, 3]);
      expect(result).toHaveLength(3);
      expect(result).toEqual([50, 50, 50]);
    });
  });

  describe('Pivot Points', () => {
    it('should calculate correct pivot points', () => {
      const pp = pivotPoints(110, 90, 100);
      expect(pp.pivot).toBe(100);
      expect(pp.r1).toBe(110); // 2*100 - 90
      expect(pp.s1).toBe(90); // 2*100 - 110
      expect(pp.r1).toBeGreaterThan(pp.pivot);
      expect(pp.s1).toBeLessThan(pp.pivot);
    });

    it('should have ordered support/resistance', () => {
      const pp = pivotPoints(110, 90, 100);
      expect(pp.r3).toBeGreaterThan(pp.r2);
      expect(pp.r2).toBeGreaterThan(pp.r1);
      expect(pp.r1).toBeGreaterThan(pp.pivot);
      expect(pp.pivot).toBeGreaterThan(pp.s1);
      expect(pp.s1).toBeGreaterThan(pp.s2);
      expect(pp.s2).toBeGreaterThan(pp.s3);
    });
  });

  describe('Fibonacci Retracement', () => {
    it('should calculate fib levels', () => {
      const levels = fibRetracement(100, 80);
      expect(levels).toHaveLength(7);
      expect(levels[0].level).toBe(0);
      expect(levels[0].price).toBe(100);
      expect(levels[6].level).toBe(1);
      expect(levels[6].price).toBe(80);
    });

    it('should have descending prices', () => {
      const levels = fibRetracement(100, 80);
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i].price).toBeLessThanOrEqual(levels[i - 1].price);
      }
    });

    it('should calculate 50% level', () => {
      const levels = fibRetracement(100, 80);
      const half = levels.find(l => l.level === 0.5);
      expect(half!.price).toBe(90);
    });

    it('should handle same high/low', () => {
      const levels = fibRetracement(100, 100);
      expect(levels.every(l => l.price === 100)).toBe(true);
    });
  });
});
