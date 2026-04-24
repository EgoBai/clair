import { describe, it, expect } from 'vitest';
import {
  createIndicatorSeries,
  createBandSeries,
  groupIndicatorsByScale,
  computeYAxisRange,
  detectOverlayConflicts,
  buildOverlayConfig,
  interpolateAtTimestamp,
  createPercentageOverlay,
  mergeSeries,
  getWindowedSeries,
} from '../utils/indicatorOverlayEngine';
import type { IndicatorSeries } from '../utils/indicatorOverlayEngine';

function makeTs(start: number, count: number, step: number = 86400000): number[] {
  return Array.from({ length: count }, (_, i) => start + i * step);
}

describe('indicatorOverlayEngine', () => {
  const ts = makeTs(1700000000000, 10);

  describe('createIndicatorSeries', () => {
    it('creates a line series with defaults', () => {
      const s = createIndicatorSeries('sma5', 'SMA(5)', ts, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(s.id).toBe('sma5');
      expect(s.type).toBe('line');
      expect(s.scale).toBe('price');
      expect(s.data).toHaveLength(10);
      expect(s.visible).toBe(true);
    });

    it('handles null values in data', () => {
      const vals: (number | null)[] = [null, null, 50, 60, null, 70, 80, null, 90, 100];
      const s = createIndicatorSeries('rsi', 'RSI', ts, vals);
      expect(s.data.filter(d => d.value === null)).toHaveLength(4);
    });

    it('respects custom options', () => {
      const s = createIndicatorSeries('x', 'X', ts, [1, 2, 3], {
        type: 'bar', scale: 'volume', color: '#f00', lineWidth: 3, opacity: 0.5, zIndex: 10,
      });
      expect(s.type).toBe('bar');
      expect(s.scale).toBe('volume');
      expect(s.color).toBe('#f00');
      expect(s.lineWidth).toBe(3);
      expect(s.opacity).toBe(0.5);
      expect(s.zIndex).toBe(10);
    });
  });

  describe('createBandSeries', () => {
    it('creates a band series with upper/lower/middle', () => {
      const upper = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
      const lower = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const mid = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
      const s = createBandSeries('bb', 'Bollinger', ts, upper, lower, mid);
      expect(s.bandData).toBeDefined();
      expect(s.bandData!.upper).toHaveLength(10);
      expect(s.bandData!.lower).toHaveLength(10);
      expect(s.data[0].value).toBe(5);
    });

    it('handles null band data', () => {
      const s = createBandSeries('bb', 'BB', ts, [null, 10], [null, 5], [null, 7.5]);
      expect(s.bandData!.upper[0].value).toBeNull();
      expect(s.bandData!.upper[1].value).toBe(10);
    });
  });

  describe('computeYAxisRange', () => {
    it('computes range with padding', () => {
      const s = createIndicatorSeries('a', 'A', ts, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
      const range = computeYAxisRange([s]);
      expect(range.min).toBeLessThan(10);
      expect(range.max).toBeGreaterThan(100);
    });

    it('handles all-null data', () => {
      const s = createIndicatorSeries('a', 'A', ts, Array(10).fill(null));
      const range = computeYAxisRange([s]);
      expect(range).toEqual({ min: 0, max: 100 });
    });

    it('includes band data in range', () => {
      const s = createBandSeries('bb', 'BB', ts,
        [200, 200, 200, 200, 200, 200, 200, 200, 200, 200],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [100, 100, 100, 100, 100, 100, 100, 100, 100, 100]
      );
      const range = computeYAxisRange([s]);
      expect(range.max).toBeGreaterThan(200);
      expect(range.min).toBeLessThan(0);
    });
  });

  describe('groupIndicatorsByScale', () => {
    it('groups by scale', () => {
      const a = createIndicatorSeries('a', 'A', ts, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { scale: 'price' });
      const b = createIndicatorSeries('b', 'B', ts, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], { scale: 'volume' });
      const c = createIndicatorSeries('c', 'C', ts, [50, 55, 60, 65, 70, 75, 80, 85, 90, 95], { scale: 'price' });
      const groups = groupIndicatorsByScale([a, b, c]);
      expect(groups).toHaveLength(2);
      expect(groups[0].scale).toBe('price');
      expect(groups[0].series).toHaveLength(2);
      expect(groups[1].scale).toBe('volume');
    });

    it('sorts series by zIndex within groups', () => {
      const a = createIndicatorSeries('a', 'A', ts, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { zIndex: 10 });
      const b = createIndicatorSeries('b', 'B', ts, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { zIndex: 1 });
      const groups = groupIndicatorsByScale([a, b]);
      expect(groups[0].series[0].id).toBe('b');
      expect(groups[0].series[1].id).toBe('a');
    });

    it('hides invisible indicators', () => {
      const a = createIndicatorSeries('a', 'A', ts, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { visible: false });
      const groups = groupIndicatorsByScale([a]);
      expect(groups).toHaveLength(0);
    });
  });

  describe('detectOverlayConflicts', () => {
    it('detects same color on same scale', () => {
      const a = createIndicatorSeries('a', 'A', ts, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { color: '#f00' });
      const b = createIndicatorSeries('b', 'B', ts, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11], { color: '#f00' });
      const conflicts = detectOverlayConflicts([a, b]);
      expect(conflicts.some(c => c.reason === 'same_color_same_scale')).toBe(true);
    });

    it('detects transparent overlay hidden', () => {
      const a = createIndicatorSeries('a', 'A', ts, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { zIndex: 5, opacity: 0.2 });
      const b = createIndicatorSeries('b', 'B', ts, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11], { zIndex: 1 });
      const conflicts = detectOverlayConflicts([a, b]);
      expect(conflicts.some(c => c.reason === 'transparent_overlay_hidden')).toBe(true);
    });

    it('detects too many overlays on same scale', () => {
      const indicators = Array.from({ length: 8 }, (_, i) =>
        createIndicatorSeries(`s${i}`, `S${i}`, ts, Array(10).fill(i))
      );
      const conflicts = detectOverlayConflicts(indicators);
      expect(conflicts.some(c => c.reason === 'too_many_overlays')).toBe(true);
    });

    it('returns no conflicts for different colors and scales', () => {
      const a = createIndicatorSeries('a', 'A', ts, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { color: '#f00', scale: 'price' });
      const b = createIndicatorSeries('b', 'B', ts, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11], { color: '#0f0', scale: 'volume' });
      const conflicts = detectOverlayConflicts([a, b]);
      expect(conflicts).toHaveLength(0);
    });
  });

  describe('buildOverlayConfig', () => {
    it('returns groups and config', () => {
      const a = createIndicatorSeries('a', 'A', ts, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const b = createIndicatorSeries('b', 'B', ts, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], { scale: 'volume' });
      const config = buildOverlayConfig([a, b]);
      expect(config.groups.length).toBeGreaterThan(0);
      expect(config.candleOpacity).toBeGreaterThan(0);
      expect(config.gridLines).toBeGreaterThan(0);
    });

    it('reduces opacity when many indicators', () => {
      const indicators = Array.from({ length: 5 }, (_, i) =>
        createIndicatorSeries(`s${i}`, `S${i}`, ts, Array(10).fill(i + 1))
      );
      const config = buildOverlayConfig(indicators);
      expect(config.candleOpacity).toBeLessThan(0.9);
    });
  });

  describe('interpolateAtTimestamp', () => {
    it('returns exact value on match', () => {
      const s = createIndicatorSeries('a', 'A', ts, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
      expect(interpolateAtTimestamp(s, ts[3])).toBe(40);
    });

    it('interpolates between points', () => {
      const s = createIndicatorSeries('a', 'A', ts, [0, 100, 200, 300, 400, 500, 600, 700, 800, 900]);
      const mid = ts[0] + (ts[1] - ts[0]) / 2;
      expect(interpolateAtTimestamp(s, mid)).toBe(50);
    });

    it('returns null for out-of-range', () => {
      const s = createIndicatorSeries('a', 'A', ts, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
      expect(interpolateAtTimestamp(s, ts[0] - 86400000)).toBe(10); // before = first value
    });

    it('returns null when surrounding values are null', () => {
      const s = createIndicatorSeries('a', 'A', ts, [null, null, 30, 40, 50, 60, 70, 80, 90, 100]);
      const mid = ts[0] + (ts[1] - ts[0]) / 2;
      expect(interpolateAtTimestamp(s, mid)).toBeNull();
    });

    it('handles empty data', () => {
      const s = createIndicatorSeries('a', 'A', [], []);
      expect(interpolateAtTimestamp(s, 12345)).toBeNull();
    });
  });

  describe('createPercentageOverlay', () => {
    it('normalizes to percentage from first value', () => {
      const s = createIndicatorSeries('a', 'A', ts, [100, 110, 120, 130, 140, 150, 160, 170, 180, 190]);
      const pct = createPercentageOverlay(s);
      expect(pct.data[0].value).toBe(0);
      expect(pct.data[1].value).toBe(10);
      expect(pct.scale).toBe('percentage');
      expect(pct.id).toContain('-pct');
    });

    it('uses custom base value', () => {
      const s = createIndicatorSeries('a', 'A', ts, [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
      const pct = createPercentageOverlay(s, 200);
      expect(pct.data[0].value).toBe(-50);
      expect(pct.data[1].value).toBe(0);
    });

    it('handles null values', () => {
      const s = createIndicatorSeries('a', 'A', ts, [100, null, 120, 130, 140, 150, 160, 170, 180, 190]);
      const pct = createPercentageOverlay(s);
      expect(pct.data[1].value).toBeNull();
    });
  });

  describe('mergeSeries', () => {
    it('takes non-null from either', () => {
      const a = createIndicatorSeries('a', 'A', ts, [1, null, 3, 4, 5, 6, 7, 8, 9, 10]);
      const b = createIndicatorSeries('b', 'B', ts, [null, 20, null, 40, 50, 60, 70, 80, 90, 100]);
      const merged = mergeSeries(a, b);
      expect(merged.data[0].value).toBe(1);
      expect(merged.data[1].value).toBe(20);
      expect(merged.data[2].value).toBe(3);
    });

    it('handles different timestamps', () => {
      const ts2 = makeTs(1700000000000 + 86400000 * 5, 5);
      const a = createIndicatorSeries('a', 'A', ts.slice(0, 5), [1, 2, 3, 4, 5]);
      const b = createIndicatorSeries('b', 'B', ts2, [6, 7, 8, 9, 10]);
      const merged = mergeSeries(a, b);
      expect(merged.data).toHaveLength(10);
    });
  });

  describe('getWindowedSeries', () => {
    it('filters to time window', () => {
      const s = createIndicatorSeries('a', 'A', ts, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
      const windowed = getWindowedSeries(s, ts[2], ts[5]);
      expect(windowed.data).toHaveLength(4);
      expect(windowed.data[0].value).toBe(30);
      expect(windowed.data[3].value).toBe(60);
    });

    it('filters band data too', () => {
      const s = createBandSeries('bb', 'BB', ts,
        Array(10).fill(100),
        Array(10).fill(0),
        Array(10).fill(50)
      );
      const windowed = getWindowedSeries(s, ts[0], ts[2]);
      expect(windowed.bandData!.upper).toHaveLength(3);
      expect(windowed.bandData!.lower).toHaveLength(3);
    });

    it('handles empty window', () => {
      const s = createIndicatorSeries('a', 'A', ts, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
      const windowed = getWindowedSeries(s, ts[9] + 1000, ts[9] + 2000);
      expect(windowed.data).toHaveLength(0);
    });
  });
});
