import { describe, it, expect } from 'vitest';
import { GARCHVolatilityEngine } from '../services/garchVolatilityEngine';

describe('GARCHVolatilityEngine', () => {
  const engine = new GARCHVolatilityEngine();

  const makeReturns = (n: number) => 
    Array.from({ length: n }, () => (Math.random() - 0.5) * 0.04);

  describe('fit', () => {
    it('should fit GARCH(1,1) parameters', () => {
      const returns = makeReturns(100);
      const result = engine.fit(returns);
      expect(result.omega).toBeGreaterThan(0);
      expect(result.alpha).toBeGreaterThan(0);
      expect(result.beta).toBeGreaterThan(0);
    });

    it('should ensure stationarity (alpha + beta < 1)', () => {
      const returns = makeReturns(100);
      const result = engine.fit(returns);
      expect(result.alpha + result.beta).toBeLessThan(1);
    });

    it('should produce conditional variance series', () => {
      const returns = makeReturns(100);
      const result = engine.fit(returns);
      expect(result.conditionalVariance.length).toBe(100);
    });

    it('should handle short series', () => {
      const result = engine.fit([0.01, -0.02, 0.01]);
      expect(result.omega).toBeGreaterThan(0);
    });
  });

  describe('forecastVolatility', () => {
    it('should forecast future volatility', () => {
      engine.fit(makeReturns(100));
      const forecast = engine.forecastVolatility(5);
      expect(forecast.length).toBe(5);
      forecast.forEach(v => expect(v).toBeGreaterThanOrEqual(0));
    });

    it('should converge to long-run volatility', () => {
      engine.fit(makeReturns(200));
      const forecast = engine.forecastVolatility(50);
      const longRun = forecast[forecast.length - 1];
      const short = forecast[0];
      expect(longRun).toBeGreaterThan(0);
    });
  });

  describe('calculateVaR', () => {
    it('should calculate VaR at 95% confidence', () => {
      engine.fit(makeReturns(100));
      const var95 = engine.calculateVaR(0.95);
      expect(var95).toBeGreaterThan(0);
    });

    it('VaR99 should be higher than VaR95', () => {
      engine.fit(makeReturns(100));
      const var95 = engine.calculateVaR(0.95);
      const var99 = engine.calculateVaR(0.99);
      expect(var99).toBeGreaterThan(var95);
    });
  });

  describe('getVolatilityRegime', () => {
    it('should return valid regime', () => {
      engine.fit(makeReturns(100));
      const regime = engine.getVolatilityRegime();
      expect(['low', 'normal', 'high', 'extreme']).toContain(regime);
    });
  });
});
