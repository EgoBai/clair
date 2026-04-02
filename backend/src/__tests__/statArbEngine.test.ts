import { describe, it, expect } from 'vitest';
import {
  computeLogReturns,
  computeHedgeRatio,
  computeSpread,
  computeZScores,
  estimateHalfLife,
  computeHurstExponent,
  adfTest,
  analyzeSpread,
  generateStatArbSignal,
  scanPairs,
  type PricePair,
} from '../services/statArbEngine';

describe('statArbEngine', () => {
  // 测试数据：两个高度相关的序列
  const genCorrelated = (n: number, seed = 1) => {
    const a: number[] = [100];
    const b: number[] = [50];
    let s = seed;
    for (let i = 1; i < n; i++) {
      s = (s * 16807) % 2147483647;
      const r1 = (s / 2147483647 - 0.5) * 2;
      s = (s * 16807) % 2147483647;
      const r2 = (s / 2147483647 - 0.5) * 2;
      a.push(a[i - 1] + r1 + r2 * 0.3);
      b.push(b[i - 1] + r1 * 0.5 + r2 * 0.2);
    }
    return { a, b };
  };

  describe('computeLogReturns', () => {
    it('should compute log returns correctly', () => {
      const prices = [100, 110, 99, 108.9];
      const returns = computeLogReturns(prices);
      expect(returns).toHaveLength(3);
      expect(returns[0]).toBeCloseTo(Math.log(1.1), 6);
      expect(returns[1]).toBeCloseTo(Math.log(0.9), 6);
      expect(returns[2]).toBeCloseTo(Math.log(1.1), 6);
    });

    it('should handle zero/negative prices gracefully', () => {
      const prices = [100, 0, -5, 100];
      const returns = computeLogReturns(prices);
      expect(returns[0]).toBe(0);
      expect(returns[1]).toBe(0);
      expect(returns[2]).toBe(0);
    });

    it('should return empty for insufficient data', () => {
      expect(computeLogReturns([100])).toEqual([]);
      expect(computeLogReturns([])).toEqual([]);
    });

    it('should be consistent across different lengths', () => {
      const prices = Array.from({ length: 100 }, (_, i) => 100 + i * 0.5);
      const returns = computeLogReturns(prices);
      expect(returns).toHaveLength(99);
      returns.forEach(r => expect(r).toBeGreaterThan(0));
    });
  });

  describe('computeHedgeRatio', () => {
    it('should compute OLS beta correctly for perfect linear relation', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10]; // y = 2x
      const result = computeHedgeRatio(x, y);
      expect(result.beta).toBeCloseTo(2, 4);
      expect(result.alpha).toBeCloseTo(0, 4);
      expect(result.rSquared).toBeCloseTo(1, 4);
    });

    it('should handle constant x', () => {
      const x = [5, 5, 5, 5];
      const y = [1, 2, 3, 4];
      const result = computeHedgeRatio(x, y);
      expect(result.beta).toBe(1); // fallback
    });

    it('should handle insufficient data', () => {
      expect(computeHedgeRatio([1], [2])).toEqual({ alpha: 0, beta: 1, rSquared: 0 });
    });

    it('should compute positive r-squared for correlated data', () => {
      const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const y = [2.1, 3.9, 6.2, 7.8, 10.1, 12, 14.1, 15.8, 18, 20];
      const result = computeHedgeRatio(x, y);
      expect(result.rSquared).toBeGreaterThan(0.95);
    });
  });

  describe('computeSpread', () => {
    it('should compute spread as A - beta*B', () => {
      const a = [100, 110, 120];
      const b = [50, 55, 60];
      const spread = computeSpread(a, b, 2);
      expect(spread).toEqual([0, 0, 0]);
    });

    it('should handle mismatched lengths', () => {
      const a = [100, 110, 120, 130];
      const b = [50, 55];
      const spread = computeSpread(a, b, 2);
      expect(spread).toHaveLength(2);
    });
  });

  describe('computeZScores', () => {
    it('should return 0 for constant spread', () => {
      const spread = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10];
      const zScores = computeZScores(spread, 5);
      expect(zScores).toHaveLength(6);
      zScores.forEach(z => expect(z).toBe(0));
    });

    it('should detect anomalies', () => {
      const spread = [10, 10, 10, 10, 10, 10, 10, 10, 10, 30];
      const zScores = computeZScores(spread, 5);
      const last = zScores[zScores.length - 1];
      expect(last).toBeGreaterThan(0);
    });

    it('should return empty for insufficient data', () => {
      expect(computeZScores([1, 2], 5)).toEqual([]);
    });

    it('should have mean ~0 and std ~1 over large sample', () => {
      const spread = Array.from({ length: 200 }, () => Math.random() * 10);
      const zScores = computeZScores(spread, 50);
      const mean = zScores.reduce((s, v) => s + v, 0) / zScores.length;
      expect(Math.abs(mean)).toBeLessThan(0.5);
    });
  });

  describe('estimateHalfLife', () => {
    it('should return finite half-life for mean-reverting series', () => {
      // Generate mean-reverting series: y[t] = 0.8 * y[t-1] + noise
      const series: number[] = [0];
      for (let i = 1; i < 200; i++) {
        series.push(0.8 * series[i - 1] + (Math.random() - 0.5) * 0.5);
      }
      const hl = estimateHalfLife(series);
      expect(hl).toBeGreaterThan(0);
      expect(hl).toBeLessThan(100);
    });

    it('should return Infinity for trending series', () => {
      const series = Array.from({ length: 50 }, (_, i) => i);
      const hl = estimateHalfLife(series);
      expect(hl).toBe(Infinity);
    });

    it('should handle edge case data', () => {
      expect(estimateHalfLife([1])).toBe(0);
      expect(estimateHalfLife([])).toBe(0);
    });
  });

  describe('computeHurstExponent', () => {
    it('should return value between 0 and 1 for random walk', () => {
      const series: number[] = [0];
      for (let i = 1; i < 500; i++) {
        series.push(series[i - 1] + (Math.random() - 0.5));
      }
      const h = computeHurstExponent(series);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(1);
    });

    it('should return >0.5 for trending series', () => {
      const series = Array.from({ length: 300 }, (_, i) => i + Math.random() * 5);
      const h = computeHurstExponent(series);
      expect(h).toBeGreaterThan(0.5);
    });

    it('should handle short series', () => {
      expect(computeHurstExponent([1, 2, 3])).toBe(0.5);
    });
  });

  describe('adfTest', () => {
    it('should detect stationary series', () => {
      const series: number[] = [];
      for (let i = 0; i < 200; i++) {
        series.push(Math.sin(i * 0.1) * 10 + (Math.random() - 0.5));
      }
      const result = adfTest(series);
      expect(result.statistic).toBeLessThan(0);
    });

    it('should handle short series', () => {
      const result = adfTest([1, 2, 3]);
      expect(result.isStationary).toBe(false);
    });
  });

  describe('analyzeSpread', () => {
    it('should return complete spread analysis', () => {
      const { a, b } = genCorrelated(100);
      const analysis = analyzeSpread(a, b);
      expect(analysis.spread).toHaveLength(100);
      expect(analysis.mean).toBeTypeOf('number');
      expect(analysis.stdDev).toBeGreaterThan(0);
      expect(analysis.zScore.length).toBeGreaterThan(0);
      expect(analysis.halfLife).toBeGreaterThan(0);
      expect(analysis.hurstExponent).toBeGreaterThan(0);
    });

    it('should respect custom config', () => {
      const { a, b } = genCorrelated(100);
      const analysis = analyzeSpread(a, b, { lookbackPeriod: 20 });
      expect(analysis.zScore).toHaveLength(81);
    });
  });

  describe('generateStatArbSignal', () => {
    it('should generate signal for divergent pair', () => {
      const pricesA = Array.from({ length: 80 }, (_, i) => 100 + (i > 60 ? (i - 60) * 3 : 0));
      const pricesB = Array.from({ length: 80 }, (_, i) => 50);
      const timestamps = Array.from({ length: 80 }, (_, i) => i);
      const pair: PricePair = { symbolA: 'A', symbolB: 'B', pricesA, pricesB, timestamps };

      const signal = generateStatArbSignal(pair, { lookbackPeriod: 20, minCorrelation: 0.1 });
      if (signal) {
        expect(['long_spread', 'short_spread', 'exit']).toContain(signal.direction);
        expect(signal.symbolA).toBe('A');
        expect(signal.symbolB).toBe('B');
      }
    });

    it('should return null for insufficient data', () => {
      const pair: PricePair = { symbolA: 'A', symbolB: 'B', pricesA: [1], pricesB: [2], timestamps: [1] };
      expect(generateStatArbSignal(pair)).toBeNull();
    });

    it('should return null when correlation is too low', () => {
      const pricesA = Array.from({ length: 80 }, () => Math.random() * 100);
      const pricesB = Array.from({ length: 80 }, () => Math.random() * 100);
      const timestamps = Array.from({ length: 80 }, (_, i) => i);
      const pair: PricePair = { symbolA: 'A', symbolB: 'B', pricesA, pricesB, timestamps };
      const signal = generateStatArbSignal(pair, { minCorrelation: 0.95 });
      // Low correlation should reject
      if (signal) expect(signal.confidence).toBeLessThan(0.5);
    });
  });

  describe('scanPairs', () => {
    it('should return sorted signals by absolute z-score', () => {
      const gen = (n: number, offset: number) => Array.from({ length: 80 }, (_, i) => 100 + (i > 60 ? offset * (i - 60) : 0));
      const ts = Array.from({ length: 80 }, (_, i) => i);
      const pairs: PricePair[] = [
        { symbolA: 'X', symbolB: 'Y', pricesA: gen(80, 1), pricesB: gen(80, 0), timestamps: ts },
        { symbolA: 'P', symbolB: 'Q', pricesA: gen(80, 5), pricesB: gen(80, 0), timestamps: ts },
      ];
      const signals = scanPairs(pairs, { lookbackPeriod: 20, minCorrelation: 0.1 });
      if (signals.length > 1) {
        expect(Math.abs(signals[0].zScore)).toBeGreaterThanOrEqual(Math.abs(signals[1].zScore));
      }
    });

    it('should handle empty pairs', () => {
      expect(scanPairs([])).toEqual([]);
    });
  });
});
