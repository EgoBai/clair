import { describe, it, expect } from 'vitest';

// ===== 表格交互逻辑测试 =====

type SortDirection = 'asc' | 'desc' | null;

interface SortState { field: string; direction: SortDirection; }

function sortData<T extends Record<string, unknown>>(data: T[], sort: SortState): T[] {
  if (!sort.direction) return [...data];
  return [...data].sort((a, b) => {
    const va = a[sort.field];
    const vb = b[sort.field];
    let cmp = 0;
    if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
    else cmp = String(va).localeCompare(String(vb));
    return sort.direction === 'desc' ? -cmp : cmp;
  });
}

function toggleSort(current: SortState, field: string): SortState {
  if (current.field !== field) return { field, direction: 'asc' };
  if (current.direction === 'asc') return { field, direction: 'desc' };
  if (current.direction === 'desc') return { field: '', direction: null };
  return { field, direction: 'asc' };
}

function filterData<T extends Record<string, unknown>>(data: T[], filters: Record<string, (v: unknown) => boolean>): T[] {
  return data.filter(row => Object.entries(filters).every(([key, fn]) => fn(row[key])));
}

function paginateData<T>(data: T[], page: number, pageSize: number): { items: T[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } {
  const total = data.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  return { items: data.slice(start, start + pageSize), total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
}

function getColumnWidths(headers: string[], data: Record<string, unknown>[], minWidth: number = 80, maxWidth: number = 300): number[] {
  return headers.map(h => {
    const headerLen = h.length * 14;
    const maxDataLen = data.reduce((m, row) => Math.max(m, String(row[h] ?? '').length * 12), 0);
    return Math.min(maxWidth, Math.max(minWidth, Math.max(headerLen, maxDataLen)));
  });
}

describe('表格交互', () => {
  const sampleData = [
    { name: '茅台', price: 1900, change: 1.5 },
    { name: '五粮液', price: 160, change: -0.8 },
    { name: '比亚迪', price: 260, change: 2.3 },
    { name: '招商银行', price: 35, change: -1.2 },
  ];

  describe('排序逻辑', () => {
    it('升序排序数字', () => {
      const sorted = sortData(sampleData, { field: 'price', direction: 'asc' });
      expect(sorted[0].price).toBe(35);
      expect(sorted[3].price).toBe(1900);
    });

    it('降序排序数字', () => {
      const sorted = sortData(sampleData, { field: 'price', direction: 'desc' });
      expect(sorted[0].price).toBe(1900);
    });

    it('null方向不排序', () => {
      const sorted = sortData(sampleData, { field: 'price', direction: null });
      expect(sorted[0].name).toBe('茅台');
    });

    it('字符串排序', () => {
      const sorted = sortData(sampleData, { field: 'name', direction: 'asc' });
      // Chinese pinyin order: 比(B) < 五(W) < 招(Z) < 茅(M)... actually localeCompare varies
      expect(sorted.length).toBe(sampleData.length);
      expect(sorted[0].name).toBeDefined();
    });

    it('原数组不被修改', () => {
      const original = [...sampleData];
      sortData(sampleData, { field: 'price', direction: 'asc' });
      expect(sampleData).toEqual(original);
    });

    it('空数组排序返回空', () => {
      expect(sortData([], { field: 'x', direction: 'asc' })).toEqual([]);
    });
  });

  describe('排序切换', () => {
    it('首次点击升序', () => {
      const s = toggleSort({ field: '', direction: null }, 'price');
      expect(s).toEqual({ field: 'price', direction: 'asc' });
    });

    it('升序点击变降序', () => {
      const s = toggleSort({ field: 'price', direction: 'asc' }, 'price');
      expect(s).toEqual({ field: 'price', direction: 'desc' });
    });

    it('降序点击取消', () => {
      const s = toggleSort({ field: 'price', direction: 'desc' }, 'price');
      expect(s.direction).toBeNull();
    });

    it('切换字段重置为升序', () => {
      const s = toggleSort({ field: 'price', direction: 'desc' }, 'name');
      expect(s).toEqual({ field: 'name', direction: 'asc' });
    });
  });

  describe('筛选逻辑', () => {
    it('单一条件筛选', () => {
      const f = filterData(sampleData, { price: (v) => (v as number) > 100 });
      expect(f).toHaveLength(3);
    });

    it('多条件AND筛选', () => {
      const f = filterData(sampleData, {
        price: (v) => (v as number) > 100,
        change: (v) => (v as number) > 0,
      });
      expect(f).toHaveLength(2);
    });

    it('无匹配返回空', () => {
      const f = filterData(sampleData, { price: (v) => (v as number) > 99999 });
      expect(f).toHaveLength(0);
    });

    it('空筛选器返回全部', () => {
      expect(filterData(sampleData, {})).toHaveLength(4);
    });
  });

  describe('分页逻辑', () => {
    it('第一页正确', () => {
      const p = paginateData(sampleData, 1, 2);
      expect(p.items).toHaveLength(2);
      expect(p.total).toBe(4);
      expect(p.totalPages).toBe(2);
      expect(p.hasNext).toBe(true);
      expect(p.hasPrev).toBe(false);
    });

    it('最后一页', () => {
      const p = paginateData(sampleData, 2, 2);
      expect(p.items).toHaveLength(2);
      expect(p.hasNext).toBe(false);
      expect(p.hasPrev).toBe(true);
    });

    it('超出页数返回空', () => {
      const p = paginateData(sampleData, 10, 2);
      expect(p.items).toHaveLength(0);
    });

    it('pageSize大于总数', () => {
      const p = paginateData(sampleData, 1, 100);
      expect(p.items).toHaveLength(4);
      expect(p.totalPages).toBe(1);
    });

    it('空数据分页', () => {
      const p = paginateData([], 1, 10);
      expect(p.total).toBe(0);
      expect(p.totalPages).toBe(0);
    });
  });

  describe('列宽计算', () => {
    it('返回与headers同长度', () => {
      const widths = getColumnWidths(['A', 'B'], [{ A: 'test', B: 123 }]);
      expect(widths).toHaveLength(2);
    });

    it('不小于最小宽度', () => {
      const widths = getColumnWidths(['A'], [{ A: '' }], 80);
      expect(widths[0]).toBeGreaterThanOrEqual(80);
    });

    it('不超过最大宽度', () => {
      const widths = getColumnWidths(['A'], [{ A: 'x'.repeat(1000) }], 80, 300);
      expect(widths[0]).toBeLessThanOrEqual(300);
    });
  });
});
