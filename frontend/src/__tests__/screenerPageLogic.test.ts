/**
 * 筛选器页面逻辑测试
 * 覆盖筛选条件、多条件组合、排序分页
 */

import { describe, it, expect } from 'vitest';

describe('筛选器页面逻辑', () => {
  describe('单一条件筛选', () => {
    interface Stock {
      symbol: string;
      pe: number;
      pb: number;
      marketCap: number;
      changePercent: number;
      volume: number;
      roe: number;
    }

    type FilterOp = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'between';

    interface FilterCondition {
      field: keyof Stock;
      op: FilterOp;
      value: number;
      value2?: number;
    }

    function matchFilter(stock: Stock, filter: FilterCondition): boolean {
      const val = stock[filter.field] as number;
      switch (filter.op) {
        case 'gt': return val > filter.value;
        case 'lt': return val < filter.value;
        case 'gte': return val >= filter.value;
        case 'lte': return val <= filter.value;
        case 'eq': return val === filter.value;
        case 'between': return val >= filter.value && val <= (filter.value2 ?? filter.value);
        default: return true;
      }
    }

    function applyFilters(stocks: Stock[], filters: FilterCondition[]): Stock[] {
      return stocks.filter(s => filters.every(f => matchFilter(s, f)));
    }

    it('PE筛选应正确过滤', () => {
      const stocks: Stock[] = [
        { symbol: 'A', pe: 15, pb: 2, marketCap: 1e10, changePercent: 1, volume: 1e6, roe: 15 },
        { symbol: 'B', pe: 30, pb: 3, marketCap: 5e9, changePercent: 2, volume: 2e6, roe: 20 },
        { symbol: 'C', pe: 8, pb: 1, marketCap: 2e10, changePercent: -1, volume: 5e5, roe: 25 },
      ];
      const result = applyFilters(stocks, [{ field: 'pe', op: 'lt', value: 20 }]);
      expect(result).toHaveLength(2);
      expect(result.map(s => s.symbol)).toContain('A');
      expect(result.map(s => s.symbol)).toContain('C');
    });

    it('多条件组合应取交集', () => {
      const stocks: Stock[] = [
        { symbol: 'A', pe: 15, pb: 2, marketCap: 1e10, changePercent: 1, volume: 1e6, roe: 15 },
        { symbol: 'B', pe: 12, pb: 5, marketCap: 5e9, changePercent: 2, volume: 2e6, roe: 20 },
        { symbol: 'C', pe: 8, pb: 1, marketCap: 2e10, changePercent: -1, volume: 5e5, roe: 25 },
      ];
      const result = applyFilters(stocks, [
        { field: 'pe', op: 'lt', value: 20 },
        { field: 'pb', op: 'lt', value: 3 },
      ]);
      expect(result).toHaveLength(2);
      expect(result.map(s => s.symbol)).not.toContain('B');
    });

    it('区间筛选应正确', () => {
      const stocks: Stock[] = [
        { symbol: 'A', pe: 15, pb: 2, marketCap: 1e10, changePercent: 1, volume: 1e6, roe: 15 },
        { symbol: 'B', pe: 30, pb: 3, marketCap: 5e9, changePercent: 2, volume: 2e6, roe: 20 },
      ];
      const result = applyFilters(stocks, [{ field: 'pe', op: 'between', value: 10, value2: 20 }]);
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('A');
    });
  });

  describe('多维度排序', () => {
    interface Stock {
      symbol: string;
      pe: number;
      changePercent: number;
      volume: number;
    }

    function multiSort(stocks: Stock[], sorts: { field: keyof Stock; desc: boolean }[]): Stock[] {
      return [...stocks].sort((a, b) => {
        for (const sort of sorts) {
          const aVal = a[sort.field] as number;
          const bVal = b[sort.field] as number;
          if (aVal !== bVal) return sort.desc ? bVal - aVal : aVal - bVal;
        }
        return 0;
      });
    }

    it('应支持多字段排序', () => {
      const stocks: Stock[] = [
        { symbol: 'A', pe: 15, changePercent: 5, volume: 1e6 },
        { symbol: 'B', pe: 15, changePercent: 3, volume: 2e6 },
        { symbol: 'C', pe: 20, changePercent: 1, volume: 3e6 },
      ];
      const sorted = multiSort(stocks, [
        { field: 'pe', desc: false },
        { field: 'changePercent', desc: true },
      ]);
      expect(sorted[0].symbol).toBe('A'); // PE=15, 涨幅更大的在前
      expect(sorted[1].symbol).toBe('B');
      expect(sorted[2].symbol).toBe('C');
    });
  });

  describe('分页逻辑', () => {
    function paginate<T>(items: T[], page: number, pageSize: number): { data: T[]; total: number; totalPages: number; currentPage: number } {
      const total = items.length;
      const totalPages = Math.ceil(total / pageSize);
      const start = (page - 1) * pageSize;
      return {
        data: items.slice(start, start + pageSize),
        total,
        totalPages,
        currentPage: page,
      };
    }

    it('应正确分页', () => {
      const items = Array.from({ length: 25 }, (_, i) => i + 1);
      const page1 = paginate(items, 1, 10);
      expect(page1.data).toHaveLength(10);
      expect(page1.data[0]).toBe(1);
      expect(page1.totalPages).toBe(3);

      const page3 = paginate(items, 3, 10);
      expect(page3.data).toHaveLength(5);
      expect(page3.data[4]).toBe(25);
    });

    it('空数据应返回空', () => {
      const result = paginate([], 1, 10);
      expect(result.data).toHaveLength(0);
      expect(result.totalPages).toBe(0);
    });
  });

  describe('预设筛选方案', () => {
    const presets: Record<string, { name: string; filters: { field: string; op: string; value: number }[] }> = {
      low_pe: { name: '低PE', filters: [{ field: 'pe', op: 'lt', value: 15 }] },
      high_roe: { name: '高ROE', filters: [{ field: 'roe', op: 'gt', value: 20 }] },
      small_cap: { name: '小盘股', filters: [{ field: 'marketCap', op: 'lt', value: 5e9 }] },
      value: { name: '价值股', filters: [
        { field: 'pe', op: 'lt', value: 20 },
        { field: 'pb', op: 'lt', value: 3 },
        { field: 'roe', op: 'gt', value: 10 },
      ]},
    };

    it('应有预设方案', () => {
      expect(Object.keys(presets).length).toBeGreaterThanOrEqual(4);
    });

    it('每个方案应有名称和过滤条件', () => {
      for (const [, preset] of Object.entries(presets)) {
        expect(preset.name.length).toBeGreaterThan(0);
        expect(preset.filters.length).toBeGreaterThan(0);
      }
    });
  });
});
