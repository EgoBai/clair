import { describe, it, expect } from 'vitest';

/**
 * 虚拟列表组件逻辑测试
 * VirtualList 无限滚动/窗口化渲染逻辑
 */

interface VirtualListConfig {
  itemHeight: number;
  containerHeight: number;
  overscan: number;
  totalCount: number;
}

interface VisibleRange {
  start: number;
  end: number;
  offsetY: number;
}

function calcVisibleRange(config: VirtualListConfig, scrollTop: number): VisibleRange {
  const { itemHeight, containerHeight, overscan, totalCount } = config;
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const end = Math.min(totalCount - 1, start + visibleCount + overscan * 2);
  return {
    start,
    end,
    offsetY: start * itemHeight,
  };
}

function calcTotalHeight(config: VirtualListConfig): number {
  return config.totalCount * config.itemHeight;
}

function calcScrollToIndex(config: VirtualListConfig, index: number): number {
  const maxScroll = calcTotalHeight(config) - config.containerHeight;
  const targetScroll = index * config.itemHeight;
  return Math.max(0, Math.min(maxScroll, targetScroll));
}

function isItemVisible(
  config: VirtualListConfig,
  scrollTop: number,
  index: number
): boolean {
  const { itemHeight, containerHeight } = config;
  const itemTop = index * itemHeight;
  const itemBottom = itemTop + itemHeight;
  return itemBottom > scrollTop && itemTop < scrollTop + containerHeight;
}

function shouldLoadMore(
  totalCount: number,
  loadedCount: number,
  threshold: number
): boolean {
  return totalCount - loadedCount <= threshold && loadedCount < totalCount;
}

function calcScrollProgress(
  scrollTop: number,
  totalHeight: number,
  containerHeight: number
): number {
  const maxScroll = totalHeight - containerHeight;
  if (maxScroll <= 0) return 1;
  return Math.min(1, Math.max(0, scrollTop / maxScroll));
}

function getStickyIndices(
  indices: number[],
  scrollTop: number,
  itemHeight: number
): number[] {
  return indices.filter(idx => idx * itemHeight <= scrollTop);
}

function debounceScroll(
  fn: (...args: any[]) => void,
  delay: number
): { run: (...args: any[]) => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    run: (...args: any[]) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    },
    cancel: () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

function estimateItemHeight(
  heights: number[],
  defaultHeight: number
): number[] {
  const known = heights.filter(h => h > 0);
  if (known.length === 0) return heights.map(() => defaultHeight);
  const avg = known.reduce((a, b) => a + b, 0) / known.length;
  return heights.map(h => (h > 0 ? h : Math.round(avg)));
}

function calcAccumulatedHeight(heights: number[], upToIndex: number): number {
  let total = 0;
  for (let i = 0; i < Math.min(upToIndex, heights.length); i++) {
    total += heights[i];
  }
  return total;
}

