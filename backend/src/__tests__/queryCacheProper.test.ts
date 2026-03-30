import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test the queryCache module's actual exports
describe('Query Cache Proper', () => {
  it('should export queryCache instance', async () => {
    const { queryCache } = await import('../utils/queryCache');
    expect(queryCache).toBeDefined();
  });

  it('should have query method', async () => {
    const { queryCache } = await import('../utils/queryCache');
    expect(typeof queryCache.query).toBe('function');
  });

  it('should cache query results', async () => {
    const { queryCache } = await import('../utils/queryCache');
    const fn = vi.fn().mockResolvedValue({ data: 'test' });
    const r1 = await queryCache.query('test-key', fn, 30000);
    const r2 = await queryCache.query('test-key', fn, 30000);
    expect(r1).toEqual({ data: 'test' });
    expect(r2).toEqual({ data: 'test' });
    expect(fn).toHaveBeenCalledTimes(1); // cached on second call
  });

  it('should return fresh results after TTL expires', async () => {
    const { queryCache } = await import('../utils/queryCache');
    const fn = vi.fn().mockResolvedValue('value');
    await queryCache.query('ttl-test', fn, 50);
    await new Promise(r => setTimeout(r, 60));
    await queryCache.query('ttl-test', fn, 50);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should support cache invalidation with pattern', async () => {
    const { queryCache } = await import('../utils/queryCache');
    const fn1 = vi.fn().mockResolvedValue([1, 2, 3]);
    const fn2 = vi.fn().mockResolvedValue({ name: 'test' });
    await queryCache.query('stocks:list', fn1, 30000);
    await queryCache.query('stocks:detail:600519', fn2, 30000);
    queryCache.invalidate('stocks');
    // After invalidation, queries should call the function again
    await queryCache.query('stocks:list', fn1, 30000);
    expect(fn1).toHaveBeenCalledTimes(2);
  });

  it('should support invalidate all', async () => {
    const { queryCache } = await import('../utils/queryCache');
    const fn = vi.fn().mockResolvedValue('data');
    await queryCache.query('a', fn, 30000);
    await queryCache.query('b', fn, 30000);
    queryCache.invalidate(); // clear all
    await queryCache.query('a', fn, 30000);
    expect(fn).toHaveBeenCalledTimes(3); // 2 initial + 1 after invalidate
  });

  it('should have getStats method', async () => {
    const { queryCache } = await import('../utils/queryCache');
    const stats = queryCache.getStats();
    expect(stats).toBeDefined();
    expect(typeof stats.totalQueries).toBe('number');
    expect(typeof stats.cacheHits).toBe('number');
    expect(typeof stats.cacheMisses).toBe('number');
    expect(typeof stats.hitRate).toBe('number');
    expect(typeof stats.cacheSize).toBe('number');
  });

  it('should track hit rate accurately', async () => {
    const { queryCache } = await import('../utils/queryCache');
    const fn = vi.fn().mockResolvedValue('value');
    await queryCache.query('hr-key', fn, 30000); // miss
    await queryCache.query('hr-key', fn, 30000); // hit
    const stats = queryCache.getStats();
    expect(stats.cacheHits).toBeGreaterThanOrEqual(1);
    expect(stats.cacheMisses).toBeGreaterThanOrEqual(1);
    expect(stats.hitRate).toBeGreaterThan(0);
    expect(stats.hitRate).toBeLessThanOrEqual(1);
  });

  it('should have getTopCached method', async () => {
    const { queryCache } = await import('../utils/queryCache');
    const fn = vi.fn().mockResolvedValue('data');
    await queryCache.query('popular', fn, 30000);
    for (let i = 0; i < 5; i++) {
      await queryCache.query('popular', fn, 30000);
    }
    const top = queryCache.getTopCached(5);
    expect(Array.isArray(top)).toBe(true);
    if (top.length > 0) {
      expect(top[0]).toHaveProperty('key');
      expect(top[0]).toHaveProperty('hits');
    }
  });

  it('should handle multiple different keys', async () => {
    const { queryCache } = await import('../utils/queryCache');
    const fn = vi.fn().mockImplementation((key: string) => Promise.resolve(key));
    for (let i = 0; i < 10; i++) {
      await queryCache.query(`key-${i}`, () => Promise.resolve(i), 30000);
    }
    const stats = queryCache.getStats();
    expect(stats.cacheSize).toBeGreaterThanOrEqual(10);
  });

  it('should handle query errors gracefully', async () => {
    const { queryCache } = await import('../utils/queryCache');
    const errorFn = vi.fn().mockRejectedValue(new Error('DB error'));
    await expect(queryCache.query('error-key', errorFn, 30000)).rejects.toThrow('DB error');
  });

  it('should track slow queries', async () => {
    const { queryCache } = await import('../utils/queryCache');
    const slowFn = () => new Promise(resolve => setTimeout(() => resolve('slow'), 600));
    await queryCache.query('slow-key', slowFn, 30000);
    const stats = queryCache.getStats();
    expect(stats.slowestQuery).not.toBeNull();
  });

  it('should have destroy method', async () => {
    const { queryCache: qc } = await import('../utils/queryCache');
    expect(typeof qc.destroy).toBe('function');
  });
});
