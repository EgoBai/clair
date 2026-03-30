import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateEquityCurve,
  calculateMaxDrawdownDuration,
  calculateSharpeRatio,
  calculateSortinoRatio,
  calculateCalmarRatio,
  calculateProfitFactor,
  calculateExpectancy,
  calculateWinRate,
  calculateConsecutiveStreaks,
  calculateUlcerIndex,
  calculateOmegaRatio,
  calculateCVaR,
  calculateTailRatio,
  calculateKappa,
  calculateRecoveryFactor,
  groupTradesByMonth,
  calculateTradeDistribution,
  BacktestAnalyzer,
  type TradeRecord,
  type BacktestConfig,
} from '../utils/backtestPerformanceAnalyzer';

const mockTrades: TradeRecord[] = [
  { entryDate: '2025-01-02', exitDate: '2025-01-10', symbol: '600519', direction: 'long', entryPrice: 100, exitPrice: 110, quantity: 100, pnl: 1000, pnlPercent: 10, holdingDays: 8, fees: 5 },
  { entryDate: '2025-01-15', exitDate: '2025-01-20', symbol: '000858', direction: 'long', entryPrice: 50, exitPrice: 48, quantity: 200, pnl: -400, pnlPercent: -4, holdingDays: 5, fees: 3 },
  { entryDate: '2025-02-01', exitDate: '2025-02-10', symbol: '600519', direction: 'short', entryPrice: 115, exitPrice: 105, quantity: 100, pnl: 1000, pnlPercent: 8.7, holdingDays: 9, fees: 5 },
  { entryDate: '2025-02-15', exitDate: '2025-02-20', symbol: '000333', direction: 'long', entryPrice: 80, exitPrice: 85, quantity: 150, pnl: 750, pnlPercent: 6.25, holdingDays: 5, fees: 4 },
  { entryDate: '2025-03-01', exitDate: '2025-03-05', symbol: '601318', direction: 'long', entryPrice: 40, exitPrice: 38, quantity: 300, pnl: -600, pnlPercent: -5, holdingDays: 4, fees: 3 },
];

const defaultConfig: BacktestConfig = {
  initialCapital: 100000,
  commission: 0.001,
  slippage: 0.001,
  marginRequirement: 1,
  riskFreeRate: 0.03,
};

describe('calculateEquityCurve', () => {
  it('should calculate equity curve from trades', () => {
    const curve = calculateEquityCurve(mockTrades, 100000);
    expect(curve.length).toBe(5);
    expect(curve[0].equity).toBe(100000 + 1000 - 5);
    expect(curve[curve.length - 1].equity).toBeGreaterThan(100000);
  });

  it('should track drawdown correctly', () => {
    const losingTrades: TradeRecord[] = [
      { entryDate: '2025-01-02', exitDate: '2025-01-10', symbol: 'A', direction: 'long', entryPrice: 100, exitPrice: 110, quantity: 100, pnl: 1000, pnlPercent: 10, holdingDays: 8, fees: 0 },
      { entryDate: '2025-01-15', exitDate: '2025-01-20', symbol: 'B', direction: 'long', entryPrice: 50, exitPrice: 40, quantity: 100, pnl: -1000, pnlPercent: -20, holdingDays: 5, fees: 0 },
    ];
    const curve = calculateEquityCurve(losingTrades, 100000);
    expect(curve[1].drawdownPercent).toBeGreaterThan(0);
  });

  it('should return empty for no trades', () => {
    const curve = calculateEquityCurve([], 100000);
    expect(curve.length).toBe(0);
  });
});

