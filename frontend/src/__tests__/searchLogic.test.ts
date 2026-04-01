/**
 * 搜索功能逻辑测试
 * 覆盖搜索建议、模糊匹配、搜索历史
 */

import { describe, it, expect } from 'vitest';

describe('搜索功能逻辑', () => {
  describe('股票搜索匹配', () => {
    interface StockItem {
      symbol: string;
      name: string;
      pinyin?: string;
      abbr?: string;
    }

    function searchStocks(query: string, stocks: StockItem[]): StockItem[] {
      if (!query) return [];
      const q = query.toUpperCase();
      return stocks.filter(s =>
        s.symbol.includes(q) ||
        s.name.includes(query) ||
        (s.pinyin && s.pinyin.toUpperCase().includes(q)) ||
        (s.abbr && s.abbr.toUpperCase().includes(q))
      );
    }

    const testStocks: StockItem[] = [
      { symbol: '600519', name: '贵州茅台', pinyin: 'guizhoumaotai', abbr: 'GZMT' },
      { symbol: '000858', name: '五粮液', pinyin: 'wuliangye', abbr: 'WLY' },
      { symbol: '300750', name: '宁德时代', pinyin: 'ningdeshidai', abbr: 'NDSD' },
    ];

    it('按代码搜索', () => {
      expect(searchStocks('600519', testStocks)).toHaveLength(1);
    });

    it('按名称搜索', () => {
      expect(searchStocks('茅台', testStocks)).toHaveLength(1);
    });

    it('按拼音搜索', () => {
      expect(searchStocks('maotai', testStocks)).toHaveLength(1);
    });

    it('按缩写搜索', () => {
      expect(searchStocks('GZMT', testStocks)).toHaveLength(1);
    });

    it('空查询应返回空', () => {
      expect(searchStocks('', testStocks)).toHaveLength(0);
    });
  });

  describe('搜索建议排序', () => {
    interface Suggestion {
      text: string;
      type: 'stock' | 'sector' | 'news';
      score: number;
    }

    function rankSuggestions(suggestions: Suggestion[], query: string): Suggestion[] {
      return [...suggestions].sort((a, b) => {
        // 完全匹配优先
        const aExact = a.text === query ? 1 : 0;
        const bExact = b.text === query ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        // 前缀匹配优先
        const aPrefix = a.text.startsWith(query) ? 1 : 0;
        const bPrefix = b.text.startsWith(query) ? 1 : 0;
        if (aPrefix !== bPrefix) return bPrefix - aPrefix;
        // 按分数排序
        return b.score - a.score;
      });
    }

    it('完全匹配应排第一', () => {
      const suggestions: Suggestion[] = [
        { text: '贵州茅台酒', type: 'stock', score: 80 },
        { text: '贵州茅台', type: 'stock', score: 70 },
      ];
      const ranked = rankSuggestions(suggestions, '贵州茅台');
      expect(ranked[0].text).toBe('贵州茅台');
    });

    it('前缀匹配应优先于包含匹配', () => {
      const suggestions: Suggestion[] = [
        { text: '白酒贵州茅台', type: 'stock', score: 90 },
        { text: '贵州茅台', type: 'stock', score: 70 },
      ];
      const ranked = rankSuggestions(suggestions, '贵州');
      expect(ranked[0].text).toBe('贵州茅台');
    });
  });

  describe('搜索历史管理', () => {
    class SearchHistory {
      private items: string[] = [];
      constructor(private maxItems: number = 20) {}

      add(query: string): void {
        if (!query.trim()) return;
        this.items = [query, ...this.items.filter(q => q !== query)].slice(0, this.maxItems);
      }

      getRecent(limit: number = 10): string[] {
        return this.items.slice(0, limit);
      }

      remove(query: string): void {
        this.items = this.items.filter(q => q !== query);
      }

      clear(): void {
        this.items = [];
      }
    }

    it('应能添加搜索历史', () => {
      const history = new SearchHistory();
      history.add('茅台');
      expect(history.getRecent()).toContain('茅台');
    });

    it('重复搜索应移至最前', () => {
      const history = new SearchHistory();
      history.add('五粮液');
      history.add('茅台');
      history.add('五粮液');
      expect(history.getRecent()[0]).toBe('五粮液');
    });

    it('应限制历史数量', () => {
      const history = new SearchHistory(3);
      for (let i = 0; i < 5; i++) history.add(`query${i}`);
      expect(history.getRecent()).toHaveLength(3);
    });

    it('应能删除历史项', () => {
      const history = new SearchHistory();
      history.add('茅台');
      history.remove('茅台');
      expect(history.getRecent()).not.toContain('茅台');
    });
  });

  describe('热门搜索词', () => {
    function calcHotSearches(searchLogs: { query: string; timestamp: number }[], windowMs: number = 86400000): string[] {
      const now = Date.now();
      const recent = searchLogs.filter(l => now - l.timestamp < windowMs);
      const counts = new Map<string, number>();
      for (const log of recent) {
        counts.set(log.query, (counts.get(log.query) || 0) + 1);
      }
      return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(e => e[0]);
    }

    it('应按频次排序', () => {
      const now = Date.now();
      const logs = [
        { query: '茅台', timestamp: now - 1000 },
        { query: '茅台', timestamp: now - 2000 },
        { query: '五粮液', timestamp: now - 3000 },
      ];
      const hot = calcHotSearches(logs);
      expect(hot[0]).toBe('茅台');
    });
  });
});
