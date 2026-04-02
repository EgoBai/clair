import { describe, it, expect } from 'vitest';
import { calcEP, calcBP, calcSP, calcCFOP, compositeValueScore, valueWithQuality, rankValueFactors, ValuationData } from '../services/valueFactorEngine';

const d: ValuationData = { code: 'A', pe: 10, pb: 2, ps: 3, pcf: 8, roe: 0.15, roa: 0.1, grossMargin: 0.4 };

describe('valueFactorEngine', () => {
  it('calcEP inverse of PE', () => { expect(calcEP(10)).toBeCloseTo(0.1); });
  it('calcEP zero/negative PE', () => { expect(calcEP(0)).toBe(0); expect(calcEP(-5)).toBe(0); });
  it('calcBP inverse of PB', () => { expect(calcBP(2)).toBeCloseTo(0.5); });
  it('calcSP inverse of PS', () => { expect(calcSP(5)).toBeCloseTo(0.2); });
  it('calcCFOP inverse of PCF', () => { expect(calcCFOP(10)).toBeCloseTo(0.1); });
  it('compositeValueScore positive', () => { expect(compositeValueScore(d)).toBeGreaterThan(0); });
  it('compositeValueScore weighted sum', () => {
    const s = compositeValueScore(d);
    const expected = 0.1 * 0.3 + 0.5 * 0.25 + (1/3) * 0.2 + 0.125 * 0.25;
    expect(s).toBeCloseTo(expected, 3);
  });
  it('valueWithQuality higher for high quality', () => {
    const high = { ...d, roe: 0.3, roa: 0.2, grossMargin: 0.6 };
    const low = { ...d, roe: 0.05, roa: 0.02, grossMargin: 0.1 };
    expect(valueWithQuality(high)).toBeGreaterThan(valueWithQuality(low));
  });
  it('rankValueFactors returns correct size', () => {
    const data = [d, { ...d, code: 'B', pe: 20 }, { ...d, code: 'C', pe: 5 }];
    expect(rankValueFactors(data).size).toBe(3);
  });
  it('rankValueFactors best gets rank 1', () => {
    const data = [{ ...d, code: 'X', pe: 5 }, { ...d, code: 'Y', pe: 50 }];
    const ranks = rankValueFactors(data);
    expect(ranks.get('X')).toBe(1);
  });
  it('calcEP very large PE', () => { expect(calcEP(1e10)).toBeCloseTo(1e-10); });
  it('calcBP negative PB', () => { expect(calcBP(-1)).toBe(0); });
  it('compositeValueScore with zero multiples', () => {
    expect(compositeValueScore({ code: 'Z', pe: 0, pb: 0, ps: 0, pcf: 0, roe: 0, roa: 0, grossMargin: 0 })).toBe(0);
  });
  it('valueWithQuality base quality', () => {
    const v = valueWithQuality({ ...d, roe: 0, roa: 0, grossMargin: 0 });
    expect(v).toBeCloseTo(compositeValueScore(d));
  });
  it('rankValueFactors single stock', () => {
    const ranks = rankValueFactors([d]);
    expect(ranks.get('A')).toBe(1);
  });
  it('calcSP zero PS', () => { expect(calcSP(0)).toBe(0); });
  it('calcCFOP negative PCF', () => { expect(calcCFOP(-5)).toBe(0); });
  it('compositeValueScore with perfect values', () => {
    const d2: ValuationData = { code: 'B', pe: 1, pb: 1, ps: 1, pcf: 1, roe: 0.5, roa: 0.3, grossMargin: 0.8 };
    expect(compositeValueScore(d2)).toBeCloseTo(1);
  });
  it('rankValueFactors tie handling', () => {
    const data = [{ ...d, code: 'A' }, { ...d, code: 'B' }];
    const ranks = rankValueFactors(data);
    expect(ranks.size).toBe(2);
  });
  it('valueWithQuality negative quality', () => {
    const d2 = { ...d, roe: -0.2, roa: -0.1, grossMargin: -0.3 };
    expect(valueWithQuality(d2)).toBeLessThan(compositeValueScore(d));
  });
});
