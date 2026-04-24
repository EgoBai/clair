import { describe, it, expect } from 'vitest';
import { FactorExposureEngine, type FactorExposure, type FactorReturns } from '../utils/factorExposureEngine';

describe('FactorExposureEngine', () => {
  const engine = new FactorExposureEngine();

  const exposure: FactorExposure = {
    market: 1.0,
    size: 0.3,
    value: 0.5,
    momentum: 0.2,
    quality: 0.4,
    volatility: -0.1,
  };

  const factorReturns: FactorReturns = {
    market: 0.05,
    size: 0.02,
    value: 0.03,
    momentum: 0.01,
    quality: 0.02,
    volatility: -0.01,
  };

  describe('因子收益归因', () => {
    it('应计算总收益', () => {
      const result = engine.attributeReturns(exposure, factorReturns, 0.01);
      expect(result.totalReturn).toBeGreaterThan(0);
    });

    it('因子收益+特质收益=总收益', () => {
      const result = engine.attributeReturns(exposure, factorReturns, 0.01);
      expect(result.factorReturn + result.specificReturn).toBeCloseTo(result.totalReturn, 4);
    });

    it('应包含各因子贡献', () => {
      const result = engine.attributeReturns(exposure, factorReturns, 0);
      expect(result.contributions.market).toBeDefined();
      expect(result.contributions.size).toBeDefined();
      expect(result.contributions.value).toBeDefined();
    });

    it('R²应在0-1之间', () => {
      const result = engine.attributeReturns(exposure, factorReturns, 0.01);
      expect(result.rSquared).toBeGreaterThanOrEqual(0);
      expect(result.rSquared).toBeLessThanOrEqual(1);
    });

    it('零暴露应有零因子收益', () => {
      const zero: FactorExposure = { market: 0, size: 0, value: 0, momentum: 0, quality: 0, volatility: 0 };
      const result = engine.attributeReturns(zero, factorReturns, 0.02);
      expect(result.factorReturn).toBe(0);
      expect(result.totalReturn).toBeCloseTo(0.02, 4);
    });
  });

  describe('因子暴露估计', () => {
    it('应估计因子暴露', () => {
      const stockReturns = [0.05, 0.03, -0.02, 0.04, 0.01];
      const factorMatrix: FactorReturns[] = [
        { market: 0.04, size: 0.01, value: 0.02, momentum: 0.01, quality: 0.01, volatility: -0.01 },
        { market: 0.03, size: 0.02, value: 0.01, momentum: 0.02, quality: 0.01, volatility: 0 },
        { market: -0.02, size: -0.01, value: 0, momentum: -0.01, quality: 0, volatility: 0.02 },
        { market: 0.04, size: 0.01, value: 0.02, momentum: 0.01, quality: 0.02, volatility: -0.01 },
        { market: 0.01, size: 0, value: 0.01, momentum: 0, quality: 0.01, volatility: 0 },
      ];

      const est = engine.estimateExposure(stockReturns, factorMatrix);
      expect(typeof est.market).toBe('number');
      expect(typeof est.size).toBe('number');
    });

    it('不足数据应返回默认暴露', () => {
      const est = engine.estimateExposure([0.01], [{ ...factorReturns }]);
      expect(est.market).toBe(1);
      expect(est.size).toBe(0);
    });

    it('空数据应返回默认暴露', () => {
      const est = engine.estimateExposure([], []);
      expect(est.market).toBe(1);
    });
  });

  describe('风格分析', () => {
    it('应识别大盘价值风格', () => {
      const style = engine.analyzeStyle({ market: 1, size: -0.5, value: 0.6, momentum: 0, quality: 0.3, volatility: 0 });
      expect(style.style).toBe('large_value');
    });

    it('应识别小盘成长风格', () => {
      const style = engine.analyzeStyle({ market: 1, size: 0.6, value: -0.5, momentum: 0, quality: 0, volatility: 0 });
      expect(style.style).toBe('small_growth');
    });

    it('应识别混合风格', () => {
      const style = engine.analyzeStyle({ market: 1, size: 0.1, value: 0.1, momentum: 0, quality: 0, volatility: 0 });
      expect(style.style).toBe('blend');
    });

    it('倾斜强度应在0-100之间', () => {
      const style = engine.analyzeStyle(exposure);
      expect(style.tiltStrength).toBeGreaterThanOrEqual(0);
      expect(style.tiltStrength).toBeLessThanOrEqual(100);
    });

    it('因子纯度之和应为1', () => {
      const style = engine.analyzeStyle(exposure);
      const sum = Object.values(style.factorPurities).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 1);
    });

    it('分散化评分应在0-100之间', () => {
      const style = engine.analyzeStyle(exposure);
      expect(style.diversificationScore).toBeGreaterThanOrEqual(0);
      expect(style.diversificationScore).toBeLessThanOrEqual(100);
    });
  });

  describe('因子拥挤度', () => {
    it('应评估拥挤度', () => {
      const exposures = Array.from({ length: 20 }, () => ({
        market: Math.random() * 2 - 1,
        size: Math.random() * 2 - 1,
        value: Math.random() * 2 - 1,
        momentum: Math.random() * 2 - 1,
        quality: Math.random() * 2 - 1,
        volatility: Math.random() * 2 - 1,
      }));

      const crowding = engine.assessCrowding(exposures);
      expect(crowding.market.crowding).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(crowding.market.crowding);
    });

    it('同质化暴露应显示高拥挤', () => {
      const similar: FactorExposure = { market: 1.2, size: 0.5, value: 0.5, momentum: 0.5, quality: 0.5, volatility: 0.5 };
      const exposures = Array.from({ length: 10 }, () => ({ ...similar }));
      const crowding = engine.assessCrowding(exposures);
      expect(crowding.market.crowding).toBe('high');
    });

    it('分散暴露应显示低拥挤', () => {
      const exposures = Array.from({ length: 10 }, (_, i) => ({
        market: (i - 5) * 0.1,
        size: (i - 5) * 0.05,
        value: (i - 5) * 0.05,
        momentum: (i - 5) * 0.05,
        quality: (i - 5) * 0.05,
        volatility: (i - 5) * 0.05,
      }));
      const crowding = engine.assessCrowding(exposures);
      expect(crowding.market.crowding).toBe('low');
    });
  });

  describe('组合因子暴露', () => {
    it('应计算加权暴露', () => {
      const holdings = [
        { weight: 0.6, exposure: { market: 1, size: 0.5, value: 0.3, momentum: 0, quality: 0, volatility: 0 } },
        { weight: 0.4, exposure: { market: 1, size: -0.3, value: -0.2, momentum: 0.1, quality: 0.2, volatility: 0 } },
      ];
      const portfolio = engine.portfolioExposure(holdings);
      expect(portfolio.market).toBeCloseTo(1, 1);
      expect(portfolio.size).toBeCloseTo(0.18, 1); // 0.6*0.5 + 0.4*(-0.3)
    });

    it('空组合应返回零暴露', () => {
      const portfolio = engine.portfolioExposure([]);
      expect(portfolio.market).toBe(0);
      expect(portfolio.size).toBe(0);
    });

    it('单一持仓应等于该持仓暴露', () => {
      const portfolio = engine.portfolioExposure([{ weight: 1, exposure }]);
      expect(portfolio.market).toBeCloseTo(exposure.market, 3);
      expect(portfolio.size).toBeCloseTo(exposure.size, 3);
    });
  });

  describe('边界情况', () => {
    it('极端因子收益不应报错', () => {
      const extreme: FactorReturns = { market: 10, size: -10, value: 5, momentum: -5, quality: 3, volatility: -3 };
      expect(() => engine.attributeReturns(exposure, extreme, 0)).not.toThrow();
    });

    it('零方差因子应返回零暴露', () => {
      const constFactors: FactorReturns[] = Array.from({ length: 5 }, () => ({ ...factorReturns }));
      const est = engine.estimateExposure([0.01, 0.02, 0.01, 0.02, 0.01], constFactors);
      // constant factor has zero variance → beta = 0
      expect(est.market).toBe(0);
    });
  });
});
