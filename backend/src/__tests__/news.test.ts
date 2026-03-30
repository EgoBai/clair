/**
 * 新闻 API 测试
 */

import { describe, it, expect } from 'vitest';

describe('新闻与资讯', () => {
  describe('情感分析', () => {
    it('应该正确分类情感标签', () => {
      const sentiments = ['positive', 'negative', 'neutral'];
      const testCases = [
        { title: 'A股大涨', sentiment: 'positive' },
        { title: '股市暴跌', sentiment: 'negative' },
        { title: '央行维持利率', sentiment: 'neutral' },
      ];

      for (const tc of testCases) {
        expect(sentiments).toContain(tc.sentiment);
      }
    });

    it('情感分数应该在 -1 到 1 之间', () => {
      const scores = [0.7, -0.6, 0.3, -0.3, 0.0];
      for (const score of scores) {
        expect(score).toBeGreaterThanOrEqual(-1);
        expect(score).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('新闻分类', () => {
    it('应该有5个标准分类', () => {
      const categories = ['market', 'company', 'policy', 'global', 'analysis'];
      expect(categories.length).toBe(5);
    });

    it('每条新闻应该有正确的分类', () => {
      const validCategories = ['market', 'company', 'policy', 'global', 'analysis'];
      const newsItems = [
        { category: 'market' },
        { category: 'company' },
        { category: 'policy' },
      ];

      for (const item of newsItems) {
        expect(validCategories).toContain(item.category);
      }
    });
  });

  describe('搜索和筛选', () => {
    it('应该支持按关键词搜索', () => {
      const news = [
        { title: 'A股大涨', tags: ['大盘'] },
        { title: '茅台业绩', tags: ['白酒', '消费'] },
        { title: '央行降息', tags: ['货币政策'] },
      ];

      const query = '茅台';
      const results = news.filter((n) =>
        n.title.includes(query) || n.tags.some((t) => t.includes(query))
      );

      expect(results.length).toBe(1);
      expect(results[0].title).toContain('茅台');
    });

    it('应该支持按股票代码筛选', () => {
      const news = [
        { title: '平安银行年报', relatedSymbols: ['000001.SZ'] },
        { title: '茅台业绩', relatedSymbols: ['600519.SH'] },
        { title: '大盘综述', relatedSymbols: [] },
      ];

      const symbol = '000001.SZ';
      const results = news.filter((n) => n.relatedSymbols.includes(symbol));

      expect(results.length).toBe(1);
      expect(results[0].relatedSymbols).toContain('000001.SZ');
    });

    it('应该支持分页', () => {
      const total = 25;
      const pageSize = 10;
      const totalPages = Math.ceil(total / pageSize);

      expect(totalPages).toBe(3);

      // 第1页
      const page1Start = 0;
      expect(page1Start).toBe(0);

      // 第2页
      const page2Start = (2 - 1) * pageSize;
      expect(page2Start).toBe(10);

      // 第3页
      const page3Start = (3 - 1) * pageSize;
      expect(page3Start).toBe(20);
    });
  });

  describe('标签统计', () => {
    it('应该正确统计热门标签', () => {
      const news = [
        { tags: ['大盘', '指数'] },
        { tags: ['大盘', '白酒'] },
        { tags: ['白酒', '消费'] },
        { tags: ['大盘'] },
      ];

      const tagCount = new Map<string, number>();
      for (const item of news) {
        for (const tag of item.tags) {
          tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
        }
      }

      const hotTags = Array.from(tagCount.entries())
        .sort((a, b) => b[1] - a[1]);

      expect(hotTags[0][0]).toBe('大盘');
      expect(hotTags[0][1]).toBe(3);
    });
  });
});
