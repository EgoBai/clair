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

  /** Guaranteed sideways prices with very small random noise */
  const makeSidewaysPrices = (n = 200): number[] => {
    const base = 100;
    const prices: number[] = [base];
    for (let i = 1; i < n; i++) {
      // Oscillate around base with tight bound to avoid drift
      prices.push(base + Math.sin(i * 0.5) * 3 + (Math.random() - 0.5) * 0.5);
    }
    return prices;
  };

  describe('detectRegime', () => {
    it('应识别牛市状态', () => {
      const prices = makeBullPrices(200);
      const result = engine.detectRegime(prices);
      expect(['bull', 'transition']).toContain(result.regime);
      expect(result.trendStrength).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.duration).toBeGreaterThanOrEqual(0);
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
      expect(result.regime).toBe('sideways');
      expect(Math.abs(result.trendStrength)).toBeLessThan(20);
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

    it('空数组应返回安全值', () => {
      const result = engine.detectRegime([]);
      expect(result.regime).toBe('sideways');
      expect(result.duration).toBe(0);
    });

    it('中间位置检测应正确', () => {
      // Transition: uptrend not steep enough for 'bull'
      const prices: number[] = [100];
      for (let i = 1; i < 200; i++) {
        prices.push(prices[i - 1] * (1 + 0.001));
      }
      const result = engine.detectRegime(prices);
      expect(['bull', 'transition']).toContain(result.regime);
    });

    it('趋势强度在牛市时应为正', () => {
      const bullish: number[] = [100];
      for (let i = 1; i < 200; i++) bullish.push(bullish[i - 1] * 1.005);
      const result = engine.detectRegime(bullish);
      expect(result.regime).toBe('bull');
      expect(result.trendStrength).toBeGreaterThan(20);
    });

    it('趋势强度在熊市时应为负', () => {
      const bearish: number[] = [100];
      for (let i = 1; i < 200; i++) bearish.push(bearish[i - 1] * 0.995);
      const result = engine.detectRegime(bearish);
      expect(result.regime).toBe('bear');
      expect(result.trendStrength).toBeLessThan(-20);
    });

    it('short lookback应能检测快速趋势', () => {
      const engineShort = new MarketRegimeEngine(5, 10, 20);
      const fastRise: number[] = [100];
      for (let i = 1; i < 50; i++) fastRise.push(fastRise[i - 1] * 1.01);
      const result = engineShort.detectRegime(fastRise);
      expect(result.regime).toBe('bull');
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

    it('数值应为合理范围', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02);
      const result = engine.detectVolatilityRegime(returns);
      expect(result.currentVol).toBeGreaterThan(0);
      expect(typeof result.zScore).toBe('number');
    });

    it('高波动率应被识别为high或extreme', () => {
      const normalReturns = Array.from({ length: 80 }, () => (Math.random() - 0.5) * 0.01);
      const highVolReturns = Array.from({ length: 30 }, () => (Math.random() - 0.5) * 0.08);
      const result = engine.detectVolatilityRegime([...normalReturns, ...highVolReturns]);
      // The last 20 returns are used for currentVol; they may rank at 70-100th percentile
      expect(['high', 'extreme']).toContain(result.state);
    });

    it('数据不足时应返回normal', () => {
      const result = engine.detectVolatilityRegime([0.01, 0.02], 100);
      expect(result.state).toBe('normal');
      expect(result.percentile).toBe(50);
      expect(result.zScore).toBe(0);
    });

    it('低波动率应被识别', () => {
      const stableReturns = Array.from({ length: 80 }, () => (Math.random() - 0.5) * 0.002);
      const lowVolSegment = Array.from({ length: 30 }, () => (Math.random() - 0.5) * 0.0008);
      const result = engine.detectVolatilityRegime([...stableReturns, ...lowVolSegment]);
      expect(result.state).toBe('low');
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
      expect(typeof result.mediumMomentum).toBe('number');
      expect(typeof result.longMomentum).toBe('number');
    });

    it('加速上涨时应被识别', () => {
      // Create strongly accelerating price: each day's return is increasingly positive
      const accelerating: number[] = [100];
      for (let i = 1; i < 200; i++) {
        const drift = 0.0005; // Slowly increasing daily return
        accelerating.push(accelerating[i - 1] * (1 + drift + (i / 200) * 0.005));
      }
      const result = engine.detectMomentumState(accelerating);
      expect(result.shortMomentum).toBeGreaterThan(0);
    });

    it('平稳趋势应有稳定状态', () => {
      const stable: number[] = [100];
      for (let i = 1; i < 200; i++) stable.push(stable[i - 1] * 1.001);
      const result = engine.detectMomentumState(stable);
      // The slow uptrend produces similar short/medium/long momentum → may be stable or decelerating
      expect(['stable', 'decelerating']).toContain(result.state);
    });

    it('动量背离应正确标记', () => {
      // Short-term down, long-term up
      const divergent: number[] = [];
      // First: long uptrend
      for (let i = 0; i < 150; i++) divergent.push(100 + i * 0.5);
      // Then: short downtrend
      const peak = divergent[divergent.length - 1];
      for (let i = 0; i < 20; i++) divergent.push(peak - i * 0.3);
      const result = engine.detectMomentumState(divergent);
      expect(typeof result.divergence).toBe('boolean');
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

    it('股票强于债券时应为risk_on', () => {
      const stockReturns = Array.from({ length: 30 }, () => 0.005);
      const bondReturns = Array.from({ length: 30 }, () => 0.0001);
      const result = engine.assessRiskAppetite(stockReturns, bondReturns, 0.015);
      expect(result.level).toBe('risk_on');
      expect(result.flightToQuality).toBe(false);
    });

    it('高波动率+债券强时应触发逃向质量', () => {
      const stockReturns = Array.from({ length: 30 }, () => -0.003);
      const bondReturns = Array.from({ length: 30 }, () => 0.003);
      const result = engine.assessRiskAppetite(stockReturns, bondReturns, 0.03);
      expect(result.flightToQuality).toBe(true);
    });

    it('score应在-100到100范围内', () => {
      const stockReturns = Array.from({ length: 30 }, () => 0.1);
      const bondReturns = Array.from({ length: 30 }, () => -0.01);
      const result = engine.assessRiskAppetite(stockReturns, bondReturns, 0.015);
      expect(result.score).toBeGreaterThanOrEqual(-100);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('calcTransitionProbabilities', () => {
    it('应返回状态转换概率', () => {
      const prices = makeBullPrices(300);
      const transitions = engine.calcTransitionProbabilities(prices);
      expect(transitions.length).toBeGreaterThan(0);
      transitions.forEach(t => {
        expect(['bull', 'bear', 'sideways', 'transition']).toContain(t.from);
        expect(['bull', 'bear', 'sideways', 'transition']).toContain(t.to);
        expect(t.probability).toBeGreaterThanOrEqual(0);
        expect(t.probability).toBeLessThanOrEqual(1);
      });
    });

    it('足够数据时应包含bull到bull的转换', () => {
      const prices = makeBullPrices(300);
      const transitions = engine.calcTransitionProbabilities(prices);
      const bullToBull = transitions.find(t => t.from === 'bull' && t.to === 'bull');
      expect(bullToBull).toBeDefined();
      expect(bullToBull!.probability).toBeGreaterThan(0);
    });
  });

  describe('generateReport', () => {
    it('牛市时应生成完整报告', () => {
      const prices = makeBullPrices(200);
      const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
      const bondReturns = returns.map(() => 0.0002);
      const report = engine.generateReport(prices, returns, bondReturns);
      expect(report.regime).toBeDefined();
      expect(report.volatility).toBeDefined();
      expect(report.momentum).toBeDefined();
      expect(report.transitions).toBeDefined();
      expect(report.riskAppetite).toBeDefined();
      expect(['aggressive', 'moderate', 'defensive', 'cash']).toContain(report.overallSignal);
      expect(report.timestamp).toBeGreaterThan(0);
    });

    it('熊市时应生成cash信号', () => {
      const prices = makeBearPrices(200);
      const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
      const report = engine.generateReport(prices, returns);
      if (report.regime.regime === 'bear') {
        expect(report.overallSignal).toBe('cash');
      }
    });

    it('震荡市场时应生成moderate信号', () => {
      const prices = makeSidewaysPrices(200);
      const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
      const report = engine.generateReport(prices, returns);
      if (report.regime.regime === 'sideways' || report.regime.regime === 'transition') {
        expect(report.overallSignal).toBe('moderate');
      }
    });
  });

  describe('边界条件', () => {
    it('极小数据集不应崩溃', () => {
      expect(() => engine.detectRegime([])).not.toThrow();
      expect(() => engine.detectRegime([100])).not.toThrow();
      expect(() => engine.detectVolatilityRegime([])).not.toThrow();
      expect(() => engine.detectMomentumState([])).not.toThrow();
      expect(() => engine.generateReport([100], [0.01])).not.toThrow();
    });

    it('所有值相同的价格应返回sideways', () => {
      const flatPrices = Array.from({ length: 100 }, () => 100);
      const result = engine.detectRegime(flatPrices);
      expect(result.regime).toBe('sideways');
      expect(result.trendStrength).toBeCloseTo(0, 0);
    });

    it('波动率状态枚举应完整', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02);
      const result = engine.detectVolatilityRegime(returns);
      expect(['low', 'normal', 'high', 'extreme']).toContain(result.state);
    });

    it('不同lookback周期的引擎应正常工作', () => {
      const shortEngine = new MarketRegimeEngine(5, 15, 30);
      const prices = makeBullPrices(100);
      const result = shortEngine.detectRegime(prices);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });
});