describe('虚拟列表逻辑', () => {
  describe('calcVisibleRange', () => {
    const baseConfig: VirtualListConfig = {
      itemHeight: 50,
      containerHeight: 500,
      overscan: 2,
      totalCount: 1000,
    };

    it('should calculate range at top', () => {
      const range = calcVisibleRange(baseConfig, 0);
      expect(range.start).toBe(0);
      expect(range.end).toBeGreaterThanOrEqual(11); // 10 visible + 2 overscan
      expect(range.offsetY).toBe(0);
    });

    it('should calculate range with scroll', () => {
      const range = calcVisibleRange(baseConfig, 1000);
      expect(range.start).toBe(18); // floor(1000/50) - 2 = 18
      expect(range.offsetY).toBe(900); // 18 * 50
    });

    it('should not exceed total count', () => {
      const range = calcVisibleRange({ ...baseConfig, totalCount: 10 }, 0);
      expect(range.end).toBeLessThan(10);
    });
  });

  describe('calcTotalHeight', () => {
    it('should multiply count by item height', () => {
      expect(calcTotalHeight({ itemHeight: 50, containerHeight: 500, overscan: 2, totalCount: 100 })).toBe(5000);
    });

    it('should handle zero count', () => {
      expect(calcTotalHeight({ itemHeight: 50, containerHeight: 500, overscan: 2, totalCount: 0 })).toBe(0);
    });
  });

  describe('calcScrollToIndex', () => {
    it('should scroll to specific index', () => {
      expect(calcScrollToIndex({ itemHeight: 50, containerHeight: 500, overscan: 2, totalCount: 100 }, 10)).toBe(500);
    });

    it('should not go negative', () => {
      expect(calcScrollToIndex({ itemHeight: 50, containerHeight: 500, overscan: 2, totalCount: 100 }, -1)).toBe(0);
    });

    it('should cap at max scroll', () => {
      const height = calcScrollToIndex({ itemHeight: 50, containerHeight: 500, overscan: 2, totalCount: 10 }, 9);
      expect(height).toBeLessThanOrEqual(10 * 50 - 500);
    });
  });

  describe('isItemVisible', () => {
    const config: VirtualListConfig = { itemHeight: 50, containerHeight: 500, overscan: 0, totalCount: 100 };

    it('should detect visible items', () => {
      expect(isItemVisible(config, 0, 0)).toBe(true);
      expect(isItemVisible(config, 0, 9)).toBe(true);
    });

    it('should detect items above viewport', () => {
      expect(isItemVisible(config, 500, 0)).toBe(false);
    });

    it('should detect items below viewport', () => {
      expect(isItemVisible(config, 0, 20)).toBe(false);
    });
  });

  describe('shouldLoadMore', () => {
    it('should trigger when near end', () => {
      expect(shouldLoadMore(100, 95, 10)).toBe(true);
      expect(shouldLoadMore(100, 90, 10)).toBe(true);
    });

    it('should not trigger when far from end', () => {
      expect(shouldLoadMore(100, 50, 10)).toBe(false);
    });

    it('should not trigger when fully loaded', () => {
      expect(shouldLoadMore(100, 100, 10)).toBe(false);
    });
  });

  describe('calcScrollProgress', () => {
    it('should return 0 at top', () => {
      expect(calcScrollProgress(0, 1000, 500)).toBe(0);
    });

    it('should return 1 at bottom', () => {
      expect(calcScrollProgress(500, 1000, 500)).toBe(1);
    });

    it('should return 0.5 at middle', () => {
      expect(calcScrollProgress(250, 1000, 500)).toBe(0.5);
    });

    it('should handle container taller than content', () => {
      expect(calcScrollProgress(0, 100, 500)).toBe(1);
    });
  });

  describe('getStickyIndices', () => {
    it('should return indices at or above scroll position', () => {
      const result = getStickyIndices([0, 5, 10, 20], 300, 50);
      expect(result).toEqual([0, 5]); // 0*50=0, 5*50=250 both <= 300
    });

    it('should return empty when nothing sticky', () => {
      const result = getStickyIndices([10, 20], 0, 50);
      expect(result).toEqual([]);
    });
  });

  describe('estimateItemHeight', () => {
    it('should use known heights where available', () => {
      const result = estimateItemHeight([50, 0, 60, 0], 40);
      expect(result[0]).toBe(50);
      expect(result[2]).toBe(60);
    });

    it('should fill unknown with average', () => {
      const result = estimateItemHeight([50, 0, 60, 0], 40);
      expect(result[1]).toBe(55); // avg of 50 and 60
      expect(result[3]).toBe(55);
    });

    it('should use default when no known heights', () => {
      const result = estimateItemHeight([0, 0, 0], 40);
      expect(result.every(h => h === 40)).toBe(true);
    });
  });

  describe('calcAccumulatedHeight', () => {
    it('should sum heights up to index', () => {
      expect(calcAccumulatedHeight([10, 20, 30, 40], 3)).toBe(60);
    });

    it('should handle zero index', () => {
      expect(calcAccumulatedHeight([10, 20, 30], 0)).toBe(0);
    });

    it('should clamp to array length', () => {
      expect(calcAccumulatedHeight([10, 20], 10)).toBe(30);
    });
  });
});
