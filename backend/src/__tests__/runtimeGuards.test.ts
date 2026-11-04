/**
 * 生产健壮性回归（批次 45，2026-11-04）
 *
 * 绑定生产实现：
 *   - backend/src/services/cacheEngine.ts:36 LRUCache
 *       · set() 覆盖已有 key 不应触发容量淘汰（旧实现先 while 淘汰再插入）
 *       · oldest 用 falsy 判断会把空字符串 key 当成"没有元素"→ 同步死循环
 *       · setNull 的填充定时器须随 delete/clear/destroy 一起清理
 *   - backend/src/services/batchOperations.ts:121 chunk
 *       · size<=0 / 负数时步进不前进 → 同步死循环；现改为 RangeError
 *
 * 红→绿证据（旧代码挂死 SIGALRM exit=142、新代码正常返回）见
 * docs/harness/REGRESSION-ASSETS.md 对应行。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { LRUCache } from '../services/cacheEngine';
import { chunk } from '../services/batchOperations';

describe('LRUCache 容量淘汰（生产：services/cacheEngine.ts:36）', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('覆盖已有 key 不应淘汰其他条目（旧实现会误淘汰并塌容量）', () => {
    const cache = new LRUCache<number>({ maxSize: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 3);

    expect(cache.keys()).toEqual(['b', 'a']);
    expect(cache.getStats().size).toBe(2);
    expect(cache.getStats().evictions).toBe(0);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('a')).toBe(3);
    cache.destroy();
  });

  it('超出容量时只淘汰最旧一条', () => {
    const cache = new LRUCache<number>({ maxSize: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.keys()).toEqual(['b', 'c']);
    expect(cache.getStats().evictions).toBe(1);
    expect(cache.get('a')).toBeUndefined();
    cache.destroy();
  });

  it('maxSize=1 时只保留最后一次写入', () => {
    const cache = new LRUCache<number>({ maxSize: 1 });
    cache.set('a', 1);
    cache.set('b', 2);

    expect(cache.keys()).toEqual(['b']);
    expect(cache.get('a')).toBeUndefined();
    cache.destroy();
  });

  it('空字符串是合法 key，参与淘汰时按最旧被移除（不能死循环）', () => {
    const cache = new LRUCache<number>({ maxSize: 2 });
    cache.set('', 1);
    cache.set('a', 2);
    cache.set('b', 3);

    expect(cache.get('')).toBeUndefined();
    expect(cache.keys()).toEqual(['a', 'b']);
    expect(cache.getStats().evictions).toBe(1);
    cache.destroy();
  });

  it('非法 maxSize（0 / 负数 / NaN）退化为容量 1，不挂死', () => {
    for (const maxSize of [0, -3, Number.NaN]) {
      const cache = new LRUCache<number>({ maxSize });
      cache.set('a', 1);
      cache.set('b', 2);
      expect(cache.getStats().size).toBe(1);
      expect(cache.get('b')).toBe(2);
      cache.destroy();
    }
  });

  it('setNull 的填充定时器应随 delete / clear / destroy 清理', () => {
    vi.useFakeTimers();
    const cache = new LRUCache<number>({ maxSize: 10 });
    // 构造函数自带一个定期清理定时器
    expect(vi.getTimerCount()).toBe(1);

    cache.setNull('k1', 60_000);
    cache.setNull('k2', 60_000);
    expect(vi.getTimerCount()).toBe(3);

    cache.delete('k1');
    expect(vi.getTimerCount()).toBe(2);

    cache.clear();
    expect(vi.getTimerCount()).toBe(1);

    cache.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('setNull 到期后自动移除穿透标记', () => {
    vi.useFakeTimers();
    const cache = new LRUCache<number>({ maxSize: 10 });
    cache.setNull('k1', 1_000);
    expect(cache.has('k1')).toBe(false);

    vi.advanceTimersByTime(1_000);
    // 标记已过期清除：此时允许回源，get 返回 undefined 而非继续穿透拦截
    expect(cache.get('k1')).toBeUndefined();
    expect(vi.getTimerCount()).toBe(1);
    cache.destroy();
  });
});

describe('chunk 入参校验（生产：services/batchOperations.ts:121）', () => {
  it('按步长切分且保留尾部不足一块的数据', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 5)).toEqual([]);
  });

  it('非整数 size 向下取整（Math.floor）', () => {
    expect(chunk([1, 2, 3], 2.7)).toEqual([[1, 2], [3]]);
  });

  it('size 为 0 / 负数时抛 RangeError（旧实现步进不前进会挂死）', () => {
    expect(() => chunk([1, 2], 0)).toThrow(RangeError);
    expect(() => chunk([1, 2], 0)).toThrow(/chunk 的 size 必须为正整数/);
    expect(() => chunk([1, 2], -1)).toThrow(RangeError);
  });

  it('size 为 NaN 时抛 RangeError（旧实现返回 [[]]）', () => {
    expect(() => chunk([1, 2], Number.NaN)).toThrow(RangeError);
  });
});
