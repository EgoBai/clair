import { describe, it, expect } from 'vitest';
import { computeSmartBeta } from '../utils/smartBetaEngine';

describe('智能Beta因子引擎', () => {
  const makeData = (n: number) => Array.from({ length: n }, (_, i) => ({
    stockCode: `STOCK${i.toString().padStart(3, '0')}`,
    bp: 0.1 + Math.random() * 0.5,
    ep: 0.02 + Math.random() * 0.1,
    ret12m1m: -0.3 + Math.random() * 0.8,
    roe: 0.05 + Math.random() * 0.25,
    grossMargin: 0.2 + Math.random() * 0.5,
    volatility: 0.1 + Math.random() * 0.4,
    marketCap: 1e9 + Math.random() * 1e11,
    nextReturn: -0.1 + Math.random() * 0.3,
  }));

  const data = makeData(50);

  it('应该计算综合得分', () => {
    const result = computeSmartBeta(data);
    expect(result.compositeScore.length).toBe(50);
    expect(result.compositeScore[0].composite).toBeGreaterThanOrEqual(
      result.compositeScore[result.compositeScore.length - 1].composite
    );
  });

  it('应该计算因子IC', () => {
    const result = computeSmartBeta(data);
    expect(result.factors.length).toBe(5);
    for (const f of result.factors) {
      expect(typeof f.ic).toBe('number');
      expect(Math.abs(f.ic)).toBeLessThanOrEqual(1);
    }
  });

  it('应该返回TOP和BOTTOM股票', () => {
    const result = computeSmartBeta(data);
    expect(result.topStocks.length).toBeLessThanOrEqual(10);
    expect(result.bottomStocks.length).toBeLessThanOrEqual(10);
  });

  it('应该支持自定义权重', () => {
    const result = computeSmartBeta(data, { value: 0.5, momentum: 0.2, quality: 0.1, lowVol: 0.1, size: 0.1 });
    expect(result.factorWeights.value).toBe(0.5);
  });

  it('应该计算拥挤度', () => {
    const result = computeSmartBeta(data);
    for (const key of Object.keys(result.crowding)) {
      expect(result.crowding[key]).toBeGreaterThanOrEqual(0);
      expect(result.crowding[key]).toBeLessThanOrEqual(1);
    }
  });

  it('应该判断是否需要再平衡', () => {
    const result = computeSmartBeta(data);
    expect(typeof result.rebalanceSignal).toBe('boolean');
  });

  it('应该计算预期Alpha', () => {
    const result = computeSmartBeta(data);
    expect(result.expectedAlpha).toBeGreaterThanOrEqual(0);
  });

  it('空数据应抛出错误', () => {
    expect(() => computeSmartBeta([])).toThrow();
  });

  it('应该计算多空收益', () => {
    const result = computeSmartBeta(data);
    for (const f of result.factors) {
      expect(typeof f.longShortReturn).toBe('number');
    }
  });

  it('因子名称应该正确', () => {
    const result = computeSmartBeta(data);
    const names = result.factors.map(f => f.factor);
    expect(names).toContain('value');
    expect(names).toContain('momentum');
    expect(names).toContain('quality');
    expect(names).toContain('lowVol');
    expect(names).toContain('size');
  });
});
