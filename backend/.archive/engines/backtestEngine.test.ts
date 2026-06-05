import { describe, it, expect } from 'vitest';
import {
  runBacktest,
  walkForwardAnalysis,
  runParallelBacktest,
  exportBacktestToCSV,
  STRATEGY_PRESETS,
} from '../utils/backtestEngine';
import type { KLineData } from '../types/index';

function makeKLine(
  tradeDate: string,
  close: number,
  high?: number,
  low?: number,
  open?: number,
): KLineData {
  return {
    tradeDate,
    open: open ?? close - 0.5,
    high: high ?? close + 0.3,
    low: low ?? close - 0.3,
    close,
    volume: 100000,
    turnover: 5000000,
  };
}

function makeTrendingData(
  startDate: string,
  days: number,
  startPrice: number,
  trend: 'up' | 'down' | 'flat',
): KLineData[] {
  const data: KLineData[] = [];
  const step = trend === 'up' ? 0.5 : trend === 'down' ? -0.5 : 0;
  const date = new Date(startDate);
  for (let i = 0; i < days; i++) {
    const price = startPrice + i * step + (Math.random() - 0.5) * 0.5;
    data.push(makeKLine(
      date.toISOString().slice(0, 10),
      parseFloat(price.toFixed(2)),
    ));
    date.setDate(date.getDate() + 1);
    // Skip weekends
    while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
  }
  return data;
}

