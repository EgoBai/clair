import { describe, it, expect } from 'vitest';
import { optimizeMeanVariance, AssetReturn, OptimizationConstraints } from '../utils/meanVarianceEngine';

describe('均值方差优化引擎', () => {
  const makeReturns = (n: number): AssetReturn[] =>
    Array.from({ length: n }, (_, i) => ({
      code: `ASSET${i}`,
      returns: Array.from({ length: 60 }, () => -0.05 + Math.random() * 0.1),
      expectedReturn: 0.03 + Math.random() * 0.1,
    }));

  const constraints: OptimizationConstraints = {
    minWeight: 0,
    maxWeight: 0.5,
    riskFreeRate: 0.02,
  };

  const assets = makeReturns(5);

  it('应该返回权重', () => {
    const result = optimizeMeanVariance(assets, constraints);
    expect(result.weights.length).toBe(5);
  });

  it('权重之和应为1', () => {
    const result = optimizeMeanVariance(assets, constraints);
    const sum = result.weights.reduce((s, w) => s + w.weight, 0);
    expect(sum).toBeCloseTo(1, 2);
  });

  it('权重应在约束范围内', () => {
    const result = optimizeMeanVariance(assets, constraints);
    for (const w of result.weights) {
      expect(w.weight).toBeGreaterThanOrEqual(constraints.minWeight);
      expect(w.weight).toBeLessThanOrEqual(constraints.maxWeight);
    }
  });

  it('应该计算夏普比率', () => {
    const result = optimizeMeanVariance(assets, constraints);
    expect(typeof result.sharpeRatio).toBe('number');
  });

  it('应该计算预期收益和风险', () => {
    const result = optimizeMeanVariance(assets, constraints);
    expect(typeof result.expectedReturn).toBe('number');
    expect(result.expectedRisk).toBeGreaterThanOrEqual(0);
  });

  it('应该计算风险贡献', () => {
    const result = optimizeMeanVariance(assets, constraints);
    for (const w of result.weights) {
      expect(typeof w.riskContribution).toBe('number');
    }
  });

  it('应该计算分散化比率', () => {
    const result = optimizeMeanVariance(assets, constraints);
    expect(result.diversificationRatio).toBeGreaterThan(0);
  });

  it('应该计算换手率', () => {
    const prev = { ASSET0: 0.2, ASSET1: 0.2, ASSET2: 0.2, ASSET3: 0.2, ASSET4: 0.2 };
    const result = optimizeMeanVariance(assets, constraints, prev);
    expect(result.turnover).toBeGreaterThanOrEqual(0);
  });

  it('应该生成有效前沿', () => {
    const result = optimizeMeanVariance(assets, constraints);
    expect(result.efficientFrontier.length).toBeGreaterThan(0);
  });

  it('空数据应抛出错误', () => {
    expect(() => optimizeMeanVariance([], constraints)).toThrow();
  });

  it('应该计算风险贡献之和等于总风险', () => {
    const result = optimizeMeanVariance(assets, constraints);
    const totalRC = result.weights.reduce((s, w) => s + w.riskContribution, 0);
    expect(totalRC).toBeCloseTo(result.expectedRisk, 1);
  });

  it('单一资产应给出100%权重', () => {
    const single = [assets[0]];
    const result = optimizeMeanVariance(single, constraints);
    expect(result.weights[0].weight).toBeCloseTo(1, 2);
  });
});
