import { describe, it, expect } from 'vitest';
import { PairsTradingEngine } from '../utils/pairsTradingEngine';

describe('Pairs Trading Engine', () => {
  const engine = new PairsTradingEngine(2.0, 0.5, 3.5);

  const makeCointegratedPair = (n = 200) => {
    const s1: number[] = [100];
    const s2: number[] = [50];
    for (let i = 1; i < n; i++) {
      const shock = (Math.random() - 0.5) * 2;
      s1.push(s1[i - 1] + 0.05 * (100 - s1[i - 1]) + shock);
      s2.push(s2[i - 1] + 0.05 * (50 - s2[i - 1]) + shock * 0.5);
    }
    return { s1, s2 };
  };

  const makeRandomPair = (n = 200) => {
    const s1: number[] = [100];
    const s2: number[] = [50];
    for (let i = 1; i < n; i++) {
      s1.push(s1[i - 1] + (Math.random() - 0.5) * 3);
      s2.push(s2[i - 1] + (Math.random() - 0.5) * 2);
    }
    return { s1, s2 };
  };

  describe('testCointegration', () => {
    it('应检测协整关系', () => {
      const { s1, s2 } = makeCointegratedPair(200);
      const result = engine.testCointegration(s1, s2);
      expect(result.hedgeRatio).toBeDefined();
      expect(result.adfStatistic).toBeDefined();
    });

    it('应返回对冲比率', () => {
      const { s1, s2 } = makeCointegratedPair(200);
      const result = engine.testCointegration(s1, s2);
      expect(typeof result.hedgeRatio).toBe('number');
      expect(isFinite(result.hedgeRatio)).toBe(true);
    });

    it('数据不足时应返回安全值', () => {
      const result = engine.testCointegration([1, 2, 3], [1, 2, 3]);
      expect(result.isCointegrated).toBe(false);
      expect(result.pValue).toBe(1);
    });
  });

  describe('analyzeSpread', () => {
    it('应计算价差统计', () => {
      const { s1, s2 } = makeCointegratedPair(200);
      const result = engine.analyzeSpread(s1, s2);
      expect(result.mean).toBeDefined();
      expect(result.std).toBeGreaterThanOrEqual(0);
      expect(typeof result.currentZScore).toBe('number');
    });

    it('均值回归强度应在0-1之间', () => {
      const { s1, s2 } = makeCointegratedPair(200);
      const result = engine.analyzeSpread(s1, s2);
      expect(result.meanReversionStrength).toBeGreaterThanOrEqual(0);
      expect(result.meanReversionStrength).toBeLessThanOrEqual(1);
    });

    it('Z-Score应在合理范围内', () => {
      const { s1, s2 } = makeCointegratedPair(200);
      const result = engine.analyzeSpread(s1, s2);
      expect(Math.abs(result.currentZScore)).toBeLessThan(10);
    });
  });

  describe('generateSignal', () => {
    it('应生成交易信号', () => {
      const { s1, s2 } = makeCointegratedPair(200);
      const spread = engine.analyzeSpread(s1, s2);
      const signal = engine.generateSignal(spread);
      expect(['long_spread', 'short_spread', 'close', 'hold']).toContain(signal.action);
    });

    it('置信度应在0-1之间', () => {
      const { s1, s2 } = makeCointegratedPair(200);
      const spread = engine.analyzeSpread(s1, s2);
      const signal = engine.generateSignal(spread);
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('scorePair', () => {
    it('应评分配对', () => {
      const { s1, s2 } = makeCointegratedPair(200);
      const score = engine.scorePair(s1, s2, 1e6, 1e6);
      expect(['excellent', 'good', 'fair', 'poor']).toContain(score.rating);
      expect(score.totalScore).toBeGreaterThanOrEqual(0);
      expect(score.totalScore).toBeLessThanOrEqual(100);
    });
  });

  describe('backtestPairs', () => {
    it('应回测配对策略', () => {
      const { s1, s2 } = makeCointegratedPair(200);
      const result = engine.backtestPairs(s1, s2);
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
      expect(typeof result.winRate).toBe('number');
    });

    it('胜率应在0-1之间', () => {
      const { s1, s2 } = makeCointegratedPair(300);
      const result = engine.backtestPairs(s1, s2);
      if (result.totalTrades > 0) {
        expect(result.winRate).toBeGreaterThanOrEqual(0);
        expect(result.winRate).toBeLessThanOrEqual(1);
      }
    });
  });
});
