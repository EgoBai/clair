import { describe, it, expect } from 'vitest';

// 表格交互引擎
interface SortConfig { field: string; direction: 'asc' | 'desc' | null }
interface FilterCondition { field: string; operator: string; value: any }

function sortData<T extends Record<string, any>>(data: T[], config: SortConfig): T[] {
  if (!config.direction) return [...data];
  return [...data].sort((a, b) => {
    const av = a[config.field], bv = b[config.field];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return config.direction === 'asc' ? cmp : -cmp;
  });
}

function filterData<T extends Record<string, any>>(data: T[], conditions: FilterCondition[]): T[] {
  return data.filter(item =>
    conditions.every(c => {
      const val = item[c.field];
      switch (c.operator) {
        case 'eq': return val === c.value;
        case 'ne': return val !== c.value;
        case 'gt': return val > c.value;
        case 'lt': return val < c.value;
        case 'gte': return val >= c.value;
        case 'lte': return val <= c.value;
        case 'contains': return String(val).includes(c.value);
        case 'in': return Array.isArray(c.value) && c.value.includes(val);
        case 'between': return Array.isArray(c.value) && val >= c.value[0] && val <= c.value[1];
        case 'starts_with': return String(val).startsWith(c.value);
        case 'ends_with': return String(val).endsWith(c.value);
        default: return true;
      }
    })
  );
}

