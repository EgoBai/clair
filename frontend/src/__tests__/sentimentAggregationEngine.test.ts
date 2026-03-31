import { describe, it, expect } from 'vitest';
import {
  analyzeTextSentiment,
  timeDecayWeight,
  aggregateStockSentiment,
  detectBreakingEvents,
  compareSectorSentiments,
  type NewsItem,
} from '../utils/sentimentAggregationEngine';

const mockNews = (overrides: Partial<NewsItem> = {}): NewsItem => ({
  id: '1',
  title: '测试新闻',
  content: '这是测试内容',
  source: '测试来源',
  publishTime: '2026-03-31T10:00:00',
  relatedStocks: ['SH600001'],
  category: 'company',
  ...overrides,
});

describe('舆情聚合引擎', () => {
  describe('analyzeTextSentiment', () => {
    it('should detect positive sentiment', () => {
      const result = analyzeTextSentiment('该公司业绩大增，利好，推荐买入');
      expect(result.compound).toBeGreaterThan(0);
      expect(result.positive).toBeGreaterThan(result.negative);
    });

    it('should detect negative sentiment', () => {
      const result = analyzeTextSentiment('公司暴雷，亏损严重，减持风险');
      expect(result.compound).toBeLessThan(0);
      expect(result.negative).toBeGreaterThan(result.positive);
    });

    it('should return neutral for no keywords', () => {
      const result = analyzeTextSentiment('今天天气不错');
      expect(result.compound).toBeCloseTo(0, 0);
    });

    it('should calculate confidence', () => {
      const result = analyzeTextSentiment('利好涨停创新高买入增持');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle empty text', () => {
      const result = analyzeTextSentiment('');
      expect(result.compound).toBe(0);
    });
  });

  describe('timeDecayWeight', () => {
    it('should return 1 for recent news', () => {
      const result = timeDecayWeight('2026-03-31T09:00:00', '2026-03-31T09:30:00');
      expect(result).toBe(1);
    });

    it('should decay with time', () => {
      const recent = timeDecayWeight('2026-03-31T09:00:00', '2026-03-31T09:30:00');
      const old = timeDecayWeight('2026-03-30T09:00:00', '2026-03-31T09:30:00');
      expect(recent).toBeGreaterThan(old);
    });

    it('should have minimum weight', () => {
      const result = timeDecayWeight('2026-01-01T00:00:00', '2026-03-31T00:00:00');
      expect(result).toBeGreaterThan(0);
    });
  });

  describe('aggregateStockSentiment', () => {
    const news: NewsItem[] = [
      mockNews({ id: '1', title: '利好消息', content: '业绩大增超预期', relatedStocks: ['SH600001'], publishTime: '2026-03-31T09:00:00' }),
      mockNews({ id: '2', title: '风险提示', content: '下跌风险减持', relatedStocks: ['SH600001'], publishTime: '2026-03-31T10:00:00' }),
      mockNews({ id: '3', title: '行业利好', content: '政策支持增长', relatedStocks: ['SH600001', 'SH600002'], publishTime: '2026-03-31T11:00:00' }),
    ];

    it('should aggregate sentiment for stock', () => {
      const result = aggregateStockSentiment('SH600001', news, '2026-03-31T12:00:00');
      expect(result.newsCount).toBe(3);
      expect(result.hotness).toBeGreaterThan(0);
    });

    it('should detect trend', () => {
      const result = aggregateStockSentiment('SH600001', news, '2026-03-31T12:00:00');
      expect(['improving', 'stable', 'deteriorating']).toContain(result.trend);
    });

    it('should extract key topics', () => {
      const result = aggregateStockSentiment('SH600001', news, '2026-03-31T12:00:00');
      expect(Array.isArray(result.keyTopics)).toBe(true);
    });

    it('should handle no news', () => {
      const result = aggregateStockSentiment('SH999999', news, '2026-03-31T12:00:00');
      expect(result.newsCount).toBe(0);
      expect(result.hotness).toBe(0);
    });

    it('should calculate time decay score', () => {
      const result = aggregateStockSentiment('SH600001', news, '2026-03-31T12:00:00');
      expect(result.timeDecay).toBeGreaterThan(0);
    });
  });

  describe('detectBreakingEvents', () => {
    const news: NewsItem[] = [
      mockNews({ title: '突发！重大利好公告', content: '涨停预期', publishTime: '2026-03-31T10:00:00' }),
      mockNews({ title: '普通新闻', content: '一般内容', publishTime: '2026-03-31T10:00:00' }),
      mockNews({ title: '重磅消息：紧急通知', content: '重大影响', publishTime: '2026-03-31T11:00:00' }),
    ];

    it('should detect breaking events', () => {
      const events = detectBreakingEvents(news, '2026-03-31T12:00:00');
      expect(events.length).toBeGreaterThan(0);
    });

    it('should not flag normal news', () => {
      const normalNews = [mockNews({ title: '普通新闻', content: '一般内容' })];
      const events = detectBreakingEvents(normalNews, '2026-03-31T12:00:00');
      expect(events).toHaveLength(0);
    });

    it('should sort by urgency', () => {
      const events = detectBreakingEvents(news, '2026-03-31T12:00:00');
      for (let i = 1; i < events.length; i++) {
        expect(events[i - 1].urgency).toBeGreaterThanOrEqual(events[i].urgency);
      }
    });

    it('should include impact level', () => {
      const events = detectBreakingEvents(news, '2026-03-31T12:00:00');
      events.forEach(e => {
        expect(['high', 'medium', 'low']).toContain(e.impact);
      });
    });

    it('should handle empty news', () => {
      const events = detectBreakingEvents([], '2026-03-31T12:00:00');
      expect(events).toHaveLength(0);
    });
  });

  describe('compareSectorSentiments', () => {
    const sectors = [
      { name: '科技', news: [mockNews({ title: '利好增长突破', publishTime: '2026-03-31T10:00:00' })] },
      { name: '医药', news: [mockNews({ title: '利空下跌风险', publishTime: '2026-03-31T10:00:00' })] },
      { name: '金融', news: [mockNews({ title: '普通消息', publishTime: '2026-03-31T10:00:00' })] },
    ];

    it('should rank sectors by sentiment', () => {
      const result = compareSectorSentiments(sectors, '2026-03-31T12:00:00');
      expect(result).toHaveLength(3);
      expect(result[0].rank).toBe(1);
    });

    it('should sort by sentiment descending', () => {
      const result = compareSectorSentiments(sectors, '2026-03-31T12:00:00');
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].sentiment).toBeGreaterThanOrEqual(result[i].sentiment);
      }
    });

    it('should include news count', () => {
      const result = compareSectorSentiments(sectors, '2026-03-31T12:00:00');
      result.forEach(r => {
        expect(r.newsCount).toBeGreaterThanOrEqual(0);
      });
    });

    it('should handle empty sectors', () => {
      const result = compareSectorSentiments([], '2026-03-31T12:00:00');
      expect(result).toHaveLength(0);
    });
  });
});
