import { describe, it, expect } from 'vitest';
import { computeRiskParity, RiskParityInput } from '../utils/riskParityV2Engine';

describe('风险平价引擎', () => {
  const assets: RiskParityInput[] = [
    { code: 'A', returns: Array.from({ length: 60 }, () => -0.02 + Math.random() * 0.04), expectedReturn: 0.08 },
    { code: 'B', returns: Array.from({ length: 60 }, () => -0.03 + Math.random() * 0.06), expectedReturn: 0.10 },
    { code: 'C', returns: Array.from({ length: 60 }, () => -0.01 + Math.random() * 0.02), expectedReturn: 0.05 },
  ];

  it('应该计算权重', () => {
    const result = computeRiskParity(assets);
    expect(result.weights.length).toBe(3);
  });

  it('权重之和应为1', () => {
    const result = computeRiskParity(assets);
    const sum = result.weights.reduce((s, w) => s + w.weight, 0);
    expect(sum).toBeCloseTo(1, 2);
  });

  it('风险贡献应接近均等', () => {
    const result = computeRiskParity(assets);
    const rcs = result.weights.map(w => w.riskContribution);
    const maxRC = Math.max(...rcs);
    const minRC = Math.min(...rcs);
    expect(maxRC - minRC).toBeLessThan(0.15);
  });

  it('应该计算组合风险', () => {
    const result = computeRiskParity(assets);
    expect(result.portfolioRisk).toBeGreaterThan(0);
  });

  it('应该计算组合收益', () => {
    const result = computeRiskParity(assets);
    expect(typeof result.portfolioReturn).toBe('number');
  });

  it('应该计算杠杆', () => {
    const result = computeRiskParity(assets);
    expect(result.leverage).toBeGreaterThan(0);
  });

  it('应该计算分散化比率', () => {
    const result = computeRiskParity(assets);
    expect(result.diversificationRatio).toBeGreaterThan(0);
  });

  it('应该计算夏普比率', () => {
    const result = computeRiskParity(assets);
    expect(typeof result.sharpeRatio).toBe('number');
  });

  it('应该判断是否需要再平衡', () => {
    const result = computeRiskParity(assets);
    expect(typeof result.rebalanceNeeded).toBe('boolean');
  });

  it('应该计算风险预算使用率', () => {
    const result = computeRiskParity(assets);
    expect(result.riskBudgetUsed).toBeGreaterThanOrEqual(0);
  });

  it('空数据应抛出错误', () => {
    expect(() => computeRiskParity([])).toThrow();
  });

  it('自定义预算应工作', () => {
    const result = computeRiskParity(assets, [0.5, 0.3, 0.2]);
    expect(result.weights.length).toBe(3);
  });
});
