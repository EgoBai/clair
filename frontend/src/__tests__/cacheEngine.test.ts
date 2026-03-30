import { describe, it, expect, vi } from 'vitest';
import {
  LRUCache,
  LFUCache,
  TTLCache,
  createCache,
  calculateStorageUsage,
  cleanExpiredStorage,
} from '../utils/cacheEngine';

// ==================== LRU缓存测试 ====================

describe('LRUCache', () => {
  it('应存储和获取值', () => {
    const cache = new LRUCache<string>();
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('不存在的key应返回undefined', () => {
    const cache = new LRUCache();
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('应淘汰最久未使用的条目', () => {
    const cache = new LRUCache<string>({ maxSize: 3 });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    cache.set('d', '4'); // 淘汰 'a'

    expect(cache.has('a')).toBe(false);
    expect(cache.has('d')).toBe(true);
  });

  it('访问应更新LRU顺序', () => {
    const cache = new LRUCache<string>({ maxSize: 3 });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    cache.get('a'); // 访问a，使其变为最近使用
    cache.set('d', '4'); // 应淘汰b（最久未使用）

    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
  });

  it('应正确跟踪命中率', () => {
    const cache = new LRUCache<string>();
    cache.set('a', '1');
    cache.get('a'); // hit
    cache.get('b'); // miss
    cache.get('a'); // hit

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(0.6667, 3);
  });

  it('delete应移除条目', () => {
    const cache = new LRUCache<string>();
    cache.set('a', '1');
    expect(cache.delete('a')).toBe(true);
    expect(cache.has('a')).toBe(false);
    expect(cache.delete('nonexistent')).toBe(false);
  });

  it('clear应清空缓存', () => {
    const cache = new LRUCache<string>();
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();
    expect(cache.getStats().size).toBe(0);
    expect(cache.keys()).toEqual([]);
  });

  it('keys和values应正确返回', () => {
    const cache = new LRUCache<string>();
    cache.set('a', '1');
    cache.set('b', '2');
    expect(cache.keys()).toEqual(['a', 'b']);
    expect(cache.values()).toEqual(['1', '2']);
  });

  it('onEvict回调应触发', () => {
    const onEvict = vi.fn();
    const cache = new LRUCache<string>({ maxSize: 2, onEvict });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    expect(onEvict).toHaveBeenCalledWith('a', expect.any(Object));
  });

  it('应正确计算内存使用', () => {
    const cache = new LRUCache<string>();
    cache.set('a', 'hello');
    const stats = cache.getStats();
    expect(stats.memoryUsage).toBeGreaterThan(0);
  });

  it('更新已存在的key应正确处理', () => {
    const cache = new LRUCache<string>();
    cache.set('a', '1');
    cache.set('a', '2');
    expect(cache.get('a')).toBe('2');
    expect(cache.getStats().size).toBe(1);
  });

  it('过期条目应被清理', () => {
    vi.useFakeTimers();
    const cache = new LRUCache<string>({ defaultTTL: 1000 });
    cache.set('a', '1');
    vi.advanceTimersByTime(1500);
    expect(cache.get('a')).toBeUndefined();
    vi.useRealTimers();
  });

  it('TTL=0应永不过期', () => {
    vi.useFakeTimers();
    const cache = new LRUCache<string>({ defaultTTL: 0 });
    cache.set('a', '1');
    vi.advanceTimersByTime(1000000);
    expect(cache.get('a')).toBe('1');
    vi.useRealTimers();
  });
});

// ==================== LFU缓存测试 ====================

describe('LFUCache', () => {
  it('应存储和获取值', () => {
    const cache = new LFUCache<string>();
    cache.set('a', '1');
    expect(cache.get('a')).toBe('1');
  });

  it('应淘汰最少使用的条目', () => {
    const cache = new LFUCache<string>({ maxSize: 3 });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');

    // 多次访问a和c
    cache.get('a');
    cache.get('a');
    cache.get('c');
    cache.get('c');

    cache.set('d', '4'); // 应淘汰b（最少使用）

    expect(cache.has('b')).toBe(false);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('c')).toBe(true);
  });

  it('应正确跟踪命中率', () => {
    const cache = new LFUCache<string>();
    cache.set('a', '1');
    cache.get('a');
    cache.get('b');

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it('clear应清空', () => {
    const cache = new LFUCache<string>();
    cache.set('a', '1');
    cache.clear();
    expect(cache.getStats().size).toBe(0);
  });

  it('应处理对象值', () => {
    const cache = new LFUCache<{ data: number[] }>();
    cache.set('obj', { data: [1, 2, 3] });
    expect(cache.get('obj')).toEqual({ data: [1, 2, 3] });
  });
});

// ==================== TTL缓存测试 ====================

describe('TTLCache', () => {
  it('应存储和获取值', () => {
    const cache = new TTLCache<string>();
    cache.set('a', '1');
    expect(cache.get('a')).toBe('1');
  });

  it('应自动过期条目', () => {
    vi.useFakeTimers();
    const cache = new TTLCache<string>({ defaultTTL: 1000 });
    cache.set('a', '1');
    expect(cache.has('a')).toBe(true);
    vi.advanceTimersByTime(1500);
    expect(cache.has('a')).toBe(false);
    vi.useRealTimers();
  });

  it('自定义TTL应覆盖默认值', () => {
    vi.useFakeTimers();
    const cache = new TTLCache<string>({ defaultTTL: 1000 });
    cache.set('short', '1', 500);
    cache.set('long', '2', 5000);

    vi.advanceTimersByTime(600);
    expect(cache.has('short')).toBe(false);
    expect(cache.has('long')).toBe(true);

    vi.advanceTimersByTime(5000);
    expect(cache.has('long')).toBe(false);
    vi.useRealTimers();
  });

  it('delete应清除定时器', () => {
    vi.useFakeTimers();
    const cache = new TTLCache<string>({ defaultTTL: 1000 });
    cache.set('a', '1');
    cache.delete('a');
    vi.advanceTimersByTime(2000);
    // 不应报错
    vi.useRealTimers();
  });

  it('clear应清除所有定时器', () => {
    const cache = new TTLCache<string>();
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();
    expect(cache.getStats().size).toBe(0);
  });
});

// ==================== 缓存工厂测试 ====================

describe('createCache', () => {
  it('应创建LRU缓存', () => {
    const cache = createCache<string>('lru');
    cache.set('a', '1');
    expect(cache.get('a')).toBe('1');
  });

  it('应创建LFU缓存', () => {
    const cache = createCache<string>('lfu');
    cache.set('a', '1');
    expect(cache.get('a')).toBe('1');
  });

  it('应创建TTL缓存', () => {
    const cache = createCache<string>('ttl');
    cache.set('a', '1');
    expect(cache.get('a')).toBe('1');
  });

  it('默认应创建LRU缓存', () => {
    const cache = createCache<string>();
    cache.set('a', '1');
    expect(cache.get('a')).toBe('1');
  });
});

// ==================== 浏览器存储测试 ====================

describe('calculateStorageUsage', () => {
  it('应返回存储使用量', () => {
    const usage = calculateStorageUsage();
    expect(usage.localStorage).toBeGreaterThanOrEqual(0);
    expect(usage.sessionStorage).toBeGreaterThanOrEqual(0);
  });
});

describe('cleanExpiredStorage', () => {
  it('应返回清理数量', () => {
    const cleaned = cleanExpiredStorage();
    expect(typeof cleaned).toBe('number');
    expect(cleaned).toBeGreaterThanOrEqual(0);
  });
});
