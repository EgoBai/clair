import { describe, it, expect } from 'vitest';

// Advanced Screening & Ranking Engine
interface ScreenCriteria {
  field: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'ne' | 'between' | 'in' | 'contains';
  value: any;
  value2?: any;
}

interface StockData {
  code: string;
  name: string;
  price: number;
  pe: number;
  pb: number;
  roe: number;
  revenueGrowth: number;
  profitGrowth: number;
  debtRatio: number;
  dividendYield: number;
  volume: number;
  turnover: number;
  marketCap: number;
  sector: string;
  weekChange: number;
  monthChange: number;
  yearChange: number;
}

function evaluateCriterion(data: StockData, criterion: ScreenCriteria): boolean {
  const fieldValue = (data as any)[criterion.field];
  if (fieldValue === undefined) return false;

  switch (criterion.operator) {
    case 'gt': return fieldValue > criterion.value;
    case 'lt': return fieldValue < criterion.value;
    case 'gte': return fieldValue >= criterion.value;
    case 'lte': return fieldValue <= criterion.value;
    case 'eq': return fieldValue === criterion.value;
    case 'ne': return fieldValue !== criterion.value;
    case 'between': return fieldValue >= criterion.value && fieldValue <= (criterion.value2 ?? criterion.value);
    case 'in': return Array.isArray(criterion.value) && criterion.value.includes(fieldValue);
    case 'contains': return typeof fieldValue === 'string' && fieldValue.includes(criterion.value);
    default: return false;
  }
}

function screenStocks(stocks: StockData[], criteria: ScreenCriteria[], matchAll = true): StockData[] {
  return stocks.filter(stock => {
    const results = criteria.map(c => evaluateCriterion(stock, c));
    return matchAll ? results.every(Boolean) : results.some(Boolean);
  });
}

function rankStocks(stocks: StockData[], rankBy: keyof StockData, desc = true, topN?: number): StockData[] {
  const sorted = [...stocks].sort((a, b) => {
    const va = a[rankBy] as number, vb = b[rankBy] as number;
    return desc ? vb - va : va - vb;
  });
  return topN ? sorted.slice(0, topN) : sorted;
}

function compositeScore(stock: StockData, weights: Record<string, number>): number {
  let score = 0;
  let totalWeight = 0;
  for (const [field, weight] of Object.entries(weights)) {
    const value = (stock as any)[field];
    if (typeof value === 'number' && !isNaN(value)) {
      score += value * weight;
      totalWeight += Math.abs(weight);
    }
  }
  return totalWeight > 0 ? Math.round(score / totalWeight * 100) / 100 : 0;
}

function multiFactorRank(stocks: StockData[], weights: Record<string, number>, topN?: number): { stock: StockData; score: number }[] {
  const scored = stocks.map(stock => ({ stock, score: compositeScore(stock, weights) }));
  scored.sort((a, b) => b.score - a.score);
  return topN ? scored.slice(0, topN) : scored;
}

function groupBySector(stocks: StockData[]): Map<string, StockData[]> {
  const groups = new Map<string, StockData[]>();
  for (const stock of stocks) {
    const list = groups.get(stock.sector) || [];
    list.push(stock);
    groups.set(stock.sector, list);
  }
  return groups;
}

function sectorStats(stocks: StockData[]): { sector: string; count: number; avgPE: number; avgROE: number; totalCap: number }[] {
  const groups = groupBySector(stocks);
  return Array.from(groups.entries()).map(([sector, list]) => ({
    sector,
    count: list.length,
    avgPE: Math.round(list.reduce((s, x) => s + x.pe, 0) / list.length * 100) / 100,
    avgROE: Math.round(list.reduce((s, x) => s + x.roe, 0) / list.length * 100) / 100,
    totalCap: list.reduce((s, x) => s + x.marketCap, 0),
  }));
}

