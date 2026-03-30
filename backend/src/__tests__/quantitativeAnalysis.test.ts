import { describe, it, expect } from 'vitest';

// Risk metrics calculation
describe('Risk Metrics Calculation', () => {
  const calculateVaR = (returns: number[], confidence = 0.95) => {
    if (returns.length === 0) return 0;
    const sorted = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sorted.length);
    return -sorted[Math.max(0, index)];
  };

  const calculateCVaR = (returns: number[], confidence = 0.95) => {
    if (returns.length === 0) return 0;
    const sorted = [...returns].sort((a, b) => a - b);
    const cutoff = Math.floor((1 - confidence) * sorted.length);
    if (cutoff === 0) return -sorted[0];
    const tail = sorted.slice(0, cutoff);
    return -tail.reduce((s, v) => s + v, 0) / tail.length;
  };

  const calculateVolatility = (returns: number[], annualize = true) => {
    if (returns.length < 2) return 0;
    const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
    const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1);
    const daily = Math.sqrt(variance);
    return annualize ? daily * Math.sqrt(252) : daily;
  };

  const calculateBeta = (stockReturns: number[], marketReturns: number[]) => {
    const n = Math.min(stockReturns.length, marketReturns.length);
    if (n < 2) return 0;
    const stockMean = stockReturns.slice(0, n).reduce((s, v) => s + v, 0) / n;
    const marketMean = marketReturns.slice(0, n).reduce((s, v) => s + v, 0) / n;
    let cov = 0, mVar = 0;
    for (let i = 0; i < n; i++) {
      cov += (stockReturns[i] - stockMean) * (marketReturns[i] - marketMean);
      mVar += (marketReturns[i] - marketMean) ** 2;
    }
    return mVar === 0 ? 0 : cov / mVar;
  };

  describe('VaR', () => {
    it('should calculate VaR for normal returns', () => {
      const returns = Array.from({ length: 100 }, (_, i) => (Math.random() - 0.5) * 0.04);
      const var95 = calculateVaR(returns, 0.95);
      expect(var95).toBeGreaterThan(0);
    });

    it('should handle empty returns', () => {
      expect(calculateVaR([], 0.95)).toBe(0);
    });

    it('should calculate VaR for all positive returns', () => {
      const returns = [0.01, 0.02, 0.03, 0.01, 0.02];
      const var95 = calculateVaR(returns, 0.95);
      expect(var95).toBeLessThanOrEqual(0);
    });

    it('should handle single return', () => {
      const var95 = calculateVaR([0.01], 0.95);
      expect(Number.isFinite(var95)).toBe(true);
    });

    it('should increase with lower confidence', () => {
      const returns = Array.from({ length: 100 }, (_, i) => (i - 50) * 0.001);
      const var95 = calculateVaR(returns, 0.95);
      const var99 = calculateVaR(returns, 0.99);
      expect(var99).toBeGreaterThanOrEqual(var95);
    });
  });

  describe('CVaR', () => {
    it('should calculate CVaR', () => {
      const returns = [-0.05, -0.03, -0.01, 0.01, 0.02, 0.03];
      const cvar = calculateCVaR(returns, 0.95);
      expect(cvar).toBeGreaterThan(0);
    });

    it('should handle empty returns', () => {
      expect(calculateCVaR([], 0.95)).toBe(0);
    });

    it('should be greater than or equal to VaR', () => {
      const returns = Array.from({ length: 100 }, (_, i) => (i - 50) * 0.002);
      const var95 = calculateVaR(returns, 0.95);
      const cvar95 = calculateCVaR(returns, 0.95);
      expect(cvar95).toBeGreaterThanOrEqual(var95);
    });
  });

  describe('Volatility', () => {
    it('should calculate annualized volatility', () => {
      const returns = [0.01, -0.01, 0.02, -0.02, 0.01];
      const vol = calculateVolatility(returns, true);
      expect(vol).toBeGreaterThan(0);
    });

    it('should calculate daily volatility', () => {
      const returns = [0.01, -0.01, 0.02, -0.02, 0.01];
      const daily = calculateVolatility(returns, false);
      const annual = calculateVolatility(returns, true);
      expect(annual).toBeCloseTo(daily * Math.sqrt(252), 5);
    });

    it('should handle empty returns', () => {
      expect(calculateVolatility([], true)).toBe(0);
    });

    it('should handle single return', () => {
      expect(calculateVolatility([0.01], true)).toBe(0);
    });

    it('should handle zero volatility', () => {
      expect(calculateVolatility([0.01, 0.01, 0.01], true)).toBe(0);
    });

    it('should handle large volatility', () => {
      const returns = Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? 0.1 : -0.1));
      const vol = calculateVolatility(returns, true);
      expect(vol).toBeGreaterThan(1);
    });
  });

  describe('Beta', () => {
    it('should calculate beta > 1 for aggressive stock', () => {
      const market = [0.01, 0.02, -0.01, 0.01, -0.02];
      const stock = market.map(r => r * 1.5);
      const beta = calculateBeta(stock, market);
      expect(beta).toBeCloseTo(1.5, 1);
    });

    it('should calculate beta < 1 for defensive stock', () => {
      const market = [0.01, 0.02, -0.01, 0.01, -0.02];
      const stock = market.map(r => r * 0.5);
      const beta = calculateBeta(stock, market);
      expect(beta).toBeCloseTo(0.5, 1);
    });

    it('should handle negative beta', () => {
      const market = [0.01, 0.02, -0.01, 0.01, -0.02];
      const stock = market.map(r => -r);
      const beta = calculateBeta(stock, market);
      expect(beta).toBeCloseTo(-1, 1);
    });

    it('should handle zero market variance', () => {
      const beta = calculateBeta([0.01, 0.02], [0.01, 0.01]);
      expect(beta).toBe(0);
    });

    it('should handle insufficient data', () => {
      expect(calculateBeta([0.01], [0.01])).toBe(0);
    });

    it('should handle identical returns', () => {
      const returns = [0.01, 0.01, 0.01, 0.01];
      const beta = calculateBeta(returns, returns);
      // When all returns are identical, variance is 0 and beta is 0 (or NaN, handled as 0)
      expect(beta).toBe(0);
    });

    it('should handle empty arrays', () => {
      expect(calculateBeta([], [])).toBe(0);
    });
  });
});

