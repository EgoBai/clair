import { describe, it, expect } from 'vitest';
import {
  calculateCovariance,
  calculateVolatility,
  calculateMaxDrawdown,
  solveRiskParity,
  calculateCorrelationMatrix,
  stressTestPortfolio,
  AssetReturn,
  RiskBudget,
} from '../services/riskParityEngine';

describe('风险平价引擎', () => {
  const assets: AssetReturn[] = [
    { symbol: '600519.SH', returns: [0.01, 0.02, -0.01, 0.03, 0.01, -0.02, 0.02, 0.01, -0.01, 0.02] },
    { symbol: '000858.SZ', returns: [0.02, 0.01, -0.02, 0.02, 0.02, -0.01, 0.01, 0.02, -0.02, 0.01] },
    { symbol: '300750.SZ', returns: [0.03, 0.04, -0.03, 0.05, 0.01, -0.04, 0.03, 0.02, -0.03, 0.04] },
  ];

  const budgets: RiskBudget[] = [
    { symbol: '600519.SH', targetRisk: 0.33, minWeight: 0.1, maxWeight: 0.6 },
    { symbol: '000858.SZ', targetRisk: 0.33, minWeight: 0.1, maxWeight: 0.6 },
    { symbol: '300750.SZ', targetRisk: 0.34, minWeight: 0.1, maxWeight: 0.6 },
  ];

  describe('协方差计算', () => {
    it('应计算正相关资产的正协方差', () => {
      const cov = calculateCovariance([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
      expect(cov).toBeGreaterThan(0);
    });

    it('应计算负相关资产的负协方差', () => {
      const cov = calculateCovariance([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]);
      expect(cov).toBeLessThan(0);
    });

    it('相同序列协方差应等于方差', () => {
      const seq = [1, 2, 3, 4, 5];
      const cov = calculateCovariance(seq, seq);
      const vol = calculateVolatility(seq);
      expect(cov).toBeCloseTo(vol * vol, 5);
    });

    it('数据不足应返回0', () => {
      expect(calculateCovariance([1], [2])).toBe(0);
    });
  });

  describe('波动率计算', () => {
    it('应计算正波动率', () => {
      const vol = calculateVolatility([0.01, 0.02, -0.01, 0.03]);
      expect(vol).toBeGreaterThan(0);
    });

    it('常数序列波动率应为0', () => {
      expect(calculateVolatility([0.01, 0.01, 0.01])).toBe(0);
    });

    it('空序列应返回0', () => {
      expect(calculateVolatility([])).toBe(0);
    });

    it('单值序列应返回0', () => {
      expect(calculateVolatility([0.05])).toBe(0);
    });
  });

  describe('最大回撤', () => {
    it('应计算最大回撤', () => {
      const dd = calculateMaxDrawdown([0.1, 0.05, -0.1, -0.05, 0.1, 0.05]);
      expect(dd).toBeGreaterThan(0);
    });

    it('全涨无回撤', () => {
      const dd = calculateMaxDrawdown([0.01, 0.02, 0.01, 0.03]);
      expect(dd).toBeCloseTo(0, 5);
    });

    it('空序列应返回0', () => {
      expect(calculateMaxDrawdown([])).toBe(0);
    });

    it('严重下跌应有大回撤', () => {
      const dd = calculateMaxDrawdown([0.1, -0.5, 0.2]);
      expect(dd).toBeGreaterThan(0.4);
    });
  });

  describe('风险平价求解', () => {
    it('应返回权重Map', () => {
      const result = solveRiskParity(assets, budgets);
      expect(result.weights.size).toBe(3);
    });

    it('权重之和应为1', () => {
      const result = solveRiskParity(assets, budgets);
      let sum = 0;
      result.weights.forEach(w => sum += w);
      expect(sum).toBeCloseTo(1, 3);
    });

    it('应返回风险贡献', () => {
      const result = solveRiskParity(assets, budgets);
      expect(result.riskContributions.size).toBe(3);
    });

    it('应返回组合波动率', () => {
      const result = solveRiskParity(assets, budgets);
      expect(result.portfolioVol).toBeGreaterThan(0);
    });

    it('应返回分散化比率', () => {
      const result = solveRiskParity(assets, budgets);
      expect(result.diversificationRatio).toBeGreaterThan(0);
    });

    it('应返回最大回撤', () => {
      const result = solveRiskParity(assets, budgets);
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
    });

    it('空资产应返回零值', () => {
      const result = solveRiskParity([], []);
      expect(result.portfolioVol).toBe(0);
      expect(result.weights.size).toBe(0);
    });

    it('权重应满足约束', () => {
      const result = solveRiskParity(assets, budgets);
      for (const budget of budgets) {
        const w = result.weights.get(budget.symbol) ?? 0;
        expect(w).toBeGreaterThanOrEqual(budget.minWeight - 0.01);
        expect(w).toBeLessThanOrEqual(budget.maxWeight + 0.01);
      }
    });

    it('单资产应全仓', () => {
      const result = solveRiskParity(
        [assets[0]],
        [{ symbol: '600519.SH', targetRisk: 1, minWeight: 0, maxWeight: 1 }]
      );
      expect(result.weights.get('600519.SH')).toBeCloseTo(1, 3);
    });
  });

  describe('相关性矩阵', () => {
    it('应返回方阵', () => {
      const corr = calculateCorrelationMatrix(assets);
      expect(corr.length).toBe(3);
      expect(corr[0].length).toBe(3);
    });

    it('对角线应为1', () => {
      const corr = calculateCorrelationMatrix(assets);
      for (let i = 0; i < 3; i++) {
        expect(corr[i][i]).toBeCloseTo(1, 5);
      }
    });

    it('相关性应在-1到1之间', () => {
      const corr = calculateCorrelationMatrix(assets);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(corr[i][j]).toBeGreaterThanOrEqual(-1);
          expect(corr[i][j]).toBeLessThanOrEqual(1);
        }
      }
    });

    it('矩阵应是对称的', () => {
      const corr = calculateCorrelationMatrix(assets);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(corr[i][j]).toBeCloseTo(corr[j][i], 10);
        }
      }
    });
  });

  describe('压力测试', () => {
    it('应计算压力损失', () => {
      const weights = new Map([['A', 0.5], ['B', 0.5]]);
      const stress = new Map([['A', -0.1], ['B', -0.2]]);
      const result = stressTestPortfolio(weights, stress);
      expect(result.loss).toBeCloseTo(-0.15, 5);
    });

    it('应重新计算压力后权重', () => {
      const weights = new Map([['A', 0.5], ['B', 0.5]]);
      const stress = new Map([['A', -0.2], ['B', 0]]);
      const result = stressTestPortfolio(weights, stress);
      expect(result.stressedWeights.get('A')).toBeLessThan(0.5);
      expect(result.stressedWeights.get('B')).toBeGreaterThan(0.5);
    });

    it('压力后权重之和应为1', () => {
      const weights = new Map([['A', 0.4], ['B', 0.3], ['C', 0.3]]);
      const stress = new Map([['A', -0.1], ['B', 0.05], ['C', -0.03]]);
      const result = stressTestPortfolio(weights, stress);
      let sum = 0;
      result.stressedWeights.forEach(w => sum += w);
      expect(sum).toBeCloseTo(1, 5);
    });

    it('缺失压力值应假设0', () => {
      const weights = new Map([['A', 0.5], ['B', 0.5]]);
      const stress = new Map([['A', -0.1]]);
      const result = stressTestPortfolio(weights, stress);
      expect(result.loss).toBeCloseTo(-0.05, 5);
    });
  });
});
