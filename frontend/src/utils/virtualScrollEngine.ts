/**
 * 虚拟滚动优化引擎
 * 大数据列表渲染优化、动态高度、无限滚动
 */

export interface VirtualScrollConfig {
  itemHeight: number | ((index: number) => number);
  overscan: number;
  containerHeight: number;
  totalCount: number;
  scrollThreshold: number;
}

export interface VirtualScrollResult {
  startIndex: number;
  endIndex: number;
  visibleItems: number[];
  totalHeight: number;
  offsetY: number;
  scrollTop: number;
}

export interface InfiniteScrollState {
  hasMore: boolean;
  loading: boolean;
  page: number;
  pageSize: number;
  totalLoaded: number;
}

/**
 * 计算可见范围
 */
export function calculateVisibleRange(
  scrollTop: number,
  containerHeight: number,
  itemHeight: number | ((i: number) => number),
  totalCount: number,
  overscan: number = 5,
): VirtualScrollResult {
  const getH = typeof itemHeight === 'function' ? itemHeight : () => itemHeight;

  // 二分查找起始索引
  let startIndex = 0;
  let accumulated = 0;
  for (let i = 0; i < totalCount; i++) {
    const h = getH(i);
    if (accumulated + h > scrollTop) {
      startIndex = i;
      break;
    }
    accumulated += h;
  }

  startIndex = Math.max(0, startIndex - overscan);

  // 计算结束索引
  let endIndex = startIndex;
  let visibleHeight = 0;
  for (let i = startIndex; i < totalCount; i++) {
    visibleHeight += getH(i);
    endIndex = i;
    if (visibleHeight >= containerHeight + overscan * getH(i)) break;
  }

  endIndex = Math.min(totalCount - 1, endIndex + overscan);

  // 计算offsetY
  let offsetY = 0;
  for (let i = 0; i < startIndex; i++) {
    offsetY += getH(i);
  }

  // 计算总高度
  let totalHeight = 0;
  for (let i = 0; i < totalCount; i++) {
    totalHeight += getH(i);
  }

  const visibleItems = Array.from({ length: endIndex - startIndex + 1 }, (_, i) => startIndex + i);

  return { startIndex, endIndex, visibleItems, totalHeight, offsetY, scrollTop };
}

/**
 * 等高虚拟滚动
 */
export function calculateUniformVisibleRange(
  scrollTop: number,
  containerHeight: number,
  itemHeight: number,
  totalCount: number,
  overscan: number = 5,
): VirtualScrollResult {
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const endIndex = Math.min(totalCount - 1, startIndex + visibleCount + overscan * 2);

  const visibleItems = Array.from({ length: endIndex - startIndex + 1 }, (_, i) => startIndex + i);

  return {
    startIndex,
    endIndex,
    visibleItems,
    totalHeight: itemHeight * totalCount,
    offsetY: startIndex * itemHeight,
    scrollTop,
  };
}

/**
 * 无限滚动状态管理
 */
export function createInfiniteScrollState(
  pageSize: number = 20,
): {
  state: InfiniteScrollState;
  loadNext: () => void;
  loaded: (count: number) => void;
  reset: () => void;
  shouldLoad: (scrollBottom: number, threshold: number) => boolean;
} {
  const state: InfiniteScrollState = {
    hasMore: true,
    loading: false,
    page: 0,
    pageSize,
    totalLoaded: 0,
  };

  return {
    state,
    loadNext() {
      if (!state.loading && state.hasMore) {
        state.loading = true;
        state.page++;
      }
    },
    loaded(count: number) {
      state.loading = false;
      state.totalLoaded += count;
      if (count < state.pageSize) state.hasMore = false;
    },
    reset() {
      state.hasMore = true;
      state.loading = false;
      state.page = 0;
      state.totalLoaded = 0;
    },
    shouldLoad(scrollBottom: number, threshold: number = 200) {
      return !state.loading && state.hasMore && scrollBottom < threshold;
    },
  };
}

/**
 * 计算滚动位置
 */
export function calculateScrollPosition(
  targetIndex: number,
  itemHeight: number | ((i: number) => number),
): number {
  const getH = typeof itemHeight === 'function' ? itemHeight : () => itemHeight;
  let pos = 0;
  for (let i = 0; i < targetIndex; i++) {
    pos += getH(i);
  }
  return pos;
}

/**
 * 平滑滚动到指定索引
 */
export function scrollToIndex(
  targetIndex: number,
  itemHeight: number,
  currentScrollTop: number,
  containerHeight: number,
  totalCount: number,
): { targetScrollTop: number; shouldScroll: boolean } {
  const targetScrollTop = targetIndex * itemHeight;
  const itemBottom = targetScrollTop + itemHeight;

  // 已经在可视范围内，不需要滚动
  if (targetScrollTop >= currentScrollTop && itemBottom <= currentScrollTop + containerHeight) {
    return { targetScrollTop: currentScrollTop, shouldScroll: false };
  }

  // 滚动到目标位置（居中）
  const centered = targetScrollTop - (containerHeight - itemHeight) / 2;
  const maxScroll = totalCount * itemHeight - containerHeight;

  return {
    targetScrollTop: Math.max(0, Math.min(centered, maxScroll)),
    shouldScroll: true,
  };
}

/**
 * 网格虚拟滚动
 */
export function calculateGridVisibleRange(
  scrollTop: number,
  containerHeight: number,
  containerWidth: number,
  itemWidth: number,
  itemHeight: number,
  totalCount: number,
  gap: number = 0,
  overscan: number = 2,
): { startRow: number; endRow: number; startCol: number; endCol: number; visibleIndices: number[]; totalRows: number; totalHeight: number } {
  const columns = Math.max(1, Math.floor((containerWidth + gap) / (itemWidth + gap)));
  const totalRows = Math.ceil(totalCount / columns);
  const rowHeight = itemHeight + gap;

  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleRows = Math.ceil(containerHeight / rowHeight);
  const endRow = Math.min(totalRows - 1, startRow + visibleRows + overscan * 2);

  const visibleIndices: number[] = [];
  for (let row = startRow; row <= endRow; row++) {
    for (let col = 0; col < columns; col++) {
      const idx = row * columns + col;
      if (idx < totalCount) visibleIndices.push(idx);
    }
  }

  return {
    startRow,
    endRow,
    startCol: 0,
    endCol: columns - 1,
    visibleIndices,
    totalRows,
    totalHeight: totalRows * rowHeight,
  };
}
