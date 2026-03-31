import { describe, it, expect } from 'vitest';
import { ShortSqueezeEngine } from '../utils/shortSqueezeEngine';

describe('Short Squeeze Engine', () => {
  const engine = new ShortSqueezeEngine();

  const highShortData = {
    shortShares: 5e7,
    totalShares: 1e8,
    avgDailyVolume: 2e6,
    borrowRate: 0.6,
    daysToCover: 25,
    shortRatio: 0.5,
  };

  const lowShortData = {
    shortShares: 1e6,
    totalShares: 1e8,
    avgDailyVolume: 5e6,
    borrowRate: 0.05,
    daysToCover: 0.2,
    shortRatio: 0.01,
  };

  describe('calcShortMetrics', () => {
    it('应计算做空指标', () => {
      const result = engine.calcShortMetrics(highShortData);
      expect(result.daysToCover).toBeGreaterThan(0);
      expect(result.shortRatio).toBeGreaterThan(0);
      expect(['high', 'medium', 'low']).toContain(result.borrowCostLevel);
    });

    it('高借贷成本应标记', () => {
      const result = engine.calcShortMetrics(highShortData);
      expect(result.borrowCostLevel).toBe('high');
    });

    it('低借贷成本应标记', () => {
      const result = engine.calcShortMetrics(lowShortData);
      expect(result.borrowCostLevel).toBe('low');
    });
  });

  describe('estimateSqueezeProbability', () => {
    it('高做空应有高概率', () => {
      const returns = Array.from({ length: 10 }, () => 0.01);
      const result = engine.estimateSqueezeProbability(highShortData, returns, 3);
      expect(result.probability).toBeGreaterThan(0.5);
    });

    it('低做空应有低概率', () => {
      const returns = Array.from({ length: 10 }, () => -0.01);
      const result = engine.estimateSqueezeProbability(lowShortData, returns, 1);
      expect(result.probability).toBeLessThan(0.3);
    });

    it('概率应在0-1之间', () => {
      const returns = Array.from({ length: 10 }, () => (Math.random() - 0.5) * 0.02);
      const result = engine.estimateSqueezeProbability(highShortData, returns, 2);
      expect(result.probability).toBeGreaterThanOrEqual(0);
      expect(result.probability).toBeLessThanOrEqual(1);
    });

    it('时间框架应为有效值', () => {
      const returns = Array.from({ length: 10 }, () => 0.01);
      const result = engine.estimateSqueezeProbability(highShortData, returns, 3);
      expect(['imminent', 'short_term', 'medium_term', 'unlikely']).toContain(result.timeframe);
    });
  });

  describe('identifyCatalysts', () => {
    it('应识别催化剂', () => {
      const events = [{ type: 'earnings', date: Date.now() + 86400000, description: '财报' }];
      const catalysts = engine.identifyCatalysts(events, ['突破阻力位'], 80);
      expect(catalysts.length).toBeGreaterThan(0);
      expect(catalysts[0].impact).toBeGreaterThan(0);
    });

    it('应按影响排序', () => {
      const events = [
        { type: 'earnings', date: Date.now() + 86400000, description: '财报' },
        { type: 'news', date: Date.now() + 172800000, description: '新闻' },
      ];
      const catalysts = engine.identifyCatalysts(events, [], 50);
      for (let i = 1; i < catalysts.length; i++) {
        expect(catalysts[i - 1].impact).toBeGreaterThanOrEqual(catalysts[i].impact);
      }
    });
  });

  describe('calcSqueezeScore', () => {
    it('应计算挤压评分', () => {
      const returns = Array.from({ length: 10 }, () => 0.01);
      const score = engine.calcSqueezeScore(highShortData, returns, 3, []);
      expect(score.overall).toBeGreaterThanOrEqual(0);
      expect(score.overall).toBeLessThanOrEqual(100);
      expect(['A', 'B', 'C', 'D', 'F']).toContain(score.grade);
    });

    it('高做空高压应得高分', () => {
      const returns = Array.from({ length: 10 }, () => 0.02);
      const catalysts = [{ type: 'earnings' as const, description: '财报', impact: 80, timing: 'immediate' as const }];
      const score = engine.calcSqueezeScore(highShortData, returns, 5, catalysts);
      expect(score.overall).toBeGreaterThan(50);
    });
  });

  describe('matchHistoricalPatterns', () => {
    it('应匹配历史模式', () => {
      const historical = [{
        date: Date.now() - 86400000 * 100,
        preShortRatio: 0.45,
        preDaysToCover: 20,
        duration: 5,
        maxGain: 50,
        peakDay: 3,
      }];
      const result = engine.matchHistoricalPatterns(highShortData, historical);
      expect(result.length).toBe(1);
      expect(typeof result[0].similar).toBe('boolean');
    });
  });
});
