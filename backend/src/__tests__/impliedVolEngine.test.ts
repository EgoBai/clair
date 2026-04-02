import { describe, it, expect } from 'vitest';
import { normCDF, bsmPrice, impliedVol, volatilitySmile } from '../services/impliedVolEngine';

describe('impliedVolEngine', () => {
  it('normCDF(0) = 0.5', () => { expect(normCDF(0)).toBeCloseTo(0.5); });
  it('normCDF(1.96) ≈ 0.975', () => { expect(normCDF(1.96)).toBeCloseTo(0.975, 2); });
  it('normCDF(-1.96) ≈ 0.025', () => { expect(normCDF(-1.96)).toBeCloseTo(0.025, 2); });
  it('bsmPrice ATM call', () => {
    const p = bsmPrice(100, 100, 1, 0.05, 0.2, true);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(100);
  });
  it('bsmPrice ATM put', () => {
    const p = bsmPrice(100, 100, 1, 0.05, 0.2, false);
    expect(p).toBeGreaterThan(0);
  });
  it('bsmPrice zero vol ITM call', () => { expect(bsmPrice(110, 100, 1, 0.05, 0, true)).toBeCloseTo(10); });
  it('bsmPrice zero vol OTM call', () => { expect(bsmPrice(90, 100, 1, 0.05, 0, true)).toBe(0); });
  it('bsmPrice put-call parity', () => {
    const c = bsmPrice(100, 100, 1, 0.05, 0.2, true);
    const p = bsmPrice(100, 100, 1, 0.05, 0.2, false);
    expect(c - p).toBeCloseTo(100 - 100 * Math.exp(-0.05), 1);
  });
  it('impliedVol recovers sigma', () => {
    const target = 0.25;
    const price = bsmPrice(100, 100, 1, 0.05, target, true);
    const iv = impliedVol(price, 100, 100, 1, 0.05, true);
    expect(iv).toBeCloseTo(target, 3);
  });
  it('impliedVol for put', () => {
    const target = 0.3;
    const price = bsmPrice(100, 100, 1, 0.05, target, false);
    const iv = impliedVol(price, 100, 100, 1, 0.05, false);
    expect(iv).toBeCloseTo(target, 3);
  });
  it('volatilitySmile returns array', () => {
    const strikes = [90, 95, 100, 105, 110];
    const prices = strikes.map(K => bsmPrice(100, K, 1, 0.05, 0.2, true));
    const smile = volatilitySmile(strikes, prices, 100, 1, 0.05, true);
    expect(smile.length).toBe(5);
  });
  it('bsmPrice expired option', () => { expect(bsmPrice(110, 100, 0, 0.05, 0.2, true)).toBe(10); });
  it('normCDF large positive', () => { expect(normCDF(5)).toBeCloseTo(1, 3); });
  it('normCDF large negative', () => { expect(normCDF(-5)).toBeCloseTo(0, 3); });
  it('bsmPrice high vol', () => {
    const p = bsmPrice(100, 100, 1, 0.05, 2.0, true);
    expect(p).toBeGreaterThan(30);
  });
  it('impliedVol OTM call', () => {
    const price = bsmPrice(90, 100, 1, 0.05, 0.3, true);
    const iv = impliedVol(price, 90, 100, 1, 0.05, true);
    expect(iv).toBeCloseTo(0.3, 2);
  });
  it('volatilitySmile with bad price', () => {
    const smile = volatilitySmile([100], [-1], 100, 1, 0.05, true);
    expect(smile.length).toBe(1);
  });
  it('bsmPrice deep ITM put', () => { expect(bsmPrice(50, 100, 1, 0.05, 0.2, false)).toBeGreaterThan(40); });
  it('bsmPrice deep OTM put', () => { expect(bsmPrice(150, 100, 1, 0.05, 0.2, false)).toBeLessThan(5); });
  it('impliedVol symmetric', () => {
    const p1 = bsmPrice(100, 100, 1, 0.05, 0.2, true);
    const iv1 = impliedVol(p1, 100, 100, 1, 0.05, true);
    expect(iv1).toBeCloseTo(0.2, 3);
  });
});
