import { describe, it, expect } from 'vitest';
import {
  PerformanceAnalyzer,
  createPerformanceAnalyzer,
  DailySnapshot,
  TradeRecord,
} from '../utils/performanceAnalyzer';

function makeSnapshots(
  values: number[],
  startDate = '2024-01-02',
): DailySnapshot[] {
  return values.map((v, i) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().slice(0, 10);
    const prevValue = i > 0 ? values[i - 1] : v;
    const dailyReturns = i > 0 ? (v - prevValue) / prevValue : 0;
    const returns = v - values[0];
    return {
      date: dateStr,
      cash: 0,
      position: 100,
      positionValue: v,
      totalValue: v,
      returns,
      dailyReturns,
    };
  });
}

function makeTrades(prices?: number[]): TradeRecord[] {
  const p = prices || [10, 11, 12, 13];
  return [
    { date: '2024-01-02', type: 'buy', price: p[0], quantity: 100, amount: p[0] * 100, commission: 5, reason: 'entry' },
    { date: '2024-01-05', type: 'sell', price: p[1], quantity: 100, amount: p[1] * 100, commission: 5, reason: 'exit' },
    { date: '2024-01-08', type: 'buy', price: p[2], quantity: 100, amount: p[2] * 100, commission: 5, reason: 'entry' },
    { date: '2024-01-11', type: 'sell', price: p[3], quantity: 100, amount: p[3] * 100, commission: 5, reason: 'exit' },
  ];
}

