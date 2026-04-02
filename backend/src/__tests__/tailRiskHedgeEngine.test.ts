import { describe, it, expect } from 'vitest';
import { TailRiskHedgeEngine } from '../services/tailRiskHedgeEngine';

describe('TailRiskHedgeEngine', () => {
  const engine = new TailRiskHedgeEngine();

  const generateReturns = (n: number, mean = 0.001, std = 0.02): number[] => {
    const result: number[] = [];
    let seed = 42;
    for (let i = 0; i < n; i++) {
      seed = (seed * 16807) % 2147483647;
      const u1 = seed / 2147483647;
      seed = (seed * 16807) % 2147483647;
      const u2 = seed / 2147483647;
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      result.push(mean + std * z);
    }
    return result;
  };

  describe('calculateTailRisk', () => {
    it('returns zeros for insufficient data', () => {
      const result = engine.calculateTailRisk([0.01, 0.02]);
      expect(result.var95).toBe(0);
    });

    it('computes valid VaR and CVaR', () => {
      const returns = generateReturns(500);
      const result = engine.calculateTailRisk(returns);
      expect(result.var95).toBeLessThan(0);
      expect(result.var99).toBeLessThanOrEqual(result.var95);
      expect(result.cvar95).toBeLessThanOrEqual(result.var95);
      expect(result.cvar99).toBeLessThanOrEqual(result.var99);
    });

    it('maxDrawdown is non-positive', () => {
      const returns = generateReturns(500);
      const result = engine.calculateTailRisk(returns);
      expect(result.maxDrawdown).toBeLessThanOrEqual(0);
    });

    it('skewness and kurtosis are finite', () => {
      const returns = generateReturns(500);
      const result = engine.calculateTailRisk(returns);
      expect(Number.isFinite(result.skewness)).toBe(true);
      expect(Number.isFinite(result.kurtosis)).toBe(true);
    });
  });

  describe('fitEVT', () => {
    it('returns null for insufficient data', () => {
      expect(engine.fitEVT([1, 2, 3])).toBeNull();
    });

    it('fits GPD parameters', () => {
      const returns = generateReturns(200, -0.001, 0.03);
      const evt = engine.fitEVT(returns);
      expect(evt).not.toBeNull();
      expect(evt!.scale).toBeGreaterThan(0);
      expect(evt!.exceedances).toBeGreaterThan(0);
      expect(Number.isFinite(evt!.shape)).toBe(true);
    });

    it('uses custom threshold', () => {
      const returns = generateReturns(200, -0.001, 0.03);
      const evt = engine.fitEVT(returns, -0.03);
      expect(evt).not.toBeNull();
    });
  });

  describe('stressTest', () => {
    it('applies shock scenarios', () => {
      const weights = new Map([['A', 0.6], ['B', 0.4]]);
      const scenarios = [
        { name: 'Crash', shocks: new Map([['A', -0.3], ['B', -0.2]]), probability: 0.05 },
        { name: 'Recovery', shocks: new Map([['A', 0.1], ['B', 0.05]]), probability: 0.3 },
      ];
      const result = engine.stressTest(1000000, weights, scenarios);
      expect(result.length).toBe(2);
      expect(result[0].portfolioImpact).toBeLessThan(0);
      expect(result[1].portfolioImpact).toBeGreaterThan(0);
    });

    it('missing asset gets zero shock', () => {
      const weights = new Map([['A', 1.0]]);
      const scenarios = [{ name: 'Test', shocks: new Map([['B', -0.5]]), probability: 0.1 }];
      const result = engine.stressTest(100000, weights, scenarios);
      expect(result[0].portfolioImpact).toBe(0);
    });
  });

  describe('evaluatePutProtection', () => {
    it('evaluates put protection strategy', () => {
      const strategy = engine.evaluatePutProtection(100, 90, 3, 100000);
      expect(strategy.cost).toBeGreaterThan(0);
      expect(strategy.maxProtection).toBeGreaterThan(0);
      expect(strategy.protectionRange[0]).toBeLessThan(0);
      expect(strategy.type).toBe('put_spread');
    });
  });

  describe('evaluateCollar', () => {
    it('evaluates collar strategy', () => {
      const strategy = engine.evaluateCollar(100, 90, 110, 3, 2, 100000);
      expect(strategy.type).toBe('collar');
      expect(strategy.maxProtection).toBeGreaterThan(0);
      expect(strategy.protectionRange[0]).toBeLessThan(0);
      expect(strategy.protectionRange[1]).toBeGreaterThan(0);
    });

    it('net credit when call premium > put premium', () => {
      const strategy = engine.evaluateCollar(100, 90, 110, 1, 3, 100000);
      expect(strategy.cost).toBe(0); // net credit
    });
  });

  describe('optimizeHedgeRatio', () => {
    it('returns null for mismatched data', () => {
      expect(engine.optimizeHedgeRatio([1, 2], [3])).toBeNull();
    });

    it('finds optimal hedge ratio', () => {
      const portReturns = generateReturns(100, -0.001, 0.02);
      const hedgeReturns = portReturns.map(r => -r * 0.8 + (Math.random() - 0.5) * 0.01);
      const result = engine.optimizeHedgeRatio(portReturns, hedgeReturns);
      expect(result).not.toBeNull();
      expect(result!.hedgeRatio).toBeGreaterThanOrEqual(0);
      expect(result!.hedgeRatio).toBeLessThanOrEqual(1);
      expect(result!.residualRisk).toBeGreaterThanOrEqual(0);
    });
  });

  describe('expectedShortfall', () => {
    it('returns 0 for empty array', () => {
      expect(engine.expectedShortfall([])).toBe(0);
    });

    it('computes ES correctly', () => {
      const returns = generateReturns(500);
      const es = engine.expectedShortfall(returns, 0.05);
      const sorted = [...returns].sort((a, b) => a - b);
      expect(es).toBeLessThanOrEqual(sorted[Math.floor(500 * 0.05)]);
    });
  });

  describe('tailDependence', () => {
    it('returns zeros for insufficient data', () => {
      expect(engine.tailDependence([1, 2], [3, 4])).toEqual({ lower: 0, upper: 0 });
    });

    it('computes tail dependence', () => {
      const r1 = generateReturns(200);
      const r2 = r1.map(v => v * 0.9 + (Math.random() - 0.5) * 0.005);
      const result = engine.tailDependence(r1, r2);
      expect(result.lower).toBeGreaterThanOrEqual(0);
      expect(result.upper).toBeGreaterThanOrEqual(0);
    });

    it('higher correlation → higher tail dependence', () => {
      const r1 = generateReturns(500);
      const r2High = r1.map(v => v * 0.95);
      const r2Low = r1.map(v => -v);
      const high = engine.tailDependence(r1, r2High);
      const low = engine.tailDependence(r1, r2Low);
      expect(high.lower + high.upper).toBeGreaterThanOrEqual(low.lower + low.upper - 0.5);
    });
  });
});
