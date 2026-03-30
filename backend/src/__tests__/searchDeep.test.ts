import { describe, it, expect, vi, beforeEach } from 'vitest';

// ==================== 搜索工具逻辑测试 ====================

describe('search - stock matching algorithm', () => {
  function matchStock(query: string, symbol: string, name: string): { matched: boolean; score: number } {
    const q = query.toLowerCase().trim();
    if (!q) return { matched: true, score: 0 };

    const sym = symbol.toLowerCase();
    const nm = name.toLowerCase();

    if (sym === q) return { matched: true, score: 1000 };
    if (sym.startsWith(q)) return { matched: true, score: 900 };
    if (sym.includes(q)) return { matched: true, score: 800 };
    if (nm === q) return { matched: true, score: 700 };
    if (nm.startsWith(q)) return { matched: true, score: 600 };
    if (nm.includes(q)) return { matched: true, score: 500 };

    return { matched: false, score: 0 };
  }

  // 代码精确匹配
  it('exact code match should score 1000', () => {
    const result = matchStock('600519', '600519', '贵州茅台');
    expect(result.matched).toBe(true);
    expect(result.score).toBe(1000);
  });

  // 代码前缀匹配
  it('code prefix match should score 900', () => {
    const result = matchStock('600', '600519', '贵州茅台');
    expect(result.matched).toBe(true);
    expect(result.score).toBe(900);
  });

  // 代码包含匹配
  it('code contains match should score 800', () => {
    const result = matchStock('051', '600519', '贵州茅台');
    expect(result.matched).toBe(true);
    expect(result.score).toBe(800);
  });

  // 名称精确匹配
  it('exact name match should score 700', () => {
    const result = matchStock('贵州茅台', '600519', '贵州茅台');
    expect(result.matched).toBe(true);
    expect(result.score).toBe(700);
  });

  // 名称前缀匹配
  it('name prefix match should score 600', () => {
    const result = matchStock('贵州', '600519', '贵州茅台');
    expect(result.matched).toBe(true);
    expect(result.score).toBe(600);
  });

  // 名称包含匹配
  it('name contains match should score 500', () => {
    const result = matchStock('茅台', '600519', '贵州茅台');
    expect(result.matched).toBe(true);
    expect(result.score).toBe(500);
  });

  // 无匹配
  it('no match should return false', () => {
    const result = matchStock('xyz', '600519', '贵州茅台');
    expect(result.matched).toBe(false);
  });

  // 空查询
  it('empty query should match all with score 0', () => {
    const result = matchStock('', '600519', '贵州茅台');
    expect(result.matched).toBe(true);
    expect(result.score).toBe(0);
  });

  // 大小写不敏感
  it('should be case insensitive for codes', () => {
    const result = matchStock('SH600', 'SH600519', '贵州茅台');
    expect(result.matched).toBe(true);
  });

  // 空白字符
  it('should trim whitespace', () => {
    const result = matchStock('  600519  ', '600519', '贵州茅台');
    expect(result.matched).toBe(true);
    expect(result.score).toBe(1000);
  });

  // 边界情况
  it('single char query should work', () => {
    const result = matchStock('6', '600519', '贵州茅台');
    expect(result.matched).toBe(true);
    expect(result.score).toBe(900);
  });

  it('longer query than code should not match prefix', () => {
    const result = matchStock('600519999', '600519', '贵州茅台');
    expect(result.matched).toBe(false);
  });

  it('query matching middle of code should score 800', () => {
    const result = matchStock('519', '600519', '贵州茅台');
    expect(result.matched).toBe(true);
    expect(result.score).toBe(800);
  });
});

