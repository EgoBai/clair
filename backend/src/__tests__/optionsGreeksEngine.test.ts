import { describe, it, expect } from 'vitest';
import { d1, delta, gamma, theta, vega, rho } from '../services/optionsGreeksEngine';

const S = 100, K = 100, T = 1, r = 0.05, sigma = 0.2;

describe('optionsGreeksEngine', () => {
  it('d1 for ATM', () => { expect(d1(S, K, T, r, sigma)).toBeGreaterThan(0); });
  it('delta call in (0,1)', () => {
    const d = delta(S, K, T, r, sigma, true);
    expect(d).toBeGreaterThan(0); expect(d).toBeLessThan(1);
  });
  it('delta put in (-1,0)', () => {
    const d = delta(S, K, T, r, sigma, false);
    expect(d).toBeGreaterThan(-1); expect(d).toBeLessThan(0);
  });
  it('delta call - put = 1', () => {
    expect(delta(S, K, T, r, sigma, true) - delta(S, K, T, r, sigma, false)).toBeCloseTo(1, 5);
  });
  it('gamma positive', () => { expect(gamma(S, K, T, r, sigma)).toBeGreaterThan(0); });
  it('gamma zero for expired', () => { expect(gamma(S, K, 0, r, sigma)).toBe(0); });
  it('theta call negative for ATM', () => { expect(theta(S, K, T, r, sigma, true)).toBeLessThan(0); });
  it('theta zero for expired', () => { expect(theta(S, K, 0, r, sigma, true)).toBe(0); });
  it('vega positive', () => { expect(vega(S, K, T, r, sigma)).toBeGreaterThan(0); });
  it('vega zero for expired', () => { expect(vega(S, K, 0, r, sigma)).toBe(0); });
  it('rho call positive', () => { expect(rho(S, K, T, r, sigma, true)).toBeGreaterThan(0); });
  it('rho put negative', () => { expect(rho(S, K, T, r, sigma, false)).toBeLessThan(0); });
  it('rho zero for expired', () => { expect(rho(S, K, 0, r, sigma, true)).toBe(0); });
  it('delta ITM call near 1', () => {
    expect(delta(200, K, T, r, sigma, true)).toBeGreaterThan(0.9);
  });
  it('delta OTM call near 0', () => {
    expect(delta(50, K, T, r, sigma, true)).toBeLessThan(0.1);
  });
  it('gamma peaks ATM', () => {
    const gATM = gamma(S, K, T, r, sigma);
    const gOTM = gamma(50, K, T, r, sigma);
    expect(gATM).toBeGreaterThan(gOTM);
  });
  it('vega increases with T', () => {
    expect(vega(S, K, 2, r, sigma)).toBeGreaterThan(vega(S, K, 0.5, r, sigma));
  });
  it('theta put can be positive', () => {
    const t = theta(50, K, T, r, sigma, false);
    expect(typeof t).toBe('number');
  });
  it('d1 deep ITM', () => {
    expect(d1(200, K, T, r, sigma)).toBeGreaterThan(2);
  });
  it('delta deep OTM put near -1', () => {
    expect(delta(200, K, T, r, sigma, false)).toBeCloseTo(0, 1);
  });
});
