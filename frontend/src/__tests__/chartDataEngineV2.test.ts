import { describe, it, expect } from 'vitest';

// 图表数据处理引擎
interface Candlestick { date: string; open: number; high: number; low: number; close: number; volume: number }

// K线形态检测
function detectCandlePatterns(candles: Candlestick[]): { pattern: string; index: number; confidence: number }[] {
  const patterns: { pattern: string; index: number; confidence: number }[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1], curr = candles[i];
    const body = Math.abs(curr.close - curr.open);
    const range = curr.high - curr.low;
    const prevBody = Math.abs(prev.close - prev.open);

    // 十字星
    if (range > 0 && body / range < 0.1) {
      patterns.push({ pattern: 'doji', index: i, confidence: 0.7 });
    }
    // 锤子线
    const lowerShadow = Math.min(curr.open, curr.close) - curr.low;
    const upperShadow = curr.high - Math.max(curr.open, curr.close);
    if (lowerShadow > body * 2 && upperShadow < body * 0.5 && range > 0) {
      patterns.push({ pattern: 'hammer', index: i, confidence: 0.65 });
    }
    // 吞没形态
    if (prevBody > 0 && body > prevBody) {
      if (prev.close < prev.open && curr.close > curr.open && curr.close > prev.open && curr.open < prev.close) {
        patterns.push({ pattern: 'bullish_engulfing', index: i, confidence: 0.75 });
      }
      if (prev.close > prev.open && curr.close < curr.open && curr.open > prev.close && curr.close < prev.open) {
        patterns.push({ pattern: 'bearish_engulfing', index: i, confidence: 0.75 });
      }
    }
  }
  return patterns;
}

// 布林带计算
function calcBOLL(closes: number[], period: number = 20, multiplier: number = 2): { upper: number[]; middle: number[]; lower: number[] } {
  const upper: number[] = [], middle: number[] = [], lower: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { upper.push(NaN); middle.push(NaN); lower.push(NaN); continue; }
    const slice = closes.slice(i - period + 1, i + 1);
    const ma = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((s, v) => s + (v - ma) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    middle.push(+ma.toFixed(4));
    upper.push(+(ma + multiplier * std).toFixed(4));
    lower.push(+(ma - multiplier * std).toFixed(4));
  }
  return { upper, middle, lower };
}

// ATR计算
function calcATR(highs: number[], lows: number[], closes: number[], period: number = 14): number[] {
  const atr: number[] = [highs[0] - lows[0]];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    if (i < period) {
      atr.push(+(atr.reduce((a, b) => a + b, 0) + tr) / (i + 1));
    } else {
      atr.push(+((atr[i - 1] * (period - 1) + tr) / period).toFixed(4));
    }
  }
  return atr;
}

// OBV计算
function calcOBV(closes: number[], volumes: number[]): number[] {
  const obv: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv.push(obv[i - 1] + volumes[i]);
    else if (closes[i] < closes[i - 1]) obv.push(obv[i - 1] - volumes[i]);
    else obv.push(obv[i - 1]);
  }
  return obv;
}

// 支撑阻力位检测
function findSupportResistance(prices: number[], window: number = 3): { supports: number[]; resistances: number[] } {
  const supports: number[] = [], resistances: number[] = [];
  for (let i = window; i < prices.length - window; i++) {
    const left = prices.slice(i - window, i);
    const right = prices.slice(i + 1, i + window + 1);
    if (prices[i] <= Math.min(...left) && prices[i] <= Math.min(...right)) {
      supports.push(prices[i]);
    }
    if (prices[i] >= Math.max(...left) && prices[i] >= Math.max(...right)) {
      resistances.push(prices[i]);
    }
  }
  return { supports, resistances };
}

// 通道宽度
function calcChannelWidth(upper: number[], lower: number[]): number[] {
  return upper.map((u, i) => {
    if (isNaN(u) || isNaN(lower[i])) return NaN;
    const mid = (u + lower[i]) / 2;
    return mid > 0 ? +((u - lower[i]) / mid * 100).toFixed(4) : 0;
  });
}

