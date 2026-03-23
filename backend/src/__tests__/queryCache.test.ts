/**
 * 查询缓存 - 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import QueryCache from '../utils/queryCache';

describe('QueryCache', () => {
  let cache: QueryCache;

  beforeEach(() => {
    cache = new QueryCache(100);
  });

  it('应该缓存查询结果', async () => {
    let callCount = 0;
    const fn = async () => { callCount++; return 'result'; };

    const r1 = await cache.query('key1', fn, 5000);
    const r2 = await cache.query('key1', fn, 5000);

    expect(r1).toBe('result');
    expect(r2).toBe('result');
    expect(callCount).toBe(1); // 只调用一次
  });

  it('过期缓存应该重新查询', async () => {
    let callCount = 0;
    const fn = async () => { callCount++; return callCount; };

    const r1 = await cache.query('key1', fn, 10); // 10ms TTL
    await new Promise(resolve => setTimeout(resolve, 20));
    const r2 = await cache.query('key1', fn, 10);

    expect(r1).toBe(1);
    expect(r2).toBe(2);
    expect(callCount).toBe(2);
  });

  it('不同key应该独立缓存', async () => {
    const fn1 = async () => 'result1';
    const fn2 = async () => 'result2';

    const r1 = await cache.query('key1', fn1, 5000);
    const r2 = await cache.query('key2', fn2, 5000);

    expect(r1).toBe('result1');
    expect(r2).toBe('result2');
  });

  it('应该追踪缓存命中', async () => {
    const fn = async () => 'result';
    await cache.query('key1', fn, 5000);
    await cache.query('key1', fn, 5000);
    await cache.query('key2', fn, 5000);

    const stats = cache.getStats();
    expect(stats.cacheHits).toBe(1);
    expect(stats.cacheMisses).toBe(2);
    expect(stats.hitRate).toBeCloseTo(1 / 3, 2);
  });

  it('应该记录慢查询', async () => {
    const slowFn = async () => {
      await new Promise(resolve => setTimeout(resolve, 150));
      return 'slow';
    };

    await cache.query('slow-key', slowFn, 5000);
    const stats = cache.getStats();
    expect(stats.slowQueries).toBe(1);
    expect(stats.slowestQuery?.duration).toBeGreaterThanOrEqual(100);
  });

  it('应该正确失效缓存', async () => {
    let callCount = 0;
    const fn = async () => { callCount++; return callCount; };

    await cache.query('stock:600519', fn, 5000);
    cache.invalidate('stock');
    await cache.query('stock:600519', fn, 5000);

    expect(callCount).toBe(2);
  });

  it('查询失败应该抛出错误', async () => {
    const failFn = async () => { throw new Error('DB error'); };
    await expect(cache.query('key', failFn, 5000)).rejects.toThrow('DB error');
  });

  it('应该返回热门缓存', async () => {
    const fn = async () => 'result';
    // 访问多次同一key
    await cache.query('hot', fn, 5000);
    await cache.query('hot', fn, 5000);
    await cache.query('hot', fn, 5000);
    await cache.query('cold', fn, 5000);

    const top = cache.getTopCached(2);
    expect(top[0].key).toBe('hot');
    expect(top[0].hits).toBe(2);
  });
});
