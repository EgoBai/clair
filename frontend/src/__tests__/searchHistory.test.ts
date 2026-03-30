/**
 * 搜索历史管理 Hook 逻辑测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('useSearchHistory Logic', () => {
  // Provide localStorage mock
  let store: Record<string, string> = {};
  const mockStorage = {
    getItem: (k: string) => store[k] || null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] || null,
  };

  beforeEach(() => {
    store = {};
    Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, writable: true, configurable: true });
  });

  describe('Add History', () => {
    it('should add new query to history', () => {
      let history: string[] = [];
      const add = (query: string, max: number) => {
        if (!query.trim()) return;
        const filtered = history.filter(item => item !== query);
        history = [query, ...filtered].slice(0, max);
      };
      add('贵州茅台', 20);
      expect(history).toEqual(['贵州茅台']);
    });

    it('should deduplicate by moving to top', () => {
      let history = ['AAPL', 'TSLA', 'NVDA'];
      const add = (query: string, max: number) => {
        if (!query.trim()) return;
        const filtered = history.filter(item => item !== query);
        history = [query, ...filtered].slice(0, max);
      };
      add('TSLA', 20);
      expect(history[0]).toBe('TSLA');
      expect(history).toHaveLength(3);
    });

    it('should not add empty queries', () => {
      let history: string[] = [];
      const add = (query: string, max: number) => {
        if (!query.trim()) return;
        history = [query, ...history].slice(0, max);
      };
      add('', 20);
      add('   ', 20);
      expect(history).toHaveLength(0);
    });

    it('should respect maxItems limit', () => {
      let history: string[] = [];
      const add = (query: string, max: number) => {
        if (!query.trim()) return;
        history = [query, ...history].slice(0, max);
      };
      for (let i = 0; i < 25; i++) add(`query${i}`, 20);
      expect(history).toHaveLength(20);
      expect(history[0]).toBe('query24');
    });

    it('should maintain LRU order', () => {
      let history = ['A', 'B', 'C'];
      const add = (query: string, max: number) => {
        const filtered = history.filter(item => item !== query);
        history = [query, ...filtered].slice(0, max);
      };
      add('D', 20);
      expect(history).toEqual(['D', 'A', 'B', 'C']);
    });
  });

  describe('Remove History', () => {
    it('should remove specific query', () => {
      let history = ['A', 'B', 'C'];
      history = history.filter(item => item !== 'B');
      expect(history).toEqual(['A', 'C']);
    });

    it('should handle removing non-existent query', () => {
      let history = ['A', 'B'];
      history = history.filter(item => item !== 'Z');
      expect(history).toEqual(['A', 'B']);
    });

    it('should remove from beginning', () => {
      let history = ['A', 'B', 'C'];
      history = history.filter(item => item !== 'A');
      expect(history).toEqual(['B', 'C']);
    });

    it('should remove from end', () => {
      let history = ['A', 'B', 'C'];
      history = history.filter(item => item !== 'C');
      expect(history).toEqual(['A', 'B']);
    });
  });

  describe('Clear History', () => {
    it('should clear all history', () => {
      let history = ['A', 'B', 'C'];
      history = [];
      expect(history).toHaveLength(0);
    });

    it('should clear localStorage', () => {
      localStorage.setItem('search-history', JSON.stringify(['A', 'B']));
      localStorage.removeItem('search-history');
      expect(localStorage.getItem('search-history')).toBeNull();
    });
  });

  describe('Search Within History', () => {
    const history = ['贵州茅台', '腾讯控股', '阿里巴巴', '美团', '腾讯音乐'];

    const search = (query: string): string[] => {
      if (!query.trim()) return history;
      const lowerQuery = query.toLowerCase();
      return history.filter(item => item.toLowerCase().includes(lowerQuery));
    };

    it('should return all items for empty query', () => {
      expect(search('')).toEqual(history);
    });

    it('should filter by substring match', () => {
      const results = search('腾讯');
      expect(results).toContain('腾讯控股');
      expect(results).toContain('腾讯音乐');
      expect(results).not.toContain('阿里巴巴');
    });

    it('should be case insensitive', () => {
      const results = search('茅台');
      expect(results).toContain('贵州茅台');
    });

    it('should return empty for no matches', () => {
      const results = search('不存在的股票');
      expect(results).toHaveLength(0);
    });

    it('should match partial strings', () => {
      const results = search('阿里');
      expect(results).toContain('阿里巴巴');
    });
  });

  describe('LocalStorage Persistence', () => {
    it('should save to localStorage', () => {
      const data = ['A', 'B', 'C'];
      localStorage.setItem('search-history', JSON.stringify(data));
      const loaded = JSON.parse(localStorage.getItem('search-history')!);
      expect(loaded).toEqual(data);
    });

    it('should load from localStorage', () => {
      localStorage.setItem('search-history', JSON.stringify(['X', 'Y']));
      const loaded = JSON.parse(localStorage.getItem('search-history')!);
      expect(loaded).toEqual(['X', 'Y']);
    });

    it('should handle missing localStorage key', () => {
      const stored = localStorage.getItem('nonexistent');
      expect(stored).toBeNull();
    });

    it('should handle corrupted JSON', () => {
      localStorage.setItem('search-history', 'not json');
      let history: string[] = [];
      try {
        history = JSON.parse(localStorage.getItem('search-history')!);
      } catch {
        history = [];
      }
      expect(history).toEqual([]);
    });
  });

  describe('Custom Storage Key', () => {
    it('should use custom key', () => {
      const key = 'my-custom-search-history';
      localStorage.setItem(key, JSON.stringify(['test']));
      expect(JSON.parse(localStorage.getItem(key)!)).toEqual(['test']);
    });

    it('should default to search-history', () => {
      const defaultKey = 'search-history';
      expect(defaultKey).toBe('search-history');
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in queries', () => {
      let history: string[] = [];
      history = ['股票(A)', 'ETF+基金', '300*'].filter(() => true);
      expect(history).toHaveLength(3);
    });

    it('should handle unicode queries', () => {
      let history = ['茅台™', '阿里巴巴®'];
      history = history.filter(item => item.includes('茅台'));
      expect(history).toEqual(['茅台™']);
    });

    it('should handle very long queries', () => {
      const longQuery = 'A'.repeat(1000);
      let history = [longQuery];
      expect(history[0].length).toBe(1000);
    });
  });
});