// Portfolio optimization
describe('Portfolio Optimization', () => {
  const calculateSharpe = (returns: number[], riskFreeRate = 0.02) => {
    if (returns.length < 2) return 0;
    const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
    const annualReturn = mean * 252;
    const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1);
    const annualVol = Math.sqrt(variance) * Math.sqrt(252);
    return annualVol === 0 ? 0 : (annualReturn - riskFreeRate) / annualVol;
  };

  const calculateSortino = (returns: number[], riskFreeRate = 0.02) => {
    if (returns.length < 2) return 0;
    const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
    const annualReturn = mean * 252;
    const downside = returns.filter(r => r < 0);
    if (downside.length === 0) return Infinity;
    const downVar = downside.reduce((s, v) => s + v ** 2, 0) / downside.length;
    const downDev = Math.sqrt(downVar) * Math.sqrt(252);
    return downDev === 0 ? Infinity : (annualReturn - riskFreeRate) / downDev;
  };

  const calculateMaxDrawdown = (equity: number[]) => {
    if (equity.length === 0) return { maxDrawdown: 0, peak: 0, trough: 0 };
    let peak = equity[0];
    let maxDD = 0;
    let peakVal = equity[0];
    let troughVal = equity[0];
    for (const val of equity) {
      if (val > peak) peak = val;
      const dd = (peak - val) / peak;
      if (dd > maxDD) {
        maxDD = dd;
        peakVal = peak;
        troughVal = val;
      }
    }
    return { maxDrawdown: maxDD, peak: peakVal, trough: troughVal };
  };

  describe('Sharpe Ratio', () => {
    it('should calculate positive Sharpe for good returns', () => {
      const returns = Array.from({ length: 252 }, () => 0.001);
      const sharpe = calculateSharpe(returns);
      expect(sharpe).toBeGreaterThan(0);
    });

    it('should calculate negative Sharpe for bad returns', () => {
      const returns = Array.from({ length: 252 }, () => -0.001);
      const sharpe = calculateSharpe(returns);
      expect(sharpe).toBeLessThan(0);
    });

    it('should handle empty returns', () => {
      expect(calculateSharpe([])).toBe(0);
    });

    it('should handle single return', () => {
      expect(calculateSharpe([0.01])).toBe(0);
    });

    it('should handle zero volatility', () => {
      const sharpe = calculateSharpe([0.001, 0.001, 0.001]);
      expect(sharpe).toBe(0);
    });

    it('should adjust for risk-free rate', () => {
      const returns = Array.from({ length: 252 }, () => 0.001);
      const sharpe0 = calculateSharpe(returns, 0);
      const sharpe2 = calculateSharpe(returns, 0.02);
      expect(sharpe0).toBeGreaterThan(sharpe2);
    });
  });

  describe('Sortino Ratio', () => {
    it('should calculate Sortino for mixed returns', () => {
      const returns = [0.01, -0.005, 0.02, -0.01, 0.015];
      const sortino = calculateSortino(returns);
      expect(Number.isFinite(sortino) || sortino === Infinity).toBe(true);
    });

    it('should return Infinity for all positive returns', () => {
      const returns = [0.01, 0.02, 0.01, 0.03];
      expect(calculateSortino(returns)).toBe(Infinity);
    });

    it('should handle empty returns', () => {
      expect(calculateSortino([])).toBe(0);
    });

    it('should handle single return', () => {
      expect(calculateSortino([0.01])).toBe(0);
    });
  });

  describe('Max Drawdown', () => {
    it('should calculate max drawdown', () => {
      const equity = [100, 110, 105, 115, 90, 95, 120];
      const { maxDrawdown } = calculateMaxDrawdown(equity);
      expect(maxDrawdown).toBeCloseTo(0.217, 2);
    });

    it('should be 0 for monotonically increasing', () => {
      const equity = [100, 105, 110, 115, 120];
      expect(calculateMaxDrawdown(equity).maxDrawdown).toBe(0);
    });

    it('should be 1 for drop to zero', () => {
      const equity = [100, 50, 0];
      expect(calculateMaxDrawdown(equity).maxDrawdown).toBe(1);
    });

    it('should handle empty equity', () => {
      const { maxDrawdown } = calculateMaxDrawdown([]);
      expect(maxDrawdown).toBe(0);
    });

    it('should handle single value', () => {
      expect(calculateMaxDrawdown([100]).maxDrawdown).toBe(0);
    });

    it('should handle monotonically decreasing', () => {
      const equity = [100, 90, 80, 70, 60];
      const { maxDrawdown } = calculateMaxDrawdown(equity);
      expect(maxDrawdown).toBeCloseTo(0.4, 1);
    });

    it('should identify peak and trough', () => {
      const equity = [100, 110, 105, 115, 90, 95, 120];
      const { peak, trough } = calculateMaxDrawdown(equity);
      expect(peak).toBe(115);
      expect(trough).toBe(90);
    });

    it('should handle V-shaped recovery', () => {
      const equity = [100, 50, 100];
      const { maxDrawdown } = calculateMaxDrawdown(equity);
      expect(maxDrawdown).toBeCloseTo(0.5, 1);
    });

    it('should handle multiple drawdowns', () => {
      const equity = [100, 110, 90, 105, 85, 120];
      const { maxDrawdown } = calculateMaxDrawdown(equity);
      expect(maxDrawdown).toBeGreaterThan(0.15);
    });

    it('should handle very long series', () => {
      const equity = Array.from({ length: 1000 }, (_, i) => 100 + 50 * Math.sin(i * 0.1));
      const { maxDrawdown } = calculateMaxDrawdown(equity);
      expect(maxDrawdown).toBeGreaterThan(0);
      expect(maxDrawdown).toBeLessThanOrEqual(1);
    });
  });
});

