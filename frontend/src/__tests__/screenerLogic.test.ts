import { describe, it, expect } from 'vitest';

// ===== 选股器逻辑测试 =====
describe('Screener Logic', () => {
  interface FilterCondition { field: string; operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'between' | 'in'; value: number | string | [number, number]; }
  interface StockData { code: string; name: string; price: number; pe: number; pb: number; roe: number; change: number; volume: number; marketCap: number; sector: string; }

  const applyFilter = (stock: StockData, condition: FilterCondition): boolean => {
    const val = (stock as Record<string, unknown>)[condition.field];
    if (typeof val !== 'number' && typeof val !== 'string') return false;
    switch (condition.operator) {
      case 'gt': return (val as number) > (condition.value as number);
      case 'lt': return (val as number) < (condition.value as number);
      case 'gte': return (val as number) >= (condition.value as number);
      case 'lte': return (val as number) <= (condition.value as number);
      case 'eq': return val === condition.value;
      case 'between': {
        const [min, max] = condition.value as [number, number];
        return (val as number) >= min && (val as number) <= max;
      }
      case 'in': return (condition.value as (string | number)[]).includes(val);
      default: return true;
    }
  };

  const screenStocks = (stocks: StockData[], conditions: FilterCondition[], logic: 'and' | 'or' = 'and'): StockData[] => {
    return stocks.filter(s => {
      const results = conditions.map(c => applyFilter(s, c));
      return logic === 'and' ? results.every(Boolean) : results.some(Boolean);
    });
  };

  const scoreStock = (s: StockData): number => {
    let score = 50;
    if (s.pe > 0 && s.pe < 15) score += 15;
    else if (s.pe > 0 && s.pe < 25) score += 8;
    if (s.pb > 0 && s.pb < 1.5) score += 10;
    if (s.roe > 15) score += 15;
    else if (s.roe > 10) score += 8;
    if (s.change > 0 && s.change < 3) score += 5;
    if (s.volume > 1e7) score += 5;
    return Math.min(100, Math.max(0, score));
  };

  const stocks: StockData[] = [
    { code: '600519', name: '贵州茅台', price: 1800, pe: 35, pb: 10, roe: 30, change: 2, volume: 5e7, marketCap: 2.3e12, sector: '白酒' },
    { code: '000858', name: '五粮液', price: 150, pe: 25, pb: 5, roe: 20, change: -1, volume: 3e7, marketCap: 5.8e11, sector: '白酒' },
    { code: '002714', name: '牧原股份', price: 45, pe: 10, pb: 3, roe: 25, change: 3, volume: 1e8, marketCap: 2.2e11, sector: '农业' },
    { code: '601318', name: '中国平安', price: 50, pe: 8, pb: 1, roe: 12, change: 0.5, volume: 2e7, marketCap: 9e11, sector: '金融' },
    { code: '300750', name: '宁德时代', price: 200, pe: 60, pb: 8, roe: 18, change: -2, volume: 8e7, marketCap: 9e11, sector: '新能源' },
  ];

  it('应该按PE筛选', () => {
    const result = screenStocks(stocks, [{ field: 'pe', operator: 'lt', value: 20 }]);
    expect(result.length).toBe(2);
    expect(result.every(s => s.pe < 20)).toBe(true);
  });

  it('应该按between操作符筛选', () => {
    const result = screenStocks(stocks, [{ field: 'price', operator: 'between', value: [40, 100] }]);
    expect(result.every(s => s.price >= 40 && s.price <= 100)).toBe(true);
  });

  it('应该支持AND逻辑', () => {
    const result = screenStocks(stocks, [
      { field: 'pe', operator: 'lt', value: 30 },
      { field: 'roe', operator: 'gt', value: 15 },
    ], 'and');
    expect(result.every(s => s.pe < 30 && s.roe > 15)).toBe(true);
  });

  it('应该支持OR逻辑', () => {
    const result = screenStocks(stocks, [
      { field: 'code', operator: 'eq', value: '600519' },
      { field: 'code', operator: 'eq', value: '000858' },
    ], 'or');
    expect(result.length).toBe(2);
  });

  it('应该评分股票', () => {
    const score = scoreStock(stocks[3]); // 中国平安 PE=8, PB=1, ROE=12
    expect(score).toBeGreaterThan(50);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('应该给低PE高分', () => {
    const lowPE = scoreStock(stocks[3]); // PE=8
    const highPE = scoreStock(stocks[4]); // PE=60
    expect(lowPE).toBeGreaterThan(highPE);
  });

  it('应该处理空结果', () => {
    const result = screenStocks(stocks, [{ field: 'pe', operator: 'lt', value: 0 }]);
    expect(result).toEqual([]);
  });

  it('应该按行业筛选', () => {
    const result = screenStocks(stocks, [{ field: 'sector', operator: 'eq', value: '白酒' }]);
    expect(result.length).toBe(2);
  });

  it('应该按in操作符筛选', () => {
    const result = screenStocks(stocks, [{ field: 'sector', operator: 'in', value: ['白酒', '金融'] }]);
    expect(result.length).toBe(3);
  });

  it('应该处理无条件筛选', () => {
    const result = screenStocks(stocks, []);
    expect(result).toEqual(stocks);
  });
});
