import { describe, it, expect } from 'vitest';
import {
  buildVolSmile,
  buildVolTermStructure,
  garchForecast,
  detectVolRegime,
  VolSurface,
  VolatilityPoint,
} from '../utils/volSurfaceEngine2';

function makeSurface(): VolSurface {
  const strikes = [90, 95, 100, 105, 110];
  const expiries = ['2026-04-30', '2026-05-30', '2026-06-30'];
  const points: VolatilityPoint[] = [];

  expiries.forEach(exp => {
    strikes.forEach(k => {
      points.push({
        strike: k,
        expiry: exp,
        impliedVol: 0.2 + Math.abs(k - 100) * 0.003 + Math.random() * 0.02,
        delta: (100 - k) * 0.02 + (k < 100 ? -0.3 : 0.3),
        gamma: 0.02,
        vega: 0.1,
        theta: -0.05,
      });
    });
  });

  return { ticker: '600519', spot: 100, riskFreeRate: 0.025, points };
}

describe('Vol Surface Engine', () => {
  describe('buildVolSmile', () => {
    it('应构建波动率微笑', () => {
      const smile = buildVolSmile(makeSurface(), '2026-04-30');
      expect(smile.strikes.length).toBe(5);
      expect(smile.impliedVols.length).toBe(5);
    });

    it('应计算ATM波动率', () => {
      const smile = buildVolSmile(makeSurface(), '2026-04-30');
      expect(smile.atmVol).toBeGreaterThan(0);
    });

    it('应计算偏度', () => {
      const smile = buildVolSmile(makeSurface(), '2026-04-30');
      expect(typeof smile.skew).toBe('number');
    });

    it('应处理空数据', () => {
      const smile = buildVolSmile(makeSurface(), '2099-01-01');
      expect(smile.strikes.length).toBe(0);
    });
  });

  describe('buildVolTermStructure', () => {
    it('应构建期限结构', () => {
      const ts = buildVolTermStructure(makeSurface());
      expect(ts.expiries.length).toBe(3);
      expect(ts.atmVols.length).toBe(3);
    });

    it('应判断正反向', () => {
      const ts = buildVolTermStructure(makeSurface());
      expect(typeof ts.contango).toBe('boolean');
    });

    it('应计算斜率', () => {
      const ts = buildVolTermStructure(makeSurface());
      expect(typeof ts.slope).toBe('number');
    });
  });

  describe('garchForecast', () => {
    it('应预测波动率', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.04);
      const result = garchForecast(returns);
      expect(result.currentVol).toBeGreaterThan(0);
    });

    it('应计算长期波动率', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.04);
      const result = garchForecast(returns);
      expect(result.longRunVol).toBeGreaterThan(0);
    });

    it('应计算半衰期', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.04);
      const result = garchForecast(returns);
      expect(result.halfLife).toBeGreaterThan(0);
    });

    it('应计算持续性', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.04);
      const result = garchForecast(returns);
      expect(result.persistence).toBeGreaterThan(0);
      expect(result.persistence).toBeLessThan(1);
    });

    it('应处理数据不足', () => {
      const result = garchForecast([0.01, 0.02]);
      expect(result.currentVol).toBe(0);
    });
  });

  describe('detectVolRegime', () => {
    it('应判断波动率状态', () => {
      const histVols = Array.from({ length: 100 }, () => 0.15 + Math.random() * 0.1);
      const result = detectVolRegime(histVols, 0.2);
      expect(['low', 'normal', 'elevated', 'high', 'extreme']).toContain(result.regime);
    });

    it('应计算分位数', () => {
      const histVols = Array.from({ length: 100 }, () => 0.15 + Math.random() * 0.1);
      const result = detectVolRegime(histVols, 0.2);
      expect(result.percentile).toBeGreaterThanOrEqual(0);
      expect(result.percentile).toBeLessThanOrEqual(100);
    });

    it('应判断趋势', () => {
      const histVols = Array.from({ length: 100 }, () => 0.15 + Math.random() * 0.1);
      const result = detectVolRegime(histVols, 0.2);
      expect(['rising', 'falling', 'stable']).toContain(result.trend);
    });

    it('应给出交易建议', () => {
      const histVols = Array.from({ length: 100 }, () => 0.15 + Math.random() * 0.1);
      const result = detectVolRegime(histVols, 0.2);
      expect(result.tradingImplication.length).toBeGreaterThan(0);
    });
  });
});
