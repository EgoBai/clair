import { describe, it, expect } from 'vitest';

// 财报分析引擎
interface FinancialStatement {
  period: string;
  revenue: number;
  netIncome: number;
  grossProfit: number;
  operatingIncome: number;
  totalAssets: number;
  totalEquity: number;
  totalDebt: number;
  cashFlow: number;
  freeCashFlow: number;
}

function calcGrossMargin(stmt: FinancialStatement): number {
  return stmt.revenue > 0 ? (stmt.grossProfit / stmt.revenue) * 100 : 0;
}

function calcNetMargin(stmt: FinancialStatement): number {
  return stmt.revenue > 0 ? (stmt.netIncome / stmt.revenue) * 100 : 0;
}

function calcROE(stmt: FinancialStatement): number {
  return stmt.totalEquity > 0 ? (stmt.netIncome / stmt.totalEquity) * 100 : 0;
}

function calcROA(stmt: FinancialStatement): number {
  return stmt.totalAssets > 0 ? (stmt.netIncome / stmt.totalAssets) * 100 : 0;
}

function calcDebtToEquity(stmt: FinancialStatement): number {
  return stmt.totalEquity > 0 ? stmt.totalDebt / stmt.totalEquity : 0;
}

function calcCurrentRatio(currentAssets: number, currentLiabilities: number): number {
  return currentLiabilities > 0 ? currentAssets / currentLiabilities : 0;
}

function calcRevenueGrowth(current: FinancialStatement, previous: FinancialStatement): number {
  return previous.revenue > 0 ? ((current.revenue - previous.revenue) / previous.revenue) * 100 : 0;
}

function calcEarningsGrowth(current: FinancialStatement, previous: FinancialStatement): number {
  return previous.netIncome > 0 ? ((current.netIncome - previous.netIncome) / previous.netIncome) * 100 : 0;
}

function calcPE(price: number, eps: number): number {
  return eps > 0 ? price / eps : 0;
}

function calcPB(price: number, bps: number): number {
  return bps > 0 ? price / bps : 0;
}

function calcPS(price: number, sps: number): number {
  return sps > 0 ? price / sps : 0;
}

function generateFinancialSummary(stmt: FinancialStatement): Record<string, number> {
  return {
    grossMargin: calcGrossMargin(stmt),
    netMargin: calcNetMargin(stmt),
    roe: calcROE(stmt),
    roa: calcROA(stmt),
    debtToEquity: calcDebtToEquity(stmt),
  };
}

function detectEarningsQuality(stmts: FinancialStatement[]): { good: string[]; bad: string[] } {
  const good: string[] = [], bad: string[] = [];
  if (stmts.length >= 2) {
    const latest = stmts[stmts.length - 1], prev = stmts[stmts.length - 2];
    if (calcRevenueGrowth(latest, prev) > 10) good.push('营收增长超10%');
    if (calcRevenueGrowth(latest, prev) < 0) bad.push('营收同比下滑');
    if (calcNetMargin(latest) > calcNetMargin(prev)) good.push('净利率提升');
    if (calcNetMargin(latest) < calcNetMargin(prev)) bad.push('净利率下降');
    if (latest.cashFlow > latest.netIncome) good.push('经营现金流大于净利润');
    if (latest.cashFlow < latest.netIncome * 0.5) bad.push('经营现金流远低于净利润');
  }
  return { good, bad };
}

describe('财报分析引擎', () => {
  const stmt: FinancialStatement = {
    period: '2025Q4', revenue: 1000000000, netIncome: 150000000,
    grossProfit: 400000000, operatingIncome: 200000000,
    totalAssets: 5000000000, totalEquity: 2000000000, totalDebt: 1000000000,
    cashFlow: 180000000, freeCashFlow: 120000000,
  };

  describe('毛利率', () => {
    it('应正确计算毛利率', () => { expect(calcGrossMargin(stmt)).toBe(40); });
    it('营收为零应返回0', () => { expect(calcGrossMargin({ ...stmt, revenue: 0 })).toBe(0); });
  });

  describe('净利率', () => {
    it('应正确计算净利率', () => { expect(calcNetMargin(stmt)).toBe(15); });
  });

  describe('ROE', () => {
    it('应正确计算ROE', () => { expect(calcROE(stmt)).toBe(7.5); });
    it('净资产为零应返回0', () => { expect(calcROE({ ...stmt, totalEquity: 0 })).toBe(0); });
  });

  describe('ROA', () => {
    it('应正确计算ROA', () => { expect(calcROA(stmt)).toBe(3); });
  });

  describe('资产负债率', () => {
    it('应正确计算D/E', () => { expect(calcDebtToEquity(stmt)).toBe(0.5); });
    it('净资产为零应返回0', () => { expect(calcDebtToEquity({ ...stmt, totalEquity: 0 })).toBe(0); });
  });

  describe('增长指标', () => {
    const prevStmt = { ...stmt, revenue: 800000000, netIncome: 120000000 };
    it('应正确计算营收增长', () => { expect(calcRevenueGrowth(stmt, prevStmt)).toBe(25); });
    it('应正确计算利润增长', () => { expect(calcEarningsGrowth(stmt, prevStmt)).toBe(25); });
    it('基数为零应返回0', () => { expect(calcRevenueGrowth(stmt, { ...prevStmt, revenue: 0 })).toBe(0); });
  });

  describe('估值指标', () => {
    it('PE应正确', () => { expect(calcPE(15, 1)).toBe(15); });
    it('PB应正确', () => { expect(calcPB(10, 5)).toBe(2); });
    it('PS应正确', () => { expect(calcPS(10, 2)).toBe(5); });
    it('分母为零应返回0', () => { expect(calcPE(10, 0)).toBe(0); });
  });

  describe('财报汇总', () => {
    it('应生成所有关键指标', () => {
      const summary = generateFinancialSummary(stmt);
      expect(summary.grossMargin).toBe(40);
      expect(summary.netMargin).toBe(15);
      expect(summary.roe).toBe(7.5);
      expect(summary.roa).toBe(3);
      expect(summary.debtToEquity).toBe(0.5);
    });
  });

  describe('盈利质量检测', () => {
    it('好指标应归入good', () => {
      const stmts = [
        { ...stmt, revenue: 800000000, netIncome: 100000000 },
        { ...stmt, revenue: 1200000000, netIncome: 200000000 },
      ];
      const quality = detectEarningsQuality(stmts);
      expect(quality.good.length).toBeGreaterThan(0);
    });

    it('差指标应归入bad', () => {
      const stmts = [
        { ...stmt, revenue: 1200000000, netIncome: 200000000, cashFlow: 50000000 },
        { ...stmt, revenue: 1000000000, netIncome: 150000000, cashFlow: 10000000 },
      ];
      const quality = detectEarningsQuality(stmts);
      expect(quality.bad.length).toBeGreaterThan(0);
    });
  });
});
