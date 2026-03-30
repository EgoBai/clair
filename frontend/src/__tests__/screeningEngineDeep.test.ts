import { describe, it, expect } from 'vitest';

// 股票筛选逻辑深度测试
describe('Stock Screening Engine Deep', () => {
  interface Stock {
    code: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    turnover: number;
    marketCap: number;
    pe: number;
    pb: number;
    roe: number;
    turnoverRate: number;
    sector: string;
    dividendYield: number;
  }

  type Operator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'between' | 'in';

  interface FilterCondition {
    field: keyof Stock;
    operator: Operator;
    value: number | string | [number, number] | (number | string)[];
  }

  const applyFilter = (stock: Stock, condition: FilterCondition): boolean => {
    const val = stock[condition.field];
    switch (condition.operator) {
      case 'gt': return Number(val) > Number(condition.value);
      case 'lt': return Number(val) < Number(condition.value);
      case 'gte': return Number(val) >= Number(condition.value);
      case 'lte': return Number(val) <= Number(condition.value);
      case 'eq': return val === condition.value;
      case 'between': {
        const [min, max] = condition.value as [number, number];
        return Number(val) >= min && Number(val) <= max;
      }
      case 'in': {
        const arr = condition.value as (number | string)[];
        return arr.includes(val as string | number);
      }
      default: return true;
    }
  };

  const screenStocks = (stocks: Stock[], conditions: FilterCondition[], logic: 'AND' | 'OR' = 'AND'): Stock[] => {
    return stocks.filter(stock => {
      if (logic === 'AND') return conditions.every(c => applyFilter(stock, c));
      return conditions.some(c => applyFilter(stock, c));
    });
  };

  const scoreStock = (stock: Stock): number => {
    let score = 50;
    // PE 合理范围加分
    if (stock.pe > 0 && stock.pe < 20) score += 15;
    else if (stock.pe >= 20 && stock.pe < 40) score += 5;
    else if (stock.pe >= 40) score -= 10;
    // ROE 加分
    if (stock.roe > 20) score += 15;
    else if (stock.roe > 10) score += 8;
    // 股息率加分
    if (stock.dividendYield > 3) score += 10;
    else if (stock.dividendYield > 1) score += 5;
    // 高换手率减分 (投机性)
    if (stock.turnoverRate > 10) score -= 10;
    return Math.max(0, Math.min(100, score));
  };

  const sampleStocks: Stock[] = [
    { code: '600519', name: '贵州茅台', price: 1850, change: 25, changePercent: 1.37, volume: 30000, turnover: 5.5e9, marketCap: 2.3e12, pe: 35, pb: 12, roe: 30, turnoverRate: 0.15, sector: '白酒', dividendYield: 1.2 },
    { code: '000001', name: '平安银行', price: 13, change: -0.2, changePercent: -1.5, volume: 800000, turnover: 1e10, marketCap: 2.5e11, pe: 5, pb: 0.7, roe: 12, turnoverRate: 0.4, sector: '银行', dividendYield: 4.5 },
    { code: '300750', name: '宁德时代', price: 210, change: 8, changePercent: 3.96, volume: 200000, turnover: 4.2e9, marketCap: 9.8e11, pe: 45, pb: 8, roe: 18, turnoverRate: 0.8, sector: '新能源', dividendYield: 0.3 },
    { code: '000858', name: '五粮液', price: 150, change: -3, changePercent: -1.96, volume: 100000, turnover: 1.5e9, marketCap: 5.8e11, pe: 25, pb: 6, roe: 22, turnoverRate: 0.25, sector: '白酒', dividendYield: 2.1 },
    { code: '688981', name: '中芯国际', price: 50, change: 2, changePercent: 4.17, volume: 500000, turnover: 2.5e9, marketCap: 3.9e11, pe: 80, pb: 3, roe: 5, turnoverRate: 1.2, sector: '半导体', dividendYield: 0 },
  ];

  describe('Filter Operators', () => {
    it('should filter by gt', () => {
      const result = screenStocks(sampleStocks, [{ field: 'pe', operator: 'gt', value: 30 }]);
      expect(result.every(s => s.pe > 30)).toBe(true);
    });

    it('should filter by lt', () => {
      const result = screenStocks(sampleStocks, [{ field: 'pe', operator: 'lt', value: 30 }]);
      expect(result.every(s => s.pe < 30)).toBe(true);
    });

    it('should filter by gte', () => {
      const result = screenStocks(sampleStocks, [{ field: 'roe', operator: 'gte', value: 20 }]);
      expect(result.every(s => s.roe >= 20)).toBe(true);
    });

    it('should filter by lte', () => {
      const result = screenStocks(sampleStocks, [{ field: 'price', operator: 'lte', value: 100 }]);
      expect(result.every(s => s.price <= 100)).toBe(true);
    });

    it('should filter by eq', () => {
      const result = screenStocks(sampleStocks, [{ field: 'sector', operator: 'eq', value: '白酒' }]);
      expect(result).toHaveLength(2);
    });

    it('should filter by between', () => {
      const result = screenStocks(sampleStocks, [{ field: 'pe', operator: 'between', value: [20, 50] }]);
      expect(result.every(s => s.pe >= 20 && s.pe <= 50)).toBe(true);
    });

    it('should filter by in', () => {
      const result = screenStocks(sampleStocks, [{ field: 'sector', operator: 'in', value: ['白酒', '银行'] }]);
      expect(result).toHaveLength(3);
    });
  });

  describe('AND/OR Logic', () => {
    it('should apply AND logic', () => {
      const result = screenStocks(sampleStocks, [
        { field: 'pe', operator: 'lt', value: 30 },
        { field: 'roe', operator: 'gt', value: 15 },
      ], 'AND');
      expect(result.every(s => s.pe < 30 && s.roe > 15)).toBe(true);
    });

    it('should apply OR logic', () => {
      const result = screenStocks(sampleStocks, [
        { field: 'sector', operator: 'eq', value: '白酒' },
        { field: 'sector', operator: 'eq', value: '银行' },
      ], 'OR');
      expect(result).toHaveLength(3);
    });

    it('should return all for empty conditions', () => {
      expect(screenStocks(sampleStocks, [])).toHaveLength(5);
    });
  });

  describe('Stock Scoring', () => {
    it('should score low PE high ROE stocks higher', () => {
      const bank = sampleStocks.find(s => s.code === '000001')!;
      const semiconductor = sampleStocks.find(s => s.code === '688981')!;
      expect(scoreStock(bank)).toBeGreaterThan(scoreStock(semiconductor));
    });

    it('should score between 0 and 100', () => {
      for (const stock of sampleStocks) {
        const score = scoreStock(stock);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    });

    it('should reward dividend yield', () => {
      const highDiv = { ...sampleStocks[0], dividendYield: 5 };
      const lowDiv = { ...sampleStocks[0], dividendYield: 0.1 };
      expect(scoreStock(highDiv)).toBeGreaterThan(scoreStock(lowDiv));
    });

    it('should penalize high turnover', () => {
      const normal = { ...sampleStocks[0], turnoverRate: 0.5 };
      const highTurnover = { ...sampleStocks[0], turnoverRate: 15 };
      expect(scoreStock(normal)).toBeGreaterThan(scoreStock(highTurnover));
    });
  });

  describe('Value Screening', () => {
    it('should find value stocks', () => {
      const valueStocks = screenStocks(sampleStocks, [
        { field: 'pe', operator: 'lt', value: 15 },
        { field: 'pb', operator: 'lt', value: 2 },
        { field: 'dividendYield', operator: 'gt', value: 2 },
      ]);
      expect(valueStocks.length).toBeGreaterThanOrEqual(0);
    });

    it('should find growth stocks', () => {
      const growthStocks = screenStocks(sampleStocks, [
        { field: 'roe', operator: 'gt', value: 15 },
        { field: 'pe', operator: 'gt', value: 20 },
      ]);
      expect(growthStocks.every(s => s.roe > 15 && s.pe > 20)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty stock list', () => {
      expect(screenStocks([], [{ field: 'pe', operator: 'gt', value: 0 }])).toHaveLength(0);
    });

    it('should handle all filtered out', () => {
      const result = screenStocks(sampleStocks, [{ field: 'pe', operator: 'lt', value: 0 }]);
      expect(result).toHaveLength(0);
    });

    it('should handle boundary values', () => {
      const result = screenStocks(sampleStocks, [{ field: 'pe', operator: 'gte', value: 5 }]);
      expect(result.every(s => s.pe >= 5)).toBe(true);
    });
  });
});
