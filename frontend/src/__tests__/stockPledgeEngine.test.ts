import { describe, it, expect } from 'vitest';
import {
  calculatePledgeRisk,
  runPledgeStressTest,
  generateMarketOverview,
  analyzeExpiryRisk,
  analyzePledgorBehavior,
  type PledgeRecord,
} from '../utils/stockPledgeEngine';

function makePledgeRecord(overrides: Partial<PledgeRecord> = {}): PledgeRecord {
  return {
    ticker: '600519',
    pledgor: '张三',
    pledgorType: 'controller',
    pledgee: '中信证券',
    pledgeeType: 'broker',
    shares: 1000000,
    totalShares: 10000000,
    startDate: '2025-01-01',
    endDate: '2026-12-31',
    status: 'active',
    pledgePrice: 1500,
    currentPrice: 1400,
    warningLine: 1200,
    closeLine: 1000,
    purpose: 'financing',
    ...overrides,
  };
}

describe('Stock Pledge Engine', () => {
  describe('calculatePledgeRisk', () => {
    it('should return null for empty records', () => {
      expect(calculatePledgeRisk([])).toBeNull();
    });

    it('should calculate basic risk metrics', () => {
      const records = [makePledgeRecord()];
      const result = calculatePledgeRisk(records);

      expect(result).not.toBeNull();
      expect(result!.ticker).toBe('600519');
      expect(result!.pledgeRatio).toBe(0.1); // 1M / 10M
      expect(result!.totalPledgedShares).toBe(1000000);
      expect(result!.riskLevel).toBe('attention');
    });

    it('should mark high pledge ratio as dangerous', () => {
      const records = [
        makePledgeRecord({ shares: 7000000 }),
      ];
      const result = calculatePledgeRisk(records);
      expect(result!.riskLevel).toBe('danger');
      expect(result!.pledgeRatio).toBe(0.7);
    });

    it('should detect critical risk near close line', () => {
      const records = [
        makePledgeRecord({
          shares: 5000000,
          currentPrice: 1010,
          closeLine: 1000,
        }),
      ];
      const result = calculatePledgeRisk(records);
      expect(result!.marginOfSafety).toBeCloseTo(0.01, 2);
      expect(result!.riskScore).toBeGreaterThan(50);
    });

    it('should handle multiple pledges from same pledgor', () => {
      const records = [
        makePledgeRecord({ shares: 2000000 }),
        makePledgeRecord({ shares: 1500000, pledgee: '招商银行', pledgeeType: 'bank' }),
      ];
      const result = calculatePledgeRisk(records);
      expect(result!.totalPledgedShares).toBe(3500000);
      expect(result!.pledgorConcentration).toBe(1); // same pledgor
    });

    it('should count upcoming expiries', () => {
      const soon = new Date();
      soon.setDate(soon.getDate() + 30);
      const records = [
        makePledgeRecord({ endDate: soon.toISOString().slice(0, 10) }),
      ];
      const result = calculatePledgeRisk(records);
      expect(result!.upcomingExpiry).toBe(1);
    });
  });

  describe('runPledgeStressTest', () => {
    it('should return null for no active records', () => {
      const records = [makePledgeRecord({ status: 'released' })];
      expect(runPledgeStressTest(records)).toBeNull();
    });

    it('should run stress test with default drops', () => {
      const records = [makePledgeRecord()];
      const result = runPledgeStressTest(records);

      expect(result).not.toBeNull();
      expect(result!.scenarios).toHaveLength(5);
      expect(result!.scenarios[0].priceDrop).toBe(0.05);
      expect(result!.scenarios[4].priceDrop).toBe(0.3);
    });

    it('should detect breach of close line', () => {
      const records = [
        makePledgeRecord({ currentPrice: 1100, closeLine: 1000 }),
      ];
      const result = runPledgeStressTest(records);

      // 10% drop → price 990, below closeLine 1000
      const scenario = result!.scenarios.find(s => s.priceDrop === 0.1);
      expect(scenario!.sharesAtRisk).toBe(1000000);
      expect(scenario!.riskLevel).toBe('触碰平仓线');
    });

    it('should support custom price drops', () => {
      const records = [makePledgeRecord()];
      const result = runPledgeStressTest(records, [0.1, 0.5]);
      expect(result!.scenarios).toHaveLength(2);
    });
  });

  describe('generateMarketOverview', () => {
    it('should generate overview for multiple tickers', () => {
      const records = [
        makePledgeRecord({ ticker: '600519', shares: 5000000 }),
        makePledgeRecord({ ticker: '000858', shares: 3000000, totalShares: 8000000 }),
      ];
      const overview = generateMarketOverview(records);

      expect(overview.totalPledgedCompanies).toBe(2);
      expect(overview.topRiskStocks.length).toBeGreaterThan(0);
      expect(overview.sectorDistribution.length).toBeGreaterThan(0);
    });

    it('should count high risk companies', () => {
      const records = [
        makePledgeRecord({ ticker: 'HIGH', shares: 8000000 }), // 80% pledge
      ];
      const overview = generateMarketOverview(records);
      expect(overview.highRiskCount).toBe(1);
    });

    it('should determine trend direction', () => {
      const records = [
        makePledgeRecord({ shares: 2000000 }), // 20%
      ];
      const overview = generateMarketOverview(records);
      expect(['increasing', 'stable', 'decreasing']).toContain(overview.trendDirection);
    });
  });

  describe('analyzeExpiryRisk', () => {
    it('should separate soon and expired records', () => {
      const pastDate = '2025-01-01';
      const futureDate = '2026-06-01';
      const records = [
        makePledgeRecord({ endDate: pastDate, status: 'active' }),
        makePledgeRecord({ endDate: futureDate, status: 'active' }),
      ];
      const result = analyzeExpiryRisk(records, 365);

      expect(result.expired.length).toBeGreaterThan(0);
      expect(result.soon.length).toBeGreaterThan(0);
    });

    it('should sort by end date', () => {
      const records = [
        makePledgeRecord({ endDate: '2026-08-01' }),
        makePledgeRecord({ endDate: '2026-05-01' }),
      ];
      const result = analyzeExpiryRisk(records, 365);
      if (result.soon.length >= 2) {
        expect(new Date(result.soon[0].endDate).getTime())
          .toBeLessThanOrEqual(new Date(result.soon[1].endDate).getTime());
      }
    });
  });

  describe('analyzePledgorBehavior', () => {
    it('should analyze pledgor history', () => {
      const records = [
        makePledgeRecord({ pledgor: '李四', status: 'active' }),
        makePledgeRecord({ pledgor: '李四', status: 'released' }),
        makePledgeRecord({ pledgor: '张三', status: 'defaulted' }),
      ];
      const result = analyzePledgorBehavior(records, '李四');

      expect(result.pledgor).toBe('李四');
      expect(result.totalPledges).toBe(2);
      expect(result.riskProfile).toBe('conservative');
    });

    it('should classify aggressive risk profile', () => {
      const records = [
        makePledgeRecord({ pledgor: '王五', status: 'active' }),
        makePledgeRecord({ pledgor: '王五', status: 'active' }),
        makePledgeRecord({ pledgor: '王五', status: 'active' }),
        makePledgeRecord({ pledgor: '王五', status: 'active' }),
        makePledgeRecord({ pledgor: '王五', status: 'defaulted' }),
      ];
      const result = analyzePledgorBehavior(records, '王五');
      expect(result.riskProfile).toBe('aggressive');
      expect(result.defaultRate).toBe(0.2);
    });

    it('should handle non-existent pledgor', () => {
      const records = [makePledgeRecord()];
      const result = analyzePledgorBehavior(records, '不存在');
      expect(result.totalPledges).toBe(0);
    });
  });
});
