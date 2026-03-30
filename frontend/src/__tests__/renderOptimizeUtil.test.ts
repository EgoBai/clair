import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateVirtualScroll,
  // Pure utility tests - no React hooks needed
} from '../utils/renderOptimize';

// ==================== 虚拟滚动计算 ====================
describe('renderOptimize - calculateVirtualScroll', () => {
  it('should calculate visible range for simple case', () => {
    const result = calculateVirtualScroll({
      itemHeight: 50,
      containerHeight: 500,
      totalCount: 100,
      scrollTop: 0,
    });
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBeLessThan(100);
    expect(result.totalHeight).toBe(5000);
  });

  it('should add overscan buffer', () => {
    const withOverscan = calculateVirtualScroll({
      itemHeight: 50,
      containerHeight: 500,
      totalCount: 100,
      scrollTop: 0,
      overscan: 10,
    });
    const withoutOverscan = calculateVirtualScroll({
      itemHeight: 50,
      containerHeight: 500,
      totalCount: 100,
      scrollTop: 0,
      overscan: 0,
    });
    expect(withOverscan.endIndex).toBeGreaterThanOrEqual(withoutOverscan.endIndex);
  });

  it('should handle scroll position at middle', () => {
    const result = calculateVirtualScroll({
      itemHeight: 50,
      containerHeight: 500,
      totalCount: 100,
      scrollTop: 1250,
    });
    expect(result.startIndex).toBeGreaterThan(0);
    expect(result.offsetY).toBeGreaterThan(0);
  });

  it('should handle scroll at end of list', () => {
    const result = calculateVirtualScroll({
      itemHeight: 50,
      containerHeight: 500,
      totalCount: 100,
      scrollTop: 4500,
    });
    expect(result.endIndex).toBe(99);
  });

  it('should not go below 0 for startIndex', () => {
    const result = calculateVirtualScroll({
      itemHeight: 50,
      containerHeight: 500,
      totalCount: 10,
      scrollTop: 0,
      overscan: 20,
    });
    expect(result.startIndex).toBe(0);
  });

  it('should not exceed totalCount - 1 for endIndex', () => {
    const result = calculateVirtualScroll({
      itemHeight: 50,
      containerHeight: 500,
      totalCount: 5,
      scrollTop: 0,
    });
    expect(result.endIndex).toBeLessThan(5);
  });

  it('should calculate totalHeight correctly', () => {
    const result = calculateVirtualScroll({
      itemHeight: 30,
      containerHeight: 600,
      totalCount: 200,
      scrollTop: 0,
    });
    expect(result.totalHeight).toBe(6000);
  });

  it('should calculate offsetY from startIndex', () => {
    const result = calculateVirtualScroll({
      itemHeight: 50,
      containerHeight: 500,
      totalCount: 100,
      scrollTop: 2000,
    });
    expect(result.offsetY).toBe(result.startIndex * 50);
  });

  it('should count visibleItems correctly', () => {
    const result = calculateVirtualScroll({
      itemHeight: 50,
      containerHeight: 500,
      totalCount: 100,
      scrollTop: 0,
    });
    expect(result.visibleItems).toBe(result.endIndex - result.startIndex + 1);
  });

  it('should handle zero container height', () => {
    const result = calculateVirtualScroll({
      itemHeight: 50,
      containerHeight: 0,
      totalCount: 100,
      scrollTop: 0,
    });
    expect(result.visibleItems).toBeGreaterThan(0);
  });

  it('should handle single item', () => {
    const result = calculateVirtualScroll({
      itemHeight: 50,
      containerHeight: 500,
      totalCount: 1,
      scrollTop: 0,
    });
    expect(result.endIndex).toBe(0);
    expect(result.totalHeight).toBe(50);
  });

  it('should handle very large lists', () => {
    const result = calculateVirtualScroll({
      itemHeight: 40,
      containerHeight: 800,
      totalCount: 100000,
      scrollTop: 50000,
    });
    expect(result.endIndex).toBeLessThan(100000);
    expect(result.totalHeight).toBe(4000000);
  });

  it('should handle itemHeight larger than container', () => {
    const result = calculateVirtualScroll({
      itemHeight: 1000,
      containerHeight: 500,
      totalCount: 10,
      scrollTop: 0,
    });
    expect(result.visibleItems).toBeGreaterThanOrEqual(1);
  });

  it('should default overscan to 5', () => {
    const defaultResult = calculateVirtualScroll({
      itemHeight: 50,
      containerHeight: 500,
      totalCount: 100,
      scrollTop: 0,
    });
    const explicitResult = calculateVirtualScroll({
      itemHeight: 50,
      containerHeight: 500,
      totalCount: 100,
      scrollTop: 0,
      overscan: 5,
    });
    expect(defaultResult.startIndex).toBe(explicitResult.startIndex);
    expect(defaultResult.endIndex).toBe(explicitResult.endIndex);
  });

  it('should handle fractional scroll positions', () => {
    const result = calculateVirtualScroll({
      itemHeight: 50,
      containerHeight: 500,
      scrollTop: 123.456,
      totalCount: 100,
    });
    expect(Number.isInteger(result.startIndex)).toBe(true);
    expect(Number.isInteger(result.endIndex)).toBe(true);
  });

  it('should maintain consistency across different scroll positions', () => {
    for (let scrollTop = 0; scrollTop <= 4950; scrollTop += 50) {
      const result = calculateVirtualScroll({
        itemHeight: 50,
        containerHeight: 500,
        totalCount: 100,
        scrollTop,
      });
      expect(result.startIndex).toBeGreaterThanOrEqual(0);
      expect(result.endIndex).toBeLessThan(100);
      expect(result.startIndex).toBeLessThanOrEqual(result.endIndex);
    }
  });
});
