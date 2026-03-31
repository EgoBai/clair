import { describe, it, expect } from 'vitest';
import { scoreFinancialQuality, FinancialQualityData } from '../utils/financialQualityScoreEngine';

describe('财报质量评分引擎', () => {
  const goodData: FinancialQualityData = {
    revenue: 10000, netIncome: 2000, operatingCashFlow: 2500, freeCashFlow: 1500,
    totalAssets: 30000, totalEquity: 15000, currentAssets: 8000, currentLiabilities: 4000,
    inventory: 1000, accountsReceivable: 1500, goodwill: 1000, totalDebt: 3000,
    interestExpense: 150, capex: 1000, revenuePrior: 9000, netIncomePrior: 1700, operatingCFPrior: 2200,
  };

  const badData: FinancialQualityData = {
    revenue: 8000, netIncome: 500, operatingCashFlow: -200, freeCashFlow: -800,
    totalAssets: 20000, totalEquity: 5000, currentAssets: 3000, currentLiabilities: 6000,
    inventory: 4000, accountsReceivable: 5000, goodwill: 8000, totalDebt: 12000,
    interestExpense: 800, capex: 600, revenuePrior: 9000, netIncomePrior: 1000, operatingCFPrior: 300,
  };

  it('好公司应有较高评分', () => {
    const result = scoreFinancialQuality(goodData);
    expect(result.overallScore).toBeGreaterThan(50);
  });

  it('差公司应有较低评分', () => {
    const result = scoreFinancialQuality(badData);
    expect(result.overallScore).toBeLessThan(50);
  });

  it('应该评分收入质量', () => {
    const result = scoreFinancialQuality(goodData);
    expect(result.revenueQuality).toBeGreaterThanOrEqual(0);
    expect(result.revenueQuality).toBeLessThanOrEqual(100);
  });

  it('应该评分盈利质量', () => {
    const result = scoreFinancialQuality(goodData);
    expect(result.earningsQuality).toBeGreaterThanOrEqual(0);
    expect(result.earningsQuality).toBeLessThanOrEqual(100);
  });

  it('应该评分现金流质量', () => {
    const result = scoreFinancialQuality(goodData);
    expect(result.cashFlowQuality).toBeGreaterThanOrEqual(0);
    expect(result.cashFlowQuality).toBeLessThanOrEqual(100);
  });

  it('应该评分资产质量', () => {
    const result = scoreFinancialQuality(goodData);
    expect(result.assetQuality).toBeGreaterThanOrEqual(0);
    expect(result.assetQuality).toBeLessThanOrEqual(100);
  });

  it('应该评分杠杆', () => {
    const result = scoreFinancialQuality(goodData);
    expect(result.leverageScore).toBeGreaterThanOrEqual(0);
    expect(result.leverageScore).toBeLessThanOrEqual(100);
  });

  it('应该给出评级', () => {
    const good = scoreFinancialQuality(goodData);
    const bad = scoreFinancialQuality(badData);
    expect(['A', 'B', 'C', 'D', 'F']).toContain(good.grade);
    expect(['A', 'B', 'C', 'D', 'F']).toContain(bad.grade);
  });

  it('应该列出优势', () => {
    const result = scoreFinancialQuality(goodData);
    expect(result.strengths.length).toBeGreaterThan(0);
  });

  it('差公司应该列出劣势', () => {
    const result = scoreFinancialQuality(badData);
    expect(result.weaknesses.length).toBeGreaterThan(0);
  });

  it('好公司评分应高于差公司', () => {
    const good = scoreFinancialQuality(goodData);
    const bad = scoreFinancialQuality(badData);
    expect(good.overallScore).toBeGreaterThan(bad.overallScore);
  });
});
