import { describe, it, expect } from 'vitest';
import { FactorMiningEngine, type FactorData } from '../utils/factorMiningEngine';

describe('量化因子挖掘引擎', () => {
  const engine = new FactorMiningEngine();

  const createFactor = (overrides: Partial<FactorData> = {}): FactorData => ({
    name: 'PE因子',
    values: [
      { stockCode: 'A', value: 10 },
      { stockCode: 'B', value: 15 },
      { stockCode: 'C', value: 20 },
      { stockCode: 'D', value: 25 },
      { stockCode: 'E', value: 30 },
    ],
    date: '2024-01-15',
    category: 'value',
    ...overrides
  });

  describe('calculateIC', () => {
    it('计算IC值', () => {
      const returns = [
        { stockCode: 'A', return: 5 },
        { stockCode: 'B', return: 3 },
        { stockCode: 'C', return: 2 },
        { stockCode: 'D', return: 1 },
        { stockCode: 'E', return: -1 },
      ];
      const result = engine.calculateIC(createFactor(), returns);
      expect(result.ic).toBeLessThan(0); // 高因子值→低收益，负相关
      expect(result.factorName).toBe('PE因子');
    });

    it('数据不足返回零值', () => {
      const result = engine.calculateIC(
        createFactor({ values: [{ stockCode: 'A', value: 10 }] }),
        [{ stockCode: 'A', return: 5 }]
      );
      expect(result.ic).toBe(0);
      expect(result.effective).toBe(false);
    });

    it('IC在-1到1之间', () => {
      const returns = createFactor().values.map(v => ({ stockCode: v.stockCode, return: Math.random() * 10 }));
      const result = engine.calculateIC(createFactor(), returns);
      expect(result.ic).toBeGreaterThanOrEqual(-1);
      expect(result.ic).toBeLessThanOrEqual(1);
    });

    it('包含排名IC', () => {
      const returns = [
        { stockCode: 'A', return: 5 },
        { stockCode: 'B', return: 3 },
        { stockCode: 'C', return: 2 },
        { stockCode: 'D', return: 1 },
        { stockCode: 'E', return: -1 },
      ];
      const result = engine.calculateIC(createFactor(), returns);
      expect(typeof result.rankIC).toBe('number');
    });

    it('t统计量计算', () => {
      const returns = [
        { stockCode: 'A', return: 5 },
        { stockCode: 'B', return: 3 },
        { stockCode: 'C', return: 2 },
        { stockCode: 'D', return: 1 },
        { stockCode: 'E', return: -1 },
      ];
      const result = engine.calculateIC(createFactor(), returns);
      expect(typeof result.tStat).toBe('number');
    });
  });

  describe('analyzeDecay', () => {
    it('计算衰减参数', () => {
      const icSeries = [0.1, 0.08, 0.06, 0.04, 0.03, 0.02];
      const result = engine.analyzeDecay('test', icSeries);
      expect(result.halfLife).toBeGreaterThan(0);
      expect(result.optimalHoldPeriod).toBeGreaterThan(0);
    });

    it('数据不足返回默认', () => {
      const result = engine.analyzeDecay('test', [0.1]);
      expect(result.halfLife).toBe(999);
    });

    it('持久性在0-1之间', () => {
      const icSeries = Array.from({ length: 10 }, () => Math.random() * 0.2 - 0.1);
      const result = engine.analyzeDecay('test', icSeries);
      expect(result.persistence).toBeGreaterThanOrEqual(0);
      expect(result.persistence).toBeLessThanOrEqual(1);
    });

    it('快速衰减→短持有期', () => {
      const fastDecay = engine.analyzeDecay('fast', [0.1, 0.01, 0.001, 0.0001]);
      const slowDecay = engine.analyzeDecay('slow', [0.1, 0.099, 0.098, 0.097]);
      expect(fastDecay.decaySpeed).toBeGreaterThan(slowDecay.decaySpeed);
    });
  });

  describe('compositeFactors', () => {
    it('合成多因子', () => {
      const factors = [
        { name: 'value', ic: 0.05, icStd: 0.02, values: [1, 2, 3] },
        { name: 'momentum', ic: 0.03, icStd: 0.01, values: [3, 2, 1] },
      ];
      const result = engine.compositeFactors(factors);
      expect(result.factors.length).toBe(2);
      expect(result.compositeIC).toBeGreaterThan(0);
    });

    it('权重和为1', () => {
      const factors = [
        { name: 'A', ic: 0.05, icStd: 0.02, values: [1, 2] },
        { name: 'B', ic: 0.03, icStd: 0.01, values: [2, 1] },
      ];
      const result = engine.compositeFactors(factors);
      const totalWeight = result.factors.reduce((s, f) => s + f.weight, 0);
      expect(totalWeight).toBeCloseTo(1);
    });

    it('空数据返回空', () => {
      const result = engine.compositeFactors([]);
      expect(result.factors).toEqual([]);
      expect(result.compositeIC).toBe(0);
    });

    it('分散化比率计算', () => {
      const factors = [
        { name: 'A', ic: 0.05, icStd: 0.02, values: [1, 2] },
        { name: 'B', ic: 0.04, icStd: 0.015, values: [2, 1] },
      ];
      const result = engine.compositeFactors(factors);
      expect(result.diversificationRatio).toBeGreaterThan(0);
    });
  });

  describe('validateFactor', () => {
    it('分组收益分析', () => {
      const factor = createFactor({
        values: Array.from({ length: 10 }, (_, i) => ({ stockCode: `${i}`, value: i }))
      });
      const returns = Array.from({ length: 10 }, (_, i) => ({ stockCode: `${i}`, return: Math.random() * 10 }));
      const result = engine.validateFactor(factor, returns);
      expect(result.groupReturns.length).toBeGreaterThanOrEqual(0);
    });

    it('多空收益计算', () => {
      const factor = createFactor({
        values: Array.from({ length: 20 }, (_, i) => ({ stockCode: `${i}`, value: i }))
      });
      const returns = Array.from({ length: 20 }, (_, i) => ({ stockCode: `${i}`, return: 20 - i }));
      const result = engine.validateFactor(factor, returns, 5);
      expect(typeof result.longShortReturn).toBe('number');
    });

    it('单调性在0-1之间', () => {
      const factor = createFactor({
        values: Array.from({ length: 10 }, (_, i) => ({ stockCode: `${i}`, value: i }))
      });
      const returns = Array.from({ length: 10 }, (_, i) => ({ stockCode: `${i}`, return: Math.random() * 10 }));
      const result = engine.validateFactor(factor, returns, 3);
      expect(result.monotonicity).toBeGreaterThanOrEqual(0);
      expect(result.monotonicity).toBeLessThanOrEqual(1);
    });

    it('包含IC分析', () => {
      const returns = [
        { stockCode: 'A', return: 5 },
        { stockCode: 'B', return: 3 },
        { stockCode: 'C', return: 2 },
        { stockCode: 'D', return: 1 },
        { stockCode: 'E', return: -1 },
      ];
      const result = engine.validateFactor(createFactor(), returns);
      expect(result.ic).toBeDefined();
    });
  });

  describe('detectCrowding', () => {
    it('检测拥挤度', () => {
      const exposure = [0.5, 0.6, 0.7, 0.8, 0.9];
      const returns = [1, 0.8, 0.6, 0.4, 0.2];
      const result = engine.detectCrowding(exposure, returns);
      expect(result.crowdingScore).toBeGreaterThanOrEqual(0);
    });

    it('空数据返回低风险', () => {
      const result = engine.detectCrowding([], []);
      expect(result.riskLevel).toBe('low');
    });

    it('风险分级', () => {
      const high = engine.detectCrowding(
        [0.1, 0.9, 0.1, 0.9, 0.1],
        [1, 0.1, 1, 0.1, 1]
      );
      expect(['low', 'medium', 'high']).toContain(high.riskLevel);
    });

    it('换手率计算', () => {
      const result = engine.detectCrowding([0.5, 0.6, 0.5], [1, 1, 1]);
      expect(result.turnover).toBeGreaterThan(0);
    });
  });
});
