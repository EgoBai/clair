import { describe, it, expect } from 'vitest';
import { analyzeDebtRestructuring, DebtStructure } from '../utils/debtRestructuringEngine';

describe('债务重组分析引擎', () => {
  const healthyCompany: DebtStructure = {
    totalDebt: 100_000_000,
    shortTermDebt: 30_000_000,
    longTermDebt: 70_000_000,
    interestBearingDebt: 100_000_000,
    cash: 200_000_000,
    ebitda: 50_000_000,
    interestExpense: 8_000_000,
    operatingCashFlow: 60_000_000,
    totalAssets: 1_000_000_000,
    netAssets: 500_000_000,
    totalRevenue: 300_000_000,
    currentAssets: 400_000_000,
    currentLiabilities: 150_000_000,
  };

  const distressedCompany: DebtStructure = {
    totalDebt: 800_000_000,
    shortTermDebt: 500_000_000,
    longTermDebt: 300_000_000,
    interestBearingDebt: 800_000_000,
    cash: 50_000_000,
    ebitda: 20_000_000,
    interestExpense: 40_000_000,
    operatingCashFlow: 15_000_000,
    totalAssets: 1_000_000_000,
    netAssets: 150_000_000,
    totalRevenue: 200_000_000,
    currentAssets: 150_000_000,
    currentLiabilities: 300_000_000,
  };

  it('应计算杠杆率', () => {
    const r = analyzeDebtRestructuring(healthyCompany);
    expect(r.leverageRatio).toBe(0.1);
  });

  it('应计算资产负债率', () => {
    const r = analyzeDebtRestructuring(healthyCompany);
    expect(r.debtToEquity).toBe(0.2);
  });

  it('应计算利息覆盖率', () => {
    const r = analyzeDebtRestructuring(healthyCompany);
    expect(r.interestCoverage).toBeGreaterThan(1);
  });

  it('应计算流动比率', () => {
    const r = analyzeDebtRestructuring(healthyCompany);
    expect(r.currentRatio).toBeGreaterThan(1);
  });

  it('健康公司评分应较高', () => {
    const r = analyzeDebtRestructuring(healthyCompany);
    expect(r.debtStructureScore).toBeGreaterThan(80);
  });

  it('困境公司评分应较低', () => {
    const r = analyzeDebtRestructuring(distressedCompany);
    expect(r.debtStructureScore).toBeLessThan(50);
  });

  it('困境公司应有警告信号', () => {
    const r = analyzeDebtRestructuring(distressedCompany);
    expect(r.warningSignals.length).toBeGreaterThan(0);
  });

  it('应输出健康等级', () => {
    const r1 = analyzeDebtRestructuring(healthyCompany);
    const r2 = analyzeDebtRestructuring(distressedCompany);
    expect(['A', 'B', 'C', 'D', 'F']).toContain(r1.debtHealthGrade);
    expect(r2.debtHealthGrade).toBe('F');
  });

  it('应输出风险等级', () => {
    const r = analyzeDebtRestructuring(distressedCompany);
    expect(['low', 'medium', 'high', 'critical']).toContain(r.restructuringRisk);
  });

  it('总资产为0应抛出错误', () => {
    expect(() => analyzeDebtRestructuring({ ...healthyCompany, totalAssets: 0 })).toThrow();
  });
});
