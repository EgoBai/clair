import { describe, it, expect } from 'vitest';
import {
  multiFactorRegression,
  factorAttribution,
  calculateFactorIC,
  factorQuantileBacktest,
  factorCorrelationMatrix,
  type FactorData,
} from '../utils/factorAnalysis';

function generateReturns(n: number, mean: number = 0, vol: number = 0.02): number[] {
  return Array.from({ length: n }, () => mean + (Math.random() - 0.5) * 2 * vol);
}

describe('因子分析引擎', () => {
  describe('multiFactorRegression', () => {
    it('should find positive beta for correlated factor', () => {
      const n = 200;
      const factorReturns = generateReturns(n, 0.001, 0.02);
      // 构造一个与因子正相关的股票收益
      const stockReturns = factorReturns.map(r => r * 1.5 + (Math.random() - 0.5) * 0.01);

      const factors: FactorData[] = [
        { name: 'Market', returns: factorReturns }
      ];

      const result = multiFactorRegression(stockReturns, factors);
      expect(result.betas['Market']).toBeGreaterThan(0.5);
      expect(result.rSquared).toBeGreaterThan(0.3);
    });

    it('should handle multiple factors', () => {
      const n = 200;
      const f1 = generateReturns(n);
      const f2 = generateReturns(n);
      const stockReturns = f1.map((r, i) => r * 2 + f2[i] * 0.5 + (Math.random() - 0.5) * 0.01);

      const factors: FactorData[] = [
        { name: 'Market', returns: f1 },
        { name: 'Size', returns: f2 }
      ];

      const result = multiFactorRegression(stockReturns, factors);
      expect(result.betas['Market']).toBeGreaterThan(1);
      expect(result.rSquared).toBeGreaterThan(0.3);
    });

    it('should return zero for insufficient data', () => {
      const factors: FactorData[] = [
        { name: 'F1', returns: [1, 2] }
      ];
      const result = multiFactorRegression([1], factors);
      expect(result.alpha).toBe(0);
      expect(result.rSquared).toBe(0);
    });

    it('should handle empty factors', () => {
      const result = multiFactorRegression([1, 2, 3], []);
      expect(result.alpha).toBe(0);
    });

    it('should calculate t-stats', () => {
      const n = 500;
      const factor = generateReturns(n, 0, 0.01);
      const stock = factor.map(r => r * 3 + (Math.random() - 0.5) * 0.005);

      const result = multiFactorRegression(stock, [{ name: 'F', returns: factor }]);
      expect(result.tStats['F']).toBeGreaterThan(2); // 显著
    });
  });

  describe('factorAttribution', () => {
    it('should calculate contributions correctly', () => {
      const exposures = { Market: 1.2, Size: -0.5, Value: 0.3 };
      const factorReturns = { Market: 0.02, Size: -0.01, Value: 0.015 };

      const result = factorAttribution(exposures, factorReturns);
      expect(result.length).toBe(3);

      const marketContrib = result.find(c => c.factorName === 'Market')!;
      expect(marketContrib.contribution).toBeCloseTo(1.2 * 0.02, 10);
    });

    it('should sum contributions', () => {
      const exposures = { A: 1, B: 2 };
      const factorReturns = { A: 0.01, B: 0.02 };
      const result = factorAttribution(exposures, factorReturns);
      const total = result.reduce((s, c) => s + c.contribution, 0);
      expect(total).toBeCloseTo(0.01 + 0.04, 10);
    });
  });

  describe('calculateFactorIC', () => {
    it('should return positive IC for predictive factor', () => {
      const n = 500;
      const factor = generateReturns(n, 0, 0.02);
      const forward = factor.map(r => r * 0.5 + (Math.random() - 0.5) * 0.01);

      const result = calculateFactorIC(factor, forward, 20);
      expect(result.ic).toBeGreaterThan(0);
      expect(result.hitRate).toBeGreaterThan(0.4);
    });

    it('should handle insufficient data', () => {
      const result = calculateFactorIC([1], [2]);
      expect(result.ic).toBe(0);
      expect(result.periods).toBe(0);
    });

    it('ICIR should be reasonable', () => {
      const n = 300;
      const factor = generateReturns(n);
      const forward = factor.map(r => r * 0.3 + (Math.random() - 0.5) * 0.02);

      const result = calculateFactorIC(factor, forward, 20);
      expect(Math.abs(result.icir)).toBeLessThan(10);
    });
  });

  describe('factorQuantileBacktest', () => {
    it('should divide into quantiles', () => {
      const n = 100;
      const factor = Array.from({ length: n }, (_, i) => i / n); // 排序好的因子
      const returns = factor.map(f => f * 0.02 + (Math.random() - 0.5) * 0.01);

      const result = factorQuantileBacktest(factor, returns, 5);
      expect(result.length).toBe(5);
      // 高分位应该有更高收益
      expect(result[4].avgReturn).toBeGreaterThan(result[0].avgReturn);
    });

    it('should return correct counts', () => {
      const factor = Array.from({ length: 100 }, () => Math.random());
      const returns = Array.from({ length: 100 }, () => Math.random() * 0.02 - 0.01);

      const result = factorQuantileBacktest(factor, returns, 5);
      const totalCount = result.reduce((s, q) => s + q.count, 0);
      expect(totalCount).toBe(100);
    });

    it('should handle insufficient data', () => {
      const result = factorQuantileBacktest([1, 2], [1, 2], 5);
      expect(result.length).toBe(0);
    });
  });

  describe('factorCorrelationMatrix', () => {
    it('should have 1 on diagonal', () => {
      const factors: FactorData[] = [
        { name: 'A', returns: generateReturns(100) },
        { name: 'B', returns: generateReturns(100) },
      ];
      const result = factorCorrelationMatrix(factors);
      expect(result.matrix[0][0]).toBeCloseTo(1, 10);
      expect(result.matrix[1][1]).toBeCloseTo(1, 10);
    });

    it('should be symmetric', () => {
      const factors: FactorData[] = [
        { name: 'A', returns: generateReturns(100) },
        { name: 'B', returns: generateReturns(100) },
      ];
      const result = factorCorrelationMatrix(factors);
      expect(result.matrix[0][1]).toBeCloseTo(result.matrix[1][0], 10);
    });

    it('should detect high correlation', () => {
      const base = generateReturns(100);
      const factors: FactorData[] = [
        { name: 'A', returns: base },
        { name: 'B', returns: base.map(r => r + (Math.random() - 0.5) * 0.001) },
      ];
      const result = factorCorrelationMatrix(factors);
      expect(result.matrix[0][1]).toBeGreaterThan(0.9);
    });
  });
});
