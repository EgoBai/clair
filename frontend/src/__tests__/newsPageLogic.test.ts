/**
 * 新闻页面逻辑测试
 * 覆盖新闻分类、时间格式化、关键词搜索
 */

import { describe, it, expect } from 'vitest';

describe('新闻页面逻辑', () => {
  describe('新闻分类', () => {
    type NewsCategory = 'market' | 'company' | 'policy' | 'macro' | 'industry' | 'research';

    const categoryLabels: Record<NewsCategory, string> = {
      market: '市场动态',
      company: '公司新闻',
      policy: '政策法规',
      macro: '宏观经济',
      industry: '行业资讯',
      research: '研究报告',
    };

    function getCategoryLabel(category: NewsCategory): string {
      return categoryLabels[category] || '其他';
    }

    it('应有完整的分类标签', () => {
      expect(Object.keys(categoryLabels).length).toBe(6);
      for (const [, label] of Object.entries(categoryLabels)) {
        expect(label.length).toBeGreaterThan(0);
      }
    });

    it('应正确返回分类标签', () => {
      expect(getCategoryLabel('market')).toBe('市场动态');
      expect(getCategoryLabel('policy')).toBe('政策法规');
    });
  });

  describe('时间格式化', () => {
    function formatNewsTime(timestamp: number): string {
      const now = Date.now();
      const diff = now - timestamp;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (minutes < 1) return '刚刚';
      if (minutes < 60) return `${minutes}分钟前`;
      if (hours < 24) return `${hours}小时前`;
      if (days < 30) return `${days}天前`;
      return new Date(timestamp).toLocaleDateString('zh-CN');
    }

    it('刚刚应显示"刚刚"', () => {
      expect(formatNewsTime(Date.now() - 30000)).toBe('刚刚');
    });

    it('分钟级应显示分钟', () => {
      expect(formatNewsTime(Date.now() - 300000)).toBe('5分钟前');
    });

    it('小时级应显示小时', () => {
      expect(formatNewsTime(Date.now() - 7200000)).toBe('2小时前');
    });

    it('天级应显示天', () => {
      expect(formatNewsTime(Date.now() - 172800000)).toBe('2天前');
    });
  });

  describe('新闻搜索', () => {
    interface NewsItem {
      title: string;
      summary: string;
      tags: string[];
    }

    function searchNews(items: NewsItem[], keyword: string): NewsItem[] {
      const kw = keyword.toLowerCase();
      return items.filter(item =>
        item.title.toLowerCase().includes(kw) ||
        item.summary.toLowerCase().includes(kw) ||
        item.tags.some(t => t.toLowerCase().includes(kw))
      );
    }

    it('应按标题搜索', () => {
      const items: NewsItem[] = [
        { title: '茅台股价创新高', summary: '...', tags: [] },
        { title: '央行降准', summary: '...', tags: [] },
      ];
      expect(searchNews(items, '茅台')).toHaveLength(1);
    });

    it('应按摘要搜索', () => {
      const items: NewsItem[] = [
        { title: '标题A', summary: '科技股表现强劲', tags: [] },
        { title: '标题B', summary: '消费股疲软', tags: [] },
      ];
      expect(searchNews(items, '科技')).toHaveLength(1);
    });

    it('应按标签搜索', () => {
      const items: NewsItem[] = [
        { title: '标题', summary: '...', tags: ['白酒', '消费'] },
        { title: '标题', summary: '...', tags: ['科技'] },
      ];
      expect(searchNews(items, '白酒')).toHaveLength(1);
    });

    it('搜索应不区分大小写', () => {
      const items: NewsItem[] = [
        { title: 'AI概念火热', summary: '...', tags: [] },
      ];
      expect(searchNews(items, 'ai')).toHaveLength(1);
    });
  });

  describe('新闻重要性排序', () => {
    interface NewsItem {
      title: string;
      importance: 'high' | 'medium' | 'low';
      timestamp: number;
    }

    function sortByImportance(items: NewsItem[]): NewsItem[] {
      const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return [...items].sort((a, b) => {
        const diff = order[a.importance] - order[b.importance];
        if (diff !== 0) return diff;
        return b.timestamp - a.timestamp;
      });
    }

    it('重要新闻应排前面', () => {
      const items: NewsItem[] = [
        { title: '普通', importance: 'low', timestamp: Date.now() },
        { title: '重要', importance: 'high', timestamp: Date.now() - 1000 },
      ];
      const sorted = sortByImportance(items);
      expect(sorted[0].title).toBe('重要');
    });

    it('同级别按时间倒序', () => {
      const items: NewsItem[] = [
        { title: '旧', importance: 'medium', timestamp: 1000 },
        { title: '新', importance: 'medium', timestamp: 2000 },
      ];
      const sorted = sortByImportance(items);
      expect(sorted[0].title).toBe('新');
    });
  });
});
