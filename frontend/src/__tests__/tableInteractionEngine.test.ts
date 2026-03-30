import { describe, it, expect } from 'vitest';

// 表格交互引擎
interface Column { key: string; label: string; sortable?: boolean; filterable?: boolean; type?: 'string' | 'number' | 'date'; width?: number; }
interface SortConfig { key: string; direction: 'asc' | 'desc'; }
interface FilterConfig { key: string; operator: 'eq' | 'gt' | 'lt' | 'contains'; value: any; }

function sortData<T extends Record<string, any>>(data: T[], sort: SortConfig): T[] {
  return [...data].sort((a, b) => {
    const va = a[sort.key], vb = b[sort.key];
    if (typeof va === 'number' && typeof vb === 'number') {
      return sort.direction === 'asc' ? va - vb : vb - va;
    }
    const cmp = String(va).localeCompare(String(vb));
    return sort.direction === 'asc' ? cmp : -cmp;
  });
}

function filterData<T extends Record<string, any>>(data: T[], filters: FilterConfig[]): T[] {
  return data.filter(row => filters.every(f => {
    const val = row[f.key];
    switch (f.operator) {
      case 'eq': return val === f.value;
      case 'gt': return val > f.value;
      case 'lt': return val < f.value;
      case 'contains': return String(val).includes(String(f.value));
      default: return true;
    }
  }));
}

function paginateData<T>(data: T[], page: number, pageSize: number): { items: T[]; total: number; totalPages: number } {
  const total = data.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const start = (page - 1) * pageSize;
  return { items: data.slice(start, start + pageSize), total, totalPages };
}

function toggleSort(current: SortConfig | null, key: string): SortConfig {
  if (current?.key === key) {
    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { key, direction: 'asc' };
}

function getColumnWidth(column: Column, totalWidth: number, allColumns: Column[]): number {
  if (column.width) return column.width;
  const defined = allColumns.reduce((s, c) => s + (c.width || 0), 0);
  const remaining = totalWidth - defined;
  const autoCols = allColumns.filter(c => !c.width).length;
  return autoCols > 0 ? remaining / autoCols : 0;
}

function extractUniqueValues<T extends Record<string, any>>(data: T[], key: string): any[] {
  return [...new Set(data.map(row => row[key]))];
}

function generateColumnDefs(sampleRow: Record<string, any>): Column[] {
  return Object.keys(sampleRow).map(key => ({
    key, label: key.charAt(0).toUpperCase() + key.slice(1),
    sortable: true, filterable: true,
    type: typeof sampleRow[key] === 'number' ? 'number' as const : 'string' as const,
  }));
}

describe('表格交互引擎', () => {
  const testData = [
    { name: 'AAPL', price: 150, volume: 1000000, sector: 'Tech' },
    { name: 'GOOGL', price: 2800, volume: 500000, sector: 'Tech' },
    { name: 'JPM', price: 150, volume: 800000, sector: 'Finance' },
    { name: 'TSLA', price: 700, volume: 2000000, sector: 'Auto' },
  ];

  describe('排序', () => {
    it('数字升序应正确排序', () => {
      const sorted = sortData(testData, { key: 'price', direction: 'asc' });
      expect(sorted[0].price).toBe(150);
      expect(sorted[sorted.length - 1].price).toBe(2800);
    });

    it('数字降序应正确排序', () => {
      const sorted = sortData(testData, { key: 'price', direction: 'desc' });
      expect(sorted[0].price).toBe(2800);
    });

    it('字符串排序应正确', () => {
      const sorted = sortData(testData, { key: 'name', direction: 'asc' });
      expect(sorted[0].name).toBe('AAPL');
    });

    it('不应修改原数组', () => {
      const original = [...testData];
      sortData(testData, { key: 'price', direction: 'asc' });
      expect(testData[0].name).toBe(original[0].name);
    });
  });

  describe('过滤', () => {
    it('gt过滤应返回大于指定值的行', () => {
      const result = filterData(testData, [{ key: 'price', operator: 'gt', value: 200 }]);
      expect(result.every(r => r.price > 200)).toBe(true);
    });

    it('contains过滤应返回包含指定字符串的行', () => {
      const result = filterData(testData, [{ key: 'sector', operator: 'contains', value: 'Tech' }]);
      expect(result.length).toBe(2);
    });

    it('多条件应取交集', () => {
      const result = filterData(testData, [
        { key: 'sector', operator: 'eq', value: 'Tech' },
        { key: 'price', operator: 'gt', value: 1000 },
      ]);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('GOOGL');
    });
  });

  describe('分页', () => {
    it('应正确分页', () => {
      const result = paginateData(testData, 1, 2);
      expect(result.items.length).toBe(2);
      expect(result.total).toBe(4);
      expect(result.totalPages).toBe(2);
    });

    it('最后一页可能不满', () => {
      const result = paginateData(testData, 2, 3);
      expect(result.items.length).toBe(1);
    });

    it('空数据应返回正确结构', () => {
      const result = paginateData([], 1, 10);
      expect(result.items.length).toBe(0);
      expect(result.totalPages).toBe(1);
    });
  });

  describe('排序切换', () => {
    it('首次点击应升序', () => {
      expect(toggleSort(null, 'price')).toEqual({ key: 'price', direction: 'asc' });
    });

    it('再次点击同一列应切换为降序', () => {
      const current: SortConfig = { key: 'price', direction: 'asc' };
      expect(toggleSort(current, 'price')).toEqual({ key: 'price', direction: 'desc' });
    });

    it('点击不同列应重置为升序', () => {
      const current: SortConfig = { key: 'price', direction: 'desc' };
      expect(toggleSort(current, 'volume')).toEqual({ key: 'volume', direction: 'asc' });
    });
  });

  describe('列宽计算', () => {
    it('固定宽度应直接返回', () => {
      const col: Column = { key: 'a', label: 'A', width: 100 };
      expect(getColumnWidth(col, 500, [col])).toBe(100);
    });

    it('自动宽度应平均分配剩余空间', () => {
      const cols: Column[] = [
        { key: 'a', label: 'A', width: 100 },
        { key: 'b', label: 'B' },
        { key: 'c', label: 'C' },
      ];
      expect(getColumnWidth(cols[1], 500, cols)).toBe(200);
    });
  });

  describe('唯一值提取', () => {
    it('应返回去重后的值', () => {
      expect(extractUniqueValues(testData, 'sector').length).toBe(3);
    });
  });

  describe('自动生成列定义', () => {
    it('应为每个字段生成列', () => {
      const cols = generateColumnDefs(testData[0]);
      expect(cols.length).toBe(4);
      expect(cols[0].key).toBe('name');
    });

    it('数字类型应正确识别', () => {
      const cols = generateColumnDefs(testData[0]);
      const priceCol = cols.find(c => c.key === 'price');
      expect(priceCol?.type).toBe('number');
    });
  });
});