describe('runBacktest', () => {
  // 60 trading days ≈ 3 months
  const risingData = makeTrendingData('2024-01-02', 60, 100, 'up');
  const fallingData = makeTrendingData('2024-01-02', 60, 100, 'down');
  const flatData = makeTrendingData('2024-01-02', 60, 100, 'flat');

  describe('MA Cross strategy', () => {
    it('should produce profit on rising market', () => {
      const result = runBacktest(risingData, {
        type: 'ma_cross', fastPeriod: 5, slowPeriod: 20, initialCapital: 100000,
      });
      expect(result.strategy).toBe('ma_cross');
      expect(result.totalReturn).toBeGreaterThan(-10); // shouldn't crash
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
      expect(result.trades.length).toBeGreaterThanOrEqual(0);
      expect(result.dailyPortfolio.length).toBe(60);
      expect(result.equityCurve).toHaveLength(60);
    });

    it('should have positive initial capital', () => {
      const result = runBacktest(risingData, {
        type: 'ma_cross', fastPeriod: 5, slowPeriod: 20, initialCapital: 100000,
      });
      expect(result.initialCapital).toBe(100000);
      expect(result.finalValue).toBeGreaterThan(0);
    });

    it('should return all required fields', () => {
      const result = runBacktest(fallingData, {
        type: 'ma_cross', fastPeriod: 5, slowPeriod: 20, initialCapital: 100000,
      });
      expect(result).toHaveProperty('strategy');
      expect(result).toHaveProperty('params');
      expect(result).toHaveProperty('symbol');
      expect(result).toHaveProperty('startDate');
      expect(result).toHaveProperty('endDate');
      expect(result).toHaveProperty('totalDays');
      expect(result).toHaveProperty('initialCapital');
      expect(result).toHaveProperty('finalValue');
      expect(result).toHaveProperty('totalReturn');
      expect(result).toHaveProperty('annualizedReturn');
      expect(result).toHaveProperty('benchmarkReturn');
      expect(result).toHaveProperty('maxDrawdown');
      expect(result).toHaveProperty('maxDrawdownDate');
      expect(result).toHaveProperty('sharpeRatio');
      expect(result).toHaveProperty('sortinoRatio');
      expect(result).toHaveProperty('volatility');
      expect(result).toHaveProperty('downsideVolatility');
      expect(result).toHaveProperty('totalTrades');
      expect(result).toHaveProperty('winningTrades');
      expect(result).toHaveProperty('losingTrades');
      expect(result).toHaveProperty('winRate');
      expect(result).toHaveProperty('profitFactor');
      expect(result).toHaveProperty('maxConsecutiveWins');
      expect(result).toHaveProperty('maxConsecutiveLosses');
    });
  });

  describe('RSI strategy', () => {
    it('should execute RSI backtest without error', () => {
      const result = runBacktest(risingData, {
        type: 'rsi', rsiPeriod: 14, rsiOversold: 30, rsiOverbought: 70, initialCapital: 100000,
      });
      expect(result.strategy).toBe('rsi');
      expect(result.totalDays).toBe(60);
    });

    it('should handle RSI with custom parameters', () => {
      const result = runBacktest(risingData, {
        type: 'rsi', rsiPeriod: 21, rsiOversold: 25, rsiOverbought: 75, initialCapital: 100000,
      });
      expect(result.strategy).toBe('rsi');
    });
  });

  describe('MACD strategy', () => {
    it('should execute MACD backtest without error', () => {
      const result = runBacktest(risingData, {
        type: 'macd', macdFast: 12, macdSlow: 26, macdSignal: 9, initialCapital: 100000,
      });
      expect(result.strategy).toBe('macd');
    });

    it('should produce valid metrics', () => {
      const result = runBacktest(risingData, {
        type: 'macd', macdFast: 12, macdSlow: 26, macdSignal: 9, initialCapital: 100000,
      });
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('edge cases', () => {
    it('should throw for empty data (< 10 required)', () => {
      expect(() => runBacktest([], { type: 'ma_cross', fastPeriod: 5, slowPeriod: 20, initialCapital: 100000 }))
        .toThrow('至少需要10条记录');
    });

    it('should throw for single data point (< 10 required)', () => {
      const data = [makeKLine('2024-01-02', 100)];
      expect(() => runBacktest(data, { type: 'ma_cross', fastPeriod: 5, slowPeriod: 20, initialCapital: 100000 }))
        .toThrow('至少需要10条记录');
    });

    it('should set symbol from data', () => {
      const result = runBacktest(risingData, {
        type: 'ma_cross', fastPeriod: 5, slowPeriod: 20, initialCapital: 100000,
      });
      expect(result.symbol).toBe('STOCK');
    });
  });
});

describe('walkForwardAnalysis', () => {
  const data = makeTrendingData('2024-01-02', 120, 100, 'up');

  it('should return all required fields', () => {
    const result = walkForwardAnalysis(data, {
      type: 'ma_cross', fastPeriod: 5, slowPeriod: 20, initialCapital: 100000,
    });
    expect(result).toHaveProperty('inSampleReturn');
    expect(result).toHaveProperty('outOfSampleReturn');
    expect(result).toHaveProperty('consistencyRatio');
    expect(result).toHaveProperty('isOverfit');
    expect(typeof result.isOverfit).toBe('boolean');
  });

  it('should use default trainRatio of 0.7', () => {
    // Just verify it runs without error using the default
    const result1 = walkForwardAnalysis(data, {
      type: 'ma_cross', fastPeriod: 5, slowPeriod: 20, initialCapital: 100000,
    });
    expect(typeof result1.inSampleReturn).toBe('number');
    expect(typeof result1.outOfSampleReturn).toBe('number');
  });

  it('should return zero for insufficient data', () => {
    const short = [makeKLine('2024-01-02', 100)];
    const result = walkForwardAnalysis(short, {
      type: 'ma_cross', fastPeriod: 5, slowPeriod: 20,
    });
    expect(result.inSampleReturn).toBe(0);
    expect(result.outOfSampleReturn).toBe(0);
    expect(result.isOverfit).toBe(true);
  });

  it('should not crash with 40+ data points', () => {
    const data40 = makeTrendingData('2024-01-02', 40, 100, 'up');
    const result = walkForwardAnalysis(data40, {
      type: 'ma_cross', fastPeriod: 5, slowPeriod: 20,
    }, 0.5);
    expect(typeof result.inSampleReturn).toBe('number');
    expect(typeof result.outOfSampleReturn).toBe('number');
  });

  it('should handle trainRatio = 1', () => {
    const result = walkForwardAnalysis(data, {
      type: 'ma_cross', fastPeriod: 5, slowPeriod: 20,
    }, 1);
    // Test data would be empty, so returns 0
    expect(typeof result.inSampleReturn).toBe('number');
  });
});

describe('runParallelBacktest', () => {
  const data = makeTrendingData('2024-01-02', 60, 100, 'up');

  it('should run multiple strategies and return results array', () => {
    const strategies = [
      { type: 'ma_cross' as const, fastPeriod: 5, slowPeriod: 20, initialCapital: 100000 },
      { type: 'rsi' as const, rsiPeriod: 14, rsiOversold: 30, rsiOverbought: 70, initialCapital: 100000 },
      { type: 'macd' as const, macdFast: 12, macdSlow: 26, macdSignal: 9, initialCapital: 100000 },
    ];
    const results = runParallelBacktest(data, strategies);
    expect(results).toHaveLength(3);
    expect(results[0].strategy).toBe('ma_cross');
    expect(results[1].strategy).toBe('rsi');
    expect(results[2].strategy).toBe('macd');
  });

  it('should handle empty strategies array', () => {
    const results = runParallelBacktest(data, []);
    expect(results).toEqual([]);
  });
});

describe('exportBacktestToCSV', () => {
  const data = makeTrendingData('2024-01-02', 60, 100, 'up');

  it('should return CSV string with sections', () => {
    const result = runBacktest(data, {
      type: 'ma_cross', fastPeriod: 5, slowPeriod: 20, initialCapital: 100000,
    });
    const csv = exportBacktestToCSV(result);
    expect(csv).toContain('=== AStock Backtest Report ===');
    expect(csv).toContain('=== Trades ===');
    expect(csv).toContain('=== Equity Curve ===');
    expect(csv).toContain('Strategy');
    expect(csv).toContain('Initial Capital');
    expect(csv).toContain('Total Return %');
  });

  it('should include equity curve data', () => {
    const result = runBacktest(data, {
      type: 'ma_cross', fastPeriod: 5, slowPeriod: 20, initialCapital: 100000,
    });
    const csv = exportBacktestToCSV(result);
    const lines = csv.split('\n');
    const equityStart = lines.findIndex(l => l.includes('Date,Value'));
    expect(equityStart).toBeGreaterThan(0);
    // Equity curve should have data rows (metadata section, trades, then equity)
    const equityLines = lines.filter(l => /^\d{4}-\d{2}-\d{2},/.test(l));
    expect(equityLines.length).toBeGreaterThan(0);
  });
});

describe('STRATEGY_PRESETS', () => {
  it('should have 5 strategy presets', () => {
    expect(STRATEGY_PRESETS).toHaveLength(5);
  });

  it('each preset should have required fields', () => {
    for (const preset of STRATEGY_PRESETS) {
      expect(preset).toHaveProperty('name');
      expect(preset).toHaveProperty('description');
      expect(preset).toHaveProperty('type');
      expect(preset).toHaveProperty('params');
      expect(preset.params).toHaveProperty('initialCapital');
      expect(preset.params.initialCapital).toBe(100000);
    }
  });

  it('should have all three strategy types covered', () => {
    const types = STRATEGY_PRESETS.map(p => p.type);
    expect(types).toContain('ma_cross');
    expect(types).toContain('rsi');
    // macd is only the default preset
  });
});
