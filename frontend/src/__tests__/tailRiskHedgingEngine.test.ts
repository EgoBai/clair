import { describe, it, expect } from 'vitest';
import { TailRiskHedgingEngine } from '../utils/tailRiskHedgingEngine';

describe('Tail Risk Hedging Engine', () => {
  const engine = new TailRiskHedgingEngine();

  const makeReturns = (n = 200) => Array.from({ length: n }, () => (Math.random() - 0.5) * 0.02);
  const makeFatTailReturns = (n = 200) => {
    const r = makeReturns(n);
    // 添加一些极端值
    r[0] = -0.08; r[50] = 0.06; r[100] = -0.05;
    return r;
  };

  describe('calcTailRiskMetrics', () => {
    it('应计算VaR', () => {
      const returns = makeFatTailReturns(200);
      const result = engine.calcTailRiskMetrics(returns);
      expect(result.var95).toBeGreaterThan(0);
      expect(result.var99).toBeGreaterThan(0);
    });

    it('CVaR应大于VaR', () => {
      const returns = makeFatTailReturns(200);
      const result = engine.calcTailRiskMetrics(returns);
      expect(result.cvar95).toBeGreaterThanOrEqual(result.var95);
    });

    it('数据不足应返回零', () => {
      const result = engine.calcTailRiskMetrics([1, 2, 3]);
      expect(result.var95).toBe(0);
    });
  });

  describe('estimateExtremeEventProb', () => {
    it('应估计极端事件概率', () => {
      const returns = makeFatTailReturns(200);
      const result = engine.estimateExtremeEventProb(returns, 0.02, 0.015);
      expect(result.oneDayProb).toBeGreaterThanOrEqual(0);
      expect(result.oneDayProb).toBeLessThanOrEqual(1);
      expect(['crash', 'melt_up', 'vol_spike', 'liquidity_crisis']).toContain(result.eventType);
    });

    it('周概率应大于日概率', () => {
      const returns = makeFatTailReturns(200);
      const result = engine.estimateExtremeEventProb(returns, 0.02, 0.015);
      expect(result.oneWeekProb).toBeGreaterThanOrEqual(result.oneDayProb);
    });
  });

  describe('recommendHedging', () => {
    it('应推荐对冲策略', () => {
      const returns = makeFatTailReturns(200);
      const metrics = engine.calcTailRiskMetrics(returns);
      const strategies = engine.recommendHedging(metrics, 0.02, 1e8);
      expect(strategies.length).toBeGreaterThan(0);
      for (const s of strategies) {
        expect(['implement', 'consider', 'monitor', 'pass']).toContain(s.recommendation);
        expect(s.protectionLevel).toBeGreaterThan(0);
      }
    });

    it('应按成本效率排序', () => {
      const returns = makeFatTailReturns(200);
      const metrics = engine.calcTailRiskMetrics(returns);
      const strategies = engine.recommendHedging(metrics, 0.02, 1e8);
      for (let i = 1; i < strategies.length; i++) {
        expect(strategies[i - 1].costEfficiency).toBeGreaterThanOrEqual(strategies[i].costEfficiency);
      }
    });
  });

  describe('calcBlackSwanIndicator', () => {
    it('应计算黑天鹅指标', () => {
      const returns = makeReturns(200);
      const result = engine.calcBlackSwanIndicator(returns, 0.015, false, false);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(['calm', 'elevated', 'warning', 'danger']).toContain(result.level);
    });

    it('高波动率应升高风险', () => {
      const returns = makeFatTailReturns(200);
      const normal = engine.calcBlackSwanIndicator(returns, 0.015, false, false);
      const stressed = engine.calcBlackSwanIndicator(returns, 0.04, true, true);
      expect(stressed.score).toBeGreaterThan(normal.score);
    });
  });
});
