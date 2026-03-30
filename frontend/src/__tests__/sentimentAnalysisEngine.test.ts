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
} from '../utils/sentimentAnalysisEngine';

describe('analyzeSentiment', () => {
  it('should detect positive sentiment in Chinese', () => {
    const result = analyzeSentiment('股票大涨，利好消息不断，看好后市');
    expect(result.compound).toBeGreaterThan(0);
    expect(result.positive).toBeGreaterThan(result.negative);
  });

  it('should detect negative sentiment in Chinese', () => {
    const result = analyzeSentiment('股票大跌，利空消息，暴跌风险');
    expect(result.compound).toBeLessThan(0);
    expect(result.negative).toBeGreaterThan(result.positive);
  });

  it('should detect positive sentiment in English', () => {
    const result = analyzeSentiment('Stock surges on bullish outlook, strong growth');
    expect(result.compound).toBeGreaterThan(0);
  });

  it('should detect negative sentiment in English', () => {
    const result = analyzeSentiment('Stock crashes on bearish outlook, sharp decline');
    expect(result.compound).toBeLessThan(0);
  });

  it('should handle negation', () => {
    const positive = analyzeSentiment('涨了');
    const negated = analyzeSentiment('没有涨');
    // Negation should reduce or flip sentiment
    expect(negated.compound).toBeLessThanOrEqual(positive.compound);
  });

  it('should handle mixed sentiment', () => {
    const result = analyzeSentiment('涨跌互现，市场分化');
    expect(Math.abs(result.compound)).toBeLessThan(0.5);
  });

  it('should return scores between 0 and 1', () => {
    const result = analyzeSentiment('some text about stocks');
    expect(result.positive).toBeGreaterThanOrEqual(0);
    expect(result.positive).toBeLessThanOrEqual(1);
    expect(result.negative).toBeGreaterThanOrEqual(0);
    expect(result.negative).toBeLessThanOrEqual(1);
    expect(result.compound).toBeGreaterThanOrEqual(-1);
    expect(result.compound).toBeLessThanOrEqual(1);
  });

  it('should handle empty text', () => {
    const result = analyzeSentiment('');
    expect(result.compound).toBe(0);
    expect(result.confidence).toBe(0);
  });
});

describe('analyzeNewsArticles', () => {
  const articles: NewsArticle[] = [
    { title: 'A股大涨', content: '市场强势反弹', source: 'sina', timestamp: 1000, symbols: ['000001'] },
    { title: '股市暴跌', content: '利空消息不断', source: 'sina', timestamp: 2000, symbols: ['000001'] },
    { title: '市场稳定', content: '指数小幅波动', source: 'eastmoney', timestamp: 3000, category: 'market' },
  ];

  it('should analyze overall sentiment', () => {
    const result = analyzeNewsArticles(articles);
    expect(result.overallSentiment).toBeDefined();
    expect(result.overallSentiment.compound).toBeDefined();
  });

  it('should group by source', () => {
    const result = analyzeNewsArticles(articles);
    expect(result.bySource['sina']).toBeDefined();
    expect(result.bySource['eastmoney']).toBeDefined();
  });

  it('should group by category', () => {
    const result = analyzeNewsArticles(articles);
    expect(result.byCategory['market']).toBeDefined();
  });

  it('should group by symbol', () => {
    const result = analyzeNewsArticles(articles);
    expect(result.bySymbol['000001']).toBeDefined();
  });

  it('should generate trends', () => {
    const result = analyzeNewsArticles(articles);
    expect(result.trends.length).toBe(3);
  });
});

describe('analyzeSocialMentions', () => {
  const mentions: SocialMention[] = [
    { platform: 'weibo', content: '大涨利好', author: 'user1', timestamp: 1000, likes: 10, shares: 5, symbols: ['000001'] },
    { platform: 'xueqiu', content: '暴跌风险', author: 'user2', timestamp: 2000, likes: 100, shares: 50, symbols: ['000001'] },
    { platform: 'weibo', content: '市场平稳', author: 'user3', timestamp: 3000, likes: 5, shares: 2, symbols: ['600519'] },
  ];

  it('should analyze overall sentiment', () => {
    const result = analyzeSocialMentions(mentions);
    expect(result.overallSentiment).toBeDefined();
  });

  it('should group by platform', () => {
    const result = analyzeSocialMentions(mentions);
    expect(result.byPlatform['weibo']).toBeDefined();
    expect(result.byPlatform['xueqiu']).toBeDefined();
  });

  it('should group by symbol', () => {
    const result = analyzeSocialMentions(mentions);
    expect(result.bySymbol['000001']).toBeDefined();
    expect(result.bySymbol['000001'].volume).toBe(2);
  });

  it('should identify influencers', () => {
    const result = analyzeSocialMentions(mentions);
    expect(Array.isArray(result.influencerMentions)).toBe(true);
  });
});

