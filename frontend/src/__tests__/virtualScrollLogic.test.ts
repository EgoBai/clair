import { describe, it, expect } from 'vitest';

// 表格虚拟滚动逻辑
interface VirtualListConfig {
  itemHeight: number;
  containerHeight: number;
  totalCount: number;
  overscan: number;
}

interface VirtualListState {
  startIndex: number;
  endIndex: number;
  visibleItems: number;
  scrollTop: number;
  totalHeight: number;
  offsetY: number;
}

function calculateVirtualList(config: VirtualListConfig, scrollTop: number): VirtualListState {
  const { itemHeight, containerHeight, totalCount, overscan } = config;
  const totalHeight = totalCount * itemHeight;
  const visibleItems = Math.ceil(containerHeight / itemHeight);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(totalCount - 1, startIndex + visibleItems + overscan * 2);

  return {
    startIndex,
    endIndex,
    visibleItems,
    scrollTop,
    totalHeight,
    offsetY: startIndex * itemHeight,
  };
}

// 可变高度虚拟列表
interface VariableHeightConfig {
  getItemHeight: (index: number) => number;
  containerHeight: number;
  totalCount: number;
  overscan: number;
}

interface VariableHeightState {
  startIndex: number;
  endIndex: number;
  totalHeight: number;
  offsets: number[];
}

