import { describe, it, expect } from 'vitest';
import {
  calculateSUE,
  analyzePEAD,
  assessEarningsQuality,
  calculateRevisionMomentum,
  analyzeEarningsGrowth,
  analyzeSeasonality,
  buildEarningsCalendar,
  earningsMomentumScore,
} from '../utils/earningsSurpriseEngine';
import type { EarningsRecord, EarningsSurprise } from '../utils/earningsSurpriseEngine';

function makeEarnings(n: number, beatRate: number = 0.6): EarningsRecord[] {
  const records: EarningsRecord[] = [];
  for (let i = 0; i < n; i++) {
    const estimated = 0.5 + Math.random() * 0.3;
    const beat = Math.random() < beatRate;
    const actual = beat ? estimated + Math.random() * 0.2 : estimated - Math.random() * 0.2;
    records.push({
      date: `2024-${String((i % 4) * 3 + 1).padStart(2, '0')}-15`,
      actualEPS: actual,
      estimatedEPS: estimated,
      revenue: 1000 + Math.random() * 500,
      estimatedRevenue: 1000 + Math.random() * 500,
      quarter: `Q${(i % 4) + 1}`,
    });
  }
  return records;
}

describe('Earnings Surprise Engine', () => {
  describe('calculateSUE', () => {
    it('should calculate SUE for earnings records', () => {
      const earnings = makeEarnings(12);
      const results = calculateSUE(earnings);

      expect(results).toHaveLength(12);
      for (const r of results) {
        expect(r).toHaveProperty('epsSurprise');
        expect(r).toHaveProperty('epsSurprisePercent');
        expect(r).toHaveProperty('revenueSurprise');
        expect(r).toHaveProperty('revenueSurprisePercent');
        expect(r).toHaveProperty('standardizedSurprise');
        expect(r).toHaveProperty('magnitude');
        expect(r).toHaveProperty('direction');
      }
    });

    it('should classify magnitude correctly', () => {
      const earnings: EarningsRecord[] = [
        { date: '2024-01-01', actualEPS: 0.51, estimatedEPS: 0.50, revenue: 1000, estimatedRevenue: 1000, quarter: 'Q1' },
        { date: '2024-04-01', actualEPS: 0.55, estimatedEPS: 0.50, revenue: 1000, estimatedRevenue: 1000, quarter: 'Q2' },
        { date: '2024-07-01', actualEPS: 0.60, estimatedEPS: 0.50, revenue: 1000, estimatedRevenue: 1000, quarter: 'Q3' },
        { date: '2024-10-01', actualEPS: 0.80, estimatedEPS: 0.50, revenue: 1000, estimatedRevenue: 1000, quarter: 'Q4' },
      ];

      const results = calculateSUE(earnings);
      expect(results[0].magnitude).toBe('small');       // 2%
      expect(results[1].magnitude).toBe('moderate');     // 10%
      expect(results[2].magnitude).toBe('moderate');     // 20% (not strictly > 20)
      expect(results[3].magnitude).toBe('massive');      // 60%
    });

    it('should classify direction correctly', () => {
      const earnings: EarningsRecord[] = [
        { date: '2024-01-01', actualEPS: 0.55, estimatedEPS: 0.50, revenue: 1000, estimatedRevenue: 1000, quarter: 'Q1' },
        { date: '2024-04-01', actualEPS: 0.45, estimatedEPS: 0.50, revenue: 1000, estimatedRevenue: 1000, quarter: 'Q2' },
        { date: '2024-07-01', actualEPS: 0.50, estimatedEPS: 0.50, revenue: 1000, estimatedRevenue: 1000, quarter: 'Q3' },
      ];

      const results = calculateSUE(earnings);
      expect(results[0].direction).toBe('beat');
      expect(results[1].direction).toBe('miss');
      expect(results[2].direction).toBe('meet');
    });

    it('should return empty for empty input', () => {
      expect(calculateSUE([])).toEqual([]);
    });

    it('should handle zero estimated EPS', () => {
      const earnings: EarningsRecord[] = [
        { date: '2024-01-01', actualEPS: 0.10, estimatedEPS: 0, revenue: 1000, estimatedRevenue: 1000, quarter: 'Q1' },
      ];
      const results = calculateSUE(earnings);
      expect(results[0].epsSurprisePercent).toBe(100);
    });
  });

  describe('analyzePEAD', () => {
    it('should analyze post-earnings drift', () => {
      const postReturns = [
        [0.01, 0.02, 0.015, 0.01],
        [0.015, 0.025, 0.02, 0.015],
        [-0.01, -0.015, -0.01, -0.005],
      ];
      const signs = [1, 1, -1];

      const result = analyzePEAD(postReturns, signs);

      expect(result.days).toHaveLength(4);
      expect(result.cumulativeReturns).toHaveLength(4);
      expect(typeof result.driftMagnitude).toBe('number');
      expect(typeof result.significanceLevel).toBe('number');
      expect(typeof result.halfLife).toBe('number');
    });

    it('should handle empty input', () => {
      const result = analyzePEAD([], []);
      expect(result.days).toHaveLength(0);
      expect(result.driftMagnitude).toBe(0);
    });

    it('should calculate cumulative drift correctly', () => {
      const postReturns = [[0.01, 0.02]];
      const signs = [1];

      const result = analyzePEAD(postReturns, signs);
      expect(result.cumulativeReturns[0]).toBeCloseTo(0.01, 5);
      expect(result.cumulativeReturns[1]).toBeCloseTo(0.02, 5);
    });
  });

  describe('assessEarningsQuality', () => {
    it('should assess earnings quality', () => {
      const earnings = makeEarnings(12);
      const cashFlows = Array(12).fill(0).map(() => 0.3 + Math.random() * 0.4);
      const accruals = Array(12).fill(0).map(() => Math.random() * 0.1);
      const revenues = Array(12).fill(0).map(() => 1000 + Math.random() * 500);

      const quality = assessEarningsQuality(earnings, cashFlows, accruals, revenues);

      expect(quality.score).toBeGreaterThanOrEqual(0);
      expect(quality.score).toBeLessThanOrEqual(100);
      expect(quality).toHaveProperty('accrualRatio');
      expect(quality).toHaveProperty('cashFlowAdequacy');
      expect(quality).toHaveProperty('revenueQuality');
      expect(quality).toHaveProperty('consistency');
      expect(quality).toHaveProperty('flags');
      expect(Array.isArray(quality.flags)).toBe(true);
    });

    it('should flag high accruals', () => {
      const earnings = makeEarnings(4);
      const cashFlows = [0.1, 0.1, 0.1, 0.1];
      const accruals = [200, 200, 200, 200]; // Very high
      const revenues = [1000, 1000, 1000, 1000];

      const quality = assessEarningsQuality(earnings, cashFlows, accruals, revenues);
      expect(quality.flags).toContain('HIGH_ACCRUALS');
    });

    it('should flag low cash flow', () => {
      const earnings: EarningsRecord[] = [
        { date: '2024-01-01', actualEPS: 1.0, estimatedEPS: 0.9, revenue: 1000, estimatedRevenue: 1000, quarter: 'Q1' },
      ];
      const quality = assessEarningsQuality(earnings, [0.5], [0.1], [1000]);
      expect(quality.flags).toContain('LOW_CASH_FLOW');
    });
  });

  describe('calculateRevisionMomentum', () => {
    it('should calculate revision momentum', () => {
      const result = calculateRevisionMomentum(
        'AAPL',
        6.50,
        6.30,
        6.00,
        [6.00, 6.10, 6.20, 6.30, 6.40, 6.50],
        15
      );

      expect(result.symbol).toBe('AAPL');
      expect(result.revisionDirection).toBe('up');
      expect(result.revisionPercent30d).toBeGreaterThan(0);
      expect(result.revisionPercent90d).toBeGreaterThan(0);
      expect(result.analystCount).toBe(15);
    });

    it('should detect downward revisions', () => {
      const result = calculateRevisionMomentum(
        'XYZ',
        2.00,
        2.50,
        3.00,
        [3.00, 2.80, 2.50, 2.20, 2.00],
        8
      );

      expect(result.revisionDirection).toBe('down');
      expect(result.revisionPercent30d).toBeLessThan(0);
    });

    it('should detect stable revisions', () => {
      const result = calculateRevisionMomentum(
        'STABLE',
        5.00,
        5.02,
        5.00,
        [5.00, 5.01, 5.02, 5.00],
        10
      );

      expect(result.revisionDirection).toBe('stable');
    });

    it('should handle zero base estimate', () => {
      const result = calculateRevisionMomentum('ZERO', 1.0, 0, 0, [0, 0.5, 1.0], 5);
      expect(result.revisionPercent30d).toBe(0);
      expect(result.revisionPercent90d).toBe(0);
    });
  });

  describe('analyzeEarningsGrowth', () => {
    it('should analyze EPS growth patterns', () => {
      const eps = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0, 1.05];
      const rev = [100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155];

      const result = analyzeEarningsGrowth('TEST', eps, rev);

      expect(result.symbol).toBe('TEST');
      expect(result.yoyEpsGrowth.length).toBeGreaterThan(0);
      expect(result.qoqEpsGrowth.length).toBeGreaterThan(0);
      expect(typeof result.averageGrowth).toBe('number');
      expect(typeof result.growthAcceleration).toBe('number');
      expect(typeof result.growthConsistency).toBe('number');
      expect(typeof result.earningsCAGR3Y).toBe('number');
    });

    it('should detect consistent growth', () => {
      const eps = Array(12).fill(0).map((_, i) => 0.5 + i * 0.05);
      const rev = Array(12).fill(0).map((_, i) => 100 + i * 10);

      const result = analyzeEarningsGrowth('CONSISTENT', eps, rev);
      expect(result.growthConsistency).toBeGreaterThan(0.5);
    });

    it('should handle declining earnings', () => {
      const eps = [1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45];
      const rev = [150, 145, 140, 135, 130, 125, 120, 115, 110, 105, 100, 95];

      const result = analyzeEarningsGrowth('DECLINING', eps, rev);
      expect(result.averageGrowth).toBeLessThan(0);
    });
  });

  describe('analyzeSeasonality', () => {
    it('should analyze quarterly seasonality', () => {
      const earnings = makeEarnings(20);
      const surprises = calculateSUE(earnings);
      const quarters = earnings.map(e => e.quarter);

      const seasonality = analyzeSeasonality(surprises, quarters);

      expect(seasonality.length).toBeGreaterThan(0);
      for (const s of seasonality) {
        expect(s).toHaveProperty('quarter');
        expect(s).toHaveProperty('averageSurprise');
        expect(s).toHaveProperty('beatRate');
        expect(s).toHaveProperty('averageMagnitude');
        expect(s).toHaveProperty('volatility');
        expect(s.beatRate).toBeGreaterThanOrEqual(0);
        expect(s.beatRate).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('buildEarningsCalendar', () => {
    it('should build earnings calendar', () => {
      const historicalEarnings: Record<string, EarningsRecord[]> = {
        AAPL: makeEarnings(4),
        MSFT: makeEarnings(4),
      };

      const calendar = buildEarningsCalendar(
        ['AAPL', 'MSFT'],
        historicalEarnings,
        ['2025-01-15', '2025-04-15']
      );

      expect(calendar.length).toBeGreaterThan(0);
      for (const event of calendar) {
        expect(event).toHaveProperty('date');
        expect(event).toHaveProperty('symbol');
        expect(event).toHaveProperty('eventType');
        expect(['low', 'medium', 'high']).toContain(event.importance);
      }

      // Should be sorted by date
      for (let i = 1; i < calendar.length; i++) {
        expect(calendar[i].date >= calendar[i - 1].date).toBe(true);
      }
    });
  });

  describe('earningsMomentumScore', () => {
    it('should calculate momentum score', () => {
      const earnings = makeEarnings(8, 0.75);
      const surprises = calculateSUE(earnings);
      const revision = calculateRevisionMomentum('TEST', 5.0, 4.8, 4.5, [4.5, 4.7, 4.8, 5.0], 10);

      const score = earningsMomentumScore(surprises, revision);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should be higher for consistent beats with upward revisions', () => {
      const earnings = makeEarnings(8, 0.9);
      const surprises = calculateSUE(earnings);
      const revisionUp = calculateRevisionMomentum('A', 6.0, 5.5, 5.0, [5.0, 5.3, 5.5, 6.0], 10);
      const revisionDown = calculateRevisionMomentum('B', 4.0, 4.5, 5.0, [5.0, 4.7, 4.5, 4.0], 10);

      const scoreUp = earningsMomentumScore(surprises, revisionUp);
      const scoreDown = earningsMomentumScore(surprises, revisionDown);

      expect(scoreUp).toBeGreaterThan(scoreDown);
    });
  });

  describe('edge cases', () => {
    it('should handle single earnings record', () => {
      const earnings: EarningsRecord[] = [
        { date: '2024-01-01', actualEPS: 0.55, estimatedEPS: 0.50, revenue: 1000, estimatedRevenue: 1000, quarter: 'Q1' },
      ];
      const results = calculateSUE(earnings);
      expect(results).toHaveLength(1);
    });

    it('should handle all misses', () => {
      const earnings = makeEarnings(8, 0);
      const surprises = calculateSUE(earnings);
      const revision = calculateRevisionMomentum('X', 3.0, 3.5, 4.0, [4.0, 3.8, 3.5, 3.0], 5);
      const score = earningsMomentumScore(surprises, revision);
      expect(score).toBeLessThan(50);
    });
  });
});
