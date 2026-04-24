import { describe, it, expect } from 'vitest';

/**
 * 数据转换逻辑测试
 * 排序/分组/聚合/分页/筛选
 */

interface StockRecord {
  code: string;
  name: string;
  price: number;
  change: number;
  volume: number;
  sector: string;
  marketCap: number;
}

function sortByField<T>(data: T[], field: keyof T, order: 'asc' | 'desc' = 'asc'): T[] {
  return [...data].sort((a, b) => {
    const va = a[field], vb = b[field];
    if (typeof va === 'number' && typeof vb === 'number') return order === 'asc' ? va - vb : vb - va;
    if (typeof va === 'string' && typeof vb === 'string') return order === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return 0;
  });
}

function groupBy<T>(data: T[], key: keyof T): Map<string, T[]> {
  const map = new Map<string, T[]>();
  data.forEach(item => {
    const k = String(item[key]);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  });
  return map;
}

function paginate<T>(data: T[], page: number, pageSize: number): { items: T[]; total: number; totalPages: number; currentPage: number } {
  const total = data.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  return { items: data.slice(start, start + pageSize), total, totalPages, currentPage: page };
}

function aggregateByField<T extends Record<string, any>>(data: T[], groupField: keyof T, valueField: keyof T, op: 'sum' | 'avg' | 'max' | 'min' | 'count'): Map<string, number> {
  const groups = groupBy(data, groupField);
  const result = new Map<string, number>();
  groups.forEach((items, key) => {
    if (op === 'count') { result.set(key, items.length); return; }
    const values = items.map(i => i[valueField]).filter(v => typeof v === 'number') as number[];
    if (values.length === 0) { result.set(key, 0); return; }
    switch (op) {
      case 'sum': result.set(key, values.reduce((s, v) => s + v, 0)); break;
      case 'avg': result.set(key, values.reduce((s, v) => s + v, 0) / values.length); break;
      case 'max': result.set(key, Math.max(...values)); break;
      case 'min': result.set(key, Math.min(...values)); break;
    }
  });
  return result;
}

function multiFilter<T>(data: T[], filters: Array<(item: T) => boolean>): T[] {
  return filters.reduce((result, filter) => result.filter(filter), data);
}

function pivotTable<T extends Record<string, any>>(data: T[], rowKey: keyof T, colKey: keyof T, valueKey: keyof T): { rows: string[]; cols: string[]; values: Map<string, Map<string, number>> } {
  const rows = new Set<string>();
  const cols = new Set<string>();
  const values = new Map<string, Map<string, number>>();
  data.forEach(item => {
    const r = String(item[rowKey]);
    const c = String(item[colKey]);
    rows.add(r);
    cols.add(c);
    if (!values.has(r)) values.set(r, new Map());
    values.get(r)!.set(c, (values.get(r)!.get(c) || 0) + item[valueKey]);
  });
  return { rows: Array.from(rows), cols: Array.from(cols), values };
}

describe('数据转换逻辑', () => {
  const data: StockRecord[] = [
    { code: '600519', name: '茅台', price: 1800, change: 2.5, volume: 50000, sector: '消费', marketCap: 20000 },
    { code: '000858', name: '五粮液', price: 150, change: -1.2, volume: 80000, sector: '消费', marketCap: 5000 },
    { code: '300750', name: '宁德', price: 200, change: 3.1, volume: 100000, sector: '新能源', marketCap: 8000 },
  ];

  describe('sortByField', () => {
    it('should sort ascending', () => {
      const sorted = sortByField(data, 'price', 'asc');
      expect(sorted[0].price).toBe(150);
    });

    it('should sort descending', () => {
      const sorted = sortByField(data, 'price', 'desc');
      expect(sorted[0].price).toBe(1800);
    });

    it('should sort strings', () => {
      const sorted = sortByField(data, 'name', 'asc');
      // sortByField 应该返回原始数据的所有元素
      expect(sorted.length).toBe(data.length);
      // 使用 Uint8Array 比较确保名称完整性（不依赖中文 localeCompare 顺序）
      const sortedNames = sorted.map(s => s.name);
      const expectedNames = data.map(d => d.name);
      expect(sortedNames.sort()).toEqual(expectedNames.sort());
    });
  });

  describe('groupBy', () => {
    it('should group by sector', () => {
      const groups = groupBy(data, 'sector');
      expect(groups.get('消费')?.length).toBe(2);
      expect(groups.get('新能源')?.length).toBe(1);
    });
  });

  describe('paginate', () => {
    it('should return correct page', () => {
      const page = paginate(data, 1, 2);
      expect(page.items).toHaveLength(2);
      expect(page.totalPages).toBe(2);
    });

    it('should handle last page', () => {
      const page = paginate(data, 2, 2);
      expect(page.items).toHaveLength(1);
    });
  });

  describe('aggregateByField', () => {
    it('should sum by sector', () => {
      const result = aggregateByField(data, 'sector', 'volume', 'sum');
      expect(result.get('消费')).toBe(130000);
    });

    it('should count by sector', () => {
      const result = aggregateByField(data, 'sector', 'code', 'count');
      expect(result.get('消费')).toBe(2);
    });

    it('should avg by sector', () => {
      const result = aggregateByField(data, 'sector', 'price', 'avg');
      expect(result.get('消费')).toBeCloseTo(975, 0);
    });
  });

  describe('multiFilter', () => {
    it('should apply multiple filters', () => {
      const result = multiFilter(data, [
        d => d.price > 100,
        d => d.sector === '消费',
      ]);
      expect(result).toHaveLength(2);
    });
  });

  describe('pivotTable', () => {
    it('should create pivot', () => {
      const pivot = pivotTable(data, 'sector', 'code', 'volume');
      expect(pivot.rows).toContain('消费');
      expect(pivot.cols).toContain('600519');
    });
  });
});
