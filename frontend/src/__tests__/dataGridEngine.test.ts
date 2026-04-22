import { describe, it, expect } from 'vitest';

// 数据表格引擎
interface Column { key: string; label: string; sortable?: boolean; filterable?: boolean; width?: number; type?: 'string' | 'number' | 'date' | 'boolean' }
interface SortConfig { key: string; direction: 'asc' | 'desc' }
interface FilterConfig { key: string; operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'startsWith' | 'endsWith' | 'in'; value: any }
interface PaginationConfig { page: number; pageSize: number; total: number }

class DataGridEngine {
  static sort<T>(data: T[], config: SortConfig): T[] {
    return [...data].sort((a, b) => {
      const av = (a as any)[config.key], bv = (b as any)[config.key];
      if (av === bv) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return config.direction === 'asc' ? cmp : -cmp;
    });
  }

  static filter<T>(data: T[], filters: FilterConfig[]): T[] {
    return data.filter(item => filters.every(f => {
      const val = (item as any)[f.key];
      switch (f.operator) {
        case 'eq': return val === f.value;
        case 'neq': return val !== f.value;
        case 'gt': return val > f.value;
        case 'lt': return val < f.value;
        case 'gte': return val >= f.value;
        case 'lte': return val <= f.value;
        case 'contains': return String(val).includes(f.value);
        case 'startsWith': return String(val).startsWith(f.value);
        case 'endsWith': return String(val).endsWith(f.value);
        case 'in': return Array.isArray(f.value) && f.value.includes(val);
        default: return true;
      }
    }));
  }

  static paginate<T>(data: T[], config: PaginationConfig): { data: T[]; totalPages: number; hasNext: boolean; hasPrev: boolean } {
    const totalPages = Math.ceil(data.length / config.pageSize);
    const start = (config.page - 1) * config.pageSize;
    return {
      data: data.slice(start, start + config.pageSize),
      totalPages,
      hasNext: config.page < totalPages,
      hasPrev: config.page > 1,
    };
  }

  static search<T>(data: T[], query: string, keys: string[]): T[] {
    if (!query) return data;
    const q = query.toLowerCase();
    return data.filter(item => keys.some(key => String((item as any)[key]).toLowerCase().includes(q)));
  }

  static groupBy<T>(data: T[], key: string): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const item of data) {
      const groupKey = String((item as any)[key]);
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey)!.push(item);
    }
    return groups;
  }

  static aggregate<T>(data: T[], valueKey: string, agg: 'sum' | 'avg' | 'min' | 'max' | 'count'): number {
    const values = data.map(d => Number((d as any)[valueKey]) || 0);
    switch (agg) {
      case 'sum': return values.reduce((a, b) => a + b, 0);
      case 'avg': return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      case 'min': return Math.min(...values);
      case 'max': return Math.max(...values);
      case 'count': return values.length;
    }
  }

  static extractColumns(data: Record<string, any>[]): Column[] {
    if (data.length === 0) return [];
    const keys = Object.keys(data[0]);
    return keys.map(key => {
      const val = data[0][key];
      let type: Column['type'] = 'string';
      if (typeof val === 'number') type = 'number';
      else if (val instanceof Date || /^\d{4}-\d{2}/.test(String(val))) type = 'date';
      else if (typeof val === 'boolean') type = 'boolean';
      return { key, label: key, sortable: true, filterable: true, type };
    });
  }

  static mergeColumns(base: Column[], overrides: Partial<Column>[]): Column[] {
    const overrideMap = new Map(overrides.map(o => [o.key, o]));
    return base.map(col => ({ ...col, ...overrideMap.get(col.key) }));
  }

  static calcColumnWidths(totalWidth: number, columns: Column[], minColWidth: number = 80): Record<string, number> {
    const fixedWidths = columns.filter(c => c.width).reduce((s, c) => s + (c.width || 0), 0);
    const flexCols = columns.filter(c => !c.width);
    const remaining = Math.max(0, totalWidth - fixedWidths);
    const flexWidth = flexCols.length > 0 ? Math.max(minColWidth, remaining / flexCols.length) : 0;
    const result: Record<string, number> = {};
    for (const col of columns) {
      result[col.key] = col.width || flexWidth;
    }
    return result;
  }

  static flattenObject(obj: Record<string, any>, prefix: string = ''): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, this.flattenObject(value, fullKey));
      } else {
        result[fullKey] = value;
      }
    }
    return result;
  }
}

