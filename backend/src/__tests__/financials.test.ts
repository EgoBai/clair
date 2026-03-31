import { describe, it, expect } from 'vitest';

/**
 * 财务数据计算测试
 */

interface FinancialData {
  revenue: number;
  netProfit: number;
  grossProfit: number;
  operatingProfit: number;
  totalAssets: number;
  totalEquity: number;
  totalLiabilities: number;
  currentAssets: number;
  currentLiabilities: number;
  inventory: number;
  accountsReceivable: number;
  cash: number;
  operatingCashFlow: number;
  investingCashFlow: number;
  financingCashFlow: number;
  shares: number;
  preClose: number;
}

interface FinancialRatios {
  grossMargin: number;
  operatingMargin: number;
  netMargin: number;
  roe: number;
  roa: number;
  debtToEquity: number;
  currentRatio: number;
  quickRatio: number;
  cashRatio: number;
  assetTurnover: number;
  receivableTurnover: number;
  inventoryTurnover: number;
  eps: number;
  pe: number;
  pb: number;
  ps: number;
}

function calcFinancialRatios(data: FinancialData, price: number): FinancialRatios {
  const grossMargin = data.revenue > 0 ? (data.grossProfit / data.revenue) * 100 : 0;
  const operatingMargin = data.revenue > 0 ? (data.operatingProfit / data.revenue) * 100 : 0;
  const netMargin = data.revenue > 0 ? (data.netProfit / data.revenue) * 100 : 0;
  const roe = data.totalEquity > 0 ? (data.netProfit / data.totalEquity) * 100 : 0;
  const roa = data.totalAssets > 0 ? (data.netProfit / data.totalAssets) * 100 : 0;
  const debtToEquity = data.totalEquity > 0 ? data.totalLiabilities / data.totalEquity : 0;
  const currentRatio = data.currentLiabilities > 0 ? data.currentAssets / data.currentLiabilities : 0;
  const quickAssets = data.currentAssets - data.inventory;
  const quickRatio = data.currentLiabilities > 0 ? quickAssets / data.currentLiabilities : 0;
  const cashRatio = data.currentLiabilities > 0 ? data.cash / data.currentLiabilities : 0;
  const assetTurnover = data.totalAssets > 0 ? data.revenue / data.totalAssets : 0;
  const receivableTurnover = data.accountsReceivable > 0 ? data.revenue / data.accountsReceivable : 0;
  const inventoryTurnover = data.inventory > 0 ? (data.revenue - data.grossProfit) / data.inventory : 0;
  const eps = data.shares > 0 ? data.netProfit / data.shares : 0;
  const marketCap = data.shares * price;
  const pe = eps > 0 ? price / eps : 0;
  const bvps = data.shares > 0 ? data.totalEquity / data.shares : 0;
  const pb = bvps > 0 ? price / bvps : 0;
  const sps = data.shares > 0 ? data.revenue / data.shares : 0;
  const ps = sps > 0 ? price / sps : 0;

  return {
    grossMargin: Math.round(grossMargin * 100) / 100,
    operatingMargin: Math.round(operatingMargin * 100) / 100,
    netMargin: Math.round(netMargin * 100) / 100,
    roe: Math.round(roe * 100) / 100,
    roa: Math.round(roa * 100) / 100,
    debtToEquity: Math.round(debtToEquity * 100) / 100,
    currentRatio: Math.round(currentRatio * 100) / 100,
    quickRatio: Math.round(quickRatio * 100) / 100,
    cashRatio: Math.round(cashRatio * 100) / 100,
    assetTurnover: Math.round(assetTurnover * 100) / 100,
    receivableTurnover: Math.round(receivableTurnover * 100) / 100,
    inventoryTurnover: Math.round(inventoryTurnover * 100) / 100,
    eps: Math.round(eps * 100) / 100,
    pe: Math.round(pe * 100) / 100,
    pb: Math.round(pb * 100) / 100,
    ps: Math.round(ps * 100) / 100,
  };
}

function scoreFinancialHealth(ratios: FinancialRatios): { score: number; grade: string; warnings: string[] } {
  const warnings: string[] = [];
  let score = 100;

  if (ratios.roe < 10) { score -= 15; warnings.push('ROE偏低'); }
  if (ratios.grossMargin < 20) { score -= 10; warnings.push('毛利率偏低'); }
  if (ratios.currentRatio < 1) { score -= 20; warnings.push('流动比率过低'); }
  if (ratios.debtToEquity > 2) { score -= 15; warnings.push('资产负债率过高'); }
  if (ratios.netMargin < 5) { score -= 10; warnings.push('净利率偏低'); }
  if (ratios.pe > 50) { score -= 10; warnings.push('估值偏高'); }

  let grade: string;
  if (score >= 90) grade = 'A+';
  else if (score >= 80) grade = 'A';
  else if (score >= 70) grade = 'B+';
  else if (score >= 60) grade = 'B';
  else if (score >= 50) grade = 'C';
  else grade = 'D';

  return { score: Math.max(0, score), grade, warnings };
}

