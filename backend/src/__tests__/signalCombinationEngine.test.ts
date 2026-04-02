import { describe, it, expect } from 'vitest';
import { weightedCombine, rankNormalize, icWeight, dynamicRebalance } from '../services/signalCombinationEngine';

describe('signalCombinationEngine', () => {
  it('weightedCombine equal weights', () => {
    const r = weightedCombine([[1,2,3], [3,2,1]], [1, 1]);
    expect(r).toEqual([2, 2, 2]);
  });
  it('weightedCombine skewed weights', () => {
    const r = weightedCombine([[10, 0], [0, 10]], [3, 1]);
    expect(r[0]).toBeCloseTo(7.5);
    expect(r[1]).toBeCloseTo(2.5);
  });
  it('weightedCombine empty', () => {
    expect(weightedCombine([], [])).toEqual([]);
  });
  it('weightedCombine single signal', () => {
    expect(weightedCombine([[5, 10]], [1])).toEqual([5, 10]);
  });
  it('rankNormalize maps to [-1, 1]', () => {
    const r = rankNormalize([3, 1, 5, 2, 4]);
    expect(Math.min(...r)).toBeCloseTo(-1);
    expect(Math.max(...r)).toBeCloseTo(1);
  });
  it('rankNormalize constant returns linear ranks', () => {
    const r = rankNormalize([5, 5, 5]);
    expect(r.length).toBe(3);
  });
  it('rankNormalize single element', () => {
    expect(rankNormalize([42])).toEqual([-1]);
  });
  it('icWeight returns correlation values', () => {
    const sig = [[1,2,3,4,5], [5,4,3,2,1]];
    const ret = [1,2,3,4,5];
    const w = icWeight(sig, ret);
    expect(w[0]).toBeCloseTo(1, 1);
    expect(w[1]).toBeCloseTo(-1, 1);
  });
  it('icWeight with zero signal', () => {
    const w = icWeight([[0,0,0]], [1,2,3]);
    expect(w[0]).toBe(0);
  });
  it('icWeight short data', () => {
    expect(icWeight([[1]], [2])).toEqual([0]);
  });
  it('dynamicRebalance no change when within limit', () => {
    const r = dynamicRebalance([0.5, 0.5], [0.6, 0.4], 0.5);
    expect(r).toEqual([0.6, 0.4]);
  });
  it('dynamicRebalance scales when exceeding', () => {
    const r = dynamicRebalance([1, 0], [0, 1], 0.25);
    expect(r[0]).toBeGreaterThan(0);
    expect(r[1]).toBeLessThan(1);
  });
  it('dynamicRebalance at exact limit', () => {
    const r = dynamicRebalance([0.5, 0.5], [0.75, 0.25], 0.25);
    expect(r).toEqual([0.75, 0.25]);
  });
  it('weightedCombine zero weights', () => {
    const r = weightedCombine([[1,2], [3,4]], [0, 0]);
    expect(r).toEqual([0, 0]);
  });
  it('rankNormalize preserves order', () => {
    const r = rankNormalize([10, 30, 20]);
    expect(r[0]).toBeLessThan(r[2]);
    expect(r[2]).toBeLessThan(r[1]);
  });
  it('dynamicRebalance equal weights', () => {
    const r = dynamicRebalance([0.5, 0.5], [0.5, 0.5], 0.1);
    expect(r).toEqual([0.5, 0.5]);
  });
  it('icWeight perfect inverse correlation', () => {
    const w = icWeight([[1,2,3,4,5]], [5,4,3,2,1]);
    expect(w[0]).toBeCloseTo(-1, 1);
  });
  it('weightedCombine three signals', () => {
    const r = weightedCombine([[1],[2],[3]], [1,1,1]);
    expect(r[0]).toBeCloseTo(2);
  });
  it('rankNormalize two elements', () => {
    const r = rankNormalize([1, 2]);
    expect(r).toEqual([-1, 1]);
  });
  it('dynamicRebalance full turnover', () => {
    const r = dynamicRebalance([1, 0], [0, 1], 1.0);
    expect(r[0]).toBeCloseTo(0);
    expect(r[1]).toBeCloseTo(1);
  });
});
