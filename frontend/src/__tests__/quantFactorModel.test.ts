import { describe, it, expect } from 'vitest';
import {
  estimateFactorModel,
  analyzeFactorMomentum,
  calculateFactorCorrelation,
  FactorData,
} from '../utils/quantFactorModel';

function makeFactorData(n = 50): FactorData[] {
  return Array.from({ length: n }, () => ({
    ticker: 'TEST',
    factors: {
      value: Math.random() * 2 - 1,
      momentum: Math.random() * 2 - 1,
      size: Math.random() * 2 - 1,
      quality: Math.random() * 2 - 1,
    },
    returns: (Math.random() - 0.4) * 10,
  }));
}

describe('Quant Factor Model', () => {
  describe('estimateFactorModel', () => {
    it('应估计因子暴露', () => {
      const data = makeFactorData(100);
      const result = estimateFactorModel(data, ['value', 'momentum', 'size', 'quality']);
      expect(result.exposures.length).toBe(4);
    });

    it('应计算R方', () => {
      const data = makeFactorData(100);
      const result = estimateFactorModel(data, ['value', 'momentum']);
      expect(result.rSquared).toBeGreaterThanOrEqual(0);
      expect(result.rSquared).toBeLessThanOrEqual(1);
    });

    it('应计算Alpha', () => {
      const data = makeFactorData(100);
      const result = estimateFactorModel(data, ['value', 'momentum']);
      expect(typeof result.alpha).toBe('number');
    });

    it('应标记显著因子', () => {
      const data = makeFactorData(100);
      const result = estimateFactorModel(data, ['value', 'momentum']);
      result.exposures.forEach(e => {
        expect(typeof e.significant).toBe('boolean');
        expect(e.pValue).toBeGreaterThanOrEqual(0);
        expect(e.pValue).toBeLessThanOrEqual(1);
      });
    });

    it('应处理数据不足', () => {
      const result = estimateFactorModel(makeFactorData(2), ['value', 'momentum', 'size']);
      expect(result.rSquared).toBe(0);
    });
  });

  describe('analyzeFactorMomentum', () => {
    it('应计算各期动量', () => {
      const returns = Array.from({ length: 12 }, () => (Math.random() - 0.5) * 3);
      const result = analyzeFactorMomentum('value', returns);
      expect(typeof result.momentum1m).toBe('number');
      expect(typeof result.momentum3m).toBe('number');
      expect(typeof result.momentum6m).toBe('number');
      expect(typeof result.momentum12m).toBe('number');
    });

    it('应判断趋势', () => {
      const result = analyzeFactorMomentum('value', [1, 2, 3, 4, 5, 6]);
      expect(['accelerating', 'decelerating', 'reversing', 'stable']).toContain(result.trend);
    });

    it('应给出信号', () => {
      const result = analyzeFactorMomentum('value', [1, 2, 3, 4, 5, 6]);
      expect(['long', 'short', 'neutral']).toContain(result.signal);
    });
  });

  describe('calculateFactorCorrelation', () => {
    it('应计算相关性矩阵', () => {
      const factorReturns = {
        value: Array.from({ length: 20 }, () => Math.random()),
        momentum: Array.from({ length: 20 }, () => Math.random()),
        size: Array.from({ length: 20 }, () => Math.random()),
      };
      const result = calculateFactorCorrelation(factorReturns);
      expect(result.matrix.length).toBe(3);
      expect(result.matrix[0][0]).toBe(1);
    });

    it('应判断市场状态', () => {
      const factorReturns = {
        value: Array.from({ length: 20 }, () => Math.random()),
        momentum: Array.from({ length: 20 }, () => Math.random()),
      };
      const result = calculateFactorCorrelation(factorReturns);
      expect(['normal', 'crisis', 'rotation']).toContain(result.regime);
    });

    it('应计算分散化得分', () => {
      const factorReturns = {
        value: Array.from({ length: 20 }, () => Math.random()),
        momentum: Array.from({ length: 20 }, () => Math.random()),
      };
      const result = calculateFactorCorrelation(factorReturns);
      expect(result.diversificationScore).toBeGreaterThanOrEqual(0);
      expect(result.diversificationScore).toBeLessThanOrEqual(100);
    });
  });
});
