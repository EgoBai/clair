import { describe, it, expect } from 'vitest';
import { LiquidityRiskEngine } from '../utils/liquidityRiskEngine';

describe('Liquidity Risk Engine', () => {
  const engine = new LiquidityRiskEngine();

  describe('analyzeSpreads', () => {
    it('应分析买卖价差', () => {
      const bids = [10.0, 10.1, 10.05, 9.98, 10.02];
      const asks = [10.05, 10.15, 10.10, 10.03, 10.07];
      const mids = bids.map((b, i) => (b + asks[i]) / 2);
      const result = engine.analyzeSpreads(bids, asks, mids);
      expect(result.avgSpread).toBeGreaterThan(0);
      expect(result.avgSpreadPct).toBeGreaterThan(0);
    });

    it('有效价差应大于零', () => {
      const bids = [10.0, 10.1];
      const asks = [10.05, 10.15];
      const mids = [10.025, 10.125];
      const result = engine.analyzeSpreads(bids, asks, mids);
      expect(result.effectiveSpread).toBeGreaterThan(0);
    });

    it('数据不足应返回零', () => {
      const result = engine.analyzeSpreads([10], [10.05], [10.025]);
      expect(result.avgSpread).toBe(0);
    });
  });

  describe('estimateMarketImpact', () => {
    it('应估计市场冲击', () => {
      const result = engine.estimateMarketImpact(100000, 1e7, 0.02, 0.01);
      expect(result.temporaryImpact).toBeGreaterThan(0);
      expect(result.permanentImpact).toBeGreaterThan(0);
      expect(result.totalCost).toBeGreaterThan(0);
    });

    it('大单冲击应大于小单', () => {
      const small = engine.estimateMarketImpact(10000, 1e7, 0.02, 0.01);
      const large = engine.estimateMarketImpact(1e6, 1e7, 0.02, 0.01);
      expect(large.temporaryImpact).toBeGreaterThan(small.temporaryImpact);
    });
  });

  describe('calcAmihudIlliquidity', () => {
    it('应计算Amihud非流动性指标', () => {
      const returns = Array.from({ length: 30 }, () => (Math.random() - 0.5) * 0.02);
      const volumes = Array.from({ length: 30 }, () => 1e6 + Math.random() * 1e6);
      const prices = Array.from({ length: 30 }, () => 10 + Math.random());
      const result = engine.calcAmihudIlliquidity(returns, volumes, prices);
      expect(result.dailyAmihud).toBeGreaterThanOrEqual(0);
      expect(result.illiquidityPercentile).toBeGreaterThanOrEqual(0);
    });

    it('百分位应在0-100之间', () => {
      const returns = Array.from({ length: 30 }, () => (Math.random() - 0.5) * 0.02);
      const volumes = Array.from({ length: 30 }, () => 1e6);
      const prices = Array.from({ length: 30 }, () => 10);
      const result = engine.calcAmihudIlliquidity(returns, volumes, prices);
      expect(result.illiquidityPercentile).toBeLessThanOrEqual(100);
    });
  });

  describe('analyzeTurnover', () => {
    it('应分析换手率', () => {
      const turnovers = Array.from({ length: 30 }, () => 0.01 + Math.random() * 0.03);
      const result = engine.analyzeTurnover(turnovers, turnovers);
      expect(result.avgTurnover).toBeGreaterThan(0);
      expect(['increasing', 'stable', 'decreasing']).toContain(result.turnoverTrend);
    });

    it('稳定性应在0-1之间', () => {
      const turnovers = Array.from({ length: 30 }, () => 0.02);
      const result = engine.analyzeTurnover(turnovers, []);
      expect(result.turnoverStability).toBeGreaterThanOrEqual(0);
      expect(result.turnoverStability).toBeLessThanOrEqual(1);
    });
  });

  describe('assessLargeOrderRisk', () => {
    it('应评估大单执行风险', () => {
      const result = engine.assessLargeOrderRisk(100000, 1e7, 0.02, 0.01);
      expect(['market', 'limit', 'twap', 'vwap', 'iceberg']).toContain(result.recommendation);
      expect(result.priceImpact).toBeGreaterThan(0);
      expect(result.estimatedCompletionTime).toBeGreaterThan(0);
    });

    it('参与率应计算正确', () => {
      const result = engine.assessLargeOrderRisk(1e6, 1e7, 0.02, 0.01);
      expect(result.participationRate).toBe(10);
    });
  });

  describe('calcLiquidityScore', () => {
    it('应计算流动性评分', () => {
      const result = engine.calcLiquidityScore(0.001, 1e7, 0.02, 0.015);
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade);
    });

    it('高流动性应得高分', () => {
      const result = engine.calcLiquidityScore(0.0001, 1e9, 0.05, 0.015);
      expect(result.overallScore).toBeGreaterThan(50);
    });
  });
});
