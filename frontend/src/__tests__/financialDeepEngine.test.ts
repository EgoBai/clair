import { describe, it, expect } from 'vitest';
import {
  calculateQualityScore,
  analyzeGrowthQuality,
  calculateCCC,
  detectAnomalies,
  type FinancialData,
} from '../utils/financialDeepEngine';

function makeFinData(overrides: Partial<FinancialData> = {}): FinancialData {
  return {
    ticker: '600519',
    period: '2025-Q4',
    revenue: 100e8,
    revenueGrowth: 15,
    grossMargin: 0.4,
    netProfit: 20e8,
    netProfitGrowth: 20,
    operatingCashFlow: 25e8,
    freeCashFlow: 15e8,
    totalDebt: 30e8,
    totalEquity: 100e8,
    currentAssets: 80e8,
    currentLiabilities: 30e8,
    inventory: 10e8,
    accountsReceivable: 15e8,
    accountsPayable: 8e8,
    capex: 10e8,
    depreciation: 5e8,
    interestExpense: 1e8,
    investmentIncome: 2e8,
    nonRecurringItems: 1e8,
    ...overrides,
  };
}

describe('Financial Deep Engine', () => {
  describe('calculateQualityScore', () => {
    it('should return score between 0-100', () => {
      const score = calculateQualityScore(makeFinData());
      expect(score.overallScore).toBeGreaterThanOrEqual(0);
      expect(score.overallScore).toBeLessThanOrEqual(100);
    });

    it('should grade correctly', () => {
      const excellent = makeFinData({
        operatingCashFlow: 30e8,
        freeCashFlow: 20e8,
        totalDebt: 10e8,
        totalEquity: 100e8,
        grossMargin: 0.5,
        nonRecurringItems: 0,
      });
      const score = calculateQualityScore(excellent);
      expect(['A', 'B']).toContain(score.grade);
    });

    it('should flag poor quality', () => {
      const poor = makeFinData({
        operatingCashFlow: -5e8,
        freeCashFlow: -10e8,
        totalDebt: 200e8,
        totalEquity: 50e8,
        grossMargin: 0.05,
        nonRecurringItems: 15e8,
      });
      const score = calculateQualityScore(poor);
      expect(score.redFlags.length).toBeGreaterThan(0);
      expect(['C', 'D', 'F']).toContain(score.grade);
    });

    it('should detect cash flow mismatch', () => {
      const data = makeFinData({ netProfit: 20e8, operatingCashFlow: 5e8 });
      const score = calculateQualityScore(data);
      expect(score.redFlags).toContain('经营现金流远低于利润');
    });

    it('should detect revenue without profit', () => {
      const data = makeFinData({ revenueGrowth: 20, netProfitGrowth: -5 });
      const score = calculateQualityScore(data);
      expect(score.redFlags).toContain('增收不增利');
    });

    it('should include breakdown scores', () => {
      const score = calculateQualityScore(makeFinData());
      expect(score.breakdown.earningsQuality).toBeGreaterThanOrEqual(0);
      expect(score.breakdown.cashFlowQuality).toBeGreaterThanOrEqual(0);
      expect(score.breakdown.balanceSheetStrength).toBeGreaterThanOrEqual(0);
    });
  });

  describe('analyzeGrowthQuality', () => {
    it('should analyze growth quality', () => {
      const prev = makeFinData({ revenue: 85e8, netProfit: 16e8 });
      const curr = makeFinData({ revenue: 100e8, netProfit: 20e8 });
      const quality = analyzeGrowthQuality(curr, prev);

      expect(quality.revenueGrowth).toBe(15);
      expect(quality.growthQualityScore).toBeGreaterThanOrEqual(0);
      expect(quality.growthQualityScore).toBeLessThanOrEqual(100);
      expect(['high', 'medium', 'low', 'poor']).toContain(quality.quality);
    });

    it('should calculate organic growth', () => {
      const prev = makeFinData({ netProfit: 10e8, nonRecurringItems: 2e8 });
      const curr = makeFinData({ netProfit: 15e8, nonRecurringItems: 8e8 });
      const quality = analyzeGrowthQuality(curr, prev);

      // Organic growth should be less than reported growth
      expect(quality.organicGrowth).toBeLessThan(quality.profitGrowth);
    });

    it('should flag concerns', () => {
      const prev = makeFinData({ operatingCashFlow: 20e8 });
      const curr = makeFinData({ operatingCashFlow: 5e8, nonRecurringItems: 12e8, netProfit: 15e8 });
      const quality = analyzeGrowthQuality(curr, prev);

      expect(quality.concerns.length).toBeGreaterThan(0);
    });
  });

  describe('calculateCCC', () => {
    it('should calculate cash conversion cycle', () => {
      const ccc = calculateCCC(makeFinData());

      expect(ccc.dso).toBeGreaterThan(0);
      expect(ccc.dio).toBeGreaterThan(0);
      expect(ccc.dpo).toBeGreaterThan(0);
      expect(ccc.ccc).toBe(ccc.dso + ccc.dio - ccc.dpo);
    });

    it('should compare to industry', () => {
      const good = calculateCCC(makeFinData({
        accountsReceivable: 5e8,
        inventory: 3e8,
        accountsPayable: 10e8,
      }));
      expect(['better', 'average', 'worse']).toContain(good.vsIndustry);
    });
  });

  describe('detectAnomalies', () => {
    it('should detect revenue-cfo mismatch', () => {
      const data = makeFinData({ revenueGrowth: 25, operatingCashFlow: -5e8 });
      const anomalies = detectAnomalies(data);
      expect(anomalies.some(a => a.type === 'revenue_cfo_mismatch')).toBe(true);
    });

    it('should detect AR surge', () => {
      const prev = makeFinData({ accountsReceivable: 5e8, revenueGrowth: 5 });
      const curr = makeFinData({ accountsReceivable: 25e8, revenueGrowth: 5 });
      const anomalies = detectAnomalies(curr, prev);
      expect(anomalies.some(a => a.type === 'ar_surge')).toBe(true);
    });

    it('should detect inventory buildup', () => {
      const prev = makeFinData({ inventory: 5e8, revenueGrowth: 5 });
      const curr = makeFinData({ inventory: 30e8, revenueGrowth: 5 });
      const anomalies = detectAnomalies(curr, prev);
      expect(anomalies.some(a => a.type === 'inventory_buildup')).toBe(true);
    });

    it('should detect margin compression', () => {
      const prev = makeFinData({ grossMargin: 0.45 });
      const curr = makeFinData({ grossMargin: 0.35 });
      const anomalies = detectAnomalies(curr, prev);
      expect(anomalies.some(a => a.type === 'margin_compression')).toBe(true);
    });

    it('should detect non-recurring dependency', () => {
      const data = makeFinData({ netProfit: 10e8, nonRecurringItems: 7e8 });
      const anomalies = detectAnomalies(data);
      expect(anomalies.some(a => a.type === 'non_recurring_dependent')).toBe(true);
    });

    it('should return empty for clean data', () => {
      const prev = makeFinData();
      const curr = makeFinData({ revenueGrowth: 15, netProfitGrowth: 18 });
      const anomalies = detectAnomalies(curr, prev);
      expect(anomalies.length).toBe(0);
    });
  });
});
