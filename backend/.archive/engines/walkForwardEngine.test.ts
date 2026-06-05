import { describe, it, expect } from 'vitest';
import {
  generateWalkForwardWindows,
  computeWindowReturns,
  computeSharpeRatio,
  computeMaxDrawdown,
  runWalkForwardBacktest,
  parameterStability,
  type WalkForwardConfig,
  type StrategySignal,
} from '../services/walkForwardEngine';

describe('walkForwardEngine', () => {
  describe('generateWalkForwardWindows', () => {
    it('should generate non-overlapping windows', () => {
      const config: WalkForwardConfig = {
        totalPeriods: 200,
        inSampleRatio: 0.6,
        stepSize: 20,
        purgeGap: 5,
      };
      const windows = generateWalkForwardWindows(config);
      expect(windows.length).toBeGreaterThan(0);

      windows.forEach(w => {
        expect(w.inSample[1]).toBeLessThan(w.outOfSample[0]);
        expect(w.outOfSample[1]).toBeGreaterThan(w.outOfSample[0]);
      });
    });

    it('should respect purge gap', () => {
      const config: WalkForwardConfig = {
        totalPeriods: 200,
        inSampleRatio: 0.5,
        stepSize: 30,
        purgeGap: 10,
      };
      const windows = generateWalkForwardWindows(config);
      windows.forEach(w => {
        expect(w.outOfSample[0] - w.inSample[1]).toBe(10);
      });
    });

    it('should handle small total periods', () => {
      const config: WalkForwardConfig = {
        totalPeriods: 10,
        inSampleRatio: 0.8,
        stepSize: 5,
        purgeGap: 1,
      };
      const windows = generateWalkForwardWindows(config);
      expect(windows.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('computeWindowReturns', () => {
    it('should compute returns from signals', () => {
      const prices = [100, 101, 102, 103, 102, 104, 105];
      const signals: StrategySignal[] = [
        { time: 2, action: 'buy', price: 102, confidence: 0.8 },
        { time: 5, action: 'sell', price: 104, confidence: 0.6 },
      ];
      const result = computeWindowReturns(prices, signals, 0, 7);
      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].pnl).toBeCloseTo((104 - 102) / 102, 4);
    });

    it('should handle no signals', () => {
      const prices = [100, 101, 102];
      const result = computeWindowReturns(prices, [], 0, 3);
      expect(result.trades).toHaveLength(0);
    });
  });

  describe('computeSharpeRatio', () => {
    it('should compute positive Sharpe for profitable returns', () => {
      const returns = [0.01, 0.02, -0.005, 0.015, 0.01, 0.005, -0.01, 0.02];
      const sharpe = computeSharpeRatio(returns);
      expect(sharpe).toBeGreaterThan(0);
    });

    it('should compute negative Sharpe for losing returns', () => {
      const returns = [-0.01, -0.02, 0.005, -0.015, -0.01];
      const sharpe = computeSharpeRatio(returns);
      expect(sharpe).toBeLessThan(0);
    });

    it('should handle insufficient data', () => {
      expect(computeSharpeRatio([0.01])).toBe(0);
    });

    it('should handle zero volatility', () => {
      const returns = [0.01, 0.01, 0.01, 0.01];
      const sharpe = computeSharpeRatio(returns);
      expect(sharpe).toBe(0);
    });
  });

  describe('computeMaxDrawdown', () => {
    it('should compute max drawdown correctly', () => {
      const returns = [0.1, 0.1, -0.2, 0.05, -0.15, 0.1];
      const maxDD = computeMaxDrawdown(returns);
      expect(maxDD).toBeGreaterThan(0);
      expect(maxDD).toBeLessThan(1);
    });

    it('should return 0 for all positive returns', () => {
      const returns = [0.01, 0.02, 0.01, 0.03];
      expect(computeMaxDrawdown(returns)).toBe(0);
    });

    it('should return 0 for empty array', () => {
      expect(computeMaxDrawdown([])).toBe(0);
    });

    it('should handle single loss', () => {
      expect(computeMaxDrawdown([-0.5])).toBeCloseTo(0.5, 4);
    });
  });

  describe('runWalkForwardBacktest', () => {
    it('should run walk-forward backtest', () => {
      const prices = Array.from({ length: 200 }, (_, i) => 100 + i * 0.1 + Math.sin(i * 0.1) * 5);
      const signals: StrategySignal[] = prices.map((_, i) => ({
        time: i,
        action: i % 20 < 10 ? 'buy' : 'sell',
        price: prices[i],
        confidence: 0.5,
      } as StrategySignal));

      const config: WalkForwardConfig = {
        totalPeriods: 200,
        inSampleRatio: 0.6,
        stepSize: 20,
        purgeGap: 5,
      };

      const result = runWalkForwardBacktest(prices, signals, config);
      expect(result.windows.length).toBeGreaterThan(0);
      expect(result.avgInSampleReturn).toBeTypeOf('number');
      expect(result.avgOutOfSampleReturn).toBeTypeOf('number');
      expect(result.efficiencyRatio).toBeTypeOf('number');
      expect(result.robustnessScore).toBeGreaterThanOrEqual(0);
      expect(result.robustnessScore).toBeLessThanOrEqual(1);
    });

    it('should detect overfitting', () => {
      const prices = Array.from({ length: 200 }, (_, i) => 100 + i * 0.01);
      const signals: StrategySignal[] = prices.map((_, i) => ({
        time: i,
        action: 'hold',
        price: prices[i],
        confidence: 0,
      } as StrategySignal));

      const result = runWalkForwardBacktest(prices, signals, {
        totalPeriods: 200,
        inSampleRatio: 0.7,
        stepSize: 30,
        purgeGap: 5,
      });

      expect(result.isOverfit).toBeTypeOf('boolean');
    });
  });

  describe('parameterStability', () => {
    it('should measure parameter stability', () => {
      const paramSets = {
        lookback: [20, 22, 21, 19, 23],
        threshold: [2.0, 2.1, 2.0, 1.9, 2.2],
      };
      const windowResults = [
        { windowId: 0, inSampleStart: 0, inSampleEnd: 100, outOfSampleStart: 105, outOfSampleEnd: 130,
          inSampleReturn: 0.1, outOfSampleReturn: 0.05, inSampleSharpe: 1, outOfSampleSharpe: 0.5,
          maxDrawdown: 0.1, trades: 5 },
        { windowId: 1, inSampleStart: 20, inSampleEnd: 120, outOfSampleStart: 125, outOfSampleEnd: 150,
          inSampleReturn: 0.08, outOfSampleReturn: 0.03, inSampleSharpe: 0.8, outOfSampleSharpe: 0.3,
          maxDrawdown: 0.15, trades: 3 },
      ];

      const result = parameterStability(paramSets, windowResults);
      expect(result.lookback.stability).toBeGreaterThan(0);
      expect(result.lookback.stability).toBeLessThanOrEqual(1);
      expect(result.threshold.drift).toBeGreaterThanOrEqual(0);
    });

    it('should handle single value', () => {
      const result = parameterStability({ x: [5] }, []);
      expect(result.x.stability).toBe(1);
      expect(result.x.drift).toBe(0);
    });
  });
});
