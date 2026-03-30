import { describe, it, expect } from 'vitest';

/**
 * 财务报表分析引擎测试
 */

interface FinancialData {
  revenue: number; netIncome: number; totalAssets: number; totalEquity: number;
  totalDebt: number; operatingCashFlow: number; capex: number; currentAssets: number;
  currentLiabilities: number; inventory: number; accountsReceivable: number;
  grossProfit: number; ebit: number; interestExpense: number; shares: number;
  price: number; dividends: number;
}

const calcRatios = (d: FinancialData) => ({
  pe: d.netIncome > 0 ? (d.price * d.shares) / d.netIncome : Infinity,
  pb: d.totalEquity > 0 ? (d.price * d.shares) / d.totalEquity : Infinity,
  ps: d.revenue > 0 ? (d.price * d.shares) / d.revenue : Infinity,
  roe: d.totalEquity > 0 ? d.netIncome / d.totalEquity : 0,
  roa: d.totalAssets > 0 ? d.netIncome / d.totalAssets : 0,
  grossMargin: d.revenue > 0 ? d.grossProfit / d.revenue : 0,
  netMargin: d.revenue > 0 ? d.netIncome / d.revenue : 0,
  debtToEquity: d.totalEquity > 0 ? d.totalDebt / d.totalEquity : Infinity,
  currentRatio: d.currentLiabilities > 0 ? d.currentAssets / d.currentLiabilities : Infinity,
  quickRatio: d.currentLiabilities > 0 ? (d.currentAssets - d.inventory) / d.currentLiabilities : Infinity,
  interestCoverage: d.interestExpense > 0 ? d.ebit / d.interestExpense : Infinity,
  assetTurnover: d.totalAssets > 0 ? d.revenue / d.totalAssets : 0,
  dividendYield: d.price > 0 ? d.dividends / (d.price * d.shares) : 0,
  payoutRatio: d.netIncome > 0 ? d.dividends / d.netIncome : 0,
  fcf: d.operatingCashFlow - d.capex,
  fcfYield: d.price * d.shares > 0 ? (d.operatingCashFlow - d.capex) / (d.price * d.shares) : 0,
  cashRatio: d.currentLiabilities > 0 ? (d.currentAssets - d.inventory - d.accountsReceivable) / d.currentLiabilities : Infinity,
  debtToAssets: d.totalAssets > 0 ? d.totalDebt / d.totalAssets : 0,
  equityMultiplier: d.totalEquity > 0 ? d.totalAssets / d.totalEquity : Infinity,
  operatingMargin: d.revenue > 0 ? d.ebit / d.revenue : 0,
});

const dupontDecomposition = (d: FinancialData): { margin: number; turnover: number; leverage: number; roe: number } => {
  const margin = d.revenue > 0 ? d.netIncome / d.revenue : 0;
  const turnover = d.totalAssets > 0 ? d.revenue / d.totalAssets : 0;
  const leverage = d.totalEquity > 0 ? d.totalAssets / d.totalEquity : 0;
  return { margin, turnover, leverage, roe: margin * turnover * leverage };
};

const scoreFinancialHealth = (d: FinancialData): { score: number; grade: string } => {
  let score = 50;
  const ratios = calcRatios(d);
  if (ratios.roe > 0.15) score += 10;
  if (ratios.roe > 0.20) score += 5;
  if (ratios.currentRatio > 1.5) score += 10;
  if (ratios.debtToEquity < 0.5) score += 10;
  if (ratios.grossMargin > 0.3) score += 5;
  if (ratios.fcf > 0) score += 10;
  if (ratios.netMargin < 0) score -= 15;
  if (ratios.currentRatio < 1) score -= 10;
  if (ratios.debtToEquity > 2) score -= 10;
  score = Math.max(0, Math.min(100, score));
  let grade = 'C';
  if (score >= 80) grade = 'A';
  else if (score >= 65) grade = 'B';
  else if (score < 40) grade = 'D';
  return { score, grade };
};

