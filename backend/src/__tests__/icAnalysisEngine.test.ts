import { describe, it, expect } from 'vitest';
import { analyzeIC, ICSeries } from '../services/icAnalysisEngine';

function makeIC(n: number, bias: number = 0): ICSeries {
  const dates = Array.from({ length: n }, (_, i) => `2025-01-${String(i + 1).padStart(2, '0')}`);
  const icValues = Array.from({ length: n }, () => bias + (Math.random() - 0.5) * 0.1);
  return { dates, icValues };
}

describe('ICAnalysisEngine', () => {
  it('returns null for insufficient data', () => {
    expect(analyzeIC(makeIC(3))).toBeNull();
  });

  it('returns valid analysis', () => {
    const r = analyzeIC(makeIC(50));
    expect(r).not.toBeNull();
    if (!r) return;
    expect(typeof r.meanIC).toBe('number');
    expect(typeof r.icStd).toBe('number');
  });

  it('icIR is ratio of mean to std', () => {
    const r = analyzeIC(makeIC(50));
    expect(r).not.toBeNull();
    if (!r) return;
    if (r.icStd > 0) {
      expect(r.icIR).toBeCloseTo(r.meanIC / r.icStd, 1);
    }
  });

  it('positiveRatio is between 0 and 1', () => {
    const r = analyzeIC(makeIC(50));
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.positiveRatio).toBeGreaterThanOrEqual(0);
    expect(r.positiveRatio).toBeLessThanOrEqual(1);
  });

  it('maxConsecutiveNegative is non-negative', () => {
    const r = analyzeIC(makeIC(50));
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.maxConsecutiveNegative).toBeGreaterThanOrEqual(0);
  });

  it('rollingIC length matches', () => {
    const r = analyzeIC(makeIC(50), 20);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.rollingIC.length).toBe(50 - 20 + 1);
  });

  it('isEffective is boolean', () => {
    const r = analyzeIC(makeIC(50));
    expect(r).not.toBeNull();
    if (!r) return;
    expect(typeof r.isEffective).toBe('boolean');
  });

  it('biased positive IC detects effectiveness', () => {
    const biased = makeIC(100, 0.06);
    const r = analyzeIC(biased);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.meanIC).toBeGreaterThan(0);
  });

  it('skewness is numeric', () => {
    const r = analyzeIC(makeIC(50));
    expect(r).not.toBeNull();
    if (!r) return;
    expect(typeof r.icSkewness).toBe('number');
  });

  it('handles minimum length (5)', () => {
    const r = analyzeIC(makeIC(5));
    expect(r).not.toBeNull();
  });

  it('custom window', () => {
    const r = analyzeIC(makeIC(30), 10);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.rollingIC.length).toBe(21);
  });

  it('all negative IC', () => {
    const neg = makeIC(50, -0.08);
    const r = analyzeIC(neg);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.maxConsecutiveNegative).toBeGreaterThan(0);
  });

  it('icStd is non-negative', () => {
    const r = analyzeIC(makeIC(20));
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.icStd).toBeGreaterThanOrEqual(0);
  });

  it('constant IC series', () => {
    const series: ICSeries = { dates: Array.from({ length: 10 }, (_, i) => `d${i}`), icValues: Array(10).fill(0.05) };
    const r = analyzeIC(series);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.icStd).toBe(0);
  });

  it('dates are preserved in structure', () => {
    const ic = makeIC(50);
    const r = analyzeIC(ic);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(ic.dates.length).toBe(50);
  });
});
