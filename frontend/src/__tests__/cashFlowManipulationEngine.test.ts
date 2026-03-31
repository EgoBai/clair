import { describe, it, expect } from 'vitest';
import { analyzeCashFlowQuality, CashFlowData } from '../utils/cashFlowManipulationEngine';

describe('现金流操纵检测引擎', () => {
  const goodData: CashFlowData = {
    operatingCF: 2500, netIncome: 2000, revenue: 10000,
    accountsReceivable: 1200, inventory: 800, prepaidExpenses: 200,
    accountsPayable: 1000, depreciation: 500, capex: 600,
    operatingCFPrior: 2200, revenuePrior: 9000, arPrior: 1000, inventoryPrior: 750,
  };

  const suspiciousData: CashFlowData = {
    operatingCF: 300, netIncome: 2000, revenue: 10000,
    accountsReceivable: 5000, inventory: 3000, prepaidExpenses: 1000,
    accountsPayable: 500, depreciation: 200, capex: 400,
    operatingCFPrior: 1800, revenuePrior: 9000, arPrior: 2000, inventoryPrior: 1500,
  };

  it('好公司应有较高评分', () => {
    const result = analyzeCashFlowQuality(goodData);
    expect(result.qualityScore).toBeGreaterThan(50);
  });

  it('可疑公司应有较低评分', () => {
    const result = analyzeCashFlowQuality(suspiciousData);
    expect(result.qualityScore).toBeLessThan(50);
  });

  it('好公司评级应高于可疑公司', () => {
    const good = analyzeCashFlowQuality(goodData);
    const bad = analyzeCashFlowQuality(suspiciousData);
    expect(good.qualityScore).toBeGreaterThan(bad.qualityScore);
  });

  it('应该计算现金流/利润比', () => {
    const result = analyzeCashFlowQuality(goodData);
    expect(result.cashToProfitRatio).toBeGreaterThan(0);
  });

  it('应该计算应收周转', () => {
    const result = analyzeCashFlowQuality(goodData);
    expect(result.arTurnover).toBeGreaterThan(0);
  });

  it('应该计算存货周转', () => {
    const result = analyzeCashFlowQuality(goodData);
    expect(result.inventoryTurnover).toBeGreaterThan(0);
  });

  it('应该计算现金转化周期', () => {
    const result = analyzeCashFlowQuality(goodData);
    expect(typeof result.cashConversionCycle).toBe('number');
  });

  it('应该给出评级', () => {
    const result = analyzeCashFlowQuality(goodData);
    expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade);
  });

  it('可疑公司应有红旗', () => {
    const result = analyzeCashFlowQuality(suspiciousData);
    expect(result.redFlags.length).toBeGreaterThan(0);
  });

  it('应该判断操纵风险', () => {
    const result = analyzeCashFlowQuality(goodData);
    expect(['low', 'medium', 'high']).toContain(result.manipulationRisk);
  });

  it('应计比例应正确计算', () => {
    const result = analyzeCashFlowQuality(goodData);
    const expected = (goodData.netIncome - goodData.operatingCF) / goodData.netIncome;
    expect(result.accrualRatio).toBeCloseTo(expected, 3);
  });

  it('好公司操纵风险应低', () => {
    const result = analyzeCashFlowQuality(goodData);
    expect(result.manipulationRisk).toBe('low');
  });
});
