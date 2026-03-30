import { describe, it, expect } from 'vitest';

describe('StockFilterLogic', () => {
  interface FilterCondition {
    field: string;
    operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'between' | 'in';
    value: number | string | [number, number] | string[];
  }

  interface Stock {
    symbol: string;
    name: string;
    price: number;
    changePercent: number;
    volume: number;
    amount: number;
    pe: number;
    pb: number;
    roe: number;
    turnoverRate: number;
    marketCap: number;
    industry: string;
    ma5: number;
    ma20: number;
    rsi: number;
  }

  function applyFilter(stock: Stock, condition: FilterCondition): boolean {
    const fieldValue = stock[condition.field as keyof Stock];
    if (fieldValue === undefined || fieldValue === null) return false;
    switch (condition.operator) {
      case 'gt': return Number(fieldValue) > Number(condition.value);
      case 'lt': return Number(fieldValue) < Number(condition.value);
      case 'gte': return Number(fieldValue) >= Number(condition.value);
      case 'lte': return Number(fieldValue) <= Number(condition.value);
      case 'eq': return fieldValue === condition.value;
      case 'between': {
        const [min, max] = condition.value as [number, number];
        return Number(fieldValue) >= min && Number(fieldValue) <= max;
      }
      case 'in': return (condition.value as string[]).includes(String(fieldValue));
      default: return false;
    }
  }

  function applyFilters(stock: Stock, conditions: FilterCondition[], logic: 'AND' | 'OR' = 'AND'): boolean {
    if (logic === 'AND') return conditions.every(c => applyFilter(stock, c));
    return conditions.some(c => applyFilter(stock, c));
  }

  function screenStocks(stocks: Stock[], conditions: FilterCondition[], logic: 'AND' | 'OR' = 'AND'): Stock[] {
    return stocks.filter(s => applyFilters(s, conditions, logic));
  }

  function rankStocks(stocks: Stock[], rankField: string, descending = true): Stock[] {
    return [...stocks].sort((a, b) => {
      const aVal = a[rankField as keyof Stock] as number;
      const bVal = b[rankField as keyof Stock] as number;
      return descending ? bVal - aVal : aVal - bVal;
    });
  }

  const stocks: Stock[] = [
    { symbol: '600519', name: '贵州茅台', price: 1800, changePercent: 2.86, volume: 30000, amount: 5.4e10, pe: 40, pb: 12, roe: 30, turnoverRate: 0.24, marketCap: 2.26e12, industry: '白酒', ma5: 1780, ma20: 1750, rsi: 65 },
    { symbol: '000858', name: '五粮液', price: 168, changePercent: 3.38, volume: 250000, amount: 4.2e10, pe: 28, pb: 7, roe: 25, turnoverRate: 0.65, marketCap: 6.5e11, industry: '白酒', ma5: 165, ma20: 160, rsi: 68 },
    { symbol: '300750', name: '宁德时代', price: 210, changePercent: -3.67, volume: 400000, amount: 8.4e10, pe: 35, pb: 5.5, roe: 15, turnoverRate: 0.95, marketCap: 9.2e11, industry: '新能源', ma5: 215, ma20: 225, rsi: 28 },
    { symbol: '000001', name: '平安银行', price: 12.5, changePercent: -9.42, volume: 800000, amount: 1e10, pe: 5, pb: 0.6, roe: 12, turnoverRate: 0.41, marketCap: 2.4e11, industry: '银行', ma5: 13, ma20: 13.5, rsi: 15 },
    { symbol: '688981', name: '中芯国际', price: 55, changePercent: 0, volume: 150000, amount: 8.25e9, pe: 50, pb: 2.8, roe: 5, turnoverRate: 0.38, marketCap: 4.3e11, industry: '半导体', ma5: 54, ma20: 53, rsi: 52 },
    { symbol: '002594', name: '比亚迪', price: 260, changePercent: 4.0, volume: 350000, amount: 9.1e10, pe: 45, pb: 8, roe: 18, turnoverRate: 1.2, marketCap: 7.6e11, industry: '新能源', ma5: 255, ma20: 248, rsi: 72 },
  ];

  it('should filter by price above', () => {
    const result = screenStocks(stocks, [{ field: 'price', operator: 'gt', value: 200 }]);
    expect(result.every(s => s.price > 200)).toBe(true);
  });

  it('should filter by price below', () => {
    const result = screenStocks(stocks, [{ field: 'price', operator: 'lt', value: 100 }]);
    expect(result.every(s => s.price < 100)).toBe(true);
  });

  it('should filter by PE range', () => {
    const result = screenStocks(stocks, [{ field: 'pe', operator: 'between', value: [20, 40] }]);
    expect(result.every(s => s.pe >= 20 && s.pe <= 40)).toBe(true);
  });

  it('should filter by industry', () => {
    const result = screenStocks(stocks, [{ field: 'industry', operator: 'in', value: ['白酒', '新能源'] }]);
    expect(result.every(s => ['白酒', '新能源'].includes(s.industry))).toBe(true);
  });

  it('should filter by RSI oversold', () => {
    const result = screenStocks(stocks, [{ field: 'rsi', operator: 'lt', value: 30 }]);
    expect(result.every(s => s.rsi < 30)).toBe(true);
  });

  it('should filter by multiple conditions AND', () => {
    const result = screenStocks(stocks, [
      { field: 'pe', operator: 'lt', value: 50 },
      { field: 'roe', operator: 'gt', value: 10 },
    ], 'AND');
    expect(result.every(s => s.pe < 50 && s.roe > 10)).toBe(true);
  });

  it('should filter by multiple conditions OR', () => {
    const result = screenStocks(stocks, [
      { field: 'price', operator: 'gt', value: 1000 },
      { field: 'rsi', operator: 'lt', value: 20 },
    ], 'OR');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should rank by market cap descending', () => {
    const result = rankStocks(stocks, 'marketCap');
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].marketCap).toBeGreaterThanOrEqual(result[i].marketCap);
    }
  });

  it('should rank by PE ascending', () => {
    const result = rankStocks(stocks, 'pe', false);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].pe).toBeLessThanOrEqual(result[i].pe);
    }
  });

  it('should filter zero results', () => {
    const result = screenStocks(stocks, [{ field: 'price', operator: 'gt', value: 10000 }]);
    expect(result).toHaveLength(0);
  });

  it('should handle gte and lte operators', () => {
    const gte = screenStocks(stocks, [{ field: 'price', operator: 'gte', value: 210 }]);
    expect(gte.every(s => s.price >= 210)).toBe(true);
    const lte = screenStocks(stocks, [{ field: 'price', operator: 'lte', value: 55 }]);
    expect(lte.every(s => s.price <= 55)).toBe(true);
  });

  it('should handle eq operator', () => {
    const result = screenStocks(stocks, [{ field: 'symbol', operator: 'eq', value: '600519' }]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('贵州茅台');
  });

  it('should filter high turnover stocks', () => {
    const result = screenStocks(stocks, [{ field: 'turnoverRate', operator: 'gt', value: 0.5 }]);
    expect(result.every(s => s.turnoverRate > 0.5)).toBe(true);
  });

  it('should filter large cap stocks', () => {
    const result = screenStocks(stocks, [{ field: 'marketCap', operator: 'gt', value: 1e12 }]);
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('600519');
  });
});
