import { describe, it, expect } from 'vitest';
import {
  analyzeIPOReturns,
  analyzeIPOValuation,
  analyzeSubscription,
  analyzeBreakRisk,
  analyzeLockup,
  analyzeIPOMarketSentiment,
  calculateIPOScore,
  type IPOInfo,
} from '../utils/ipoAnalysisEngine';

function makeIPO(overrides: Partial<IPOInfo> = {}): IPOInfo {
  return {
    code: '300001.SZ',
    name: '测试新股',
    issuePrice: 20,
    issuePE: 30,
    industryPE: 40,
    issueDate: '2025-03-01',
    totalShares: 5000,
    onlineSubscriptionRatio: 0.0003,
    offlineSubscriptionRatio: 0.7,
    overSubscriptionRatio: 300,
    leadUnderwriter: '中信证券',
    industry: '科技',
    market: 'gem',
    profitability: true,
    revenue: 10,
    netProfit: 2,
    useOfProceeds: ['研发中心', '补充流动资金'],
    ...overrides,
  };
}

describe('ipoAnalysisEngine', () => {
  describe('analyzeIPOReturns', () => {
    it('should calculate first day return', () => {
      const ipo = makeIPO();
      const result = analyzeIPOReturns(ipo, {
        firstDayClose: 40, firstDayHigh: 45, firstDayLow: 35,
        firstDayVolume: 1000000, totalShares: 5000, currentPrice: 38, breakDay: -1, maxDrawdown: 0.15,
      });
      expect(result.firstDayReturn).toBe(1); // (40-20)/20 = 1
      expect(result.bestReturn).toBe(1.25); // (45-20)/20
    });

    it('should calculate turnover rate', () => {
      const ipo = makeIPO();
      const result = analyzeIPOReturns(ipo, {
        firstDayClose: 30, firstDayHigh: 35, firstDayLow: 25,
        firstDayVolume: 500000, totalShares: 5000, currentPrice: 30, breakDay: -1, maxDrawdown: 0.1,
      });
      expect(result.firstDayTurnover).toBeGreaterThan(0);
      expect(result.firstDayTurnover).toBeLessThanOrEqual(1);
    });

    it('should track break day', () => {
      const ipo = makeIPO();
      const result = analyzeIPOReturns(ipo, {
        firstDayClose: 22, firstDayHigh: 25, firstDayLow: 19,
        firstDayVolume: 300000, totalShares: 5000, currentPrice: 18, breakDay: 15, maxDrawdown: 0.3,
      });
      expect(result.daysToBreak).toBe(15);
      expect(result.currentVsIssue).toBe(-0.1); // (18-20)/20
    });
  });

  describe('analyzeIPOValuation', () => {
    it('should detect underpriced IPO', () => {
      const ipo = makeIPO({ issuePE: 25, industryPE: 50 });
      const val = analyzeIPOValuation(ipo, [{ name: 'comp1', pe: 45 }, { name: 'comp2', pe: 55 }]);
      expect(val.valuationRating).toBe('underpriced');
      expect(val.pePremium).toBeLessThan(0);
    });

    it('should detect overpriced IPO', () => {
      const ipo = makeIPO({ issuePE: 55, industryPE: 40 });
      const val = analyzeIPOValuation(ipo, []);
      expect(val.valuationRating).toBe('overpriced');
      expect(val.pePremium).toBeGreaterThan(0);
    });

    it('should detect bubble IPO', () => {
      const ipo = makeIPO({ issuePE: 100, industryPE: 30 });
      const val = analyzeIPOValuation(ipo, []);
      expect(val.valuationRating).toBe('bubble');
    });

    it('should calculate fair value range', () => {
      const ipo = makeIPO();
      const val = analyzeIPOValuation(ipo, []);
      expect(val.fairValueRange.low).toBeLessThan(val.fairValueRange.high);
      expect(val.fairValueRange.low).toBeGreaterThan(0);
    });
  });

  describe('analyzeSubscription', () => {
    it('should recommend strong_apply for good IPOs', () => {
      const ipo = makeIPO({ issuePE: 10, industryPE: 50, onlineSubscriptionRatio: 0.05, issuePrice: 50 });
      const result = analyzeSubscription(ipo, 0.05);
      expect(['strong_apply', 'apply', 'neutral']).toContain(result.recommendation);
    });

    it('should recommend skip for bad IPOs', () => {
      const ipo = makeIPO({ issuePE: 100, industryPE: 30, onlineSubscriptionRatio: 0.0001 });
      const result = analyzeSubscription(ipo, 0.6);
      expect(['skip', 'neutral']).toContain(result.recommendation);
    });

    it('should include reasoning', () => {
      const ipo = makeIPO();
      const result = analyzeSubscription(ipo, 0.1);
      expect(result.reasoning.length).toBeGreaterThan(0);
    });

    it('should calculate capital efficiency', () => {
      const ipo = makeIPO();
      const result = analyzeSubscription(ipo, 0.1);
      expect(typeof result.capitalEfficiency).toBe('number');
    });
  });

  describe('analyzeBreakRisk', () => {
    it('should identify break factors', () => {
      const ipo = makeIPO({ issuePE: 80, industryPE: 30, profitability: false });
      const result = analyzeBreakRisk(ipo, { similarIPOs: 50, similarBreakRate: 0.3 });
      expect(result.breakFactors.length).toBeGreaterThan(0);
    });

    it('should identify protection factors', () => {
      const ipo = makeIPO({ issuePE: 15, industryPE: 40, overSubscriptionRatio: 800 });
      const result = analyzeBreakRisk(ipo, { similarIPOs: 30, similarBreakRate: 0.1 });
      expect(result.protectionFactors.length).toBeGreaterThan(0);
    });

    it('should calculate break probability 0-1', () => {
      const ipo = makeIPO();
      const result = analyzeBreakRisk(ipo, { similarIPOs: 50, similarBreakRate: 0.2 });
      expect(result.breakProbability).toBeGreaterThanOrEqual(0);
      expect(result.breakProbability).toBeLessThanOrEqual(1);
    });

    it('should assign risk score 0-100', () => {
      const ipo = makeIPO();
      const result = analyzeBreakRisk(ipo, { similarIPOs: 50, similarBreakRate: 0.2 });
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
    });
  });

  describe('analyzeLockup', () => {
    it('should calculate lockup ratio', () => {
      const ipo = makeIPO();
      const result = analyzeLockup(ipo, {
        lockupShares: 3000, totalShares: 5000,
        unlockDate: '2026-06-01', currentPrice: 40,
      });
      expect(result.lockupRatio).toBe(0.6);
    });

    it('should assess pressure', () => {
      const ipo = makeIPO({ issuePrice: 10 });
      const result = analyzeLockup(ipo, {
        lockupShares: 4000, totalShares: 5000,
        unlockDate: '2025-05-01', currentPrice: 50,
      });
      expect(result.expectedPressure).toBeGreaterThan(0.5);
      expect(result.profitMultiple).toBe(5);
    });

    it('should determine risk level', () => {
      const ipo = makeIPO({ issuePrice: 10 });
      const result = analyzeLockup(ipo, {
        lockupShares: 500, totalShares: 5000,
        unlockDate: '2027-01-01', currentPrice: 15,
      });
      expect(['low', 'medium', 'high', 'critical']).toContain(result.riskLevel);
    });

    it('should provide recommendation', () => {
      const ipo = makeIPO();
      const result = analyzeLockup(ipo, {
        lockupShares: 2000, totalShares: 5000,
        unlockDate: '2026-09-01', currentPrice: 30,
      });
      expect(result.recommendation.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeIPOMarketSentiment', () => {
    it('should analyze market sentiment', () => {
      const records = [
        { firstDayReturn: 0.8, oversubscription: 500, industry: '科技', breakDay: -1 },
        { firstDayReturn: 0.5, oversubscription: 300, industry: '医药', breakDay: -1 },
        { firstDayReturn: -0.1, oversubscription: 80, industry: '制造', breakDay: 5 },
      ];
      const result = analyzeIPOMarketSentiment(records);
      expect(result.totalIPOs).toBe(3);
      expect(result.breakRate).toBeCloseTo(1 / 3, 1);
    });

    it('should identify best and worst sectors', () => {
      const records = [
        { firstDayReturn: 1.0, oversubscription: 500, industry: '科技', breakDay: -1 },
        { firstDayReturn: 0.1, oversubscription: 100, industry: '制造', breakDay: -1 },
      ];
      const result = analyzeIPOMarketSentiment(records);
      expect(result.bestSector).toBe('科技');
      expect(result.worstSector).toBe('制造');
    });

    it('should determine sentiment', () => {
      const records = Array.from({ length: 10 }, () => ({
        firstDayReturn: 0.8, oversubscription: 600, industry: '科技', breakDay: -1,
      }));
      const result = analyzeIPOMarketSentiment(records);
      expect(result.marketSentiment).toBe('hot');
    });

    it('should handle empty data', () => {
      const result = analyzeIPOMarketSentiment([]);
      expect(result.totalIPOs).toBe(0);
      expect(result.marketSentiment).toBe('frozen');
    });
  });

  describe('calculateIPOScore', () => {
    it('should score good IPO highly', () => {
      const ipo = makeIPO({ issuePE: 15, industryPE: 50 });
      const val = analyzeIPOValuation(ipo, []);
      const breakAnalysis = analyzeBreakRisk(ipo, { similarIPOs: 50, similarBreakRate: 0.05 });
      const sub = analyzeSubscription(ipo, 0.05);
      const result = calculateIPOScore(val, breakAnalysis, sub);
      expect(result.score).toBeGreaterThan(50);
    });

    it('should score bad IPO lowly', () => {
      const ipo = makeIPO({ issuePE: 100, industryPE: 30, profitability: false });
      const val = analyzeIPOValuation(ipo, []);
      const breakAnalysis = analyzeBreakRisk(ipo, { similarIPOs: 50, similarBreakRate: 0.6 });
      const sub = analyzeSubscription(ipo, 0.6);
      const result = calculateIPOScore(val, breakAnalysis, sub);
      expect(result.score).toBeLessThan(50);
    });

    it('should return grade A-F', () => {
      const ipo = makeIPO();
      const val = analyzeIPOValuation(ipo, []);
      const breakAnalysis = analyzeBreakRisk(ipo, { similarIPOs: 50, similarBreakRate: 0.2 });
      const sub = analyzeSubscription(ipo, 0.1);
      const result = calculateIPOScore(val, breakAnalysis, sub);
      expect(['A+', 'A', 'B+', 'B', 'C', 'D', 'F']).toContain(result.grade);
    });

    it('should include highlights', () => {
      const ipo = makeIPO();
      const val = analyzeIPOValuation(ipo, []);
      const breakAnalysis = analyzeBreakRisk(ipo, { similarIPOs: 50, similarBreakRate: 0.2 });
      const sub = analyzeSubscription(ipo, 0.1);
      const result = calculateIPOScore(val, breakAnalysis, sub);
      expect(result.highlights.length).toBeGreaterThan(0);
    });
  });
});