describe('数据表格引擎', () => {
  const sampleData = [
    { name: 'Alice', age: 30, score: 85, dept: 'Eng' },
    { name: 'Bob', age: 25, score: 92, dept: 'Sales' },
    { name: 'Charlie', age: 35, score: 78, dept: 'Eng' },
    { name: 'Diana', age: 28, score: 95, dept: 'Sales' },
  ];

  describe('排序', () => {
    it('数字升序', () => {
      const sorted = DataGridEngine.sort(sampleData, { key: 'age', direction: 'asc' });
      expect(sorted[0].name).toBe('Bob');
    });
    it('数字降序', () => {
      const sorted = DataGridEngine.sort(sampleData, { key: 'age', direction: 'desc' });
      expect(sorted[0].name).toBe('Charlie');
    });
    it('字符串排序', () => {
      const sorted = DataGridEngine.sort(sampleData, { key: 'name', direction: 'asc' });
      expect(sorted[0].name).toBe('Alice');
    });
    it('不修改原数组', () => {
      const original = [...sampleData];
      DataGridEngine.sort(sampleData, { key: 'age', direction: 'asc' });
      expect(sampleData).toEqual(original);
    });
    it('null值排最后', () => {
      const data = [{ name: 'A', val: 1 }, { name: 'B', val: null }, { name: 'C', val: 3 }];
      const sorted = DataGridEngine.sort(data as any, { key: 'val', direction: 'asc' });
      expect(sorted[2].name).toBe('B');
    });
  });

  describe('筛选', () => {
    it('等于筛选', () => {
      expect(DataGridEngine.filter(sampleData, [{ key: 'dept', operator: 'eq', value: 'Eng' }])).toHaveLength(2);
    });
    it('大于筛选', () => {
      expect(DataGridEngine.filter(sampleData, [{ key: 'age', operator: 'gt', value: 30 }])).toHaveLength(1);
    });
    it('包含筛选', () => {
      expect(DataGridEngine.filter(sampleData, [{ key: 'name', operator: 'contains', value: 'li' }])).toHaveLength(2);
    });
    it('in筛选', () => {
      expect(DataGridEngine.filter(sampleData, [{ key: 'dept', operator: 'in', value: ['Eng', 'Sales'] }])).toHaveLength(4);
    });
    it('多条件AND', () => {
      expect(DataGridEngine.filter(sampleData, [
        { key: 'dept', operator: 'eq', value: 'Eng' },
        { key: 'age', operator: 'gt', value: 30 },
      ])).toHaveLength(1);
    });
    it('不等于筛选', () => {
      expect(DataGridEngine.filter(sampleData, [{ key: 'dept', operator: 'neq', value: 'Eng' }])).toHaveLength(2);
    });
    it('小于筛选', () => {
      expect(DataGridEngine.filter(sampleData, [{ key: 'age', operator: 'lt', value: 28 }])).toHaveLength(1);
    });
    it('startsWith筛选', () => {
      expect(DataGridEngine.filter(sampleData, [{ key: 'name', operator: 'startsWith', value: 'A' }])).toHaveLength(1);
    });
    it('endsWith筛选', () => {
      expect(DataGridEngine.filter(sampleData, [{ key: 'name', operator: 'endsWith', value: 'a' }])).toHaveLength(1);
    });
    it('lte筛选', () => {
      expect(DataGridEngine.filter(sampleData, [{ key: 'age', operator: 'lte', value: 28 }])).toHaveLength(2);
    });
    it('gte筛选', () => {
      expect(DataGridEngine.filter(sampleData, [{ key: 'age', operator: 'gte', value: 30 }])).toHaveLength(2);
    });
  });

  describe('分页', () => {
    it('应该正确分页', () => {
      const result = DataGridEngine.paginate(sampleData, { page: 1, pageSize: 2, total: 4 });
      expect(result.data).toHaveLength(2);
      expect(result.totalPages).toBe(2);
    });
    it('最后一页', () => {
      const result = DataGridEngine.paginate(sampleData, { page: 2, pageSize: 2, total: 4 });
      expect(result.data).toHaveLength(2);
      expect(result.hasNext).toBe(false);
      expect(result.hasPrev).toBe(true);
    });
    it('第一页', () => {
      const result = DataGridEngine.paginate(sampleData, { page: 1, pageSize: 2, total: 4 });
      expect(result.hasPrev).toBe(false);
      expect(result.hasNext).toBe(true);
    });
    it('超出范围返回空', () => {
      const result = DataGridEngine.paginate(sampleData, { page: 10, pageSize: 2, total: 4 });
      expect(result.data).toHaveLength(0);
    });
    it('每页大小大于总数', () => {
      const result = DataGridEngine.paginate(sampleData, { page: 1, pageSize: 100, total: 4 });
      expect(result.data).toHaveLength(4);
      expect(result.totalPages).toBe(1);
    });
  });

  describe('搜索', () => {
    it('应该搜索名字', () => {
      expect(DataGridEngine.search(sampleData, 'ali', ['name'])).toHaveLength(1);
    });
    it('应该搜索多个字段', () => {
      expect(DataGridEngine.search(sampleData, 'Eng', ['name', 'dept'])).toHaveLength(2);
    });
    it('空查询返回全部', () => {
      expect(DataGridEngine.search(sampleData, '', ['name'])).toHaveLength(4);
    });
    it('不匹配返回空', () => {
      expect(DataGridEngine.search(sampleData, 'xyz', ['name'])).toHaveLength(0);
    });
    it('大小写不敏感', () => {
      expect(DataGridEngine.search(sampleData, 'ALICE', ['name'])).toHaveLength(1);
    });
  });

  describe('分组', () => {
    it('应该按字段分组', () => {
      const groups = DataGridEngine.groupBy(sampleData, 'dept');
      expect(groups.get('Eng')).toHaveLength(2);
      expect(groups.get('Sales')).toHaveLength(2);
    });
    it('空数据返回空Map', () => {
      expect(DataGridEngine.groupBy([], 'dept').size).toBe(0);
    });
  });

  describe('聚合', () => {
    it('求和', () => { expect(DataGridEngine.aggregate(sampleData, 'age', 'sum')).toBe(118); });
    it('平均', () => { expect(DataGridEngine.aggregate(sampleData, 'age', 'avg')).toBe(29.5); });
    it('最小', () => { expect(DataGridEngine.aggregate(sampleData, 'age', 'min')).toBe(25); });
    it('最大', () => { expect(DataGridEngine.aggregate(sampleData, 'age', 'max')).toBe(35); });
    it('计数', () => { expect(DataGridEngine.aggregate(sampleData, 'age', 'count')).toBe(4); });
    it('空数据求和为0', () => { expect(DataGridEngine.aggregate([], 'age', 'sum')).toBe(0); });
    it('空数据平均为0', () => { expect(DataGridEngine.aggregate([], 'age', 'avg')).toBe(0); });
  });

  describe('列提取', () => {
    it('应该自动推断类型', () => {
      const cols = DataGridEngine.extractColumns([{ name: 'A', age: 30 }]);
      expect(cols.find(c => c.key === 'name')?.type).toBe('string');
      expect(cols.find(c => c.key === 'age')?.type).toBe('number');
    });
    it('空数据返回空列', () => {
      expect(DataGridEngine.extractColumns([])).toEqual([]);
    });
  });

  describe('列合并', () => {
    it('应该覆盖配置', () => {
      const base: Column[] = [{ key: 'a', label: 'A', sortable: true }, { key: 'b', label: 'B' }];
      const merged = DataGridEngine.mergeColumns(base, [{ key: 'a', label: 'Alpha', width: 200 }]);
      expect(merged[0].label).toBe('Alpha');
      expect(merged[0].width).toBe(200);
      expect(merged[0].sortable).toBe(true);
    });
  });

  describe('列宽计算', () => {
    it('应该分配宽度', () => {
      const cols: Column[] = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B', width: 100 }];
      const widths = DataGridEngine.calcColumnWidths(500, cols, 80);
      expect(widths['b']).toBe(100);
      expect(widths['a']).toBeGreaterThan(0);
    });
    it('总宽度应等于容器', () => {
      const cols: Column[] = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }];
      const widths = DataGridEngine.calcColumnWidths(400, cols, 80);
      const total = Object.values(widths).reduce((a, b) => a + b, 0);
      expect(total).toBe(400);
    });
  });

  describe('对象扁平化', () => {
    it('应该扁平化嵌套对象', () => {
      const flat = DataGridEngine.flattenObject({ a: { b: { c: 1 } }, d: 2 });
      expect(flat['a.b.c']).toBe(1);
      expect(flat['d']).toBe(2);
    });
    it('数组不应扁平化', () => {
      const flat = DataGridEngine.flattenObject({ a: [1, 2], b: 3 });
      expect(Array.isArray(flat['a'])).toBe(true);
    });
    it('空对象返回空', () => {
      expect(DataGridEngine.flattenObject({})).toEqual({});
    });
    it('前缀参数', () => {
      const flat = DataGridEngine.flattenObject({ a: 1 }, 'root');
      expect(flat['root.a']).toBe(1);
    });
  });
});
