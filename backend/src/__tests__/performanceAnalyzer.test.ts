import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceAnalyzer, DailySnapshot, TradeRecord } from '../utils/performanceAnalyzer';

describe('PerformanceAnalyzer', () => {
  const makeSnapshots = (returns: number[]): DailySnapshot[] => {
    let value = 100000;
    return returns.map((r, i) => {
      value = value * (1 + r / 100);
      return {
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        cash: value * 0.2,
        position: 800,
        positionValue: value * 0.8,
        totalValue: value,
        returns: ((value - 100000) / 100000) * 100,
        dailyReturns: r,
      };
    });
  };

  const makeTrades = (overrides: Partial<TradeRecord> = []): TradeRecord[] => [
    { date: '2024-01-02', type: 'buy', price: 100, quantity: 100, amount: 10000, commission: 10, reason: 'signal' },
    { date: '2024-01-05', type: 'sell', price: 110, quantity: 100, amount: 11000, commission: 11, reason: 'take_profit' },
    { date: '2024-01-07', type: 'buy', price: 105, quantity: 100, amount: 10500, commission: 10, reason: 'signal' },
    { date: '2024-01-10', type: 'sell', price: 95, quantity: 100, amount: 9500, commission: 9, reason: 'stop_loss' },
  ];

  describe('calculateMetrics', () => {
    it('should calculate total return', () => {
      const snapshots = makeSnapshots([1, 2, -1, 0.5, 1.5]);
      const analyzer = new PerformanceAnalyzer(snapshots, []);
      const metrics = analyzer.calculateMetrics();

      expect(metrics.totalReturn).toBeDefined();
      expect(typeof metrics.totalReturn).toBe('number');
    });

    it('should calculate annualized return', () => {
      const snapshots = makeSnapshots([1, 2, -1, 0.5, 1.5]);
      const analyzer = new PerformanceAnalyzer(snapshots, []);
      const metrics = analyzer.calculateMetrics();

      expect(metrics.annualizedReturn).toBeDefined();
    });

    it('should calculate max drawdown', () => {
      const snapshots = makeSnapshots([5, 3, -2, -3, -1, 2, 4]);
      const analyzer = new PerformanceAnalyzer(snapshots, []);
      const metrics = analyzer.calculateMetrics();

      expect(metrics.maxDrawdown).toBeGreaterThanOrEqual(0);
    });

    it('should calculate volatility', () => {
      const snapshots = makeSnapshots([1, -1, 2, -2, 1.5, -0.5, 1, -1.5]);
      const analyzer = new PerformanceAnalyzer(snapshots, []);
      const metrics = analyzer.calculateMetrics();

      expect(metrics.volatility).toBeGreaterThanOrEqual(0);
    });

    it('should calculate Sharpe ratio', () => {
      const snapshots = makeSnapshots([0.5, 1, -0.5, 1.5, -1, 0.8, 1.2]);
      const analyzer = new PerformanceAnalyzer(snapshots, []);
      const metrics = analyzer.calculateMetrics();

      expect(typeof metrics.sharpeRatio).toBe('number');
    });

    it('should calculate Sortino ratio', () => {
      const snapshots = makeSnapshots([0.5, 1, -0.5, 1.5, -1, 0.8, 1.2]);
      const analyzer = new PerformanceAnalyzer(snapshots, []);
      const metrics = analyzer.calculateMetrics();

      expect(typeof metrics.sortinoRatio).toBe('number');
    });

    it('should calculate win rate from trades', () => {
      const snapshots = makeSnapshots([1, -0.5, 1.5, -1, 0.8]);
      const analyzer = new PerformanceAnalyzer(snapshots, makeTrades());
      const metrics = analyzer.calculateMetrics();

      expect(metrics.winRate).toBeGreaterThanOrEqual(0);
      expect(metrics.winRate).toBeLessThanOrEqual(100);
    });

    it('should calculate profit factor', () => {
      const snapshots = makeSnapshots([1, -0.5, 1.5, -1, 0.8]);
      const analyzer = new PerformanceAnalyzer(snapshots, makeTrades());
      const metrics = analyzer.calculateMetrics();

      expect(metrics.profitFactor).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty trades', () => {
      const snapshots = makeSnapshots([1, 2, -1]);
      const analyzer = new PerformanceAnalyzer(snapshots, []);
      const metrics = analyzer.calculateMetrics();

      expect(metrics.totalTrades).toBe(0);
    });

    it('should calculate profitable/losing days', () => {
      const snapshots = makeSnapshots([1, -0.5, 0, 1.5, -1]);
      const analyzer = new PerformanceAnalyzer(snapshots, []);
      const metrics = analyzer.calculateMetrics();

      expect(metrics.profitableDays + metrics.losingDays + metrics.flatDays)
        .toBe(snapshots.length);
    });
  });

});
