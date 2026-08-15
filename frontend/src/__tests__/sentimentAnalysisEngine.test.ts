import { describe, it, expect } from 'vitest';
import {
  analyzeSentiment,
  analyzeNewsArticles,
  analyzeSocialMentions,
  calculateSentimentTrends,
  detectSentimentAnomalies,
  detectSentimentVolumeDivergence,
  calculateDataQuality,
  calculateNewsImpactScore,
  type NewsArticle,
  type SocialMention,
  type SentimentTrend
} from '../utils/sentimentAnalysisEngine';

/**
 * 情绪分析引擎测试（导入真实模块）
 */

describe('SentimentAnalysisEngine (real module)', () => {
  describe('analyzeSentiment', () => {
    it('should detect positive sentiment', () => {
      const score = analyzeSentiment('股市大涨突破创新高利好');
      expect(score.compound).toBeGreaterThan(0);
    });

    it('should detect negative sentiment', () => {
      const score = analyzeSentiment('股市暴跌崩盘利空');
      expect(score.compound).toBeLessThan(0);
    });

    it('should return neutral for empty text', () => {
      const score = analyzeSentiment('');
      expect(score.compound).toBe(0);
      expect(score.positive).toBeCloseTo(0.33, 4);
      expect(score.neutral).toBeCloseTo(0.34, 4);
    });

    it('should return neutral for non-financial text', () => {
      const score = analyzeSentiment('今天天气不错');
      expect(score.compound).toBe(0);
    });

    it('confidence should be 0-1', () => {
      const score = analyzeSentiment('上涨突破利好增长');
      expect(score.confidence).toBeGreaterThanOrEqual(0);
      expect(score.confidence).toBeLessThanOrEqual(1);
    });

    it('detects bullish keyword (no negation handling)', () => {
      // 真实模块不做否定翻转: "没有大涨" 仍含看涨词 -> positive>0
      const score = analyzeSentiment('没有大涨');
      expect(score.positive).toBeGreaterThan(0);
      expect(score.negative).toBe(0);
    });
  });

  describe('analyzeNewsArticles', () => {
    const articles: NewsArticle[] = [
      { title: '大涨突破', content: '利好', source: 'sina', timestamp: 1000, symbols: ['600519'], category: 'company' },
      { title: '暴跌崩盘', content: '利空', source: 'sina', timestamp: 2000, symbols: ['000001'], category: 'market' },
      { title: '市场平稳', content: '波动不大', source: 'eastmoney', timestamp: 3000, category: 'market' },
    ];

    it('should aggregate overall sentiment and breakdowns', () => {
      const result = analyzeNewsArticles(articles);
      expect(result.overallSentiment).toBeDefined();
      expect(Object.keys(result.bySource).sort()).toEqual(['eastmoney', 'sina']);
      expect(Object.keys(result.bySymbol)).toContain('600519');
      expect(result.byCategory).toHaveProperty('market');
      expect(result.trends).toHaveLength(articles.length);
    });

    it('should handle empty articles', () => {
      const result = analyzeNewsArticles([]);
      expect(result.overallSentiment.compound).toBe(0);
      expect(result.trends).toHaveLength(0);
    });
  });

  describe('analyzeSocialMentions', () => {
    const mentions: SocialMention[] = [
      { platform: 'xueqiu', content: '大涨突破利好', author: 'u1', timestamp: 1, likes: 50, shares: 40, symbols: ['600519'] },
      { platform: 'weibo', content: '暴跌利空', author: 'u2', timestamp: 2, likes: 10, shares: 5 },
    ];

    it('should aggregate by platform and symbol', () => {
      const result = analyzeSocialMentions(mentions);
      expect(Object.keys(result.byPlatform).sort()).toEqual(['weibo', 'xueqiu']);
      expect(Object.keys(result.bySymbol)).toContain('600519');
      expect(result.bySymbol['600519'].volume).toBe(1);
    });

    it('should surface high-engagement influencers', () => {
      const result = analyzeSocialMentions(mentions);
      // u1 engagement = 50 + 40*2 = 130 > 100
      expect(result.influencerMentions.some(m => m.author === 'u1')).toBe(true);
    });
  });

  describe('calculateSentimentTrends', () => {
    it('should calculate a moving average', () => {
      const data = [
        { timestamp: 1, sentiment: 0.5 },
        { timestamp: 2, sentiment: 0.3 },
        { timestamp: 3, sentiment: 0.7 },
      ];
      const trends = calculateSentimentTrends(data, 2);
      expect(trends).toHaveLength(3);
      expect(trends[2].movingAverage).toBeCloseTo(0.5, 4);
      expect(trends[2].volume).toBe(1);
    });

    it('should sort by timestamp', () => {
      const data = [
        { timestamp: 3, sentiment: 0.7 },
        { timestamp: 1, sentiment: 0.5 },
        { timestamp: 2, sentiment: 0.3 },
      ];
      const trends = calculateSentimentTrends(data, 2);
      expect(trends[0].timestamp).toBe(1);
      expect(trends[2].timestamp).toBe(3);
    });
  });

  describe('detectSentimentAnomalies', () => {
    const baseTrends = (outlier: number): SentimentTrend[] => {
      const arr: SentimentTrend[] = [];
      for (let i = 0; i < 10; i++) {
        arr.push({ timestamp: i, sentiment: 0.5, volume: 1, movingAverage: 0.5 });
      }
      arr.push({ timestamp: 10, sentiment: outlier, volume: 1, movingAverage: outlier });
      return arr;
    };

    it('should detect a spike (high severity) with low threshold', () => {
      const anomalies = detectSentimentAnomalies(baseTrends(2.0), 0.5);
      expect(anomalies.length).toBeGreaterThanOrEqual(1);
      expect(anomalies[0].type).toBe('spike');
      expect(anomalies[0].severity).toBe('high');
    });

    it('should detect a drop (medium severity) with higher threshold', () => {
      const anomalies = detectSentimentAnomalies(baseTrends(1.5), 2);
      expect(anomalies.length).toBeGreaterThanOrEqual(1);
      expect(anomalies[0].type).toBe('drop');
      expect(anomalies[0].severity).toBe('medium');
    });

    it('should return empty for constant data', () => {
      const data = Array.from({ length: 12 }, (_, i) => ({ timestamp: i, sentiment: 0.5, volume: 1, movingAverage: 0.5 }));
      expect(detectSentimentAnomalies(data)).toHaveLength(0);
    });

    it('should return empty for insufficient data', () => {
      const data = [{ timestamp: 1, sentiment: 0.5, volume: 1, movingAverage: 0.5 }];
      expect(detectSentimentAnomalies(data)).toHaveLength(0);
    });
  });

  describe('detectSentimentVolumeDivergence', () => {
    it('should detect bearish divergence (sentiment up, volume down)', () => {
      const trends: SentimentTrend[] = [
        { timestamp: 0, sentiment: 0.1, volume: 10, movingAverage: 0.1 },
        { timestamp: 1, sentiment: 0.2, volume: 8, movingAverage: 0.15 },
        { timestamp: 2, sentiment: 0.3, volume: 6, movingAverage: 0.2 },
      ];
      const div = detectSentimentVolumeDivergence(trends, 2);
      expect(div.length).toBeGreaterThanOrEqual(1);
      expect(div[0].type).toBe('bearish');
    });

    it('should detect bullish divergence (sentiment down, volume up)', () => {
      const trends: SentimentTrend[] = [
        { timestamp: 0, sentiment: 0.3, volume: 4, movingAverage: 0.3 },
        { timestamp: 1, sentiment: 0.2, volume: 6, movingAverage: 0.25 },
        { timestamp: 2, sentiment: 0.1, volume: 10, movingAverage: 0.2 },
      ];
      const div = detectSentimentVolumeDivergence(trends, 2);
      expect(div.length).toBeGreaterThanOrEqual(1);
      expect(div[0].type).toBe('bullish');
    });
  });

  describe('calculateDataQuality', () => {
    it('should report full quality for complete consistent data', () => {
      const data = [
        { a: 1, b: 2 },
        { a: 3, b: 4 },
      ];
      const q = calculateDataQuality(data, ['a', 'b']);
      expect(q.completeness).toBe(1);
      expect(q.consistency).toBe(1);
      expect(q.issues).toHaveLength(0);
    });

    it('should report missing fields', () => {
      const data = [
        { a: 1, b: 2 },
        { a: 3 },
      ];
      const q = calculateDataQuality(data, ['a', 'b']);
      expect(q.completeness).toBeLessThan(1);
      expect(q.issues.length).toBeGreaterThan(0);
    });

    it('should handle empty data', () => {
      const q = calculateDataQuality([], ['a']);
      expect(q.overallScore).toBe(0);
      expect(q.issues).toContain('No data');
    });
  });

  describe('calculateNewsImpactScore', () => {
    it('returns a bounded positive impact for urgent bullish news', () => {
      const article: NewsArticle = {
        title: '突发：股市大涨突破创新高利好',
        content: '强势拉升',
        source: 'sina',
        timestamp: 1,
      };
      const score = calculateNewsImpactScore(article);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
      expect(score).toBeGreaterThan(0); // urgent bullish news yields positive impact
    });

    it('should be 0 for neutral content', () => {
      const article: NewsArticle = { title: '市场平稳', content: '波动不大', source: 'sina', timestamp: 1 };
      expect(calculateNewsImpactScore(article)).toBe(0);
    });
  });
});