describe('Financial Calculations', () => {
  const goodCompany: FinancialData = {
    revenue: 1000000,
    netProfit: 200000,
    grossProfit: 500000,
    operatingProfit: 300000,
    totalAssets: 2000000,
    totalEquity: 1000000,
    totalLiabilities: 1000000,
    currentAssets: 800000,
    currentLiabilities: 400000,
    inventory: 100000,
    accountsReceivable: 200000,
    cash: 300000,
    operatingCashFlow: 250000,
    investingCashFlow: -100000,
    financingCashFlow: -50000,
    shares: 100000,
    preClose: 50,
  };

  describe('财务比率计算', () => {
    it('应该正确计算毛利率', () => {
      const ratios = calcFinancialRatios(goodCompany, 50);
      expect(ratios.grossMargin).toBe(50);
    });

    it('应该正确计算净利率', () => {
      const ratios = calcFinancialRatios(goodCompany, 50);
      expect(ratios.netMargin).toBe(20);
    });

    it('应该正确计算ROE', () => {
      const ratios = calcFinancialRatios(goodCompany, 50);
      expect(ratios.roe).toBe(20);
    });

    it('应该正确计算流动比率', () => {
      const ratios = calcFinancialRatios(goodCompany, 50);
      expect(ratios.currentRatio).toBe(2);
    });

    it('应该正确计算速动比率', () => {
      const ratios = calcFinancialRatios(goodCompany, 50);
      expect(ratios.quickRatio).toBe(1.75); // (800000-100000)/400000
    });

    it('应该正确计算EPS', () => {
      const ratios = calcFinancialRatios(goodCompany, 50);
      expect(ratios.eps).toBe(2); // 200000/100000
    });

    it('应该正确计算PE', () => {
      const ratios = calcFinancialRatios(goodCompany, 50);
      expect(ratios.pe).toBe(25); // 50/2
    });

    it('应该正确计算PB', () => {
      const ratios = calcFinancialRatios(goodCompany, 50);
      expect(ratios.pb).toBe(5); // 50/(1000000/100000)
    });
  });

  describe('健康评分', () => {
    it('优秀公司应该高分', () => {
      const ratios = calcFinancialRatios(goodCompany, 50);
      const health = scoreFinancialHealth(ratios);
      expect(health.score).toBeGreaterThanOrEqual(70);
      expect(health.grade).not.toBe('D');
    });

    it('差公司应该低分', () => {
      const badCompany: FinancialData = {
        ...goodCompany,
        netProfit: 10000,
        grossProfit: 100000,
        currentLiabilities: 900000,
        totalLiabilities: 2500000,
      };
      const ratios = calcFinancialRatios(badCompany, 100);
      const health = scoreFinancialHealth(ratios);
      expect(health.score).toBeLessThan(60);
      expect(health.warnings.length).toBeGreaterThan(0);
    });

    it('应该返回警告信息', () => {
      const badCompany: FinancialData = { ...goodCompany, currentLiabilities: 900000 };
      const ratios = calcFinancialRatios(badCompany, 50);
      const health = scoreFinancialHealth(ratios);
      expect(health.warnings).toContain('流动比率过低');
    });
  });

  describe('边界条件', () => {
    it('零收入不应该报错', () => {
      const zeroRevenue: FinancialData = { ...goodCompany, revenue: 0 };
      const ratios = calcFinancialRatios(zeroRevenue, 50);
      expect(ratios.grossMargin).toBe(0);
      expect(ratios.netMargin).toBe(0);
    });

    it('零权益不应该报错', () => {
      const zeroEquity: FinancialData = { ...goodCompany, totalEquity: 0 };
      const ratios = calcFinancialRatios(zeroEquity, 50);
      expect(ratios.roe).toBe(0);
      expect(ratios.debtToEquity).toBe(0);
    });

    it('零股数不应该报错', () => {
      const zeroShares: FinancialData = { ...goodCompany, shares: 0 };
      const ratios = calcFinancialRatios(zeroShares, 50);
      expect(ratios.eps).toBe(0);
      expect(ratios.pe).toBe(0);
    });
  });
});
