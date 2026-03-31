import { describe, it, expect } from 'vitest';
import {
  buildVolSurface,
  fitVolSmile,
  buildTermStructure,
  analyzeSkew,
  interpolateIV,
  type OptionIVData,
  type VolSurfacePoint,
} from '../utils/volSurfaceEngine';

const sampleOptions: OptionIVData[] = [
  { strike: 90, expiry: '30', iv: 0.28, delta: -0.3, gamma: 0.02, vega: 0.15, theta: -0.05 },
  { strike: 95, expiry: '30', iv: 0.24, delta: -0.4, gamma: 0.03, vega: 0.18, theta: -0.06 },
  { strike: 100, expiry: '30', iv: 0.20, delta: -0.5, gamma: 0.04, vega: 0.20, theta: -0.07 },
  { strike: 105, expiry: '30', iv: 0.22, delta: -0.6, gamma: 0.03, vega: 0.18, theta: -0.06 },
  { strike: 110, expiry: '30', iv: 0.26, delta: -0.7, gamma: 0.02, vega: 0.15, theta: -0.05 },
  { strike: 90, expiry: '60', iv: 0.30, delta: -0.35, gamma: 0.015, vega: 0.22, theta: -0.04 },
  { strike: 100, expiry: '60', iv: 0.22, delta: -0.5, gamma: 0.025, vega: 0.25, theta: -0.05 },
  { strike: 110, expiry: '60', iv: 0.28, delta: -0.65, gamma: 0.015, vega: 0.22, theta: -0.04 },
];

describe('VolSurfaceEngine', () => {
  it('should build vol surface with moneyness labels', () => {
    const surface = buildVolSurface(sampleOptions, 100);
    expect(surface.length).toBe(sampleOptions.length);
    for (const p of surface) {
      expect(p.moneyness).toBeGreaterThan(0);
      expect(['deep_itm', 'itm', 'atm', 'otm', 'deep_otm']).toContain(p.moneynessLabel);
    }
    // Strike 90 → moneyness 0.9 → itm (boundary)
    const s90 = surface.find(p => p.strike === 90 && p.expiry === 30)!;
    expect(s90.moneynessLabel).toBe('itm');
    // Strike 100 → moneyness 1.0 → atm
    const s100 = surface.find(p => p.strike === 100 && p.expiry === 30)!;
    expect(s100.moneynessLabel).toBe('atm');
  });

  it('should fit vol smile', () => {
    const surface = buildVolSurface(sampleOptions, 100);
    const smile = fitVolSmile(surface, 30);
    expect(smile.atmVol).toBeGreaterThan(0);
    expect(typeof smile.skew).toBe('number');
    expect(typeof smile.curvature).toBe('number');
    expect(smile.rmse).toBeGreaterThanOrEqual(0);
  });

  it('should handle insufficient data for smile fitting', () => {
    const surface = buildVolSurface([sampleOptions[0]], 100);
    const smile = fitVolSmile(surface, 30);
    expect(smile.atmVol).toBe(0.2); // default
    expect(smile.rmse).toBe(1);
  });

  it('should build term structure', () => {
    const surface = buildVolSurface(sampleOptions, 100);
    const term = buildTermStructure(surface, 1.0);
    expect(term.tenors.length).toBeGreaterThan(0);
    expect(typeof term.contango).toBe('boolean');
    expect(typeof term.steepness).toBe('number');
    expect(term.expectedVol).toBeGreaterThan(0);
  });

  it('should detect contango in term structure', () => {
    const surface = buildVolSurface(sampleOptions, 100);
    const term = buildTermStructure(surface, 1.0);
    // ATM vol at 30d = 0.20, at 60d = 0.22 → contango
    expect(term.contango).toBe(true);
    expect(term.inversion).toBe(false);
  });

  it('should handle insufficient term structure data', () => {
    const surface = buildVolSurface([{ strike: 100, expiry: '30', iv: 0.20, delta: -0.5, gamma: 0.04, vega: 0.20, theta: -0.07 }], 100);
    const term = buildTermStructure(surface, 1.0);
    expect(term.tenors.length).toBe(1);
    expect(term.steepness).toBe(0);
  });

  it('should analyze skew', () => {
    const surface = buildVolSurface(sampleOptions, 100);
    const smile = fitVolSmile(surface, 30);
    const historicalSkew = Array.from({ length: 100 }, (_, i) => -0.05 + i * 0.001);
    const skew = analyzeSkew(smile, historicalSkew);
    expect(typeof skew.putCallSkew).toBe('number');
    expect(skew.skewPercentile).toBeGreaterThanOrEqual(0);
    expect(skew.skewPercentile).toBeLessThanOrEqual(100);
    expect(skew.interpretation).toBeTruthy();
  });

  it('should provide skew interpretation for different levels', () => {
    const smile = { atmVol: 0.2, skew: 0.05, curvature: 0, wingLeft: 0, wingRight: 0, rmse: 0 };
    const low = analyzeSkew(smile, Array(100).fill(0.01));
    expect(low.interpretation).toContain('高位');
  });

  it('should interpolate IV on surface', () => {
    const surface = buildVolSurface(sampleOptions, 100);
    const iv = interpolateIV(surface, 98, 35);
    expect(iv).toBeGreaterThan(0);
    expect(iv).toBeLessThan(1);
  });

  it('should return default IV for empty surface', () => {
    expect(interpolateIV([], 100, 30)).toBe(0.2);
  });

  it('should handle exact match interpolation', () => {
    const surface = buildVolSurface(sampleOptions, 100);
    const iv = interpolateIV(surface, 100, 30);
    // Should be close to 0.20 (ATM 30d IV)
    expect(Math.abs(iv - 0.20)).toBeLessThan(0.05);
  });
});
