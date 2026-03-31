import { describe, it, expect } from 'vitest';
import { FactorExposureEngine } from '../utils/factorExposureEngine';

describe('Factor Exposure Engine', () => {
  const engine = new FactorExposureEngine();

  const makeFactorReturns = (n = 100) => {
    const factors: Record<string, number[]> = {};
    for (const name of ['market', 'value', 'growth', 'size', 'momentum', 'quality']) {
      factors[name] = Array.from({ length: n }, () => (Math.random() - 0.5) * 0.02);
    }
    return factors;
  };

  describe('calcFactorExposures', () => {
    it('应计算因子暴露', () => {
      const factors = makeFactorReturns(100);
      const stockReturns = factors.market.map(r => r * 1.2 + 0.001 + (Math.random() - 0.5) * 0.01);
      const exposures = engine.calcFactorExposures(stockReturns, factors);
      expect(exposures.length).toBe(6);
    });

    it('应返回Beta值', () => {
      const factors = makeFactorReturns(100);
      const stockReturns = factors.market.map(r => r * 1.2);
      const exposures = engine.calcFactorExposures(stockReturns, factors);
      const marketExp = exposures.find(e => e.factor === 'market');
      expect(marketExp?.beta).toBeGreaterThan(0);
    });

    it('应判断显著性', () => {
      const factors = makeFactorReturns(100);
      const stockReturns = factors.market.map(r => r * 2 + (Math.random() - 0.5) * 0.001);
      const exposures = engine.calcFactorExposures(stockReturns, factors);
      for (const exp of exposures) {
        expect(['high', 'medium', 'low', 'none']).toContain(exp.significance);
      }
    });

    it('数据不足时应返回空数组', () => {
      const factors = makeFactorReturns(5);
      const exposures = engine.calcFactorExposures([1, 2, 3], factors);
      expect(exposures).toEqual([]);
    });
  });

  describe('calcStyleAttribution', () => {
    it('应识别主导风格', () => {
      const factors = makeFactorReturns(100);
      const stockReturns = factors.value.map(r => r * 2 + (Math.random() - 0.5) * 0.01);
      const style = engine.calcStyleAttribution(stockReturns, factors);
      expect(typeof style.dominantStyle).toBe('string');
      expect(style.stylePurity).toBeGreaterThanOrEqual(0);
      expect(style.stylePurity).toBeLessThanOrEqual(1);
    });
  });

  describe('decomposeAlpha', () => {
    it('应分解Alpha和Beta', () => {
      const marketReturns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02);
      const stockReturns = marketReturns.map(r => r * 1.5 + 0.0005 + (Math.random() - 0.5) * 0.005);
      const alpha = engine.decomposeAlpha(stockReturns, marketReturns);
      expect(alpha.beta).toBeGreaterThan(0);
      expect(alpha.rSquared).toBeGreaterThan(0);
      expect(alpha.rSquared).toBeLessThanOrEqual(1);
    });

    it('R平方应在0-1之间', () => {
      const marketReturns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02);
      const stockReturns = marketReturns.map(r => r * 1.5 + (Math.random() - 0.5) * 0.01);
      const alpha = engine.decomposeAlpha(stockReturns, marketReturns);
      expect(alpha.rSquared).toBeGreaterThanOrEqual(0);
      expect(alpha.rSquared).toBeLessThanOrEqual(1);
    });

    it('跟踪误差应为正', () => {
      const marketReturns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02);
      const stockReturns = marketReturns.map(r => r * 1.5 + (Math.random() - 0.5) * 0.01);
      const alpha = engine.decomposeAlpha(stockReturns, marketReturns);
      expect(alpha.trackingError).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calcFactorContributions', () => {
    it('应计算因子贡献', () => {
      const factors = makeFactorReturns(100);
      const stockReturns = factors.market.map(r => r * 1.2 + (Math.random() - 0.5) * 0.01);
      const exposures = engine.calcFactorExposures(stockReturns, factors);
      const contributions = engine.calcFactorContributions(exposures, factors);
      expect(contributions.length).toBeGreaterThan(0);
    });
  });

  describe('generateReport', () => {
    it('应生成完整报告', () => {
      const factors = makeFactorReturns(100);
      const stockReturns = factors.market.map(r => r * 1.2 + 0.0005 + (Math.random() - 0.5) * 0.01);
      const report = engine.generateReport(stockReturns, factors, factors.market);
      expect(report.exposures.length).toBe(6);
      expect(report.style).toBeDefined();
      expect(report.alpha).toBeDefined();
      expect(report.totalExplained).toBeGreaterThanOrEqual(0);
    });
  });
});
