import { describe, it, expect } from 'vitest';
import { rollingCorrelation, pearsonCorr, avgCorrelation, regimeClassification } from '../services/correlationRegimeEngine';

describe('correlationRegimeEngine', () => {
  it('pearsonCorr perfect positive', () => {
    expect(pearsonCorr([1,2,3,4,5], [2,4,6,8,10])).toBeCloseTo(1);
  });
  it('pearsonCorr perfect negative', () => {
    expect(pearsonCorr([1,2,3,4,5], [10,8,6,4,2])).toBeCloseTo(-1);
  });
  it('pearsonCorr uncorrelated', () => {
    expect(pearsonCorr([1,1,1,1], [1,2,3,4])).toBe(0);
  });
  it('pearsonCorr single element', () => {
    expect(pearsonCorr([1], [2])).toBe(0);
  });
  it('pearsonCorr identical series', () => {
    expect(pearsonCorr([3,3,3], [3,3,3])).toBe(0);
  });
  it('rollingCorrelation correct length', () => {
    const r = rollingCorrelation(Array(50).fill(1).map((_, i) => i), Array(50).fill(1).map((_, i) => i * 2), 10);
    expect(r.length).toBe(41);
  });
  it('rollingCorrelation values near 1 for linear', () => {
    const r = rollingCorrelation(Array(50).fill(1).map((_, i) => i), Array(50).fill(1).map((_, i) => i * 2), 10);
    r.forEach(v => { expect(v).toBeCloseTo(1, 1); });
  });
  it('rollingCorrelation short series', () => {
    expect(rollingCorrelation([1,2], [3,4], 5).length).toBe(0);
  });
  it('avgCorrelation positive for correlated', () => {
    const data = [[1,2,3,4,5], [2,4,6,8,10], [3,6,9,12,15]];
    expect(avgCorrelation(data)).toBeCloseTo(1, 1);
  });
  it('avgCorrelation single asset', () => {
    expect(avgCorrelation([[1,2,3]])).toBe(0);
  });
  it('avgCorrelation empty', () => {
    expect(avgCorrelation([])).toBe(0);
  });
  it('regimeClassification CRISIS', () => {
    expect(regimeClassification(0.8)).toBe('CRISIS');
  });
  it('regimeClassification RISK_ON', () => {
    expect(regimeClassification(0.5)).toBe('RISK_ON');
  });
  it('regimeClassification NORMAL', () => {
    expect(regimeClassification(0.2)).toBe('NORMAL');
  });
  it('regimeClassification DIVERSIFIED', () => {
    expect(regimeClassification(0.0)).toBe('DIVERSIFIED');
  });
  it('regimeClassification EXTREME_NEGATIVE', () => {
    expect(regimeClassification(-0.5)).toBe('EXTREME_NEGATIVE');
  });
  it('pearsonCorr with constant x', () => {
    expect(pearsonCorr([5,5,5,5], [1,2,3,4])).toBe(0);
  });
  it('rollingCorrelation anti-correlated', () => {
    const r = rollingCorrelation([1,2,3,4,5,6,7,8], [8,7,6,5,4,3,2,1], 4);
    r.forEach(v => { expect(v).toBeLessThan(0); });
  });
  it('avgCorrelation two assets negative', () => {
    const data = [[1,2,3,4,5], [5,4,3,2,1]];
    expect(avgCorrelation(data)).toBeCloseTo(-1, 1);
  });
  it('regimeClassification boundary at 0.7', () => {
    expect(regimeClassification(0.7)).toBe('RISK_ON');
    expect(regimeClassification(0.71)).toBe('CRISIS');
  });
});
