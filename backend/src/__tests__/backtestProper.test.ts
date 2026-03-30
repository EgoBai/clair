import { describe, it, expect } from 'vitest';
import { runBacktest, STRATEGY_PRESETS, type StrategyParams } from '../utils/backtestEngine';

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
      const result = runBacktest(kline, { type: 'ma_cross', maShort: 5, maLong: 20 });
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
      const result = runBacktest(kline, { type: 'ma_cross', maShort: 5, maLong: 20 });
      expect(typeof result.totalReturn).toBe('number');
      expect(typeof result.annualizedReturn).toBe('number');
      expect(typeof result.maxDrawdown).toBe('number');
      expect(typeof result.sharpeRatio).toBe('number');
    });

    it('should include trade records with correct fields', () => {
      const kline = generateKline(100, 'volatile');
      const result = runBacktest(kline, { type: 'ma_cross', maShort: 5, maLong: 20 });
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
      const result = runBacktest(kline, { type: 'ma_cross', maShort: 5, maLong: 10 });
      expect(result.dailyPortfolio.length).toBe(50);
      for (const dp of result.dailyPortfolio) {
        expect(dp).toHaveProperty('date');
        expect(dp).toHaveProperty('totalValue');
        expect(dp.totalValue).toBeGreaterThan(0);
      }
    });

    it('should include drawdown curve', () => {
      const kline = generateKline(50, 'volatile');
      const result = runBacktest(kline, { type: 'ma_cross', maShort: 5, maLong: 10 });
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
      expect(() => runBacktest(kline, { type: 'ma_cross', maShort: 5, maLong: 20 })).toThrow();
    });

    it('should handle bullish trend', () => {
      const kline = generateKline(200, 'up');
      const result = runBacktest(kline, { type: 'ma_cross', maShort: 5, maLong: 20 });
      expect(typeof result.totalReturn).toBe('number');
    });

    it('should have win rate between 0 and 100', () => {
      const kline = generateKline(100, 'volatile');
      const result = runBacktest(kline, { type: 'ma_cross', maShort: 5, maLong: 20 });
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
});