function percentileRank(stocks: StockData[], field: keyof StockData, target: number): number {
  const values = stocks.map(s => s[field] as number).sort((a, b) => a - b);
  const idx = values.findIndex(v => v >= target);
  if (idx === -1) return 100;
  return Math.round(idx / values.length * 100);
}

const sampleStocks: StockData[] = [
  { code: '600519', name: '贵州茅台', price: 1800, pe: 35, pb: 12, roe: 30, revenueGrowth: 15, profitGrowth: 17, debtRatio: 25, dividendYield: 1.5, volume: 5e6, turnover: 2, marketCap: 22000e8, sector: '白酒', weekChange: 3, monthChange: 8, yearChange: 25 },
  { code: '000858', name: '五粮液', price: 160, pe: 28, pb: 8, roe: 25, revenueGrowth: 12, profitGrowth: 14, debtRatio: 20, dividendYield: 2, volume: 3e7, turnover: 1.5, marketCap: 6000e8, sector: '白酒', weekChange: 2, monthChange: 5, yearChange: 18 },
  { code: '300750', name: '宁德时代', price: 200, pe: 40, pb: 6, roe: 18, revenueGrowth: 50, profitGrowth: 60, debtRatio: 55, dividendYield: 0.5, volume: 8e6, turnover: 3, marketCap: 5000e8, sector: '新能源', weekChange: -2, monthChange: 10, yearChange: 30 },
  { code: '002475', name: '立讯精密', price: 35, pe: 25, pb: 4, roe: 20, revenueGrowth: 30, profitGrowth: 35, debtRatio: 45, dividendYield: 0.8, volume: 2e7, turnover: 2.5, marketCap: 2500e8, sector: '电子', weekChange: -1, monthChange: 3, yearChange: 15 },
  { code: '601318', name: '中国平安', price: 45, pe: 8, pb: 1, roe: 12, revenueGrowth: 5, profitGrowth: 8, debtRatio: 85, dividendYield: 5, volume: 5e7, turnover: 1, marketCap: 8000e8, sector: '保险', weekChange: 1, monthChange: 2, yearChange: -5 },
  { code: '600036', name: '招商银行', price: 35, pe: 6, pb: 1.2, roe: 15, revenueGrowth: 8, profitGrowth: 10, debtRatio: 90, dividendYield: 4, volume: 4e7, turnover: 0.8, marketCap: 9000e8, sector: '银行', weekChange: 0.5, monthChange: 1, yearChange: 8 },
  { code: '002594', name: '比亚迪', price: 280, pe: 50, pb: 8, roe: 10, revenueGrowth: 80, profitGrowth: 100, debtRatio: 65, dividendYield: 0.3, volume: 1e7, turnover: 4, marketCap: 8000e8, sector: '新能源', weekChange: 5, monthChange: 15, yearChange: 40 },
  { code: '601012', name: '隆基绿能', price: 25, pe: 12, pb: 2, roe: 8, revenueGrowth: -10, profitGrowth: -20, debtRatio: 40, dividendYield: 2, volume: 3e7, turnover: 1.8, marketCap: 1500e8, sector: '新能源', weekChange: -5, monthChange: -8, yearChange: -30 },
];

