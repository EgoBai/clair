import { describe, it, expect } from 'vitest';

/**
 * 全局搜索组件逻辑测试
 * GlobalSearch 搜索建议/过滤/高亮逻辑
 */

interface SearchItem {
  id: string;
  code: string;
  name: string;
  pinyin?: string;
  abbr?: string;
  type: 'stock' | 'fund' | 'index' | 'bond';
  market: 'sh' | 'sz' | 'bj';
}

interface SearchResult {
  item: SearchItem;
  score: number;
  matchedField: string;
  highlight: string;
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, '');
}

function matchByCode(items: SearchItem[], code: string): SearchItem[] {
  const normalized = normalizeQuery(code);
  return items.filter(item =>
    item.code.toLowerCase().includes(normalized)
  );
}

function matchByName(items: SearchItem[], name: string): SearchItem[] {
  const normalized = normalizeQuery(name);
  return items.filter(item =>
    item.name.toLowerCase().includes(normalized)
  );
}

function matchByPinyin(items: SearchItem[], pinyin: string): SearchItem[] {
  const normalized = normalizeQuery(pinyin);
  return items.filter(item =>
    item.pinyin?.toLowerCase().includes(normalized) ||
    item.abbr?.toLowerCase().includes(normalized)
  );
}

function scoreMatch(item: SearchItem, query: string): number {
  const q = normalizeQuery(query);
  let score = 0;

  // Exact code match = highest score
  if (item.code.toLowerCase() === q) score += 100;
  else if (item.code.toLowerCase().startsWith(q)) score += 80;
  else if (item.code.toLowerCase().includes(q)) score += 60;

  // Name match
  if (item.name === query) score += 90;
  else if (item.name.includes(query)) score += 70;

  // Pinyin match
  if (item.pinyin?.toLowerCase() === q) score += 50;
  else if (item.abbr?.toLowerCase() === q) score += 50;
  else if (item.pinyin?.toLowerCase().includes(q)) score += 30;
  else if (item.abbr?.toLowerCase().includes(q)) score += 30;

  return score;
}

function highlightMatch(text: string, query: string): string {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return text.slice(0, idx) + '**' + text.slice(idx, idx + query.length) + '**' + text.slice(idx + query.length);
}