// Correlation analysis
describe('Correlation Analysis', () => {
  const pearsonCorrelation = (x: number[], y: number[]) => {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;
    const xMean = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
    const yMean = y.slice(0, n).reduce((s, v) => s + v, 0) / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      const xi = x[i] - xMean;
      const yi = y[i] - yMean;
      num += xi * yi;
      dx += xi ** 2;
      dy += yi ** 2;
    }
    const denom = Math.sqrt(dx * dy);
    return denom === 0 ? 0 : num / denom;
  };

  it('should return 1 for identical series', () => {
    const series = [1, 2, 3, 4, 5];
    expect(pearsonCorrelation(series, series)).toBeCloseTo(1, 5);
  });

  it('should return -1 for inverse series', () => {
    expect(pearsonCorrelation([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])).toBeCloseTo(-1, 5);
  });

  it('should return 0 for uncorrelated', () => {
    expect(pearsonCorrelation([1, -1, 1, -1], [1, 1, -1, -1])).toBeCloseTo(0, 1);
  });

  it('should handle empty arrays', () => {
    expect(pearsonCorrelation([], [])).toBe(0);
  });

  it('should handle single element', () => {
    expect(pearsonCorrelation([1], [2])).toBe(0);
  });

  it('should handle constant series', () => {
    expect(pearsonCorrelation([5, 5, 5], [1, 2, 3])).toBe(0);
  });

  it('should handle partial correlation', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [1, 2.1, 2.9, 4.2, 5.1];
    expect(pearsonCorrelation(x, y)).toBeGreaterThan(0.9);
  });

  it('should handle different lengths', () => {
    const corr = pearsonCorrelation([1, 2, 3], [1, 2, 3, 4, 5]);
    expect(corr).toBeCloseTo(1, 5);
  });

  it('should be symmetric', () => {
    const x = [1, 3, 5, 7, 9];
    const y = [2, 4, 6, 8, 10];
    expect(pearsonCorrelation(x, y)).toBeCloseTo(pearsonCorrelation(y, x), 10);
  });

  it('should handle stock-like returns', () => {
    const stockA = [0.01, -0.02, 0.03, -0.01, 0.02];
    const stockB = [0.015, -0.018, 0.025, -0.005, 0.018];
    const corr = pearsonCorrelation(stockA, stockB);
    expect(corr).toBeGreaterThan(0.5);
  });

  it('should handle negative values', () => {
    const corr = pearsonCorrelation([-1, -2, -3], [-3, -2, -1]);
    expect(corr).toBeCloseTo(-1, 5);
  });
});