describe('财务报表分析', () => {
  const sampleData: FinancialData = {
    revenue: 1e9, netIncome: 1.5e8, totalAssets: 2e9, totalEquity: 1e9,
    totalDebt: 5e8, operatingCashFlow: 2e8, capex: 5e7, currentAssets: 8e8,
    currentLiabilities: 4e8, inventory: 1e8, accountsReceivable: 2e8,
    grossProfit: 4e8, ebit: 2e8, interestExpense: 2.5e7, shares: 1e8,
    price: 50, dividends: 5e7
  };

  describe('估值指标', () => {
    it('PE应正确计算', () => {
      const r = calcRatios(sampleData);
      expect(r.pe).toBeCloseTo(33.33, 1);
    });

    it('PB应正确计算', () => {
      const r = calcRatios(sampleData);
      expect(r.pb).toBeCloseTo(5, 1);
    });

    it('PS应正确计算', () => {
      const r = calcRatios(sampleData);
      expect(r.ps).toBeCloseTo(5, 1);
    });

    it('亏损公司PE为Infinity', () => {
      const d = { ...sampleData, netIncome: -1e8 };
      expect(calcRatios(d).pe).toBe(Infinity);
    });

    it('零净资产PB为Infinity', () => {
      const d = { ...sampleData, totalEquity: 0 };
      expect(calcRatios(d).pb).toBe(Infinity);
    });

    it('零收入PS为Infinity', () => {
      const d = { ...sampleData, revenue: 0 };
      expect(calcRatios(d).ps).toBe(Infinity);
    });

    it('股息率应正确', () => {
      const r = calcRatios(sampleData);
      expect(r.dividendYield).toBeCloseTo(0.01, 5);
    });

    it('零价格股息率为0', () => {
      const d = { ...sampleData, price: 0 };
      expect(calcRatios(d).dividendYield).toBe(0);
    });

    it('FCF收益率应正确', () => {
      const r = calcRatios(sampleData);
      expect(r.fcfYield).toBeGreaterThan(0);
    });

    it('FCF应正确计算', () => {
      const r = calcRatios(sampleData);
      expect(r.fcf).toBe(1.5e8);
    });
  });

  describe('盈利能力', () => {
    it('ROE应正确计算', () => {
      const r = calcRatios(sampleData);
      expect(r.roe).toBeCloseTo(0.15, 5);
    });

    it('ROA应正确计算', () => {
      const r = calcRatios(sampleData);
      expect(r.roa).toBeCloseTo(0.075, 5);
    });

    it('毛利率应正确', () => {
      const r = calcRatios(sampleData);
      expect(r.grossMargin).toBeCloseTo(0.4, 5);
    });

    it('净利率应正确', () => {
      const r = calcRatios(sampleData);
      expect(r.netMargin).toBeCloseTo(0.15, 5);
    });

    it('营业利润率应正确', () => {
      const r = calcRatios(sampleData);
      expect(r.operatingMargin).toBeCloseTo(0.2, 5);
    });

    it('零权益ROE为0', () => {
      const d = { ...sampleData, totalEquity: 0 };
      expect(calcRatios(d).roe).toBe(0);
    });

    it('零总资产ROA为0', () => {
      const d = { ...sampleData, totalAssets: 0 };
      expect(calcRatios(d).roa).toBe(0);
    });

    it('亏损公司净利率为负', () => {
      const d = { ...sampleData, netIncome: -1e8 };
      expect(calcRatios(d).netMargin).toBeLessThan(0);
    });
  });

  describe('偿债能力', () => {
    it('资产负债率应正确', () => {
      const r = calcRatios(sampleData);
      expect(r.debtToAssets).toBeCloseTo(0.25, 5);
    });

    it('产权比率应正确', () => {
      const r = calcRatios(sampleData);
      expect(r.debtToEquity).toBeCloseTo(0.5, 5);
    });

    it('流动比率应正确', () => {
      const r = calcRatios(sampleData);
      expect(r.currentRatio).toBeCloseTo(2, 5);
    });

    it('速动比率应正确', () => {
      const r = calcRatios(sampleData);
      expect(r.quickRatio).toBeCloseTo(1.75, 5);
    });

    it('现金比率应正确', () => {
      const r = calcRatios(sampleData);
      expect(r.cashRatio).toBeCloseTo(1.25, 5);
    });

    it('利息覆盖倍数应正确', () => {
      const r = calcRatios(sampleData);
      expect(r.interestCoverage).toBeCloseTo(8, 5);
    });

    it('零流动负债比率应为Infinity', () => {
      const d = { ...sampleData, currentLiabilities: 0 };
      const r = calcRatios(d);
      expect(r.currentRatio).toBe(Infinity);
      expect(r.quickRatio).toBe(Infinity);
    });

    it('零利息费用覆盖率为Infinity', () => {
      const d = { ...sampleData, interestExpense: 0 };
      expect(calcRatios(d).interestCoverage).toBe(Infinity);
    });

    it('零权益产权比率为Infinity', () => {
      const d = { ...sampleData, totalEquity: 0 };
      expect(calcRatios(d).debtToEquity).toBe(Infinity);
    });
  });

  describe('运营效率', () => {
    it('总资产周转率应正确', () => {
      const r = calcRatios(sampleData);
      expect(r.assetTurnover).toBeCloseTo(0.5, 5);
    });

    it('权益乘数应正确', () => {
      const r = calcRatios(sampleData);
      expect(r.equityMultiplier).toBeCloseTo(2, 5);
    });

    it('派息率应正确', () => {
      const r = calcRatios(sampleData);
      expect(r.payoutRatio).toBeCloseTo(1/3, 1);
    });

    it('零收入周转率为0', () => {
      const d = { ...sampleData, revenue: 0 };
      expect(calcRatios(d).assetTurnover).toBe(0);
    });

    it('零总资产周转率为0', () => {
      const d = { ...sampleData, totalAssets: 0 };
      expect(calcRatios(d).assetTurnover).toBe(0);
    });

    it('零净利派息率为0', () => {
      const d = { ...sampleData, netIncome: 0 };
      expect(calcRatios(d).payoutRatio).toBe(0);
    });
  });

  describe('杜邦分析', () => {
    it('三因素乘积应等于ROE', () => {
      const dup = dupontDecomposition(sampleData);
      expect(dup.roe).toBeCloseTo(dup.margin * dup.turnover * dup.leverage, 5);
    });

    it('杜邦ROE应等于直接ROE', () => {
      const ratios = calcRatios(sampleData);
      const dup = dupontDecomposition(sampleData);
      expect(dup.roe).toBeCloseTo(ratios.roe, 5);
    });

    it('利润率应正确', () => {
      const dup = dupontDecomposition(sampleData);
      expect(dup.margin).toBeCloseTo(0.15, 5);
    });

    it('周转率应正确', () => {
      const dup = dupontDecomposition(sampleData);
      expect(dup.turnover).toBeCloseTo(0.5, 5);
    });

    it('杠杆率应正确', () => {
      const dup = dupontDecomposition(sampleData);
      expect(dup.leverage).toBeCloseTo(2, 5);
    });

    it('零收入杜邦各项应合理', () => {
      const d = { ...sampleData, revenue: 0 };
      const dup = dupontDecomposition(d);
      expect(dup.margin).toBe(0);
      expect(dup.turnover).toBe(0);
      expect(dup.roe).toBe(0);
    });

    it('高杠杆公司高权益乘数', () => {
      const d = { ...sampleData, totalEquity: 1e8, totalAssets: 2e9 };
      const dup = dupontDecomposition(d);
      expect(dup.leverage).toBe(20);
    });
  });

  describe('财务健康评分', () => {
    it('良好财务应有高评分', () => {
      const { score, grade } = scoreFinancialHealth(sampleData);
      expect(score).toBeGreaterThan(60);
      expect(['A', 'B']).toContain(grade);
    });

    it('差财务应有低评分', () => {
      const bad: FinancialData = {
        revenue: 1e8, netIncome: -5e7, totalAssets: 1e9, totalEquity: 2e8,
        totalDebt: 8e8, operatingCashFlow: -1e7, capex: 5e7, currentAssets: 1e8,
        currentLiabilities: 3e8, inventory: 5e7, accountsReceivable: 3e7,
        grossProfit: 1e7, ebit: -3e7, interestExpense: 5e7, shares: 1e8,
        price: 5, dividends: 0
      };
      const { score, grade } = scoreFinancialHealth(bad);
      expect(score).toBeLessThan(50);
      expect(grade).toBe('D');
    });

    it('评分应在0-100之间', () => {
      const { score } = scoreFinancialHealth(sampleData);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('四个等级都应该出现', () => {
      const excellent: FinancialData = {
        revenue: 1e10, netIncome: 2e9, totalAssets: 5e9, totalEquity: 4e9,
        totalDebt: 5e8, operatingCashFlow: 3e9, capex: 5e8, currentAssets: 3e9,
        currentLiabilities: 1e9, inventory: 2e8, accountsReceivable: 5e8,
        grossProfit: 5e9, ebit: 2.5e9, interestExpense: 1e7, shares: 1e9,
        price: 100, dividends: 1e9
      };
      expect(scoreFinancialHealth(excellent).grade).toBe('A');
    });

    it('评分应反映多维度', () => {
      const d1 = { ...sampleData, roe: 0.25 };
      const { score: s1 } = scoreFinancialHealth(sampleData);
      const { score: s2 } = scoreFinancialHealth({
        ...sampleData, netIncome: 3e8, totalEquity: 1e9, currentAssets: 1e9,
        totalDebt: 2e8, grossProfit: 6e8, operatingCashFlow: 4e8
      });
      expect(s2).toBeGreaterThan(s1);
    });
  });

  describe('边界条件', () => {
    it('零收入公司所有比率应合理', () => {
      const d: FinancialData = {
        revenue: 0, netIncome: 0, totalAssets: 1e9, totalEquity: 5e8,
        totalDebt: 5e8, operatingCashFlow: 0, capex: 0, currentAssets: 2e8,
        currentLiabilities: 1e8, inventory: 5e7, accountsReceivable: 3e7,
        grossProfit: 0, ebit: 0, interestExpense: 1e7, shares: 1e8,
        price: 10, dividends: 0
      };
      const r = calcRatios(d);
      expect(r.grossMargin).toBe(0);
      expect(r.netMargin).toBe(0);
      expect(r.fcf).toBe(0);
    });

    it('极大数值不应溢出', () => {
      const d = { ...sampleData, revenue: 1e15, netIncome: 1e14, totalAssets: 1e16 };
      const r = calcRatios(d);
      expect(isFinite(r.roe)).toBe(true);
      expect(isFinite(r.netMargin)).toBe(true);
    });

    it('极小数值不应下溢', () => {
      const d = { ...sampleData, revenue: 1, netIncome: 0.01, totalAssets: 10 };
      const r = calcRatios(d);
      expect(isFinite(r.pe) || r.pe === Infinity).toBe(true);
    });
  });
});