describe('Advanced Screening & Ranking Engine', () => {
  describe('Criterion Evaluation', () => {
    it('should evaluate gt operator', () => {
      const result = evaluateCriterion(sampleStocks[0], { field: 'pe', operator: 'gt', value: 30 });
      expect(result).toBe(true);
    });

    it('should evaluate lt operator', () => {
      const result = evaluateCriterion(sampleStocks[4], { field: 'pe', operator: 'lt', value: 10 });
      expect(result).toBe(true);
    });

    it('should evaluate gte operator', () => {
      expect(evaluateCriterion(sampleStocks[0], { field: 'pe', operator: 'gte', value: 35 })).toBe(true);
      expect(evaluateCriterion(sampleStocks[0], { field: 'pe', operator: 'gte', value: 36 })).toBe(false);
    });

    it('should evaluate lte operator', () => {
      expect(evaluateCriterion(sampleStocks[5], { field: 'pe', operator: 'lte', value: 6 })).toBe(true);
    });

    it('should evaluate eq operator', () => {
      expect(evaluateCriterion(sampleStocks[0], { field: 'sector', operator: 'eq', value: '白酒' })).toBe(true);
      expect(evaluateCriterion(sampleStocks[0], { field: 'sector', operator: 'eq', value: '银行' })).toBe(false);
    });

    it('should evaluate ne operator', () => {
      expect(evaluateCriterion(sampleStocks[0], { field: 'sector', operator: 'ne', value: '银行' })).toBe(true);
    });

    it('should evaluate between operator', () => {
      expect(evaluateCriterion(sampleStocks[1], { field: 'pe', operator: 'between', value: 20, value2: 30 })).toBe(true);
      expect(evaluateCriterion(sampleStocks[0], { field: 'pe', operator: 'between', value: 20, value2: 30 })).toBe(false);
    });

    it('should evaluate in operator', () => {
      expect(evaluateCriterion(sampleStocks[0], { field: 'sector', operator: 'in', value: ['白酒', '银行'] })).toBe(true);
      expect(evaluateCriterion(sampleStocks[2], { field: 'sector', operator: 'in', value: ['白酒', '银行'] })).toBe(false);
    });

    it('should evaluate contains operator', () => {
      expect(evaluateCriterion(sampleStocks[0], { field: 'name', operator: 'contains', value: '茅台' })).toBe(true);
      expect(evaluateCriterion(sampleStocks[0], { field: 'name', operator: 'contains', value: '平安' })).toBe(false);
    });

    it('should return false for missing field', () => {
      expect(evaluateCriterion(sampleStocks[0], { field: 'nonexistent', operator: 'gt', value: 0 })).toBe(false);
    });
  });

  describe('Stock Screening', () => {
    it('should filter by single criterion', () => {
      const result = screenStocks(sampleStocks, [{ field: 'pe', operator: 'lt', value: 10 }]);
      expect(result).toHaveLength(2);
    });

    it('should match all criteria by default', () => {
      const result = screenStocks(sampleStocks, [
        { field: 'pe', operator: 'lt', value: 30 },
        { field: 'roe', operator: 'gt', value: 15 },
      ]);
      expect(result.every(s => s.pe < 30 && s.roe > 15)).toBe(true);
    });

    it('should match any criteria when matchAll=false', () => {
      const result = screenStocks(sampleStocks, [
        { field: 'pe', operator: 'lt', value: 5 },
        { field: 'roe', operator: 'gt', value: 28 },
      ], false);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some(s => s.pe < 5 || s.roe > 28)).toBe(true);
    });

    it('should filter by sector', () => {
      const result = screenStocks(sampleStocks, [{ field: 'sector', operator: 'eq', value: '新能源' }]);
      expect(result).toHaveLength(3);
    });

    it('should return empty when no match', () => {
      const result = screenStocks(sampleStocks, [{ field: 'pe', operator: 'gt', value: 1000 }]);
      expect(result).toHaveLength(0);
    });

    it('should handle complex multi-criteria', () => {
      const result = screenStocks(sampleStocks, [
        { field: 'pe', operator: 'between', value: 10, value2: 50 },
        { field: 'roe', operator: 'gte', value: 15 },
        { field: 'profitGrowth', operator: 'gt', value: 0 },
      ]);
      expect(result.every(s => s.pe >= 10 && s.pe <= 50 && s.roe >= 15 && s.profitGrowth > 0)).toBe(true);
    });
  });

  describe('Stock Ranking', () => {
    it('should rank by PE descending', () => {
      const result = rankStocks(sampleStocks, 'pe', true);
      expect(result[0].pe).toBeGreaterThanOrEqual(result[1].pe);
    });

    it('should rank by PE ascending', () => {
      const result = rankStocks(sampleStocks, 'pe', false);
      expect(result[0].pe).toBeLessThanOrEqual(result[1].pe);
    });

    it('should return top N', () => {
      const result = rankStocks(sampleStocks, 'roe', true, 3);
      expect(result).toHaveLength(3);
      expect(result[0].roe).toBeGreaterThanOrEqual(result[1].roe);
    });

    it('should handle topN larger than array', () => {
      const result = rankStocks(sampleStocks, 'price', true, 100);
      expect(result).toHaveLength(sampleStocks.length);
    });
  });

  describe('Composite Scoring', () => {
    it('should compute weighted score', () => {
      const score = compositeScore(sampleStocks[0], { roe: 1, pe: -1 });
      expect(typeof score).toBe('number');
      expect(isNaN(score)).toBe(false);
    });

    it('should return 0 for empty weights', () => {
      expect(compositeScore(sampleStocks[0], {})).toBe(0);
    });

    it('should ignore non-numeric fields', () => {
      const score = compositeScore(sampleStocks[0], { name: 1, roe: 1 });
      expect(typeof score).toBe('number');
    });

    it('should handle NaN values in data', () => {
      const badStock = { ...sampleStocks[0], roe: NaN };
      const score = compositeScore(badStock, { roe: 1, pe: 1 });
      expect(typeof score).toBe('number');
    });
  });

  describe('Multi-Factor Ranking', () => {
    it('should rank by composite score', () => {
      const result = multiFactorRank(sampleStocks, { roe: 1, profitGrowth: 0.5, pe: -0.3 });
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
      }
    });

    it('should return top N results', () => {
      const result = multiFactorRank(sampleStocks, { roe: 1 }, 3);
      expect(result).toHaveLength(3);
    });

    it('should include stock reference', () => {
      const result = multiFactorRank(sampleStocks, { roe: 1 }, 1);
      expect(result[0].stock).toBeDefined();
      expect(result[0].stock.code).toBeDefined();
    });
  });

  describe('Sector Grouping', () => {
    it('should group stocks by sector', () => {
      const groups = groupBySector(sampleStocks);
      expect(groups.has('白酒')).toBe(true);
      expect(groups.has('新能源')).toBe(true);
      expect(groups.get('白酒')).toHaveLength(2);
      expect(groups.get('新能源')).toHaveLength(3);
    });

    it('should handle empty array', () => {
      const groups = groupBySector([]);
      expect(groups.size).toBe(0);
    });
  });

  describe('Sector Statistics', () => {
    it('should compute per-sector stats', () => {
      const stats = sectorStats(sampleStocks);
      expect(stats.length).toBeGreaterThan(0);
      for (const s of stats) {
        expect(s.count).toBeGreaterThan(0);
        expect(s.avgPE).toBeGreaterThan(0);
        expect(s.totalCap).toBeGreaterThan(0);
      }
    });

    it('should compute correct average ROE', () => {
      const stats = sectorStats(sampleStocks);
      const baijiu = stats.find(s => s.sector === '白酒');
      expect(baijiu!.avgROE).toBeCloseTo(27.5, 0);
    });
  });

  describe('Percentile Ranking', () => {
    it('should compute percentile correctly', () => {
      const pctl = percentileRank(sampleStocks, 'pe', 35);
      expect(pctl).toBeGreaterThanOrEqual(0);
      expect(pctl).toBeLessThanOrEqual(100);
    });

    it('should return 100 for above-max value', () => {
      expect(percentileRank(sampleStocks, 'pe', 1000)).toBe(100);
    });

    it('should return 0 for minimum value', () => {
      const minPE = Math.min(...sampleStocks.map(s => s.pe));
      expect(percentileRank(sampleStocks, 'pe', minPE)).toBe(0);
    });
  });
});
