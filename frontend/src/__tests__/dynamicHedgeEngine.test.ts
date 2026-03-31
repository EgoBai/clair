import { describe, it, expect } from 'vitest';
import { computeDynamicHedge, OptionPosition, HedgeInstrument, HedgeRequirement } from '../utils/dynamicHedgeEngine';

describe('动态对冲引擎', () => {
  const positions: OptionPosition[] = [
    { code: 'CALL_100', type: 'call', strike: 100, expiry: 30, delta: 0.5, gamma: 0.03, vega: 0.2, theta: -0.05, position: 10, underlyingPrice: 100 },
    { code: 'PUT_95', type: 'put', strike: 95, expiry: 30, delta: -0.3, gamma: 0.02, vega: 0.18, theta: -0.04, position: 5, underlyingPrice: 100 },
  ];

  const instruments: HedgeInstrument[] = [
    { code: 'STOCK', type: 'stock', delta: 1, gamma: 0, vega: 0, costPerUnit: 0.01 },
    { code: 'FUT', type: 'future', delta: 1, gamma: 0, vega: 0, costPerUnit: 0.005 },
    { code: 'ATM_PUT', type: 'option', delta: -0.5, gamma: 0.04, vega: 0.25, costPerUnit: 1.5 },
  ];

  const requirement: HedgeRequirement = {
    targetDelta: 0,
    targetGamma: 0,
    targetVega: 0,
    maxCost: 10000,
    rebalanceThreshold: 50,
  };

  it('应该生成对冲计划', () => {
    const result = computeDynamicHedge(positions, instruments, requirement);
    expect(result.instruments.length).toBeGreaterThan(0);
  });

  it('应该计算总Delta', () => {
    const result = computeDynamicHedge(positions, instruments, requirement);
    expect(typeof result.totalDelta).toBe('number');
  });

  it('应该计算总Gamma', () => {
    const result = computeDynamicHedge(positions, instruments, requirement);
    expect(typeof result.totalGamma).toBe('number');
  });

  it('应该计算总Vega', () => {
    const result = computeDynamicHedge(positions, instruments, requirement);
    expect(typeof result.totalVega).toBe('number');
  });

  it('应该计算总成本', () => {
    const result = computeDynamicHedge(positions, instruments, requirement);
    expect(result.totalCost).toBeGreaterThanOrEqual(0);
    expect(result.totalCost).toBeLessThanOrEqual(requirement.maxCost);
  });

  it('应该计算残差风险', () => {
    const result = computeDynamicHedge(positions, instruments, requirement);
    expect(result.residualRisk.deltaRisk).toBeGreaterThanOrEqual(0);
    expect(result.residualRisk.gammaRisk).toBeGreaterThanOrEqual(0);
    expect(result.residualRisk.vegaRisk).toBeGreaterThanOrEqual(0);
  });

  it('应该判断是否需要再平衡', () => {
    const result = computeDynamicHedge(positions, instruments, requirement);
    expect(typeof result.rebalanceNeeded).toBe('boolean');
  });

  it('应该计算对冲比率', () => {
    const result = computeDynamicHedge(positions, instruments, requirement);
    expect(result.hedgeRatio).toBeGreaterThanOrEqual(0);
    expect(result.hedgeRatio).toBeLessThanOrEqual(1);
  });

  it('每个对冲工具有正确的贡献', () => {
    const result = computeDynamicHedge(positions, instruments, requirement);
    for (const inst of result.instruments) {
      expect(typeof inst.deltaContrib).toBe('number');
      expect(typeof inst.cost).toBe('number');
      expect(inst.cost).toBeGreaterThanOrEqual(0);
    }
  });

  it('空头寸应该返回零对冲', () => {
    const result = computeDynamicHedge([], instruments, requirement);
    expect(result.totalDelta).toBe(0);
    expect(result.instruments.length).toBe(0);
  });

  it('低成本限制应该减少对冲', () => {
    const lowCost: HedgeRequirement = { ...requirement, maxCost: 1 };
    const result = computeDynamicHedge(positions, instruments, lowCost);
    expect(result.totalCost).toBeLessThanOrEqual(1);
  });
});
