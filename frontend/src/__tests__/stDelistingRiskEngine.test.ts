import { describe, it, expect } from 'vitest';
import {
  assessSTRisk,
  batchAssessSTRisk,
  calculateSTStatistics,
  type STStockInfo,
  type FinancialData,
} from '../utils/stDelistingRiskEngine';

/**
 * ST/退市风险预警引擎测试 (导入真实模块)
 */

function makeStock(overrides: Partial<STStockInfo> = {}): STStockInfo {
  const baseFin: FinancialData = {
    revenue: 50,
    netProfit: 5,
    totalAssets: 100,
    totalLiabilities: 40,
    auditOpinion: 'unqualified',
    hasFraudRisk: false,
    relatedPartyTransactions: 0,
    operatingCashFlow: 3,
  };
  return {
    code: '000001',
    name: 'Test',
    currentStatus: 'normal',
    industry: 'Tech',
    marketCap: 10,
    stockPrice: 10,
    consecutiveLossYears: 0,
    latestFinancials: baseFin,
    ...overrides,
  };
}

describe('ST退市风险预警引擎', () => {
  describe('assessSTRisk', () => {
    it('should return safe/low risk for healthy stock', () => {
      const result = assessSTRisk(makeStock());
      expect(result.overallRiskScore).toBe(0);
      expect(result.riskLevel).toBe('safe');
      expect(result.triggerProbability).toBe(0);
      expect(result.indicators).toHaveLength(10);
    });

    it('should flag consecutive losses', () => {
      const result = assessSTRisk(makeStock({ consecutiveLossYears: 3 }));
      const ind = result.indicators.find(i => i.indicator === '连续亏损年数');
      expect(ind?.isTriggered).toBe(true);
      expect(ind?.severity).toBe('critical');
      expect(result.overallRiskScore).toBeGreaterThanOrEqual(20);
    });

    it('should flag low revenue', () => {
      const result = assessSTRisk(makeStock({
        latestFinancials: {
          revenue: 0.5, netProfit: -1, totalAssets: 100, totalLiabilities: 40,
          auditOpinion: 'unqualified', hasFraudRisk: false,
          relatedPartyTransactions: 0, operatingCashFlow: 0,
        },
      }));
      const ind = result.indicators.find(i => i.indicator === '营业收入');
      expect(ind?.isTriggered).toBe(true);
      expect(ind?.severity).toBe('high');
    });

    it('should flag insolvency (negative net assets)', () => {
      const result = assessSTRisk(makeStock({
        latestFinancials: {
          revenue: 10, netProfit: 1, totalAssets: 50, totalLiabilities: 80,
          auditOpinion: 'unqualified', hasFraudRisk: false,
          relatedPartyTransactions: 0, operatingCashFlow: 0,
        },
      }));
      const ind = result.indicators.find(i => i.indicator === '净资产');
      expect(ind?.isTriggered).toBe(true);
      expect(ind?.severity).toBe('critical');
    });

    it('should be critical for multiple triggers', () => {
      const result = assessSTRisk(makeStock({
        consecutiveLossYears: 3,
        stockPrice: 0.5,
        latestFinancials: {
          revenue: 0.5, netProfit: -2, totalAssets: 50, totalLiabilities: 80,
          auditOpinion: 'adverse', hasFraudRisk: true,
          relatedPartyTransactions: 10, operatingCashFlow: -1,
        },
      }));
      expect(result.riskLevel).toBe('critical');
      expect(result.triggerProbability).toBeGreaterThan(0);
      expect(result.delistingRisk.overallDelistingRisk).toBeGreaterThan(0);
    });

    it('should compute delisting risk for sub-1 yuan price', () => {
      const result = assessSTRisk(makeStock({ stockPrice: 0.5, marketCap: 2 }));
      expect(result.delistingRisk.transactionDelistingRisk).toBeGreaterThan(0);
    });
  });

  describe('batchAssessSTRisk', () => {
    it('should sort by risk score descending', () => {
      const reports = batchAssessSTRisk([
        makeStock({ code: 'A' }),
        makeStock({ code: 'B', consecutiveLossYears: 3, stockPrice: 0.5 }),
      ]);
      expect(reports).toHaveLength(2);
      expect(reports[0].overallRiskScore).toBeGreaterThanOrEqual(reports[1].overallRiskScore);
    });
  });

  describe('calculateSTStatistics', () => {
    it('should aggregate risk distribution', () => {
      const reports = calculateSTStatistics([
        assessSTRisk(makeStock({ code: 'A' })),
        assessSTRisk(makeStock({ code: 'B', consecutiveLossYears: 3, stockPrice: 0.5 })),
      ]);
      expect(reports.totalStocks).toBe(2);
      expect(reports.riskDistribution).toHaveProperty('safe');
      expect(reports.riskDistribution).toHaveProperty('critical');
      expect(reports.highRiskRatio).toBeGreaterThanOrEqual(0);
      expect(reports.highRiskRatio).toBeLessThanOrEqual(1);
    });
  });
});
