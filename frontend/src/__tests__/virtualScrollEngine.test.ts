import { describe, it, expect } from 'vitest';

/**
 * 虚拟滚动引擎测试
 */

interface VirtualScrollConfig {
  itemHeight: number;
  containerHeight: number;
  overscan: number;
  totalCount: number;
}

interface ScrollState {
  scrollTop: number;
  startIndex: number;
  endIndex: number;
  visibleCount: number;
  offsetY: number;
  totalHeight: number;
}

function calcScrollState(config: VirtualScrollConfig, scrollTop: number): ScrollState {
  const { itemHeight, containerHeight, overscan, totalCount } = config;
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const rawStart = Math.floor(scrollTop / itemHeight);
  const startIndex = Math.max(0, rawStart - overscan);
  const endIndex = Math.min(totalCount - 1, rawStart + visibleCount + overscan);
  const offsetY = startIndex * itemHeight;
  const totalHeight = totalCount * itemHeight;

  return {
    scrollTop,
    startIndex,
    endIndex,
    visibleCount,
    offsetY,
    totalHeight,
  };
}

function getVisibleItems<T>(items: T[], state: ScrollState): T[] {
  return items.slice(state.startIndex, state.endIndex + 1);
}

function scrollToIndex(config: VirtualScrollConfig, index: number): number {
  return Math.min(index * config.itemHeight, config.totalCount * config.itemHeight - config.containerHeight);
}

function smoothScroll(current: number, target: number, duration: number, elapsed: number): number {
  const progress = Math.min(elapsed / duration, 1);
  const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
  return current + (target - current) * eased;
}

describe('Virtual Scroll Engine', () => {
  const config: VirtualScrollConfig = {
    itemHeight: 40,
    containerHeight: 400,
    overscan: 5,
    totalCount: 1000,
  };

  describe('滚动状态计算', () => {
    it('顶部应该从0开始', () => {
      const state = calcScrollState(config, 0);
      expect(state.startIndex).toBe(0);
      expect(state.endIndex).toBeGreaterThan(0);
    });

    it('应该计算可见数量', () => {
      const state = calcScrollState(config, 0);
      expect(state.visibleCount).toBe(10); // 400/40
    });

    it('应该包含overscan', () => {
      const state = calcScrollState(config, 0);
      const visibleItems = state.endIndex - state.startIndex + 1;
      expect(visibleItems).toBeGreaterThan(state.visibleCount);
    });

    it('应该计算总高度', () => {
      const state = calcScrollState(config, 0);
      expect(state.totalHeight).toBe(40000); // 1000 * 40
    });

    it('应该计算offsetY', () => {
      const state = calcScrollState(config, 400);
      expect(state.offsetY).toBeGreaterThanOrEqual(0);
    });

    it('底部不应该超出总数', () => {
      const state = calcScrollState(config, 39000);
      expect(state.endIndex).toBeLessThanOrEqual(999);
    });
  });

  describe('可见项目', () => {
    it('应该返回正确范围的项目', () => {
      const items = Array.from({ length: 1000 }, (_, i) => i);
      const state = calcScrollState(config, 400);
      const visible = getVisibleItems(items, state);
      expect(visible.length).toBeGreaterThan(0);
      expect(visible[0]).toBe(state.startIndex);
    });
  });

  describe('滚动到指定索引', () => {
    it('应该计算正确的滚动位置', () => {
      const scrollTop = scrollToIndex(config, 100);
      expect(scrollTop).toBe(4000); // 100 * 40
    });

    it('超出范围应该限制到最大值', () => {
      const scrollTop = scrollToIndex(config, 2000);
      expect(scrollTop).toBeLessThanOrEqual(config.totalCount * config.itemHeight);
    });
  });

  describe('平滑滚动', () => {
    it('起始位置应该是当前位置', () => {
      expect(smoothScroll(0, 100, 300, 0)).toBe(0);
    });

    it('结束位置应该是目标位置', () => {
      expect(smoothScroll(0, 100, 300, 300)).toBe(100);
    });

    it('中间位置应该在范围内', () => {
      const pos = smoothScroll(0, 100, 300, 150);
      expect(pos).toBeGreaterThan(0);
      expect(pos).toBeLessThan(100);
    });
  });

  describe('边界条件', () => {
    it('空列表应该正常工作', () => {
      const emptyConfig: VirtualScrollConfig = { ...config, totalCount: 0 };
      const state = calcScrollState(emptyConfig, 0);
      expect(state.startIndex).toBe(0);
      expect(state.endIndex).toBe(-1);
    });

    it('单个项目应该正常工作', () => {
      const singleConfig: VirtualScrollConfig = { ...config, totalCount: 1 };
      const state = calcScrollState(singleConfig, 0);
      expect(state.startIndex).toBe(0);
      expect(state.endIndex).toBe(0);
    });
  });
});
