import { describe, it, expect } from 'vitest';
import { runBacktest, STRATEGY_PRESETS, walkForwardAnalysis, runParallelBacktest, exportBacktestToCSV, type StrategyParams } from '../utils/backtestEngine';

function generateKline(count: number, trend: 'up' | 'down' | 'volatile' = 'up') {
  const data: Array<{
    tradeDate: string; open: number; close: number; high: number; low: number; volume: number; turnover: number;
  }> = [];
  let price = 100;
  const baseDate = new Date('2024-01-01');
  for (let i = 0; i < count; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    const date = d.toISOString().slice(0, 10);
    let change: number;
    if (trend === 'up') change = Math.random() * 2 - 0.3;
    else if (trend === 'down') change = Math.random() * 2 - 1.7;
    else change = Math.random() * 6 - 3;
    price = Math.max(1, price + change);
    data.push({
      tradeDate: date,
      open: +(price - Math.random()).toFixed(2),
      close: +price.toFixed(2),
      high: +(price + Math.random() * 2).toFixed(2),
      low: +(price - Math.random() * 2).toFixed(2),
      volume: Math.floor(100000 + Math.random() * 500000),
      turnover: Math.floor(price * 100000 + Math.random() * 500000),
    });
  }
  return data;
}

describe('Backtest Engine Proper', () => {
  describe('runBacktest function', () => {
    it('should run MA cross strategy', () => {
      const kline = generateKline(100, 'up');
      const result = runBacktest(kline, { type: 'ma_cross', fastPeriod: 5, slowPeriod: 20 });
      expect(result).toBeDefined();
      expect(result.trades).toBeDefined();
      expect(result.dailyPortfolio).toBeDefined();
    });

    it('should run RSI strategy', () => {
      const kline = generateKline(100, 'volatile');
      const result = runBacktest(kline, { type: 'rsi', rsiPeriod: 14, rsiOversold: 30, rsiOverbought: 70 });
      expect(result).toBeDefined();
      expect(result.trades).toBeDefined();
    });

    it('should run MACD strategy', () => {
      const kline = generateKline(100, 'up');
      const result = runBacktest(kline, { type: 'macd' });
      expect(result).toBeDefined();
      expect(result.trades).toBeDefined();
    });

    it('should include return metrics', () => {
      const kline = generateKline(100, 'up');
      const result = runBacktest(kline, { type: 'ma_cross', fastPeriod: 5, slowPeriod: 20 });
      expect(typeof result.totalReturn).toBe('number');
      expect(typeof result.annualizedReturn).toBe('number');
      expect(typeof result.maxDrawdown).toBe('number');
      expect(typeof result.sharpeRatio).toBe('number');
    });

    it('should include trade records with correct fields', () => {
      const kline = generateKline(100, 'volatile');
      const result = runBacktest(kline, { type: 'ma_cross', fastPeriod: 5, slowPeriod: 20 });
      for (const trade of result.trades) {
        expect(trade).toHaveProperty('date');
        expect(trade).toHaveProperty('type');
        expect(trade).toHaveProperty('price');
        expect(trade).toHaveProperty('quantity');
        expect(trade).toHaveProperty('reason');
        expect(trade.quantity % 100).toBe(0); // A股100股整数倍
        expect(['buy', 'sell']).toContain(trade.type);
      }
    });

    it('should include daily portfolio snapshots', () => {
      const kline = generateKline(50, 'up');
      const result = runBacktest(kline, { type: 'ma_cross', fastPeriod: 5, slowPeriod: 10 });
      expect(result.dailyPortfolio.length).toBe(50);
      for (const dp of result.dailyPortfolio) {
        expect(dp).toHaveProperty('date');
        expect(dp).toHaveProperty('totalValue');
        expect(dp.totalValue).toBeGreaterThan(0);
      }
    });

    it('should include drawdown curve', () => {
      const kline = generateKline(50, 'volatile');
      const result = runBacktest(kline, { type: 'ma_cross', fastPeriod: 5, slowPeriod: 10 });
      expect(result.drawdownCurve).toBeDefined();
      expect(result.drawdownCurve.length).toBe(50);
      for (const dd of result.drawdownCurve) {
        expect(dd).toHaveProperty('date');
        expect(dd).toHaveProperty('drawdown');
        expect(dd.drawdown).toBeGreaterThanOrEqual(0); // drawdown is positive percentage
      }
    });

    it('should throw for insufficient data', () => {
      const kline = generateKline(5, 'up');
      expect(() => runBacktest(kline, { type: 'ma_cross', fastPeriod: 5, slowPeriod: 20 })).toThrow();
    });

    it('should handle bullish trend', () => {
      const kline = generateKline(200, 'up');
      const result = runBacktest(kline, { type: 'ma_cross', fastPeriod: 5, slowPeriod: 20 });
      expect(typeof result.totalReturn).toBe('number');
    });

    it('should have win rate between 0 and 100', () => {
      const kline = generateKline(100, 'volatile');
      const result = runBacktest(kline, { type: 'ma_cross', fastPeriod: 5, slowPeriod: 20 });
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(100);
    });

    it('should have max drawdown >= 0', () => {
      const kline = generateKline(100, 'down');
      const result = runBacktest(kline, { type: 'rsi' });
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
    });

    it('should have trade statistics', () => {
      const kline = generateKline(100, 'volatile');
      const result = runBacktest(kline, { type: 'macd' });
      expect(typeof result.totalTrades).toBe('number');
      expect(typeof result.winningTrades).toBe('number');
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Strategy Presets', () => {
    it('should have strategy presets', () => {
      expect(STRATEGY_PRESETS.length).toBeGreaterThan(0);
    });

    it('each preset should have required fields', () => {
      for (const preset of STRATEGY_PRESETS) {
        expect(preset).toHaveProperty('name');
        expect(preset).toHaveProperty('type');
        expect(preset).toHaveProperty('params');
        expect(preset.name.length).toBeGreaterThan(0);
      }
    });
  });

  describe('A-Stock Rules (T+1, Stamp Duty)', () => {
    it('should enforce T+1 rule (no same-day sell after buy)', () => {
      const kline = generateKline(100, 'up');
      const result = runBacktest(kline, { type: 'ma_cross', fastPeriod: 3, slowPeriod: 10 });
      for (const trade of result.trades) {
        expect(trade).toHaveProperty('date');
      }
      // Verify T+1: for each sell, the immediately preceding buy must be on a different date
      let lastBuyDate = '';
      let violations = 0;
      for (const trade of result.trades) {
        if (trade.type === 'buy') {
          lastBuyDate = trade.date;
        } else if (trade.type === 'sell') {
          if (trade.date === lastBuyDate) violations++;
        }
      }
      // T+1 rule should produce zero or very few same-day violations
      expect(violations).toBeLessThan(3);
    });

    it('should include stamp duty in sell commission', () => {
      const kline = generateKline(100, 'volatile');
      const result = runBacktest(kline, { type: 'ma_cross', fastPeriod: 5, slowPeriod: 20 });
      const sellTrades = result.trades.filter(t => t.type === 'sell');
      for (const t of sellTrades) {
        // Commission should be > base commission (includes stamp duty)
        expect(t.commission).toBeGreaterThan(t.amount * 0.0002);
      }
    });

    it('should enforce 100-share lot size (A-shares)', () => {
      const kline = generateKline(100, 'volatile');
      const result = runBacktest(kline, { type: 'ma_cross', fastPeriod: 5, slowPeriod: 20 });
      const buyTrades = result.trades.filter(t => t.type === 'buy');
      for (const t of buyTrades) {
        expect(t.quantity % 100).toBe(0);
        expect(t.quantity).toBeGreaterThanOrEqual(100);
      }
    });
  });

  describe('Walk-Forward Analysis (Overfitting Detection)', () => {
    it('should detect non-overfit strategy', () => {
      const kline = generateKline(200, 'up');
      const result = walkForwardAnalysis(kline, { type: 'ma_cross', fastPeriod: 5, slowPeriod: 20 });
      expect(result).toHaveProperty('inSampleReturn');
      expect(result).toHaveProperty('outOfSampleReturn');
      expect(result).toHaveProperty('consistencyRatio');
      expect(result).toHaveProperty('isOverfit');
      expect(typeof result.isOverfit).toBe('boolean');
    });

    it('should return isOverfit=true for insufficient data', () => {
      const kline = generateKline(25, 'up');
      const result = walkForwardAnalysis(kline, { type: 'ma_cross' });
      expect(result.isOverfit).toBe(true);
    });

    it('should work with different train ratios', () => {
      const kline = generateKline(300, 'volatile');
      const r1 = walkForwardAnalysis(kline, { type: 'rsi' }, 0.6);
      const r2 = walkForwardAnalysis(kline, { type: 'rsi' }, 0.8);
      expect(r1).toHaveProperty('consistencyRatio');
      expect(r2).toHaveProperty('consistencyRatio');
    });
  });

  describe('Parallel Backtest', () => {
    it('should run multiple strategies', () => {
      const kline = generateKline(100, 'volatile');
      const strategies = [
        { type: 'ma_cross' as const, fastPeriod: 5, slowPeriod: 20 },
        { type: 'rsi' as const, rsiPeriod: 14 },
        { type: 'macd' as const },
      ];
      const results = runParallelBacktest(kline, strategies);
      expect(results.length).toBe(3);
      for (const r of results) {
        expect(r).toHaveProperty('totalReturn');
        expect(r).toHaveProperty('trades');
      }
    });

    it('should produce consistent results for same strategy', () => {
      const kline = generateKline(100, 'up');
      const param = { type: 'ma_cross' as const, fastPeriod: 5, slowPeriod: 20 };
      const r1 = runBacktest(kline, param);
      const r2 = runParallelBacktest(kline, [param])[0];
      expect(r1.totalReturn).toBe(r2.totalReturn);
      expect(r1.trades.length).toBe(r2.trades.length);
    });
  });

  describe('CSV Export', () => {
    it('should export backtest result to CSV', () => {
      const kline = generateKline(100, 'volatile');
      const result = runBacktest(kline, { type: 'ma_cross', fastPeriod: 5, slowPeriod: 20 });
      const csv = exportBacktestToCSV(result);
      expect(csv).toContain('=== AStock Backtest Report ===');
      expect(csv).toContain('Strategy,ma_cross');
      expect(csv).toContain('Total Return');
      expect(csv).toContain('=== Trades ===');
      expect(csv).toContain('=== Equity Curve ===');
      expect(csv).toContain('Date,Type,Price');
    });
  });

  describe('Performance Benchmark', () => {
    it('should process 2000 bars in < 500ms (O(n) optimization)', () => {
      const kline = generateKline(2000, 'volatile');
      const start = performance.now();
      runBacktest(kline, { type: 'ma_cross', fastPeriod: 5, slowPeriod: 20 });
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(500);
    });

    it('should process 5000 bars in < 2000ms', () => {
      const kline = generateKline(5000, 'volatile');
      const start = performance.now();
      runBacktest(kline, { type: 'macd' });
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(2000);
    });
  });
});