describe('calculateSentimentTrends', () => {
  it('should calculate moving averages', () => {
    const data = Array.from({ length: 20 }, (_, i) => ({
      timestamp: i * 1000,
      sentiment: Math.sin(i * 0.3),
    }));
    const trends = calculateSentimentTrends(data, 5);
    expect(trends.length).toBe(20);
    expect(trends[4].movingAverage).toBeDefined();
  });

  it('should handle single data point', () => {
    const trends = calculateSentimentTrends([{ timestamp: 1000, sentiment: 0.5 }]);
    expect(trends.length).toBe(1);
    expect(trends[0].movingAverage).toBe(0.5);
  });
});

describe('detectSentimentAnomalies', () => {
  it('should detect anomalies', () => {
    const trends = Array.from({ length: 30 }, (_, i) => ({
      timestamp: i * 1000,
      sentiment: i === 15 ? 5 : 0.1, // spike at index 15
      volume: 1,
      movingAverage: 0.1,
    }));
    const anomalies = detectSentimentAnomalies(trends, 2);
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies[0].metric).toBe('sentiment');
  });

  it('should return empty for insufficient data', () => {
    const trends = [{ timestamp: 1000, sentiment: 0.5, volume: 1, movingAverage: 0.5 }];
    expect(detectSentimentAnomalies(trends)).toEqual([]);
  });
});

describe('detectSentimentVolumeDivergence', () => {
  it('should detect divergences', () => {
    const trends = [
      { timestamp: 1000, sentiment: 0.1, volume: 10, movingAverage: 0.1 },
      { timestamp: 2000, sentiment: 0.2, volume: 8, movingAverage: 0.15 },
      { timestamp: 3000, sentiment: 0.3, volume: 6, movingAverage: 0.2 },
      { timestamp: 4000, sentiment: 0.4, volume: 4, movingAverage: 0.25 },
      { timestamp: 5000, sentiment: 0.5, volume: 2, movingAverage: 0.3 },
      { timestamp: 6000, sentiment: 0.6, volume: 1, movingAverage: 0.35 },
    ];
    const divs = detectSentimentVolumeDivergence(trends, 3);
    expect(divs.length).toBeGreaterThan(0);
  });
});

describe('calculateDataQuality', () => {
  it('should assess data quality', () => {
    const data = [
      { a: 1, b: 'x' },
      { a: 2, b: 'y' },
      { a: 3, b: null },
    ];
    const quality = calculateDataQuality(data, ['a', 'b']);
    expect(quality.completeness).toBeCloseTo(2 / 3, 1);
    expect(quality.overallScore).toBeGreaterThan(0);
  });

  it('should return 0 for empty data', () => {
    const quality = calculateDataQuality([], ['a']);
    expect(quality.overallScore).toBe(0);
  });

  it('should report issues', () => {
    const data = [{ a: 1 }, { a: null }];
    const quality = calculateDataQuality(data, ['a']);
    expect(quality.issues.length).toBeGreaterThan(0);
  });
});

describe('calculateNewsImpactScore', () => {
  it('should calculate impact for positive article', () => {
    const article: NewsArticle = {
      title: '重磅利好！A股大涨突破新高',
      content: '市场强势反弹，利好消息不断',
      source: 'sina',
      timestamp: Date.now(),
    };
    const score = calculateNewsImpactScore(article);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('should increase impact for urgent articles', () => {
    const normal: NewsArticle = { title: '股票上涨', content: '市场好', source: 'sina', timestamp: Date.now() };
    const urgent: NewsArticle = { title: '突发！股票上涨', content: '紧急公告', source: 'sina', timestamp: Date.now() };
    expect(calculateNewsImpactScore(urgent)).toBeGreaterThanOrEqual(
      calculateNewsImpactScore(normal)
    );
  });
});