// Monte Carlo simulation
describe('Monte Carlo Simulation', () => {
  const simulatePaths = (startPrice: number, days: number, drift: number, vol: number, paths: number) => {
    const results: number[][] = [];
    for (let p = 0; p < paths; p++) {
      const path = [startPrice];
      for (let d = 1; d <= days; d++) {
        const z = (Math.random() - 0.5) * 2; // simplified normal
        const ret = drift + vol * z;
        path.push(path[path.length - 1] * (1 + ret));
      }
      results.push(path);
    }
    return results;
  };

  const analyzeSimulation = (paths: number[][]) => {
    const finalPrices = paths.map(p => p[p.length - 1]);
    const sorted = [...finalPrices].sort((a, b) => a - b);
    return {
      mean: finalPrices.reduce((s, v) => s + v, 0) / finalPrices.length,
      median: sorted[Math.floor(sorted.length / 2)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p5: sorted[Math.floor(sorted.length * 0.05)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      pathCount: paths.length,
      dayCount: paths[0].length,
    };
  };

  it('should generate correct number of paths', () => {
    const paths = simulatePaths(100, 30, 0.001, 0.02, 100);
    expect(paths).toHaveLength(100);
  });

  it('should generate correct path length', () => {
    const paths = simulatePaths(100, 30, 0.001, 0.02, 10);
    expect(paths[0]).toHaveLength(31); // start + 30 days
  });

  it('should start at correct price', () => {
    const paths = simulatePaths(50, 10, 0, 0, 5);
    for (const p of paths) {
      expect(p[0]).toBe(50);
    }
  });

  it('should produce positive prices with drift', () => {
    const paths = simulatePaths(100, 100, 0.001, 0.01, 50);
    for (const p of paths) {
      for (const price of p) {
        expect(price).toBeGreaterThan(0);
      }
    }
  });

  it('should analyze mean correctly', () => {
    const paths = simulatePaths(100, 30, 0, 0.01, 1000);
    const stats = analyzeSimulation(paths);
    expect(stats.mean).toBeGreaterThan(80);
    expect(stats.mean).toBeLessThan(120);
  });

  it('should have min <= median <= max', () => {
    const paths = simulatePaths(100, 30, 0, 0.02, 500);
    const stats = analyzeSimulation(paths);
    expect(stats.min).toBeLessThanOrEqual(stats.median);
    expect(stats.median).toBeLessThanOrEqual(stats.max);
  });

  it('should have p5 <= p95', () => {
    const paths = simulatePaths(100, 30, 0, 0.02, 500);
    const stats = analyzeSimulation(paths);
    expect(stats.p5).toBeLessThanOrEqual(stats.p95);
  });

  it('should handle zero volatility', () => {
    const paths = simulatePaths(100, 10, 0, 0, 10);
    for (const p of paths) {
      for (const price of p) {
        expect(price).toBe(100);
      }
    }
  });

  it('should handle zero drift', () => {
    const paths = simulatePaths(100, 30, 0, 0.01, 100);
    const stats = analyzeSimulation(paths);
    expect(stats.mean).toBeGreaterThan(90);
    expect(stats.mean).toBeLessThan(110);
  });

  it('should handle single path', () => {
    const paths = simulatePaths(100, 10, 0.001, 0.02, 1);
    expect(paths).toHaveLength(1);
    expect(paths[0]).toHaveLength(11);
  });

  it('should handle single day', () => {
    const paths = simulatePaths(100, 1, 0, 0.02, 10);
    expect(paths[0]).toHaveLength(2);
  });
});

// Moving average crossover backtest helper
describe('MA Crossover Backtest Helper', () => {
  const maCrossoverSignals = (prices: number[], shortPeriod: number, longPeriod: number) => {
    const signals: Array<{ index: number; type: 'buy' | 'sell' }> = [];
    const calcMA = (arr: number[], period: number, idx: number) => {
      if (idx < period - 1) return null;
      return arr.slice(idx - period + 1, idx + 1).reduce((s, v) => s + v, 0) / period;
    };

    for (let i = 1; i < prices.length; i++) {
      const prevShort = calcMA(prices, shortPeriod, i - 1);
      const prevLong = calcMA(prices, longPeriod, i - 1);
      const currShort = calcMA(prices, shortPeriod, i);
      const currLong = calcMA(prices, longPeriod, i);
      if (prevShort === null || prevLong === null || currShort === null || currLong === null) continue;
      if (prevShort <= prevLong && currShort > currLong) signals.push({ index: i, type: 'buy' });
      if (prevShort >= prevLong && currShort < currLong) signals.push({ index: i, type: 'sell' });
    }
    return signals;
  };

  it('should detect golden cross', () => {
    const prices = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 11, 12, 13, 14, 15];
    const signals = maCrossoverSignals(prices, 3, 5);
    const buys = signals.filter(s => s.type === 'buy');
    expect(buys.length).toBeGreaterThan(0);
  });

  it('should detect death cross', () => {
    const prices = [15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 14, 13, 12, 11, 10];
    const signals = maCrossoverSignals(prices, 3, 5);
    const sells = signals.filter(s => s.type === 'sell');
    expect(sells.length).toBeGreaterThan(0);
  });

  it('should return empty for insufficient data', () => {
    const signals = maCrossoverSignals([1, 2, 3], 5, 10);
    expect(signals).toHaveLength(0);
  });

  it('should alternate buy/sell', () => {
    const prices = [10, 10, 10, 15, 15, 15, 10, 10, 10, 15, 15, 15, 10, 10, 10, 15, 15, 15];
    const signals = maCrossoverSignals(prices, 2, 4);
    for (let i = 1; i < signals.length; i++) {
      expect(signals[i].type).not.toBe(signals[i - 1].type);
    }
  });

  it('should not generate signals for flat prices', () => {
    const prices = Array(30).fill(100);
    const signals = maCrossoverSignals(prices, 5, 10);
    expect(signals).toHaveLength(0);
  });

  it('should handle single period difference', () => {
    const prices = Array.from({ length: 20 }, (_, i) => i < 10 ? 10 : 20);
    const signals = maCrossoverSignals(prices, 2, 3);
    expect(signals.length).toBeGreaterThan(0);
  });

  it('should handle empty prices', () => {
    expect(maCrossoverSignals([], 3, 5)).toEqual([]);
  });

  it('should handle equal periods', () => {
    const prices = [10, 11, 12, 13, 14];
    const signals = maCrossoverSignals(prices, 3, 3);
    expect(signals).toHaveLength(0);
  });

  it('should produce valid index range', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 100 + 20 * Math.sin(i * 0.3));
    const signals = maCrossoverSignals(prices, 5, 10);
    for (const s of signals) {
      expect(s.index).toBeGreaterThanOrEqual(0);
      expect(s.index).toBeLessThan(prices.length);
    }
  });
});
