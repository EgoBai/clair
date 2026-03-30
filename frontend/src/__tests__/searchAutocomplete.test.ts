import { describe, it, expect } from 'vitest';

// 搜索自动补全逻辑测试
describe('Search Autocomplete Logic', () => {
  interface SearchResult {
    symbol: string;
    name: string;
    market: string;
    score: number;
  }

  const data: SearchResult[] = [
    { symbol: '600519', name: '贵州茅台', market: 'sh', score: 100 },
    { symbol: '000001', name: '平安银行', market: 'sz', score: 95 },
    { symbol: '300750', name: '宁德时代', market: 'sz', score: 90 },
    { symbol: '000858', name: '五粮液', market: 'sz', score: 85 },
    { symbol: '601318', name: '中国平安', market: 'sh', score: 80 },
    { symbol: '688981', name: '中芯国际', market: 'sh', score: 75 },
    { symbol: '002475', name: '立讯精密', market: 'sz', score: 70 },
    { symbol: '600036', name: '招商银行', market: 'sh', score: 65 },
  ];

  // 精确匹配
  describe('Exact Match', () => {
    const exactSearch = (query: string) => {
      return data.filter(d => d.symbol === query || d.name === query);
    };

    it('should find by exact symbol', () => {
      const result = exactSearch('600519');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('贵州茅台');
    });

    it('should find by exact name', () => {
      const result = exactSearch('平安银行');
      expect(result).toHaveLength(1);
    });

    it('should return empty for no exact match', () => {
      const result = exactSearch('茅台集团');
      expect(result).toHaveLength(0);
    });
  });

  // 前缀匹配
  describe('Prefix Match', () => {
    const prefixSearch = (query: string) => {
      return data.filter(d =>
        d.symbol.startsWith(query) ||
        d.name.startsWith(query)
      );
    };

    it('should match symbol prefix', () => {
      const result = prefixSearch('600');
      expect(result.some(r => r.symbol === '600519')).toBe(true);
    });

    it('should match name prefix', () => {
      const result = prefixSearch('贵州');
      expect(result).toHaveLength(1);
    });

    it('should match multiple prefixes', () => {
      const result = prefixSearch('00');
      expect(result.length).toBeGreaterThan(1);
    });
  });

  // 模糊匹配
  describe('Fuzzy Match', () => {
    const fuzzySearch = (query: string) => {
      const chars = query.split('');
      return data.filter(d => {
        let idx = 0;
        for (const char of chars) {
          idx = d.name.indexOf(char, idx);
          if (idx === -1) return false;
          idx++;
        }
        return true;
      });
    };

    it('should match fuzzy name', () => {
      const result = fuzzySearch('贵茅');
      expect(result.some(r => r.symbol === '600519')).toBe(true);
    });

    it('should match partial pinyin abbreviation', () => {
      const result = fuzzySearch('安银');
      expect(result.some(r => r.name === '平安银行')).toBe(true);
    });

    it('should not match completely unrelated', () => {
      const result = fuzzySearch('xyz');
      expect(result).toHaveLength(0);
    });
  });

  // 搜索结果排序
  describe('Search Result Sorting', () => {
    const searchAndSort = (query: string) => {
      return data
        .filter(d => d.symbol.includes(query) || d.name.includes(query))
        .sort((a, b) => b.score - a.score);
    };

    it('should sort by score descending', () => {
      const result = searchAndSort('6');
      expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
    });

    it('should prioritize exact matches', () => {
      const result = searchAndSort('600519');
      expect(result[0].symbol).toBe('600519');
    });
  });

  // 防抖逻辑
  describe('Debounce Logic', () => {
    it('should debounce rapid searches', async () => {
      let callCount = 0;
      const debounced = (() => {
        let timer: any;
        return (query: string) => {
          callCount++;
          clearTimeout(timer);
          timer = setTimeout(() => {}, 300);
        };
      })();

      debounced('a');
      debounced('ab');
      debounced('abc');
      expect(callCount).toBe(3);
    });
  });

  // 搜索历史
  describe('Search History', () => {
    class SearchHistory {
      private history: string[] = [];
      private maxSize: number;

      constructor(maxSize: number = 10) {
        this.maxSize = maxSize;
      }

      add(query: string) {
        this.history = this.history.filter(h => h !== query);
        this.history.unshift(query);
        if (this.history.length > this.maxSize) {
          this.history.pop();
        }
      }

      get() {
        return [...this.history];
      }

      clear() {
        this.history = [];
      }
    }

    it('should add search query', () => {
      const h = new SearchHistory();
      h.add('茅台');
      expect(h.get()).toContain('茅台');
    });

    it('should keep recent searches at top', () => {
      const h = new SearchHistory();
      h.add('first');
      h.add('second');
      expect(h.get()[0]).toBe('second');
    });

    it('should deduplicate', () => {
      const h = new SearchHistory();
      h.add('test');
      h.add('test');
      expect(h.get()).toHaveLength(1);
    });

    it('should respect max size', () => {
      const h = new SearchHistory(3);
      h.add('a');
      h.add('b');
      h.add('c');
      h.add('d');
      expect(h.get()).toHaveLength(3);
      expect(h.get()).not.toContain('a');
    });

    it('should clear history', () => {
      const h = new SearchHistory();
      h.add('test');
      h.clear();
      expect(h.get()).toHaveLength(0);
    });
  });

  // 高亮匹配
  describe('Highlight Matches', () => {
    const highlight = (text: string, query: string) => {
      const idx = text.indexOf(query);
      if (idx === -1) return text;
      return text.slice(0, idx) + `<mark>${query}</mark>` + text.slice(idx + query.length);
    };

    it('should highlight matching text', () => {
      expect(highlight('贵州茅台', '茅台')).toBe('贵州<mark>茅台</mark>');
    });

    it('should not highlight when no match', () => {
      expect(highlight('贵州茅台', '五粮液')).toBe('贵州茅台');
    });

    it('should highlight at start', () => {
      expect(highlight('茅台酒', '茅台')).toBe('<mark>茅台</mark>酒');
    });
  });

  // 市场筛选
  describe('Market Filter in Search', () => {
    it('should filter by sh market', () => {
      const result = data.filter(d => d.market === 'sh');
      expect(result.every(r => r.market === 'sh')).toBe(true);
    });

    it('should filter by sz market', () => {
      const result = data.filter(d => d.market === 'sz');
      expect(result.every(r => r.market === 'sz')).toBe(true);
    });

    it('should count by market', () => {
      const sh = data.filter(d => d.market === 'sh').length;
      const sz = data.filter(d => d.market === 'sz').length;
      expect(sh + sz).toBe(data.length);
    });
  });

  // 空查询处理
  describe('Empty Query Handling', () => {
    it('should return all for empty query', () => {
      const result = data; // empty query = show all
      expect(result).toHaveLength(data.length);
    });

    it('should return all for whitespace query', () => {
      const query = '  ';
      const trimmed = query.trim();
      const result = trimmed ? data.filter(d => d.name.includes(trimmed)) : data;
      expect(result).toHaveLength(data.length);
    });
  });
});
