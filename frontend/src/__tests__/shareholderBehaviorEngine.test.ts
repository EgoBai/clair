import { describe, it, expect } from 'vitest';
import {
  analyzeShareholderChanges,
  analyzeInsiderTrades,
  assessPledgeRisk,
  analyzeUnlockPressure,
  analyzeConcentration,
  type ShareholderChange,
  type InsiderTrade,
  type PledgeRisk,
  type UnlockPressure,
  type ConcentrationChange,
} from '../utils/shareholderBehaviorEngine';

describe('股东行为分析引擎', () => {
  describe('analyzeShareholderChanges', () => {
    const changes: ShareholderChange[] = [
      { shareholder: '大股东A', type: 'increase', shares: 5000000, pctChange: 2.5, avgPrice: 10, totalAmount: 50000000, date: '2026-01-15' },
      { shareholder: '机构B', type: 'decrease', shares: 2000000, pctChange: 1.0, avgPrice: 12, totalAmount: 24000000, date: '2026-01-20' },
      { shareholder: '散户C', type: 'new', shares: 100000, pctChange: 0.1, avgPrice: 11, totalAmount: 1100000, date: '2026-02-01' },
    ];

    it('should calculate total increase and decrease', () => {
      const result = analyzeShareholderChanges(changes);
      expect(result.totalIncrease).toBe(50000000);
      expect(result.totalDecrease).toBe(24000000);
    });

    it('should calculate net change', () => {
      const result = analyzeShareholderChanges(changes);
      expect(result.netChange).toBe(26000000);
    });

    it('should generate bullish signal for net increase', () => {
      const result = analyzeShareholderChanges(changes);
      expect(result.signals.some(s => s.type === 'bullish')).toBe(true);
    });

    it('should handle empty changes', () => {
      const result = analyzeShareholderChanges([]);
      expect(result.netChange).toBe(0);
      expect(result.signals).toHaveLength(0);
    });

    it('should generate bearish signal for net decrease', () => {
      const decreaseChanges: ShareholderChange[] = [
        { shareholder: '大股东', type: 'decrease', shares: 10000000, pctChange: 3, avgPrice: 10, totalAmount: 100000000, date: '2026-01-15' },
      ];
      const result = analyzeShareholderChanges(decreaseChanges);
      expect(result.signals.some(s => s.type === 'bearish')).toBe(true);
    });
  });

  describe('analyzeInsiderTrades', () => {
    const trades: InsiderTrade[] = [
      { name: '张三', role: 'ceo', type: 'buy', shares: 100000, price: 10, amount: 1000000, date: '2026-01-10', holdingAfter: 500000 },
      { name: '李四', role: 'cfo', type: 'sell', shares: 50000, price: 12, amount: 600000, date: '2026-01-15', holdingAfter: 200000 },
    ];

    it('should count buy and sell', () => {
      const result = analyzeInsiderTrades(trades);
      expect(result.buyCount).toBe(1);
      expect(result.sellCount).toBe(1);
    });

    it('should calculate net amount', () => {
      const result = analyzeInsiderTrades(trades);
      expect(result.netAmount).toBe(400000);
    });

    it('should detect concentrated selling', () => {
      const manySells: InsiderTrade[] = Array.from({ length: 6 }, (_, i) => ({
        name: `高管${i}`, role: 'director' as const, type: 'sell' as const,
        shares: 10000, price: 10, amount: 100000, date: '2026-01-15', holdingAfter: 50000,
      }));
      const result = analyzeInsiderTrades(manySells);
      expect(result.signals.some(s => s.type === 'bearish')).toBe(true);
    });

    it('should handle empty trades', () => {
      const result = analyzeInsiderTrades([]);
      expect(result.buyCount).toBe(0);
      expect(result.sellCount).toBe(0);
    });
  });

  describe('assessPledgeRisk', () => {
    const pledges: PledgeRisk[] = [
      { shareholder: '大股东A', pledgedShares: 3000000, totalHolding: 10000000, pledgeRatio: 30, riskLevel: 'low', warningPrice: 5, closingPrice: 10, distanceToWarning: 0 },
      { shareholder: '大股东B', pledgedShares: 8000000, totalHolding: 10000000, pledgeRatio: 80, riskLevel: 'low', warningPrice: 8, closingPrice: 9, distanceToWarning: 0 },
    ];

    it('should assess overall risk', () => {
      const result = assessPledgeRisk(pledges);
      expect(['low', 'medium', 'high', 'critical']).toContain(result.overallRisk);
    });

    it('should calculate total pledged percentage', () => {
      const result = assessPledgeRisk(pledges);
      expect(result.totalPledgedPct).toBeCloseTo(55, 0);
    });

    it('should identify high risk pledges', () => {
      const result = assessPledgeRisk(pledges);
      expect(result.highRiskList.length).toBeGreaterThan(0);
    });

    it('should handle empty pledges', () => {
      const result = assessPledgeRisk([]);
      expect(result.overallRisk).toBe('low');
      expect(result.totalPledgedPct).toBe(0);
    });

    it('should calculate distance to warning price', () => {
      const result = assessPledgeRisk(pledges);
      result.highRiskList.forEach(p => {
        expect(p.distanceToWarning).toBeLessThan(20);
      });
    });
  });

  describe('analyzeUnlockPressure', () => {
    const unlocks: UnlockPressure[] = [
      { date: '2026-03-01', shares: 5000000, pctOfTotal: 3, avgCost: 8, currentPrice: 12, profitLoss: 0, pressureLevel: 'low' },
      { date: '2026-04-01', shares: 20000000, pctOfTotal: 8, avgCost: 15, currentPrice: 10, profitLoss: 0, pressureLevel: 'low' },
    ];

    it('should assess pressure levels', () => {
      const result = analyzeUnlockPressure(unlocks, 1000000);
      expect(['low', 'medium', 'high']).toContain(result.avgPressureLevel);
    });

    it('should identify high pressure days', () => {
      const result = analyzeUnlockPressure(unlocks, 1000000);
      expect(result.highPressureDays.length).toBeGreaterThan(0);
    });

    it('should calculate profit/loss', () => {
      const result = analyzeUnlockPressure(unlocks, 1000000);
      expect(result.worstDay).not.toBeNull();
    });

    it('should handle empty unlocks', () => {
      const result = analyzeUnlockPressure([], 1000000);
      expect(result.totalPressure).toBe(0);
    });

    it('should calculate total pressure', () => {
      const result = analyzeUnlockPressure(unlocks, 1000000);
      expect(result.totalPressure).toBe(11);
    });
  });

  describe('analyzeConcentration', () => {
    const periods: ConcentrationChange[] = [
      { period: '2025-Q3', shareholderCount: 50000, avgHoldingPerPerson: 2000, top10Pct: 45, concentration: 'stable', giniCoefficient: 0.6 },
      { period: '2025-Q4', shareholderCount: 45000, avgHoldingPerPerson: 2200, top10Pct: 48, concentration: 'increasing', giniCoefficient: 0.63 },
      { period: '2026-Q1', shareholderCount: 40000, avgHoldingPerPerson: 2500, top10Pct: 52, concentration: 'increasing', giniCoefficient: 0.66 },
    ];

    it('should detect increasing concentration', () => {
      const result = analyzeConcentration(periods);
      expect(result.trend).toBe('increasing');
    });

    it('should provide signal interpretation', () => {
      const result = analyzeConcentration(periods);
      expect(result.signal).toBeTruthy();
    });

    it('should return latest concentration', () => {
      const result = analyzeConcentration(periods);
      expect(result.latestConcentration).toBe(52);
    });

    it('should handle insufficient data', () => {
      const result = analyzeConcentration([periods[0]]);
      expect(result.trend).toBe('stable');
    });

    it('should detect decreasing concentration', () => {
      const decreasing: ConcentrationChange[] = [
        { period: 'Q1', shareholderCount: 40000, avgHoldingPerPerson: 2500, top10Pct: 50, concentration: 'stable', giniCoefficient: 0.6 },
        { period: 'Q2', shareholderCount: 50000, avgHoldingPerPerson: 2000, top10Pct: 42, concentration: 'decreasing', giniCoefficient: 0.55 },
      ];
      const result = analyzeConcentration(decreasing);
      expect(result.trend).toBe('decreasing');
    });
  });
});
