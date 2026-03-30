import { describe, it, expect } from 'vitest';
import {
  summarizeLimits,
  trackConsecutiveBoards,
  generateLimitSignals,
  limitSectorDistribution,
  type LimitData,
} from '../utils/limitAnalysis';

describe('LimitAnalysis', () => {
  const mockLimits: LimitData[] = [
    { ticker: '000001', name: '平安银行', price: 12.1, limitPrice: 12.1, limitType: 'up', consecutiveDays: 1, volume: 1e6, amount: 1.21e7, 封单金额: 5e8, 开板次数: 0, time: '09:35', sector: '银行' },
    { ticker: '000002', name: '万科A', price: 15.4, limitPrice: 15.4, limitType: 'up', consecutiveDays: 3, volume: 2e6, amount: 3.08e7, 封单金额: 8e8, 开板次数: 0, time: '09:40', sector: '地产' },
    { ticker: '000003', name: '测试A', price: 8.0, limitPrice: 8.0, limitType: 'up', consecutiveDays: 2, volume: 5e5, amount: 4e6, 封单金额: 3e8, 开板次数: 2, time: '10:15', sector: '科技' },
    { ticker: '000004', name: '测试B', price: 6.5, limitPrice: 6.5, limitType: 'down', consecutiveDays: 1, volume: 3e5, amount: 1.95e6, 封单金额: 0, 开板次数: 0, time: '09:50', sector: '医药' },
    { ticker: '000005', name: '测试C', price: 10.0, limitPrice: 10.0, limitType: 'down', consecutiveDays: 2, volume: 8e5, amount: 8e6, 封单金额: 0, 开板次数: 0, time: '10:30', sector: '科技' },
    { ticker: '000006', name: '测试D', price: 20.0, limitPrice: 20.0, limitType: 'up', consecutiveDays: 5, volume: 1e6, amount: 2e7, 封单金额: 1e9, 开板次数: 0, time: '09:32', sector: '半导体' },
  ];

  describe('summarizeLimits', () => {
    it('should count up and down limits', () => {
      const result = summarizeLimits(mockLimits);
      expect(result.upCount).toBe(4);
      expect(result.downCount).toBe(2);
    });

    it('should calculate seal rate', () => {
      const result = summarizeLimits(mockLimits);
      // 4 up limits, 2 open boards = 6 total attempts, rate = 4/6
      expect(result.sealRate).toBeCloseTo(4 / 6, 2);
    });

    it('should find max consecutive days', () => {
      const result = summarizeLimits(mockLimits);
      expect(result.maxConsecutive).toBe(5);
    });

    it('should calculate average seal amount', () => {
      const result = summarizeLimits(mockLimits);
      expect(result.avgSealAmount).toBeGreaterThan(0);
    });

    it('should determine sentiment', () => {
      const result = summarizeLimits(mockLimits);
      expect(['亢奋', '积极', '中性', '谨慎', '恐慌']).toContain(result.情绪);
    });

    it('should handle empty limits', () => {
      const result = summarizeLimits([]);
      expect(result.upCount).toBe(0);
      expect(result.downCount).toBe(0);
      expect(result.sealRate).toBe(1);
    });

    it('should count open board events', () => {
      const result = summarizeLimits(mockLimits);
      expect(result.openBoardCount).toBe(2);
    });

    it('should calculate amounts', () => {
      const result = summarizeLimits(mockLimits);
      expect(result.upAmount).toBeGreaterThan(0);
      expect(result.downAmount).toBeGreaterThan(0);
    });
  });

  describe('trackConsecutiveBoards', () => {
    it('should track boards with 2+ consecutive days', () => {
      const result = trackConsecutiveBoards(mockLimits);
      expect(result.length).toBe(3); // 3, 2, 5 consecutive days
    });

    it('should calculate total gain from limit ups', () => {
      const result = trackConsecutiveBoards(mockLimits);
      const fiveDays = result.find((r) => r.days === 5);
      expect(fiveDays!.totalGain).toBeCloseTo(61.05, 0);
    });

    it('should assign risk levels', () => {
      const result = trackConsecutiveBoards(mockLimits);
      for (const r of result) {
        expect(['low', 'medium', 'high', 'extreme']).toContain(r.riskLevel);
      }
    });

    it('should assign extreme risk for 7+ days', () => {
      const extreme: LimitData[] = [
        { ticker: 'TEST', name: 'Test', price: 10, limitPrice: 10, limitType: 'up', consecutiveDays: 8, volume: 1e6, amount: 1e7, 封单金额: 1e9, 开板次数: 0, time: '09:30', sector: '科技' },
      ];
      const result = trackConsecutiveBoards(extreme);
      expect(result[0].riskLevel).toBe('extreme');
    });

    it('should sort by days descending', () => {
      const result = trackConsecutiveBoards(mockLimits);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].days).toBeGreaterThanOrEqual(result[i].days);
      }
    });

    it('should exclude non-consecutive boards', () => {
      const result = trackConsecutiveBoards(mockLimits);
      expect(result.every((r) => r.days >= 2)).toBe(true);
    });

    it('should include sector', () => {
      const result = trackConsecutiveBoards(mockLimits);
      for (const r of result) {
        expect(r.sector).toBeDefined();
      }
    });
  });

  describe('generateLimitSignals', () => {
    it('should generate bullish signal for many ups', () => {
      const summary = {
        upCount: 120, downCount: 10, upAmount: 1e10, downAmount: 1e9,
        maxConsecutive: 3, avgSealAmount: 5e8, openBoardCount: 5,
        sealRate: 0.9, 情绪: '亢奋' as const,
      };
      const signals = generateLimitSignals(summary);
      expect(signals.some((s) => s.type === 'bullish')).toBe(true);
    });

    it('should generate bearish signal for many downs', () => {
      const summary = {
        upCount: 10, downCount: 80, upAmount: 1e9, downAmount: 8e9,
        maxConsecutive: 1, avgSealAmount: 1e8, openBoardCount: 10,
        sealRate: 0.4, 情绪: '恐慌' as const,
      };
      const signals = generateLimitSignals(summary);
      expect(signals.some((s) => s.type === 'bearish')).toBe(true);
    });

    it('should generate warning for manic sentiment', () => {
      const summary = {
        upCount: 150, downCount: 5, upAmount: 1.5e10, downAmount: 5e8,
        maxConsecutive: 8, avgSealAmount: 1e9, openBoardCount: 2,
        sealRate: 0.95, 情绪: '亢奋' as const,
      };
      const signals = generateLimitSignals(summary);
      expect(signals.some((s) => s.message.includes('亢奋') || s.message.includes('风险'))).toBe(true);
    });

    it('should generate neutral for balanced market', () => {
      const summary = {
        upCount: 40, downCount: 30, upAmount: 4e9, downAmount: 3e9,
        maxConsecutive: 2, avgSealAmount: 3e8, openBoardCount: 15,
        sealRate: 0.65, 情绪: '中性' as const,
      };
      const signals = generateLimitSignals(summary);
      expect(signals.length).toBeGreaterThanOrEqual(1);
    });

    it('should assign strength 0-100', () => {
      const summary = {
        upCount: 60, downCount: 20, upAmount: 6e9, downAmount: 2e9,
        maxConsecutive: 4, avgSealAmount: 4e8, openBoardCount: 8,
        sealRate: 0.75, 情绪: '积极' as const,
      };
      const signals = generateLimitSignals(summary);
      for (const s of signals) {
        expect(s.strength).toBeGreaterThanOrEqual(0);
        expect(s.strength).toBeLessThanOrEqual(100);
      }
    });

    it('should include message', () => {
      const summary = {
        upCount: 50, downCount: 15, upAmount: 5e9, downAmount: 1.5e9,
        maxConsecutive: 3, avgSealAmount: 3e8, openBoardCount: 5,
        sealRate: 0.8, 情绪: '积极' as const,
      };
      const signals = generateLimitSignals(summary);
      for (const s of signals) {
        expect(s.message.length).toBeGreaterThan(0);
      }
    });
  });

  describe('limitSectorDistribution', () => {
    it('should aggregate by sector', () => {
      const result = limitSectorDistribution(mockLimits);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should count up and down per sector', () => {
      const result = limitSectorDistribution(mockLimits);
      const tech = result.find((r) => r.sector === '科技');
      expect(tech!.upCount).toBe(1);
      expect(tech!.downCount).toBe(1);
    });

    it('should calculate net count', () => {
      const result = limitSectorDistribution(mockLimits);
      for (const r of result) {
        expect(r.netCount).toBe(r.upCount - r.downCount);
      }
    });

    it('should sort by net count descending', () => {
      const result = limitSectorDistribution(mockLimits);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].netCount).toBeGreaterThanOrEqual(result[i].netCount);
      }
    });

    it('should handle empty limits', () => {
      const result = limitSectorDistribution([]);
      expect(result).toHaveLength(0);
    });
  });
});
