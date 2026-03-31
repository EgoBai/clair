import { describe, it, expect } from 'vitest';

/**
 * 基础筛选器测试
 */

interface FilterCondition {
  field: string;
  operator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'between' | 'contains';
  value: any;
  value2?: any;
}

interface SortConfig {
  field: string;
  order: 'asc' | 'desc';
}

function applyFilter(record: Record<string, any>, condition: FilterCondition): boolean {
  const fieldValue = record[condition.field];
  switch (condition.operator) {
    case 'eq': return fieldValue === condition.value;
    case 'gt': return fieldValue > condition.value;
    case 'lt': return fieldValue < condition.value;
    case 'gte': return fieldValue >= condition.value;
    case 'lte': return fieldValue <= condition.value;
    case 'in': return Array.isArray(condition.value) && condition.value.includes(fieldValue);
    case 'between': return fieldValue >= condition.value && fieldValue <= condition.value2;
    case 'contains': return typeof fieldValue === 'string' && fieldValue.includes(condition.value);
    default: return true;
  }
}

function applyFilters(records: Record<string, any>[], conditions: FilterCondition[]): Record<string, any>[] {
  return records.filter(r => conditions.every(c => applyFilter(r, c)));
}

function applySort(records: Record<string, any>[], sort: SortConfig): Record<string, any>[] {
  return [...records].sort((a, b) => {
    const aVal = a[sort.field];
    const bVal = b[sort.field];
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sort.order === 'asc' ? aVal - bVal : bVal - aVal;
    }
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sort.order === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return 0;
  });
}

function paginate<T>(items: T[], page: number, pageSize: number): { items: T[]; total: number; pages: number } {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    pages: Math.ceil(items.length / pageSize),
  };
}

describe('Screener', () => {
  const testData = [
    { code: '000001', name: '平安银行', pe: 5.5, roe: 12, price: 12.5, sector: '银行' },
    { code: '600519', name: '贵州茅台酒', pe: 35, roe: 30, price: 1800, sector: '白酒' },
    { code: '000002', name: '万科A', pe: 30, roe: 15, price: 18.3, sector: '房地产' },
    { code: '300750', name: '宁德时代', pe: 50, roe: 20, price: 250, sector: '新能源' },
    { code: '000858', name: '五粮酒液', pe: 28, roe: 25, price: 150, sector: '白酒' },
  ];

  describe('单条件筛选', () => {
    it('eq应该匹配相等值', () => {
      const result = applyFilters(testData, [{ field: 'sector', operator: 'eq', value: '白酒' }]);
      expect(result.length).toBe(2);
    });

    it('gt应该匹配大于', () => {
      const result = applyFilters(testData, [{ field: 'pe', operator: 'gt', value: 30 }]);
      expect(result.length).toBe(2); // 茅台35, 宁德50
    });

    it('lt应该匹配小于', () => {
      const result = applyFilters(testData, [{ field: 'pe', operator: 'lt', value: 10 }]);
      expect(result.length).toBe(1); // 平安银行5.5
    });

    it('gte应该匹配大于等于', () => {
      const result = applyFilters(testData, [{ field: 'roe', operator: 'gte', value: 20 }]);
      expect(result.length).toBe(3); // 茅台30, 宁德20, 五粮液25
    });

    it('lte应该匹配小于等于', () => {
      const result = applyFilters(testData, [{ field: 'pe', operator: 'lte', value: 28 }]);
      expect(result.length).toBe(2); // 平安银行5.5, 五粮液28
    });

    it('in应该匹配集合', () => {
      const result = applyFilters(testData, [{ field: 'sector', operator: 'in', value: ['银行', '白酒'] }]);
      expect(result.length).toBe(3);
    });

    it('between应该匹配范围', () => {
      const result = applyFilters(testData, [{ field: 'price', operator: 'between', value: 10, value2: 200 }]);
      expect(result.length).toBe(3);
    });

    it('contains应该匹配字符串包含', () => {
      const result = applyFilters(testData, [{ field: 'name', operator: 'contains', value: '酒' }]);
      expect(result.length).toBe(2);
    });
  });

  describe('多条件筛选', () => {
    it('应该应用AND逻辑', () => {
      const result = applyFilters(testData, [
        { field: 'pe', operator: 'lt', value: 30 },
        { field: 'roe', operator: 'gte', value: 15 },
      ]);
      expect(result.length).toBe(1); // 五粮液 pe=28, roe=25
    });
  });

  describe('排序', () => {
    it('应该按数字升序排序', () => {
      const result = applySort(testData, { field: 'pe', order: 'asc' });
      expect(result[0].pe).toBe(5.5);
      expect(result[result.length - 1].pe).toBe(50);
    });

    it('应该按数字降序排序', () => {
      const result = applySort(testData, { field: 'price', order: 'desc' });
      expect(result[0].name).toBe('贵州茅台酒');
    });

    it('应该按字符串排序', () => {
      const result = applySort(testData, { field: 'name', order: 'asc' });
      expect(result[0].name).toBe('万科A'); // 万 < 五 < 宁 < 平 < 贵
    });
  });

  describe('分页', () => {
    it('应该返回第一页', () => {
      const result = paginate(testData, 1, 2);
      expect(result.items.length).toBe(2);
      expect(result.total).toBe(5);
      expect(result.pages).toBe(3);
    });

    it('应该返回最后一页', () => {
      const result = paginate(testData, 3, 2);
      expect(result.items.length).toBe(1);
    });

    it('超出页数应该返回空', () => {
      const result = paginate(testData, 10, 2);
      expect(result.items.length).toBe(0);
    });
  });

  describe('组合使用', () => {
    it('应该支持筛选+排序+分页', () => {
      const filtered = applyFilters(testData, [{ field: 'roe', operator: 'gte', value: 15 }]);
      const sorted = applySort(filtered, { field: 'pe', order: 'asc' });
      const result = paginate(sorted, 1, 2);
      expect(result.items.length).toBe(2);
      expect(result.items[0].pe).toBeLessThanOrEqual(result.items[1].pe);
    });
  });
});
