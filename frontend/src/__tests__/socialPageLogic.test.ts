/**
 * 社交页面逻辑测试
 * 覆盖讨论热度、情绪分析、KOL排名
 */

import { describe, it, expect } from 'vitest';

describe('社交页面逻辑', () => {
  describe('讨论热度计算', () => {
    interface Discussion {
      timestamp: number;
      likes: number;
      comments: number;
      views: number;
    }

    function calcHeatScore(discussions: Discussion[], windowMs: number = 3600000): number {
      const now = Date.now();
      const recent = discussions.filter(d => now - d.timestamp < windowMs);
      return recent.reduce((score, d) => score + d.likes * 3 + d.comments * 2 + d.views * 0.1, 0);
    }

    it('应正确计算热度分数', () => {
      const now = Date.now();
      const discussions: Discussion[] = [
        { timestamp: now - 1000, likes: 10, comments: 5, views: 100 },
        { timestamp: now - 2000, likes: 20, comments: 10, views: 200 },
      ];
      const heat = calcHeatScore(discussions);
      expect(heat).toBe(30 + 10 + 10 + 60 + 20 + 20); // 150
    });

    it('过期讨论不应计入', () => {
      const now = Date.now();
      const discussions: Discussion[] = [
        { timestamp: now - 7200000, likes: 100, comments: 50, views: 1000 }, // 2小时前
      ];
      const heat = calcHeatScore(discussions, 3600000);
      expect(heat).toBe(0);
    });
  });

  describe('情绪分析', () => {
    function analyzeSentiment(text: string): { score: number; label: 'bullish' | 'bearish' | 'neutral' } {
      const bullishWords = ['涨', '牛', '好', '买', '看多', '突破', '抄底', '利好'];
      const bearishWords = ['跌', '熊', '差', '卖', '看空', '破位', '割肉', '利空'];

      let score = 0;
      for (const w of bullishWords) {
        if (text.includes(w)) score += 1;
      }
      for (const w of bearishWords) {
        if (text.includes(w)) score -= 1;
      }

      let label: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      if (score > 0) label = 'bullish';
      else if (score < 0) label = 'bearish';

      return { score, label };
    }

    it('看多文本应返回bullish', () => {
      const result = analyzeSentiment('这股票要涨了，准备买');
      expect(result.label).toBe('bullish');
      expect(result.score).toBeGreaterThan(0);
    });

    it('看空文本应返回bearish', () => {
      const result = analyzeSentiment('要跌了，准备卖割肉');
      expect(result.label).toBe('bearish');
    });

    it('中性文本应返回neutral', () => {
      const result = analyzeSentiment('今天走势怎么样');
      expect(result.label).toBe('neutral');
    });
  });

  describe('讨论排行', () => {
    interface DiscussionTopic {
      symbol: string;
      name: string;
      postCount: number;
      participantCount: number;
      heatScore: number;
    }

    function rankTopics(topics: DiscussionTopic[], by: 'heatScore' | 'postCount' = 'heatScore'): DiscussionTopic[] {
      return [...topics].sort((a, b) => b[by] - a[by]);
    }

    it('应按热度排名', () => {
      const topics: DiscussionTopic[] = [
        { symbol: 'A', name: '股票A', postCount: 100, participantCount: 50, heatScore: 500 },
        { symbol: 'B', name: '股票B', postCount: 80, participantCount: 40, heatScore: 800 },
      ];
      const result = rankTopics(topics);
      expect(result[0].symbol).toBe('B');
    });
  });

  describe('关键词趋势', () => {
    function extractTrendingKeywords(posts: string[], topN: number = 10): { word: string; count: number }[] {
      const wordCount = new Map<string, number>();
      for (const post of posts) {
        const words = post.replace(/[，。！？、]/g, ' ').split(/\s+/);
        for (const w of words) {
          if (w.length >= 2) {
            wordCount.set(w, (wordCount.get(w) || 0) + 1);
          }
        }
      }
      return Array.from(wordCount.entries())
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, topN);
    }

    it('应提取高频词', () => {
      const posts = ['茅台 白酒', '茅台 消费', '茅台 科技'];
      const keywords = extractTrendingKeywords(posts, 5);
      expect(keywords[0].word).toBe('茅台');
      expect(keywords[0].count).toBe(3);
    });
  });

  describe('评论时间线', () => {
    interface Comment {
      id: string;
      content: string;
      author: string;
      timestamp: number;
      likes: number;
      replyTo?: string;
    }

    function buildTimeline(comments: Comment[], sort: 'time' | 'hot' = 'time'): Comment[] {
      return [...comments].sort((a, b) =>
        sort === 'hot' ? b.likes - a.likes : b.timestamp - a.timestamp
      );
    }

    function buildThread(comments: Comment[], rootId: string): Comment[] {
      const replies = comments.filter(c => c.replyTo === rootId);
      return replies.sort((a, b) => a.timestamp - b.timestamp);
    }

    it('时间排序应最新在前', () => {
      const comments: Comment[] = [
        { id: '1', content: '旧', author: 'A', timestamp: 1000, likes: 10 },
        { id: '2', content: '新', author: 'B', timestamp: 2000, likes: 5 },
      ];
      const result = buildTimeline(comments);
      expect(result[0].content).toBe('新');
    });

    it('热门排序应点赞多的在前', () => {
      const comments: Comment[] = [
        { id: '1', content: 'A', author: 'A', timestamp: 1000, likes: 5 },
        { id: '2', content: 'B', author: 'B', timestamp: 2000, likes: 20 },
      ];
      const result = buildTimeline(comments, 'hot');
      expect(result[0].content).toBe('B');
    });

    it('应正确构建回复线程', () => {
      const comments: Comment[] = [
        { id: '1', content: '主评', author: 'A', timestamp: 1000, likes: 0 },
        { id: '2', content: '回复1', author: 'B', timestamp: 1500, likes: 0, replyTo: '1' },
        { id: '3', content: '回复2', author: 'C', timestamp: 1200, likes: 0, replyTo: '1' },
      ];
      const thread = buildThread(comments, '1');
      expect(thread).toHaveLength(2);
      expect(thread[0].content).toBe('回复2'); // 时间早的在前
    });
  });
});
