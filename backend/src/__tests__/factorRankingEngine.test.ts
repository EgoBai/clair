import { describe, it, expect } from 'vitest';
import { rankAndGroup, FactorData } from '../services/factorRankingEngine';

function makeData(n: number): FactorData[] {
  return Array.from({ length: n }, (_, i) => ({
    stockId: `s${i}`,
    factorValue: Math.random() * 10,
    forwardReturn: (Math.random() - 0.5) * 0.1,
  }));
}

describe('FactorRankingEngine', () => {
  it('returns null for insufficient data', () => {
    expect(rankAndGroup(makeData(3), 5)).toBeNull();
  });

  it('returns valid result', () => {
    const r = rankAndGroup(makeData(20), 5);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.groups.length).toBe(5);
  });

  it('groups have correct structure', () => {
    const r = rankAndGroup(makeData(20), 5);
    expect(r).not.toBeNull();
    if (!r) return;
    for (const g of r.groups) {
      expect(typeof g.group).toBe('number');
      expect(typeof g.avgReturn).toBe('number');
      expect(typeof g.count).toBe('number');
    }
  });

  it('all stocks are assigned', () => {
    const data = makeData(15);
    const r = rankAndGroup(data, 3);
    expect(r).not.toBeNull();
    if (!r) return;
    const total = r.groups.reduce((s, g) => s + g.count, 0);
    expect(total).toBe(15);
  });

  it('longShortReturn is computed', () => {
    const r = rankAndGroup(makeData(20), 5);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(typeof r.longShortReturn).toBe('number');
  });

  it('topGroup is 1', () => {
    const r = rankAndGroup(makeData(10), 5);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.topGroup).toBe(1);
  });

  it('bottomGroup equals numGroups', () => {
    const r = rankAndGroup(makeData(10), 5);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.bottomGroup).toBe(5);
  });

  it('ic is between -1 and 1', () => {
    const r = rankAndGroup(makeData(50), 5);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.ic).toBeGreaterThanOrEqual(-1);
    expect(r.ic).toBeLessThanOrEqual(1);
  });

  it('monotonicity is boolean', () => {
    const r = rankAndGroup(makeData(20), 5);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(typeof r.monotonicity).toBe('boolean');
  });

  it('custom numGroups', () => {
    const r = rankAndGroup(makeData(30), 3);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.groups.length).toBe(3);
  });

  it('sorted by factor descending', () => {
    const data: FactorData[] = [
      { stockId: 'high', factorValue: 10, forwardReturn: 0.05 },
      { stockId: 'mid', factorValue: 5, forwardReturn: 0.02 },
      { stockId: 'low', factorValue: 1, forwardReturn: -0.01 },
    ];
    const r = rankAndGroup(data, 3);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.groups[0].avgReturn).toBe(0.05);
  });

  it('handles 2 groups', () => {
    const r = rankAndGroup(makeData(10), 2);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.groups.length).toBe(2);
  });

  it('positive factor-return correlation gives positive IC', () => {
    const data: FactorData[] = Array.from({ length: 20 }, (_, i) => ({
      stockId: `s${i}`, factorValue: i, forwardReturn: i * 0.01,
    }));
    const r = rankAndGroup(data, 5);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.ic).toBeGreaterThan(0.5);
  });

  it('handles minimum data', () => {
    const r = rankAndGroup(makeData(5), 5);
    expect(r).not.toBeNull();
  });

  it('group numbers are sequential', () => {
    const r = rankAndGroup(makeData(10), 5);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.groups.map(g => g.group)).toEqual([1, 2, 3, 4, 5]);
  });
});
