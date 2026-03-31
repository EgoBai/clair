import { describe, it, expect } from 'vitest';
import { altmanZScore, financialWarningAnalysis, FinancialData } from '../utils/financialWarningEngine';

describe('财务预警雷达引擎', () => {
  const data: FinancialData = {
    totalAssets: 100000,
    totalLiabilities: 40000,
    currentAssets: 30000,
    currentLiabilities: 20000,
    retainedEarnings: 15000,
    ebit: 8000,
    marketCap: 120000,
    sales: 50000,
    netIncome: 5000,
    operatingCashFlow: 6000,
    revenue: 50000,
    grossProfit: 20000,
    inventory: 5000,
    receivables: 8000,
    previousRevenue: 45000,
    previousNetIncome: 4500,
  };

  describe('altmanZScore', () => {
    it('should calculate Z-Score', () => {
      const z = altmanZScore(data);
      expect(typeof z).toBe('number');
      expect(z).toBeGreaterThan(0);
    });

    it('should return higher score for healthier company', () => {
      const healthy: FinancialData = { ...data, totalLiabilities: 10000, ebit: 15000 };
      const distressed: FinancialData = { ...data, totalLiabilities: 90000, ebit: 1000 };
      expect(altmanZScore(healthy)).toBeGreaterThan(altmanZScore(distressed));
    });
  });

  describe('financialWarningAnalysis', () => {
    it('should classify Z-Score zone', () => {
      const result = financialWarningAnalysis(data);
      expect(['safe', 'grey', 'distress']).toContain(result.zScoreZone);
    });

    it('should assign Altman grade', () => {
      const result = financialWarningAnalysis(data);
      expect(['A', 'B', 'C', 'D', 'F']).toContain(result.altmanGrade);
    });

    it('should generate warnings', () => {
      const result = financialWarningAnalysis(data);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('should calculate health score', () => {
      const result = financialWarningAnalysis(data);
      expect(result.healthScore).toBeGreaterThanOrEqual(0);
      expect(result.healthScore).toBeLessThanOrEqual(100);
    });

    it('should determine risk level', () => {
      const result = financialWarningAnalysis(data);
      expect(['low', 'medium', 'high', 'critical']).toContain(result.riskLevel);
    });

    it('should provide detail breakdown', () => {
      const result = financialWarningAnalysis(data);
      expect(result.details.liquidity).toBeGreaterThanOrEqual(0);
      expect(result.details.leverage).toBeGreaterThanOrEqual(0);
      expect(result.details.profitability).toBeGreaterThanOrEqual(0);
    });

    it('should warn on negative cash flow', () => {
      const bad: FinancialData = { ...data, operatingCashFlow: -1000, netIncome: -500 };
      const result = financialWarningAnalysis(bad);
      expect(result.warnings.some(w => w.category === '现金流')).toBe(true);
    });

    it('should warn on high debt', () => {
      const leveraged: FinancialData = { ...data, totalLiabilities: 80000 };
      const result = financialWarningAnalysis(leveraged);
      expect(result.warnings.some(w => w.category === '杠杆')).toBe(true);
    });
  });
});
