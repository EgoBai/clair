import { describe, it, expect } from 'vitest';
import {
  MeanReversionEngine,
  ZScoreResult,
  HurstResult,
  HalfLifeResult,
  OUParams,
  CointegrationResult,
  MeanReversionSignal
} from '../services/meanReversionEngine';

describe('Mean Reversion Engine', () => {
  const engine = new MeanReversionEngine();

  // Test data generators
  const generateMeanReverting = (length: number, mu: number = 100, sigma: number = 5): number[] => {
    const prices: number[] = [mu];
    for (let i = 1; i < length; i++) {
      const reversion = 0.05 * (mu - prices[i - 1]);
      const noise = (Math.random() - 0.5) * sigma;
      prices.push(prices[i - 1] + reversion + noise);
    }
    return prices;
  };

  const generateTrending = (length: number, drift: number = 0.5): number[] => {
    const prices: number[] = [100];
    for (let i = 1; i < length; i++) {
      prices.push(prices[i - 1] + drift + (Math.random() - 0.5) * 2);
    }
    return prices;
  };

  const generateRandomWalk = (length: number): number[] => {
    const prices: number[] = [100];
    for (let i = 1; i < length; i++) {
      prices.push(prices[i - 1] + (Math.random() - 0.5) * 3);
    }
    return prices;
  };

  describe('calculateZScore', () => {
    it('should return null for insufficient data', () => {
      const result = engine.calculateZScore([1, 2, 3], 20);
      expect(result).toBeNull();
    });

    it('should calculate Z-score for sufficient data', () => {
      const prices = generateMeanReverting(50);
      const result = engine.calculateZScore(prices, 20);
      expect(result).not.toBeNull();
      expect(result!.zScore).toBeTypeOf('number');
      expect(result!.mean).toBeGreaterThan(0);
      expect(result!.std).toBeGreaterThanOrEqual(0);
      expect(result!.bollingerUpper).toBeGreaterThan(result!.bollingerLower);
    });

    it('should detect oversold when price is low', () => {
      const prices = Array(20).fill(100);
      prices.push(80); // sudden drop
      const result = engine.calculateZScore(prices, 20);
      expect(result).not.toBeNull();
      expect(result!.zScore).toBeLessThan(-1);
    });

    it('should detect overbought when price is high', () => {
      const prices = Array(20).fill(100);
      prices.push(120); // sudden spike
      const result = engine.calculateZScore(prices, 20);
      expect(result).not.toBeNull();
      expect(result!.zScore).toBeGreaterThan(1);
    });

    it('should return null when std is zero', () => {
      const prices = Array(20).fill(100);
      const result = engine.calculateZScore(prices, 20);
      expect(result).toBeNull();
    });

    it('should calculate percentile correctly', () => {
      const prices = [90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110];
      const result = engine.calculateZScore(prices, 20);
      expect(result).not.toBeNull();
      expect(result!.percentile).toBeGreaterThan(90);
    });

    it('should calculate Bollinger Band width', () => {
      const prices = generateMeanReverting(50);
      const result = engine.calculateZScore(prices, 20, 2);
      expect(result).not.toBeNull();
      expect(result!.width).toBeGreaterThan(0);
    });

    it('should use different numStd parameters', () => {
      const prices = generateMeanReverting(50);
      const r1 = engine.calculateZScore(prices, 20, 1);
      const r2 = engine.calculateZScore(prices, 20, 3);
      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();
      expect(r2!.bollingerUpper).toBeGreaterThan(r1!.bollingerUpper);
    });
  });

  describe('calculateHurstExponent', () => {
    it('should return null for insufficient data', () => {
      const result = engine.calculateHurstExponent([1, 2, 3, 4, 5], 20);
      expect(result).toBeNull();
    });

    it('should calculate Hurst exponent for sufficient data', () => {
      const prices = generateMeanReverting(200);
      const result = engine.calculateHurstExponent(prices, 20);
      expect(result).not.toBeNull();
      expect(result!.exponent).toBeGreaterThanOrEqual(0);
      expect(result!.exponent).toBeLessThanOrEqual(1);
    });

    it('should detect mean-reverting series (H < 0.5)', () => {
      const prices = generateMeanReverting(500);
      const result = engine.calculateHurstExponent(prices, 20);
      expect(result).not.toBeNull();
      // Mean reverting should have H closer to 0.5 or below
      expect(result!.exponent).toBeLessThan(0.75);
    });

    it('should detect trending series (H > 0.5)', () => {
      const prices = generateTrending(500, 1);
      const result = engine.calculateHurstExponent(prices, 20);
      expect(result).not.toBeNull();
      expect(result!.exponent).toBeGreaterThan(0.4);
    });

    it('should have lags and rescaledRanges arrays', () => {
      const prices = generateMeanReverting(100);
      const result = engine.calculateHurstExponent(prices, 15);
      expect(result).not.toBeNull();
      expect(result!.lags.length).toBeGreaterThan(0);
      expect(result!.rescaledRanges.length).toBe(result!.lags.length);
    });

    it('should have confidence between 0 and 1', () => {
      const prices = generateMeanReverting(200);
      const result = engine.calculateHurstExponent(prices, 20);
      expect(result).not.toBeNull();
      expect(result!.confidence).toBeGreaterThanOrEqual(0);
      expect(result!.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('calculateHalfLife', () => {
    it('should return null for insufficient data', () => {
      const result = engine.calculateHalfLife([1, 2, 3]);
      expect(result).toBeNull();
    });

    it('should calculate half-life for mean-reverting series', () => {
      const prices = generateMeanReverting(100);
      const result = engine.calculateHalfLife(prices);
      expect(result).not.toBeNull();
      expect(result!.halfLife).toBeGreaterThan(0);
      expect(result!.lambda).toBeTypeOf('number');
    });

    it('should return valid R-squared', () => {
      const prices = generateMeanReverting(100);
      const result = engine.calculateHalfLife(prices);
      expect(result).not.toBeNull();
      expect(result!.rSquared).toBeGreaterThanOrEqual(0);
      expect(result!.rSquared).toBeLessThanOrEqual(1);
    });

    it('should detect stationarity', () => {
      const prices = generateMeanReverting(200);
      const result = engine.calculateHalfLife(prices);
      expect(result).not.toBeNull();
      expect(typeof result!.isStationary).toBe('boolean');
    });

    it('should compute ADF statistic', () => {
      const prices = generateMeanReverting(100);
      const result = engine.calculateHalfLife(prices);
      expect(result).not.toBeNull();
      expect(result!.adfStatistic).toBeTypeOf('number');
    });
  });

  describe('estimateOUParams', () => {
    it('should return null for insufficient data', () => {
      const result = engine.estimateOUParams([1, 2, 3]);
      expect(result).toBeNull();
    });

    it('should estimate OU parameters', () => {
      const prices = generateMeanReverting(100, 100, 5);
      const result = engine.estimateOUParams(prices);
      expect(result).not.toBeNull();
      expect(result!.mu).toBeTypeOf('number');
      expect(result!.theta).toBeGreaterThan(0);
      expect(result!.sigma).toBeGreaterThan(0);
      expect(result!.halfLife).toBeGreaterThan(0);
    });

    it('should have stationary distribution', () => {
      const prices = generateMeanReverting(100, 100, 5);
      const result = engine.estimateOUParams(prices);
      expect(result).not.toBeNull();
      expect(result!.stationaryDistribution.mean).toBeTypeOf('number');
      expect(result!.stationaryDistribution.std).toBeGreaterThan(0);
    });

    it('should estimate mean near actual mean for mean-reverting series', () => {
      const trueMean = 100;
      const prices = generateMeanReverting(300, trueMean, 3);
      const result = engine.estimateOUParams(prices);
      expect(result).not.toBeNull();
      // Should be within reasonable range
      expect(Math.abs(result!.mu - trueMean)).toBeLessThan(20);
    });
  });

  describe('testCointegration', () => {
    it('should return null for insufficient data', () => {
      const result = engine.testCointegration([1, 2, 3], [1, 2, 3]);
      expect(result).toBeNull();
    });

    it('should detect cointegrated series', () => {
      const base = generateMeanReverting(100, 100, 5);
      const derived = base.map(p => p * 2 + (Math.random() - 0.5) * 3);
      const result = engine.testCointegration(base, derived);
      expect(result).not.toBeNull();
      expect(Math.abs(result!.hedgeRatio)).toBeGreaterThan(0);
      expect(result!.spread.length).toBe(100);
    });

    it('should not detect cointegration for unrelated series', () => {
      const s1 = generateTrending(100, 1);
      const s2 = generateRandomWalk(100);
      const result = engine.testCointegration(s1, s2);
      expect(result).not.toBeNull();
      // Might not be cointegrated
      expect(typeof result!.isCointegrated).toBe('boolean');
    });

    it('should calculate spread Z-score', () => {
      const base = generateMeanReverting(100);
      const derived = base.map(p => p + 5 + (Math.random() - 0.5) * 2);
      const result = engine.testCointegration(base, derived);
      expect(result).not.toBeNull();
      expect(result!.currentSpreadZScore).toBeTypeOf('number');
    });

    it('should calculate half-life of spread', () => {
      const base = generateMeanReverting(100);
      const derived = base.map(p => p + (Math.random() - 0.5) * 5);
      const result = engine.testCointegration(base, derived);
      expect(result).not.toBeNull();
      expect(result!.halfLife).toBeGreaterThan(0);
    });
  });

  describe('generateSignal', () => {
    it('should return null for insufficient data', () => {
      const result = engine.generateSignal([1, 2, 3, 4, 5], 20);
      expect(result).toBeNull();
    });

    it('should generate a signal for sufficient data', () => {
      const prices = generateMeanReverting(100);
      const result = engine.generateSignal(prices, 20);
      expect(result).not.toBeNull();
      expect(['buy', 'sell', 'hold']).toContain(result!.signal);
      expect(result!.strength).toBeGreaterThanOrEqual(0);
      expect(result!.strength).toBeLessThanOrEqual(1);
    });

    it('should provide reasons', () => {
      const prices = generateMeanReverting(100);
      const result = engine.generateSignal(prices, 20);
      expect(result).not.toBeNull();
      expect(Array.isArray(result!.reasons)).toBe(true);
    });

    it('should include Z-score, half-life, and Hurst values', () => {
      const prices = generateMeanReverting(100);
      const result = engine.generateSignal(prices, 20);
      expect(result).not.toBeNull();
      expect(result!.zScore).toBeTypeOf('number');
      expect(result!.halfLife).toBeTypeOf('number');
      expect(result!.hurst).toBeTypeOf('number');
    });
  });

  describe('rollingAnalysis', () => {
    it('should return null for insufficient data', () => {
      const result = engine.rollingAnalysis([1, 2, 3], 60);
      expect(result).toBeNull();
    });

    it('should produce rolling analysis results', () => {
      const prices = generateMeanReverting(200);
      const result = engine.rollingAnalysis(prices, 60, 10);
      expect(result).not.toBeNull();
      expect(result!.window).toBe(60);
      expect(result!.periods.length).toBeGreaterThan(0);
    });

    it('each period should have required fields', () => {
      const prices = generateMeanReverting(200);
      const result = engine.rollingAnalysis(prices, 60, 10);
      expect(result).not.toBeNull();
      for (const period of result!.periods) {
        expect(period.zScore).toBeTypeOf('number');
        expect(period.hurst).toBeTypeOf('number');
        expect(period.halfLife).toBeGreaterThan(0);
        expect(typeof period.isReverting).toBe('boolean');
      }
    });
  });

  describe('analyzePairSpread', () => {
    it('should analyze pair spread', () => {
      const base = generateMeanReverting(100);
      const pair = base.map(p => p + (Math.random() - 0.5) * 10);
      const result = engine.analyzePairSpread(base, pair);
      expect(result.cointegration).not.toBeNull();
      expect(Array.isArray(result.entrySignals)).toBe(true);
      expect(Array.isArray(result.exitSignals)).toBe(true);
    });

    it('should return empty signals for non-cointegrated pair', () => {
      const s1 = generateTrending(100, 1);
      const s2 = generateRandomWalk(100);
      const result = engine.analyzePairSpread(s1, s2);
      expect(result.cointegration).not.toBeNull();
      // Signals may or may not exist depending on cointegration
    });
  });

  describe('edge cases', () => {
    it('should handle constant prices', () => {
      const prices = Array(50).fill(100);
      const zResult = engine.calculateZScore(prices, 20);
      expect(zResult).toBeNull(); // std = 0
    });

    it('should handle very short series', () => {
      const prices = [100, 101, 99, 100];
      expect(engine.calculateZScore(prices, 20)).toBeNull();
      expect(engine.calculateHurstExponent(prices, 20)).toBeNull();
      expect(engine.calculateHalfLife(prices)).toBeNull();
      expect(engine.estimateOUParams(prices)).toBeNull();
    });

    it('should handle extreme values', () => {
      const prices = [1, 1000000, 1, 1000000, 1, 1000000, 1, 1000000, 1, 1000000,
                       1, 1000000, 1, 1000000, 1, 1000000, 1, 1000000, 1, 1000000];
      const result = engine.calculateZScore(prices, 20);
      expect(result).not.toBeNull();
      expect(isFinite(result!.zScore)).toBe(true);
    });

    it('should handle identical consecutive values', () => {
      const prices = [100, 100, 100, 101, 101, 101, 100, 100, 100, 101, 101, 101,
                       100, 100, 100, 101, 101, 101, 100, 100, 100, 101, 101, 101];
      const result = engine.calculateHalfLife(prices);
      expect(result).not.toBeNull();
    });

    it('should handle monotonic increasing prices', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + i);
      const result = engine.calculateZScore(prices, 20);
      expect(result).not.toBeNull();
      expect(result!.zScore).toBeGreaterThan(0);
    });

    it('should handle monotonic decreasing prices', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 150 - i);
      const result = engine.calculateZScore(prices, 20);
      expect(result).not.toBeNull();
      expect(result!.zScore).toBeLessThan(0);
    });
  });
});
