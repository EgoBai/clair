import { describe, it, expect } from 'vitest';
import riskEngine from '../../src/services/riskBudgetEngine';
import { calculateBeta } from '../../../frontend/src/utils/correlationMatrix';
import {
  calculateVolatility,
  pearsonCorrelation,
} from '../../../frontend/src/utils/globalCorrelationEngine';
import {
  calculateSharpeRatio,
  calculateSortinoRatio,
} from '../../../frontend/src/utils/backtestPerformanceAnalyzer';
import {
  simulateGBMPaths,
  analyzeMonteCarloResults,
} from '../../../frontend/src/utils/monteCarloEngine';
import type { SimulationPath } from '../../../frontend/src/utils/monteCarloEngine';

/**
 * 风险指标 / 组合指标 / 相关性 / 蒙特卡洛 单元测试
 *
 * 本文件原先自抄实现（影子测试），批次 3 迁移为 import 生产实现：
 * - VaR / CVaR / 最大回撤：backend/src/services/riskBudgetEngine.ts（RiskBudgetEngine）
 * - 年化波动率 / Pearson 相关：frontend/src/utils/globalCorrelationEngine.ts
 * - Beta：frontend/src/utils/correlationMatrix.ts
 * - Sharpe / Sortino：frontend/src/utils/backtestPerformanceAnalyzer.ts
 * - 蒙特卡洛路径与统计：frontend/src/utils/monteCarloEngine.ts
 *
 * 旧副本错在哪 / 与生产实现的差异（断言已按生产行为修正）：
 * - 旧 VaR / CVaR 没有「样本数 < 10 返回 0」的下限；旧 CVaR 在 cutoff === 0 时只取最差一天，
 *   生产实现统一取 sorted.slice(0, cutoff + 1) 的尾部均值。故第一个 CVaR 用例补足 10 个样本。
 * - 旧夏普默认无风险利率 0.02/年，生产默认 0.03/年（年化值）；数值断言不受影响。
 * - 旧 Sortino 无下跌样本返回 Infinity，生产实现同样返回 Infinity；下跌波动为 0 时生产返回 0。
 * - 旧最大回撤输入为 equity 价格、返回 peak/trough 价格；生产 riskBudgetEngine.calculateMaxDrawdown
 *   输入为收益率、返回 peakIndex/troughIndex。本文件保留 equity 输入语义，在测试内做 2 行
 *   index <-> 价格换算（只做映射，不复制回撤算法）。
 *   （frontend globalCorrelationEngine.calculateMaxDrawdown 的 peak 取「最新全局峰值」，
 *   与 trough 不属于同一回撤区间，未采用；已作为发现记录，未改生产。）
 * - 旧蒙特卡洛用 (Math.random() - 0.5) * 2 伪正态，结果不可复现且违反仓库「禁止 Math.random 造数据」；
 *   生产实现为 GBM + Box-Muller，randomSeed 可复现。旧用例的 drift/vol 是日频参数，
 *   注入时按 252 交易日年化（drift * 252、vol * sqrt(252)），断言阈值保持原样。
 * - MA Crossover：仓库无「任意周期均线交叉信号」生产实现（backtestEngine.generateSignalMA 未导出，
 *   trendFollowingEngine.detectCrossovers 只支持固定周期且不返回 index），该组保留原本地 helper，
 *   未迁移，避免虚构生产代码。
 */

// Risk metrics calculation
describe('Risk Metrics Calculation', () => {
  // 生产 RiskBudgetEngine 的 VaR/CVaR/最大回撤均以「收益率序列」为输入。
  describe('VaR', () => {
    it('should calculate VaR for normal returns', () => {
      // 确定性序列，替代旧副本的 Math.random（禁止用随机数造数据）。
      const returns = Array.from({ length: 100 }, (_, i) => Math.sin(i * 1.7) * 0.02);
      const var95 = riskEngine.historicalVaR(returns, 0.95);
      expect(var95).toBeGreaterThan(0);
    });

    it('should handle empty returns', () => {
      expect(riskEngine.historicalVaR([], 0.95)).toBe(0);
    });

    it('should calculate VaR for all positive returns', () => {
      const returns = [0.01, 0.02, 0.03, 0.01, 0.02];
      const var95 = riskEngine.historicalVaR(returns, 0.95);
      expect(var95).toBeLessThanOrEqual(0);
    });

    it('should handle single return', () => {
      const var95 = riskEngine.historicalVaR([0.01], 0.95);
      expect(Number.isFinite(var95)).toBe(true);
    });

    it('should increase with lower confidence', () => {
      const returns = Array.from({ length: 100 }, (_, i) => (i - 50) * 0.001);
      const var95 = riskEngine.historicalVaR(returns, 0.95);
      const var99 = riskEngine.historicalVaR(returns, 0.99);
      expect(var99).toBeGreaterThanOrEqual(var95);
    });
  });

  describe('CVaR', () => {
    it('should calculate CVaR', () => {
      // 生产实现样本数 < 10 直接返回 0，故在旧样本后补 4 个正收益。
      const returns = [
        -0.05, -0.03, -0.01, 0.01, 0.02, 0.03, 0.005, 0.015, 0.025, 0.035,
      ];
      const cvar = riskEngine.calculateCVaR(returns, 0.95);
      expect(cvar).toBeGreaterThan(0);
    });

    it('should handle empty returns', () => {
      expect(riskEngine.calculateCVaR([], 0.95)).toBe(0);
    });

    it('should be greater than or equal to VaR', () => {
      const returns = Array.from({ length: 100 }, (_, i) => (i - 50) * 0.002);
      const var95 = riskEngine.historicalVaR(returns, 0.95);
      const cvar95 = riskEngine.calculateCVaR(returns, 0.95);
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
      // 所有收益相同 -> 市场方差为 0 -> 生产实现返回 0
      expect(beta).toBe(0);
    });

    it('should handle empty arrays', () => {
      expect(calculateBeta([], [])).toBe(0);
    });
  });
});

