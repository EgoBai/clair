import { describe, it, expect } from 'vitest';
import {
  calculateVisibleRange,
  calculateUniformVisibleRange,
  createInfiniteScrollState,
  calculateScrollPosition,
  scrollToIndex,
  calculateGridVisibleRange,
} from '../utils/virtualScrollEngine';

describe('calculateUniformVisibleRange', () => {
  it('应计算可见范围', () => {
    const result = calculateUniformVisibleRange(0, 300, 50, 100);
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBeGreaterThan(0);
    expect(result.totalHeight).toBe(5000);
  });

  it('滚动后应更新范围', () => {
    const r1 = calculateUniformVisibleRange(0, 300, 50, 100);
    const r2 = calculateUniformVisibleRange(500, 300, 50, 100);
    expect(r2.startIndex).toBeGreaterThan(r1.startIndex);
  });

  it('offsetY应正确', () => {
    const result = calculateUniformVisibleRange(250, 300, 50, 100);
    expect(result.offsetY).toBe(result.startIndex * 50);
  });

  it('应包含overscan', () => {
    const result = calculateUniformVisibleRange(100, 300, 50, 100, 3);
    const visibleCount = result.endIndex - result.startIndex + 1;
    expect(visibleCount).toBeGreaterThan(Math.ceil(300 / 50));
  });

  it('边界应正确', () => {
    const result = calculateUniformVisibleRange(4950, 300, 50, 100);
    expect(result.endIndex).toBeLessThanOrEqual(99);
  });
});

describe('calculateVisibleRange', () => {
  it('应计算动态高度可见范围', () => {
    const getH = (i: number) => i % 2 === 0 ? 50 : 30;
    const result = calculateVisibleRange(0, 300, getH, 100);
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBeGreaterThan(0);
  });

  it('totalHeight应为所有项高度之和', () => {
    const getH = (i: number) => 50;
    const result = calculateVisibleRange(0, 300, getH, 10);
    expect(result.totalHeight).toBe(500);
  });
});

describe('createInfiniteScrollState', () => {
  it('初始状态', () => {
    const { state } = createInfiniteScrollState(20);
    expect(state.hasMore).toBe(true);
    expect(state.loading).toBe(false);
    expect(state.page).toBe(0);
  });

  it('loadNext应加载下一页', () => {
    const { state, loadNext } = createInfiniteScrollState(20);
    loadNext();
    expect(state.loading).toBe(true);
    expect(state.page).toBe(1);
  });

  it('loaded应更新状态', () => {
    const { state, loadNext, loaded } = createInfiniteScrollState(20);
    loadNext();
    loaded(20);
    expect(state.loading).toBe(false);
    expect(state.totalLoaded).toBe(20);
    expect(state.hasMore).toBe(true);
  });

  it('不足页大小应标记无更多', () => {
    const { state, loadNext, loaded } = createInfiniteScrollState(20);
    loadNext();
    loaded(10);
    expect(state.hasMore).toBe(false);
  });

  it('reset应重置', () => {
    const { state, loadNext, loaded, reset } = createInfiniteScrollState(20);
    loadNext();
    loaded(20);
    reset();
    expect(state.page).toBe(0);
    expect(state.totalLoaded).toBe(0);
    expect(state.hasMore).toBe(true);
  });

  it('shouldLoad应判断是否需要加载', () => {
    const { shouldLoad, loadNext } = createInfiniteScrollState(20);
    expect(shouldLoad(100, 200)).toBe(true);
    expect(shouldLoad(500, 200)).toBe(false);
    loadNext();
    expect(shouldLoad(100, 200)).toBe(false); // loading中
  });
});

describe('calculateScrollPosition', () => {
  it('应计算滚动位置', () => {
    expect(calculateScrollPosition(0, 50)).toBe(0);
    expect(calculateScrollPosition(5, 50)).toBe(250);
    expect(calculateScrollPosition(10, 50)).toBe(500);
  });

  it('动态高度应正确', () => {
    const getH = (i: number) => i % 2 === 0 ? 50 : 30;
    expect(calculateScrollPosition(0, getH)).toBe(0);
    expect(calculateScrollPosition(1, getH)).toBe(50);
    expect(calculateScrollPosition(2, getH)).toBe(80);
  });
});

describe('scrollToIndex', () => {
  it('已在可视范围不应滚动', () => {
    const result = scrollToIndex(3, 50, 100, 300, 100);
    expect(result.shouldScroll).toBe(false);
  });

  it('超出范围应滚动', () => {
    const result = scrollToIndex(20, 50, 0, 300, 100);
    expect(result.shouldScroll).toBe(true);
    expect(result.targetScrollTop).toBeGreaterThan(0);
  });

  it('滚动位置不应为负', () => {
    const result = scrollToIndex(0, 50, 500, 300, 100);
    expect(result.targetScrollTop).toBeGreaterThanOrEqual(0);
  });

  it('不应超过最大滚动', () => {
    const result = scrollToIndex(99, 50, 0, 300, 100);
    expect(result.targetScrollTop).toBeLessThanOrEqual(100 * 50 - 300);
  });
});

describe('calculateGridVisibleRange', () => {
  it('应计算网格可见范围', () => {
    const result = calculateGridVisibleRange(0, 400, 800, 200, 200, 100);
    expect(result.totalRows).toBeGreaterThan(0);
    expect(result.visibleIndices.length).toBeGreaterThan(0);
  });

  it('应正确计算列数', () => {
    const result = calculateGridVisibleRange(0, 400, 800, 200, 200, 100);
    // 800 / 200 = 4列
    expect(result.endCol - result.startCol + 1).toBe(4);
  });

  it('totalHeight应正确', () => {
    const result = calculateGridVisibleRange(0, 400, 800, 200, 200, 100);
    expect(result.totalHeight).toBe(result.totalRows * 200);
  });
});
