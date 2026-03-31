import { describe, it, expect } from 'vitest';
import { calculatePositionSizes, PositionInput, PositionConstraint } from '../utils/positionSizeEngine';

describe('仓位规模引擎', () => {
  const inputs: PositionInput[] = [
    { code: 'A', currentPrice: 100, atr: 2, winRate: 0.6, avgWin: 0.05, avgLoss: 0.03, volatility: 0.02, correlation: 0.3 },
    { code: 'B', currentPrice: 50, atr: 1.5, winRate: 0.55, avgWin: 0.04, avgLoss: 0.025, volatility: 0.025, correlation: 0.2 },
    { code: 'C', currentPrice: 200, atr: 5, winRate: 0.65, avgWin: 0.06, avgLoss: 0.035, volatility: 0.015, correlation: 0.1 },
  ];

  const constraints: PositionConstraint = {
    maxPositionPct: 0.2,
    maxTotalExposure: 1.0,
    maxDrawdownLimit: 0.15,
    riskPerTrade: 0.02,
    accountSize: 1000000,
  };

  it('应该计算仓位', () => {
    const result = calculatePositionSizes(inputs, constraints);
    expect(result.positions.length).toBe(3);
  });

  it('应该计算Kelly仓位', () => {
    const result = calculatePositionSizes(inputs, constraints);
    for (const p of result.positions) {
      expect(p.kellySize).toBeGreaterThanOrEqual(0);
    }
  });

  it('应该计算ATR止损仓位', () => {
    const result = calculatePositionSizes(inputs, constraints);
    for (const p of result.positions) {
      expect(p.atrBasedSize).toBeGreaterThan(0);
    }
  });

  it('推荐仓位不应超过约束', () => {
    const result = calculatePositionSizes(inputs, constraints);
    for (const p of result.positions) {
      expect(p.dollarAmount).toBeLessThanOrEqual(constraints.accountSize * constraints.maxPositionPct);
    }
  });

  it('总暴露不应超过限制', () => {
    const result = calculatePositionSizes(inputs, constraints);
    expect(result.totalExposure).toBeLessThanOrEqual(constraints.accountSize * constraints.maxTotalExposure * 1.01);
  });

  it('应该计算杠杆率', () => {
    const result = calculatePositionSizes(inputs, constraints);
    expect(result.leverageRatio).toBeGreaterThanOrEqual(0);
  });

  it('应该计算分散化分数', () => {
    const result = calculatePositionSizes(inputs, constraints);
    expect(result.diversificationScore).toBeGreaterThanOrEqual(0);
    expect(result.diversificationScore).toBeLessThanOrEqual(1);
  });

  it('应该计算每笔风险', () => {
    const result = calculatePositionSizes(inputs, constraints);
    for (const p of result.positions) {
      expect(p.riskPct).toBeGreaterThanOrEqual(0);
    }
  });

  it('股数应为整数', () => {
    const result = calculatePositionSizes(inputs, constraints);
    for (const p of result.positions) {
      expect(Number.isInteger(p.shares)).toBe(true);
    }
  });

  it('空数据应抛出错误', () => {
    expect(() => calculatePositionSizes([], constraints)).toThrow();
  });

  it('应该计算总风险', () => {
    const result = calculatePositionSizes(inputs, constraints);
    expect(result.totalRisk).toBeGreaterThanOrEqual(0);
  });

  it('应该计算Kelly分数', () => {
    const result = calculatePositionSizes(inputs, constraints);
    expect(result.kellyFraction).toBeGreaterThanOrEqual(0);
  });
});
