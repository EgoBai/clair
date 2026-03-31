import { describe, it, expect } from 'vitest';
import { VolatilityEngine, GARCHResult } from '../services/volatilityEngine';

describe('Volatility Engine', () => {
  const engine = new VolatilityEngine();

  const generatePrices = (n: number, vol: number = 0.02): number[] => {
    const prices: number[] = [100];
    for (let i = 1; i < n; i++) {
      const ret = (Math.random() - 0.5) * vol * 2;
      prices.push(prices[i - 1] * (1 + ret));
    }
    return prices;
  };

  describe('historicalVolatility', () => {
    it('should return empty for insufficient data', () => {
      expect(engine.historicalVolatility([1, 2, 3], 20)).toEqual([]);
    });

    it('should calculate volatility series', () => {
      const prices = generatePrices(100);
      const vols = engine.historicalVolatility(prices, 20);
      expect(vols.length).toBeGreaterThan(0);
      for (const v of vols) {
        expect(v).toBeGreaterThan(0);
      }
    });

    it('should use correct window', () => {
      const prices = generatePrices(100);
      const vols20 = engine.historicalVolatility(prices, 20);
      const vols50 = engine.historicalVolatility(prices, 50);
      expect(vols50.length).toBeLessThan(vols20.length);
    });

    it('should annualize volatility', () => {
      const prices = generatePrices(100);
      const vols = engine.historicalVolatility(prices, 20);
      // Annualized vol should be reasonable
      for (const v of vols) {
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThan(5); // < 500% annual vol
      }
    });
  });

  describe('fitGARCH', () => {
    it('should return null for insufficient data', () => {
      expect(engine.fitGARCH([1, 2, 3])).toBeNull();
    });

    it('should fit GARCH parameters', () => {
      const returns = Array.from({ length: 200 }, () => (Math.random() - 0.5) * 0.04);
      const result = engine.fitGARCH(returns);
      expect(result).not.toBeNull();
      expect(result!.alpha).toBeGreaterThan(0);
      expect(result!.beta).toBeGreaterThan(0);
      expect(result!.alpha + result!.beta).toBeLessThan(1);
    });

    it('should generate forecasts', () => {
      const returns = Array.from({ length: 200 }, () => (Math.random() - 0.5) * 0.04);
      const result = engine.fitGARCH(returns);
      expect(result).not.toBeNull();
      expect(result!.forecasts.length).toBe(5);
      for (const f of result!.forecasts) {
        expect(f).toBeGreaterThan(0);
      }
    });

    it('should have log likelihood', () => {
      const returns = Array.from({ length: 200 }, () => (Math.random() - 0.5) * 0.04);
      const result = engine.fitGARCH(returns);
      expect(result).not.toBeNull();
      expect(result!.logLikelihood).toBeTypeOf('number');
    });
  });

  describe('buildVolCone', () => {
    it('should build volatility cone', () => {
      const prices = generatePrices(300);
      const cones = engine.buildVolCone(prices, [5, 20, 60]);
      expect(cones.length).toBeGreaterThan(0);
    });

    it('each cone should have percentiles', () => {
      const prices = generatePrices(300);
      const cones = engine.buildVolCone(prices, [20]);
      for (const cone of cones) {
        expect(cone.min).toBeLessThanOrEqual(cone.percentile25);
        expect(cone.percentile25).toBeLessThanOrEqual(cone.median);
        expect(cone.median).toBeLessThanOrEqual(cone.percentile75);
        expect(cone.percentile75).toBeLessThanOrEqual(cone.max);
      }
    });

    it('should calculate percentile rank', () => {
      const prices = generatePrices(300);
      const cones = engine.buildVolCone(prices, [20]);
      for (const cone of cones) {
        expect(cone.percentile).toBeGreaterThanOrEqual(0);
        expect(cone.percentile).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('detectBreakouts', () => {
    it('should return empty for insufficient data', () => {
      const prices = generatePrices(30);
      expect(engine.detectBreakouts(prices, 20)).toEqual([]);
    });

    it('should detect breakouts', () => {
      const prices = generatePrices(300);
      const breakouts = engine.detectBreakouts(prices, 20, 1.5);
      expect(Array.isArray(breakouts)).toBe(true);
    });

    it('should classify type', () => {
      const prices = generatePrices(300);
      const breakouts = engine.detectBreakouts(prices, 20, 1);
      for (const b of breakouts) {
        expect(['expansion', 'contraction']).toContain(b.type);
      }
    });
  });

  describe('buildVolSurface', () => {
    it('should build surface', () => {
      const surface = engine.buildVolSurface(
        [90, 95, 100, 105, 110],
        [30, 60, 90],
        100,
        0.2
      );
      expect(surface.strikes.length).toBe(5);
      expect(surface.expiries.length).toBe(3);
      expect(surface.impliedVols.length).toBe(3);
      expect(surface.impliedVols[0].length).toBe(5);
    });

    it('should calculate skew', () => {
      const surface = engine.buildVolSurface(
        [90, 100, 110],
        [30],
        100,
        0.2
      );
      expect(surface.skew).toBeTypeOf('number');
    });

    it('should have term structure', () => {
      const surface = engine.buildVolSurface(
        [100],
        [30, 60, 90],
        100,
        0.2
      );
      expect(surface.termStructure.length).toBe(3);
    });
  });

  describe('detectRegime', () => {
    it('should return normal for insufficient data', () => {
      const regime = engine.detectRegime([1, 2, 3], 60);
      expect(regime.regime).toBe('normal');
    });

    it('should detect regime', () => {
      const prices = generatePrices(200);
      const regime = engine.detectRegime(prices, 60);
      expect(['low', 'normal', 'high', 'extreme']).toContain(regime.regime);
    });

    it('should detect trend', () => {
      const prices = generatePrices(200);
      const regime = engine.detectRegime(prices, 60);
      expect(['increasing', 'decreasing', 'stable']).toContain(regime.trend);
    });

    it('should have persistence 0-1', () => {
      const prices = generatePrices(200);
      const regime = engine.detectRegime(prices, 60);
      expect(regime.persistence).toBeGreaterThanOrEqual(0);
      expect(regime.persistence).toBeLessThanOrEqual(1);
    });
  });
});