function searchItems(items: SearchItem[], query: string, limit = 10): SearchResult[] {
  if (!query.trim()) return [];

  const results: SearchResult[] = [];
  for (const item of items) {
    const score = scoreMatch(item, query);
    if (score > 0) {
      const matchedField = item.code.includes(query) ? 'code' :
        item.name.includes(query) ? 'name' : 'pinyin';
      results.push({
        item,
        score,
        matchedField,
        highlight: highlightMatch(item.name, query),
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

function groupResultsByType(results: SearchResult[]): Record<string, SearchResult[]> {
  const groups: Record<string, SearchResult[]> = {};
  for (const r of results) {
    const type = r.item.type;
    if (!groups[type]) groups[type] = [];
    groups[type].push(r);
  }
  return groups;
}

function buildRecentSearchKey(userId: string): string {
  return `recent_search:${userId}`;
}

function addToRecentSearches(recent: string[], query: string, maxItems = 10): string[] {
  const filtered = recent.filter(q => q !== query);
  return [query, ...filtered].slice(0, maxItems);
}

function filterByMarket(items: SearchItem[], market?: 'sh' | 'sz' | 'bj'): SearchItem[] {
  if (!market) return items;
  return items.filter(item => item.market === market);
}

function filterByType(items: SearchItem[], type?: SearchItem['type']): SearchItem[] {
  if (!type) return items;
  return items.filter(item => item.type === type);
}

function debounceSearch(fn: Function, delay: number): { run: Function; cancel: Function } {
  let timer: any = null;
  return {
    run: (...args: any[]) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    },
    cancel: () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

describe('全局搜索逻辑', () => {
  const mockItems: SearchItem[] = [
    { id: '1', code: '600519', name: '贵州茅台', pinyin: 'guizhoumaotai', abbr: 'gzmt', type: 'stock', market: 'sh' },
    { id: '2', code: '000858', name: '五粮液', pinyin: 'wuliangye', abbr: 'wly', type: 'stock', market: 'sz' },
    { id: '3', code: '000001', name: '上证指数', pinyin: 'shangzhengzhishu', abbr: 'szzs', type: 'index', market: 'sh' },
    { id: '4', code: '300750', name: '宁德时代', pinyin: 'ningdeshidai', abbr: 'ndsd', type: 'stock', market: 'sz' },
    { id: '5', code: '159915', name: '创业板ETF', pinyin: 'chuangyebanETF', abbr: 'cyb', type: 'fund', market: 'sz' },
  ];

  describe('normalizeQuery', () => {
    it('should trim and lowercase', () => {
      expect(normalizeQuery('  GUIZHOU  ')).toBe('guizhou');
    });

    it('should remove spaces', () => {
      expect(normalizeQuery('gui zhou')).toBe('guizhou');
    });
  });

  describe('matchByCode', () => {
    it('should find by code prefix', () => {
      expect(matchByCode(mockItems, '600')).toHaveLength(1);
      expect(matchByCode(mockItems, '600')[0].code).toBe('600519');
    });

    it('should find by code substring', () => {
      expect(matchByCode(mockItems, '0858')).toHaveLength(1);
    });

    it('should return empty for no match', () => {
      expect(matchByCode(mockItems, '999999')).toHaveLength(0);
    });
  });

  describe('matchByName', () => {
    it('should find by name substring', () => {
      expect(matchByName(mockItems, '茅台')).toHaveLength(1);
    });

    it('should find multiple matches', () => {
      const results = matchByName(mockItems, '指数');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('matchByPinyin', () => {
    it('should find by pinyin', () => {
      expect(matchByPinyin(mockItems, 'maotai')).toHaveLength(1);
    });

    it('should find by abbreviation', () => {
      expect(matchByPinyin(mockItems, 'gzmt')).toHaveLength(1);
    });
  });

  describe('scoreMatch', () => {
    it('should score exact code match highest', () => {
      expect(scoreMatch(mockItems[0], '600519')).toBeGreaterThanOrEqual(100);
    });

    it('should score code prefix high', () => {
      expect(scoreMatch(mockItems[0], '600')).toBeGreaterThanOrEqual(60);
    });

    it('should return 0 for no match', () => {
      expect(scoreMatch(mockItems[0], 'zzzzz')).toBe(0);
    });
  });

  describe('highlightMatch', () => {
    it('should wrap match in markers', () => {
      expect(highlightMatch('贵州茅台', '茅台')).toBe('贵州**茅台**');
    });

    it('should handle case insensitive', () => {
      expect(highlightMatch('ABCdef', 'bcd')).toBe('A**BCd**ef');
    });

    it('should return original when no match', () => {
      expect(highlightMatch('贵州茅台', '五粮液')).toBe('贵州茅台');
    });

    it('should handle empty query', () => {
      expect(highlightMatch('贵州茅台', '')).toBe('贵州茅台');
    });
  });

  describe('searchItems', () => {
    it('should return scored results', () => {
      const results = searchItems(mockItems, '茅台');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].item.name).toBe('贵州茅台');
    });

    it('should limit results', () => {
      const results = searchItems(mockItems, '0', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should return empty for empty query', () => {
      expect(searchItems(mockItems, '')).toHaveLength(0);
    });
  });

  describe('groupResultsByType', () => {
    it('should group by type', () => {
      const results = searchItems(mockItems, '0');
      const groups = groupResultsByType(results);
      for (const type of Object.keys(groups)) {
        expect(groups[type].every(r => r.item.type === type)).toBe(true);
      }
    });
  });

  describe('buildRecentSearchKey', () => {
    it('should generate namespaced key', () => {
      expect(buildRecentSearchKey('user123')).toBe('recent_search:user123');
    });
  });

  describe('addToRecentSearches', () => {
    it('should prepend new search', () => {
      const result = addToRecentSearches(['a', 'b'], 'c');
      expect(result[0]).toBe('c');
      expect(result).toHaveLength(3);
    });

    it('should deduplicate', () => {
      const result = addToRecentSearches(['a', 'b', 'a'], 'a');
      expect(result.filter(q => q === 'a')).toHaveLength(1);
      expect(result[0]).toBe('a');
    });

    it('should respect max limit', () => {
      const recent = Array.from({ length: 10 }, (_, i) => `q${i}`);
      const result = addToRecentSearches(recent, 'new');
      expect(result).toHaveLength(10);
      expect(result[0]).toBe('new');
    });
  });

  describe('filterByMarket', () => {
    it('should filter by market', () => {
      expect(filterByMarket(mockItems, 'sh')).toHaveLength(2);
      expect(filterByMarket(mockItems, 'sz')).toHaveLength(3);
    });

    it('should return all without filter', () => {
      expect(filterByMarket(mockItems)).toHaveLength(5);
    });
  });

  describe('filterByType', () => {
    it('should filter by type', () => {
      expect(filterByType(mockItems, 'stock')).toHaveLength(3);
      expect(filterByType(mockItems, 'index')).toHaveLength(1);
      expect(filterByType(mockItems, 'fund')).toHaveLength(1);
    });

    it('should return all without filter', () => {
      expect(filterByType(mockItems)).toHaveLength(5);
    });
  });
});