describe('search - query sanitization', () => {
  function sanitizeQuery(input: string): string {
    return input
      .trim()
      .replace(/[<>\"'&]/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 100);
  }

  it('should trim whitespace', () => {
    expect(sanitizeQuery('  test  ')).toBe('test');
  });

  it('should remove HTML special chars', () => {
    expect(sanitizeQuery('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
  });

  it('should collapse multiple spaces', () => {
    expect(sanitizeQuery('a   b   c')).toBe('a b c');
  });

  it('should limit length to 100', () => {
    const longInput = 'a'.repeat(200);
    expect(sanitizeQuery(longInput).length).toBeLessThanOrEqual(100);
  });

  it('should remove quotes', () => {
    expect(sanitizeQuery('"test" \'value\'')).toBe('test value');
  });

  it('should remove ampersands', () => {
    expect(sanitizeQuery('a&b&c')).toBe('abc');
  });

  it('should handle empty input', () => {
    expect(sanitizeQuery('')).toBe('');
  });

  it('should handle unicode', () => {
    expect(sanitizeQuery('你好世界')).toBe('你好世界');
  });

  it('should handle numbers', () => {
    expect(sanitizeQuery('600519')).toBe('600519');
  });
});

describe('search - result ranking', () => {
  interface SearchResult {
    symbol: string;
    name: string;
    score: number;
  }

  function sortByScore(results: SearchResult[]): SearchResult[] {
    return [...results].sort((a, b) => b.score - a.score);
  }

  it('should sort by score descending', () => {
    const results: SearchResult[] = [
      { symbol: '001', name: 'A', score: 500 },
      { symbol: '002', name: 'B', score: 1000 },
      { symbol: '003', name: 'C', score: 800 },
    ];
    const sorted = sortByScore(results);
    expect(sorted[0].score).toBe(1000);
    expect(sorted[1].score).toBe(800);
    expect(sorted[2].score).toBe(500);
  });

  it('should not mutate original array', () => {
    const results: SearchResult[] = [
      { symbol: '001', name: 'A', score: 500 },
      { symbol: '002', name: 'B', score: 1000 },
    ];
    const sorted = sortByScore(results);
    expect(results[0].score).toBe(500);
    expect(sorted[0].score).toBe(1000);
  });

  it('should handle empty results', () => {
    expect(sortByScore([])).toEqual([]);
  });

  it('should handle single result', () => {
    const results = [{ symbol: '001', name: 'A', score: 500 }];
    expect(sortByScore(results)).toEqual(results);
  });

  it('should handle equal scores', () => {
    const results: SearchResult[] = [
      { symbol: '001', name: 'A', score: 500 },
      { symbol: '002', name: 'B', score: 500 },
    ];
    const sorted = sortByScore(results);
    expect(sorted.length).toBe(2);
  });
});

describe('search - debounce logic', () => {
  function createDebouncedSearch(delay: number) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastQuery = '';

    return {
      search: (query: string): Promise<string> => {
        return new Promise((resolve) => {
          if (timer) clearTimeout(timer);
          lastQuery = query;
          timer = setTimeout(() => {
            resolve(lastQuery);
          }, delay);
        });
      },
      cancel: () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      getLastQuery: () => lastQuery,
    };
  }

  it('should track last query', () => {
    const searcher = createDebouncedSearch(300);
    searcher.search('test');
    expect(searcher.getLastQuery()).toBe('test');
  });

  it('cancel should prevent resolution', async () => {
    vi.useFakeTimers();
    const searcher = createDebouncedSearch(300);
    let resolved = false;
    searcher.search('test').then(() => { resolved = true; });
    searcher.cancel();
    vi.advanceTimersByTime(400);
    expect(resolved).toBe(false);
    vi.useRealTimers();
  });

  it('should replace pending query', () => {
    const searcher = createDebouncedSearch(300);
    searcher.search('first');
    searcher.search('second');
    expect(searcher.getLastQuery()).toBe('second');
  });
});

describe('search - input validation', () => {
  function isValidSearchInput(input: string): { valid: boolean; reason?: string } {
    if (input.length === 0) return { valid: false, reason: 'empty' };
    if (input.length > 100) return { valid: false, reason: 'too_long' };
    if (/^[<>\"'&]/.test(input)) return { valid: false, reason: 'invalid_chars' };
    return { valid: true };
  }

  it('should reject empty input', () => {
    expect(isValidSearchInput('').valid).toBe(false);
  });

  it('should accept normal input', () => {
    expect(isValidSearchInput('贵州茅台').valid).toBe(true);
  });

  it('should reject very long input', () => {
    expect(isValidSearchInput('a'.repeat(101)).valid).toBe(false);
  });

  it('should reject input starting with <', () => {
    expect(isValidSearchInput('<script>').valid).toBe(false);
  });

  it('should accept input starting with number', () => {
    expect(isValidSearchInput('600519').valid).toBe(true);
  });

  it('should accept max length input', () => {
    expect(isValidSearchInput('a'.repeat(100)).valid).toBe(true);
  });

  it('should accept single char', () => {
    expect(isValidSearchInput('a').valid).toBe(true);
  });
});
