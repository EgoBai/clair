import { describe, it, expect } from 'vitest';
import {
  calculateDividendYield,
  calculatePayoutRatio,
  calculateDividendGrowthRate,
  calculateDividendStability,
  calculateExDividendImpact,
  buildDividendCalendar,
  analyzeDividendMetrics,
  rankByDividendQuality,
  suggestDividendStrategy,
  type DividendEvent,
} from '../utils/dividendAnalysisEngine';

describe('DividendAnalysisEngine', () => {
  describe('calculateDividendYield', () => {
    it('should calculate yield', () => {
      expect(calculateDividendYield(2, 50)).toBeCloseTo(0.04, 4);
    });

    it('should return 0 for zero price', () => {
      expect(calculateDividendYield(2, 0)).toBe(0);
    });

    it('should handle zero dividend', () => {
      expect(calculateDividendYield(0, 50)).toBe(0);
    });
  });

  describe('calculatePayoutRatio', () => {
    it('should calculate payout ratio', () => {
      expect(calculatePayoutRatio(1e8, 5e8)).toBeCloseTo(0.2, 2);
    });

    it('should return 0 for zero earnings', () => {
      expect(calculatePayoutRatio(1e8, 0)).toBe(0);
    });

    it('should handle over-100% payout', () => {
      expect(calculatePayoutRatio(6e8, 5e8)).toBeCloseTo(1.2, 1);
    });
  });

  describe('calculateDividendGrowthRate', () => {
    it('should calculate growth rate', () => {
      const dividends = [1.0, 1.1, 1.2, 1.3];
      const growth = calculateDividendGrowthRate(dividends);
      expect(growth).toBeGreaterThan(0);
    });

    it('should return 0 for single dividend', () => {
      expect(calculateDividendGrowthRate([1.0])).toBe(0);
    });

    it('should handle zero dividends', () => {
      const dividends = [0, 1.0, 1.1];
      const growth = calculateDividendGrowthRate(dividends);
      expect(growth).toBeGreaterThan(0);
    });

    it('should handle negative growth', () => {
      const dividends = [1.5, 1.3, 1.1];
      const growth = calculateDividendGrowthRate(dividends);
      expect(growth).toBeLessThan(0);
    });

    it('should return 0 for empty', () => {
      expect(calculateDividendGrowthRate([])).toBe(0);
    });
  });

  describe('calculateDividendStability', () => {
    it('should return 1 for stable dividends', () => {
      expect(calculateDividendStability([1.0, 1.0, 1.0, 1.0])).toBe(1);
    });

    it('should return lower for volatile dividends', () => {
      const stable = calculateDividendStability([1.0, 1.0, 1.0]);
      const volatile_ = calculateDividendStability([0.5, 1.5, 0.8]);
      expect(volatile_).toBeLessThan(stable);
    });

    it('should return 1 for single value', () => {
      expect(calculateDividendStability([1.0])).toBe(1);
    });

    it('should return 0 for all zeros', () => {
      expect(calculateDividendStability([0, 0, 0])).toBe(0);
    });
  });

  describe('calculateExDividendImpact', () => {
    it('should calculate theoretical drop', () => {
      const impact = calculateExDividendImpact(1, 50);
      expect(impact.theoreticalDrop).toBe(1);
      expect(impact.exPrice).toBeCloseTo(49.1, 1);
    });

    it('should apply tax rate', () => {
      const impact = calculateExDividendImpact(2, 100, 0.2);
      expect(impact.actualDropEstimate).toBeCloseTo(1.6, 1);
    });
  });

  describe('buildDividendCalendar', () => {
    const events: DividendEvent[] = [
      { ticker: '000001', date: '2024-03-01', type: 'cash', ratio: 1.0, exDate: '2024-03-15', recordDate: '2024-03-16', payDate: '2024-03-20' },
      { ticker: '000002', date: '2024-03-05', type: 'stock', ratio: 0.5, exDate: '2024-03-20', recordDate: '2024-03-21', payDate: '2024-03-25' },
    ];

    it('should build calendar in date range', () => {
      const cal = buildDividendCalendar(events, '2024-03-01', '2024-03-31');
      expect(cal.length).toBe(2);
    });

    it('should sort by date', () => {
      const cal = buildDividendCalendar(events, '2024-03-01', '2024-03-31');
      for (let i = 1; i < cal.length; i++) {
        expect(cal[i - 1].date.localeCompare(cal[i].date)).toBeLessThanOrEqual(0);
      }
    });

    it('should classify type correctly', () => {
      const cal = buildDividendCalendar(events, '2024-03-01', '2024-03-31');
      expect(cal[0].type).toBe('除息');
      expect(cal[1].type).toBe('除权');
    });

    it('should exclude events outside range', () => {
      const cal = buildDividendCalendar(events, '2024-04-01', '2024-04-30');
      expect(cal.length).toBe(0);
    });
  });

  describe('analyzeDividendMetrics', () => {
    it('should calculate all metrics', () => {
      const metrics = analyzeDividendMetrics(
        '000001',
        [0.5, 0.6, 0.7, 0.8],
        [20, 22, 25, 28],
        [2.0, 2.2, 2.5, 2.8]
      );
      expect(metrics.dividendYield).toBeGreaterThan(0);
      expect(metrics.stability).toBeGreaterThan(0);
      expect(metrics.consecutiveYears).toBe(4);
    });

    it('should count consecutive years', () => {
      const metrics = analyzeDividendMetrics('000001', [0.5, 0, 0.6, 0.7], [20], [2]);
      expect(metrics.consecutiveYears).toBe(2);
    });
  });

  describe('rankByDividendQuality', () => {
    it('should rank metrics', () => {
      const metrics = [
        analyzeDividendMetrics('A', [0.5, 0.6, 0.7], [20, 22, 25], [2, 2.2, 2.5]),
        analyzeDividendMetrics('B', [1.0, 1.0, 1.0], [50, 50, 50], [3, 3, 3]),
      ];
      const ranked = rankByDividendQuality(metrics);
      expect(ranked.length).toBe(2);
      expect(ranked[0].rank).toBe(1);
    });
  });

  describe('suggestDividendStrategy', () => {
    it('should suggest strategy based on risk tolerance', () => {
      const metrics = [
        analyzeDividendMetrics('A', [0.5, 0.6, 0.7], [20, 22, 25], [2, 2.2, 2.5]),
        analyzeDividendMetrics('B', [1.0, 1.0, 1.0], [50, 50, 50], [3, 3, 3]),
      ];
      const strategy = suggestDividendStrategy(metrics, 'conservative');
      expect(strategy.name).toBe('稳健股息策略');
      expect(strategy.riskLevel).toBe('low');
    });

    it('should have different names for different tolerances', () => {
      const metrics = [
        analyzeDividendMetrics('A', [0.5, 0.6, 0.7], [20, 22, 25], [2, 2.2, 2.5]),
      ];
      expect(suggestDividendStrategy(metrics, 'moderate').name).toBe('均衡股息策略');
      expect(suggestDividendStrategy(metrics, 'aggressive').name).toBe('成长股息策略');
    });
  });
});
