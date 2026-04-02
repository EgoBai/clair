import { describe, it, expect } from 'vitest';
import { zScore, zScoreSeries, detectOutliers, winsorize } from '../services/zScoreEngine';

describe('ZScoreEngine', () => {
  describe('zScore', () => {
    it('returns 0 for value at mean', () => {
      expect(zScore(5, 5, 2)).toBe(0);
    });

    it('positive for above mean', () => {
      expect(zScore(7, 5, 2)).toBe(1);
    });

    it('negative for below mean', () => {
      expect(zScore(3, 5, 2)).toBe(-1);
    });

    it('returns 0 for zero std', () => {
      expect(zScore(5, 3, 0)).toBe(0);
    });

    it('handles negative values', () => {
      expect(zScore(-1, -3, 2)).toBe(1);
    });
  });

  describe('zScoreSeries', () => {
    it('standardizes a series', () => {
      const zs = zScoreSeries([1, 2, 3, 4, 5]);
      expect(zs.length).toBe(5);
      const mean = zs.reduce((s, v) => s + v, 0) / zs.length;
      expect(Math.abs(mean)).toBeLessThan(0.01);
    });

    it('handles empty array', () => {
      expect(zScoreSeries([])).toEqual([]);
    });

    it('constant series returns zeros', () => {
      const zs = zScoreSeries([5, 5, 5, 5]);
      expect(zs.every(v => v === 0)).toBe(true);
    });

    it('returns rounded values', () => {
      const zs = zScoreSeries([1.1, 2.2, 3.3]);
      expect(zs.every(v => typeof v === 'number')).toBe(true);
    });

    it('single element returns 0', () => {
      expect(zScoreSeries([42])).toEqual([0]);
    });
  });

  describe('detectOutliers', () => {
    it('detects outliers with default threshold', () => {
      const data = [1, 1, 1, 1, 1, 1, 1, 1, 1, 100];
      const r = detectOutliers(data);
      expect(r.indices.length).toBeGreaterThan(0);
      expect(r.values).toContain(100);
    });

    it('no outliers in uniform data', () => {
      const r = detectOutliers([5, 5, 5, 5, 5]);
      expect(r.indices.length).toBe(0);
    });

    it('custom threshold', () => {
      const data = [1, 1, 1, 5, 1, 1];
      const r1 = detectOutliers(data, 1);
      const r3 = detectOutliers(data, 3);
      expect(r1.indices.length).toBeGreaterThanOrEqual(r3.indices.length);
    });

    it('empty data', () => {
      const r = detectOutliers([]);
      expect(r.indices).toEqual([]);
    });
  });

  describe('winsorize', () => {
    it('caps extreme values', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 100];
      const w = winsorize(data);
      expect(Math.max(...w)).toBeLessThan(100);
    });

    it('preserves middle values', () => {
      const data = [3, 4, 5, 6, 7];
      const w = winsorize(data);
      expect(w[2]).toBe(5);
    });

    it('custom limit', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const w = winsorize(data, 0.1);
      expect(w.length).toBe(data.length);
    });

    it('same length output', () => {
      const data = [10, 20, 30, 40, 50];
      expect(winsorize(data).length).toBe(5);
    });

    it('handles single element', () => {
      expect(winsorize([42])).toEqual([42]);
    });
  });
});
