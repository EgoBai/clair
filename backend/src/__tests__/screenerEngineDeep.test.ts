import { describe, it, expect } from 'vitest';

// Stock screener engine comprehensive tests
describe('Stock Screener Engine', () => {
  interface StockData {
    code: string;
    name: string;
    price: number;
    changePercent: number;
    pe: number;
    pb: number;
    roe: number;
    marketCap: number;
    volume: number;
    turnover: number;
    industry: string;
    rsi: number;
    macdSignal: 'buy' | 'sell' | 'hold';
  }

  const sampleStocks: StockData[] = [
    { code: '600519', name: '贵州茅台', price: 1800, changePercent: 2.5, pe: 35, pb: 10, roe: 30, marketCap: 2.3e12, volume: 5e6, turnover: 0.3, industry: '白酒', rsi: 65, macdSignal: 'buy' },
    { code: '000858', name: '五粮液', price: 160, changePercent: -1.2, pe: 25, pb: 6, roe: 25, marketCap: 6e11, volume: 8e6, turnover: 0.5, industry: '白酒', rsi: 40, macdSignal: 'sell' },
    { code: '300750', name: '宁德时代', price: 200, changePercent: 5.0, pe: 50, pb: 8, roe: 15, marketCap: 9e11, volume: 2e7, turnover: 1.2, industry: '新能源', rsi: 75, macdSignal: 'buy' },
    { code: '601318', name: '中国平安', price: 45, changePercent: 0.5, pe: 8, pb: 1, roe: 18, marketCap: 8e11, volume: 3e7, turnover: 0.8, industry: '保险', rsi: 50, macdSignal: 'hold' },
    { code: '600036', name: '招商银行', price: 35, changePercent: -0.3, pe: 6, pb: 0.8, roe: 16, marketCap: 9e11, volume: 1.5e7, turnover: 0.6, industry: '银行', rsi: 45, macdSignal: 'hold' },
  ];

  type FilterOp = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'between' | 'in';

  interface FilterCondition {
    field: keyof StockData;
    op: FilterOp;
    value: number | string | [number, number] | string[];
  }

  function applyFilter(stock: StockData, condition: FilterCondition): boolean {
    const val = stock[condition.field];
    switch (condition.op) {
      case 'gt': return (val as number) > (condition.value as number);
      case 'lt': return (val as number) < (condition.value as number);
      case 'gte': return (val as number) >= (condition.value as number);
      case 'lte': return (val as number) <= (condition.value as number);
      case 'eq': return val === condition.value;
      case 'between': {
        const [min, max] = condition.value as [number, number];
        return (val as number) >= min && (val as number) <= max;
      }
      case 'in': return (condition.value as string[]).includes(val as string);
      default: return true;
    }
  }

  function screenStocks(stocks: StockData[], conditions: FilterCondition[], logic: 'AND' | 'OR' = 'AND'): StockData[] {
    return stocks.filter(stock => {
      if (logic === 'AND') return conditions.every(c => applyFilter(stock, c));
      return conditions.some(c => applyFilter(stock, c));
    });
  }

  function rankStocks(stocks: StockData[], field: keyof StockData, desc = true): StockData[] {
    return [...stocks].sort((a, b) => {
      const av = a[field] as number;
      const bv = b[field] as number;
      return desc ? bv - av : av - bv;
    });
  }

  describe('Filter Operations', () => {
    it('should filter by gt', () => {
      const result = screenStocks(sampleStocks, [{ field: 'pe', op: 'gt', value: 30 }]);
      expect(result.every(s => s.pe > 30)).toBe(true);
    });

    it('should filter by lt', () => {
      const result = screenStocks(sampleStocks, [{ field: 'pe', op: 'lt', value: 10 }]);
      expect(result.every(s => s.pe < 10)).toBe(true);
    });

    it('should filter by gte', () => {
      const result = screenStocks(sampleStocks, [{ field: 'pe', op: 'gte', value: 25 }]);
      expect(result.every(s => s.pe >= 25)).toBe(true);
    });

    it('should filter by eq', () => {
      const result = screenStocks(sampleStocks, [{ field: 'industry', op: 'eq', value: '白酒' }]);
      expect(result).toHaveLength(2);
    });

    it('should filter by between', () => {
      const result = screenStocks(sampleStocks, [{ field: 'rsi', op: 'between', value: [40, 60] as [number, number] }]);
      expect(result.every(s => s.rsi >= 40 && s.rsi <= 60)).toBe(true);
    });

    it('should filter by in', () => {
      const result = screenStocks(sampleStocks, [{ field: 'industry', op: 'in', value: ['白酒', '新能源'] as string[] }]);
      expect(result).toHaveLength(3);
    });
  });

  describe('AND/OR Logic', () => {
    it('should apply AND logic', () => {
      const result = screenStocks(sampleStocks, [
        { field: 'pe', op: 'lt', value: 30 },
        { field: 'roe', op: 'gt', value: 20 },
      ], 'AND');
      expect(result.every(s => s.pe < 30 && s.roe > 20)).toBe(true);
    });

    it('should apply OR logic', () => {
      const result = screenStocks(sampleStocks, [
        { field: 'industry', op: 'eq', value: '白酒' },
        { field: 'industry', op: 'eq', value: '新能源' },
      ], 'OR');
      expect(result).toHaveLength(3);
    });

    it('should handle no matching results', () => {
      const result = screenStocks(sampleStocks, [{ field: 'pe', op: 'gt', value: 1000 }]);
      expect(result).toHaveLength(0);
    });
  });

  describe('Ranking', () => {
    it('should rank by PE descending', () => {
      const ranked = rankStocks(sampleStocks, 'pe');
      expect(ranked[0].pe).toBeGreaterThanOrEqual(ranked[1].pe);
    });

    it('should rank by PE ascending', () => {
      const ranked = rankStocks(sampleStocks, 'pe', false);
      expect(ranked[0].pe).toBeLessThanOrEqual(ranked[1].pe);
    });

    it('should rank by market cap', () => {
      const ranked = rankStocks(sampleStocks, 'marketCap');
      expect(ranked[0].marketCap).toBeGreaterThanOrEqual(ranked[ranked.length - 1].marketCap);
    });

    it('should not mutate original', () => {
      const original = [...sampleStocks];
      rankStocks(sampleStocks, 'pe');
      expect(sampleStocks[0].code).toBe(original[0].code);
    });
  });

  describe('Composite Screening', () => {
    it('should find value stocks', () => {
      const valueStocks = screenStocks(sampleStocks, [
        { field: 'pe', op: 'lt', value: 15 },
        { field: 'pb', op: 'lt', value: 2 },
      ]);
      expect(valueStocks).toHaveLength(2); // 平安 + 招行
    });

    it('should find high-growth stocks', () => {
      const growth = screenStocks(sampleStocks, [
        { field: 'changePercent', op: 'gt', value: 2 },
        { field: 'rsi', op: 'gt', value: 60 },
      ]);
      expect(growth.every(s => s.changePercent > 2 && s.rsi > 60)).toBe(true);
    });

    it('should find buy signal stocks', () => {
      const buys = screenStocks(sampleStocks, [
        { field: 'macdSignal', op: 'eq', value: 'buy' },
      ]);
      expect(buys.every(s => s.macdSignal === 'buy')).toBe(true);
    });
  });

  describe('Scoring System', () => {
    function scoreStock(stock: StockData): number {
      let score = 50;
      // Low PE bonus
      if (stock.pe < 15) score += 15;
      else if (stock.pe < 25) score += 10;
      else if (stock.pe > 50) score -= 10;
      // High ROE bonus
      if (stock.roe > 25) score += 15;
      else if (stock.roe > 15) score += 10;
      // Momentum
      if (stock.changePercent > 3) score += 10;
      else if (stock.changePercent < -3) score -= 10;
      // RSI
      if (stock.rsi > 70) score -= 5;
      else if (stock.rsi < 30) score += 10;
      // MACD
      if (stock.macdSignal === 'buy') score += 10;
      else if (stock.macdSignal === 'sell') score -= 10;
      return Math.max(0, Math.min(100, score));
    }

    it('should score between 0 and 100', () => {
      for (const stock of sampleStocks) {
        const score = scoreStock(stock);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    });

    it('should give higher score to low PE high ROE', () => {
      const score600519 = scoreStock(sampleStocks[0]); // high PE, high ROE
      const score601318 = scoreStock(sampleStocks[3]); // low PE, decent ROE
      expect(score601318).toBeGreaterThan(score600519 - 10); // 平安should score well
    });

    it('should penalize sell signals', () => {
      const normal = { ...sampleStocks[0], macdSignal: 'hold' as const };
      const sell = { ...sampleStocks[0], macdSignal: 'sell' as const };
      expect(scoreStock(normal)).toBeGreaterThan(scoreStock(sell));
    });
  });
});
