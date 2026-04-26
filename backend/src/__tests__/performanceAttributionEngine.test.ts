import { describe, it, expect } from 'vitest';
import {
  brinsonAttribution,
  factorAttribution,
  computePerformanceMetrics,
  computeTimeWeightedReturns,
  rollingPerformance,
  type Holding,
} from '../services/performanceAttributionEngine';

describe('performanceAttributionEngine', () => {
  describe('brinsonAttribution', () => {
    it('should compute Brinson attribution effects', () => {
      const holdings: Holding[] = [
        { symbol: 'A', sector: 'Tech', weight: 0.4, return: 0.1, benchmarkWeight: 0.3, benchmarkReturn: 0.08 },
        { symbol: 'B', sector: 'Tech', weight: 0.3, return: 0.05, benchmarkWeight: 0.2, benchmarkReturn: 0.06 },
        { symbol: 'C', sector: 'Finance', weight: 0.3, return: 0.02, benchmarkWeight: 0.5, benchmarkReturn: 0.04 },
      ];
      const result = brinsonAttribution(holdings);
      expect(result.sectorBreakdown).toHaveLength(2);
      expect(result.totalActiveReturn).toBeTypeOf('number');
      expect(result.allocationEffect + result.selectionEffect + result.interactionEffect)
        .toBeCloseTo(result.totalActiveReturn, 6);
    });

    it('should handle single sector', () => {
      const holdings: Holding[] = [
        { symbol: 'A', sector: 'Tech', weight: 1, return: 0.1, benchmarkWeight: 1, benchmarkReturn: 0.08 },
      ];
      const result = brinsonAttribution(holdings);
      expect(result.totalActiveReturn).toBeCloseTo(0.02, 4);
    });
  });

  describe('factorAttribution', () => {
    it('should compute factor contributions', () => {
      const holdings: Holding[] = [
        { symbol: 'A', sector: 'Tech', weight: 0.5, return: 0.1, benchmarkWeight: 0.5, benchmarkReturn: 0.08,
          factorExposures: { market: 1.2, size: -0.3, value: 0.5 } },
        { symbol: 'B', sector: 'Finance', weight: 0.5, return: 0.05, benchmarkWeight: 0.5, benchmarkReturn: 0.04,
          factorExposures: { market: 0.8, size: 0.5, value: -0.2 } },
      ];
      const factorReturns = { market: 0.05, size: -0.02, value: 0.03 };
      const result = factorAttribution(holdings, factorReturns);
      expect(result).toHaveLength(3);
      result.forEach(r => {
        expect(r.contribution).toBeTypeOf('number');
      });
    });

    it('should handle missing factor exposures', () => {
      const holdings: Holding[] = [
        { symbol: 'A', sector: 'Tech', weight: 1, return: 0.1, benchmarkWeight: 1, benchmarkReturn: 0.08 },
      ];
      const result = factorAttribution(holdings, { market: 0.05 });
      expect(result[0].exposure).toBe(0);
    });
  });

  describe('computePerformanceMetrics', () => {
    it('should compute all performance metrics', () => {
      const returns = Array.from({ length: 252 }, (_, i) => 0.001 + Math.sin(i * 0.5) * 0.005);
      const benchmark = Array.from({ length: 252 }, (_, i) => 0.0008 + Math.cos(i * 0.7) * 0.003);
      const metrics = computePerformanceMetrics(returns, benchmark);

      expect(metrics.totalReturn).toBeTypeOf('number');
      expect(metrics.volatility).toBeGreaterThan(0);
      expect(metrics.sharpeRatio).toBeTypeOf('number');
      expect(metrics.maxDrawdown).toBeGreaterThan(0);
      expect(metrics.winRate).toBeGreaterThan(0);
      expect(metrics.winRate).toBeLessThanOrEqual(1);
      expect(metrics.maxConsecutiveWins).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty returns', () => {
      const metrics = computePerformanceMetrics([], []);
      expect(metrics.totalReturn).toBe(0);
      expect(metrics.sharpeRatio).toBe(0);
    });

    it('should compute positive Sharpe for profitable returns', () => {
      const returns = Array.from({ length: 100 }, (_, i) => 0.002 + Math.sin(i * 0.3) * 0.001);
      const metrics = computePerformanceMetrics(returns, []);
      expect(metrics.sharpeRatio).toBeGreaterThan(0);
    });

    it('should compute Sortino correctly', () => {
      const returns = [0.01, -0.005, 0.02, -0.01, 0.015, 0.005, -0.003, 0.01];
      const metrics = computePerformanceMetrics(returns, []);
      expect(metrics.sortinoRatio).toBeTypeOf('number');
    });

    it('should compute profit factor', () => {
      const returns = [0.01, -0.005, 0.02, -0.01, 0.015];
      const metrics = computePerformanceMetrics(returns, []);
      expect(metrics.profitFactor).toBeGreaterThan(0);
    });

    it('should track consecutive wins and losses', () => {
      const returns = [0.01, 0.02, 0.01, -0.01, -0.02, 0.01];
      const metrics = computePerformanceMetrics(returns, []);
      expect(metrics.maxConsecutiveWins).toBe(3);
      expect(metrics.maxConsecutiveLosses).toBe(2);
    });
  });

  describe('computeTimeWeightedReturns', () => {
    it('should compute time-weighted returns', () => {
      const values = [
        { time: 0, value: 100000 },
        { time: 1, value: 105000 },
        { time: 2, value: 103000 },
        { time: 3, value: 110000 },
      ];
      const periods = computeTimeWeightedReturns([], values);
      expect(periods).toHaveLength(3);
      expect(periods[0].return).toBeCloseTo(0.05, 4);
    });

    it('should handle cash flows', () => {
      const values = [
        { time: 0, value: 100000 },
        { time: 1, value: 110000 },
      ];
      const cf = [{ time: 1, amount: 5000 }];
      const periods = computeTimeWeightedReturns(cf, values);
      expect(periods[0].return).toBeCloseTo(0.05, 4);
    });

    it('should handle insufficient data', () => {
      expect(computeTimeWeightedReturns([], [{ time: 0, value: 100 }])).toEqual([]);
    });
  });

  describe('rollingPerformance', () => {
    it('should compute rolling metrics', () => {
      const returns = Array.from({ length: 100 }, (_, i) => 0.001 + Math.sin(i * 0.4) * 0.005);
      const result = rollingPerformance(returns, 20);
      expect(result).toHaveLength(81);
      result.forEach(r => {
        expect(r.volatility).toBeGreaterThan(0);
      });
    });

    it('should return empty for insufficient data', () => {
      expect(rollingPerformance([0.01, 0.02], 10)).toEqual([]);
    });

    it('should include benchmark when provided', () => {
      const returns = Array.from({ length: 50 }, (_, i) => 0.001 + Math.sin(i * 0.5) * 0.005);
      const bench = Array.from({ length: 50 }, (_, i) => 0.0008 + Math.sin(i * 0.5 + 0.5) * 0.003);
      const result = rollingPerformance(returns, 20, bench);
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
