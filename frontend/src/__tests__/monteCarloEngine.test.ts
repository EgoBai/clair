import { describe, it, expect } from 'vitest';
import { MonteCarloEngine } from '../utils/monteCarloEngine';
import type { MonteCarloParams } from '../utils/monteCarloEngine';

describe('MonteCarloEngine', () => {
  const engine = new MonteCarloEngine();

  const defaultParams: MonteCarloParams = {
    initialValue: 100,
    expectedReturn: 0.08,
    volatility: 0.2,
    timeHorizon: 1,
    steps: 252,
    simulations: 1000,
  };

  describe('股价路径模拟', () => {
    it('应生成指定数量的路径', () => {
      const result = engine.simulatePaths(defaultParams);
      expect(result.paths.length).toBe(1000);
      expect(result.paths[0].length).toBe(253); // steps + 1
    });

    it('路径应从初始值开始', () => {
      const result = engine.simulatePaths(defaultParams);
      result.paths.forEach(path => {
        expect(path[0]).toBe(100);
      });
    });

    it('均值应在合理范围内', () => {
      const result = engine.simulatePaths(defaultParams);
      // 预期均值 ≈ S0 * exp(mu*T) ≈ 100 * exp(0.08) ≈ 108.3
      expect(result.statistics.mean).toBeGreaterThan(80);
      expect(result.statistics.mean).toBeLessThan(140);
    });

    it('最小值应小于最大值', () => {
      const result = engine.simulatePaths(defaultParams);
      expect(result.statistics.min).toBeLessThan(result.statistics.max);
    });

    it('标准差应为正', () => {
      const result = engine.simulatePaths(defaultParams);
      expect(result.statistics.stdDev).toBeGreaterThan(0);
    });

    it('百分位数应单调递增', () => {
      const result = engine.simulatePaths(defaultParams);
      const pcts = [1, 5, 10, 25, 50, 75, 90, 95, 99];
      for (let i = 1; i < pcts.length; i++) {
        expect(result.percentiles[pcts[i]]).toBeGreaterThanOrEqual(result.percentiles[pcts[i - 1]]);
      }
    });

    it('VaR应为正数', () => {
      const result = engine.simulatePaths(defaultParams);
      expect(typeof result.var95).toBe('number');
      expect(result.cvar95).toBeGreaterThanOrEqual(result.var95);
    });
  });

  describe('参数敏感性', () => {
    it('高波动率应有更大标准差', () => {
      const lowVol = engine.simulatePaths({ ...defaultParams, volatility: 0.1 });
      const highVol = engine.simulatePaths({ ...defaultParams, volatility: 0.4 });
      expect(highVol.statistics.stdDev).toBeGreaterThan(lowVol.statistics.stdDev);
    });

    it('高预期收益应有更高均值', () => {
      const lowRet = engine.simulatePaths({ ...defaultParams, expectedReturn: 0.02 });
      const highRet = engine.simulatePaths({ ...defaultParams, expectedReturn: 0.15 });
      expect(highRet.statistics.mean).toBeGreaterThan(lowRet.statistics.mean);
    });

    it('更长时间应有更大分散', () => {
      const short = engine.simulatePaths({ ...defaultParams, timeHorizon: 0.25 });
      const long = engine.simulatePaths({ ...defaultParams, timeHorizon: 3 });
      expect(long.statistics.stdDev).toBeGreaterThan(short.statistics.stdDev);
    });
  });

  describe('投资组合模拟', () => {
    it('应计算组合统计', () => {
      const result = engine.simulatePortfolio(
        [0.6, 0.4],
        [0.1, 0.05],
        [[0.04, 0.01], [0.01, 0.02]],
        100000,
        1,
        1000,
      );
      expect(result.finalValues.length).toBe(1000);
      expect(result.expectedReturn).toBeDefined();
      expect(result.risk).toBeGreaterThan(0);
    });

    it('亏损概率应在0-1之间', () => {
      const result = engine.simulatePortfolio(
        [0.6, 0.4],
        [0.1, 0.05],
        [[0.04, 0.01], [0.01, 0.02]],
        100000,
        1,
        1000,
      );
      expect(result.probLoss).toBeGreaterThanOrEqual(0);
      expect(result.probLoss).toBeLessThanOrEqual(1);
    });

    it('最大回撤应在0-1之间', () => {
      const result = engine.simulatePortfolio(
        [1],
        [0.1],
        [[0.04]],
        100000,
        1,
        1000,
      );
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(result.maxDrawdown).toBeLessThanOrEqual(1);
    });

    it('Sharpe比率应可正可负', () => {
      const result = engine.simulatePortfolio(
        [1],
        [-0.05],
        [[0.04]],
        100000,
        1,
        1000,
      );
      expect(typeof result.sharpeRatio).toBe('number');
    });
  });

  describe('期权定价', () => {
    it('看涨期权价格应为正', () => {
      engine.setSeed(42);
      const result = engine.priceOption(100, 100, 0.05, 0.2, 1, 'call');
      expect(result.price).toBeGreaterThan(0);
    });

    it('看跌期权价格应为正', () => {
      engine.setSeed(42);
      const result = engine.priceOption(100, 100, 0.05, 0.2, 1, 'put');
      expect(result.price).toBeGreaterThan(0);
    });

    it('ATM看涨应>ATM看跌(正利率)', () => {
      engine.setSeed(42);
      const call = engine.priceOption(100, 100, 0.05, 0.2, 1, 'call', 50000);
      engine.setSeed(42);
      const put = engine.priceOption(100, 100, 0.05, 0.2, 1, 'put', 50000);
      expect(call.price).toBeGreaterThan(put.price);
    });

    it('深度虚值看涨应接近0', () => {
      engine.setSeed(42);
      const result = engine.priceOption(50, 200, 0.05, 0.2, 0.1, 'call');
      expect(result.price).toBeLessThan(0.1);
    });

    it('标准误应为正', () => {
      engine.setSeed(42);
      const result = engine.priceOption(100, 100, 0.05, 0.2, 1, 'call');
      expect(result.stdError).toBeGreaterThan(0);
    });

    it('更多模拟应有更小标准误', () => {
      engine.setSeed(42);
      const few = engine.priceOption(100, 100, 0.05, 0.2, 1, 'call', 1000);
      engine.setSeed(42);
      const many = engine.priceOption(100, 100, 0.05, 0.2, 1, 'call', 50000);
      expect(many.stdError).toBeLessThan(few.stdError);
    });
  });

  describe('随机种子', () => {
    it('相同种子应产生相同结果', () => {
      engine.setSeed(123);
      const r1 = engine.simulatePaths({ ...defaultParams, simulations: 10 });
      engine.setSeed(123);
      const r2 = engine.simulatePaths({ ...defaultParams, simulations: 10 });
      expect(r1.statistics.mean).toBe(r2.statistics.mean);
    });

    it('不同种子应产生不同结果', () => {
      engine.setSeed(123);
      const r1 = engine.simulatePaths({ ...defaultParams, simulations: 100 });
      engine.setSeed(456);
      const r2 = engine.simulatePaths({ ...defaultParams, simulations: 100 });
      expect(r1.statistics.mean).not.toBe(r2.statistics.mean);
    });
  });

  describe('边界情况', () => {
    it('零波动率应产生确定性路径', () => {
      const result = engine.simulatePaths({ ...defaultParams, volatility: 0, simulations: 10 });
      expect(result.statistics.stdDev).toBe(0);
    });

    it('单次模拟不应报错', () => {
      const result = engine.simulatePaths({ ...defaultParams, simulations: 1 });
      expect(result.paths.length).toBe(1);
    });

    it('零预期收益不应报错', () => {
      expect(() => engine.simulatePaths({ ...defaultParams, expectedReturn: 0, simulations: 10 })).not.toThrow();
    });
  });
});
