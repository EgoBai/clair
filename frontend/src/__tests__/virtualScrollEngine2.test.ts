import { describe, it, expect } from 'vitest';

// 虚拟滚动引擎 v2
interface VirtualScrollConfig {
  itemHeight: number;
  containerHeight: number;
  overscan: number;
  totalCount: number;
}

interface VisibleRange { start: number; end: number; offsetY: number; }

function calcVisibleRange(scrollTop: number, config: VirtualScrollConfig): VisibleRange {
  const { itemHeight, containerHeight, overscan, totalCount } = config;
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const end = Math.min(totalCount, start + visibleCount + overscan * 2);
  return { start, end, offsetY: start * itemHeight };
}

function calcTotalHeight(config: VirtualScrollConfig): number {
  return config.totalCount * config.itemHeight;
}

function scrollToItem(index: number, config: VirtualScrollConfig): number {
  return Math.max(0, Math.min(index * config.itemHeight, calcTotalHeight(config) - config.containerHeight));
}

function isItemVisible(index: number, range: VisibleRange): boolean {
  return index >= range.start && index < range.end;
}

function calcScrollProgress(scrollTop: number, config: VirtualScrollConfig): number {
  const totalHeight = calcTotalHeight(config);
  const maxScroll = totalHeight - config.containerHeight;
  return maxScroll > 0 ? Math.min(1, scrollTop / maxScroll) : 0;
}

function calcDynamicTotalHeight(heights: number[]): number {
  return heights.reduce((s, h) => s + h, 0);
}

function calcDynamicVisibleRange(scrollTop: number, heights: number[], containerHeight: number, overscan: number): VisibleRange {
  let accHeight = 0;
  let start = 0;
  for (let i = 0; i < heights.length; i++) {
    if (accHeight + heights[i] > scrollTop) { start = i; break; }
    accHeight += heights[i];
  }
  start = Math.max(0, start - overscan);
  let end = start;
  let viewHeight = 0;
  for (let i = start; i < heights.length && viewHeight < containerHeight + overscan * 50; i++) {
    viewHeight += heights[i];
    end = i + 1;
  }
  end = Math.min(heights.length, end + overscan);
  let offsetY = 0;
  for (let i = 0; i < start; i++) offsetY += heights[i];
  return { start, end, offsetY };
}

function groupItemsBySection<T>(items: T[], sectionSize: number): T[][] {
  const sections: T[][] = [];
  for (let i = 0; i < items.length; i += sectionSize) {
    sections.push(items.slice(i, i + sectionSize));
  }
  return sections;
}

describe('虚拟滚动引擎 v2', () => {
  const config: VirtualScrollConfig = {
    itemHeight: 40,
    containerHeight: 400,
    overscan: 5,
    totalCount: 10000,
  };

  describe('可见范围计算', () => {
    it('顶部应从0开始（含overscan）', () => {
      const range = calcVisibleRange(0, config);
      expect(range.start).toBe(0);
    });

    it('滚动后应更新起始位置', () => {
      const range = calcVisibleRange(2000, config);
      expect(range.start).toBeGreaterThan(0);
    });

    it('end应大于start', () => {
      const range = calcVisibleRange(1000, config);
      expect(range.end).toBeGreaterThan(range.start);
    });

    it('offsetY应等于start*itemHeight', () => {
      const range = calcVisibleRange(500, config);
      expect(range.offsetY).toBe(range.start * config.itemHeight);
    });

    it('end不应超过totalCount', () => {
      const range = calcVisibleRange(399000, config);
      expect(range.end).toBeLessThanOrEqual(config.totalCount);
    });
  });

  describe('总高度', () => {
    it('应为itemHeight*totalCount', () => {
      expect(calcTotalHeight(config)).toBe(400000);
    });
  });

  describe('滚动到指定项', () => {
    it('第一项应为0', () => { expect(scrollToItem(0, config)).toBe(0); });
    it('应正确计算偏移量', () => { expect(scrollToItem(100, config)).toBe(4000); });
    it('不应超过最大滚动距离', () => {
      const maxScroll = calcTotalHeight(config) - config.containerHeight;
      expect(scrollToItem(9999, config)).toBeLessThanOrEqual(maxScroll);
    });
  });

  describe('可见性判断', () => {
    it('范围内应为true', () => {
      expect(isItemVisible(50, { start: 0, end: 100, offsetY: 0 })).toBe(true);
    });

    it('范围外应为false', () => {
      expect(isItemVisible(200, { start: 0, end: 100, offsetY: 0 })).toBe(false);
    });
  });

  describe('滚动进度', () => {
    it('顶部应为0', () => { expect(calcScrollProgress(0, config)).toBe(0); });
    it('底部应接近1', () => {
      const maxScroll = calcTotalHeight(config) - config.containerHeight;
      expect(calcScrollProgress(maxScroll, config)).toBe(1);
    });

    it('中间应为0-1之间', () => {
      const progress = calcScrollProgress(100000, config);
      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThan(1);
    });
  });

  describe('动态高度', () => {
    it('总高度应为所有高度之和', () => {
      expect(calcDynamicTotalHeight([40, 60, 30])).toBe(130);
    });

    it('空数组应为0', () => { expect(calcDynamicTotalHeight([])).toBe(0); });

    it('动态可见范围应正确', () => {
      const heights = Array.from({ length: 100 }, () => 40);
      const range = calcDynamicVisibleRange(200, heights, 400, 3);
      expect(range.start).toBeLessThan(10);
      expect(range.end).toBeGreaterThan(range.start);
    });
  });

  describe('分组', () => {
    it('应按指定大小分组', () => {
      const items = Array.from({ length: 10 }, (_, i) => i);
      expect(groupItemsBySection(items, 3).length).toBe(4);
    });

    it('最后一组可能不满', () => {
      const items = Array.from({ length: 10 }, (_, i) => i);
      const groups = groupItemsBySection(items, 3);
      expect(groups[groups.length - 1].length).toBe(1);
    });
  });
});
