import { describe, it, expect } from 'vitest';
import { compareStocks, industryComparison, type StockProfile } from '../utils/stockComparisonEngine';

function makeStock(code: string, name: string, overrides: Partial<StockProfile> = {}): StockProfile {
  return {
    code, name, price: 10, marketCap: 1e10, pe: 20, pb: 2, ps: 3,
    roe: 0.15, revenueGrowth: 0.2, profitGrowth: 0.25, grossMargin: 0.4,
    netMargin: 0.15, debtRatio: 0.4, currentRatio: 1.5, dividendYield: 0.02,
    turnoverRate: 0.03, weekReturn: 0.02, monthReturn: 0.05, yearReturn: 0.3,
    volatility: 0.02, beta: 1, industry: '科技',
    ...overrides,
  };
}

describe('stockComparisonEngine', () => {
  describe('compareStocks', () => {
    it('should return empty for insufficient stocks', () => {
      const result = compareStocks([makeStock('001', 'A')]);
      expect(result.dimensions.length).toBe(0);
    });

    it('should generate comparison dimensions', () => {
      const stocks = [makeStock('001', 'A'), makeStock('002', 'B', { pe: 30, roe: 0.2 })];
      const result = compareStocks(stocks);
      expect(result.dimensions.length).toBeGreaterThan(0);
    });

    it('should generate radar data', () => {
      const stocks = [makeStock('001', 'A'), makeStock('002', 'B')];
      const result = compareStocks(stocks);
      expect(result.radarData.length).toBe(2);
      expect(result.radarData[0].axes.length).toBeGreaterThan(0);
    });

    it('should rank stocks', () => {
      const stocks = [
        makeStock('001', '差', { roe: 0.05, revenueGrowth: 0.01 }),
        makeStock('002', '好', { roe: 0.3, revenueGrowth: 0.5 }),
      ];
      const result = compareStocks(stocks);
      expect(result.rankings[0].rank).toBe(1);
      expect(result.rankings[0].totalScore).toBeGreaterThanOrEqual(result.rankings[1].totalScore);
    });

    it('should identify strengths and weaknesses', () => {
      const stocks = [
        makeStock('001', 'A', { pe: 5, roe: 0.3 }),
        makeStock('002', 'B', { pe: 100, roe: 0.02 }),
      ];
      const result = compareStocks(stocks);
      for (const r of result.rankings) {
        expect(Array.isArray(r.strengths)).toBe(true);
        expect(Array.isArray(r.weaknesses)).toBe(true);
      }
    });

    it('should provide recommendations', () => {
      const stocks = [makeStock('001', 'A'), makeStock('002', 'B')];
      const result = compareStocks(stocks);
      expect(result.recommendation.length).toBe(2);
      for (const r of result.recommendation) {
        expect(r.verdict.length).toBeGreaterThan(0);
      }
    });
  });

  describe('industryComparison', () => {
    it('should group by industry', () => {
      const stocks = [
        makeStock('001', 'A', { industry: '科技' }),
        makeStock('002', 'B', { industry: '科技' }),
        makeStock('003', 'C', { industry: '金融' }),
      ];
      const result = industryComparison(stocks);
      expect(result.length).toBe(2);
    });

    it('should calculate industry averages', () => {
      const stocks = [
        makeStock('001', 'A', { industry: '科技', pe: 20 }),
        makeStock('002', 'B', { industry: '科技', pe: 40 }),
      ];
      const result = industryComparison(stocks);
      expect(result[0].avgPE).toBe(30);
    });

    it('should identify top stock', () => {
      const stocks = [
        makeStock('001', '弱', { industry: '科技', roe: 0.05 }),
        makeStock('002', '强', { industry: '科技', roe: 0.3 }),
      ];
      const result = industryComparison(stocks);
      expect(result[0].topStock).toBe('强');
    });
  });
});
