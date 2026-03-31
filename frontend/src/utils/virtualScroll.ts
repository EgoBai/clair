/**
 * 虚拟滚动工具
 * Virtual Scroll Utilities
 *
 * 高性能长列表渲染、虚拟化表格、动态高度支持
 */

export interface VirtualScrollConfig {
  itemHeight: number;
  containerHeight: number;
  overscan: number;
  totalCount: number;
  scrollTop: number;
}

export interface VirtualScrollResult {
  startIndex: number;
  endIndex: number;
  visibleItems: number;
  totalHeight: number;
  offsetY: number;
  items: Array<{ index: number; top: number; height: number }>;
}

/**
 * 计算虚拟滚动可见范围
 */
export function calculateVirtualRange(config: VirtualScrollConfig): VirtualScrollResult {
  const { itemHeight, containerHeight, overscan, totalCount, scrollTop } = config;

  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const rawStart = Math.floor(scrollTop / itemHeight);
  const startIndex = Math.max(0, rawStart - overscan);
  const endIndex = Math.min(totalCount - 1, rawStart + visibleCount + overscan);

  const items: Array<{ index: number; top: number; height: number }> = [];
  for (let i = startIndex; i <= endIndex; i++) {
    items.push({ index: i, top: i * itemHeight, height: itemHeight });
  }

  return {
    startIndex,
    endIndex,
    visibleItems: visibleCount,
    totalHeight: totalCount * itemHeight,
    offsetY: startIndex * itemHeight,
    items,
  };
}

/**
 * 动态高度虚拟滚动
 */
export interface DynamicItemMeta {
  height: number;
  offset: number;
}

export function buildDynamicLayout(
  heights: number[],
  containerHeight: number,
  scrollTop: number,
  overscan: number = 5
): {
  startIndex: number;
  endIndex: number;
  totalHeight: number;
  items: DynamicItemMeta[];
} {
  const offsets: number[] = [0];
  for (let i = 1; i < heights.length; i++) {
    offsets.push(offsets[i - 1] + heights[i - 1]);
  }
  const totalHeight = offsets[offsets.length - 1] + (heights[heights.length - 1] || 0);

  let startIndex = 0;
  for (let i = 0; i < offsets.length; i++) {
    if (offsets[i] + heights[i] > scrollTop) {
      startIndex = i;
      break;
    }
  }
  startIndex = Math.max(0, startIndex - overscan);

  let endIndex = startIndex;
  const endThreshold = scrollTop + containerHeight;
  for (let i = startIndex; i < offsets.length; i++) {
    endIndex = i;
    if (offsets[i] > endThreshold) break;
  }
  endIndex = Math.min(heights.length - 1, endIndex + overscan);

  const items: DynamicItemMeta[] = [];
  for (let i = startIndex; i <= endIndex; i++) {
    items.push({ height: heights[i], offset: offsets[i] });
  }

  return { startIndex, endIndex, totalHeight, items };
}

/**
 * 二分搜索可见范围（大数据集优化）
 * 找到第一个 offset >= scrollTop 的索引
 */
export function binarySearchStartIndex(offsets: number[], scrollTop: number): number {
  let low = 0;
  let high = offsets.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (offsets[mid] < scrollTop) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return Math.max(0, low - 1);
}

/**
 * 滚动位置记忆
 */
export class ScrollPositionManager {
  private positions: Map<string, number> = new Map();

  save(key: string, scrollTop: number): void {
    this.positions.set(key, scrollTop);
  }

  restore(key: string): number {
    return this.positions.get(key) || 0;
  }

  clear(key?: string): void {
    if (key) this.positions.delete(key);
    else this.positions.clear();
  }
}
