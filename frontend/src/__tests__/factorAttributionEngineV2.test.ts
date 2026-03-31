/**
 * 因子归因引擎v2测试
 */
import { describe, it, expect } from 'vitest';
import { FactorAttributionEngineV2 } from '../utils/factorAttributionEngineV2';

describe('FactorAttributionEngineV2', () => {
  const engine = new FactorAttributionEngineV2();

  const generateReturns = (count: number, drift: number = 0) =>
    Array.from({ length: count }, () => (Math.random() - 0.5) * 0.04 + drift);

  const generateFactorReturns = (count: number) => {
    const factors = new Map<string, number[]>();
    factors.set('market', generateReturns(count, 0.0003));
    factors.set('size', generateReturns(count));
    factors.set('value', generateReturns(count));
    factors.set('momentum', generateReturns(count));
    factors.set('quality', generateReturns(count));
    factors.set('lowVol', generateReturns(count));
    return factors;
  };

  describe('brinsonAttribution', () => {
    it('应该执行Brinson归因', () => {
      const portfolioWeights = new Map([['A', 0.4], ['B', 0.3], ['C', 0.3]]);
      const benchmarkWeights = new Map([['A', 0.3], ['B', 0.4], ['C', 0.3]]);
      const portfolioReturns = new Map([['A', 0.01], ['B', 0.02], ['C', 0.005]]);
      const benchmarkReturns = new Map([['A', 0.008], ['B', 0.015], ['C', 0.003]]);
      const sectorMapping = new Map([['A', '消费'], ['B', '金融'], ['C', '消费']]);

      const result = engine.brinsonAttribution(
        portfolioWeights, benchmarkWeights,
        portfolioReturns, benchmarkReturns,
        sectorMapping
      );

      expect(typeof result.allocationEffect).toBe('number');
      expect(typeof result.selectionEffect).toBe('number');
      expect(typeof result.interactionEffect).toBe('number');
      expect(result.totalEffect).toBeCloseTo(
        result.allocationEffect + result.selectionEffect + result.interactionEffect, 4
      );
      expect(result.sectorBreakdown.size).toBeGreaterThan(0);
    });
  });

  describe('analyzeFactorExposures', () => {
    it('应该分析因子暴露', () => {
      const returns = generateReturns(100);
      const factorReturns = generateFactorReturns(100);

      const result = engine.analyzeFactorExposures(returns, factorReturns);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].factor).toBeTruthy();
      expect(typeof result[0].exposure).toBe('number');
      expect(typeof result[0].contribution).toBe('number');
      expect(typeof result[0].tStat).toBe('number');
      expect(typeof result[0].significant).toBe('boolean');
    });

    it('不足数据应返回空', () => {
      const result = engine.analyzeFactorExposures([1, 2, 3], new Map());
      expect(result.length).toBe(0);
    });
  });

  describe('analyzeFactorReturns', () => {
    it('应该分析因子收益', () => {
      const factorReturns = generateFactorReturns(100);
      const result = engine.analyzeFactorReturns(factorReturns);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].factor).toBeTruthy();
      expect(result[0].sharpeRatio).toBeDefined();
      expect(result[0].hitRate).toBeGreaterThanOrEqual(0);
      expect(result[0].hitRate).toBeLessThanOrEqual(1);
      expect(result[0].maxDrawdown).toBeGreaterThanOrEqual(0);
    });
  });

  describe('analyzeRiskAttribution', () => {
    it('应该分析风险归因', () => {
      const returns = generateReturns(100);
      const factorReturns = generateFactorReturns(100);

      const result = engine.analyzeRiskAttribution(returns, factorReturns);

      expect(result.totalRisk).toBeGreaterThanOrEqual(0);
      expect(result.systematicRisk).toBeGreaterThanOrEqual(0);
      expect(result.idiosyncraticRisk).toBeGreaterThanOrEqual(0);
      expect(result.diversificationRatio).toBeGreaterThanOrEqual(0);
      expect(result.factorContributions.size).toBeGreaterThan(0);
    });

    it('有基准应计算跟踪误差', () => {
      const returns = generateReturns(100);
      const factorReturns = generateFactorReturns(100);
      const benchmark = generateReturns(100);

      const result = engine.analyzeRiskAttribution(returns, factorReturns, benchmark);
      expect(result.trackingError).toBeGreaterThan(0);
    });
  });

  describe('analyzeStyle', () => {
    it('应该分析风格', () => {
      const returns = generateReturns(100);
      const factorReturns = generateFactorReturns(100);

      const result = engine.analyzeStyle(returns, factorReturns);

      expect(typeof result.growth).toBe('number');
      expect(typeof result.value).toBe('number');
      expect(typeof result.momentum).toBe('number');
      expect(typeof result.quality).toBe('number');
      expect(typeof result.size).toBe('number');
      expect(typeof result.lowVol).toBe('number');
      expect(result.dominantStyle).toBeTruthy();
      expect(result.stylePurity).toBeGreaterThanOrEqual(0);
      expect(result.stylePurity).toBeLessThanOrEqual(1);
    });
  });
});
