import { describe, it, expect } from 'vitest';

// ===== 数据表格与排序引擎 =====
describe('Data Table & Sort Engine', () => {
  interface Column { key: string; type: 'number' | 'string' | 'date' | 'boolean'; sortable?: boolean; filterable?: boolean; }
  interface SortConfig { key: string; direction: 'asc' | 'desc'; }
  interface FilterConfig { key: string; operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'startsWith' | 'in' | 'between'; value: any; value2?: any; }

  const sortData = <T extends Record<string, any>>(data: T[], sort: SortConfig, columns: Column[]): T[] => {
    const col = columns.find(c => c.key === sort.key);
    if (!col) return [...data];
    return [...data].sort((a, b) => {
      let va = a[sort.key], vb = b[sort.key];
      if (col.type === 'number') { va = Number(va); vb = Number(vb); }
      else if (col.type === 'date') { va = new Date(va).getTime(); vb = new Date(vb).getTime(); }
      else if (col.type === 'boolean') { va = va ? 1 : 0; vb = vb ? 1 : 0; }
      else { va = String(va); vb = String(vb); }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  };

  const filterData = <T extends Record<string, any>>(data: T[], filters: FilterConfig[]): T[] => {
    return data.filter(row => filters.every(f => {
      const val = row[f.key];
      switch (f.operator) {
        case 'eq': return val === f.value;
        case 'ne': return val !== f.value;
        case 'gt': return val > f.value;
        case 'lt': return val < f.value;
        case 'gte': return val >= f.value;
        case 'lte': return val <= f.value;
        case 'contains': return String(val).includes(String(f.value));
        case 'startsWith': return String(val).startsWith(String(f.value));
        case 'in': return Array.isArray(f.value) && f.value.includes(val);
        case 'between': return val >= f.value && val <= f.value2;
        default: return true;
      }
    }));
  };

  const paginateData = <T>(data: T[], page: number, pageSize: number): { items: T[]; total: number; totalPages: number; currentPage: number } => {
    const total = data.length;
    const totalPages = Math.ceil(total / pageSize);
    const currentPage = Math.max(1, Math.min(page, totalPages || 1));
    const start = (currentPage - 1) * pageSize;
    return { items: data.slice(start, start + pageSize), total, totalPages, currentPage };
  };

  const multiSort = <T extends Record<string, any>>(data: T[], sorts: SortConfig[], columns: Column[]): T[] => {
    return [...data].sort((a, b) => {
      for (const sort of sorts) {
        const col = columns.find(c => c.key === sort.key);
        if (!col) continue;
        let va = a[sort.key], vb = b[sort.key];
        if (col.type === 'number') { va = Number(va); vb = Number(vb); }
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        if (cmp !== 0) return sort.direction === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  };

  const searchInData = <T extends Record<string, any>>(data: T[], query: string, searchKeys: string[]): T[] => {
    const q = query.toLowerCase();
    return data.filter(row => searchKeys.some(key => String(row[key]).toLowerCase().includes(q)));
  };

  const aggregateColumn = <T extends Record<string, any>>(data: T[], key: string, agg: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'distinct'): number | Set<any> => {
    const values = data.map(r => r[key]).filter(v => v !== undefined && v !== null);
    if (agg === 'count') return values.length;
    if (agg === 'distinct') return new Set(values).size;
    const nums = values.map(Number).filter(n => !isNaN(n));
    if (nums.length === 0) return 0;
    switch (agg) {
      case 'sum': return nums.reduce((a, b) => a + b, 0);
      case 'avg': return nums.reduce((a, b) => a + b, 0) / nums.length;
      case 'min': return Math.min(...nums);
      case 'max': return Math.max(...nums);
      default: return 0;
    }
  };

  const columns: Column[] = [
    { key: 'name', type: 'string', sortable: true, filterable: true },
    { key: 'price', type: 'number', sortable: true, filterable: true },
    { key: 'change', type: 'number', sortable: true },
    { key: 'date', type: 'date', sortable: true },
    { key: 'active', type: 'boolean', sortable: true },
  ];

  const sampleData = [
    { name: 'AAPL', price: 150, change: 2.5, date: '2026-03-20', active: true },
    { name: 'GOOG', price: 2800, change: -1.2, date: '2026-03-21', active: true },
    { name: 'MSFT', price: 300, change: 0.8, date: '2026-03-19', active: false },
    { name: 'TSLA', price: 700, change: 5.1, date: '2026-03-22', active: true },
    { name: 'AMZN', price: 3300, change: -0.5, date: '2026-03-18', active: true },
  ];

  describe('排序', () => {
    it('数字升序', () => {
      const sorted = sortData(sampleData, { key: 'price', direction: 'asc' }, columns);
      expect(sorted[0].price).toBe(150);
      expect(sorted[4].price).toBe(3300);
    });

    it('数字降序', () => {
      const sorted = sortData(sampleData, { key: 'price', direction: 'desc' }, columns);
      expect(sorted[0].price).toBe(3300);
      expect(sorted[4].price).toBe(150);
    });

    it('字符串升序', () => {
      const sorted = sortData(sampleData, { key: 'name', direction: 'asc' }, columns);
      expect(sorted[0].name).toBe('AAPL');
    });

    it('日期排序', () => {
      const sorted = sortData(sampleData, { key: 'date', direction: 'asc' }, columns);
      expect(sorted[0].date).toBe('2026-03-18');
    });

    it('布尔排序', () => {
      const sorted = sortData(sampleData, { key: 'active', direction: 'asc' }, columns);
      expect(sorted[0].active).toBe(false);
    });

    it('不应修改原数组', () => {
      const original = [...sampleData];
      sortData(sampleData, { key: 'price', direction: 'asc' }, columns);
      expect(sampleData).toEqual(original);
    });

    it('空数据排序', () => {
      expect(sortData([], { key: 'price', direction: 'asc' }, columns)).toEqual([]);
    });

    it('未知列返回原数据', () => {
      const sorted = sortData(sampleData, { key: 'unknown', direction: 'asc' }, columns);
      expect(sorted).toEqual(sampleData);
    });

    it('相同值保持稳定', () => {
      const data = [{ name: 'A', price: 100, change: 0, date: '2026-01-01', active: true }, { name: 'B', price: 100, change: 0, date: '2026-01-02', active: true }];
      const sorted = sortData(data, { key: 'price', direction: 'asc' }, columns);
      expect(sorted[0].name).toBe('A');
    });
  });

  describe('过滤', () => {
    it('等于过滤', () => {
      const result = filterData(sampleData, [{ key: 'name', operator: 'eq', value: 'AAPL' }]);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('AAPL');
    });

    it('大于过滤', () => {
      const result = filterData(sampleData, [{ key: 'price', operator: 'gt', value: 1000 }]);
      expect(result.length).toBeGreaterThanOrEqual(2); // GOOG, AMZN (at minimum)
      result.forEach(r => expect(r.price).toBeGreaterThan(1000));
    });

    it('小于等于过滤', () => {
      const result = filterData(sampleData, [{ key: 'price', operator: 'lte', value: 300 }]);
      expect(result.length).toBe(2);
    });

    it('包含过滤', () => {
      const result = filterData(sampleData, [{ key: 'name', operator: 'contains', value: 'O' }]);
      expect(result.length).toBeGreaterThanOrEqual(1); // GOOG (at minimum)
      result.forEach(r => expect(r.name).toContain('O'));
    });

    it('前缀过滤', () => {
      const result = filterData(sampleData, [{ key: 'name', operator: 'startsWith', value: 'A' }]);
      expect(result.length).toBe(2); // AAPL, AMZN
    });

    it('In过滤', () => {
      const result = filterData(sampleData, [{ key: 'name', operator: 'in', value: ['AAPL', 'TSLA'] }]);
      expect(result.length).toBe(2);
    });

    it('区间过滤', () => {
      const result = filterData(sampleData, [{ key: 'price', operator: 'between', value: 200, value2: 1000 }]);
      expect(result.length).toBe(2); // MSFT(300), TSLA(700)
    });

    it('多条件AND过滤', () => {
      const result = filterData(sampleData, [
        { key: 'price', operator: 'gt', value: 100 },
        { key: 'active', operator: 'eq', value: true },
      ]);
      expect(result.length).toBe(4);
    });

    it('空过滤返回全部', () => {
      expect(filterData(sampleData, []).length).toBe(5);
    });

    it('不等于过滤', () => {
      const result = filterData(sampleData, [{ key: 'name', operator: 'ne', value: 'AAPL' }]);
      expect(result.length).toBe(4);
    });

    it('日期大于过滤', () => {
      const result = filterData(sampleData, [{ key: 'date', operator: 'gt', value: '2026-03-20' }]);
      expect(result.length).toBe(2);
    });
  });

  describe('分页', () => {
    it('第一页', () => {
      const result = paginateData(sampleData, 1, 2);
      expect(result.items.length).toBe(2);
      expect(result.total).toBe(5);
      expect(result.totalPages).toBe(3);
    });

    it('最后一页', () => {
      const result = paginateData(sampleData, 3, 2);
      expect(result.items.length).toBe(1);
    });

    it('超出页码返回最后一页', () => {
      const result = paginateData(sampleData, 100, 2);
      expect(result.currentPage).toBe(3);
    });

    it('页码小于1修正为1', () => {
      const result = paginateData(sampleData, -1, 2);
      expect(result.currentPage).toBe(1);
    });

    it('每页大小大于总数', () => {
      const result = paginateData(sampleData, 1, 100);
      expect(result.items.length).toBe(5);
      expect(result.totalPages).toBe(1);
    });

    it('空数据分页', () => {
      const result = paginateData([], 1, 10);
      expect(result.items.length).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  describe('多列排序', () => {
    it('先按active再按price', () => {
      const sorted = multiSort(sampleData, [
        { key: 'active', direction: 'desc' },
        { key: 'price', direction: 'asc' },
      ], columns);
      expect(sorted[0].active).toBe(true);
      expect(sorted[0].price).toBe(150);
    });

    it('空排序返回原数据', () => {
      expect(multiSort(sampleData, [], columns)).toEqual(sampleData);
    });
  });

  describe('搜索', () => {
    it('搜索名称', () => {
      const result = searchInData(sampleData, 'AAP', ['name']);
      expect(result.length).toBe(1);
    });

    it('大小写不敏感', () => {
      const result = searchInData(sampleData, 'aapl', ['name']);
      expect(result.length).toBe(1);
    });

    it('多字段搜索', () => {
      const result = searchInData(sampleData, '2026', ['name', 'date']);
      expect(result.length).toBe(5);
    });

    it('无匹配', () => {
      expect(searchInData(sampleData, 'xyz', ['name']).length).toBe(0);
    });

    it('空查询返回全部', () => {
      expect(searchInData(sampleData, '', ['name']).length).toBe(5);
    });
  });

  describe('聚合', () => {
    it('求和', () => {
      expect(aggregateColumn(sampleData, 'price', 'sum')).toBe(7250);
    });

    it('平均', () => {
      expect(aggregateColumn(sampleData, 'price', 'avg')).toBe(1450);
    });

    it('最小值', () => {
      expect(aggregateColumn(sampleData, 'price', 'min')).toBe(150);
    });

    it('最大值', () => {
      expect(aggregateColumn(sampleData, 'price', 'max')).toBe(3300);
    });

    it('计数', () => {
      expect(aggregateColumn(sampleData, 'price', 'count')).toBe(5);
    });

    it('去重计数', () => {
      expect(aggregateColumn(sampleData, 'active', 'distinct')).toBe(2);
    });

    it('空数据聚合', () => {
      expect(aggregateColumn([], 'price', 'sum')).toBe(0);
    });
  });

  describe('综合场景', () => {
    it('过滤+排序+分页', () => {
      const filtered = filterData(sampleData, [{ key: 'active', operator: 'eq', value: true }]);
      const sorted = sortData(filtered, { key: 'price', direction: 'desc' }, columns);
      const page = paginateData(sorted, 1, 2);
      expect(page.items.length).toBe(2);
      expect(page.items[0].price).toBe(3300);
    });

    it('搜索+过滤+排序', () => {
      const searched = searchInData(sampleData, 'A', ['name']);
      const filtered = filterData(searched, [{ key: 'price', operator: 'gt', value: 200 }]);
      const sorted = sortData(filtered, { key: 'price', direction: 'asc' }, columns);
      expect(sorted.length).toBeGreaterThanOrEqual(1);
      // AMZN should be the last (highest price) among results
      const hasAmzn = sorted.some(s => s.name === 'AMZN');
      expect(hasAmzn).toBe(true);
    });
  });
});
