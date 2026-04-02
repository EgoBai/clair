import { describe, it, expect } from 'vitest';
import {
  linearInterpolate,
  cubicSplineInterpolate,
  fitSVI,
  sviVol,
  extractSmileSlice,
  extractTermStructure,
  bilinearInterpolate,
  smoothVolSurface,
  checkNoArbitrageConditions,
  type VolSurfacePoint,
} from '../services/volSurfaceInterpolationEngine';

describe('volSurfaceInterpolationEngine', () => {
  describe('linearInterpolate', () => {
    it('should interpolate between two points', () => {
      expect(linearInterpolate([0, 1], [0, 10], 0.5)).toBe(5);
    });

    it('should extrapolate below range', () => {
      expect(linearInterpolate([1, 2], [10, 20], 0)).toBe(10);
    });

    it('should extrapolate above range', () => {
      expect(linearInterpolate([1, 2], [10, 20], 3)).toBe(20);
    });

    it('should handle empty arrays', () => {
      expect(linearInterpolate([], [], 0.5)).toBe(0);
    });

    it('should interpolate multi-point curve', () => {
      const x = [90, 95, 100, 105, 110];
      const y = [0.3, 0.25, 0.2, 0.22, 0.28];
      expect(linearInterpolate(x, y, 97.5)).toBeCloseTo(0.225, 3);
    });
  });

  describe('cubicSplineInterpolate', () => {
    it('should interpolate smoothly', () => {
      const x = [0, 1, 2, 3, 4];
      const y = [0, 1, 4, 9, 16];
      const result = cubicSplineInterpolate(x, y, 1.5);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(9);
    });

    it('should handle boundary values', () => {
      const x = [0, 1, 2];
      const y = [10, 20, 30];
      expect(cubicSplineInterpolate(x, y, -1)).toBe(10);
      expect(cubicSplineInterpolate(x, y, 5)).toBe(30);
    });

    it('should handle insufficient data', () => {
      expect(cubicSplineInterpolate([1], [5], 1)).toBe(5);
    });
  });

  describe('fitSVI', () => {
    it('should fit SVI parameters', () => {
      const k = [-0.2, -0.1, 0, 0.1, 0.2];
      const tv = [0.05, 0.04, 0.035, 0.04, 0.05];
      const params = fitSVI(k, tv);
      expect(params.a).toBeTypeOf('number');
      expect(params.b).toBeGreaterThan(0);
      expect(params.rho).toBeGreaterThanOrEqual(-1);
      expect(params.rho).toBeLessThanOrEqual(1);
    });

    it('should handle insufficient data', () => {
      const params = fitSVI([0], [0.04]);
      expect(params.a).toBe(0);
    });
  });

  describe('sviVol', () => {
    it('should compute volatility from SVI params', () => {
      const params = { a: 0.04, b: 0.1, rho: 0, m: 0, sigma: 0.1 };
      const vol = sviVol(params, 0);
      expect(vol).toBeGreaterThan(0);
    });

    it('should produce a smile shape', () => {
      const params = { a: 0.04, b: 0.15, rho: -0.3, m: 0, sigma: 0.1 };
      const vols = [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3].map(k => sviVol(params, k));
      // V-shape: higher at the wings
      expect(vols[0]).toBeGreaterThan(vols[3]);
      expect(vols[6]).toBeGreaterThan(vols[3]);
    });
  });

  describe('extractSmileSlice', () => {
    it('should extract smile at given expiry', () => {
      const points: VolSurfacePoint[] = [
        { strike: 90, expiry: 30, impliedVol: 0.3 },
        { strike: 100, expiry: 30, impliedVol: 0.2 },
        { strike: 110, expiry: 30, impliedVol: 0.25 },
      ];
      const smile = extractSmileSlice(points, 30);
      expect(smile.strikes).toHaveLength(3);
      expect(smile.skew).toBeCloseTo(0.05, 6);
      expect(smile.atmVol).toBe(0.2);
    });

    it('should return empty for missing expiry', () => {
      const smile = extractSmileSlice([], 30);
      expect(smile.strikes).toHaveLength(0);
    });
  });

  describe('extractTermStructure', () => {
    it('should extract term structure at given strike', () => {
      const points: VolSurfacePoint[] = [
        { strike: 100, expiry: 7, impliedVol: 0.15 },
        { strike: 100, expiry: 30, impliedVol: 0.2 },
        { strike: 100, expiry: 90, impliedVol: 0.25 },
      ];
      const ts = extractTermStructure(points, 100);
      expect(ts.expiries).toHaveLength(3);
      expect(ts.contangoRatio).toBeCloseTo(0.15 / 0.25, 1);
    });
  });

  describe('bilinearInterpolate', () => {
    it('should interpolate across strike and expiry', () => {
      const points: VolSurfacePoint[] = [
        { strike: 90, expiry: 7, impliedVol: 0.3 },
        { strike: 110, expiry: 7, impliedVol: 0.25 },
        { strike: 90, expiry: 30, impliedVol: 0.28 },
        { strike: 110, expiry: 30, impliedVol: 0.22 },
      ];
      const vol = bilinearInterpolate(points, 100, 15);
      expect(vol).toBeGreaterThan(0);
      expect(vol).toBeLessThan(0.35);
    });

    it('should handle single expiry', () => {
      const points: VolSurfacePoint[] = [
        { strike: 90, expiry: 30, impliedVol: 0.3 },
        { strike: 110, expiry: 30, impliedVol: 0.2 },
      ];
      const vol = bilinearInterpolate(points, 100, 30);
      expect(vol).toBeCloseTo(0.25, 2);
    });

    it('should handle empty points', () => {
      expect(bilinearInterpolate([], 100, 30)).toBe(0);
    });
  });

  describe('smoothVolSurface', () => {
    it('should smooth outliers', () => {
      const points: VolSurfacePoint[] = [
        { strike: 95, expiry: 30, impliedVol: 0.2 },
        { strike: 100, expiry: 30, impliedVol: 0.5 }, // outlier
        { strike: 105, expiry: 30, impliedVol: 0.2 },
      ];
      const smoothed = smoothVolSurface(points);
      expect(smoothed[1].impliedVol).toBeLessThan(0.5);
    });

    it('should preserve well-behaved surface', () => {
      const points: VolSurfacePoint[] = [
        { strike: 95, expiry: 30, impliedVol: 0.22 },
        { strike: 100, expiry: 30, impliedVol: 0.2 },
        { strike: 105, expiry: 30, impliedVol: 0.21 },
      ];
      const smoothed = smoothVolSurface(points);
      expect(smoothed).toHaveLength(3);
    });
  });

  describe('checkNoArbitrageConditions', () => {
    it('should detect no arbitrage in well-behaved surface', () => {
      const points: VolSurfacePoint[] = [
        { strike: 90, expiry: 30, impliedVol: 0.25 },
        { strike: 100, expiry: 30, impliedVol: 0.2 },
        { strike: 110, expiry: 30, impliedVol: 0.25 },
      ];
      const result = checkNoArbitrageConditions(points);
      expect(result.butterflyArbitrage).toBe(false);
    });

    it('should detect butterfly arbitrage', () => {
      const points: VolSurfacePoint[] = [
        { strike: 90, expiry: 30, impliedVol: 0.2 },
        { strike: 100, expiry: 30, impliedVol: 0.3 }, // too convex
        { strike: 110, expiry: 30, impliedVol: 0.2 },
      ];
      const result = checkNoArbitrageConditions(points);
      expect(result.butterflyArbitrage).toBe(true);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('should handle empty points', () => {
      const result = checkNoArbitrageConditions([]);
      expect(result.butterflyArbitrage).toBe(false);
      expect(result.calendarArbitrage).toBe(false);
    });
  });
});
