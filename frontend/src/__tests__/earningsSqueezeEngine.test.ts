import { describe, it, expect } from 'vitest';
import { analyzeEarningsSqueeze, EarningsSqueezeData } from '../utils/earningsSqueezeEngine';

describe('盈利挤压分析引擎', () => {
  const data: EarningsSqueezeData = {
    periods: [
      {
        period: '2023H1', revenue: 1000000, cogs: 600000, grossProfit: 400000,
        sellingExpense: 100000, adminExpense: 80000, rdExpense: 60000,
        financeExpense: 20000, netProfit: 140000, operatingCashFlow: 180000,
      },
      {
        period: '2023H2', revenue: 1100000, cogs: 680000, grossProfit: 420000,
        sellingExpense: 110000, adminExpense: 85000, rdExpense: 65000,
        financeExpense: 20000, netProfit: 140000, operatingCashFlow: 160000,
      },
    ],
    rawMaterialCostChange: 0.08,
    laborCostChange: 0.03,
    priceChange: 0.05,
    volumeChange: 0.1,
  };

  it('应分析毛利率趋势', () => {
    const r = analyzeEarningsSqueeze(data);
    expect(['expanding', 'stable', 'compressing']).toContain(r.grossMarginTrend);
  });

  it('应计算毛利率变动', () => {
    const r = analyzeEarningsSqueeze(data);
    expect(typeof r.grossMarginChange).toBe('number');
  });

  it('应评估费用率压力', () => {
    const r = analyzeEarningsSqueeze(data);
    expect(['low', 'moderate', 'high']).toContain(r.expensePressure);
  });

  it('应识别成本压力来源', () => {
    const r = analyzeEarningsSqueeze(data);
    expect(r.costPressureSource).toContain('原材料成本上涨');
  });

  it('应评估提价能力', () => {
    const r = analyzeEarningsSqueeze(data);
    expect(['strong', 'moderate', 'weak']).toContain(r.pricingPower);
  });

  it('应计算盈利弹性', () => {
    const r = analyzeEarningsSqueeze(data);
    expect(typeof r.earningsElasticity).toBe('number');
  });

  it('应输出挤压评分', () => {
    const r = analyzeEarningsSqueeze(data);
    expect(r.marginSqueezeScore).toBeGreaterThanOrEqual(0);
    expect(r.marginSqueezeScore).toBeLessThanOrEqual(100);
  });

  it('应输出盈利等级', () => {
    const r = analyzeEarningsSqueeze(data);
    expect(['A', 'B', 'C', 'D']).toContain(r.profitabilityGrade);
  });

  it('数据不足应抛出错误', () => {
    expect(() => analyzeEarningsSqueeze({ ...data, periods: [data.periods[0]] })).toThrow();
  });

  it('应评估警告标志', () => {
    const r = analyzeEarningsSqueeze(data);
    expect(Array.isArray(r.warningFlags)).toBe(true);
  });
});
