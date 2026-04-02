import { describe, it, expect } from 'vitest';
import { applyScenario, multiScenarioTest, worstCase, stressVaR, historicalScenario, Scenario } from '../services/stressTestEngine';

const portfolio = new Map([['A', 0.5], ['B', 0.3], ['C', 0.2]]);
const crash: Scenario = { name: 'crash', shocks: new Map([['A', -0.3], ['B', -0.2], ['C', -0.1]]) };
const rally: Scenario = { name: 'rally', shocks: new Map([['A', 0.2], ['B', 0.1], ['C', 0.15]]) };

describe('stressTestEngine', () => {
  it('applyScenario computes weighted shock', () => {
    const pnl = applyScenario(portfolio, crash);
    expect(pnl).toBeCloseTo(-0.23);
  });
  it('applyScenario with missing shock uses 0', () => {
    const s: Scenario = { name: 'partial', shocks: new Map([['A', -0.5]]) };
    expect(applyScenario(portfolio, s)).toBeCloseTo(-0.25);
  });
  it('multiScenarioTest returns all scenarios', () => {
    const results = multiScenarioTest(portfolio, [crash, rally]);
    expect(results.size).toBe(2);
  });
  it('worstCase finds minimum', () => {
    const w = worstCase(portfolio, [crash, rally]);
    expect(w.name).toBe('crash');
    expect(w.pnl).toBeLessThan(0);
  });
  it('worstCase with single scenario', () => {
    const w = worstCase(portfolio, [rally]);
    expect(w.name).toBe('rally');
  });
  it('stressVaR at 95%', () => {
    const ret = Array.from({ length: 100 }, (_, i) => (i - 50) * 0.001);
    const var95 = stressVaR(ret, 0.95);
    expect(var95).toBeGreaterThan(0);
  });
  it('stressVaR empty returns 0', () => {
    expect(stressVaR([], 0.95)).toBe(0);
  });
  it('stressVaR all positive returns', () => {
    const ret = Array(100).fill(0.01);
    expect(stressVaR(ret, 0.95)).toBeCloseTo(-0.01);
  });
  it('stressVaR 100% confidence', () => {
    const ret = [-0.1, -0.05, 0.01, 0.02];
    expect(stressVaR(ret, 1.0)).toBe(0.1);
  });
  it('historicalScenario sums returns', () => {
    const rets = new Map([['A', [0.01, -0.02, 0.03, 0.04]]]);
    const h = historicalScenario(rets, 1, 2);
    expect(h.get('A')).toBeCloseTo(0.01);
  });
  it('historicalScenario single day', () => {
    const rets = new Map([['A', [0.01, -0.02, 0.03]]]);
    expect(historicalScenario(rets, 1, 1).get('A')).toBeCloseTo(-0.02);
  });
  it('applyScenario empty portfolio', () => {
    expect(applyScenario(new Map(), crash)).toBe(0);
  });
  it('multiScenarioTest empty scenarios', () => {
    expect(multiScenarioTest(portfolio, []).size).toBe(0);
  });
  it('worstCase all positive', () => {
    const w = worstCase(portfolio, [rally]);
    expect(w.pnl).toBeGreaterThan(0);
  });
  it('stressVaR 50% confidence', () => {
    const ret = [-0.1, -0.05, 0.0, 0.05, 0.1];
    expect(stressVaR(ret, 0.5)).toBeGreaterThanOrEqual(0);
  });
  it('historicalScenario multiple assets', () => {
    const rets = new Map([['A', [0.01, 0.02]], ['B', [-0.01, -0.02]]]);
    const h = historicalScenario(rets, 0, 1);
    expect(h.get('A')).toBeCloseTo(0.03);
    expect(h.get('B')).toBeCloseTo(-0.03);
  });
  it('applyScenario positive shock', () => {
    expect(applyScenario(portfolio, rally)).toBeGreaterThan(0);
  });
  it('stressVaR exact boundary', () => {
    const ret = [-0.05, -0.03, -0.01, 0.01, 0.03];
    const v = stressVaR(ret, 0.8);
    expect(v).toBeGreaterThan(0);
  });
  it('historicalScenario full range', () => {
    const rets = new Map([['A', [1, 2, 3, 4, 5]]]);
    expect(historicalScenario(rets, 0, 4).get('A')).toBe(15);
  });
  it('worstCase tied scenarios', () => {
    const s1: Scenario = { name: 'a', shocks: new Map([['A', -0.1]]) };
    const s2: Scenario = { name: 'b', shocks: new Map([['A', -0.1]]) };
    const w = worstCase(new Map([['A', 1.0]]), [s1, s2]);
    expect(w.pnl).toBeCloseTo(-0.1);
  });
});
