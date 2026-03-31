import { describe, it, expect } from 'vitest';

/**
 * 高级筛选器测试
 */

interface ScreenerCriteria {
  minMarketCap?: number;
  maxMarketCap?: number;
  minPe?: number;
  maxPe?: number;
  minRoe?: number;
  sectors?: string[];
  priceRange?: { min: number; max: number };
  volumeRange?: { min: number; max: number };
  changePercent?: { min: number; max: number };
}

interface StockCandidate {
  code: string;
  name: string;
  sector: string;
  marketCap: number;
  pe: number;
  roe: number;
  price: number;
  volume: number;
  changePercent: number;
}

function filterStocks(stocks: StockCandidate[], criteria: ScreenerCriteria): StockCandidate[] {
  return stocks.filter(s => {
    if (criteria.minMarketCap && s.marketCap < criteria.minMarketCap) return false;
    if (criteria.maxMarketCap && s.marketCap > criteria.maxMarketCap) return false;
    if (criteria.minPe && s.pe < criteria.minPe) return false;
    if (criteria.maxPe && s.pe > criteria.maxPe) return false;
    if (criteria.minRoe && s.roe < criteria.minRoe) return false;
    if (criteria.sectors && !criteria.sectors.includes(s.sector)) return false;
    if (criteria.priceRange) {
      if (s.price < criteria.priceRange.min || s.price > criteria.priceRange.max) return false;
    }
    if (criteria.volumeRange) {
      if (s.volume < criteria.volumeRange.min || s.volume > criteria.volumeRange.max) return false;
    }
    if (criteria.changePercent) {
      if (s.changePercent < criteria.changePercent.min || s.changePercent > criteria.changePercent.max) return false;
    }
    return true;
  });
}

function rankStocks(stocks: StockCandidate[], sortBy: keyof StockCandidate, order: 'asc' | 'desc' = 'desc'): StockCandidate[] {
  return [...stocks].sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return order === 'desc' ? bVal - aVal : aVal - bVal;
    }
    return 0;
  });
}

describe('Advanced Screener', () => {
  const testStocks: StockCandidate[] = [
    { code: '000001', name: '平安银行', sector: '银行', marketCap: 3000e8, pe: 5.5, roe: 12, price: 12.5, volume: 5e8, changePercent: 2.3 },
    { code: '000002', name: '万科A', sector: '房地产', marketCap: 2000e8, pe: 8.2, roe: 15, price: 18.3, volume: 3e8, changePercent: -1.5 },
    { code: '600519', name: '贵州茅台', sector: '白酒', marketCap: 25000e8, pe: 35, roe: 30, price: 1800, volume: 1e8, changePercent: 0.5 },
    { code: '000858', name: '五粮液', sector: '白酒', marketCap: 8000e8, pe: 28, roe: 25, price: 150, volume: 2e8, changePercent: 1.8 },
    { code: '601318', name: '中国平安', sector: '保险', marketCap: 9000e8, pe: 10, roe: 18, price: 48, volume: 4e8, changePercent: -0.8 },
  ];

  describe('筛选条件', () => {
    it('应该按市值范围筛选', () => {
      const result = filterStocks(testStocks, { minMarketCap: 5000e8 });
      expect(result.length).toBe(3); // 茅台、五粮液、平安
    });

    it('应该按PE范围筛选', () => {
      const result = filterStocks(testStocks, { maxPe: 10 });
      expect(result.length).toBe(3); // 平安银行(5.5)、万科A(8.2)、中国平安(10)
      expect(result.every(s => s.pe <= 10)).toBe(true);
    });

    it('应该按行业筛选', () => {
      const result = filterStocks(testStocks, { sectors: ['白酒'] });
      expect(result.length).toBe(2);
      expect(result.every(s => s.sector === '白酒')).toBe(true);
    });

    it('应该按ROE筛选', () => {
      const result = filterStocks(testStocks, { minRoe: 20 });
      expect(result.length).toBe(2); // 茅台、五粮液
    });

    it('应该支持多条件组合', () => {
      const result = filterStocks(testStocks, {
        minMarketCap: 1000e8,
        maxPe: 30,
        minRoe: 10,
      });
      expect(result.length).toBeGreaterThan(0);
      for (const s of result) {
        expect(s.marketCap).toBeGreaterThanOrEqual(1000e8);
        expect(s.pe).toBeLessThanOrEqual(30);
        expect(s.roe).toBeGreaterThanOrEqual(10);
      }
    });

    it('应该按价格范围筛选', () => {
      const result = filterStocks(testStocks, { priceRange: { min: 10, max: 100 } });
      expect(result.length).toBe(3); // 平安银行、万科、五粮液（简化）
    });

    it('应该按涨跌幅筛选', () => {
      const result = filterStocks(testStocks, { changePercent: { min: 0, max: 5 } });
      expect(result.every(s => s.changePercent >= 0 && s.changePercent <= 5)).toBe(true);
    });
  });

  describe('排序', () => {
    it('应该按市值降序排列', () => {
      const result = rankStocks(testStocks, 'marketCap', 'desc');
      expect(result[0].name).toBe('贵州茅台');
      expect(result[result.length - 1].name).toBe('万科A');
    });

    it('应该按PE升序排列', () => {
      const result = rankStocks(testStocks, 'pe', 'asc');
      expect(result[0].pe).toBeLessThanOrEqual(result[1].pe);
    });

    it('应该按涨幅降序排列', () => {
      const result = rankStocks(testStocks, 'changePercent', 'desc');
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].changePercent).toBeGreaterThanOrEqual(result[i + 1].changePercent);
      }
    });
  });

  describe('边界条件', () => {
    it('空数组应该返回空', () => {
      expect(filterStocks([], { minMarketCap: 1000 }).length).toBe(0);
    });

    it('无匹配条件应该返回空', () => {
      expect(filterStocks(testStocks, { minMarketCap: 100000e8 }).length).toBe(0);
    });

    it('空条件应该返回所有股票', () => {
      expect(filterStocks(testStocks, {}).length).toBe(testStocks.length);
    });
  });
});
