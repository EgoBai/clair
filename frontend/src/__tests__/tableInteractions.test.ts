import { describe, it, expect } from 'vitest';

// 表格交互逻辑测试
describe('Table Interaction Logic', () => {
  interface Row {
    [key: string]: string | number;
  }

  // 排序
  const sortRows = (rows: Row[], key: string, order: 'asc' | 'desc'): Row[] => {
    return [...rows].sort((a, b) => {
      const va = a[key], vb = b[key];
      if (typeof va === 'number' && typeof vb === 'number') {
        return order === 'asc' ? va - vb : vb - va;
      }
      const sa = String(va), sb = String(vb);
      return order === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
  };

  // 多列排序
  const multiSort = (rows: Row[], sorts: { key: string; order: 'asc' | 'desc' }[]): Row[] => {
    return [...rows].sort((a, b) => {
      for (const { key, order } of sorts) {
        const va = a[key], vb = b[key];
        let cmp: number;
        if (typeof va === 'number' && typeof vb === 'number') {
          cmp = va - vb;
        } else {
          cmp = String(va).localeCompare(String(vb));
        }
        if (cmp !== 0) return order === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  };

  // 列宽自适应
  const calcColumnWidths = (headers: string[], rows: Row[], minWidth: number = 60, maxWidth: number = 300): number[] => {
    return headers.map(h => {
      const headerLen = h.length * 14 + 32;
      const maxDataLen = rows.reduce((max, row) => {
        const val = String(row[h] ?? '');
        return Math.max(max, val.length * 12 + 24);
      }, 0);
      return Math.min(maxWidth, Math.max(minWidth, headerLen, maxDataLen));
    });
  };

  // 虚拟滚动范围
  const calcVirtualRange = (scrollTop: number, rowHeight: number, containerHeight: number, totalRows: number, overscan: number = 5) => {
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / rowHeight);
    const end = Math.min(totalRows, start + visibleCount + overscan * 2);
    return { start, end, offsetY: start * rowHeight };
  };

  // 固定列
  const calcStickyColumns = (columns: string[], freezeCount: number): { frozen: string[]; scrollable: string[] } => {
    return {
      frozen: columns.slice(0, freezeCount),
      scrollable: columns.slice(freezeCount),
    };
  };

  // 行选择
  const toggleRowSelection = (selected: Set<string>, rowKey: string, multiSelect: boolean): Set<string> => {
    const next = multiSelect ? new Set(selected) : new Set<string>();
    if (selected.has(rowKey)) {
      next.delete(rowKey);
    } else {
      next.add(rowKey);
    }
    return next;
  };

  // 全选/取消全选
  const toggleAllSelection = (allKeys: string[], selected: Set<string>): Set<string> => {
    const allSelected = allKeys.every(k => selected.has(k));
    return allSelected ? new Set<string>() : new Set(allKeys);
  };

  describe('Sorting', () => {
    const rows: Row[] = [
      { name: 'B', price: 100 },
      { name: 'A', price: 150 },
      { name: 'C', price: 80 },
    ];

    it('should sort ascending by number', () => {
      const sorted = sortRows(rows, 'price', 'asc');
      expect(sorted[0].price).toBe(80);
      expect(sorted[2].price).toBe(150);
    });

    it('should sort descending by number', () => {
      const sorted = sortRows(rows, 'price', 'desc');
      expect(sorted[0].price).toBe(150);
      expect(sorted[2].price).toBe(80);
    });

    it('should sort ascending by string', () => {
      const sorted = sortRows(rows, 'name', 'asc');
      expect(sorted[0].name).toBe('A');
      expect(sorted[2].name).toBe('C');
    });

    it('should not mutate original', () => {
      sortRows(rows, 'price', 'asc');
      expect(rows[0].name).toBe('B');
    });
  });

  describe('Multi Sort', () => {
    const rows: Row[] = [
      { sector: 'Tech', name: 'A', price: 100 },
      { sector: 'Tech', name: 'B', price: 150 },
      { sector: 'Finance', name: 'C', price: 80 },
      { sector: 'Finance', name: 'D', price: 120 },
    ];

    it('should sort by multiple columns', () => {
      const sorted = multiSort(rows, [
        { key: 'sector', order: 'asc' },
        { key: 'price', order: 'desc' },
      ]);
      expect(sorted[0].sector).toBe('Finance');
      expect(sorted[0].price).toBe(120);
    });

    it('should handle single sort', () => {
      const sorted = multiSort(rows, [{ key: 'price', order: 'asc' }]);
      expect(sorted[0].price).toBe(80);
    });

    it('should handle empty sorts', () => {
      const sorted = multiSort(rows, []);
      expect(sorted).toEqual(rows);
    });
  });

  describe('Column Widths', () => {
    it('should respect minimum width', () => {
      const widths = calcColumnWidths(['A'], [{ A: 'x' }], 100, 300);
      expect(widths[0]).toBeGreaterThanOrEqual(100);
    });

    it('should respect maximum width', () => {
      const widths = calcColumnWidths(['Column'], [{ Column: 'a'.repeat(100) }], 60, 200);
      expect(widths[0]).toBeLessThanOrEqual(200);
    });

    it('should handle empty rows', () => {
      const widths = calcColumnWidths(['Col1', 'Col2'], [], 60, 300);
      expect(widths).toHaveLength(2);
    });
  });

  describe('Virtual Scroll', () => {
    it('should calculate visible range', () => {
      const { start, end } = calcVirtualRange(0, 40, 400, 1000);
      expect(start).toBe(0);
      expect(end).toBeGreaterThan(0);
    });

    it('should apply overscan', () => {
      const { start } = calcVirtualRange(400, 40, 400, 1000, 5);
      expect(start).toBeLessThan(10); // overscan pulls start back
    });

    it('should clamp to total rows', () => {
      const { end } = calcVirtualRange(0, 40, 400, 5);
      expect(end).toBeLessThanOrEqual(5);
    });

    it('should calculate offsetY', () => {
      const { offsetY } = calcVirtualRange(400, 40, 400, 1000);
      expect(offsetY).toBeGreaterThan(0);
    });
  });

  describe('Sticky Columns', () => {
    it('should freeze first N columns', () => {
      const { frozen, scrollable } = calcStickyColumns(['A', 'B', 'C', 'D'], 2);
      expect(frozen).toEqual(['A', 'B']);
      expect(scrollable).toEqual(['C', 'D']);
    });

    it('should handle freeze all', () => {
      const { frozen, scrollable } = calcStickyColumns(['A', 'B'], 5);
      expect(frozen).toEqual(['A', 'B']);
      expect(scrollable).toEqual([]);
    });

    it('should handle freeze 0', () => {
      const { frozen, scrollable } = calcStickyColumns(['A', 'B'], 0);
      expect(frozen).toEqual([]);
      expect(scrollable).toEqual(['A', 'B']);
    });
  });

  describe('Row Selection', () => {
    it('should add to selection', () => {
      const selected = toggleRowSelection(new Set(['a']), 'b', true);
      expect(selected.has('b')).toBe(true);
      expect(selected.has('a')).toBe(true);
    });

    it('should remove from selection', () => {
      const selected = toggleRowSelection(new Set(['a', 'b']), 'a', true);
      expect(selected.has('a')).toBe(false);
      expect(selected.has('b')).toBe(true);
    });

    it('should single select mode', () => {
      const selected = toggleRowSelection(new Set(['a']), 'b', false);
      expect(selected.has('a')).toBe(false);
      expect(selected.has('b')).toBe(true);
    });
  });

  describe('Toggle All', () => {
    it('should select all when none selected', () => {
      const result = toggleAllSelection(['a', 'b', 'c'], new Set());
      expect(result.size).toBe(3);
    });

    it('should deselect all when all selected', () => {
      const result = toggleAllSelection(['a', 'b'], new Set(['a', 'b']));
      expect(result.size).toBe(0);
    });

    it('should select all when partial selected', () => {
      const result = toggleAllSelection(['a', 'b', 'c'], new Set(['a']));
      expect(result.size).toBe(3);
    });
  });
});
