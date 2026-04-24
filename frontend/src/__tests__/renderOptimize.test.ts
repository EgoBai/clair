import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateVirtualScroll,
  RenderProfiler,
  DataCache,
  chunkedRender,
} from '../utils/renderOptimize';

import {
  calculateVisibleRange,
} from '../utils/reactOptimize';

describe('renderOptimize', () => {
  describe('calculateVirtualScroll', () => {
    it('should calculate visible range', () => {
      const result = calculateVirtualScroll({
        itemHeight: 40,
        containerHeight: 400,
        totalCount: 100,
        scrollTop: 0,
      });
      expect(result.startIndex).toBe(0);
      expect(result.endIndex).toBeGreaterThan(0);
      expect(result.totalHeight).toBe(4000); // 100 * 40
    });

    it('should include overscan items', () => {
      const withOverscan = calculateVirtualScroll({
        itemHeight: 40,
        containerHeight: 400,
        totalCount: 100,
        scrollTop: 400,
        overscan: 5,
      });
      const withoutOverscan = calculateVirtualScroll({
        itemHeight: 40,
        containerHeight: 400,
        totalCount: 100,
        scrollTop: 400,
        overscan: 0,
      });
      expect(withOverscan.startIndex).toBeLessThanOrEqual(withoutOverscan.startIndex);
      expect(withOverscan.endIndex).toBeGreaterThanOrEqual(withoutOverscan.endIndex);
    });

    it('should handle scroll position', () => {
      const top = calculateVirtualScroll({
        itemHeight: 40,
        containerHeight: 400,
        totalCount: 1000,
        scrollTop: 0,
      });
      const middle = calculateVirtualScroll({
        itemHeight: 40,
        containerHeight: 400,
        totalCount: 1000,
        scrollTop: 4000, // item 100
      });
      expect(middle.startIndex).toBeGreaterThan(top.startIndex);
    });

    it('should clamp to total count', () => {
      const result = calculateVirtualScroll({
        itemHeight: 40,
        containerHeight: 400,
        totalCount: 5,
        scrollTop: 0,
      });
      expect(result.endIndex).toBeLessThan(10);
      expect(result.visibleItems).toBeLessThanOrEqual(5);
    });

    it('should calculate offsetY correctly', () => {
      const result = calculateVirtualScroll({
        itemHeight: 40,
        containerHeight: 400,
        totalCount: 100,
        scrollTop: 800, // at item 20
      });
      expect(result.offsetY).toBe(result.startIndex * 40);
    });
  });

  describe('RenderProfiler', () => {
    beforeEach(() => {
      RenderProfiler.clear();
    });

    it('should measure function execution time', () => {
      const duration = RenderProfiler.measure('test', () => {
        // some work
      });
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should collect stats', () => {
      RenderProfiler.measure('test', () => {});
      RenderProfiler.measure('test', () => {});
      RenderProfiler.measure('test', () => {});

      const stats = RenderProfiler.getStats('test');
      expect(stats).not.toBeNull();
      expect(stats!.samples).toBe(3);
      expect(stats!.avg).toBeGreaterThanOrEqual(0);
      expect(stats!.p50).toBeDefined();
      expect(stats!.p95).toBeDefined();
    });

    it('should return null for unknown labels', () => {
      expect(RenderProfiler.getStats('nonexistent')).toBeNull();
    });

    it('should clear specific label', () => {
      RenderProfiler.measure('a', () => {});
      RenderProfiler.measure('b', () => {});
      RenderProfiler.clear('a');
      expect(RenderProfiler.getStats('a')).toBeNull();
      expect(RenderProfiler.getStats('b')).not.toBeNull();
    });

    it('should clear all', () => {
      RenderProfiler.measure('a', () => {});
      RenderProfiler.measure('b', () => {});
      RenderProfiler.clear();
      expect(RenderProfiler.getStats('a')).toBeNull();
      expect(RenderProfiler.getStats('b')).toBeNull();
    });

    it('should limit to 100 samples', () => {
      for (let i = 0; i < 150; i++) {
        RenderProfiler.measure('test', () => {});
      }
      const stats = RenderProfiler.getStats('test');
      expect(stats!.samples).toBe(100);
    });
  });

  describe('DataCache', () => {
    let cache: DataCache<string>;

    beforeEach(() => {
      vi.useFakeTimers();
      cache = new DataCache(5000); // 5s TTL
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should set and get values', () => {
      cache.set('k1', 'v1');
      expect(cache.get('k1')).toBe('v1');
    });

    it('should return null for missing keys', () => {
      expect(cache.get('missing')).toBeNull();
    });

    it('should expire values', () => {
      cache.set('k1', 'v1');
      expect(cache.get('k1')).toBe('v1');
      vi.advanceTimersByTime(6000);
      expect(cache.get('k1')).toBeNull();
    });

    it('should invalidate by pattern', () => {
      cache.set('user:1', 'alice');
      cache.set('user:2', 'bob');
      cache.set('stock:000001', 'data');

      cache.invalidate('user:');
      expect(cache.get('user:1')).toBeNull();
      expect(cache.get('user:2')).toBeNull();
      expect(cache.get('stock:000001')).toBe('data');
    });

    it('should invalidate all', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      cache.invalidate();
      expect(cache.size).toBe(0);
    });

    it('should return stats', () => {
      cache.set('k1', 'v1');
      const stats = cache.getStats();
      expect(stats.size).toBe(1);
      expect(stats.ttl).toBe(5000);
    });
  });

  describe('chunkedRender', () => {
    it('should render items in chunks', async () => {
      const items = Array.from({ length: 250 }, (_, i) => i);
      const rendered: number[] = [];

      await chunkedRender(items, (chunk) => {
        rendered.push(...chunk);
      }, 100, 1);

      expect(rendered).toHaveLength(250);
      expect(rendered).toEqual(items);
    });

    it('should handle empty array', async () => {
      const rendered: number[] = [];
      await chunkedRender([], (chunk) => rendered.push(...chunk));
      expect(rendered).toHaveLength(0);
    });

    it('should handle small arrays', async () => {
      const items = [1, 2, 3];
      const chunks: number[][] = [];
      await chunkedRender(items, (chunk) => chunks.push(chunk), 100, 1);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual([1, 2, 3]);
    });
  });
});

