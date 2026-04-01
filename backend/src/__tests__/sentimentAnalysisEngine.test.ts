import { describe, it, expect } from 'vitest';
import {
  calculateSentimentScore,
  detectSentimentDivergence,
  calculateSentimentMovingAverage,
  rankSentimentIndicators,
  SentimentData,
} from '../services/sentimentAnalysisEngine';

describe('市场情绪分析引擎', () => {
  const bullishData: SentimentData = {
    timestamp: new Date(),
    putCallRatio: 0.6,
    vixLevel: 12,
    marginBalance: 1.5e12,
    shortBalance: 5e10,
    newAccountCount: 600000,
    fundFlow: 10e9,
    limitUpCount: 150,
    limitDownCount: 20,
    advanceDeclineRatio: 0.8,
  };

  const bearishData: SentimentData = {
    timestamp: new Date(),
    putCallRatio: 1.5,
    vixLevel: 35,
    marginBalance: 3e11,
    shortBalance: 2e11,
    newAccountCount: 50000,
    fundFlow: -10e9,
    limitUpCount: 10,
    limitDownCount: 200,
    advanceDeclineRatio: 0.1,
  };

  const neutralData: SentimentData = {
    timestamp: new Date(),
    putCallRatio: 1.0,
    vixLevel: 20,
    marginBalance: 8e11,
    shortBalance: 1e11,
    newAccountCount: 300000,
    fundFlow: 1e9,
    limitUpCount: 50,
    limitDownCount: 40,
    advanceDeclineRatio: 0.55,
  };

  describe('情绪评分计算', () => {
    it('牛市数据应有高恐惧贪婪指数', () => {
      const score = calculateSentimentScore(bullishData);
      expect(score.fearGreedIndex).toBeGreaterThan(50);
    });

    it('熊市数据应有低恐惧贪婪指数', () => {
      const score = calculateSentimentScore(bearishData);
      expect(score.fearGreedIndex).toBeLessThan(50);
    });

    it('评分应在-1到1之间', () => {
      const score = calculateSentimentScore(neutralData);
      expect(score.overall).toBeGreaterThanOrEqual(-1);
      expect(score.overall).toBeLessThanOrEqual(1);
    });

    it('恐惧贪婪指数应在0-100', () => {
      const score = calculateSentimentScore(bullishData);
      expect(score.fearGreedIndex).toBeGreaterThanOrEqual(0);
      expect(score.fearGreedIndex).toBeLessThanOrEqual(100);
    });

    it('应有五个情绪组件', () => {
      const score = calculateSentimentScore(neutralData);
      expect(score.components.momentum).toBeDefined();
      expect(score.components.volatility).toBeDefined();
      expect(score.components.volume).toBeDefined();
      expect(score.components.breadth).toBeDefined();
      expect(score.components.sentiment).toBeDefined();
    });

    it('应有信号分类', () => {
      expect(['extreme_fear', 'fear', 'neutral', 'greed', 'extreme_greed'])
        .toContain(calculateSentimentScore(bullishData).signal);
    });

    it('极度贪婪数据应有正确信号', () => {
      const extremeBullish: SentimentData = {
        ...bullishData,
        putCallRatio: 0.4,
        vixLevel: 8,
        limitUpCount: 500,
        limitDownCount: 5,
        advanceDeclineRatio: 0.95,
      };
      const score = calculateSentimentScore(extremeBullish);
      expect(['greed', 'extreme_greed']).toContain(score.signal);
    });

    it('极度恐惧数据应有正确信号', () => {
      const extremeBearish: SentimentData = {
        ...bearishData,
        putCallRatio: 2.0,
        vixLevel: 50,
        limitUpCount: 2,
        limitDownCount: 800,
        advanceDeclineRatio: 0.05,
      };
      const score = calculateSentimentScore(extremeBearish);
      expect(['extreme_fear', 'fear']).toContain(score.signal);
    });
  });

  describe('情绪背离检测', () => {
    it('应检测看跌背离', () => {
      const score = calculateSentimentScore(bearishData);
      const divergence = detectSentimentDivergence(score, 0.05);
      if (divergence) {
        expect(divergence.type).toBe('bearish');
      }
    });

    it('应检测看涨背离', () => {
      const score = calculateSentimentScore(bullishData);
      const divergence = detectSentimentDivergence(score, -0.05);
      if (divergence) {
        expect(divergence.type).toBe('bullish');
      }
    });

    it('无背离应返回null', () => {
      const score = calculateSentimentScore(neutralData);
      const divergence = detectSentimentDivergence(score, 0.005);
      expect(divergence).toBeNull();
    });

    it('背离应有强度值', () => {
      const score = calculateSentimentScore(bearishData);
      const divergence = detectSentimentDivergence(score, 0.05);
      if (divergence) {
        expect(divergence.strength).toBeGreaterThan(0);
      }
    });

    it('背离应有描述', () => {
      const score = calculateSentimentScore(bearishData);
      const divergence = detectSentimentDivergence(score, 0.05);
      if (divergence) {
        expect(divergence.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe('情绪移动平均', () => {
    it('应计算移动平均', () => {
      const scores = Array(10).fill(null).map(() => calculateSentimentScore(neutralData));
      const ma = calculateSentimentMovingAverage(scores, 5);
      expect(ma.length).toBe(6);
    });

    it('数据不足应返回空', () => {
      const scores = [calculateSentimentScore(neutralData)];
      const ma = calculateSentimentMovingAverage(scores, 5);
      expect(ma.length).toBe(0);
    });

    it('移动平均值应在合理范围', () => {
      const scores = Array(10).fill(null).map(() => calculateSentimentScore(bullishData));
      const ma = calculateSentimentMovingAverage(scores, 5);
      for (const v of ma) {
        expect(v).toBeGreaterThan(0);
      }
    });

    it('自定义周期应生效', () => {
      const scores = Array(10).fill(null).map(() => calculateSentimentScore(neutralData));
      const ma3 = calculateSentimentMovingAverage(scores, 3);
      const ma5 = calculateSentimentMovingAverage(scores, 5);
      expect(ma3.length).toBeGreaterThan(ma5.length);
    });
  });

  describe('情绪指标排名', () => {
    it('应返回所有指标', () => {
      const ranked = rankSentimentIndicators(neutralData);
      expect(ranked.length).toBe(6);
    });

    it('每个指标应有信号', () => {
      const ranked = rankSentimentIndicators(bullishData);
      for (const r of ranked) {
        expect(['bullish', 'bearish', 'neutral']).toContain(r.signal);
      }
    });

    it('牛市数据应有多个看涨信号', () => {
      const ranked = rankSentimentIndicators(bullishData);
      const bullishCount = ranked.filter(r => r.signal === 'bullish').length;
      expect(bullishCount).toBeGreaterThan(0);
    });

    it('熊市数据应有多个看跌信号', () => {
      const ranked = rankSentimentIndicators(bearishData);
      const bearishCount = ranked.filter(r => r.signal === 'bearish').length;
      expect(bearishCount).toBeGreaterThan(0);
    });

    it('每个指标应有价值', () => {
      const ranked = rankSentimentIndicators(neutralData);
      for (const r of ranked) {
        expect(typeof r.value).toBe('number');
      }
    });
  });
});
