import { describe, it, expect } from 'vitest';
import {
  generateWalkForwardWindows,
  walkForwardBacktest,
  calculatePerformanceMetrics,
  calculateRollingMetrics,
  monteCarloWalkForward,
  type WalkForwardConfig,
  type PerformanceMetrics,
} from '../utils/walkForwardEngine';

describe('Walk-Forward 回测引擎', () => {
  describe('generateWalkForwardWindows', () => {
    it('should generate correct number of windows', () => {
      const config: WalkForwardConfig = {
        totalPeriods: 100,
        inSampleSize: 60,
        outSampleSize: 20
      };
      const windows = generateWalkForwardWindows(config);
      expect(windows.length).toBeGreaterThan(0);
      // 第一个窗口: 训练0-59, 测试60-79
      expect(windows[0].inSampleStart).toBe(0);
      expect(windows[0].inSampleEnd).toBe(59);
      expect(windows[0].outSampleStart).toBe(60);
      expect(windows[0].outSampleEnd).toBe(79);
    });

    it('should not exceed total periods', () => {
      const config: WalkForwardConfig = {
        totalPeriods: 100,
        inSampleSize: 60,
        outSampleSize: 20
      };
      const windows = generateWalkForwardWindows(config);
      for (const w of windows) {
        expect(w.outSampleEnd).toBeLessThan(config.totalPeriods);
      }
    });

    it('should respect purge size', () => {
      const config: WalkForwardConfig = {
        totalPeriods: 100,
        inSampleSize: 60,
        outSampleSize: 20,
        purgeSize: 5
      };
      const windows = generateWalkForwardWindows(config);
      expect(windows[0].outSampleStart).toBe(65); // 60 + 5 purge
    });

    it('should handle custom step size', () => {
      const config: WalkForwardConfig = {
        totalPeriods: 200,
        inSampleSize: 60,
        outSampleSize: 20,
        stepSize: 10
      };
      const windows = generateWalkForwardWindows(config);
      expect(windows.length).toBeGreaterThan(5);
    });

    it('should return empty for too short data', () => {
      const config: WalkForwardConfig = {
        totalPeriods: 50,
        inSampleSize: 60,
        outSampleSize: 20
      };
      const windows = generateWalkForwardWindows(config);
      expect(windows.length).toBe(0);
    });
  });

  describe('walkForwardBacktest', () => {
    it('should execute all windows', () => {
      const config: WalkForwardConfig = {
        totalPeriods: 200,
        inSampleSize: 60,
        outSampleSize: 20
      };

      const optimizeFunc = (start: number, end: number) => ({ lookback: 20, threshold: 0.02 });
      const backtestFunc = (start: number, end: number, params: any): PerformanceMetrics => ({
        totalReturn: Math.random() * 0.1,
        annualizedReturn: 0.05,
        volatility: 0.15,
        sharpeRatio: 0.3,
        maxDrawdown: 0.1,
        winRate: 0.55,
        profitFactor: 1.2,
        numTrades: end - start
      });
      const extractParams = (p: any) => ({ lookback: p.lookback, threshold: p.threshold });

      const result = walkForwardBacktest(config, optimizeFunc, backtestFunc, extractParams);
      expect(result.windows.length).toBeGreaterThan(0);
      expect(result.overallMetrics).toBeDefined();
      expect(result.parameterStability).toBeDefined();
    });

    it('should compute parameter stability', () => {
      const config: WalkForwardConfig = {
        totalPeriods: 200,
        inSampleSize: 60,
        outSampleSize: 20
      };

      // 固定参数 => 稳定性应该很高
      const optimizeFunc = () => ({ a: 10, b: 20 });
      const backtestFunc = (): PerformanceMetrics => ({
        totalReturn: 0.01, annualizedReturn: 0.05, volatility: 0.1,
        sharpeRatio: 0.5, maxDrawdown: 0.05, winRate: 0.6, profitFactor: 1.3, numTrades: 10
      });
      const extractParams = (p: any) => ({ a: p.a, b: p.b });

      const result = walkForwardBacktest(config, optimizeFunc, backtestFunc, extractParams);
      expect(result.parameterStability.stabilityScore).toBeCloseTo(1, 5);
    });
  });

  describe('calculatePerformanceMetrics', () => {
    it('should calculate correct total return', () => {
      const returns = [0.01, -0.005, 0.02, 0.01];
      const metrics = calculatePerformanceMetrics(returns);
      const expectedTotal = (1.01 * 0.995 * 1.02 * 1.01) - 1;
      expect(metrics.totalReturn).toBeCloseTo(expectedTotal, 6);
    });

    it('should calculate win rate', () => {
      const returns = [0.01, -0.01, 0.02, 0.01, -0.02];
      const metrics = calculatePerformanceMetrics(returns);
      expect(metrics.winRate).toBeCloseTo(0.6, 5);
    });

    it('should calculate max drawdown', () => {
      const returns = [0.1, -0.05, -0.05, 0.02, -0.1];
      const metrics = calculatePerformanceMetrics(returns);
      expect(metrics.maxDrawdown).toBeGreaterThan(0);
    });

    it('should handle empty array', () => {
      const metrics = calculatePerformanceMetrics([]);
      expect(metrics.totalReturn).toBe(0);
      expect(metrics.sharpeRatio).toBe(0);
    });

    it('should handle all positive returns', () => {
      const returns = [0.01, 0.02, 0.01];
      const metrics = calculatePerformanceMetrics(returns);
      expect(metrics.winRate).toBe(1);
      expect(metrics.totalReturn).toBeGreaterThan(0);
    });

    it('should handle all negative returns', () => {
      const returns = [-0.01, -0.02, -0.01];
      const metrics = calculatePerformanceMetrics(returns);
      expect(metrics.winRate).toBe(0);
      expect(metrics.totalReturn).toBeLessThan(0);
    });

    it('should calculate sharpe ratio', () => {
      const returns = [0.001, -0.0005, 0.002, 0.001, -0.001];
      const metrics = calculatePerformanceMetrics(returns);
      expect(metrics.sharpeRatio).toBeDefined();
      expect(typeof metrics.sharpeRatio).toBe('number');
    });
  });

  describe('calculateRollingMetrics', () => {
    it('should return correct number of windows', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02);
      const results = calculateRollingMetrics(returns, 20);
      expect(results.length).toBe(81); // 100 - 20 + 1
    });

    it('should handle window larger than data', () => {
      const returns = [0.01, 0.02];
      const results = calculateRollingMetrics(returns, 10);
      expect(results.length).toBe(0);
    });
  });

  describe('monteCarloWalkForward', () => {
    it('should return reasonable statistics', () => {
      const optimize = () => ({ param: 10 });
      const backtest = (): PerformanceMetrics => ({
        totalReturn: Math.random() * 0.2 - 0.05,
        annualizedReturn: 0, volatility: 0, sharpeRatio: 0,
        maxDrawdown: 0, winRate: 0.5, profitFactor: 1, numTrades: 10
      });

      const result = monteCarloWalkForward(200, 50, optimize, backtest);
      expect(result.stdOOSReturn).toBeGreaterThanOrEqual(0);
      expect(result.worstCase).toBeLessThanOrEqual(result.bestCase);
    });
  });
});
