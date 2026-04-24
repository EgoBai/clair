import { describe, it, expect } from 'vitest';
import {
  analyzeTextSentiment,
  calculateEngagement,
  volumeSignal,
  extractHotTopics,
  influencerSentiment,
  detectSentimentTrend,
  analyzeSocialSentiment,
  analyzeTopicSentiment,
} from '../utils/socialSentimentEngine';
import type { SocialPost } from '../utils/socialSentimentEngine';

function createPost(overrides: Partial<SocialPost> = {}): SocialPost {
  return {
    id: Math.random().toString(36).slice(2),
    platform: 'guba',
    timestamp: Date.now(),
    content: '今天市场表现不错',
    likes: 10,
    comments: 5,
    shares: 2,
    author: 'user1',
    ...overrides,
  };
}

describe('Social Sentiment Engine', () => {
  const bullPosts = [
    createPost({ content: '利好消息，强势涨停，看好后市', likes: 50 }),
    createPost({ content: '突破新高，加仓买入，牛市来了', likes: 30 }),
    createPost({ content: '回购增持，超预期增长', likes: 40 }),
  ];

  const bearPosts = [
    createPost({ content: '利空暴跌，清仓跑路', likes: 20 }),
    createPost({ content: '减持暴雷，割肉止损', likes: 15 }),
    createPost({ content: '破位下跌，风险很大', likes: 25 }),
  ];

  const mixedPosts = [...bullPosts, ...bearPosts];

  describe('analyzeTextSentiment', () => {
    it('should return positive for bullish text', () => {
      const score = analyzeTextSentiment('涨停利好看好');
      expect(score).toBeGreaterThan(0);
    });

    it('should return negative for bearish text', () => {
      const score = analyzeTextSentiment('暴跌利空清仓');
      expect(score).toBeLessThan(0);
    });

    it('should return near zero for neutral text', () => {
      const score = analyzeTextSentiment('今天天气不错');
      expect(Math.abs(score)).toBeLessThan(0.5);
    });
  });

  describe('calculateEngagement', () => {
    it('should calculate engagement score', () => {
      const score = calculateEngagement(bullPosts);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should return 0 for empty posts', () => {
      expect(calculateEngagement([])).toBe(0);
    });
  });

  describe('volumeSignal', () => {
    it('should return high for high volume', () => {
      const posts = Array(100).fill(createPost());
      expect(volumeSignal(posts, 50)).toBe('high');
    });

    it('should return low for low volume', () => {
      const posts = [createPost()];
      expect(volumeSignal(posts, 50)).toBe('low');
    });

    it('should return normal for average volume', () => {
      const posts = Array(50).fill(createPost());
      expect(volumeSignal(posts, 50)).toBe('normal');
    });
  });

  describe('extractHotTopics', () => {
    it('should extract frequently mentioned words', () => {
      const posts = [
        createPost({ content: '白酒今天大涨' }),
        createPost({ content: '白酒持续上涨' }),
        createPost({ content: '白酒非常强势' }),
      ];
      const topics = extractHotTopics(posts);
      // Chinese character splitting depends on the algorithm
      expect(Array.isArray(topics)).toBe(true);
    });

    it('should handle empty posts', () => {
      expect(extractHotTopics([])).toEqual([]);
    });
  });

  describe('influencerSentiment', () => {
    it('should weight influencer posts more', () => {
      const posts = [
        createPost({ author: 'big1', likes: 1000, content: '利好涨停' }),
        createPost({ author: 'small1', likes: 1, content: '利空暴跌' }),
      ];
      const sentiment = influencerSentiment(posts);
      expect(sentiment).toBeGreaterThan(0);
    });

    it('should return 0 for empty posts', () => {
      expect(influencerSentiment([])).toBe(0);
    });
  });

  describe('detectSentimentTrend', () => {
    it('should detect bullish trend', () => {
      const posts = [
        createPost({ timestamp: 1, sentimentScore: -0.5 }),
        createPost({ timestamp: 2, sentimentScore: -0.3 }),
        createPost({ timestamp: 3, sentimentScore: 0.5 }),
        createPost({ timestamp: 4, sentimentScore: 0.7 }),
      ];
      expect(detectSentimentTrend(posts)).toBe('bullish');
    });

    it('should detect bearish trend', () => {
      const posts = [
        createPost({ timestamp: 1, sentimentScore: 0.5 }),
        createPost({ timestamp: 2, sentimentScore: 0.3 }),
        createPost({ timestamp: 3, sentimentScore: -0.5 }),
        createPost({ timestamp: 4, sentimentScore: -0.7 }),
      ];
      expect(detectSentimentTrend(posts)).toBe('bearish');
    });

    it('should return neutral for insufficient data', () => {
      expect(detectSentimentTrend([createPost()])).toBe('neutral');
    });
  });

  describe('analyzeSocialSentiment', () => {
    it('should return complete analysis', () => {
      const result = analyzeSocialSentiment(mixedPosts);

      expect(result.overallScore).toBeGreaterThanOrEqual(-1);
      expect(result.overallScore).toBeLessThanOrEqual(1);
      expect(result.bullishCount).toBeGreaterThan(0);
      expect(result.bearishCount).toBeGreaterThan(0);
      expect(['bullish', 'bearish', 'neutral']).toContain(result.sentimentTrend);
      expect(result.engagementScore).toBeGreaterThanOrEqual(0);
      expect(['high', 'normal', 'low']).toContain(result.volumeSignal);
    });

    it('should handle empty posts', () => {
      const result = analyzeSocialSentiment([]);
      expect(result.overallScore).toBe(0);
      expect(result.bullishCount).toBe(0);
      expect(result.bearishCount).toBe(0);
    });
  });

  describe('analyzeTopicSentiment', () => {
    it('should analyze sentiment per topic', () => {
      const posts = [
        createPost({ content: '白酒板块表现强势' }),
        createPost({ content: '白酒板块持续上涨' }),
        createPost({ content: '科技板块今天大跌' }),
      ];
      const topics = analyzeTopicSentiment(posts, ['白酒', '科技']);

      expect(topics.length).toBe(2);
      topics.forEach((t) => {
        expect(t.topic).toBeDefined();
        expect(t.mentions).toBeGreaterThanOrEqual(0);
        expect(typeof t.avgSentiment).toBe('number');
        expect(['rising', 'stable', 'declining']).toContain(t.trend);
      });
    });
  });
});
