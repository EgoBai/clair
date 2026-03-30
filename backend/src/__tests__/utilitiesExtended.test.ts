import { describe, it, expect, vi } from 'vitest';

describe('Backend Utilities Extended', () => {
  describe('Query Cache Extended', () => {
    it('should cache query results on repeated calls', async () => {
      const { queryCache } = await import('../utils/queryCache');
      const fn = vi.fn().mockResolvedValue('cached-value');
      const r1 = await queryCache.query('ext-key', fn, 5000);
      const r2 = await queryCache.query('ext-key', fn, 5000);
      expect(r1).toBe('cached-value');
      expect(r2).toBe('cached-value');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should track hit rate accurately', async () => {
      const { queryCache } = await import('../utils/queryCache');
      const fn = vi.fn().mockImplementation((key: string) => Promise.resolve(key));
      await queryCache.query('a', fn, 5000);
      await queryCache.query('a', fn, 5000);
      await queryCache.query('b', fn, 5000);
      const stats = queryCache.getStats();
      expect(stats.cacheHits).toBeGreaterThanOrEqual(1);
      expect(stats.cacheMisses).toBeGreaterThanOrEqual(2);
    });

    it('should handle pattern invalidation', async () => {
      const { queryCache } = await import('../utils/queryCache');
      const fn = vi.fn().mockResolvedValue('data');
      await queryCache.query('stocks:list', fn, 5000);
      await queryCache.query('stocks:detail', fn, 5000);
      await queryCache.query('etf:list', fn, 5000);
      queryCache.invalidate('stocks');
      await queryCache.query('stocks:list', fn, 5000);
      expect(fn).toHaveBeenCalledTimes(4); // 3 initial + 1 after invalidation
    });

    it('should handle cleanup of expired entries', async () => {
      const { queryCache } = await import('../utils/queryCache');
      const fn = vi.fn().mockResolvedValue('data');
      await queryCache.query('expire-test', fn, 50);
      await new Promise(r => setTimeout(r, 60));
      await queryCache.query('expire-test', fn, 50);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should handle popular cache ranking', async () => {
      const { queryCache } = await import('../utils/queryCache');
      const fn = vi.fn().mockResolvedValue('data');
      for (let i = 0; i < 5; i++) {
        await queryCache.query('popular-key', fn, 5000);
      }
      await queryCache.query('rare-key', fn, 5000);
      const top = queryCache.getTopCached(5);
      expect(Array.isArray(top)).toBe(true);
    });
  });

  describe('Search Utility Extended', () => {
    it('should match stocks by Chinese name', async () => {
      const { matchStock } = await import('../utils/search');
      const match = matchStock('茅台', '600519', '贵州茅台');
      expect(match.matched).toBe(true);
    });

    it('should match stocks by code', async () => {
      const { matchStock } = await import('../utils/search');
      const match = matchStock('600', '600519', '贵州茅台');
      expect(match.matched).toBe(true);
    });

    it('should not match unrelated query', async () => {
      const { matchStock } = await import('../utils/search');
      const match = matchStock('xyz', '600519', '贵州茅台');
      expect(match.matched).toBe(false);
    });

    it('should search and sort by relevance', async () => {
      const { searchAndSort } = await import('../utils/search');
      const stocks = [
        { symbol: '600519', name: '贵州茅台' },
        { symbol: '000858', name: '五粮液' },
        { symbol: '600809', name: '山西汾酒' },
      ];
      const results = searchAndSort(stocks, '茅台');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain('茅台');
    });
  });

  describe('Search History', () => {
    it('should add and retrieve search history', async () => {
      const { addSearchHistory, getSearchHistory, clearSearchHistory } = await import('../utils/search');
      clearSearchHistory(1);
      addSearchHistory(1, { query: '600519', symbol: '600519', name: '贵州茅台' });
      addSearchHistory(1, { query: '000858', symbol: '000858', name: '五粮液' });
      const items = getSearchHistory(1);
      expect(items.length).toBe(2);
    });

    it('should sort history by timestamp desc', async () => {
      const { addSearchHistory, getSearchHistory, clearSearchHistory } = await import('../utils/search');
      clearSearchHistory(2);
      addSearchHistory(2, { query: '001', symbol: '001', name: 'first' });
      addSearchHistory(2, { query: '002', symbol: '002', name: 'second' });
      const items = getSearchHistory(2);
      expect(items[0].name).toBe('second');
    });

    it('should clear search history', async () => {
      const { addSearchHistory, clearSearchHistory, getSearchHistory } = await import('../utils/search');
      clearSearchHistory(3);
      addSearchHistory(3, { query: '600519', symbol: '600519', name: 'test' });
      clearSearchHistory(3);
      const items = getSearchHistory(3);
      expect(items.length).toBe(0);
    });
  });

  describe('Ex-Rights Engine Extended', () => {
    it('should calculate dividend tax rate correctly', async () => {
      const { calculateDividendTaxRate } = await import('../utils/exRights');
      expect(calculateDividendTaxRate(10)).toBe(0.2); // < 1 month: 20%
      expect(calculateDividendTaxRate(180)).toBe(0.1); // 1 month to 1 year: 10%
      expect(calculateDividendTaxRate(400)).toBe(0); // > 1 year: 0%
    });

    it('should create AdjustmentEngine', async () => {
      const { AdjustmentEngine } = await import('../utils/exRights');
      const engine = new AdjustmentEngine();
      expect(engine).toBeDefined();
      expect(typeof engine.addEvent).toBe('function');
      expect(typeof engine.addEvents).toBe('function');
    });

    it('should calculate ex-rights reference price', async () => {
      const { calculateExRightsReferencePrice } = await import('../utils/exRights');
      const price = calculateExRightsReferencePrice(100, 1, 0, 0.1);
      expect(price).toBeLessThan(100);
      expect(price).toBeGreaterThan(0);
    });
  });

  describe('Data Validation Extended', () => {
    it('should create DataAnomalyDetector', async () => {
      const { DataAnomalyDetector } = await import('../utils/dataValidation');
      const detector = new DataAnomalyDetector();
      expect(detector).toBeDefined();
      expect(typeof detector.detect).toBe('function');
    });

    it('should create FinancialDataPrecision', async () => {
      const { FinancialDataPrecision } = await import('../utils/dataValidation');
      expect(FinancialDataPrecision).toBeDefined();
      expect(typeof FinancialDataPrecision.normalizePE).toBe('function');
      expect(typeof FinancialDataPrecision.normalizePB).toBe('function');
    });

    it('should normalize PE correctly', async () => {
      const { FinancialDataPrecision } = await import('../utils/dataValidation');
      expect(FinancialDataPrecision.normalizePE(15.5)).toBe(15.5);
      expect(FinancialDataPrecision.normalizePE(NaN)).toBeNull();
      expect(FinancialDataPrecision.normalizePE(Infinity)).toBeNull();
    });
  });
});
