import { describe, it, expect } from 'vitest';
import {
  calculatePerformanceMetrics,
  calculateAttribution,
  calculateRollingWindow,
  calculateMonthlyMatrix,
  type DailyReturn,
} from '../utils/strategyPerformanceEngine';

function generateReturns(count: number): DailyReturn[] {
  return Array.from({ length: count }, (_, i) => ({
    date: `2026-${String(Math.floor(i / 20) + 1).padStart(2, '0')}-${String((i % 20) + 1).padStart(2, '0')}`,
    strategyReturn: (Math.random() - 0.48) * 0.03,
    benchmarkReturn: (Math.random() - 0.5) * 0.02,
    riskFreeRate: 0.0001,
  }));
}

const mockReturns = generateReturns(120);

describe('策略绩效归因引擎', () => {
  describe('calculatePerformanceMetrics', () => {
    it('should calculate total return', () => {
      const metrics = calculatePerformanceMetrics(mockReturns);
      expect(typeof metrics.totalReturn).toBe('number');
    });

    it('should calculate Sharpe ratio', () => {
      const metrics = calculatePerformanceMetrics(mockReturns);
      expect(typeof metrics.sharpeRatio).toBe('number');
    });

    it('should calculate max drawdown >= 0', () => {
      const metrics = calculatePerformanceMetrics(mockReturns);
      expect(metrics.maxDrawdown).toBeGreaterThanOrEqual(0);
    });

    it('should calculate win rate 0-1', () => {
      const metrics = calculatePerformanceMetrics(mockReturns);
      expect(metrics.winRate).toBeGreaterThanOrEqual(0);
      expect(metrics.winRate).toBeLessThanOrEqual(1);
    });

    it('should handle empty returns', () => {
      const metrics = calculatePerformanceMetrics([]);
      expect(metrics.totalReturn).toBe(0);
      expect(metrics.sharpeRatio).toBe(0);
    });

    it('should calculate profit factor', () => {
      const metrics = calculatePerformanceMetrics(mockReturns);
      expect(metrics.profitFactor).toBeGreaterThanOrEqual(0);
    });

    it('should identify best and worst days', () => {
      const metrics = calculatePerformanceMetrics(mockReturns);
      expect(metrics.bestDay).toBeGreaterThanOrEqual(metrics.worstDay);
    });

    it('should calculate Sortino ratio', () => {
      const metrics = calculatePerformanceMetrics(mockReturns);
      expect(typeof metrics.sortinoRatio).toBe('number');
    });

    it('should calculate Calmar ratio', () => {
      const metrics = calculatePerformanceMetrics(mockReturns);
      expect(typeof metrics.calmarRatio).toBe('number');
    });
  });

  describe('calculateAttribution', () => {
    it('should calculate alpha and beta', () => {
      const result = calculateAttribution(mockReturns);
      expect(typeof result.alpha).toBe('number');
      expect(typeof result.beta).toBe('number');
    });

    it('should calculate tracking error', () => {
      const result = calculateAttribution(mockReturns);
      expect(result.trackingError).toBeGreaterThanOrEqual(0);
    });

    it('should calculate information ratio', () => {
      const result = calculateAttribution(mockReturns);
      expect(typeof result.informationRatio).toBe('number');
    });

    it('should handle insufficient data', () => {
      const result = calculateAttribution([mockReturns[0]]);
      expect(result.alpha).toBe(0);
      expect(result.beta).toBe(0);
    });

    it('should decompose into selection/allocation/interaction', () => {
      const result = calculateAttribution(mockReturns);
      expect(typeof result.selectionEffect).toBe('number');
      expect(typeof result.allocationEffect).toBe('number');
      expect(typeof result.interactionEffect).toBe('number');
    });
  });

  describe('calculateRollingWindow', () => {
    it('should calculate rolling metrics', () => {
      const result = calculateRollingWindow(mockReturns, 60);
      expect(result.sharpe.length).toBeGreaterThan(0);
      expect(result.returns.length).toBe(result.sharpe.length);
    });

    it('should have matching date arrays', () => {
      const result = calculateRollingWindow(mockReturns, 60);
      expect(result.dates.length).toBe(result.sharpe.length);
    });

    it('should support different window sizes', () => {
      const w30 = calculateRollingWindow(mockReturns, 30);
      const w60 = calculateRollingWindow(mockReturns, 60);
      expect(w30.sharpe.length).toBeGreaterThan(w60.sharpe.length);
    });

    it('should handle data shorter than window', () => {
      const result = calculateRollingWindow(mockReturns.slice(0, 10), 60);
      expect(result.sharpe).toHaveLength(0);
    });
  });

  describe('calculateMonthlyMatrix', () => {
    it('should generate monthly matrix', () => {
      const result = calculateMonthlyMatrix(mockReturns);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should have 12 months per year', () => {
      const result = calculateMonthlyMatrix(mockReturns);
      result.forEach(y => {
        expect(y.months).toHaveLength(12);
      });
    });

    it('should calculate YTD return', () => {
      const result = calculateMonthlyMatrix(mockReturns);
      result.forEach(y => {
        expect(typeof y.ytd).toBe('number');
      });
    });

    it('should handle empty returns', () => {
      const result = calculateMonthlyMatrix([]);
      expect(result).toHaveLength(0);
    });
  });
});