describe('图表数据处理引擎', () => {
  const makeCandles = (data: number[][]): Candlestick[] =>
    data.map((d, i) => ({ date: `d${i}`, open: d[0], high: d[1], low: d[2], close: d[3], volume: d[4] || 1000 }));

  describe('K线形态检测', () => {
    it('检测十字星', () => {
      const candles = makeCandles([[10, 10.5, 9.5, 10.01], [10, 11, 9, 10]]);
      const p = detectCandlePatterns(candles);
      expect(p.some(x => x.pattern === 'doji')).toBe(true);
    });

    it('检测锤子线', () => {
      // upperShadow < body*0.5: need very small upper shadow
      const candles = makeCandles([[10, 10.2, 9.8, 10.1], [10, 10.003, 8, 10.01]]);
      const p = detectCandlePatterns(candles);
      expect(p.some(x => x.pattern === 'hammer')).toBe(true);
    });

    it('检测看涨吞没', () => {
      const candles = makeCandles([[10, 10, 9, 9], [8.5, 10.5, 8.5, 10.5]]);
      const p = detectCandlePatterns(candles);
      expect(p.some(x => x.pattern === 'bullish_engulfing')).toBe(true);
    });

    it('检测看跌吞没', () => {
      const candles = makeCandles([[9, 10.5, 9, 10], [10.5, 10.5, 8.5, 8.5]]);
      const p = detectCandlePatterns(candles);
      expect(p.some(x => x.pattern === 'bearish_engulfing')).toBe(true);
    });

    it('空数据返回空', () => {
      expect(detectCandlePatterns([])).toHaveLength(0);
    });

    it('单一K线返回空', () => {
      expect(detectCandlePatterns(makeCandles([[10, 11, 9, 10]]))).toHaveLength(0);
    });

    it('置信度在合理范围', () => {
      const candles = makeCandles([[10, 10, 9, 9], [8.5, 10.5, 8.5, 10.5]]);
      detectCandlePatterns(candles).forEach(p => {
        expect(p.confidence).toBeGreaterThan(0);
        expect(p.confidence).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('布林带', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + Math.sin(i / 3) * 5);

    it('上轨>=中轨>=下轨', () => {
      const { upper, middle, lower } = calcBOLL(closes, 20);
      for (let i = 20; i < closes.length; i++) {
        expect(upper[i]).toBeGreaterThanOrEqual(middle[i]);
        expect(middle[i]).toBeGreaterThanOrEqual(lower[i]);
      }
    });

    it('前期数据为NaN', () => {
      const { upper } = calcBOLL(closes, 20);
      expect(isNaN(upper[0])).toBe(true);
    });

    it('通道宽度>0', () => {
      const { upper, lower } = calcBOLL(closes, 20);
      const w = calcChannelWidth(upper, lower);
      for (let i = 20; i < closes.length; i++) {
        expect(w[i]).toBeGreaterThan(0);
      }
    });

    it('平坦数据通道窄', () => {
      const flat = Array(25).fill(100);
      const { upper, lower } = calcBOLL(flat, 20);
      expect(upper[24] - lower[24]).toBeCloseTo(0, 2);
    });

    it('空数据返回空', () => {
      const { upper } = calcBOLL([], 20);
      expect(upper).toHaveLength(0);
    });
  });

  describe('ATR', () => {
    const highs = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
    const lows = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
    const closes = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

    it('ATR为正', () => {
      const atr = calcATR(highs, lows, closes, 14);
      atr.filter(a => !isNaN(a)).forEach(a => expect(a).toBeGreaterThan(0));
    });

    it('长度正确', () => {
      expect(calcATR(highs, lows, closes)).toHaveLength(highs.length);
    });

    it('波动大ATR大', () => {
      const h1 = Array(20).fill(0).map((_, i) => 10 + i * 0.1);
      const l1 = Array(20).fill(0).map((_, i) => 9.9 + i * 0.1);
      const h2 = Array(20).fill(0).map((_, i) => 10 + i * 2);
      const l2 = Array(20).fill(0).map((_, i) => 5 + i * 2);
      const c = Array(20).fill(0).map((_, i) => 9.95 + i * 0.1);
      const atr1 = calcATR(h1, l1, c);
      const c2 = Array(20).fill(0).map((_, i) => 7.5 + i * 2);
      const atr2 = calcATR(h2, l2, c2);
      expect(atr2[19]).toBeGreaterThan(atr1[19]);
    });
  });

  describe('OBV', () => {
    it('上涨加成交量', () => {
      const obv = calcOBV([10, 11], [100, 200]);
      expect(obv[1]).toBe(200);
    });

    it('下跌减成交量', () => {
      const obv = calcOBV([10, 9], [100, 200]);
      expect(obv[1]).toBe(-200);
    });

    it('不变不改变', () => {
      const obv = calcOBV([10, 10], [100, 200]);
      expect(obv[1]).toBe(0);
    });

    it('初始值为0', () => {
      expect(calcOBV([10], [100])[0]).toBe(0);
    });

    it('持续上涨OBV递增', () => {
      const obv = calcOBV([10, 11, 12, 13], [100, 100, 100, 100]);
      for (let i = 1; i < obv.length; i++) {
        expect(obv[i]).toBeGreaterThan(obv[i - 1]);
      }
    });
  });

  describe('支撑阻力', () => {
    it('检测局部低点支撑', () => {
      const prices = [10, 9, 8, 7, 8, 9, 10, 11, 12, 11, 10, 9, 8, 9, 10];
      const { supports } = findSupportResistance(prices, 2);
      expect(supports.length).toBeGreaterThan(0);
      expect(supports).toContain(7);
    });

    it('检测局部高点阻力', () => {
      const prices = [7, 8, 9, 10, 11, 10, 9, 8, 7, 8, 9, 10, 11, 12, 11];
      const { resistances } = findSupportResistance(prices, 2);
      expect(resistances.length).toBeGreaterThan(0);
    });

    it('平坦数据全部检测为支撑阻力', () => {
      const prices = Array(10).fill(10);
      const { supports, resistances } = findSupportResistance(prices, 2);
      // flat data: every interior point is both min and max locally
      expect(supports.length + resistances.length).toBeGreaterThan(0);
    });

    it('数据不足返回空', () => {
      const { supports, resistances } = findSupportResistance([1, 2, 3], 3);
      expect(supports).toHaveLength(0);
      expect(resistances).toHaveLength(0);
    });
  });
});
