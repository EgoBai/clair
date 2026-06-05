import { describe, it, expect } from 'vitest';
import {
  estimateCost, costAsPct, optimalExecutionSlice, compareExecutionStrategies, CostParams
} from '../services/transactionCostEngine';

const params: CostParams = { commission: 0.0003, slippageBps: 5, impactCoeff: 0.1 };

describe('transactionCostEngine', () => {
  it('cost is positive', () => {
    expect(estimateCost(1000, 10, 100000, params)).toBeGreaterThan(0);
  });
  it('cost scales with volume', () => {
    const c1 = estimateCost(1000, 10, 100000, params);
    const c2 = estimateCost(2000, 10, 100000, params);
    expect(c2).toBeGreaterThan(c1);
  });
  it('zero volume gives zero cost', () => {
    expect(estimateCost(0, 10, 100000, params)).toBe(0);
  });
  it('cost includes commission', () => {
    const c = estimateCost(1000, 10, 100000, params);
    const commissionOnly = 1000 * 10 * params.commission;
    expect(c).toBeGreaterThanOrEqual(commissionOnly);
  });
  it('costAsPct returns small fraction', () => {
    const pct = costAsPct(1000, 10, 100000, params);
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(0.05);
  });
  it('costAsPct with zero value', () => {
    expect(costAsPct(0, 10, 100000, params)).toBe(0);
  });
  it('costAsPct with zero ADV still works', () => {
    const pct = costAsPct(1000, 10, 0, params);
    expect(pct).toBeGreaterThan(0);
  });
  it('optimalExecutionSlice splits correctly', () => {
    const slices = optimalExecutionSlice(5000, 10000, 0.1);
    expect(slices.length).toBe(5);
    expect(slices.reduce((a, b) => a + b, 0)).toBe(5000);
  });
  it('optimalExecutionSlice with small order', () => {
    const slices = optimalExecutionSlice(100, 10000, 0.1);
    expect(slices.length).toBe(1);
    expect(slices[0]).toBe(100);
  });
  it('optimalExecutionSlice with zero ADV', () => {
    const slices = optimalExecutionSlice(1000, 0, 0.1);
    expect(slices).toEqual([1000]);
  });
  it('optimalExecutionSlice max slice equals adv*maxPart', () => {
    const slices = optimalExecutionSlice(100000, 10000, 0.2);
    expect(slices[0]).toBe(2000);
  });
  it('compareExecutionStrategies returns 3 strategies', () => {
    const r = compareExecutionStrategies(1000, 10, 100000, params);
    expect(r).toHaveProperty('aggressive');
    expect(r).toHaveProperty('passive');
    expect(r).toHaveProperty('optimal');
  });
  it('aggressive cost >= optimal cost', () => {
    const r = compareExecutionStrategies(1000, 10, 100000, params);
    expect(r.aggressive).toBeGreaterThanOrEqual(r.optimal);
  });
  it('higher impact coeff increases cost', () => {
    const p1 = { ...params, impactCoeff: 0.01 };
    const p2 = { ...params, impactCoeff: 1.0 };
    expect(estimateCost(10000, 10, 100000, p2)).toBeGreaterThan(estimateCost(10000, 10, 100000, p1));
  });
  it('higher slippage increases cost', () => {
    const p1 = { ...params, slippageBps: 1 };
    const p2 = { ...params, slippageBps: 50 };
    expect(estimateCost(1000, 10, 100000, p2)).toBeGreaterThan(estimateCost(1000, 10, 100000, p1));
  });
  it('optimalExecutionSlice with exact boundary', () => {
    const slices = optimalExecutionSlice(1000, 1000, 1.0);
    expect(slices).toEqual([1000]);
  });
  it('cost increases with participation', () => {
    const c1 = estimateCost(10000, 10, 1000000, params);
    const c2 = estimateCost(10000, 10, 50000, params);
    expect(c2).toBeGreaterThan(c1);
  });
  it('zero price gives zero cost', () => {
    expect(estimateCost(1000, 0, 100000, params)).toBe(0);
  });
  it('optimalExecutionSlice with zero shares', () => {
    const slices = optimalExecutionSlice(0, 1000, 0.1);
    expect(slices.length).toBe(0);
  });
  it('compareExecutionStrategies all positive', () => {
    const r = compareExecutionStrategies(5000, 20, 100000, params);
    expect(r.aggressive).toBeGreaterThan(0);
    expect(r.passive).toBeGreaterThan(0);
    expect(r.optimal).toBeGreaterThan(0);
  });
});
