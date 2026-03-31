import { describe, it, expect } from 'vitest';
import {
  testCointegration,
  generatePairsSignals,
  backtestPairs,
  calculateOptimalHedgeRatio,
  type PriceSeries,
} from '../utils/pairsTradingEngine';

// Create cointegrated series
const base = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i * 0.1) * 5);
const series1: PriceSeries = {
  symbol: 'AAPL',
  prices: base,
  timestamps: base.map((_, i) => `2025-01-${(i + 1).toString().padStart(2, '0')}`),
};
const series2: PriceSeries = {
  symbol: 'MSFT',
  prices: base.map(v => v * 1.02 + Math.random() * 0.5),
  timestamps: series1.timestamps,
};

describe('PairsTradingEngine', () => {
  it('should test cointegration', () => {
    const result = testCointegration(series1, series2);
    expect(result.symbol1).toBe('AAPL');
    expect(result.symbol2).toBe('MSFT');
    expect(result.hedgeRatio).toBeGreaterThan(0);
    expect(result.spread.length).toBe(100);
    expect(result.spreadStd).toBeGreaterThan(0);
  });

  it('should handle insufficient data', () => {
    const short = { symbol: 'X', prices: [1, 2, 3], timestamps: [] };
    const result = testCointegration(short, { symbol: 'Y', prices: [1, 2, 3], timestamps: [] });
    expect(result.isCointegrated).toBe(false);
    expect(result.hedgeRatio).toBe(0);
  });

  it('should generate pairs signals', () => {
    const coint = testCointegration(series1, series2);
    const signals = generatePairsSignals(coint, series1.timestamps, 1.5, 0.3);
    expect(Array.isArray(signals)).toBe(true);
    for (const sig of signals) {
      expect(['long_spread', 'short_spread', 'exit']).toContain(sig.signal);
      expect(typeof sig.zScore).toBe('number');
      expect(sig.confidence).toBeGreaterThanOrEqual(0);
      expect(sig.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('should alternate entry and exit signals', () => {
    // Create series with clear mean reversion
    const spread = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.5) * 10);
    const s1: PriceSeries = { symbol: 'A', prices: Array(50).fill(100), timestamps: Array.from({ length: 50 }, (_, i) => `d${i}`) };
    const s2: PriceSeries = { symbol: 'B', prices: spread, timestamps: s1.timestamps };
    const coint = testCointegration(s1, s2);
    const signals = generatePairsSignals(coint, s1.timestamps, 1.0, 0.3);
    
    // Check that entries and exits alternate
    let lastWasEntry = false;
    for (const sig of signals) {
      if (sig.signal !== 'exit') {
        expect(lastWasEntry).toBe(false); // Shouldn't have two entries in a row
        lastWasEntry = true;
      } else {
        expect(lastWasEntry).toBe(true); // Exit should follow entry
        lastWasEntry = false;
      }
    }
  });

  it('should backtest pairs strategy', () => {
    const coint = testCointegration(series1, series2);
    const result = backtestPairs(coint, series1.timestamps, 1.5, 0.3);
    expect(result.pair).toEqual(['AAPL', 'MSFT']);
    expect(typeof result.totalReturn).toBe('number');
    expect(typeof result.winRate).toBe('number');
    expect(result.winRate).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeLessThanOrEqual(1);
    expect(result.numTrades).toBeGreaterThanOrEqual(0);
  });

  it('should calculate optimal hedge ratio - OLS', () => {
    const ratios = calculateOptimalHedgeRatio(series1.prices, series2.prices, 'ols');
    expect(ratios.length).toBe(100);
    // All should be the same (global OLS)
    expect(ratios[0]).toBe(ratios[99]);
  });

  it('should calculate optimal hedge ratio - rolling', () => {
    const ratios = calculateOptimalHedgeRatio(series1.prices, series2.prices, 'rolling', 20);
    expect(ratios.length).toBe(100);
    // Early values may differ from later values
    expect(typeof ratios[0]).toBe('number');
  });

  it('should handle empty series for hedge ratio', () => {
    const ratios = calculateOptimalHedgeRatio([], [], 'ols');
    expect(ratios.length).toBe(0);
  });

  it('should generate no signals for zero spread std', () => {
    const flatCoint = {
      symbol1: 'A', symbol2: 'B',
      adfStatistic: 0, pValue: 1, isCointegrated: false,
      halfLife: 0, hedgeRatio: 1,
      spread: Array(10).fill(100),
      spreadMean: 100, spreadStd: 0,
    };
    const signals = generatePairsSignals(flatCoint, []);
    expect(signals.length).toBe(0);
  });

  it('should handle backtest with no trades', () => {
    const flatCoint = {
      symbol1: 'A', symbol2: 'B',
      adfStatistic: 0, pValue: 1, isCointegrated: false,
      halfLife: 0, hedgeRatio: 1,
      spread: Array(10).fill(100),
      spreadMean: 100, spreadStd: 0.001,
    };
    const result = backtestPairs(flatCoint, Array.from({ length: 10 }, (_, i) => `d${i}`));
    expect(result.numTrades).toBe(0);
    expect(result.winRate).toBe(0);
  });
});
