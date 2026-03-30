import { describe, it, expect } from 'vitest';

// 股票筛选器引擎
interface StockData {
  code: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  amount: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  pe: number | null;
  pb: number | null;
  marketCap: number;
  turnoverRate: number;
  amplitude: number;
  sector: string;
  industry: string;
}

interface FilterRule {
  field: keyof StockData;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'ne' | 'between' | 'in' | 'not_in' | 'contains';
  value: number | string | (number | string)[];
}

interface SortConfig {
  field: keyof StockData;
  order: 'asc' | 'desc';
}

function filterStocks(stocks: StockData[], rules: FilterRule[]): StockData[] {
  return stocks.filter(stock =>
    rules.every(rule => {
      const fieldValue = stock[rule.field];
      if (fieldValue === null || fieldValue === undefined) return false;
      
      switch (rule.operator) {
        case 'gt': return (fieldValue as number) > (rule.value as number);
        case 'lt': return (fieldValue as number) < (rule.value as number);
        case 'gte': return (fieldValue as number) >= (rule.value as number);
        case 'lte': return (fieldValue as number) <= (rule.value as number);
        case 'eq': return fieldValue === rule.value;
        case 'ne': return fieldValue !== rule.value;
        case 'between': {
          const [min, max] = rule.value as [number, number];
          return (fieldValue as number) >= min && (fieldValue as number) <= max;
        }
        case 'in': return (rule.value as (number | string)[]).includes(fieldValue);
        case 'not_in': return !(rule.value as (number | string)[]).includes(fieldValue);
        case 'contains': return String(fieldValue).includes(String(rule.value));
        default: return true;
      }
    })
  );
}

function sortStocks(stocks: StockData[], sorts: SortConfig[]): StockData[] {
  return [...stocks].sort((a, b) => {
    for (const sort of sorts) {
      const aVal = a[sort.field] ?? 0;
      const bVal = b[sort.field] ?? 0;
      const diff = (aVal as number) - (bVal as number);
      if (diff !== 0) return sort.order === 'asc' ? diff : -diff;
    }
    return 0;
  });
}

