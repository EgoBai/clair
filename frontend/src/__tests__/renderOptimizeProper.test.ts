import { describe, it, expect, vi } from 'vitest';
import {
  calculateVirtualScroll,
  RenderProfiler,
  DataCache,
  globalDataCache,
} from '../utils/renderOptimize';

describe('Render Optimization Proper', () => {
  describe('calculateVirtualScroll', () => {
    it('should calculate initial range', () => {
      const result = calculateVirtualScroll({
        itemHeight: 50,
        containerHeight: 500,
        totalCount: 100,
        scrollTop: 0,
        overscan: 5,
      });
      expect(result.startIndex).toBe(0);
      expect(result.endIndex).toBeGreaterThan(0);
      expect(result.endIndex).toBeLessThan(100);
      expect(result.offsetY).toBe(0);
    });

    it('should handle scrolled position', () => {
      const result = calculateVirtualScroll({
        itemHeight: 50,
        containerHeight: 500,
        totalCount: 100,
        scrollTop: 500,
        overscan: 5,
      });
      expect(result.startIndex).toBeGreaterThan(0);
      expect(result.offsetY).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty list', () => {
      const result = calculateVirtualScroll({
        itemHeight: 50,
        containerHeight: 500,
        totalCount: 0,
        scrollTop: 0,
      });
      expect(result.startIndex).toBe(0);
    });

    it('should apply overscan', () => {
      const withOverscan = calculateVirtualScroll({
        itemHeight: 50,
        containerHeight: 500,
        totalCount: 100,
        scrollTop: 0,
        overscan: 10,
      });
      const noOverscan = calculateVirtualScroll({
        itemHeight: 50,
        containerHeight: 500,
        totalCount: 100,
        scrollTop: 0,
        overscan: 0,
      });
      expect(withOverscan.endIndex).toBeGreaterThan(noOverscan.endIndex);
    });

    it('should not exceed total count', () => {
      const result = calculateVirtualScroll({
        itemHeight: 50,
        containerHeight: 500,
        totalCount: 5,
        scrollTop: 0,
      });
      expect(result.endIndex).toBeLessThanOrEqual(4);
    });
  });

  describe('RenderProfiler', () => {
    it('should measure execution time', () => {
      const duration = RenderProfiler.measure('test', () => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) sum += i;
      });
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(typeof duration).toBe('number');
    });

    it('should get stats for tags', () => {
      RenderProfiler.measure('myTag', () => {});
      RenderProfiler.measure('myTag', () => {});
      const stats = RenderProfiler.getStats('myTag');
      expect(stats).toBeDefined();
      expect(stats).not.toBeNull();
      expect(typeof stats!.avg).toBe('number');
      expect(typeof stats!.min).toBe('number');
      expect(typeof stats!.max).toBe('number');
    });

    it('should return null for unknown tag', () => {
      const stats = RenderProfiler.getStats('nonexistent-tag-xyz');
      expect(stats).toBeNull();
    });
  });

  describe('DataCache', () => {
    it('should create instance with TTL', () => {
      const cache = new DataCache<string>(5000);
      expect(cache).toBeDefined();
    });

    it('should set and get values', () => {
      const cache = new DataCache<string>(5000);
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for missing keys', () => {
      const cache = new DataCache<string>(5000);
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should expire entries after TTL', async () => {
      const cache = new DataCache<string>(50);
      cache.set('expiring', 'value');
      expect(cache.get('expiring')).toBe('value');
      await new Promise(r => setTimeout(r, 60));
      expect(cache.get('expiring')).toBeNull();
    });

    it('should invalidate by pattern', () => {
      const cache = new DataCache<string>(5000);
      cache.set('stocks:list', 'data1');
      cache.set('stocks:detail', 'data2');
      cache.set('etf:list', 'data3');
      cache.invalidate('stocks');
      expect(cache.get('stocks:list')).toBeNull();
      expect(cache.get('stocks:detail')).toBeNull();
      expect(cache.get('etf:list')).toBe('data3');
    });

    it('should clear all entries with invalidate()', () => {
      const cache = new DataCache<number>(5000);
      cache.set('a', 1);
      cache.set('b', 2);
      expect(cache.get('a')).toBe(1);
      cache.invalidate();
      expect(cache.get('a')).toBeNull();
      expect(cache.get('b')).toBeNull();
    });

    it('should export globalDataCache', () => {
      expect(globalDataCache).toBeDefined();
      expect(globalDataCache).toBeInstanceOf(DataCache);
    });
  });

  describe('chunkedRender', () => {
    it('should be a function', async () => {
      const { chunkedRender } = await import('../utils/renderOptimize');
      expect(typeof chunkedRender).toBe('function');
    });

    it('should process items in chunks', async () => {
      const { chunkedRender } = await import('../utils/renderOptimize');
      const chunks: number[][] = [];
      const data = Array.from({ length: 25 }, (_, i) => i);
      await chunkedRender(data, (chunk) => {
        chunks.push([...chunk]);
      }, 10);
      expect(chunks.length).toBe(3);
      expect(chunks[0].length).toBe(10);
      expect(chunks[1].length).toBe(10);
      expect(chunks[2].length).toBe(5);
    });

    it('should handle empty array', async () => {
      const { chunkedRender } = await import('../utils/renderOptimize');
      const chunks: number[][] = [];
      await chunkedRender([], (chunk) => {
        chunks.push([...chunk]);
      }, 10);
      expect(chunks.length).toBe(0);
    });
  });
});