describe('calculateMaxDrawdownDuration', () => {
  it('should calculate max drawdown duration', () => {
    const curve = calculateEquityCurve(mockTrades, 100000);
    const duration = calculateMaxDrawdownDuration(curve);
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('should return 0 for empty curve', () => {
    expect(calculateMaxDrawdownDuration([])).toBe(0);
  });
});

describe('calculateSharpeRatio', () => {
  it('should calculate Sharpe ratio', () => {
    const returns = [0.01, -0.02, 0.03, -0.01, 0.02, 0.01, -0.01, 0.02];
    const sharpe = calculateSharpeRatio(returns);
    expect(typeof sharpe).toBe('number');
  });

  it('should return 0 for insufficient data', () => {
    expect(calculateSharpeRatio([0.01])).toBe(0);
  });

  it('should return 0 for zero volatility', () => {
    expect(calculateSharpeRatio([0.01, 0.01, 0.01])).toBe(0);
  });
});

describe('calculateSortinoRatio', () => {
  it('should calculate Sortino ratio', () => {
    const returns = [0.01, -0.02, 0.03, -0.01, 0.02];
    const sortino = calculateSortinoRatio(returns);
    expect(typeof sortino).toBe('number');
  });

  it('should return Infinity for no downside', () => {
    const returns = [0.01, 0.02, 0.03];
    expect(calculateSortinoRatio(returns)).toBe(Infinity);
  });
});

describe('calculateCalmarRatio', () => {
  it('should calculate Calmar ratio', () => {
    expect(calculateCalmarRatio(0.15, 0.1)).toBeCloseTo(1.5, 5);
  });

  it('should return Infinity for zero drawdown', () => {
    expect(calculateCalmarRatio(0.15, 0)).toBe(Infinity);
  });
});

describe('calculateProfitFactor', () => {
  it('should calculate profit factor', () => {
    const pf = calculateProfitFactor(mockTrades);
    expect(pf).toBeGreaterThan(0);
  });

  it('should return Infinity for no losses', () => {
    const wins: TradeRecord[] = mockTrades.filter(t => t.pnl > 0);
    expect(calculateProfitFactor(wins)).toBe(Infinity);
  });
});

describe('calculateExpectancy', () => {
  it('should calculate expectancy', () => {
    const exp = calculateExpectancy(mockTrades);
    expect(typeof exp).toBe('number');
  });

  it('should return 0 for no trades', () => {
    expect(calculateExpectancy([])).toBe(0);
  });
});

describe('calculateWinRate', () => {
  it('should calculate win rate', () => {
    const rate = calculateWinRate(mockTrades);
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThanOrEqual(1);
  });

  it('should return 0 for no trades', () => {
    expect(calculateWinRate([])).toBe(0);
  });
});

describe('calculateConsecutiveStreaks', () => {
  it('should calculate consecutive win/loss streaks', () => {
    const streaks = calculateConsecutiveStreaks(mockTrades);
    expect(streaks.maxWins).toBeGreaterThanOrEqual(1);
    expect(streaks.maxLosses).toBeGreaterThanOrEqual(1);
  });
});

describe('calculateUlcerIndex', () => {
  it('should calculate Ulcer Index', () => {
    const curve = calculateEquityCurve(mockTrades, 100000);
    const ui = calculateUlcerIndex(curve);
    expect(ui).toBeGreaterThanOrEqual(0);
  });

  it('should return 0 for empty curve', () => {
    expect(calculateUlcerIndex([])).toBe(0);
  });
});

describe('calculateOmegaRatio', () => {
  it('should calculate Omega ratio', () => {
    const returns = [0.01, -0.02, 0.03, -0.01, 0.02];
    const omega = calculateOmegaRatio(returns);
    expect(omega).toBeGreaterThan(0);
  });

  it('should return Infinity for all gains', () => {
    expect(calculateOmegaRatio([0.01, 0.02, 0.03])).toBe(Infinity);
  });
});

describe('calculateCVaR', () => {
  it('should calculate CVaR at 95% confidence', () => {
    const returns = [-0.05, -0.03, -0.01, 0.01, 0.02, 0.03, 0.04, 0.05];
    const cvar = calculateCVaR(returns, 0.95);
    expect(cvar).toBeLessThanOrEqual(0);
  });

  it('should return 0 for empty array', () => {
    expect(calculateCVaR([])).toBe(0);
  });
});

describe('calculateTailRatio', () => {
  it('should calculate tail ratio', () => {
    const returns = [-0.05, -0.03, -0.01, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06];
    const ratio = calculateTailRatio(returns);
    expect(typeof ratio).toBe('number');
  });
});

describe('calculateKappa', () => {
  it('should calculate Kappa ratio', () => {
    const returns = [0.01, -0.02, 0.03, -0.01, 0.02];
    const kappa = calculateKappa(returns);
    expect(typeof kappa).toBe('number');
  });

  it('should return Infinity for no downside', () => {
    expect(calculateKappa([0.01, 0.02, 0.03])).toBe(Infinity);
  });
});

describe('calculateRecoveryFactor', () => {
  it('should calculate recovery factor', () => {
    expect(calculateRecoveryFactor(0.5, 0.2)).toBeCloseTo(2.5, 5);
  });

  it('should return Infinity for zero drawdown', () => {
    expect(calculateRecoveryFactor(0.5, 0)).toBe(Infinity);
  });
});

describe('groupTradesByMonth', () => {
  it('should group trades by month', () => {
    const monthly = groupTradesByMonth(mockTrades);
    expect(monthly.length).toBeGreaterThan(0);
    monthly.forEach(m => {
      expect(m.year).toBeDefined();
      expect(m.month).toBeGreaterThanOrEqual(1);
      expect(m.month).toBeLessThanOrEqual(12);
      expect(m.trades).toBeGreaterThan(0);
    });
  });
});

describe('calculateTradeDistribution', () => {
  it('should calculate trade distribution', () => {
    const dist = calculateTradeDistribution(mockTrades);
    expect(dist.byPnl.length).toBe(8);
    expect(dist.byDuration.length).toBe(5);
    expect(Object.keys(dist.byDayOfWeek).length).toBeGreaterThanOrEqual(6);
    expect(Object.keys(dist.bySymbol).length).toBeGreaterThan(0);
  });
});

describe('BacktestAnalyzer', () => {
  let analyzer: BacktestAnalyzer;

  beforeEach(() => {
    analyzer = new BacktestAnalyzer(defaultConfig);
  });

  it('should return empty metrics for no trades', () => {
    const metrics = analyzer.getMetrics();
    expect(metrics.totalTrades).toBe(0);
    expect(metrics.totalReturn).toBe(0);
  });

  it('should calculate metrics after adding trades', () => {
    analyzer.addTrades(mockTrades);
    const metrics = analyzer.getMetrics();
    expect(metrics.totalTrades).toBe(5);
    expect(metrics.winningTrades).toBe(3);
    expect(metrics.losingTrades).toBe(2);
    expect(metrics.winRate).toBeCloseTo(0.6, 1);
    expect(metrics.longTrades).toBe(4);
    expect(metrics.shortTrades).toBe(1);
    expect(metrics.avgHoldingDays).toBeGreaterThan(0);
  });

  it('should calculate monthly returns', () => {
    analyzer.addTrades(mockTrades);
    const monthly = analyzer.getMonthlyReturns();
    expect(monthly.length).toBeGreaterThan(0);
  });

  it('should calculate trade distribution', () => {
    analyzer.addTrades(mockTrades);
    const dist = analyzer.getTradeDistribution();
    expect(dist.byPnl.length).toBe(8);
  });

  it('should get equity curve', () => {
    analyzer.addTrades(mockTrades);
    const curve = analyzer.getEquityCurve();
    expect(curve.length).toBe(5);
  });

  it('should get drawdown periods', () => {
    analyzer.addTrades(mockTrades);
    const periods = analyzer.getDrawdownPeriods();
    expect(Array.isArray(periods)).toBe(true);
  });

  it('should compare with benchmark', () => {
    analyzer.addTrades(mockTrades);
    const benchReturns = [0.005, -0.01, 0.015, -0.005, 0.01];
    const comparison = analyzer.compareWithBenchmark(benchReturns);
    expect(comparison.beta).toBeDefined();
    expect(comparison.alpha).toBeDefined();
    expect(comparison.informationRatio).toBeDefined();
    expect(comparison.trackingError).toBeDefined();
  });

  it('should handle multiple addTrades calls', () => {
    analyzer.addTrades(mockTrades.slice(0, 2));
    analyzer.addTrades(mockTrades.slice(2));
    const metrics = analyzer.getMetrics();
    expect(metrics.totalTrades).toBe(5);
  });

  it('should calculate best and worst trade', () => {
    analyzer.addTrades(mockTrades);
    const metrics = analyzer.getMetrics();
    expect(metrics.bestTrade).toBeGreaterThan(0);
    expect(metrics.worstTrade).toBeLessThan(0);
  });

  it('should calculate max consecutive streaks', () => {
    analyzer.addTrades(mockTrades);
    const metrics = analyzer.getMetrics();
    expect(metrics.maxConsecutiveWins).toBeGreaterThanOrEqual(1);
    expect(metrics.maxConsecutiveLosses).toBeGreaterThanOrEqual(1);
  });
});
