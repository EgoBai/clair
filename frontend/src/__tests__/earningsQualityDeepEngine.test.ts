import { describe, it, expect } from 'vitest';
import { analyzeEarningsQuality, EarningsQualityData } from '../utils/earningsQualityDeepEngine';

describe('盈利质量深度分析引擎', () => {
  const highQuality: EarningsQualityData = {
    netProfit: 1000, operatingCashFlow: 1200, revenue: 10000,
    accountsReceivable: 1500, inventory: 800, totalAssets: 20000,
    depreciation: 500, nonRecurringItems: 50, accruals: -200,
    grossProfit: 4000, cogs: 6000, sellingExpense: 500,
    adminExpense: 400, rdExpense: 300, prevNetProfit: 900,
    prevRevenue: 9000, prevOperatingCashFlow: 1000,
  };

  const lowQuality: EarningsQualityData = {
    netProfit: 1000, operatingCashFlow: 300, revenue: 10000,
    accountsReceivable: 5000, inventory: 3000, totalAssets: 20000,
    depreciation: 200, nonRecurringItems: 600, accruals: 700,
    grossProfit: 3000, cogs: 7000, sellingExpense: 800,
    adminExpense: 600, rdExpense: 200, prevNetProfit: 800,
    prevRevenue: 9500, prevOperatingCashFlow: 900,
  };

  it('应计算现金转化率', () => {
    const r = analyzeEarningsQuality(highQuality);
    expect(r.cashConversionRatio).toBe(1.2);
  });

  it('高质量应有高评分', () => {
    const r = analyzeEarningsQuality(highQuality);
    expect(r.qualityScore).toBeGreaterThan(60);
  });

  it('低质量应有低评分', () => {
    const r = analyzeEarningsQuality(lowQuality);
    expect(r.qualityScore).toBeLessThan(80);
  });

  it('低质量应有警告标志', () => {
    const r = analyzeEarningsQuality(lowQuality);
    expect(r.redFlags.length).toBeGreaterThan(0);
  });

  it('应评估收入质量', () => {
    const r = analyzeEarningsQuality(highQuality);
    expect(['excellent', 'good', 'concerning', 'poor']).toContain(r.revenueQuality);
  });

  it('应输出质量等级', () => {
    const r = analyzeEarningsQuality(highQuality);
    expect(['A', 'B', 'C', 'D']).toContain(r.qualityGrade);
  });

  it('应评估操纵风险', () => {
    const r = analyzeEarningsQuality(highQuality);
    expect(['low', 'medium', 'high']).toContain(r.earningsManipulationRisk);
  });

  it('应计算经常性利润占比', () => {
    const r = analyzeEarningsQuality(highQuality);
    expect(r.recurringRatio).toBeGreaterThan(0);
  });

  it('应计算Beneish M-score', () => {
    const r = analyzeEarningsQuality(highQuality);
    expect(typeof r.beneishMScore).toBe('number');
  });

  it('应评估盈利可持续性', () => {
    const r = analyzeEarningsQuality(highQuality);
    expect(r.earningsSustainability).toBeGreaterThan(0);
  });
});