function calculateVariableHeightList(config: VariableHeightConfig, scrollTop: number): VariableHeightState {
  const { getItemHeight, containerHeight, totalCount, overscan } = config;

  // 预计算所有偏移
  const offsets: number[] = [0];
  for (let i = 1; i <= totalCount; i++) {
    offsets[i] = offsets[i - 1] + getItemHeight(i - 1);
  }
  const totalHeight = offsets[totalCount];

  // 二分查找起始索引
  let startIndex = 0;
  let low = 0, high = totalCount - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (offsets[mid] < scrollTop) {
      startIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  // 找结束索引
  let endIndex = startIndex;
  let accumulatedHeight = 0;
  while (endIndex < totalCount && accumulatedHeight < containerHeight) {
    accumulatedHeight += getItemHeight(endIndex);
    endIndex++;
  }

  startIndex = Math.max(0, startIndex - overscan);
  endIndex = Math.min(totalCount - 1, endIndex + overscan);

  return { startIndex, endIndex, totalHeight, offsets };
}

// 表格排序逻辑
interface SortState {
  field: string;
  order: 'asc' | 'desc';
}

function multiColumnSort<T>(data: T[], sorts: SortState[]): T[] {
  return [...data].sort((a, b) => {
    for (const sort of sorts) {
      const aVal = (a as any)[sort.field];
      const bVal = (b as any)[sort.field];

      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      if (comparison !== 0) {
        return sort.order === 'desc' ? -comparison : comparison;
      }
    }
    return 0;
  });
}

// 表格列宽自适应
function calculateColumnWidths(
  headers: string[],
  data: any[][],
  minWidth = 60,
  maxWidth = 300,
  padding = 16
): number[] {
  return headers.map((header, colIdx) => {
    let maxLen = header.length;
    for (const row of data) {
      const cellLen = String(row[colIdx] ?? '').length;
      maxLen = Math.max(maxLen, cellLen);
    }
    // 假设每个字符约8px
    const width = Math.min(maxWidth, Math.max(minWidth, maxLen * 8 + padding * 2));
    return width;
  });
}

describe('表格虚拟滚动逻辑', () => {
  describe('calculateVirtualList', () => {
    const baseConfig: VirtualListConfig = {
      itemHeight: 40,
      containerHeight: 400,
      totalCount: 1000,
      overscan: 5,
    };

    it('应该正确计算可见范围', () => {
      const result = calculateVirtualList(baseConfig, 0);
      expect(result.startIndex).toBe(0);
      expect(result.visibleItems).toBe(10); // 400/40
      expect(result.endIndex).toBeGreaterThan(result.visibleItems);
    });

    it('滚动后应该更新范围', () => {
      const result = calculateVirtualList(baseConfig, 400); // 滚动10行
      expect(result.startIndex).toBeLessThanOrEqual(10);
    });

    it('总高度应该正确', () => {
      const result = calculateVirtualList(baseConfig, 0);
      expect(result.totalHeight).toBe(40000); // 1000 * 40
    });

    it('offsetY应该等于startIndex * itemHeight', () => {
      const result = calculateVirtualList(baseConfig, 1600);
      expect(result.offsetY).toBe(result.startIndex * 40);
    });

    it('endIndex不应该超过totalCount-1', () => {
      const result = calculateVirtualList(baseConfig, 39000);
      expect(result.endIndex).toBeLessThanOrEqual(999);
    });

    it('空列表应该返回0范围', () => {
      const result = calculateVirtualList({ ...baseConfig, totalCount: 0 }, 0);
      expect(result.startIndex).toBe(0);
      expect(result.endIndex).toBe(-1);
    });

    it('overscan应该扩展可见范围', () => {
      const withOverscan = calculateVirtualList({ ...baseConfig, overscan: 10 }, 0);
      const withoutOverscan = calculateVirtualList({ ...baseConfig, overscan: 0 }, 0);
      expect(withOverscan.endIndex - withOverscan.startIndex).toBeGreaterThan(
        withoutOverscan.endIndex - withoutOverscan.startIndex
      );
    });
  });

  describe('calculateVariableHeightList', () => {
    it('应该处理可变高度项', () => {
      const config: VariableHeightConfig = {
        getItemHeight: (i) => i % 2 === 0 ? 40 : 80,
        containerHeight: 200,
        totalCount: 10,
        overscan: 2,
      };
      const result = calculateVariableHeightList(config, 0);
      expect(result.totalHeight).toBe(600); // 5*40 + 5*80
      expect(result.startIndex).toBe(0);
    });

    it('应该正确计算offsets', () => {
      const config: VariableHeightConfig = {
        getItemHeight: () => 50,
        containerHeight: 100,
        totalCount: 5,
        overscan: 0,
      };
      const result = calculateVariableHeightList(config, 0);
      expect(result.offsets).toEqual([0, 50, 100, 150, 200, 250]);
    });

    it('空列表应该返回正确状态', () => {
      const config: VariableHeightConfig = {
        getItemHeight: () => 50,
        containerHeight: 100,
        totalCount: 0,
        overscan: 0,
      };
      const result = calculateVariableHeightList(config, 0);
      expect(result.totalHeight).toBe(0);
      expect(result.startIndex).toBe(0);
    });
  });

  describe('multiColumnSort', () => {
    const data = [
      { name: 'B', price: 10, volume: 100 },
      { name: 'A', price: 20, volume: 50 },
      { name: 'C', price: 10, volume: 200 },
      { name: 'A', price: 15, volume: 100 },
    ];

    it('应该按单字段升序排序', () => {
      const result = multiColumnSort(data, [{ field: 'name', order: 'asc' }]);
      expect(result[0].name).toBe('A');
      expect(result[1].name).toBe('A');
      expect(result[2].name).toBe('B');
    });

    it('应该按单字段降序排序', () => {
      const result = multiColumnSort(data, [{ field: 'price', order: 'desc' }]);
      expect(result[0].price).toBe(20);
      expect(result[3].price).toBe(10);
    });

    it('应该支持多字段排序', () => {
      const result = multiColumnSort(data, [
        { field: 'name', order: 'asc' },
        { field: 'price', order: 'desc' },
      ]);
      // A组: price 20, 15
      expect(result[0].price).toBe(20);
      expect(result[1].price).toBe(15);
    });

    it('不应该修改原数组', () => {
      const original = [...data];
      multiColumnSort(data, [{ field: 'name', order: 'asc' }]);
      expect(data[0].name).toBe(original[0].name);
    });

    it('空数组应该返回空', () => {
      expect(multiColumnSort([], [{ field: 'x', order: 'asc' }])).toEqual([]);
    });
  });

  describe('calculateColumnWidths', () => {
    it('应该计算合理的列宽', () => {
      const widths = calculateColumnWidths(
        ['代码', '名称', '价格'],
        [['600000', '浦发银行股份有限公司', '10.50']],
      );
      expect(widths).toHaveLength(3);
      widths.forEach(w => {
        expect(w).toBeGreaterThanOrEqual(60);
        expect(w).toBeLessThanOrEqual(300);
      });
    });

    it('短内容列应该有最小宽度', () => {
      const widths = calculateColumnWidths(['A'], [['x']]);
      expect(widths[0]).toBeGreaterThanOrEqual(60);
    });

    it('长内容列应该被截断到maxWidth', () => {
      const widths = calculateColumnWidths(
        ['Column'],
        [['x'.repeat(100)]],
        60, 100, 16,
      );
      expect(widths[0]).toBeLessThanOrEqual(100);
    });

    it('应该支持空数据行', () => {
      const widths = calculateColumnWidths(['Header'], [], 60, 300, 16);
      expect(widths).toHaveLength(1);
    });
  });
});
