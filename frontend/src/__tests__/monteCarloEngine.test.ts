import { describe, it, expect } from 'vitest';
import {
  simulateGBMPaths,
  simulateJumpDiffusion,
  analyzeMonteCarloResults,
  stressTest,
  evaluateStrategyRobustness,
  type MonteCarloConfig,
  type StressTestScenario,
} from '../utils/monteCarloEngine';

describe('蒙特卡洛模拟引擎', () => {
  describe('simulateGBMPaths', () => {
    it('should generate correct number of paths', () => {
      const config: MonteCarloConfig = {
        numSimulations: 100,
        numSteps: 50,
        initialValue: 100,
        drift: 0.05,
        volatility: 0.2
      };
      const paths = simulateGBMPaths(config);
      expect(paths.length).toBe(100);
    });

    it('each path should have correct length', () => {
      const config: MonteCarloConfig = {
        numSimulations: 10,
        numSteps: 20,
        initialValue: 100,
        drift: 0.05,
        volatility: 0.2
      };
      const paths = simulateGBMPaths(config);
      for (const path of paths) {
        expect(path.values.length).toBe(21); // initial + 20 steps
      }
    });

    it('should start at initial value', () => {
      const config: MonteCarloConfig = {
        numSimulations: 50,
        numSteps: 30,
        initialValue: 250,
        drift: 0.08,
        volatility: 0.15
      };
      const paths = simulateGBMPaths(config);
      for (const path of paths) {
        expect(path.values[0]).toBe(250);
      }
    });

    it('positive drift should produce positive expected return', () => {
      const config: MonteCarloConfig = {
        numSimulations: 500,
        numSteps: 100,
        initialValue: 100,
        drift: 0.10,
        volatility: 0.15
      };
      const paths = simulateGBMPaths(config);
      const avgFinal = paths.reduce((s, p) => s + p.finalValue, 0) / paths.length;
      expect(avgFinal).toBeGreaterThan(100);
    });

    it('should produce deterministic results with randomSeed', () => {
      const config: MonteCarloConfig = {
        numSimulations: 100,
        numSteps: 50,
        initialValue: 100,
        drift: 0.05,
        volatility: 0.2,
        randomSeed: 42
      };
      const paths1 = simulateGBMPaths(config);
      const paths2 = simulateGBMPaths(config);
      expect(paths1.length).toBe(paths2.length);
      for (let i = 0; i < paths1.length; i++) {
        expect(paths1[i].values).toEqual(paths2[i].values);
        expect(paths1[i].finalValue).toBe(paths2[i].finalValue);
        expect(paths1[i].maxDrawdown).toBe(paths2[i].maxDrawdown);
      }
    });

    it('different seeds should produce different results', () => {
      const config1: MonteCarloConfig = {
        numSimulations: 50,
        numSteps: 30,
        initialValue: 100,
        drift: 0.05,
        volatility: 0.2,
        randomSeed: 42
      };
      const config2: MonteCarloConfig = { ...config1, randomSeed: 99 };
      const paths1 = simulateGBMPaths(config1);
      const paths2 = simulateGBMPaths(config2);
      const avgFinal1 = paths1.reduce((s, p) => s + p.finalValue, 0) / paths1.length;
      const avgFinal2 = paths2.reduce((s, p) => s + p.finalValue, 0) / paths2.length;
      expect(avgFinal1).not.toBe(avgFinal2);
    });

    it('should track max drawdown', () => {
      const config: MonteCarloConfig = {
        numSimulations: 100,
        numSteps: 50,
        initialValue: 100,
        drift: 0,
        volatility: 0.3
      };
      const paths = simulateGBMPaths(config);
      for (const path of paths) {
        expect(path.maxDrawdown).toBeGreaterThanOrEqual(0);
        expect(path.maxDrawdown).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('simulateJumpDiffusion', () => {
    it('should generate paths with jumps', () => {
      const config = {
        numSimulations: 50,
        numSteps: 100,
        initialValue: 100,
        drift: 0.05,
        volatility: 0.2,
        jumpIntensity: 2,
        jumpMean: -0.05,
        jumpStd: 0.1
      };
      const paths = simulateJumpDiffusion(config);
      expect(paths.length).toBe(50);
      for (const path of paths) {
        expect(path.values.length).toBe(101);
      }
    });
  });

  describe('analyzeMonteCarloResults', () => {
    it('should compute statistics', () => {
      const config: MonteCarloConfig = {
        numSimulations: 500,
        numSteps: 50,
        initialValue: 100,
        drift: 0.05,
        volatility: 0.2
      };
      const paths = simulateGBMPaths(config);
      const result = analyzeMonteCarloResults(paths);

      expect(result.statistics.mean).toBeGreaterThan(0);
      expect(result.statistics.std).toBeGreaterThan(0);
      expect(result.statistics.min).toBeLessThanOrEqual(result.statistics.mean);
      expect(result.statistics.max).toBeGreaterThanOrEqual(result.statistics.mean);
    });

    it('should compute percentiles', () => {
      const config: MonteCarloConfig = {
        numSimulations: 1000,
        numSteps: 50,
        initialValue: 100,
        drift: 0.05,
        volatility: 0.2
      };
      const paths = simulateGBMPaths(config);
      const result = analyzeMonteCarloResults(paths);

      expect(result.percentiles[5]).toBeLessThan(result.percentiles[50]);
      expect(result.percentiles[50]).toBeLessThan(result.percentiles[95]);
    });

    it('should compute risk metrics', () => {
      const config: MonteCarloConfig = {
        numSimulations: 1000,
        numSteps: 50,
        initialValue: 100,
        drift: 0.05,
        volatility: 0.2
      };
      const paths = simulateGBMPaths(config);
      const result = analyzeMonteCarloResults(paths);

      expect(result.riskMetrics.var95).toBeGreaterThan(0);
      expect(result.riskMetrics.var99).toBeGreaterThanOrEqual(result.riskMetrics.var95);
      expect(result.riskMetrics.cvar95).toBeGreaterThanOrEqual(result.riskMetrics.var95);
      expect(result.riskMetrics.probabilityOfLoss).toBeGreaterThanOrEqual(0);
      expect(result.riskMetrics.probabilityOfLoss).toBeLessThanOrEqual(1);
    });
  });

  describe('stressTest', () => {
    it('should run multiple scenarios', () => {
      const baseConfig: MonteCarloConfig = {
        numSimulations: 200,
        numSteps: 50,
        initialValue: 100,
        drift: 0.05,
        volatility: 0.2
      };

      const scenarios: StressTestScenario[] = [
        { name: 'Base', driftShift: 0, volMultiplier: 1 },
        { name: 'Bear', driftShift: -0.15, volMultiplier: 1.5 },
        { name: 'Crash', driftShift: -0.30, volMultiplier: 2, crashDay: 10, crashMagnitude: -0.2 },
      ];

      const results = stressTest(baseConfig, scenarios);
      expect(results.length).toBe(3);

      // 熊市场景应该有更高的亏损概率
      const base = results.find(r => r.scenario === 'Base')!;
      const bear = results.find(r => r.scenario === 'Bear')!;
      expect(bear.probabilityOfLoss).toBeGreaterThan(base.probabilityOfLoss - 0.1);
    });
  });

  describe('evaluateStrategyRobustness', () => {
    it('should evaluate from returns', () => {
      // 使用确定性波函数生成测试数据
      const returns = Array.from({ length: 200 }, (_, i) => 0.005 + Math.sin(i * 0.3) * 0.003);
      const result = evaluateStrategyRobustness(returns, 100, 20, 42);

      expect(result.probPositive).toBeGreaterThanOrEqual(0);
      expect(result.probPositive).toBeLessThanOrEqual(1);
      expect(result.worstCase5pct).toBeLessThanOrEqual(result.bestCase95pct);
    });

    it('should handle positive returns', () => {
      const returns = Array.from({ length: 100 }, (_, i) => 0.005 + Math.sin(i * 0.3) * 0.002);
      const result = evaluateStrategyRobustness(returns, 50, 20, 42);
      expect(result.probPositive).toBeGreaterThan(0.9);
    });
  });
});
