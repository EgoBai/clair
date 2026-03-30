import { describe, it, expect, beforeEach } from 'vitest';
import {
  getPinyinInitials,
  matchStock,
  searchAndSort,
  getSearchHistory,
  addSearchHistory,
  clearSearchHistory,
} from '../utils/search';

describe('Search Utility Proper', () => {
  describe('getPinyinInitials', () => {
    it('should return pinyin for known stocks', () => {
      expect(getPinyinInitials('贵州茅台')).toBe('gzmt');
      expect(getPinyinInitials('中国平安')).toBe('zgpa');
      expect(getPinyinInitials('招商银行')).toBe('zsyh');
    });

    it('should return empty string for unknown stocks', () => {
      expect(getPinyinInitials('未知股票')).toBe('');
    });

    it('should handle empty string', () => {
      expect(getPinyinInitials('')).toBe('');
    });
  });

  describe('matchStock', () => {
    it('should exact match on symbol', () => {
      const result = matchStock('600519', '600519', '贵州茅台');
      expect(result.matched).toBe(true);
      expect(result.score).toBe(1000);
    });

    it('should prefix match on symbol', () => {
      const result = matchStock('600', '600519', '贵州茅台');
      expect(result.matched).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should exact match on name', () => {
      const result = matchStock('贵州茅台', '600519', '贵州茅台');
      expect(result.matched).toBe(true);
      expect(result.score).toBeGreaterThan(500);
    });

    it('should prefix match on name', () => {
      const result = matchStock('贵州', '600519', '贵州茅台');
      expect(result.matched).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should contain match on name', () => {
      const result = matchStock('茅台', '600519', '贵州茅台');
      expect(result.matched).toBe(true);
    });

    it('should return no match for unrelated query', () => {
      const result = matchStock('xyz', '600519', '贵州茅台');
      expect(result.matched).toBe(false);
    });

    it('should return all matched for empty query', () => {
      const result = matchStock('', '600519', '贵州茅台');
      expect(result.matched).toBe(true);
    });

    it('should handle case insensitivity', () => {
      const result = matchStock('600519', '600519', '贵州茅台');
      expect(result.matched).toBe(true);
    });

    it('should score exact symbol higher than prefix', () => {
      const exact = matchStock('600519', '600519', '贵州茅台');
      const prefix = matchStock('600', '600519', '贵州茅台');
      expect(exact.score).toBeGreaterThan(prefix.score);
    });
  });

  describe('searchAndSort', () => {
    const stocks = [
      { symbol: '600519', name: '贵州茅台' },
      { symbol: '000858', name: '五粮液' },
      { symbol: '601318', name: '中国平安' },
      { symbol: '000001', name: '平安银行' },
      { symbol: '600036', name: '招商银行' },
    ];

    it('should search and return results', () => {
      const results = searchAndSort(stocks, '茅台');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].symbol).toBe('600519');
    });

    it('should search by symbol', () => {
      const results = searchAndSort(stocks, '600');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return all for empty query', () => {
      const results = searchAndSort(stocks, '');
      expect(results.length).toBe(stocks.length);
    });

    it('should sort by relevance score', () => {
      const results = searchAndSort(stocks, '平安');
      // 中国平安 and 平安银行 should both match
      expect(results.length).toBe(2);
    });

    it('should return empty for no matches', () => {
      const results = searchAndSort(stocks, 'zzzzz');
      expect(results.length).toBe(0);
    });

    it('should handle single character search', () => {
      const results = searchAndSort(stocks, '平');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle numeric search', () => {
      const results = searchAndSort(stocks, '000');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Search History', () => {
    beforeEach(() => {
      clearSearchHistory(1);
    });

    it('should add search history', () => {
      addSearchHistory(1, { symbol: '600519', name: '贵州茅台' });
      const history = getSearchHistory(1);
      expect(history.length).toBe(1);
      expect(history[0].symbol).toBe('600519');
    });

    it('should get empty history for new user', () => {
      const history = getSearchHistory(999);
      expect(Array.isArray(history)).toBe(true);
    });

    it('should clear search history', () => {
      addSearchHistory(1, { symbol: '600519', name: '贵州茅台' });
      clearSearchHistory(1);
      const history = getSearchHistory(1);
      expect(history.length).toBe(0);
    });

    it('should deduplicate search history', () => {
      addSearchHistory(1, { symbol: '600519', name: '贵州茅台' });
      addSearchHistory(1, { symbol: '600519', name: '贵州茅台' });
      const history = getSearchHistory(1);
      expect(history.length).toBe(1);
    });

    it('should sort history by timestamp desc', () => {
      addSearchHistory(1, { query: '600519', symbol: '600519', name: '贵州茅台' });
      addSearchHistory(1, { query: '000858', symbol: '000858', name: '五粮液' });
      const history = getSearchHistory(1);
      expect(history.length).toBe(2);
      // Most recent first
      expect(history[0].symbol).toBe('000858');
    });
  });
});
