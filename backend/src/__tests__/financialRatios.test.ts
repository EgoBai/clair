import { describe, it, expect } from 'vitest';

// 财务比率计算测试
describe('Financial Ratios', () => {
  interface FinancialData {
    revenue: number;
    cost: number;
    grossProfit: number;
    netIncome: number;
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    currentAssets: number;
    currentLiabilities: number;
    operatingCashFlow: number;
    investingCashFlow: number;
    financingCashFlow: number;
    shares: number;
    marketCap: number;
    dividend: number;
  }

  const calcRatios = (data: FinancialData) => {
    const grossMargin = data.revenue > 0 ? data.grossProfit / data.revenue : 0;
    const netMargin = data.revenue > 0 ? data.netIncome / data.revenue : 0;
    const roe = data.totalEquity > 0 ? data.netIncome / data.totalEquity : 0;
    const roa = data.totalAssets > 0 ? data.netIncome / data.totalAssets : 0;
    const debtRatio = data.totalAssets > 0 ? data.totalLiabilities / data.totalAssets : 0;
    const currentRatio = data.currentLiabilities > 0 ? data.currentAssets / data.currentLiabilities : 0;
    const quickRatio = data.currentLiabilities > 0 ? (data.currentAssets * 0.8) / data.currentLiabilities : 0;
    const eps = data.shares > 0 ? data.netIncome / data.shares : 0;
    const pe = eps > 0 ? data.marketCap / data.netIncome : Infinity;
    const pb = data.totalEquity > 0 ? data.marketCap / data.totalEquity : Infinity;
    const dividendYield = data.marketCap > 0 ? data.dividend / data.marketCap : 0;
    const interestCoverage = data.cost > 0 ? data.netIncome / (data.cost * 0.1) : 0;
    const assetTurnover = data.totalAssets > 0 ? data.revenue / data.totalAssets : 0;
    const cashFlowCoverage = data.operatingCashFlow + data.investingCashFlow + data.financingCashFlow;
    const freeCashFlow = data.operatingCashFlow + data.investingCashFlow;
    const workingCapital = data.currentAssets - data.currentLiabilities;
    return {
      grossMargin, netMargin, roe, roa, debtRatio, currentRatio, quickRatio,
      eps, pe, pb, dividendYield, interestCoverage, assetTurnover,
      cashFlowCoverage, freeCashFlow, workingCapital,
    };
  };

  const sampleData: FinancialData = {
    revenue: 1000000000,
    cost: 600000000,
    grossProfit: 400000000,
    netIncome: 150000000,
    totalAssets: 5000000000,
    totalLiabilities: 2000000000,
    totalEquity: 3000000000,
    currentAssets: 1500000000,
    currentLiabilities: 800000000,
    operatingCashFlow: 200000000,
    investingCashFlow: -100000000,
    financingCashFlow: -50000000,
    shares: 100000000,
    marketCap: 5000000000,
    dividend: 50000000,
  };

  describe('Profitability Ratios', () => {
    it('should calculate gross margin', () => {
      const r = calcRatios(sampleData);
      expect(r.grossMargin).toBeCloseTo(0.40, 2);
    });

    it('should calculate net margin', () => {
      const r = calcRatios(sampleData);
      expect(r.netMargin).toBeCloseTo(0.15, 2);
    });

    it('should calculate ROE', () => {
      const r = calcRatios(sampleData);
      expect(r.roe).toBeCloseTo(0.05, 2);
    });

    it('should calculate ROA', () => {
      const r = calcRatios(sampleData);
      expect(r.roa).toBeCloseTo(0.03, 2);
    });

    it('should have gross margin >= net margin', () => {
      const r = calcRatios(sampleData);
      expect(r.grossMargin).toBeGreaterThanOrEqual(r.netMargin);
    });

    it('should handle zero revenue', () => {
      const r = calcRatios({ ...sampleData, revenue: 0 });
      expect(r.grossMargin).toBe(0);
      expect(r.netMargin).toBe(0);
    });
  });

  describe('Leverage Ratios', () => {
    it('should calculate debt ratio', () => {
      const r = calcRatios(sampleData);
      expect(r.debtRatio).toBeCloseTo(0.40, 2);
    });

    it('should calculate current ratio', () => {
      const r = calcRatios(sampleData);
      expect(r.currentRatio).toBeCloseTo(1.875, 3);
    });

    it('should calculate quick ratio', () => {
      const r = calcRatios(sampleData);
      expect(r.quickRatio).toBeCloseTo(1.5, 2);
    });

    it('should have debt ratio between 0 and 1', () => {
      const r = calcRatios(sampleData);
      expect(r.debtRatio).toBeGreaterThanOrEqual(0);
      expect(r.debtRatio).toBeLessThanOrEqual(1);
    });

    it('should handle zero liabilities', () => {
      const r = calcRatios({ ...sampleData, currentLiabilities: 0 });
      expect(r.currentRatio).toBe(0);
    });
  });

  describe('Valuation Ratios', () => {
    it('should calculate EPS', () => {
      const r = calcRatios(sampleData);
      expect(r.eps).toBeCloseTo(1.5, 2);
    });

    it('should calculate PE ratio', () => {
      const r = calcRatios(sampleData);
      expect(r.pe).toBeCloseTo(33.33, 1);
    });

    it('should calculate PB ratio', () => {
      const r = calcRatios(sampleData);
      expect(r.pb).toBeCloseTo(1.67, 2);
    });

    it('should calculate dividend yield', () => {
      const r = calcRatios(sampleData);
      expect(r.dividendYield).toBeCloseTo(0.01, 2);
    });

    it('should return Infinity PE for loss-making company', () => {
      const r = calcRatios({ ...sampleData, netIncome: -100000000 });
      expect(r.pe).toBe(Infinity);
    });

    it('should handle zero shares', () => {
      const r = calcRatios({ ...sampleData, shares: 0 });
      expect(r.eps).toBe(0);
    });
  });

  describe('Cash Flow Ratios', () => {
    it('should calculate net cash flow', () => {
      const r = calcRatios(sampleData);
      expect(r.cashFlowCoverage).toBe(50000000);
    });

    it('should calculate free cash flow', () => {
      const r = calcRatios(sampleData);
      expect(r.freeCashFlow).toBe(100000000);
    });

    it('should calculate working capital', () => {
      const r = calcRatios(sampleData);
      expect(r.workingCapital).toBe(700000000);
    });

    it('should handle negative working capital', () => {
      const r = calcRatios({ ...sampleData, currentAssets: 500000000 });
      expect(r.workingCapital).toBeLessThan(0);
    });
  });

  describe('Efficiency Ratios', () => {
    it('should calculate asset turnover', () => {
      const r = calcRatios(sampleData);
      expect(r.assetTurnover).toBeCloseTo(0.2, 2);
    });

    it('should calculate interest coverage', () => {
      const r = calcRatios(sampleData);
      expect(r.interestCoverage).toBeGreaterThan(0);
    });

    it('should handle zero assets', () => {
      const r = calcRatios({ ...sampleData, totalAssets: 0 });
      expect(r.assetTurnover).toBe(0);
      expect(r.roa).toBe(0);
    });
  });

  describe('Ratio Quality Assessment', () => {
    const assessQuality = (r: ReturnType<typeof calcRatios>) => {
      const scores = {
        profitability: (r.grossMargin > 0.3 ? 25 : r.grossMargin > 0.15 ? 15 : 0) +
          (r.netMargin > 0.1 ? 25 : r.netMargin > 0.05 ? 15 : 0) +
          (r.roe > 0.15 ? 25 : r.roe > 0.08 ? 15 : 0),
        leverage: (r.debtRatio < 0.5 ? 25 : r.debtRatio < 0.7 ? 15 : 0) +
          (r.currentRatio > 1.5 ? 25 : r.currentRatio > 1 ? 15 : 0),
      };
      const total = scores.profitability + scores.leverage;
      return { scores, total, grade: total >= 80 ? 'A' : total >= 60 ? 'B' : total >= 40 ? 'C' : 'D' };
    };

    it('should grade good company as A or B', () => {
      const r = calcRatios(sampleData);
      const quality = assessQuality(r);
      expect(['A', 'B']).toContain(quality.grade);
    });

    it('should grade loss-making company poorly', () => {
      const bad: FinancialData = {
        ...sampleData,
        grossProfit: 100000000,
        netIncome: -50000000,
        totalLiabilities: 4000000000,
        currentAssets: 500000000,
      };
      const r = calcRatios(bad);
      const quality = assessQuality(r);
      expect(['C', 'D']).toContain(quality.grade);
    });

    it('should have scores within range', () => {
      const r = calcRatios(sampleData);
      const quality = assessQuality(r);
      expect(quality.total).toBeGreaterThanOrEqual(0);
      expect(quality.total).toBeLessThanOrEqual(100);
    });
  });
});
