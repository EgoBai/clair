import { describe, it, expect } from 'vitest';
import { MarketRegimeEngine } from '../utils/marketRegimeEngine';

describe('Market Regime Engine', () => {
  const engine = new MarketRegimeEngine(10, 30, 60);

  const makeBullPrices = (n = 200): number[] => {
    const prices: number[] = [100];
    for (let i = 1; i < n; i++) {
      prices.push(prices[i - 1] * (1 + 0.002 + Math.random() * 0.003));
    }
    return prices;
  };

  const makeBearPrices = (n = 200): number[] => {
    const prices: number[] = [100];
    for (let i = 1; i < n; i++) {
      prices.push(prices[i - 1] * (1 - 0.002 - Math.random() * 0.003));
    }
    return prices;
  };

  const makeSidewaysPrices = (n = 200): number[] => {
    const prices: number[] = [100];
    for (let i = 1; i < n; i++) {
      prices.push(prices[i - 1] + (Math.random() - 0.5) * 1);
    }
    return prices;
  };

  describe('detectRegime', () => {
    it('应识别牛市状态', () => {
      const prices = makeBullPrices(200);
      const result = engine.detectRegime(prices);
      expect(['bull', 'transition']).toContain(result.regime);
      expect(result.trendStrength).toBeGreaterThan(0);
    });

    it('应识别熊市状态', () => {
      const prices = makeBearPrices(200);
      const result = engine.detectRegime(prices);
      expect(['bear', 'transition']).toContain(result.regime);
      expect(result.trendStrength).toBeLessThan(0);
    });

    it('应识别震荡状态', () => {
      const prices = makeSidewaysPrices(200);
      const result = engine.detectRegime(prices);
      expect(['sideways', 'transition']).toContain(result.regime);
    });

    it('置信度应在0-1之间', () => {
      const prices = makeBullPrices(200);
      const result = engine.detectRegime(prices);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('数据不足时应返回安全值', () => {
      const result = engine.detectRegime([100, 101, 102]);
      expect(result.regime).toBe('sideways');
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('detectVolatilityRegime', () => {
    it('应检测波动率状态', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02);
      const result = engine.detectVolatilityRegime(returns);
      expect(['low', 'normal', 'high', 'extreme']).toContain(result.state);
    });

    it('百分位应在0-100之间', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02);
      const result = engine.detectVolatilityRegime(returns);
      expect(result.percentile).toBeGreaterThanOrEqual(0);
      expect(result.percentile).toBeLessThanOrEqual(100);
    });
  });

  describe('detectMomentumState', () => {
    it('应检测动量状态', () => {
      const prices = makeBullPrices(200);
      const result = engine.detectMomentumState(prices);
      expect(['accelerating', 'decelerating', 'reversal', 'stable']).toContain(result.state);
    });

    it('短期动量应有值', () => {
      const prices = makeBullPrices(200);
      const result = engine.detectMomentumState(prices);
      expect(typeof result.shortMomentum).toBe('number');
    });
  });

  describe('assessRiskAppetite', () => {
    it('应评估风险偏好', () => {
      const stockReturns = Array.from({ length: 60 }, () => 0.001);
      const bondReturns = Array.from({ length: 60 }, () => 0.0002);
      const result = engine.assessRiskAppetite(stockReturns, bondReturns, 0.015);
      expect(['risk_on', 'risk_off', 'neutral']).toContain(result.level);
      expect(result.score).toBeGreaterThanOrEqual(-100);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('generateReport', () => {
    it('应生成完整报告', () => {
      const prices = makeBullPrices(200);
      const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
      const report = engine.generateReport(prices, returns);
      expect(report.regime).toBeDefined();
      expect(report.volatility).toBeDefined();
      expect(report.momentum).toBeDefined();
      expect(report.riskAppetite).toBeDefined();
      expect(['aggressive', 'moderate', 'defensive', 'cash']).toContain(report.overallSignal);
    });
  });
});