function paginateData<T>(data: T[], page: number, pageSize: number): { items: T[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } {
  const total = data.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  return {
    items: data.slice(start, start + pageSize),
    total, totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

function groupBy<T extends Record<string, any>>(data: T[], key: string): Record<string, T[]> {
  return data.reduce((acc, item) => {
    const k = String(item[key] ?? 'undefined');
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

function aggregateData<T extends Record<string, any>>(data: T[], groupField: string, valueField: string, op: 'sum' | 'avg' | 'count' | 'min' | 'max'): Record<string, number> {
  const groups = groupBy(data, groupField);
  const result: Record<string, number> = {};
  for (const [key, items] of Object.entries(groups)) {
    const values = items.map(i => Number(i[valueField]) || 0);
    switch (op) {
      case 'sum': result[key] = values.reduce((a, b) => a + b, 0); break;
      case 'avg': result[key] = values.reduce((a, b) => a + b, 0) / values.length; break;
      case 'count': result[key] = values.length; break;
      case 'min': result[key] = Math.min(...values); break;
      case 'max': result[key] = Math.max(...values); break;
    }
  }
  return result;
}

describe('表格交互引擎', () => {
  const sampleData = [
    { name: '茅台', price: 1900, change: 2.5, industry: '白酒' },
    { name: '比亚迪', price: 250, change: -1.3, industry: '汽车' },
    { name: '招商银行', price: 35, change: 0.8, industry: '银行' },
    { name: '五粮液', price: 150, change: -0.5, industry: '白酒' },
    { name: '宁德时代', price: 200, change: 3.2, industry: '新能源' },
  ];

  describe('排序', () => {
    it('数字升序', () => {
      const sorted = sortData(sampleData, { field: 'price', direction: 'asc' });
      expect(sorted[0].price).toBe(35);
      expect(sorted[4].price).toBe(1900);
    });

    it('数字降序', () => {
      const sorted = sortData(sampleData, { field: 'price', direction: 'desc' });
      expect(sorted[0].price).toBe(1900);
    });

    it('null方向不排序', () => {
      const sorted = sortData(sampleData, { field: 'price', direction: null });
      expect(sorted[0].name).toBe('茅台');
    });

    it('null值排最后', () => {
      const data = [{ name: 'A', price: 10 }, { name: 'B', price: null }, { name: 'C', price: 5 }];
      const sorted = sortData(data, { field: 'price', direction: 'asc' });
      expect(sorted[2].name).toBe('B');
    });

    it('原数组不被修改', () => {
      const original = [...sampleData];
      sortData(sampleData, { field: 'price', direction: 'asc' });
      expect(sampleData).toEqual(original);
    });

    it('空数组排序返回空', () => {
      expect(sortData([], { field: 'price', direction: 'asc' })).toHaveLength(0);
    });

    it('涨跌幅排序', () => {
      const sorted = sortData(sampleData, { field: 'change', direction: 'desc' });
      expect(sorted[0].change).toBe(3.2);
    });
  });

  describe('筛选', () => {
    it('gt条件', () => {
      const r = filterData(sampleData, [{ field: 'price', operator: 'gt', value: 100 }]);
      expect(r).toHaveLength(4); // 1900, 250, 150, 200
    });

    it('lt条件', () => {
      const r = filterData(sampleData, [{ field: 'price', operator: 'lt', value: 100 }]);
      expect(r).toHaveLength(1); // 35
    });

    it('eq条件', () => {
      const r = filterData(sampleData, [{ field: 'industry', operator: 'eq', value: '白酒' }]);
      expect(r).toHaveLength(2);
    });

    it('contains条件', () => {
      const r = filterData(sampleData, [{ field: 'name', operator: 'contains', value: '行' }]);
      expect(r).toHaveLength(1);
    });

    it('in条件', () => {
      const r = filterData(sampleData, [{ field: 'industry', operator: 'in', value: ['白酒', '银行'] }]);
      expect(r).toHaveLength(3);
    });

    it('between条件', () => {
      const r = filterData(sampleData, [{ field: 'price', operator: 'between', value: [30, 200] }]);
      expect(r).toHaveLength(3);
    });

    it('多条件AND', () => {
      const r = filterData(sampleData, [
        { field: 'industry', operator: 'eq', value: '白酒' },
        { field: 'price', operator: 'gt', value: 160 },
      ]);
      expect(r).toHaveLength(1);
      expect(r[0].name).toBe('茅台');
    });

    it('无匹配返回空', () => {
      const r = filterData(sampleData, [{ field: 'price', operator: 'gt', value: 10000 }]);
      expect(r).toHaveLength(0);
    });

    it('starts_with条件', () => {
      const r = filterData(sampleData, [{ field: 'name', operator: 'starts_with', value: '招' }]);
      expect(r).toHaveLength(1);
    });

    it('ends_with条件', () => {
      const r = filterData(sampleData, [{ field: 'name', operator: 'ends_with', value: '液' }]);
      expect(r).toHaveLength(1);
    });
  });

  describe('分页', () => {
    it('第一页正确', () => {
      const r = paginateData(sampleData, 1, 2);
      expect(r.items).toHaveLength(2);
      expect(r.total).toBe(5);
      expect(r.totalPages).toBe(3);
      expect(r.hasNext).toBe(true);
      expect(r.hasPrev).toBe(false);
    });

    it('最后一页', () => {
      const r = paginateData(sampleData, 3, 2);
      expect(r.items).toHaveLength(1);
      expect(r.hasNext).toBe(false);
      expect(r.hasPrev).toBe(true);
    });

    it('超出范围返回空', () => {
      const r = paginateData(sampleData, 100, 2);
      expect(r.items).toHaveLength(0);
    });

    it('pageSize大于总数', () => {
      const r = paginateData(sampleData, 1, 100);
      expect(r.items).toHaveLength(5);
      expect(r.totalPages).toBe(1);
    });
  });

  describe('分组', () => {
    it('按行业分组', () => {
      const g = groupBy(sampleData, 'industry');
      expect(Object.keys(g)).toHaveLength(4);
      expect(g['白酒']).toHaveLength(2);
    });

    it('空数据返回空对象', () => {
      expect(Object.keys(groupBy([], 'x'))).toHaveLength(0);
    });

    it('缺失字段分到undefined组', () => {
      const data = [{ name: 'A' }, { name: 'B', type: 'x' }];
      const g = groupBy(data, 'type');
      expect(g['undefined']).toHaveLength(1);
      expect(g['x']).toHaveLength(1);
    });
  });

  describe('聚合', () => {
    it('按行业求和价格', () => {
      const r = aggregateData(sampleData, 'industry', 'price', 'sum');
      expect(r['白酒']).toBe(1900 + 150);
    });

    it('按行业平均价格', () => {
      const r = aggregateData(sampleData, 'industry', 'price', 'avg');
      expect(r['白酒']).toBe((1900 + 150) / 2);
    });

    it('按行业计数', () => {
      const r = aggregateData(sampleData, 'industry', 'price', 'count');
      expect(r['白酒']).toBe(2);
      expect(r['银行']).toBe(1);
    });

    it('按行业最大值', () => {
      const r = aggregateData(sampleData, 'industry', 'price', 'max');
      expect(r['白酒']).toBe(1900);
    });

    it('按行业最小值', () => {
      const r = aggregateData(sampleData, 'industry', 'price', 'min');
      expect(r['白酒']).toBe(150);
    });
  });
});
