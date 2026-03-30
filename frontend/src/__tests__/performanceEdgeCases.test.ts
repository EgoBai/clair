import { describe, it, expect, vi } from 'vitest';

describe('Performance Edge Cases', () => {
  describe('Render Optimization', () => {
    it('virtual scroll should handle empty list', async () => {
      const { calculateVirtualScroll } = await import('../utils/renderOptimize');
      const result = calculateVirtualScroll({
        itemHeight: 50, containerHeight: 500, totalCount: 0, scrollTop: 0,
      });
      expect(result.startIndex).toBe(0);
      expect(result.endIndex).toBe(-1);
    });

    it('virtual scroll should handle single item', async () => {
      const { calculateVirtualScroll } = await import('../utils/renderOptimize');
      const result = calculateVirtualScroll({
        itemHeight: 50, containerHeight: 500, totalCount: 1, scrollTop: 0,
      });
      expect(result.startIndex).toBe(0);
      expect(result.endIndex).toBe(0);
    });

    it('DataCache should handle expired entries', async () => {
      const { DataCache } = await import('../utils/renderOptimize');
      const cache = new DataCache<string>(50);
      cache.set('key', 'val');
      expect(cache.get('key')).toBe('val');
      await new Promise(r => setTimeout(r, 60));
      expect(cache.get('key')).toBeNull();
    });

    it('DataCache should invalidate by pattern', async () => {
      const { DataCache } = await import('../utils/renderOptimize');
      const cache = new DataCache<string>(5000);
      cache.set('stocks:a', '1');
      cache.set('stocks:b', '2');
      cache.set('etf:a', '3');
      cache.invalidate('stocks');
      expect(cache.get('stocks:a')).toBeNull();
      expect(cache.get('etf:a')).toBe('3');
    });

    it('DataCache should report correct size via get/invalidate', async () => {
      const { DataCache } = await import('../utils/renderOptimize');
      const cache = new DataCache<number>(5000);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
      cache.invalidate();
      expect(cache.get('a')).toBeNull();
      expect(cache.get('b')).toBeNull();
      expect(cache.get('c')).toBeNull();
    });

    it('RenderProfiler should measure performance', async () => {
      const { RenderProfiler } = await import('../utils/renderOptimize');
      const duration = RenderProfiler.measure('perf-test', () => {
        let x = 0;
        for (let i = 0; i < 100; i++) x += i;
      });
      expect(typeof duration).toBe('number');
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('chunkedRender should handle empty array', async () => {
      const { chunkedRender } = await import('../utils/renderOptimize');
      const chunks: unknown[][] = [];
      await chunkedRender([], (chunk) => { chunks.push([...chunk]); }, 10);
      expect(chunks.length).toBe(0);
    });

    it('chunkedRender should split correctly', async () => {
      const { chunkedRender } = await import('../utils/renderOptimize');
      const chunks: number[][] = [];
      await chunkedRender([1, 2, 3, 4, 5], (chunk) => { chunks.push([...chunk]); }, 2);
      expect(chunks.length).toBe(3); // 5 items / 2 = 3 chunks (2, 2, 1)
      expect(chunks[2]).toEqual([5]);
    });
  });

  describe('Web Vitals', () => {
    it('should have web vitals module', async () => {
      const mod = await import('../utils/webVitals');
      expect(mod).toBeDefined();
    });

    it('should export vitals functions', async () => {
      const mod = await import('../utils/webVitals');
      const exports = Object.keys(mod);
      expect(exports.length).toBeGreaterThan(0);
    });
  });
});
