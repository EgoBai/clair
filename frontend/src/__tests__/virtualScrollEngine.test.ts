import { describe, it, expect } from 'vitest';
import {
  calculateVisibleRange,
  VirtualScrollCache,
  globalVirtualScrollCache,
} from '../utils/virtualScrollEngine';

describe('VirtualScrollEngine Optimizations', () => {
  describe('calculateVisibleRange with binary search', () => {
    it('should calculate correct range for equal heights', () => {
      const result = calculateVisibleRange(
        0,
        400,
        40,
        1000,
        2
      );
      expect(result.startIndex).toBe(0);
      expect(result.endIndex).toBe(13); // 10 visible + 2 overscan + 1 for partial
      expect(result.totalHeight).toBe(40000);
      expect(result.offsetY).toBe(0);
    });

    it('should calculate correct range when scrolled', () => {
      const result = calculateVisibleRange(
        400,
        400,
        40,
        1000,
        2
      );
      expect(result.startIndex).toBe(8); // 10 - 2 overscan
      expect(result.endIndex).toBe(21); // 8 + 10 + 2*2 - 1 (索引从0开始)
      expect(result.offsetY).toBe(320); // 8 * 40
    });

    it('should handle variable heights', () => {
      const getH = (i: number) => (i % 2 === 0 ? 40 : 60);
      const result = calculateVisibleRange(
        100,
        200,
        getH,
        100,
        1
      );
      expect(result.startIndex).toBeGreaterThanOrEqual(0);
      expect(result.endIndex).toBeLessThan(100);
      expect(result.totalHeight).toBeGreaterThan(0);
    });

    it('should not exceed total count', () => {
      const result = calculateVisibleRange(
        0,
        400,
        40,
        10,
        5
      );
      expect(result.endIndex).toBe(9); // max index
      expect(result.visibleItems).toHaveLength(10);
    });

    it('should not go below 0', () => {
      const result = calculateVisibleRange(
        0,
        400,
        40,
        100,
        5
      );
      expect(result.startIndex).toBe(0);
    });
  });

  describe('VirtualScrollCache', () => {
    it('should cache prefix sums correctly', () => {
      const cache = new VirtualScrollCache();
      const itemHeight = 40;
      
      cache.updateCache(100, itemHeight);
      
      expect(cache.getPrefixSum(0)).toBe(0);
      expect(cache.getPrefixSum(1)).toBe(40);
      expect(cache.getPrefixSum(10)).toBe(400);
      expect(cache.getTotalHeight()).toBe(4000);
    });

    it('should update cache when total count changes', () => {
      const cache = new VirtualScrollCache();
      const itemHeight = 50;
      
      cache.updateCache(10, itemHeight);
      expect(cache.getTotalHeight()).toBe(500);
      
      cache.updateCache(20, itemHeight);
      expect(cache.getTotalHeight()).toBe(1000);
    });

    it('should calculate visible range using cache', () => {
      const cache = new VirtualScrollCache();
      const itemHeight = 40;
      
      const result = cache.calculateVisibleRangeCached(
        400,
        400,
        itemHeight,
        1000,
        2
      );
      
      expect(result.startIndex).toBe(8);
      expect(result.endIndex).toBe(21); // 8 + 10 + 2*2 - 1 (索引从0开始)
      expect(result.offsetY).toBe(320);
    });

    it('should handle variable heights with cache', () => {
      const cache = new VirtualScrollCache();
      const getH = (i: number) => (i % 2 === 0 ? 30 : 50);
      
      const result = cache.calculateVisibleRangeCached(
        100,
        200,
        getH,
        100,
        1
      );
      
      expect(result.startIndex).toBeGreaterThanOrEqual(0);
      expect(result.endIndex).toBeLessThan(100);
    });
  });

  describe('Performance', () => {
    it('should handle large lists efficiently', () => {
      const startTime = performance.now();
      
      // 测试10000项列表
      const result = calculateVisibleRange(
        100000,
        800,
        40,
        10000,
        5
      );
      
      const endTime = performance.now();
      const executionTime = endTime - startTime;
      
      expect(result.startIndex).toBeGreaterThan(0);
      expect(result.endIndex).toBeLessThan(10000);
      expect(executionTime).toBeLessThan(10); // 应该在10ms内完成
    });

    it('should be faster with cache for repeated calculations', () => {
      const cache = new VirtualScrollCache();
      const itemHeight = 40;
      
      // 首次计算（建立缓存）
      const startTime1 = performance.now();
      cache.calculateVisibleRangeCached(0, 400, itemHeight, 10000, 5);
      const time1 = performance.now() - startTime1;
      
      // 第二次计算（使用缓存）
      const startTime2 = performance.now();
      cache.calculateVisibleRangeCached(400, 400, itemHeight, 10000, 5);
      const time2 = performance.now() - startTime2;
      
      // 缓存版本应该更快或相当
      expect(time2).toBeLessThanOrEqual(time1 * 2); // 允许一些误差
    });
  });

  describe('Edge cases', () => {
    it('should handle empty list', () => {
      const result = calculateVisibleRange(
        0,
        400,
        40,
        0,
        5
      );
      
      expect(result.startIndex).toBe(0);
      expect(result.endIndex).toBe(-1);
      expect(result.visibleItems).toHaveLength(0);
      expect(result.totalHeight).toBe(0);
    });

    it('should handle very small container', () => {
      const result = calculateVisibleRange(
        0,
        10,
        40,
        100,
        0
      );
      
      expect(result.startIndex).toBe(0);
      expect(result.endIndex).toBe(0);
      expect(result.visibleItems).toHaveLength(1);
    });

    it('should handle scroll beyond total height', () => {
      const result = calculateVisibleRange(
        50000,
        400,
        40,
        100,
        5
      );
      
      expect(result.startIndex).toBeLessThan(100);
      expect(result.endIndex).toBe(99);
    });
  });
});