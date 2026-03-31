import { describe, it, expect } from 'vitest';
import {
  assessSTRisk,
  batchAssessSTRisk,
  calculateSTStatistics,
  type STStockInfo,
  type FinancialData,
} from '../utils/stDelistingRiskEngine';

function makeStock(overrides: Partial<STStockInfo> = {}): STStockInfo {
  return {
    code: '000001.SZ',
    name: '测试股票',
    currentStatus: 'normal',
    industry: '科技',
    marketCap: 50,
    stockPrice: 10,
    consecutiveLossYears: 0,
    latestFinancials: {
      revenue: 10,
      netProfit: 2,
      totalAssets: 30,
      totalLiabilities: 15,
      auditOpinion: 'unqualified',
      hasFraudRisk: false,
      relatedPartyTransactions: 0.5,
      operatingCashFlow: 3,
    },
    ...overrides,
  };
}

function makeFinancial(overrides: Partial<FinancialData> = {}): FinancialData {
  return {
    revenue: 10,
    netProfit: 2,
    totalAssets: 30,
    totalLiabilities: 15,
    auditOpinion: 'unqualified',
    hasFraudRisk: false,
    relatedPartyTransactions: 0.5,
    operatingCashFlow: 3,
    ...overrides,
  };
}

describe('stDelistingRiskEngine', () => {
  describe('assessSTRisk', () => {
    it('should assess a healthy stock as safe', () => {
      const stock = makeStock();
      const report = assessSTRisk(stock);
      expect(report.riskLevel).toBe('safe');
      expect(report.overallRiskScore).toBeLessThan(20);
    });

    it('should flag loss-making company', () => {
      const stock = makeStock({
        latestFinancials: makeFinancial({ netProfit: -2 }),
        consecutiveLossYears: 1,
      });
      const report = assessSTRisk(stock);
      expect(report.indicators.find(i => i.indicator === '净利润')?.isTriggered).toBe(true);
    });

    it('should flag low revenue', () => {
      const stock = makeStock({
        latestFinancials: makeFinancial({ revenue: 0.5 }),
      });
      const report = assessSTRisk(stock);
      expect(report.indicators.find(i => i.indicator === '营业收入')?.isTriggered).toBe(true);
    });

    it('should flag negative net assets', () => {
      const stock = makeStock({
        latestFinancials: makeFinancial({ totalAssets: 10, totalLiabilities: 15 }),
      });
      const report = assessSTRisk(stock);
      expect(report.indicators.find(i => i.indicator === '净资产')?.isTriggered).toBe(true);
    });

    it('should flag consecutive losses', () => {
      const stock = makeStock({ consecutiveLossYears: 3 });
      const report = assessSTRisk(stock);
      expect(report.indicators.find(i => i.indicator === '连续亏损年数')?.isTriggered).toBe(true);
    });

    it('should flag stock price below 1', () => {
      const stock = makeStock({ stockPrice: 0.8 });
      const report = assessSTRisk(stock);
      expect(report.indicators.find(i => i.indicator === '股价')?.isTriggered).toBe(true);
    });

    it('should flag bad audit opinion', () => {
      const stock = makeStock({
        latestFinancials: makeFinancial({ auditOpinion: 'disclaimer' }),
      });
      const report = assessSTRisk(stock);
      expect(report.indicators.find(i => i.indicator === '审计意见')?.isTriggered).toBe(true);
    });

    it('should flag fraud risk', () => {
      const stock = makeStock({
        latestFinancials: makeFinancial({ hasFraudRisk: true }),
      });
      const report = assessSTRisk(stock);
      expect(report.indicators.find(i => i.indicator === '财务造假风险')?.isTriggered).toBe(true);
    });

    it('should flag low market cap', () => {
      const stock = makeStock({ marketCap: 2 });
      const report = assessSTRisk(stock);
      expect(report.indicators.find(i => i.indicator === '总市值')?.isTriggered).toBe(true);
    });

    it('should flag high related party transactions', () => {
      const stock = makeStock({
        latestFinancials: makeFinancial({ relatedPartyTransactions: 5 }),
      });
      const report = assessSTRisk(stock);
      expect(report.indicators.find(i => i.indicator === '关联交易占比')?.isTriggered).toBe(true);
    });

    it('should assign critical risk for multiple issues', () => {
      const stock = makeStock({
        stockPrice: 0.7,
        marketCap: 2,
        consecutiveLossYears: 3,
        latestFinancials: makeFinancial({
          netProfit: -5,
          revenue: 0.3,
          totalAssets: 10,
          totalLiabilities: 20,
          auditOpinion: 'disclaimer',
          hasFraudRisk: true,
        }),
      });
      const report = assessSTRisk(stock);
      expect(report.riskLevel).toBe('critical');
      expect(report.overallRiskScore).toBeGreaterThan(70);
    });

    it('should evaluate delisting risk', () => {
      const stock = makeStock();
      const report = assessSTRisk(stock);
      expect(report.delistingRisk.overallDelistingRisk).toBeGreaterThanOrEqual(0);
      expect(report.delistingRisk.overallDelistingRisk).toBeLessThanOrEqual(1);
    });

    it('should evaluate recovery potential', () => {
      const stock = makeStock();
      const report = assessSTRisk(stock);
      expect(report.recoveryAnalysis.canRemoveST).toBe(true);
      expect(report.recoveryAnalysis.keyMetrics.length).toBeGreaterThan(0);
    });

    it('should generate alert signals', () => {
      const stock = makeStock({
        latestFinancials: makeFinancial({ netProfit: -3 }),
        consecutiveLossYears: 2,
      });
      const report = assessSTRisk(stock);
      expect(report.alertSignals.length).toBeGreaterThan(0);
    });

    it('should provide recommendation', () => {
      const stock = makeStock();
      const report = assessSTRisk(stock);
      expect(report.recommendation.length).toBeGreaterThan(0);
    });
  });

  describe('batchAssessSTRisk', () => {
    it('should sort by risk score descending', () => {
      const stocks = [
        makeStock({ code: '001', name: '安全', latestFinancials: makeFinancial() }),
        makeStock({
          code: '002', name: '危险',
          latestFinancials: makeFinancial({ netProfit: -5, revenue: 0.3, auditOpinion: 'disclaimer' }),
          consecutiveLossYears: 3,
        }),
        makeStock({
          code: '003', name: '一般',
          latestFinancials: makeFinancial({ netProfit: -1 }),
        }),
      ];
      const reports = batchAssessSTRisk(stocks);
      expect(reports[0].overallRiskScore).toBeGreaterThanOrEqual(reports[1].overallRiskScore);
      expect(reports[1].overallRiskScore).toBeGreaterThanOrEqual(reports[2].overallRiskScore);
    });
  });

  describe('calculateSTStatistics', () => {
    it('should calculate distribution', () => {
      const stocks = [
        makeStock({ code: '001' }),
        makeStock({
          code: '002',
          latestFinancials: makeFinancial({ netProfit: -5, revenue: 0.3, auditOpinion: 'adverse' }),
          consecutiveLossYears: 3,
        }),
      ];
      const reports = batchAssessSTRisk(stocks);
      const stats = calculateSTStatistics(reports);
      expect(stats.totalStocks).toBe(2);
      expect(stats.riskDistribution).toBeDefined();
      expect(stats.highRiskRatio).toBeGreaterThanOrEqual(0);
    });

    it('should list top risk stocks', () => {
      const stocks = Array.from({ length: 15 }, (_, i) =>
        makeStock({
          code: `00${i}`,
          latestFinancials: makeFinancial({ netProfit: -i * 0.5 }),
          consecutiveLossYears: Math.min(i, 3),
        })
      );
      const reports = batchAssessSTRisk(stocks);
      const stats = calculateSTStatistics(reports);
      expect(stats.topRiskStocks.length).toBeLessThanOrEqual(10);
    });
  });
});
