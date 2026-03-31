import { describe, it, expect } from 'vitest';
import { RiskBudgetEngine, Position, StressTestScenario } from '../services/riskBudgetEngine';

describe('Risk Budget Engine', () => {
  const engine = new RiskBudgetEngine();

  const generateReturns = (n: number, mean: number = 0.001, std: number = 0.02): number[] => {
    return Array.from({ length: n }, () => {
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return mean + std * z;
    });
  };

  const createPosition = (symbol: string, weight: number, overrides: Partial<Position> = {}): Position => ({
    symbol,
    weight,
    returns: generateReturns(100),
    sector: 'default',
    ...overrides
  });

  describe('parametricVaR', () => {
    it('should return 0 for insufficient data', () => {
      expect(engine.parametricVaR([1, 2], 0.95)).toBe(0);
    });

    it('should calculate positive VaR', () => {
      const returns = generateReturns(100);
      const var95 = engine.parametricVaR(returns, 0.95);
      expect(var95).toBeGreaterThan(0);
    });

    it('VaR99 should be larger than VaR95', () => {
      const returns = generateReturns(200);
      const var95 = engine.parametricVaR(returns, 0.95);
      const var99 = engine.parametricVaR(returns, 0.99);
      expect(var99).toBeGreaterThan(var95);
    });

    it('should scale with horizon', () => {
      const returns = generateReturns(100);
      const var1d = engine.parametricVaR(returns, 0.95, 1);
      const var5d = engine.parametricVaR(returns, 0.95, 5);
      expect(var5d).toBeGreaterThan(var1d);
    });
  });

  describe('historicalVaR', () => {
    it('should return 0 for insufficient data', () => {
      expect(engine.historicalVaR([1, 2], 0.95)).toBe(0);
    });

    it('should calculate VaR from historical returns', () => {
      const returns = generateReturns(100);
      const var95 = engine.historicalVaR(returns, 0.95);
      expect(var95).toBeGreaterThan(0);
    });
  });

  describe('monteCarloVaR', () => {
    it('should return 0 for insufficient data', () => {
      expect(engine.monteCarloVaR([1, 2], 0.95)).toBe(0);
    });

    it('should calculate VaR via simulation', () => {
      const returns = generateReturns(100);
      const var95 = engine.monteCarloVaR(returns, 0.95, 5000);
      expect(var95).toBeGreaterThan(0);
    });
  });

  describe('calculateCVaR', () => {
    it('should return 0 for insufficient data', () => {
      expect(engine.calculateCVaR([1, 2], 0.95)).toBe(0);
    });

    it('CVaR should be >= VaR', () => {
      const returns = generateReturns(200);
      const var95 = engine.historicalVaR(returns, 0.95);
      const cvar95 = engine.calculateCVaR(returns, 0.95);
      expect(cvar95).toBeGreaterThanOrEqual(var95);
    });
  });

  describe('calculateMaxDrawdown', () => {
    it('should return 0 for empty returns', () => {
      const result = engine.calculateMaxDrawdown([]);
      expect(result.maxDrawdown).toBe(0);
    });

    it('should calculate drawdown', () => {
      const returns = [0.01, 0.02, -0.05, -0.03, 0.01, 0.02, -0.08, 0.01];
      const result = engine.calculateMaxDrawdown(returns);
      expect(result.maxDrawdown).toBeGreaterThan(0);
    });

    it('should have currentDrawdown <= maxDrawdown', () => {
      const returns = generateReturns(100);
      const result = engine.calculateMaxDrawdown(returns);
      expect(result.currentDrawdown).toBeLessThanOrEqual(result.maxDrawdown + 0.001);
    });
  });

  describe('calculateRiskMetrics', () => {
    it('should return zeros for insufficient data', () => {
      const result = engine.calculateRiskMetrics([1, 2]);
      expect(result.volatility).toBe(0);
    });

    it('should calculate all metrics', () => {
      const returns = generateReturns(200);
      const result = engine.calculateRiskMetrics(returns);
      expect(result.var95).toBeGreaterThan(0);
      expect(result.volatility).toBeGreaterThan(0);
      expect(result.sharpeRatio).toBeTypeOf('number');
      expect(result.sortinoRatio).toBeTypeOf('number');
      expect(result.calmarRatio).toBeTypeOf('number');
    });

    it('should calculate beta with benchmark', () => {
      const portfolioReturns = generateReturns(200);
      const benchmarkReturns = generateReturns(200);
      const result = engine.calculateRiskMetrics(portfolioReturns, benchmarkReturns);
      expect(result.beta).toBeTypeOf('number');
      expect(result.trackingError).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateRiskBudget', () => {
    it('should calculate budget allocations', () => {
      const positions = [
        createPosition('A', 0.4, { sector: 'tech' }),
        createPosition('B', 0.3, { sector: 'finance' }),
        createPosition('C', 0.3, { sector: 'tech' }),
      ];
      const budget = engine.calculateRiskBudget(positions, 1000000);
      expect(budget.totalBudget).toBe(1000000);
      expect(budget.allocations.length).toBe(2);
      expect(budget.diversificationScore).toBeGreaterThan(0);
    });

    it('should detect breaches', () => {
      const positions = [
        createPosition('A', 0.5, { sector: 'tech', returns: generateReturns(100, 0, 0.1) }),
      ];
      const budget = engine.calculateRiskBudget(positions, 1000);
      const techAlloc = budget.allocations.find(a => a.sector === 'tech');
      expect(techAlloc).toBeDefined();
    });

    it('diversification score should be 0-1', () => {
      const positions = [
        createPosition('A', 0.5),
        createPosition('B', 0.5),
      ];
      const budget = engine.calculateRiskBudget(positions, 100000);
      expect(budget.diversificationScore).toBeGreaterThanOrEqual(0);
      expect(budget.diversificationScore).toBeLessThanOrEqual(1);
    });
  });

  describe('analyzeCorrelationRisk', () => {
    it('should return zero for <2 positions', () => {
      const result = engine.analyzeCorrelationRisk([createPosition('A', 1)]);
      expect(result.avgCorrelation).toBe(0);
    });

    it('should calculate correlations', () => {
      const positions = [
        createPosition('A', 0.5),
        createPosition('B', 0.5),
        createPosition('C', 0.5),
      ];
      const result = engine.analyzeCorrelationRisk(positions);
      expect(result.correlationPairs.length).toBe(3);
      expect(result.avgCorrelation).toBeGreaterThanOrEqual(-1);
      expect(result.avgCorrelation).toBeLessThanOrEqual(1);
    });

    it('should classify risk levels', () => {
      const baseReturns = generateReturns(100);
      const correlated = baseReturns.map(r => r + (Math.random() - 0.5) * 0.001);
      const positions = [
        createPosition('A', 0.5, { returns: baseReturns }),
        createPosition('B', 0.5, { returns: correlated }),
      ];
      const result = engine.analyzeCorrelationRisk(positions);
      expect(result.correlationPairs[0].risk).toBe('high');
    });

    it('should calculate diversification ratio', () => {
      const positions = [
        createPosition('A', 0.5),
        createPosition('B', 0.5),
      ];
      const result = engine.analyzeCorrelationRisk(positions);
      expect(result.diversificationRatio).toBeGreaterThan(0);
    });
  });

  describe('stressTest', () => {
    it('should apply stress scenarios', () => {
      const positions = [
        createPosition('A', 0.5),
        createPosition('B', 0.5),
      ];
      const scenarios: StressTestScenario[] = [
        { name: 'market_crash', description: 'Market drops 20%', shocks: { A: -0.2, B: -0.15 } },
        { name: 'sector_shock', description: 'Tech drops 30%', shocks: { A: -0.3 } },
      ];
      const results = engine.stressTest(positions, scenarios);
      expect(results.length).toBe(2);
      expect(results[0].portfolioImpact).toBeLessThan(0);
    });

    it('should identify worst position', () => {
      const positions = [
        createPosition('A', 0.5),
        createPosition('B', 0.5),
      ];
      const scenarios: StressTestScenario[] = [
        { name: 'shock', description: 'A crashes', shocks: { A: -0.5, B: -0.1 } },
      ];
      const results = engine.stressTest(positions, scenarios);
      expect(results[0].worstPosition.symbol).toBe('A');
    });

    it('should detect limit breaches', () => {
      const positions = [
        createPosition('A', 1),
      ];
      const scenarios: StressTestScenario[] = [
        { name: 'big_shock', description: '15% drop', shocks: { A: -0.15 } },
      ];
      const results = engine.stressTest(positions, scenarios);
      expect(results[0].breachesLimit).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle all zero returns', () => {
      const returns = Array(100).fill(0);
      const var95 = engine.parametricVaR(returns);
      expect(Math.abs(var95)).toBeLessThan(0.001);
      expect(engine.calculateMaxDrawdown(returns).maxDrawdown).toBe(0);
    });

    it('should handle constant positive returns', () => {
      const returns = Array(100).fill(0.01);
      const dd = engine.calculateMaxDrawdown(returns);
      expect(dd.maxDrawdown).toBe(0);
    });

    it('should handle all negative returns', () => {
      const returns = Array(100).fill(-0.01);
      const var95 = engine.parametricVaR(returns);
      expect(var95).toBeGreaterThan(0);
    });
  });
});
