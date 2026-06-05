import { describe, it, expect } from 'vitest';
import {
  optimizeMeanVariance,
  blackLitterman,
  calculateTurnover,
  riskBudgeting,
  AssetInfo,
} from '../services/portfolioOptimizerEngine';

describe('组合优化引擎', () => {
  const assets: AssetInfo[] = [
    { symbol: 'A', expectedReturn: 0.10, volatility: 0.15, weight: 0.33 },
    { symbol: 'B', expectedReturn: 0.08, volatility: 0.12, weight: 0.33 },
    { symbol: 'C', expectedReturn: 0.12, volatility: 0.20, weight: 0.34 },
  ];
  const covMatrix = [
    [0.0225, 0.009, 0.015],
    [0.009, 0.0144, 0.012],
    [0.015, 0.012, 0.04],
  ];

  describe('均值方差优化', () => {
    it('应返回权重Map', () => {
      const result = optimizeMeanVariance(assets, covMatrix);
      expect(result.weights.size).toBe(3);
    });

    it('权重之和应为1', () => {
      const result = optimizeMeanVariance(assets, covMatrix);
      let sum = 0;
      result.weights.forEach(w => sum += w);
      expect(sum).toBeCloseTo(1, 3);
    });

    it('应有预期收益', () => {
      const result = optimizeMeanVariance(assets, covMatrix);
      expect(result.expectedReturn).toBeGreaterThan(0);
    });

    it('应有预期风险', () => {
      const result = optimizeMeanVariance(assets, covMatrix);
      expect(result.expectedRisk).toBeGreaterThan(0);
    });

    it('应有夏普比率', () => {
      const result = optimizeMeanVariance(assets, covMatrix);
      expect(typeof result.sharpeRatio).toBe('number');
    });

    it('应有有效前沿', () => {
      const result = optimizeMeanVariance(assets, covMatrix);
      expect(result.efficientFrontier.length).toBeGreaterThan(0);
    });

    it('空资产应返回零值', () => {
      const result = optimizeMeanVariance([], []);
      expect(result.weights.size).toBe(0);
      expect(result.expectedReturn).toBe(0);
    });

    it('约束应生效', () => {
      const result = optimizeMeanVariance(assets, covMatrix, 0.02, { minWeight: 0.1, maxWeight: 0.6 });
      result.weights.forEach(w => {
        expect(w).toBeGreaterThanOrEqual(0.09);
        expect(w).toBeLessThanOrEqual(0.61);
      });
    });

    it('高夏普资产应有高权重', () => {
      const result = optimizeMeanVariance(assets, covMatrix);
      const weights = Array.from(result.weights.values());
      // At least one weight should be > 1/n
      expect(Math.max(...weights)).toBeGreaterThan(1 / 3 - 0.01);
    });

    it('有效前沿点应有风险和收益', () => {
      const result = optimizeMeanVariance(assets, covMatrix);
      for (const point of result.efficientFrontier) {
        expect(point.risk).toBeGreaterThanOrEqual(0);
        expect(typeof point.return).toBe('number');
      }
    });

    it('自定义无风险利率应影响夏普', () => {
      const r1 = optimizeMeanVariance(assets, covMatrix, 0.01);
      const r2 = optimizeMeanVariance(assets, covMatrix, 0.05);
      expect(r1.sharpeRatio).not.toBeCloseTo(r2.sharpeRatio, 2);
    });
  });

  describe('Black-Litterman', () => {
    const marketWeights = new Map([['A', 0.4], ['B', 0.35], ['C', 0.25]]);

    it('应返回调整后权重', () => {
      const result = blackLitterman(marketWeights, covMatrix, []);
      expect(result.size).toBe(3);
    });

    it('无观点应接近市场权重', () => {
      const result = blackLitterman(marketWeights, covMatrix, []);
      let sum = 0;
      result.forEach(w => sum += w);
      expect(sum).toBeCloseTo(1, 2);
    });

    it('有观点应调整权重', () => {
      const views = [{
        assets: ['A'],
        weights: [1],
        expectedReturn: 0.15,
        confidence: 0.8,
      }];
      const result = blackLitterman(marketWeights, covMatrix, views);
      expect(result.get('A')).toBeGreaterThan(0);
    });

    it('空Map应返回空', () => {
      const result = blackLitterman(new Map(), [], []);
      expect(result.size).toBe(0);
    });

    it('权重应为正', () => {
      const views = [{
        assets: ['A', 'B'],
        weights: [1, -1],
        expectedReturn: 0.05,
        confidence: 0.5,
      }];
      const result = blackLitterman(marketWeights, covMatrix, views);
      result.forEach(w => expect(w).toBeGreaterThan(0));
    });
  });

  describe('换手率计算', () => {
    it('相同权重应有0换手', () => {
      const w = new Map([['A', 0.5], ['B', 0.5]]);
      expect(calculateTurnover(w, w)).toBe(0);
    });

    it('完全调仓应有100%换手', () => {
      const old = new Map([['A', 1.0]]);
      const nw = new Map([['B', 1.0]]);
      expect(calculateTurnover(old, nw)).toBeCloseTo(1, 5);
    });

    it('部分调仓应有中间值', () => {
      const old = new Map([['A', 0.6], ['B', 0.4]]);
      const nw = new Map([['A', 0.4], ['B', 0.6]]);
      expect(calculateTurnover(old, nw)).toBeCloseTo(0.2, 5);
    });

    it('空Map应返回0', () => {
      expect(calculateTurnover(new Map(), new Map())).toBe(0);
    });

    it('新增标的应计算在内', () => {
      const old = new Map([['A', 1.0]]);
      const nw = new Map([['A', 0.5], ['B', 0.5]]);
      expect(calculateTurnover(old, nw)).toBe(0.5);
    });
  });

  describe('风险预算', () => {
    it('应返回权重Map', () => {
      const result = riskBudgeting(assets, covMatrix, [1, 1, 1]);
      expect(result.size).toBe(3);
    });

    it('权重之和应为1', () => {
      const result = riskBudgeting(assets, covMatrix, [1, 1, 1]);
      let sum = 0;
      result.forEach(w => sum += w);
      expect(sum).toBeCloseTo(1, 2);
    });

    it('不等预算应调整权重', () => {
      const result = riskBudgeting(assets, covMatrix, [2, 1, 1]);
      expect(result.get('A')).toBeGreaterThan(0);
    });

    it('空资产应返回空', () => {
      const result = riskBudgeting([], [], []);
      expect(result.size).toBe(0);
    });

    it('权重应为正', () => {
      const result = riskBudgeting(assets, covMatrix, [1, 2, 3]);
      result.forEach(w => expect(w).toBeGreaterThan(0));
    });
  });
});
