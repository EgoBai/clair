import { describe, it, expect } from 'vitest';
import {
  impliedProbabilityDensity,
  distributionShape,
  volatilitySmile,
  OptionChainInput,
} from '../utils/optionImpliedDistEngine';

describe('期权隐含概率分布引擎', () => {
  const spot = 100;
  const options: OptionChainInput[] = Array.from({ length: 11 }, (_, i) => {
    const strike = 90 + i * 2;
    const dist = Math.abs(strike - spot);
    const callPrice = Math.max(0, spot - strike + 5 - dist * 0.2 + Math.random());
    const putPrice = Math.max(0, strike - spot + 5 - dist * 0.2 + Math.random());
    return { strike, callPrice, putPrice, expiry: 30 };
  });

  describe('impliedProbabilityDensity', () => {
    it('should return distribution with all fields', () => {
      const dist = impliedProbabilityDensity(options);
      expect(dist.strikes.length).toBeGreaterThan(0);
      expect(dist.probabilities.length).toBeGreaterThan(0);
      expect(dist.cdf.length).toBeGreaterThan(0);
      expect(typeof dist.mean).toBe('number');
      expect(typeof dist.skewness).toBe('number');
      expect(typeof dist.kurtosis).toBe('number');
    });

    it('should handle empty options', () => {
      const dist = impliedProbabilityDensity([]);
      expect(dist.strikes.length).toBe(0);
    });

    it('should handle single option', () => {
      const dist = impliedProbabilityDensity([{ strike: 100, callPrice: 5, putPrice: 5, expiry: 30 }]);
      expect(dist.strikes.length).toBe(0);
    });

    it('should have non-negative densities', () => {
      const dist = impliedProbabilityDensity(options);
      dist.probabilities.forEach(p => expect(p).toBeGreaterThanOrEqual(0));
    });

    it('should calculate VaR values', () => {
      const dist = impliedProbabilityDensity(options);
      expect(dist.var95).toBeDefined();
      expect(dist.var99).toBeDefined();
    });

    it('should have valid confidence interval', () => {
      const dist = impliedProbabilityDensity(options);
      expect(dist.confidenceInterval[0]).toBeLessThanOrEqual(dist.confidenceInterval[1]);
    });
  });

  describe('distributionShape', () => {
    it('should classify normal distribution', () => {
      const shape = distributionShape({
        strikes: [], probabilities: [], cdf: [],
        mean: 100, median: 100, mode: 100,
        skewness: 0.1, kurtosis: 0.2,
        var95: 90, var99: 85, confidenceInterval: [95, 105],
      });
      expect(shape.type).toBe('normal');
    });

    it('should classify left skew', () => {
      const shape = distributionShape({
        strikes: [], probabilities: [], cdf: [],
        mean: 95, median: 98, mode: 100,
        skewness: -1.2, kurtosis: 0.5,
        var95: 80, var99: 70, confidenceInterval: [85, 105],
      });
      expect(shape.type).toBe('left_skew');
    });

    it('should classify fat tail', () => {
      const shape = distributionShape({
        strikes: [], probabilities: [], cdf: [],
        mean: 100, median: 100, mode: 100,
        skewness: 0.1, kurtosis: 5,
        var95: 70, var99: 50, confidenceInterval: [80, 120],
      });
      expect(shape.type).toBe('fat_tail');
    });

    it('should classify right skew', () => {
      const shape = distributionShape({
        strikes: [], probabilities: [], cdf: [],
        mean: 105, median: 102, mode: 100,
        skewness: 1.5, kurtosis: 0.3,
        var95: 90, var99: 85, confidenceInterval: [95, 115],
      });
      expect(shape.type).toBe('right_skew');
    });
  });

  describe('volatilitySmile', () => {
    it('should calculate smile for each strike', () => {
      const smile = volatilitySmile(options, spot);
      expect(smile.length).toBe(options.length);
      smile.forEach(s => {
        expect(s.moneyness).toBeGreaterThan(0);
        expect(typeof s.smile).toBe('number');
        expect(typeof s.skew).toBe('number');
      });
    });
  });
});
