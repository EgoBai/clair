import { describe, it, expect } from 'vitest';
import {
  screenStocks,
  screenWithScoring,
  screenByPatterns,
  screenByValuation,
  screenGARP,
  screenMomentumQuality,
  type StockData,
  type ScreenerFilter,
  type ScoreWeight,
} from '../utils/stockScreener';

function createStock(overrides: Partial<StockData> = {}): StockData {
  return {
    symbol: 'TEST',
    name: 'Test Stock',
    price: 100,
    pe: 15,
    pb: 2,
    ps: 3,
    roe: 0.18,
    revenueGrowth: 0.15,
    profitGrowth: 0.12,
    debtToEquity: 0.5,
    dividendYield: 0.02,
    marketCap: 1000000000,
    volume: 1000000,
    avgVolume: 800000,
    high52w: 120,
    low52w: 80,
    ma5: 99,
    ma10: 98,
    ma20: 96,
    ma60: 90,
    rsi: 55,
    macd: 1.5,
    macdSignal: 1.0,
    atr: 2.5,
    beta: 1.1,
    sector: 'Tech',
    industry: 'Software',
    ...overrides
  };
}

describe('选股筛选器引擎', () => {
  const stocks: StockData[] = [
    createStock({ symbol: 'A', pe: 10, roe: 0.25, revenueGrowth: 0.20, price: 110, ma5: 108, ma20: 100, ma60: 90, rsi: 65 }),
    createStock({ symbol: 'B', pe: 25, roe: 0.10, revenueGrowth: 0.05, price: 80, ma5: 78, ma20: 82, ma60: 90, rsi: 25 }),
    createStock({ symbol: 'C', pe: 50, roe: 0.30, revenueGrowth: 0.30, price: 118, ma5: 115, ma20: 110, ma60: 100, rsi: 75, high52w: 119 }),
    createStock({ symbol: 'D', pe: 8, roe: 0.15, revenueGrowth: 0.08, price: 50, ma5: 48, ma20: 45, ma60: 40, rsi: 45 }),
  ];

  describe('screenStocks', () => {
    it('should filter by PE', () => {
      const filters: ScreenerFilter[] = [{ field: 'pe', operator: 'lt', value: 20 }];
      const result = screenStocks(stocks, filters);
      expect(result.every(s => s.pe < 20)).toBe(true);
    });

    it('should filter by range', () => {
      const filters: ScreenerFilter[] = [{ field: 'pe', operator: 'between', value: [10, 30] }];
      const result = screenStocks(stocks, filters);
      expect(result.every(s => s.pe >= 10 && s.pe <= 30)).toBe(true);
    });

    it('should combine multiple filters with AND', () => {
      const filters: ScreenerFilter[] = [
        { field: 'pe', operator: 'lt', value: 20 },
        { field: 'roe', operator: 'gt', value: 0.15 },
      ];
      const result = screenStocks(stocks, filters);
      expect(result.every(s => s.pe < 20 && s.roe > 0.15)).toBe(true);
    });

    it('should return empty for impossible filter', () => {
      const filters: ScreenerFilter[] = [{ field: 'pe', operator: 'lt', value: 0 }];
      const result = screenStocks(stocks, filters);
      expect(result.length).toBe(0);
    });
  });

  describe('screenWithScoring', () => {
    it('should rank by score', () => {
      const weights: ScoreWeight[] = [
        { field: 'roe', weight: 1, direction: 'asc', normalize: false },
      ];
      const result = screenWithScoring(stocks, [], weights);
      expect(result.length).toBe(stocks.length);
      expect(result[0].ranking).toBe(1);
      for (let i = 1; i < result.length; i++) {
        expect(result[i].matchScore).toBeLessThanOrEqual(result[i - 1].matchScore);
      }
    });
  });

  describe('screenByPatterns', () => {
    it('should detect golden cross', () => {
      const result = screenByPatterns(stocks, 'golden_cross');
      // A has ma5>ma20>ma60
      expect(result.some(s => s.symbol === 'A')).toBe(true);
    });

    it('should detect RSI oversold', () => {
      const result = screenByPatterns(stocks, 'rsi_oversold');
      expect(result.some(s => s.rsi < 30)).toBe(true);
    });

    it('should detect breakout', () => {
      const result = screenByPatterns(stocks, 'breakout_52w');
      // C has price=118, high52w=119, 118/119=0.99 > 0.98
      expect(result.some(s => s.symbol === 'C')).toBe(true);
    });

    it('should detect MA uptrend', () => {
      const result = screenByPatterns(stocks, 'ma_uptrend');
      // Need price > ma5 > ma10 > ma20 > ma60
      for (const s of result) {
        expect(s.price).toBeGreaterThan(s.ma5);
        expect(s.ma5).toBeGreaterThan(s.ma10);
        expect(s.ma10).toBeGreaterThan(s.ma20);
        expect(s.ma20).toBeGreaterThan(s.ma60);
      }
    });
  });

  describe('screenByValuation', () => {
    it('should filter by PE range', () => {
      const result = screenByValuation(stocks, { maxPE: 20, minROE: 0.12 });
      expect(result.every(s => s.pe <= 20 && s.roe >= 0.12)).toBe(true);
    });

    it('should filter by market cap', () => {
      const result = screenByValuation(stocks, { minMarketCap: 500000000 });
      expect(result.every(s => s.marketCap >= 500000000)).toBe(true);
    });
  });

  describe('screenGARP', () => {
    it('should find growth at reasonable price', () => {
      const result = screenGARP(stocks);
      for (const r of result) {
        expect(r.stock.pe).toBeLessThan(30);
        expect(r.stock.revenueGrowth).toBeGreaterThan(0.1);
        expect(r.stock.roe).toBeGreaterThan(0.15);
      }
    });

    it('should rank by PEG-like score', () => {
      const result = screenGARP(stocks);
      for (let i = 1; i < result.length; i++) {
        expect(result[i].matchScore).toBeLessThanOrEqual(result[i - 1].matchScore);
      }
    });
  });

  describe('screenMomentumQuality', () => {
    it('should filter and rank', () => {
      const result = screenMomentumQuality(stocks, 50);
      for (const r of result) {
        expect(r.matchScore).toBeGreaterThanOrEqual(50);
      }
    });

    it('should sort by composite score', () => {
      const result = screenMomentumQuality(stocks, 0);
      for (let i = 1; i < result.length; i++) {
        expect(result[i].matchScore).toBeLessThanOrEqual(result[i - 1].matchScore);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty stocks array', () => {
      const result = screenStocks([], [{ field: 'pe', operator: 'lt', value: 20 }]);
      expect(result.length).toBe(0);
    });

    it('should handle no filters', () => {
      const result = screenStocks(stocks, []);
      expect(result.length).toBe(stocks.length);
    });
  });
});
