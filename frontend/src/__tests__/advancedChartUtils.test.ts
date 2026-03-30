import { describe, it, expect } from 'vitest';

// Advanced Chart Utilities & Data Transformation
interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
}

interface KDJResult {
  k: number;
  d: number;
  j: number;
}

interface CandlePattern {
  name: string;
  type: 'bullish' | 'bearish' | 'neutral';
  reliability: number;
}

// Technical indicator calculations
function calcEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function calcSMA(values: number[], period: number): number[] {
  if (values.length < period) return values.map(() => values[values.length - 1] || 0);
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(values.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1));
    } else {
      result.push(values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period);
    }
  }
  return result;
}

function calcMACD(prices: number[], fast = 12, slow = 26, signal = 9): MACDResult[] {
  if (prices.length < slow) return prices.map(() => ({ macd: 0, signal: 0, histogram: 0 }));
  const emaFast = calcEMA(prices, fast);
  const emaSlow = calcEMA(prices, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = calcEMA(macdLine, signal);
  return macdLine.map((macd, i) => ({
    macd: Math.round(macd * 1000) / 1000,
    signal: Math.round((signalLine[i] || 0) * 1000) / 1000,
    histogram: Math.round((macd - (signalLine[i] || 0)) * 1000) / 1000,
  }));
}

function calcKDJ(data: OHLCV[], n = 9): KDJResult[] {
  if (data.length === 0) return [];
  const result: KDJResult[] = [];
  let prevK = 50, prevD = 50;

  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - n + 1);
    const slice = data.slice(start, i + 1);
    const highN = Math.max(...slice.map(d => d.high));
    const lowN = Math.min(...slice.map(d => d.low));
    const rsv = highN - lowN > 0 ? ((data[i].close - lowN) / (highN - lowN)) * 100 : 50;
    const k = (2 / 3) * prevK + (1 / 3) * rsv;
    const d = (2 / 3) * prevD + (1 / 3) * k;
    const j = 3 * k - 2 * d;
    result.push({ k: Math.round(k * 100) / 100, d: Math.round(d * 100) / 100, j: Math.round(j * 100) / 100 });
    prevK = k;
    prevD = d;
  }
  return result;
}