// Portfolio optimization
describe('Portfolio Optimization', () => {
  it('should calculate positive Sharpe for good returns', () => {
    const returns = Array.from({ length: 252 }, () => 0.001);
    const sharpe = calculateSharpeRatio(returns);
    expect(sharpe).toBeGreaterThan(0);
  });

  it('should calculate negative Sharpe for bad returns', () => {
    const returns = Array.from({ length: 252 }, () => -0.001);
    const sharpe = calculateSharpeRatio(returns);
    expect(sharpe).toBeLessThan(0);
  });

  it('should handle empty returns', () => {
    expect(calculateSharpeRatio([])).toBe(0);
  });

  it('should handle single return', () => {
    expect(calculateSharpeRatio([0.01])).toBe(0);
  });

  it('should handle zero volatility', () => {
    const sharpe = calculateSharpeRatio([0.001, 0.001, 0.001]);
    expect(sharpe).toBe(0);
  });

  describe('Sharpe Ratio', () => {
    it('should adjust for risk-free rate', () => {
      const returns = Array.from({ length: 252 }, () => 0.001);
      const sharpe0 = calculateSharpeRatio(returns, 0);
      const sharpe2 = calculateSharpeRatio(returns, 0.02);
      expect(sharpe0).toBeGreaterThan(sharpe2);
    });
  });

  describe('Sortino Ratio', () => {
    it('should calculate Sortino for mixed returns', () => {
      const returns = [0.01, -0.005, 0.02, -0.01, 0.015];
      const sortino = calculateSortinoRatio(returns);
      expect(Number.isFinite(sortino) || sortino === Infinity).toBe(true);
    });

    it('should return Infinity for all positive returns', () => {
      const returns = [0.01, 0.02, 0.01, 0.03];
      expect(calculateSortinoRatio(returns)).toBe(Infinity);
    });

    it('should handle empty returns', () => {
      expect(calculateSortinoRatio([])).toBe(0);
    });

    it('should handle single return', () => {
      expect(calculateSortinoRatio([0.01])).toBe(0);
    });
  });

  describe('Max Drawdown', () => {
    /**
     * 旧副本接收 equity 价格；生产 riskBudgetEngine.calculateMaxDrawdown 接收收益率并返回下标。
     * 这里只做 index <-> 价格换算（收益率 i 对应 equity[i + 1]），回撤算法全部来自生产实现。
     */
    const calculateMaxDrawdown = (equity: number[]) => {
      if (equity.length < 2) {
        return { maxDrawdown: 0, peak: equity[0] ?? 0, trough: equity[0] ?? 0 };
      }
      const returns = equity.slice(1).map((value, i) => value / equity[i] - 1);
      const { maxDrawdown, peakIndex, troughIndex } = riskEngine.calculateMaxDrawdown(returns);
      return {
        maxDrawdown,
        peak: equity[peakIndex + 1],
        trough: equity[troughIndex + 1],
      };
    };

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
  // 旧用例的 drift/vol 是日频参数；生产 simulateGBMPaths 接收年化参数，这里按 252 交易日换算。
  // 固定 randomSeed 保证结果可复现，替代旧副本的 Math.random。
  const simulatePaths = (
    startPrice: number,
    days: number,
    drift: number,
    vol: number,
    paths: number
  ): SimulationPath[] => {
    return simulateGBMPaths({
      numSimulations: paths,
      numSteps: days,
      initialValue: startPrice,
      drift: drift * 252,
      volatility: vol * Math.sqrt(252),
      randomSeed: 20261104,
    });
  };

  const analyzeSimulation = (paths: SimulationPath[]) => {
    const { statistics, percentiles } = analyzeMonteCarloResults(paths);
    return {
      mean: statistics.mean,
      median: statistics.median,
      min: statistics.min,
      max: statistics.max,
      p5: percentiles[5],
      p95: percentiles[95],
      pathCount: paths.length,
      dayCount: paths[0].values.length,
    };
  };

  it('should generate correct number of paths', () => {
    const paths = simulatePaths(100, 30, 0.001, 0.02, 100);
    expect(paths).toHaveLength(100);
  });

  it('should generate correct path length', () => {
    const paths = simulatePaths(100, 30, 0.001, 0.02, 10);
    expect(paths[0].values).toHaveLength(31); // start + 30 days
  });

  it('should start at correct price', () => {
    const paths = simulatePaths(50, 10, 0, 0, 5);
    for (const p of paths) {
      expect(p.values[0]).toBe(50);
    }
  });

  it('should produce positive prices with drift', () => {
    const paths = simulatePaths(100, 100, 0.001, 0.01, 50);
    for (const p of paths) {
      for (const price of p.values) {
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
      for (const price of p.values) {
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
    expect(paths[0].values).toHaveLength(11);
  });

  it('should handle single day', () => {
    const paths = simulatePaths(100, 1, 0, 0.02, 10);
    expect(paths[0].values).toHaveLength(2);
  });
});

// Moving average crossover backtest helper
// 无生产实现（见文件头说明），该组保留原本地 helper，未迁移。
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