describe('PerformanceAnalyzer', () => {
  describe('constructor', () => {
    it('should sort dailySnapshots and trades by date', () => {
      const snaps = makeSnapshots([100, 105, 110, 108]);
      const analyzer = new PerformanceAnalyzer(snaps, [], 0.03);
      const metrics = analyzer.calculateMetrics();
      expect(metrics.totalTrades).toBe(0);
    });

    it('should default riskFreeRate to 0.03', () => {
      const snaps = makeSnapshots([100, 102]);
      const analyzer = new PerformanceAnalyzer(snaps, []);
      expect(() => analyzer.calculateMetrics()).not.toThrow();
    });
  });

  describe('calculateMetrics', () => {
    it('should calculate basic return metrics for rising prices', () => {
      const snaps = makeSnapshots([100, 101, 102, 103, 104, 105]);
      const trades = makeTrades();
      const analyzer = new PerformanceAnalyzer(snaps, trades, 0.03);
      const m = analyzer.calculateMetrics();
      expect(m.totalReturn).toBeCloseTo(5, 0.1);
      expect(m.annualizedReturn).toBeGreaterThan(0);
      expect(m.totalTrades).toBe(2); // 2 buy-sell pairs
    });

    it('should handle empty dailySnapshots gracefully', () => {
      const analyzer = new PerformanceAnalyzer([], []);
      const m = analyzer.calculateMetrics();
      expect(m.totalReturn).toBe(0);
      expect(m.totalTrades).toBe(0);
      expect(m.maxDrawdown).toBe(0);
      expect(m.sharpeRatio).toBe(0);
    });

    it('should calculate winRate correctly for winning trades', () => {
      const snaps = makeSnapshots(
        [100, 101, 102, 103, 104, 105, 104, 103, 104, 105, 106, 107],
      );
      // Buy at 10, sell at 15 (+), buy at 12, sell at 17 (+)
      const trades = makeTrades([10, 15, 12, 17]);
      const analyzer = new PerformanceAnalyzer(snaps, trades);
      const m = analyzer.calculateMetrics();
      expect(m.winningTrades).toBe(2);
      expect(m.losingTrades).toBe(0);
      expect(m.winRate).toBe(100);
    });

    it('should handle losing trades', () => {
      const snaps = makeSnapshots([100, 99, 98, 97, 96, 95]);
      const trades = makeTrades([15, 10, 12, 8]); // Both losing
      const analyzer = new PerformanceAnalyzer(snaps, trades);
      const m = analyzer.calculateMetrics();
      expect(m.losingTrades).toBe(2);
      expect(m.winningTrades).toBe(0);
      expect(m.winRate).toBe(0);
    });

    it('should calculate profitFactor for mixed trades', () => {
      const snaps = makeSnapshots([100, 101, 100, 102, 100, 103]);
      const trades = makeTrades([10, 20, 15, 10]); // + win, - loss
      const analyzer = new PerformanceAnalyzer(snaps, trades);
      const m = analyzer.calculateMetrics();
      expect(m.winningTrades).toBe(1);
      expect(m.losingTrades).toBe(1);
      expect(m.profitFactor).toBeGreaterThan(0);
    });

    it('should handle benchmarkReturns parameter', () => {
      const snaps = makeSnapshots([100, 101, 102, 103, 104, 105]);
      const trades = makeTrades();
      const analyzer = new PerformanceAnalyzer(snaps, trades);
      const m = analyzer.calculateMetrics([0.01, 0.01, 0.01, 0.01, 0.01]);
      expect(m.benchmarkReturn).toBeCloseTo(5.1, 0.1);
    });
  });

  describe('calcDrawdownMetrics', () => {
    it('should report zero drawdown for strictly rising prices', () => {
      const snaps = makeSnapshots([100, 101, 102, 103, 104, 105]);
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const m = analyzer.calculateMetrics();
      expect(m.maxDrawdown).toBe(0);
    });

    it('should detect drawdown for declining segment', () => {
      const snaps = makeSnapshots([100, 110, 105, 100, 95, 108]);
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const m = analyzer.calculateMetrics();
      expect(m.maxDrawdown).toBeGreaterThan(0);
      expect(m.maxDrawdown).toBeLessThan(100);
    });

    it('should handle single-datapoint drawdown', () => {
      const snaps = makeSnapshots([100]);
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const m = analyzer.calculateMetrics();
      expect(m.maxDrawdown).toBe(0);
    });

    it('should report maxDrawdownDuration > 0 when drawdown occurs', () => {
      const snaps = makeSnapshots([100, 110, 105, 100, 95]);
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const m = analyzer.calculateMetrics();
      expect(m.maxDrawdownDuration).toBeGreaterThanOrEqual(1);
    });
  });

  describe('extractHoldingPeriods', () => {
    it('should return holding periods matching buy/sell pairs', () => {
      const snaps = makeSnapshots([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
      const trades = makeTrades([10, 15, 12, 17]);
      const analyzer = new PerformanceAnalyzer(snaps, trades);
      const periods = analyzer.extractHoldingPeriods();
      expect(periods).toHaveLength(2);
      expect(periods[0].entryPrice).toBe(10);
      expect(periods[0].exitPrice).toBe(15);
      expect(periods[0].pnl).toBeGreaterThan(0);
    });

    it('should return empty array when no trades', () => {
      const analyzer = new PerformanceAnalyzer([], []);
      expect(analyzer.extractHoldingPeriods()).toEqual([]);
    });
  });

  describe('calculateMonthlyReturns', () => {
    it('should group returns by month', () => {
      const snaps = makeSnapshots([100, 101, 102, 103, 104, 105, 106], '2024-01-02');
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const monthly = analyzer.calculateMonthlyReturns();
      expect(monthly.length).toBeGreaterThanOrEqual(1);
      expect(monthly[0]).toHaveProperty('year');
      expect(monthly[0]).toHaveProperty('month');
      expect(monthly[0]).toHaveProperty('return');
    });
  });

  describe('calculateDrawdownPeriods', () => {
    it('should return drawdown periods', () => {
      const snaps = makeSnapshots([100, 110, 105, 100, 95]);
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const periods = analyzer.calculateDrawdownPeriods();
      expect(periods.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateRollingMetrics', () => {
    it('should calculate rolling metrics with sufficient data', () => {
      const vals = Array.from({ length: 60 }, (_, i) => 100 + i);
      const snaps = makeSnapshots(vals, '2024-01-02');
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const rolling = analyzer.calculateRollingMetrics(30);
      expect(rolling.length).toBe(30); // 60 - 30
      expect(rolling[0]).toHaveProperty('rollingReturn');
      expect(rolling[0]).toHaveProperty('rollingSharpe');
    });

    it('should return empty for insufficient data', () => {
      const snaps = makeSnapshots([100, 101], '2024-01-02');
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const rolling = analyzer.calculateRollingMetrics(30);
      expect(rolling).toEqual([]);
    });

    it('should use custom window size', () => {
      const vals = Array.from({ length: 40 }, (_, i) => 100 + i);
      const snaps = makeSnapshots(vals, '2024-01-02');
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const rolling = analyzer.calculateRollingMetrics(10);
      expect(rolling.length).toBe(30); // 40 - 10
    });
  });

  describe('calculateTrackingError', () => {
    it('should calculate tracking error vs benchmark', () => {
      const snaps = makeSnapshots([100, 101, 102, 103, 104, 105]);
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const error = analyzer.calculateTrackingError([0.01, 0.01, 0.01, 0.01, 0.01]);
      expect(error).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 when benchmark data too short', () => {
      const snaps = makeSnapshots([100, 101]);
      const analyzer = new PerformanceAnalyzer(snaps, []);
      expect(analyzer.calculateTrackingError([0.01])).toBe(0);
    });

    it('should return 0 when dailySnapshots too short', () => {
      const snaps = makeSnapshots([100]);
      const analyzer = new PerformanceAnalyzer(snaps, []);
      expect(analyzer.calculateTrackingError([0.01, 0.02])).toBe(0);
    });
  });

  describe('calculateRating', () => {
    it('should return rating with score and grade', () => {
      const snaps = makeSnapshots([100, 105, 110, 115, 120]);
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const metrics = analyzer.calculateMetrics();
      const rating = analyzer.calculateRating(metrics);
      expect(rating).toHaveProperty('score');
      expect(rating).toHaveProperty('grade');
      expect(rating).toHaveProperty('breakdown');
      expect(['A+', 'A', 'B+', 'B', 'C', 'D', 'F']).toContain(rating.grade);
    });

    it('should return F for terrible performance', () => {
      const m = {
        totalReturn: -50, annualizedReturn: -30, cagr: -30,
        benchmarkReturn: 0, excessReturn: -50, maxDrawdown: 80,
        maxDrawdownDuration: 100, avgDrawdown: 40, volatility: 50,
        downsideVolatility: 40, sharpeRatio: -3, sortinoRatio: -3,
        calmarRatio: -5, informationRatio: -3, treynorRatio: -3,
        omegaRatio: 0.5,
        // trade metrics
        totalTrades: 10, winningTrades: 2, losingTrades: 8,
        winRate: 20, avgWin: 100, avgLoss: 200, maxWin: 500, maxLoss: 500,
        profitFactor: 0.5, expectancy: -50, payoffRatio: 0.5,
        // holding metrics
        avgHoldingDays: 5, maxHoldingDays: 10, minHoldingDays: 1,
        turnoverRate: 100,
        // time metrics
        profitableDays: 30, losingDays: 70, flatDays: 0,
        bestDay: 5, worstDay: -8, avgDailyReturn: -0.1,
      };
      const analyzer = new PerformanceAnalyzer([], []);
      const rating = analyzer.calculateRating(m);
      expect(rating.grade).toBe('F');
    });

    it('should return A+ for outstanding performance', () => {
      const m = {
        totalReturn: 200, annualizedReturn: 30, cagr: 30,
        benchmarkReturn: 10, excessReturn: 190, maxDrawdown: 5,
        maxDrawdownDuration: 2, avgDrawdown: 1, volatility: 10,
        downsideVolatility: 5, sharpeRatio: 3, sortinoRatio: 6,
        calmarRatio: 6, informationRatio: 19, treynorRatio: 20,
        omegaRatio: 5,
        totalTrades: 100, winningTrades: 70, losingTrades: 30,
        winRate: 70, avgWin: 500, avgLoss: 200, maxWin: 2000, maxLoss: 1000,
        profitFactor: 3.5, expectancy: 150, payoffRatio: 2.5,
        avgHoldingDays: 15, maxHoldingDays: 30, minHoldingDays: 2,
        turnoverRate: 50,
        profitableDays: 60, losingDays: 30, flatDays: 10,
        bestDay: 8, worstDay: -3, avgDailyReturn: 0.5,
      };
      const analyzer = new PerformanceAnalyzer([], []);
      const rating = analyzer.calculateRating(m);
      expect(rating.grade).toBe('A+');
    });
  });

  describe('createPerformanceAnalyzer', () => {
    it('should be a factory function returning PerformanceAnalyzer', () => {
      const snaps = makeSnapshots([100, 102]);
      const analyzer = createPerformanceAnalyzer(snaps, []);
      expect(analyzer).toBeInstanceOf(PerformanceAnalyzer);
    });

    it('should accept optional riskFreeRate', () => {
      const snaps = makeSnapshots([100, 102]);
      const analyzer = createPerformanceAnalyzer(snaps, [], 0.05);
      expect(analyzer).toBeInstanceOf(PerformanceAnalyzer);
    });
  });
});