describe('reactOptimize', () => {
  describe('calculateVisibleRange', () => {
    it('should calculate visible range', () => {
      const result = calculateVisibleRange(0, 100, {
        itemHeight: 40,
        containerHeight: 400,
      });
      expect(result.start).toBe(0);
      expect(result.end).toBeGreaterThan(0);
      expect(result.offsetY).toBe(0);
    });

    it('should handle scroll offset', () => {
      const top = calculateVisibleRange(0, 1000, {
        itemHeight: 40,
        containerHeight: 400,
      });
      const scrolled = calculateVisibleRange(400, 1000, {
        itemHeight: 40,
        containerHeight: 400,
      });
      expect(scrolled.start).toBeGreaterThan(top.start);
    });

    it('should include overscan', () => {
      const result = calculateVisibleRange(0, 100, {
        itemHeight: 40,
        containerHeight: 400,
        overscan: 5,
      });
      // With overscan=5, should include more items
      expect(result.end).toBeGreaterThan(10); // at least visible + overscan
    });

    it('should not exceed total items', () => {
      const result = calculateVisibleRange(0, 5, {
        itemHeight: 40,
        containerHeight: 400,
      });
      expect(result.end).toBeLessThanOrEqual(5);
    });

    it('should calculate offsetY', () => {
      const result = calculateVisibleRange(400, 1000, {
        itemHeight: 40,
        containerHeight: 400,
      });
      expect(result.offsetY).toBe(result.start * 40);
    });
  });
});
