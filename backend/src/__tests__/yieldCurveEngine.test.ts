import { describe, it, expect } from 'vitest';
import { analyzeYieldCurve, YieldPoint } from '../services/yieldCurveEngine';

describe('YieldCurveEngine', () => {
  const normalCurve: YieldPoint[] = [
    { maturity: 0.25, yield: 1.0 }, { maturity: 1, yield: 2.0 },
    { maturity: 2, yield: 3.0 }, { maturity: 5, yield: 5.0 },
    { maturity: 10, yield: 8.0 }, { maturity: 30, yield: 13.0 },
  ];

  it('returns null for insufficient points', () => {
    expect(analyzeYieldCurve([{ maturity: 1, yield: 2 }])).toBeNull();
  });

  it('returns valid analysis', () => {
    const r = analyzeYieldCurve(normalCurve);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(['normal', 'inverted', 'flat', 'humped']).toContain(r.shape);
  });

  it('detects normal curve', () => {
    const r = analyzeYieldCurve(normalCurve);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.shape).toBe('normal');
    expect(r.slope).toBeGreaterThan(0);
  });

  it('detects inverted curve', () => {
    const inverted: YieldPoint[] = [
      { maturity: 0.25, yield: 6.0 }, { maturity: 2, yield: 5.0 },
      { maturity: 10, yield: 3.5 }, { maturity: 30, yield: 2.0 },
    ];
    const r = analyzeYieldCurve(inverted);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.shape).toBe('inverted');
  });

  it('detects recession signal', () => {
    const inverted: YieldPoint[] = [
      { maturity: 0.25, yield: 6.0 }, { maturity: 2, yield: 5.0 },
      { maturity: 10, yield: 3.0 }, { maturity: 30, yield: 2.0 },
    ];
    const r = analyzeYieldCurve(inverted);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.recessionSignal).toBe(true);
  });

  it('no recession signal for normal curve', () => {
    const r = analyzeYieldCurve(normalCurve);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.recessionSignal).toBe(false);
  });

  it('computes spread10Y2Y', () => {
    const r = analyzeYieldCurve(normalCurve);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.spread10Y2Y).toBeGreaterThan(0);
  });

  it('computes butterfly spread', () => {
    const r = analyzeYieldCurve(normalCurve);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(typeof r.butterfly).toBe('number');
  });

  it('short and long rates are correct', () => {
    const r = analyzeYieldCurve(normalCurve);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.shortRate).toBe(1.0);
    expect(r.longRate).toBe(13.0);
  });

  it('sorts points by maturity', () => {
    const unsorted: YieldPoint[] = [
      { maturity: 10, yield: 8.0 }, { maturity: 2, yield: 3.0 },
      { maturity: 0.25, yield: 1.0 },
    ];
    const r = analyzeYieldCurve(unsorted);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.shortRate).toBe(1.0);
  });

  it('handles flat curve', () => {
    const flat: YieldPoint[] = [
      { maturity: 0.25, yield: 3.0 }, { maturity: 2, yield: 3.05 },
      { maturity: 10, yield: 3.1 }, { maturity: 30, yield: 3.08 },
    ];
    const r = analyzeYieldCurve(flat);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.shape).toBe('flat');
  });

  it('exactly 3 points', () => {
    const r = analyzeYieldCurve([{ maturity: 1, yield: 2 }, { maturity: 5, yield: 3 }, { maturity: 10, yield: 3.5 }]);
    expect(r).not.toBeNull();
  });

  it('curvature is numeric', () => {
    const r = analyzeYieldCurve(normalCurve);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(typeof r.curvature).toBe('number');
  });
});