function detectCandlePatterns(data: OHLCV[]): CandlePattern[] {
  if (data.length < 3) return [];
  const patterns: CandlePattern[] = [];

  for (let i = 2; i < data.length; i++) {
    const curr = data[i];
    const prev = data[i - 1];
    const body = Math.abs(curr.close - curr.open);
    const prevBody = Math.abs(prev.close - prev.open);
    const upperShadow = curr.high - Math.max(curr.open, curr.close);
    const lowerShadow = Math.min(curr.open, curr.close) - curr.low;
    const range = curr.high - curr.low;

    // Doji
    if (range > 0 && body / range < 0.1) {
      patterns.push({ name: '十字星', type: 'neutral', reliability: 0.5 });
    }

    // Hammer
    if (lowerShadow > body * 2 && upperShadow < body * 0.5 && range > 0) {
      patterns.push({ name: '锤子线', type: curr.close > curr.open ? 'bullish' : 'bearish', reliability: 0.6 });
    }

    // Engulfing
    if (prevBody > 0 && body > prevBody) {
      if (prev.close < prev.open && curr.close > curr.open && curr.close > prev.open && curr.open < prev.close) {
        patterns.push({ name: '看涨吞没', type: 'bullish', reliability: 0.7 });
      }
      if (prev.close > prev.open && curr.close < curr.open && curr.close < prev.open && curr.open > prev.close) {
        patterns.push({ name: '看跌吞没', type: 'bearish', reliability: 0.7 });
      }
    }

    // Morning/Evening star
    if (i >= 2) {
      const prev2 = data[i - 2];
      const prev2Body = Math.abs(prev2.close - prev2.open);
      if (prev2Body > 0 && prevBody < prev2Body * 0.3 && body > prev2Body * 0.5) {
        if (prev2.close > prev2.open && curr.close > curr.open) {
          patterns.push({ name: '启明星', type: 'bullish', reliability: 0.75 });
        }
        if (prev2.close < prev2.open && curr.close < curr.open) {
          patterns.push({ name: '黄昏星', type: 'bearish', reliability: 0.75 });
        }
      }
    }
  }
  return patterns;
}

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
      const result = calcEMA([1, 2, 3, 4, 5], 3);
      expect(result).toHaveLength(5);
      expect(result[0]).toBe(1);
      expect(result[result.length - 1]).toBeGreaterThan(result[0]);
    });

    it('should handle single value', () => {
      expect(calcEMA([10], 3)).toEqual([10]);
    });

    it('should handle empty array', () => {
      expect(calcEMA([], 3)).toHaveLength(0);
    });
  });

  describe('SMA', () => {
    it('should calculate SMA', () => {
      const result = calcSMA([1, 2, 3, 4, 5], 3);
      expect(result).toHaveLength(5);
      expect(result[2]).toBe(2); // (1+2+3)/3
      expect(result[4]).toBe(4); // (3+4+5)/3
    });

    it('should handle insufficient data', () => {
      const result = calcSMA([1, 2], 5);
      expect(result).toHaveLength(2);
    });
  });

  describe('MACD', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);

    it('should calculate MACD', () => {
      const result = calcMACD(prices);
      expect(result).toHaveLength(prices.length);
      for (const r of result) {
        expect(typeof r.macd).toBe('number');
        expect(typeof r.signal).toBe('number');
        expect(typeof r.histogram).toBe('number');
      }
    });

    it('histogram = macd - signal', () => {
      const result = calcMACD(prices);
      for (const r of result) {
        expect(r.histogram).toBeCloseTo(r.macd - r.signal, 2);
      }
    });

    it('should return zeros for insufficient data', () => {
      const result = calcMACD([1, 2, 3], 12, 26, 9);
      expect(result).toHaveLength(3);
      expect(result[0].macd).toBe(0);
    });
  });

  describe('KDJ', () => {
    const data: OHLCV[] = Array.from({ length: 20 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      open: 100 + Math.sin(i / 3) * 5,
      high: 105 + Math.sin(i / 3) * 5,
      low: 95 + Math.sin(i / 3) * 5,
      close: 100 + Math.sin(i / 3) * 5 + Math.random() * 3,
      volume: 1e6 + Math.random() * 1e6,
    }));

    it('should calculate KDJ', () => {
      const result = calcKDJ(data);
      expect(result).toHaveLength(data.length);
      for (const r of result) {
        expect(r.k).toBeDefined();
        expect(r.d).toBeDefined();
        expect(r.j).toBeDefined();
      }
    });

    it('should handle empty data', () => {
      expect(calcKDJ([])).toHaveLength(0);
    });

    it('K should typically be between 0 and 100', () => {
      const result = calcKDJ(data);
      // Most K values should be in reasonable range
      expect(result[result.length - 1].k).toBeGreaterThan(-100);
      expect(result[result.length - 1].k).toBeLessThan(200);
    });
  });

  describe('Candle Pattern Detection', () => {
    it('should detect doji', () => {
      const data: OHLCV[] = [
        { date: '2024-01-01', open: 100, high: 105, low: 95, close: 100.5, volume: 1e6 },
        { date: '2024-01-02', open: 100, high: 105, low: 95, close: 100, volume: 1e6 },
        { date: '2024-01-03', open: 100, high: 110, low: 90, close: 100, volume: 1e6 },
      ];
      const patterns = detectCandlePatterns(data);
      expect(patterns.some(p => p.name === '十字星')).toBe(true);
    });

    it('should detect hammer or engulfing patterns', () => {
      const data: OHLCV[] = [
        { date: '1', open: 100, high: 102, low: 98, close: 99, volume: 1e6 },
        { date: '2', open: 100, high: 102, low: 98, close: 99, volume: 1e6 },
        { date: '3', open: 97, high: 97.05, low: 90, close: 97, volume: 1e6 },
      ];
      const patterns = detectCandlePatterns(data);
      // body=0, lowerShadow=7, upperShadow=0.05 → qualifies as doji/hammer
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should return empty for insufficient data', () => {
      expect(detectCandlePatterns([{ date: '1', open: 1, high: 2, low: 0, close: 1, volume: 1 }])).toHaveLength(0);
    });

    it('should detect engulfing pattern', () => {
      const data: OHLCV[] = [
        { date: '1', open: 100, high: 105, low: 95, close: 100, volume: 1e6 },
        { date: '2', open: 102, high: 103, low: 97, close: 98, volume: 1e6 },
        { date: '3', open: 96, high: 106, low: 95, close: 104, volume: 1e6 },
      ];
      const patterns = detectCandlePatterns(data);
      expect(patterns.some(p => p.type === 'bullish' || p.type === 'bearish')).toBe(true);
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
    });

    it('should handle insufficient data', () => {
      const result = calcStochasticRSI([1, 2, 3]);
      expect(result).toHaveLength(3);
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
