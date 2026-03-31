import { describe, it, expect } from 'vitest';
import {
  screenStocks,
  generateScreeningReport,
  adjustWeightsByPerformance,
  type StockData,
  type ScreeningCriteria,
} from '../utils/smartScreeningEngine';

const mockStocks: StockData[] = [
  { code: 'SH001', name: '优质股A', industry: '科技', marketCap: 1000000, pe: 15, pb: 2, roe: 20, revenue_growth: 30, profit_growth: 25, dividend_yield: 2, debt_ratio: 30, current_ratio: 2, gross_margin: 40, turnover_rate: 3, price_change_5d: 5, price_change_20d: 10, volume_ratio: 1.5 },
  { code: 'SH002', name: '成长股B', industry: '医药', marketCap: 500000, pe: 30, pb: 5, roe: 15, revenue_growth: 50, profit_growth: 40, dividend_yield: 0.5, debt_ratio: 40, current_ratio: 1.5, gross_margin: 60, turnover_rate: 2, price_change_5d: 8, price_change_20d: 15, volume_ratio: 2 },
  { code: 'SH003', name: '低估值C', industry: '银行', marketCap: 2000000, pe: 5, pb: 0.5, roe: 12, revenue_growth: 5, profit_growth: 8, dividend_yield: 5, debt_ratio: 80, current_ratio: 1, gross_margin: 30, turnover_rate: 0.5, price_change_5d: 1, price_change_20d: 3, volume_ratio: 0.8 },
  { code: 'SH004', name: '垃圾股D', industry: '制造', marketCap: 100000, pe: 200, pb: 15, roe: -5, revenue_growth: -20, profit_growth: -50, dividend_yield: 0, debt_ratio: 90, current_ratio: 0.5, gross_margin: 5, turnover_rate: 5, price_change_5d: -10, price_change_20d: -30, volume_ratio: 3 },
];

const mockCriteria: ScreeningCriteria[] = [
  { field: 'pe', operator: '<', value: 30, weight: 0.3 },
  { field: 'roe', operator: '>', value: 10, weight: 0.3 },
  { field: 'revenue_growth', operator: '>', value: 15, weight: 0.2 },
  { field: 'debt_ratio', operator: '<', value: 50, weight: 0.2 },
];

describe('智能选股引擎', () => {
  describe('screenStocks', () => {
    it('should screen stocks by criteria', () => {
      const results = screenStocks(mockStocks, mockCriteria);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should sort by score descending', () => {
      const results = screenStocks(mockStocks, mockCriteria);
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('should count matched criteria', () => {
      const results = screenStocks(mockStocks, mockCriteria);
      results.forEach(r => {
        expect(r.matchedCriteria).toBeLessThanOrEqual(r.totalCriteria);
        expect(r.totalCriteria).toBe(mockCriteria.length);
      });
    });

    it('should filter by min score', () => {
      const results = screenStocks(mockStocks, mockCriteria, 70);
      results.forEach(r => {
        expect(r.score).toBeGreaterThanOrEqual(70);
      });
    });

    it('should identify risk flags', () => {
      const results = screenStocks(mockStocks, mockCriteria, 0);
      const garbageStock = results.find(r => r.stock === 'SH004');
      if (garbageStock) {
        expect(garbageStock.riskFlags.length).toBeGreaterThan(0);
      }
    });

    it('should handle empty stocks', () => {
      const results = screenStocks([], mockCriteria);
      expect(results).toHaveLength(0);
    });

    it('should handle empty criteria', () => {
      const results = screenStocks(mockStocks, []);
      expect(results.length).toBeGreaterThan(0);
      results.forEach(r => {
        expect(r.matchedCriteria).toBe(0);
      });
    });
  });

  describe('generateScreeningReport', () => {
    const results = screenStocks(mockStocks, mockCriteria, 0);

    it('should count totals', () => {
      const report = generateScreeningReport(mockStocks, results);
      expect(report.totalScreened).toBe(mockStocks.length);
      expect(report.totalPassed).toBe(results.length);
    });

    it('should calculate pass rate', () => {
      const report = generateScreeningReport(mockStocks, results);
      expect(report.passRate).toBeGreaterThanOrEqual(0);
      expect(report.passRate).toBeLessThanOrEqual(1);
    });

    it('should include industry distribution', () => {
      const report = generateScreeningReport(mockStocks, results);
      expect(typeof report.industryDistribution).toBe('object');
    });

    it('should include score distribution', () => {
      const report = generateScreeningReport(mockStocks, results);
      expect(report.scoreDistribution).toHaveLength(5);
    });

    it('should limit top results to 20', () => {
      const report = generateScreeningReport(mockStocks, results);
      expect(report.topResults.length).toBeLessThanOrEqual(20);
    });

    it('should calculate average score', () => {
      const report = generateScreeningReport(mockStocks, results);
      expect(report.avgScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('adjustWeightsByPerformance', () => {
    it('should adjust weights based on win rate', () => {
      const backtest = [
        { field: 'pe', winRate: 0.7 },
        { field: 'roe', winRate: 0.3 },
      ];
      const adjusted = adjustWeightsByPerformance(mockCriteria, backtest);
      const peCriteria = adjusted.find(c => c.field === 'pe');
      const roeCriteria = adjusted.find(c => c.field === 'roe');
      expect(peCriteria!.weight).toBeGreaterThan(mockCriteria.find(c => c.field === 'pe')!.weight * 0.9);
      expect(roeCriteria!.weight).toBeLessThan(mockCriteria.find(c => c.field === 'roe')!.weight * 1.1);
    });

    it('should keep unadjusted weights unchanged', () => {
      const backtest = [{ field: 'pe', winRate: 0.6 }];
      const adjusted = adjustWeightsByPerformance(mockCriteria, backtest);
      const revenueCriteria = adjusted.find(c => c.field === 'revenue_growth');
      const origRevenue = mockCriteria.find(c => c.field === 'revenue_growth');
      expect(revenueCriteria!.weight).toBe(origRevenue!.weight);
    });

    it('should not exceed weight cap of 1', () => {
      const highWeight: ScreeningCriteria[] = [
        { field: 'pe', operator: '<', value: 30, weight: 0.9 },
      ];
      const backtest = [{ field: 'pe', winRate: 0.9 }];
      const adjusted = adjustWeightsByPerformance(highWeight, backtest);
      expect(adjusted[0].weight).toBeLessThanOrEqual(1);
    });
  });
});
