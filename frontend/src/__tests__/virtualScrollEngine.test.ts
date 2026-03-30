import { describe, it, expect } from 'vitest';

describe('虚拟滚动引擎', () => {
  interface ScrollConfig {
    totalItems: number; itemHeight: number; containerHeight: number;
    scrollTop: number; overscan?: number;
  }
  interface VisibleRange { start: number; end: number; offsetY: number; totalHeight: number; }

  function calcVisibleRange(config: ScrollConfig): VisibleRange {
    const { totalItems, itemHeight, containerHeight, scrollTop, overscan = 5 } = config;
    const totalHeight = totalItems * itemHeight;
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const end = Math.min(totalItems - 1, start + visibleCount + overscan * 2);
    const offsetY = start * itemHeight;
    return { start, end, offsetY, totalHeight };
  }
  function scrollToIndex(index: number, itemHeight: number, containerHeight: number, totalItems: number): number {
    const maxScroll = totalItems * itemHeight - containerHeight;
    const targetScroll = index * itemHeight;
    return Math.min(Math.max(0, targetScroll), maxScroll);
  }
  function getItemAtScroll(scrollTop: number, itemHeight: number): number {
    return Math.floor(scrollTop / itemHeight);
  }
  function isIndexVisible(index: number, scrollTop: number, itemHeight: number, containerHeight: number): boolean {
    const top = index * itemHeight;
    return top >= scrollTop && top < scrollTop + containerHeight;
  }
  function calcScrollToCenter(index: number, itemHeight: number, containerHeight: number, totalItems: number): number {
    const centerOffset = containerHeight / 2 - itemHeight / 2;
    const targetScroll = index * itemHeight - centerOffset;
    return Math.min(Math.max(0, targetScroll), totalItems * itemHeight - containerHeight);
  }
  function estimateScrollFromOffset(offsetY: number, itemHeight: number): number {
    return Math.floor(offsetY / itemHeight);
  }

  it('初始加载可见范围', () => {
    const r = calcVisibleRange({ totalItems: 1000, itemHeight: 40, containerHeight: 400, scrollTop: 0 });
    expect(r.start).toBe(0);
    expect(r.end).toBeGreaterThanOrEqual(10);
    expect(r.offsetY).toBe(0);
  });

  it('滚动后可见范围', () => {
    const r = calcVisibleRange({ totalItems: 1000, itemHeight: 40, containerHeight: 400, scrollTop: 400 });
    expect(r.start).toBeGreaterThan(0);
    expect(r.offsetY).toBeGreaterThan(0);
  });

  it('总高度正确', () => {
    const r = calcVisibleRange({ totalItems: 100, itemHeight: 50, containerHeight: 300, scrollTop: 0 });
    expect(r.totalHeight).toBe(5000);
  });

  it('结束索引不超过总数', () => {
    const r = calcVisibleRange({ totalItems: 20, itemHeight: 40, containerHeight: 400, scrollTop: 0 });
    expect(r.end).toBeLessThanOrEqual(19);
  });

  it('底部滚动范围', () => {
    const r = calcVisibleRange({ totalItems: 100, itemHeight: 40, containerHeight: 400, scrollTop: 3600 });
    expect(r.end).toBe(99);
  });

  it('自定义overscan', () => {
    const r1 = calcVisibleRange({ totalItems: 1000, itemHeight: 40, containerHeight: 400, scrollTop: 400, overscan: 0 });
    const r2 = calcVisibleRange({ totalItems: 1000, itemHeight: 40, containerHeight: 400, scrollTop: 400, overscan: 10 });
    expect(r2.end - r2.start).toBeGreaterThan(r1.end - r1.start);
  });

  it('滚动到索引', () => {
    const scroll = scrollToIndex(50, 40, 400, 100);
    expect(scroll).toBe(2000);
  });

  it('滚动到底部边界', () => {
    const scroll = scrollToIndex(99, 40, 400, 100);
    expect(scroll).toBe(3600); // 100*40-400
  });

  it('滚动到顶部', () => {
    expect(scrollToIndex(0, 40, 400, 100)).toBe(0);
  });

  it('获取当前滚动位置索引', () => {
    expect(getItemAtScroll(400, 40)).toBe(10);
    expect(getItemAtScroll(0, 40)).toBe(0);
  });

  it('索引可见性检查', () => {
    expect(isIndexVisible(5, 0, 40, 400)).toBe(true);
    expect(isIndexVisible(15, 0, 40, 400)).toBe(false);
  });

  it('居中滚动', () => {
    const scroll = calcScrollToCenter(10, 40, 400, 100);
    expect(scroll).toBe(220); // 10*40 - 400/2 + 40/2
  });

  it('居中滚动顶部边界', () => {
    expect(calcScrollToCenter(0, 40, 400, 100)).toBe(0);
  });

  it('居中滚动底部边界', () => {
    const scroll = calcScrollToCenter(99, 40, 400, 100);
    expect(scroll).toBe(3600);
  });

  it('偏移量估算', () => {
    expect(estimateScrollFromOffset(200, 40)).toBe(5);
  });

  it('空列表', () => {
    const r = calcVisibleRange({ totalItems: 0, itemHeight: 40, containerHeight: 400, scrollTop: 0 });
    expect(r.totalHeight).toBe(0);
    expect(r.end).toBe(-1);
  });

  it('单行列表', () => {
    const r = calcVisibleRange({ totalItems: 1, itemHeight: 40, containerHeight: 400, scrollTop: 0 });
    expect(r.start).toBe(0);
    expect(r.end).toBe(0);
  });

  it('极小容器', () => {
    const r = calcVisibleRange({ totalItems: 100, itemHeight: 40, containerHeight: 10, scrollTop: 0 });
    expect(r.end).toBeGreaterThan(0);
  });

  it('偏移量是itemHeight整数倍', () => {
    const r = calcVisibleRange({ totalItems: 100, itemHeight: 40, containerHeight: 400, scrollTop: 300 });
    expect(r.offsetY % 40).toBe(0);
  });
});
