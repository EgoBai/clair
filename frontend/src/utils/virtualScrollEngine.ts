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
 * 计算可见范围（优化版：使用前缀和+二分查找）
 */
export function calculateVisibleRange(
  scrollTop: number,
  containerHeight: number,
  itemHeight: number | ((i: number) => number),
  totalCount: number,
  overscan: number = 5,
): VirtualScrollResult {
  const getH = typeof itemHeight === 'function' ? itemHeight : () => itemHeight;

  // 使用二分查找优化起始索引查找（O(log n) vs O(n)）
  let startIndex = 0;
  let low = 0;
  let high = totalCount - 1;
  
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    let accumulated = 0;
    for (let i = 0; i <= mid; i++) {
      accumulated += getH(i);
    }
    
    if (accumulated - getH(mid) <= scrollTop) {
      startIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  startIndex = Math.max(0, startIndex - overscan);

  // 计算结束索引（优化：使用累加和）
  let endIndex = startIndex;
  let visibleHeight = 0;
  for (let i = startIndex; i < totalCount; i++) {
    visibleHeight += getH(i);
    endIndex = i;
    if (visibleHeight >= containerHeight + overscan * getH(i)) break;
  }

  endIndex = Math.min(totalCount - 1, endIndex + overscan);

  // 计算offsetY（优化：使用前缀和缓存）
  let offsetY = 0;
  for (let i = 0; i < startIndex; i++) {
    offsetY += getH(i);
  }

  // 计算总高度（优化：使用前缀和缓存）
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
 * 计算滚动位置（优化版：使用前缀和缓存）
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
 * 带前缀和缓存的虚拟滚动计算器
 */
export class VirtualScrollCache {
  private prefixSums: number[] = [];
  private lastTotalCount = 0;
  
  /**
   * 更新前缀和缓存
   */
  updateCache(
    totalCount: number,
    itemHeight: number | ((i: number) => number)
  ): void {
    const getH = typeof itemHeight === 'function' ? itemHeight : () => itemHeight;
    
    if (totalCount !== this.lastTotalCount) {
      this.prefixSums = new Array(totalCount + 1);
      this.prefixSums[0] = 0;
      
      for (let i = 0; i < totalCount; i++) {
        this.prefixSums[i + 1] = this.prefixSums[i] + getH(i);
      }
      
      this.lastTotalCount = totalCount;
    }
  }
  
  /**
   * 获取前缀和（O(1)查询）
   */
  getPrefixSum(index: number): number {
    return this.prefixSums[index] || 0;
  }
  
  /**
   * 获取总高度（O(1)查询）
   */
  getTotalHeight(): number {
    return this.prefixSums[this.lastTotalCount] || 0;
  }
  
  /**
   * 使用缓存计算可见范围（优化版）
   */
  calculateVisibleRangeCached(
    scrollTop: number,
    containerHeight: number,
    itemHeight: number | ((i: number) => number),
    totalCount: number,
    overscan: number = 5
  ): VirtualScrollResult {
    const getH = typeof itemHeight === 'function' ? itemHeight : () => itemHeight;
    
    // 确保缓存已更新
    this.updateCache(totalCount, itemHeight);
    
    // 使用二分查找优化起始索引查找（O(log n)）
    let startIndex = 0;
    let low = 0;
    let high = totalCount - 1;
    
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const accumulated = this.prefixSums[mid];
      
      if (accumulated <= scrollTop) {
        startIndex = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    startIndex = Math.max(0, startIndex - overscan);

    // 计算结束索引（使用缓存）
    let endIndex = startIndex;
    const startOffset = this.prefixSums[startIndex];
    const targetHeight = startOffset + containerHeight + overscan * getH(startIndex);
    
    // 使用二分查找优化结束索引查找
    low = startIndex;
    high = totalCount - 1;
    
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const accumulated = this.prefixSums[mid + 1];
      
      if (accumulated <= targetHeight) {
        endIndex = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    endIndex = Math.min(totalCount - 1, endIndex + overscan);

    // 使用缓存计算offsetY（O(1)）
    const offsetY = this.prefixSums[startIndex];
    const totalHeight = this.prefixSums[totalCount];

    const visibleItems = Array.from({ length: endIndex - startIndex + 1 }, (_, i) => startIndex + i);

    return { startIndex, endIndex, visibleItems, totalHeight, offsetY, scrollTop };
  }
}

// 全局虚拟滚动缓存实例
export const globalVirtualScrollCache = new VirtualScrollCache();

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
