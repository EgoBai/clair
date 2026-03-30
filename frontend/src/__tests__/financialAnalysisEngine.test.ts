import { describe, it, expect } from 'vitest';
import {
  calculateRatios,
  calculateGrowthRates,
  performDuPontAnalysis,
  calculateQualityScore,
  calculateAltmanZScore,
  calculatePiotroskiScore,
  calculateGrahamIntrinsicValue,
  calculateFCFE,
  calculateWACC,
  type FinancialStatement,
} from '../utils/financialAnalysisEngine';

describe('FinancialAnalysisEngine', () => {
  const stmt: FinancialStatement = {
    ticker: '000001',
    date: '2024-12-31',
    revenue: 1e9,
    netIncome: 1.5e8,
    grossProfit: 4e8,
    operatingIncome: 2e8,
    totalAssets: 5e9,
    totalEquity: 2e9,
    totalLiabilities: 3e9,
    currentAssets: 1.5e9,
    currentLiabilities: 8e8,
    cash: 5e8,
    inventory: 2e8,
    accountsReceivable: 3e8,
    operatingCashFlow: 2.5e8,
    investingCashFlow: -1e8,
    financingCashFlow: -5e7,
    capex: 8e7,
    interestExpense: 3e7,
    shares: 1e8,
  };

  const prevStmt: FinancialStatement = {
    ...stmt,
    date: '2023-12-31',
    revenue: 9e8,
    netIncome: 1.2e8,
    grossProfit: 3.5e8,
    operatingIncome: 1.8e8,
    shares: 1e8,
  };

  describe('calculateRatios', () => {
    it('should calculate profitability ratios', () => {
      const ratios = calculateRatios(stmt);
      expect(ratios.grossMargin).toBeCloseTo(0.4, 2);
      expect(ratios.netMargin).toBeCloseTo(0.15, 2);
      expect(ratios.roe).toBeCloseTo(0.075, 3);
      expect(ratios.roa).toBeCloseTo(0.03, 3);
    });

    it('should calculate liquidity ratios', () => {
      const ratios = calculateRatios(stmt);
      expect(ratios.currentRatio).toBeCloseTo(1.875, 2);
      expect(ratios.quickRatio).toBeGreaterThan(0);
      expect(ratios.cashRatio).toBeGreaterThan(0);
    });

    it('should calculate leverage ratios', () => {
      const ratios = calculateRatios(stmt);
      expect(ratios.debtToEquity).toBeCloseTo(1.5, 1);
      expect(ratios.debtToAssets).toBeCloseTo(0.6, 1);
      expect(ratios.interestCoverage).toBeGreaterThan(0);
    });

    it('should calculate per-share metrics', () => {
      const ratios = calculateRatios(stmt);
      expect(ratios.eps).toBeCloseTo(1.5, 1);
      expect(ratios.bookValuePerShare).toBeCloseTo(20, 0);
    });

    it('should handle zero denominators', () => {
      const zeroStmt = { ...stmt, totalAssets: 0, totalEquity: 0, totalLiabilities: 0, currentLiabilities: 0, revenue: 0, shares: 0 };
      const ratios = calculateRatios(zeroStmt);
      expect(ratios.roe).toBe(0);
      expect(ratios.currentRatio).toBe(0);
      expect(ratios.eps).toBe(0);
    });

    it('should calculate FCF per share', () => {
      const ratios = calculateRatios(stmt);
      expect(ratios.fcfPerShare).toBeCloseTo(1.7, 1);
    });
  });

  describe('calculateGrowthRates', () => {
    it('should calculate revenue growth', () => {
      const growth = calculateGrowthRates(stmt, prevStmt);
      expect(growth.revenueGrowth).toBeCloseTo(1/9, 2);
    });

    it('should calculate net income growth', () => {
      const growth = calculateGrowthRates(stmt, prevStmt);
      expect(growth.netIncomeGrowth).toBeCloseTo(0.25, 2);
    });

    it('should calculate EPS growth', () => {
      const growth = calculateGrowthRates(stmt, prevStmt);
      expect(growth.epsGrowth).toBeCloseTo(0.25, 2);
    });

    it('should handle zero previous values', () => {
      const zeroPrev = { ...prevStmt, revenue: 0, netIncome: 0, shares: 0 };
      const growth = calculateGrowthRates(stmt, zeroPrev);
      expect(growth.revenueGrowth).toBe(0);
      expect(growth.netIncomeGrowth).toBe(0);
    });
  });

  describe('performDuPontAnalysis', () => {
    it('should decompose ROE', () => {
      const dupont = performDuPontAnalysis(stmt);
      expect(dupont.roe).toBeCloseTo(dupont.netMargin * dupont.assetTurnover * dupont.equityMultiplier, 4);
    });

    it('should include breakdown', () => {
      const dupont = performDuPontAnalysis(stmt);
      expect(dupont.breakdown.profitability).toBe(dupont.netMargin);
      expect(dupont.breakdown.efficiency).toBe(dupont.assetTurnover);
      expect(dupont.breakdown.leverage).toBe(dupont.equityMultiplier);
    });

    it('should handle zero equity', () => {
      const zeroEquity = { ...stmt, totalEquity: 0 };
      const dupont = performDuPontAnalysis(zeroEquity);
      expect(dupont.equityMultiplier).toBe(1);
    });
  });

  describe('calculateQualityScore', () => {
    it('should return score between 0 and 100', () => {
      const score = calculateQualityScore(stmt, prevStmt);
      expect(score.totalScore).toBeGreaterThanOrEqual(0);
      expect(score.totalScore).toBeLessThanOrEqual(100);
    });

    it('should return valid grade', () => {
      const score = calculateQualityScore(stmt, prevStmt);
      expect(['A', 'B', 'C', 'D', 'F']).toContain(score.grade);
    });

    it('should include all sub-scores', () => {
      const score = calculateQualityScore(stmt, prevStmt);
      expect(score.profitabilityScore).toBeGreaterThanOrEqual(0);
      expect(score.growthScore).toBeGreaterThanOrEqual(0);
      expect(score.stabilityScore).toBeGreaterThanOrEqual(0);
      expect(score.cashFlowScore).toBeGreaterThanOrEqual(0);
    });

    it('should identify flags', () => {
      const badStmt = { ...stmt, netIncome: -1e8, operatingCashFlow: -1e8, totalLiabilities: 5e9 };
      const score = calculateQualityScore(badStmt, prevStmt);
      expect(score.flags.length).toBeGreaterThan(0);
    });

    it('should work without previous statement', () => {
      const score = calculateQualityScore(stmt);
      expect(score.totalScore).toBeGreaterThan(0);
    });

    it('should give high scores to quality companies', () => {
      const quality: FinancialStatement = {
        ...stmt,
        grossProfit: 6e8,
        netIncome: 3e8,
        operatingIncome: 3.5e8,
        totalLiabilities: 1e9,
        totalEquity: 4e9,
        currentAssets: 3e9,
        currentLiabilities: 5e8,
        operatingCashFlow: 4e8,
        capex: 5e7,
      };
      const score = calculateQualityScore(quality, prevStmt);
      expect(score.totalScore).toBeGreaterThan(50);
    });
  });

  describe('calculateAltmanZScore', () => {
    it('should calculate Z-Score', () => {
      const result = calculateAltmanZScore(stmt);
      expect(typeof result.zScore).toBe('number');
      expect(isFinite(result.zScore)).toBe(true);
    });

    it('should classify zone', () => {
      const result = calculateAltmanZScore(stmt);
      expect(['safe', 'grey', 'distress']).toContain(result.zone);
    });

    it('should detect safe companies', () => {
      const safe: FinancialStatement = {
        ...stmt,
        currentAssets: 5e9,
        currentLiabilities: 1e8,
        totalEquity: 4.5e9,
        totalLiabilities: 5e8,
        totalAssets: 5e9,
        operatingIncome: 1e9,
        revenue: 5e9,
      };
      const result = calculateAltmanZScore(safe);
      expect(result.zone).toBe('safe');
    });

    it('should detect distressed companies', () => {
      const distressed: FinancialStatement = {
        ...stmt,
        currentAssets: 5e8,
        currentLiabilities: 4e9,
        totalEquity: 5e8,
        totalLiabilities: 4.5e9,
        totalAssets: 5e9,
        operatingIncome: -1e8,
        revenue: 1e8,
      };
      const result = calculateAltmanZScore(distressed);
      expect(result.zone).toBe('distress');
    });
  });

  describe('calculatePiotroskiScore', () => {
    it('should return score between 0 and 9', () => {
      const result = calculatePiotroskiScore(stmt, prevStmt);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(9);
    });

    it('should include all 9 criteria', () => {
      const result = calculatePiotroskiScore(stmt, prevStmt);
      expect(result.criteria.length).toBe(9);
    });

    it('should mark each criterion', () => {
      const result = calculatePiotroskiScore(stmt, prevStmt);
      for (const c of result.criteria) {
        expect(typeof c.passed).toBe('boolean');
        expect(typeof c.name).toBe('string');
      }
    });
  });

  describe('calculateGrahamIntrinsicValue', () => {
    it('should calculate intrinsic value', () => {
      const value = calculateGrahamIntrinsicValue(2, 10);
      expect(value).toBeGreaterThan(0);
    });

    it('should return 0 for negative EPS', () => {
      expect(calculateGrahamIntrinsicValue(-1, 10)).toBe(0);
    });

    it('should return 0 for zero AAA yield', () => {
      expect(calculateGrahamIntrinsicValue(2, 10, 0)).toBe(0);
    });

    it('should use default AAA yield of 4.4', () => {
      const value1 = calculateGrahamIntrinsicValue(2, 10);
      const value2 = calculateGrahamIntrinsicValue(2, 10, 4.4);
      expect(value1).toBe(value2);
    });
  });

  describe('calculateFCFE', () => {
    it('should calculate free cash flow to equity', () => {
      const fcfe = calculateFCFE(stmt);
      expect(typeof fcfe).toBe('number');
      expect(isFinite(fcfe)).toBe(true);
    });

    it('should consider capex and interest', () => {
      const fcfe = calculateFCFE(stmt);
      const expected = stmt.operatingCashFlow - stmt.capex + stmt.financingCashFlow - stmt.interestExpense * 0.75;
      expect(fcfe).toBeCloseTo(expected, 0);
    });
  });

  describe('calculateWACC', () => {
    it('should calculate weighted average cost of capital', () => {
      const wacc = calculateWACC(0.6, 0.1, 0.4, 0.05);
      expect(wacc).toBeCloseTo(0.075, 3);
    });

    it('should use default tax rate', () => {
      const wacc = calculateWACC(0.5, 0.1, 0.5, 0.06);
      const expected = 0.5 * 0.1 + 0.5 * 0.06 * 0.75;
      expect(wacc).toBeCloseTo(expected, 4);
    });

    it('should handle custom tax rate', () => {
      const wacc = calculateWACC(0.5, 0.1, 0.5, 0.06, 0.15);
      const expected = 0.5 * 0.1 + 0.5 * 0.06 * 0.85;
      expect(wacc).toBeCloseTo(expected, 4);
    });
  });
});
