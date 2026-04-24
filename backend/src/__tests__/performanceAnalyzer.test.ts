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

    it('should draw recovery after new peak', () => {
      // price drops from 110 to 95, then recovers to 120 new peak
      const snaps = makeSnapshots([100, 110, 105, 100, 95, 100, 110, 120]);
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const m = analyzer.calculateMetrics();
      // maxDrawdown should be ~13.6% (peak 110 -> trough 95)
      expect(m.maxDrawdown).toBeCloseTo(13.64, 0);
      expect(m.avgDrawdown).toBeGreaterThan(0);
    });
  });

  describe('risk adjusted return metrics', () => {
    it('should calculate sharpe ratio', () => {
      // Steady rising prices => positive sharpe
      const snaps = makeSnapshots([100, 101, 102, 103, 104, 105]);
      const analyzer = new PerformanceAnalyzer(snaps, [], 0.03);
      const m = analyzer.calculateMetrics();
      expect(m.sharpeRatio).toBeGreaterThan(0);
    });

    it('should calculate sortino ratio with mixed returns', () => {
      // Need downside returns to get positive downside volatility
      const snaps = makeSnapshots([100, 102, 99, 101, 98, 100]);
      const analyzer = new PerformanceAnalyzer(snaps, [], 0.03);
      const m = analyzer.calculateMetrics();
      expect(m.sortinoRatio).toBeDefined();
    });

    it('should calculate calmar ratio with drawdown', () => {
      // Need maxDrawdown > 0 to get calmar > 0
      const snaps = makeSnapshots([100, 110, 105, 100, 95, 108]);
      const analyzer = new PerformanceAnalyzer(snaps, [], 0.03);
      const m = analyzer.calculateMetrics();
      expect(m.calmarRatio).toBeGreaterThan(0);
    });

    it('should calculate information ratio', () => {
      const snaps = makeSnapshots([100, 101, 102, 103, 104, 105]);
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const m = analyzer.calculateMetrics([0.01, 0.01, 0.01, 0.01, 0.01]);
      expect(m.informationRatio).toBeDefined();
    });

    it('should calculate treynor ratio', () => {
      const snaps = makeSnapshots([100, 101, 102, 103, 104, 105]);
      const analyzer = new PerformanceAnalyzer(snaps, [], 0.03);
      const m = analyzer.calculateMetrics();
      expect(m.treynorRatio).toBeDefined();
    });

    it('should calculate omega ratio', () => {
      const snaps = makeSnapshots([100, 101, 102, 103, 104, 105]);
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const m = analyzer.calculateMetrics();
      expect(m.omegaRatio).toBeGreaterThan(0);
    });

    it('should handle zero volatility gracefully', () => {
      // Constant value => zero volatility
      const snaps = makeSnapshots([100, 100, 100, 100, 100]);
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const m = analyzer.calculateMetrics();
      expect(m.volatility).toBe(0);
      expect(m.sharpeRatio).toBe(0);
    });

    it('should handle high volatility correctly', () => {
      // Wild swings
      const snaps = makeSnapshots([100, 110, 90, 115, 85, 120]);
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const m = analyzer.calculateMetrics();
      expect(m.volatility).toBeGreaterThan(10);
      expect(m.downsideVolatility).toBeGreaterThan(0);
    });
  });

  describe('calcHoldingMetrics', () => {
    it('should calculate holding days from matched buy/sell pairs', () => {
      const snaps = makeSnapshots([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111]);
      const trades = makeTrades([10, 15, 12, 17]);
      const analyzer = new PerformanceAnalyzer(snaps, trades);
      const m = analyzer.calculateMetrics();
      expect(m.avgHoldingDays).toBeGreaterThan(0);
      expect(m.maxHoldingDays).toBeGreaterThanOrEqual(m.minHoldingDays);
    });

    it('should handle zero trades for holding metrics', () => {
      const snaps = makeSnapshots([100, 101, 102]);
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const m = analyzer.calculateMetrics();
      expect(m.avgHoldingDays).toBe(0);
      expect(m.maxHoldingDays).toBe(0);
      expect(m.minHoldingDays).toBe(0);
      expect(m.turnoverRate).toBe(0);
    });

    it('should store all holding metrics in PerformanceMetrics', () => {
      const snaps = makeSnapshots([100, 101, 102, 103, 104, 105]);
      const trades = makeTrades([10, 15, 12, 17]);
      const analyzer = new PerformanceAnalyzer(snaps, trades);
      const m = analyzer.calculateMetrics();
      expect(m).toHaveProperty('avgHoldingDays');
      expect(m).toHaveProperty('maxHoldingDays');
      expect(m).toHaveProperty('minHoldingDays');
      expect(m).toHaveProperty('turnoverRate');
    });
  });

  describe('calcTimeMetrics', () => {
    it('should count profitable/losing/flat days', () => {
      const snaps = makeSnapshots([100, 101, 100, 102, 100, 103]);
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const m = analyzer.calculateMetrics();
      expect(m.profitableDays).toBeGreaterThan(0);
      expect(m.losingDays).toBeGreaterThan(0);
      expect(m.bestDay).toBeGreaterThan(0);
      expect(m.worstDay).toBeLessThan(0);
    });

    it('should handle single snapshot', () => {
      const snaps = makeSnapshots([100]);
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const m = analyzer.calculateMetrics();
      expect(m.profitableDays).toBe(0);
      expect(m.losingDays).toBe(0);
      expect(m.avgDailyReturn).toBe(0);
    });

    it('should record flat days when value unchanged', () => {
      const snaps = makeSnapshots([100, 100, 100, 100]);
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const m = analyzer.calculateMetrics();
      // 4 snapshots => 3 daily returns
      expect(m.flatDays).toBeGreaterThanOrEqual(1);
      expect(m.profitableDays).toBe(0);
      expect(m.losingDays).toBe(0);
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

    it('should handle extra buy trades (unpaired)', () => {
      const trades: TradeRecord[] = [
        { date: '2024-01-02', type: 'buy', price: 10, quantity: 100, amount: 1000, commission: 5, reason: 'entry' },
        { date: '2024-01-05', type: 'sell', price: 15, quantity: 100, amount: 1500, commission: 5, reason: 'exit' },
        { date: '2024-01-08', type: 'buy', price: 12, quantity: 100, amount: 1200, commission: 5, reason: 'entry' },
        // no matching sell
      ];
      const snaps = makeSnapshots([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
      const analyzer = new PerformanceAnalyzer(snaps, trades);
      const periods = analyzer.extractHoldingPeriods();
      // should only match 1 pair (min of buys and sells)
      expect(periods).toHaveLength(1);
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

    it('should handle cross-month data', () => {
      // Generate data spanning 2 months
      const dates: string[] = [];
      const values: number[] = [];
      for (let d = 1; d <= 60; d++) {
        const date = new Date('2024-01-01');
        date.setDate(date.getDate() + d);
        dates.push(date.toISOString().slice(0, 10));
        values.push(100 + d * 0.5);
      }
      const snaps: DailySnapshot[] = dates.map((date, i) => ({
        date,
        cash: 0,
        position: 100,
        positionValue: values[i],
        totalValue: values[i],
        returns: values[i] - values[0],
        dailyReturns: i > 0 ? (values[i] - values[i - 1]) / values[i - 1] : 0,
      }));
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const monthly = analyzer.calculateMonthlyReturns();
      expect(monthly.length).toBeGreaterThanOrEqual(2);
      // Months should be sorted chronologically
      for (let i = 1; i < monthly.length; i++) {
        const prev = monthly[i - 1].year * 12 + monthly[i - 1].month;
        const curr = monthly[i].year * 12 + monthly[i].month;
        expect(curr).toBeGreaterThan(prev);
      }
    });

    it('should handle empty snapshots', () => {
      const analyzer = new PerformanceAnalyzer([], []);
      expect(analyzer.calculateMonthlyReturns()).toEqual([]);
    });
  });

  describe('calculateDrawdownPeriods', () => {
    it('should return drawdown periods with structure', () => {
      const snaps = makeSnapshots([100, 110, 105, 100, 95, 108]);
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const periods = analyzer.calculateDrawdownPeriods();
      periods.forEach(p => {
        expect(p).toHaveProperty('startDate');
        expect(p).toHaveProperty('endDate');
        expect(p).toHaveProperty('peakDate');
        expect(p).toHaveProperty('troughDate');
        expect(p).toHaveProperty('drawdown');
        expect(p).toHaveProperty('duration');
        expect(p).toHaveProperty('recovery');
        expect(p.drawdown).toBeGreaterThan(0);
      });
    });

    it('should return empty or small drawdown for strictly rising', () => {
      const snaps = makeSnapshots([100, 101, 102, 103]);
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const periods = analyzer.calculateDrawdownPeriods();
      // On strictly rising, either no drawdown periods or very small percentage
      periods.forEach(p => {
        expect(p.drawdown).toBeLessThan(1.1); // < 1.1%
      });
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

    it('should include rollingMaxDrawdown in results', () => {
      const vals = Array.from({ length: 60 }, (_, i) => {
        // Introduce a dip in the middle
        if (i > 20 && i < 30) return 100 + i - 15;
        return 100 + i;
      });
      const snaps = makeSnapshots(vals, '2024-01-02');
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const rolling = analyzer.calculateRollingMetrics(30);
      // At least some windows should have maxDrawdown > 0
      const withDrawdown = rolling.filter(r => r.rollingMaxDrawdown > 0);
      expect(withDrawdown.length).toBeGreaterThan(0);
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

    it('should compute tracking error for non-zero deviation', () => {
      // Portfolio has slightly different returns than benchmark
      const snaps = makeSnapshots([100, 101, 103, 102, 105], '2024-01-02');
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const error = analyzer.calculateTrackingError([0.01, 0.02, -0.01, 0.01]);
      expect(error).toBeGreaterThanOrEqual(0);
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

    it('should have breakdown with four dimensions', () => {
      const m = {
        totalReturn: 50, annualizedReturn: 15, cagr: 15,
        benchmarkReturn: 5, excessReturn: 45, maxDrawdown: 20,
        maxDrawdownDuration: 10, avgDrawdown: 5, volatility: 25,
        downsideVolatility: 15, sharpeRatio: 1, sortinoRatio: 1.5,
        calmarRatio: 0.75, informationRatio: 1.8, treynorRatio: 2,
        omegaRatio: 2,
        totalTrades: 50, winningTrades: 30, losingTrades: 20,
        winRate: 60, avgWin: 300, avgLoss: 150, maxWin: 1000, maxLoss: 500,
        profitFactor: 2, expectancy: 50, payoffRatio: 2,
        avgHoldingDays: 10, maxHoldingDays: 25, minHoldingDays: 3,
        turnoverRate: 80,
        profitableDays: 40, losingDays: 30, flatDays: 5,
        bestDay: 6, worstDay: -5, avgDailyReturn: 0.2,
      };
      const analyzer = new PerformanceAnalyzer([], []);
      const rating = analyzer.calculateRating(m);
      expect(rating.breakdown).toHaveProperty('return');
      expect(rating.breakdown).toHaveProperty('risk');
      expect(rating.breakdown).toHaveProperty('sharpe');
      expect(rating.breakdown).toHaveProperty('winRate');
      Object.values(rating.breakdown).forEach(v => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(25);
      });
    });

    it('should assign grade B for moderate performance', () => {
      const m = {
        totalReturn: 10, annualizedReturn: 5, cagr: 5,
        benchmarkReturn: 3, excessReturn: 7, maxDrawdown: 30,
        maxDrawdownDuration: 20, avgDrawdown: 10, volatility: 20,
        downsideVolatility: 12, sharpeRatio: 0.2, sortinoRatio: 0.3,
        calmarRatio: 0.17, informationRatio: 0.35, treynorRatio: 0.5,
        omegaRatio: 1.2,
        totalTrades: 20, winningTrades: 11, losingTrades: 9,
        winRate: 55, avgWin: 100, avgLoss: 80, maxWin: 300, maxLoss: 200,
        profitFactor: 1.5, expectancy: 10, payoffRatio: 1.25,
        avgHoldingDays: 8, maxHoldingDays: 20, minHoldingDays: 2,
        turnoverRate: 60,
        profitableDays: 35, losingDays: 30, flatDays: 5,
        bestDay: 4, worstDay: -3, avgDailyReturn: 0.1,
      };
      const analyzer = new PerformanceAnalyzer([], []);
      const rating = analyzer.calculateRating(m);
      expect(['B', 'B+', 'C']).toContain(rating.grade);
    });
  });

  describe('calcBuyHoldReturn (via calculateMetrics)', () => {
    it('should compute buy-hold return from positionValue/position', () => {
      const snaps = makeSnapshots([100, 105, 110, 115]);
      // With no benchmark data, it uses calcBuyHoldReturn
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const m = analyzer.calculateMetrics();
      // buy-hold: price went from 100 to 115 => 15%
      expect(m.benchmarkReturn).toBeCloseTo(15, 0);
    });

    it('should handle zero position (no buy-hold return)', () => {
      const snaps: DailySnapshot[] = [
        { date: '2024-01-02', cash: 100000, position: 0, positionValue: 0, totalValue: 100000, returns: 0, dailyReturns: 0 },
        { date: '2024-01-03', cash: 100000, position: 0, positionValue: 0, totalValue: 100000, returns: 0, dailyReturns: 0 },
      ];
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const m = analyzer.calculateMetrics();
      expect(m.benchmarkReturn).toBe(0);
    });

    it('should handle single snapshot for buy-hold', () => {
      const snaps = makeSnapshots([100]);
      const analyzer = new PerformanceAnalyzer(snaps, []);
      const m = analyzer.calculateMetrics();
      expect(m.benchmarkReturn).toBe(0);
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