function paginateStocks(stocks: StockData[], page: number, pageSize: number) {
  const total = stocks.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  return {
    data: stocks.slice(start, start + pageSize),
    pagination: { page, pageSize, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
  };
}

function calculateSectorStats(stocks: StockData[]) {
  const sectors = new Map<string, { count: number; totalChange: number; totalAmount: number; upCount: number; downCount: number }>();
  
  for (const stock of stocks) {
    const sector = sectors.get(stock.sector) || { count: 0, totalChange: 0, totalAmount: 0, upCount: 0, downCount: 0 };
    sector.count++;
    sector.totalChange += stock.changePercent;
    sector.totalAmount += stock.amount;
    if (stock.changePercent > 0) sector.upCount++;
    else if (stock.changePercent < 0) sector.downCount++;
    sectors.set(stock.sector, sector);
  }

  return Array.from(sectors.entries()).map(([name, stats]) => ({
    sector: name,
    count: stats.count,
    avgChange: stats.totalChange / stats.count,
    totalAmount: stats.totalAmount,
    upCount: stats.upCount,
    downCount: stats.downCount,
    upRatio: stats.upCount / stats.count,
  })).sort((a, b) => b.avgChange - a.avgChange);
}

function generateMockStocks(count: number): StockData[] {
  const sectors = ['金融', '科技', '消费', '医药', '能源', '工业', '材料', '地产'];
  const stocks: StockData[] = [];
  for (let i = 0; i < count; i++) {
    const prevClose = 10 + Math.random() * 100;
    const changePercent = (Math.random() - 0.5) * 20;
    const price = prevClose * (1 + changePercent / 100);
    stocks.push({
      code: `${String(i).padStart(6, '0')}`,
      name: `股票${i}`,
      price,
      change: price - prevClose,
      changePercent,
      volume: Math.floor(Math.random() * 10000000),
      amount: Math.random() * 1000000000,
      high: price * 1.02,
      low: price * 0.98,
      open: prevClose * (1 + (Math.random() - 0.5) * 0.02),
      prevClose,
      pe: Math.random() > 0.1 ? Math.random() * 100 : null,
      pb: Math.random() > 0.1 ? Math.random() * 10 : null,
      marketCap: Math.random() * 100000000000,
      turnoverRate: Math.random() * 20,
      amplitude: Math.random() * 15,
      sector: sectors[i % sectors.length],
      industry: `行业${i % 20}`,
    });
  }
  return stocks;
}

describe('股票筛选器引擎', () => {
  const testStocks = generateMockStocks(200);

  describe('filterStocks', () => {
    it('应该按价格范围筛选', () => {
      const result = filterStocks(testStocks, [
        { field: 'price', operator: 'gte', value: 50 },
        { field: 'price', operator: 'lte', value: 100 },
      ]);
      result.forEach(s => {
        expect(s.price).toBeGreaterThanOrEqual(50);
        expect(s.price).toBeLessThanOrEqual(100);
      });
    });

    it('应该按涨幅筛选', () => {
      const result = filterStocks(testStocks, [
        { field: 'changePercent', operator: 'gt', value: 5 },
      ]);
      result.forEach(s => {
        expect(s.changePercent).toBeGreaterThan(5);
      });
    });

    it('应该按跌幅筛选', () => {
      const result = filterStocks(testStocks, [
        { field: 'changePercent', operator: 'lt', value: -5 },
      ]);
      result.forEach(s => {
        expect(s.changePercent).toBeLessThan(-5);
      });
    });

    it('应该支持between操作符', () => {
      const result = filterStocks(testStocks, [
        { field: 'volume', operator: 'between', value: [1000000, 5000000] },
      ]);
      result.forEach(s => {
        expect(s.volume).toBeGreaterThanOrEqual(1000000);
        expect(s.volume).toBeLessThanOrEqual(5000000);
      });
    });

    it('应该支持in操作符', () => {
      const result = filterStocks(testStocks, [
        { field: 'sector', operator: 'in', value: ['金融', '科技'] },
      ]);
      result.forEach(s => {
        expect(['金融', '科技']).toContain(s.sector);
      });
    });

    it('应该支持not_in操作符', () => {
      const result = filterStocks(testStocks, [
        { field: 'sector', operator: 'not_in', value: ['金融', '科技'] },
      ]);
      result.forEach(s => {
        expect(['金融', '科技']).not.toContain(s.sector);
      });
    });

    it('应该支持contains操作符', () => {
      const result = filterStocks(testStocks, [
        { field: 'name', operator: 'contains', value: '股票1' },
      ]);
      result.forEach(s => {
        expect(s.name).toContain('股票1');
      });
    });

    it('null值的字段应该被过滤掉', () => {
      const result = filterStocks(testStocks, [
        { field: 'pe', operator: 'gt', value: 0 },
      ]);
      result.forEach(s => {
        expect(s.pe).not.toBeNull();
        expect(s.pe).toBeGreaterThan(0);
      });
    });

    it('应该支持多条件组合', () => {
      const result = filterStocks(testStocks, [
        { field: 'changePercent', operator: 'gt', value: 0 },
        { field: 'volume', operator: 'gt', value: 5000000 },
        { field: 'sector', operator: 'eq', value: '科技' },
      ]);
      result.forEach(s => {
        expect(s.changePercent).toBeGreaterThan(0);
        expect(s.volume).toBeGreaterThan(5000000);
        expect(s.sector).toBe('科技');
      });
    });

    it('无匹配结果应该返回空数组', () => {
      const result = filterStocks(testStocks, [
        { field: 'price', operator: 'gt', value: 999999 },
      ]);
      expect(result).toEqual([]);
    });

    it('空规则应该返回所有股票', () => {
      const result = filterStocks(testStocks, []);
      expect(result).toHaveLength(testStocks.length);
    });
  });

  describe('sortStocks', () => {
    it('应该按价格升序排序', () => {
      const result = sortStocks(testStocks, [{ field: 'price', order: 'asc' }]);
      for (let i = 1; i < result.length; i++) {
        expect(result[i].price).toBeGreaterThanOrEqual(result[i - 1].price);
      }
    });

    it('应该按涨幅降序排序', () => {
      const result = sortStocks(testStocks, [{ field: 'changePercent', order: 'desc' }]);
      for (let i = 1; i < result.length; i++) {
        expect(result[i].changePercent).toBeLessThanOrEqual(result[i - 1].changePercent);
      }
    });

    it('应该支持多级排序', () => {
      const smallSet = testStocks.slice(0, 20);
      const result = sortStocks(smallSet, [
        { field: 'sector', order: 'asc' },
        { field: 'changePercent', order: 'desc' },
      ]);
      for (let i = 1; i < result.length; i++) {
        if (result[i].sector === result[i - 1].sector) {
          expect(result[i].changePercent).toBeLessThanOrEqual(result[i - 1].changePercent);
        }
      }
    });

    it('不应该修改原数组', () => {
      const original = [...testStocks];
      sortStocks(testStocks, [{ field: 'price', order: 'desc' }]);
      expect(testStocks[0].code).toBe(original[0].code);
    });
  });

  describe('paginateStocks', () => {
    it('应该返回正确的分页数据', () => {
      const result = paginateStocks(testStocks, 1, 10);
      expect(result.data).toHaveLength(10);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.total).toBe(200);
      expect(result.pagination.totalPages).toBe(20);
    });

    it('最后一页可能不满', () => {
      const result = paginateStocks(testStocks, 20, 10);
      expect(result.data).toHaveLength(10);
      expect(result.pagination.hasNext).toBe(false);
    });

    it('第一页hasPrev应该为false', () => {
      const result = paginateStocks(testStocks, 1, 10);
      expect(result.pagination.hasPrev).toBe(false);
      expect(result.pagination.hasNext).toBe(true);
    });

    it('中间页hasPrev和hasNext都为true', () => {
      const result = paginateStocks(testStocks, 10, 10);
      expect(result.pagination.hasPrev).toBe(true);
      expect(result.pagination.hasNext).toBe(true);
    });

    it('超出范围应该返回空数组', () => {
      const result = paginateStocks(testStocks, 999, 10);
      expect(result.data).toHaveLength(0);
    });

    it('空数组分页', () => {
      const result = paginateStocks([], 1, 10);
      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });
  });

  describe('calculateSectorStats', () => {
    it('应该返回所有板块统计', () => {
      const stats = calculateSectorStats(testStocks);
      expect(stats.length).toBeGreaterThan(0);
      stats.forEach(s => {
        expect(s).toHaveProperty('sector');
        expect(s).toHaveProperty('count');
        expect(s).toHaveProperty('avgChange');
        expect(s).toHaveProperty('upCount');
        expect(s).toHaveProperty('downCount');
        expect(s).toHaveProperty('upRatio');
      });
    });

    it('应该按平均涨幅降序排列', () => {
      const stats = calculateSectorStats(testStocks);
      for (let i = 1; i < stats.length; i++) {
        expect(stats[i].avgChange).toBeLessThanOrEqual(stats[i - 1].avgChange);
      }
    });

    it('count应该等于该板块的股票数', () => {
      const stats = calculateSectorStats(testStocks);
      const totalCount = stats.reduce((s, st) => s + st.count, 0);
      expect(totalCount).toBe(testStocks.length);
    });

    it('upCount + downCount应该 <= count', () => {
      const stats = calculateSectorStats(testStocks);
      stats.forEach(s => {
        expect(s.upCount + s.downCount).toBeLessThanOrEqual(s.count);
      });
    });

    it('upRatio应该在0-1之间', () => {
      const stats = calculateSectorStats(testStocks);
      stats.forEach(s => {
        expect(s.upRatio).toBeGreaterThanOrEqual(0);
        expect(s.upRatio).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('组合场景: 筛选 + 排序 + 分页', () => {
    it('完整工作流', () => {
      const filtered = filterStocks(testStocks, [
        { field: 'changePercent', operator: 'gt', value: 0 },
        { field: 'volume', operator: 'gt', value: 1000000 },
      ]);
      const sorted = sortStocks(filtered, [{ field: 'changePercent', order: 'desc' }]);
      const paged = paginateStocks(sorted, 1, 5);

      expect(paged.data.length).toBeLessThanOrEqual(5);
      // 验证第一页的涨幅都是正数
      paged.data.forEach(s => {
        expect(s.changePercent).toBeGreaterThan(0);
        expect(s.volume).toBeGreaterThan(1000000);
      });
      // 验证排序
      for (let i = 1; i < paged.data.length; i++) {
        expect(paged.data[i].changePercent).toBeLessThanOrEqual(paged.data[i - 1].changePercent);
      }
    });
  });
});
