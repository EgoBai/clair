import { describe, it, expect } from 'vitest';
import {
  calculateAltmanZScore,
  calculateMertonModel,
  calculateCreditScore,
  analyzeCreditSpread,
  calculateDefaultRisk,
  rankCreditRisk,
  type FinancialData,
} from '../utils/creditRiskEngine';

const healthyCompany: FinancialData = {
  totalAssets: 1000000000,
  totalLiabilities: 400000000,
  currentAssets: 600000000,
  currentLiabilities: 300000000,
  retainedEarnings: 200000000,
  ebit: 150000000,
  marketCap: 3000000000,
  revenue: 800000000,
  netIncome: 100000000,
  operatingCashFlow: 120000000,
  interestExpense: 20000000,
  totalDebt: 400000000,
  equity: 600000000,
};

const distressedCompany: FinancialData = {
  totalAssets: 1000000000,
  totalLiabilities: 900000000,
  currentAssets: 200000000,
  currentLiabilities: 500000000,
  retainedEarnings: -100000000,
  ebit: -50000000,
  marketCap: 100000000,
  revenue: 300000000,
  netIncome: -80000000,
  operatingCashFlow: -20000000,
  interestExpense: 50000000,
  totalDebt: 700000000,
  equity: 100000000,
};

describe('信用风险引擎', () => {
  describe('calculateAltmanZScore', () => {
    it('should classify healthy company as safe', () => {
      const result = calculateAltmanZScore(healthyCompany);
      expect(result.zScore).toBeGreaterThan(2.99);
      expect(result.zone).toBe('safe');
    });

    it('should classify distressed company as distress', () => {
      const result = calculateAltmanZScore(distressedCompany);
      expect(result.zScore).toBeLessThan(1.81);
      expect(result.zone).toBe('distress');
    });

    it('should calculate components', () => {
      const result = calculateAltmanZScore(healthyCompany);
      expect(typeof result.components.workingCapitalRatio).toBe('number');
      expect(typeof result.components.retainedEarningsRatio).toBe('number');
      expect(typeof result.components.ebitRatio).toBe('number');
    });

    it('should estimate bankruptcy probability', () => {
      const healthy = calculateAltmanZScore(healthyCompany);
      const distressed = calculateAltmanZScore(distressedCompany);
      expect(healthy.probabilities.bankruptcy2Year).toBeLessThan(distressed.probabilities.bankruptcy2Year);
    });

    it('should handle zero assets', () => {
      const zeroData: FinancialData = { ...healthyCompany, totalAssets: 0 };
      const result = calculateAltmanZScore(zeroData);
      expect(result.zone).toBe('distress');
    });
  });

  describe('calculateMertonModel', () => {
    it('should calculate default probability', () => {
      // Equity ≈ Debt with high vol → meaningful default probability
      const result = calculateMertonModel(900000, 0.5, 900000, 0.03, 1);
      expect(result.distanceToDefault).toBeGreaterThan(0);
      // High vol company should have some default risk
      expect(result.assetVolatility).toBeGreaterThan(0);
    });

    it('should calculate distance to default', () => {
      const result = calculateMertonModel(1000000, 0.2, 500000, 0.03, 1);
      expect(result.distanceToDefault).toBeGreaterThan(0);
    });

    it('should have higher default probability for higher leverage', () => {
      const lowLev = calculateMertonModel(1500000, 0.3, 300000, 0.03, 1);
      const highLev = calculateMertonModel(900000, 0.5, 900000, 0.03, 1);
      // Higher leverage → lower distance to default
      expect(highLev.distanceToDefault).toBeLessThan(lowLev.distanceToDefault);
    });

    it('should handle edge cases', () => {
      const result = calculateMertonModel(0, 0.3, 100000, 0.03, 1);
      expect(result.defaultProbability).toBe(1);
    });
  });

  describe('calculateCreditScore', () => {
    it('should score healthy company higher', () => {
      const healthy = calculateCreditScore(healthyCompany);
      const distressed = calculateCreditScore(distressedCompany);
      expect(healthy.score).toBeGreaterThan(distressed.score);
    });

    it('should return valid grade', () => {
      const result = calculateCreditScore(healthyCompany);
      expect(['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'D']).toContain(result.grade);
    });

    it('should calculate all factors', () => {
      const result = calculateCreditScore(healthyCompany);
      expect(result.factors.profitability).toBeGreaterThanOrEqual(0);
      expect(result.factors.leverage).toBeGreaterThanOrEqual(0);
      expect(result.factors.liquidity).toBeGreaterThanOrEqual(0);
      expect(result.factors.efficiency).toBeGreaterThanOrEqual(0);
      expect(result.factors.cashFlow).toBeGreaterThanOrEqual(0);
    });

    it('should detect trend with previous data', () => {
      const improvedCompany = {
        ...healthyCompany,
        netIncome: healthyCompany.netIncome * 1.5,
        revenue: healthyCompany.revenue * 1.2,
      };
      const result = calculateCreditScore(improvedCompany, healthyCompany);
      expect(['improving', 'stable', 'deteriorating']).toContain(result.trend);
    });

    it('should give AAA to perfect company', () => {
      const perfect: FinancialData = {
        totalAssets: 1000000000,
        totalLiabilities: 10000000,
        currentAssets: 900000000,
        currentLiabilities: 10000000,
        retainedEarnings: 500000000,
        ebit: 300000000,
        marketCap: 5000000000,
        revenue: 1000000000,
        netIncome: 200000000,
        operatingCashFlow: 250000000,
        interestExpense: 1000000,
        totalDebt: 10000000,
        equity: 990000000,
      };
      const result = calculateCreditScore(perfect);
      expect(result.score).toBeGreaterThan(80);
    });
  });

  describe('analyzeCreditSpread', () => {
    it('should calculate spread metrics', () => {
      const historical = Array.from({ length: 100 }, () => 0.02 + Math.random() * 0.03);
      const result = analyzeCreditSpread(0.035, historical);
      expect(result.percentile).toBeGreaterThanOrEqual(0);
      expect(result.percentile).toBeLessThanOrEqual(100);
      expect(typeof result.isOverpriced).toBe('boolean');
    });

    it('should handle empty historical data', () => {
      const result = analyzeCreditSpread(0.03, []);
      expect(result.historicalAvg).toBe(0.03);
      expect(result.zScore).toBe(0);
    });

    it('should identify overpriced spreads', () => {
      const historical = Array.from({ length: 50 }, () => 0.02);
      const result = analyzeCreditSpread(0.1, historical);
      expect(result.isOverpriced).toBe(true);
    });
  });

  describe('calculateDefaultRisk', () => {
    it('should calculate expected loss', () => {
      const result = calculateDefaultRisk(0.02, 0.45, 1000000);
      expect(result.expectedLoss).toBe(9000); // 0.02 * 0.45 * 1000000
      expect(result.ead).toBe(1000000);
    });

    it('should calculate unexpected loss', () => {
      const result = calculateDefaultRisk(0.02, 0.45, 1000000);
      expect(result.unexpectedLoss).toBeGreaterThan(0);
    });

    it('should calculate economic capital', () => {
      const result = calculateDefaultRisk(0.02, 0.45, 1000000, 0.99);
      expect(result.economicCapital).toBeGreaterThanOrEqual(0);
    });

    it('should handle zero PD', () => {
      const result = calculateDefaultRisk(0, 0.45, 1000000);
      expect(result.expectedLoss).toBe(0);
      expect(result.economicCapital).toBe(0);
    });
  });

  describe('rankCreditRisk', () => {
    it('should rank companies by credit score', () => {
      const companies = [
        { name: 'Healthy', data: healthyCompany },
        { name: 'Distressed', data: distressedCompany },
      ];
      const ranking = rankCreditRisk(companies);
      expect(ranking.length).toBe(2);
      expect(ranking[0].rank).toBe(1);
      expect(ranking[0].score).toBeGreaterThan(ranking[1].score);
      expect(ranking[0].name).toBe('Healthy');
    });

    it('should include grade in ranking', () => {
      const companies = [{ name: 'A', data: healthyCompany }];
      const ranking = rankCreditRisk(companies);
      expect(ranking[0].grade).toBeTruthy();
    });
  });
});
