/**
 * 搜索工具 单元测试
 * 覆盖: 拼音匹配、股价搜索匹配、搜索结果排序、搜索历史管理
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getPinyinInitials,
  matchStock,
  searchAndSort,
  getSearchHistory,
  addSearchHistory,
  clearSearchHistory,
} from '../utils/search';

const testStocks = [
  { symbol: '600519', name: '贵州茅台' },
  { symbol: '000858', name: '五粮液' },
  { symbol: '000333', name: '美的集团' },
  { symbol: '002415', name: '海康威视' },
  { symbol: '300750', name: '宁德时代' },
  { symbol: '000001', name: '平安银行' },
  { symbol: '601398', name: '工商银行' },
  { symbol: '600036', name: '招商银行' },
];

describe('getPinyinInitials', () => {
  it('should return correct initials for known stocks', () => {
    expect(getPinyinInitials('贵州茅台')).toBe('gzmt');
    expect(getPinyinInitials('五粮液')).toBe('wly');
    expect(getPinyinInitials('宁德时代')).toBe('ndsd');
    expect(getPinyinInitials('海康威视')).toBe('hkws');
  });

  it('should return empty string for unknown stock name', () => {
    expect(getPinyinInitials('虚构公司')).toBe('');
    expect(getPinyinInitials('')).toBe('');
  });

  it('should handle edge cases', () => {
    // @ts-expect-error testing null input
    expect(getPinyinInitials(null)).toBe('');
    // @ts-expect-error testing undefined input
    expect(getPinyinInitials(undefined)).toBe('');
  });
});

describe('matchStock', () => {
  it('should match exact symbol (score 1000)', () => {
    const result = matchStock('600519', '600519', '贵州茅台');
    expect(result.matched).toBe(true);
    expect(result.score).toBe(1000);
  });

  it('should match symbol prefix (score 900)', () => {
    const result = matchStock('600', '600519', '贵州茅台');
    expect(result.matched).toBe(true);
    expect(result.score).toBe(900);
  });

  it('should match symbol contains (score 800)', () => {
    const result = matchStock('0519', '600519', '贵州茅台');
    expect(result.matched).toBe(true);
    expect(result.score).toBe(800);
  });

  it('should match exact name (score 700)', () => {
    const result = matchStock('贵州茅台', '600519', '贵州茅台');
    expect(result.matched).toBe(true);
    expect(result.score).toBe(700);
  });

  it('should match name prefix (score 600)', () => {
    const result = matchStock('贵州', '600519', '贵州茅台');
    expect(result.matched).toBe(true);
    expect(result.score).toBe(600);
  });

  it('should match name contains (score 500)', () => {
    const result = matchStock('茅台', '600519', '贵州茅台');
    expect(result.matched).toBe(true);
    expect(result.score).toBe(500);
  });

  it('should match pinyin initials (score 400)', () => {
    const result = matchStock('gzmt', '600519', '贵州茅台');
    expect(result.matched).toBe(true);
    expect(result.score).toBe(400);
  });

  it('should match partial pinyin', () => {
    const result = matchStock('gz', '600519', '贵州茅台');
    expect(result.matched).toBe(true);
    expect(result.score).toBe(400);
  });

  it('should match fuzzy name characters (score 300)', () => {
    const result = matchStock('贵台', '600519', '贵州茅台');
    expect(result.matched).toBe(true);
    expect(result.score).toBe(300);
  });

  it('should not match garbled query', () => {
    const result = matchStock('xyzxyz', '600519', '贵州茅台');
    expect(result.matched).toBe(false);
    expect(result.score).toBe(0);
  });

  it('should return matched=true with score 0 for empty query', () => {
    const result = matchStock('', '600519', '贵州茅台');
    expect(result.matched).toBe(true);
    expect(result.score).toBe(0);
  });

  it('should be case-insensitive for symbol', () => {
    const result = matchStock('600519', '600519', '贵州茅台');
    expect(result.matched).toBe(true);
  });

  it('should be case-insensitive for pinyin', () => {
    expect(matchStock('GZMT', '600519', '贵州茅台').matched).toBe(true);
    expect(matchStock('GzMt', '600519', '贵州茅台').matched).toBe(true);
  });

  it('should prioritize exact symbol over name matches', () => {
    const symbolResult = matchStock('000001', '000001', '平安银行');
    expect(symbolResult.score).toBe(1000);
  });
});

describe('searchAndSort', () => {
  it('should return all stocks for empty query', () => {
    const results = searchAndSort(testStocks, '');
    expect(results).toHaveLength(testStocks.length);
  });

  it('should find stock by symbol exact match', () => {
    const results = searchAndSort(testStocks, '600519');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('贵州茅台');
  });

  it('should find stock by name', () => {
    const results = searchAndSort(testStocks, '宁德时代');
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe('300750');
  });

  it('should find stock by pinyin initials', () => {
    const results = searchAndSort(testStocks, 'ndsd');
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe('300750');
  });

  it('should find stock by partial pinyin', () => {
    const results = searchAndSort(testStocks, 'wly');
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe('000858');
  });

  it('should sort by score descending', () => {
    // '600' matches 600519 (prefix) and 600036 (prefix) and may match others via name
    const results = searchAndSort(testStocks, '600');
    expect(results.length).toBeGreaterThanOrEqual(2);
    // First should be highest score
    for (let i = 1; i < results.length; i++) {
      const prevScore = matchStock('600', results[i - 1].symbol, results[i - 1].name).score;
      const currScore = matchStock('600', results[i].symbol, results[i].name).score;
      expect(prevScore).toBeGreaterThanOrEqual(currScore);
    }
  });

  it('should return empty array for no match', () => {
    const results = searchAndSort(testStocks, '$$$no_match$$$');
    expect(results).toHaveLength(0);
  });

  it('should handle mixed pinyin and name matches', () => {
    // 'bank' doesn't match any pinyin directly
    const results = searchAndSort(testStocks, 'payh');
    expect(results.length).toBeGreaterThanOrEqual(1);
    const names = results.map(s => s.name);
    expect(names).toContain('平安银行');
  });
});

describe('search history management', () => {
  const testUserId = 999;

  beforeEach(() => {
    clearSearchHistory(testUserId);
  });

  it('should start with empty history', () => {
    const history = getSearchHistory(testUserId);
    expect(history).toEqual([]);
  });

  it('should add items to history', () => {
    addSearchHistory(testUserId, { query: '茅台', symbol: '600519', name: '贵州茅台' });
    const history = getSearchHistory(testUserId);
    expect(history).toHaveLength(1);
    expect(history[0].query).toBe('茅台');
  });

  it('should maintain max history limit', () => {
    for (let i = 0; i < 30; i++) {
      addSearchHistory(testUserId, { query: `query${i}`, symbol: `${i}`, name: `Stock ${i}` });
    }
    const history = getSearchHistory(testUserId);
    expect(history.length).toBeLessThanOrEqual(20);
  });

  it('should deduplicate by query', () => {
    addSearchHistory(testUserId, { query: '茅台', symbol: '600519', name: '贵州茅台' });
    addSearchHistory(testUserId, { query: '茅台', symbol: '600519', name: '贵州茅台' });
    const history = getSearchHistory(testUserId);
    expect(history).toHaveLength(1);
  });

  it('should keep most recent first', () => {
    addSearchHistory(testUserId, { query: 'first', symbol: '001', name: 'First' });
    addSearchHistory(testUserId, { query: 'second', symbol: '002', name: 'Second' });
    const history = getSearchHistory(testUserId);
    expect(history[0].query).toBe('second');
    expect(history[1].query).toBe('first');
  });

  it('should clear all history for user', () => {
    addSearchHistory(testUserId, { query: 'test' });
    clearSearchHistory(testUserId);
    expect(getSearchHistory(testUserId)).toEqual([]);
  });

  it('should isolate history between users', () => {
    addSearchHistory(1, { query: '茅台' });
    addSearchHistory(2, { query: '宁德时代' });
    expect(getSearchHistory(1).map(h => h.query)).toContain('茅台');
    expect(getSearchHistory(2).map(h => h.query)).not.toContain('茅台');
    expect(getSearchHistory(2).map(h => h.query)).toContain('宁德时代');
  });
});
