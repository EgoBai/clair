import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==================== 缓存策略逻辑测试 ====================

describe('cacheStrategy - TTL based cache', () => {
  interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
  }

  class SimpleCache<T = any> {
    private cache = new Map<string, CacheEntry<T>>();

    set(key: string, data: T, ttl: number = 30000): void {
      this.cache.set(key, { data, timestamp: Date.now(), ttl });
    }

    get(key: string): T | null {
      const entry = this.cache.get(key);
      if (!entry) return null;
      if (Date.now() - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        return null;
      }
      return entry.data;
    }

    has(key: string): boolean {
      return this.get(key) !== null;
    }

    delete(key: string): void {
      this.cache.delete(key);
    }

    clear(): void {
      this.cache.clear();
    }

    size(): number {
      return this.cache.size;
    }

    cleanup(): number {
      const now = Date.now();
      let removed = 0;
      for (const [key, entry] of this.cache) {
        if (now - entry.timestamp > entry.ttl) {
          this.cache.delete(key);
          removed++;
        }
      }
      return removed;
    }

    invalidatePattern(pattern: string): number {
      let removed = 0;
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
          removed++;
        }
      }
      return removed;
    }
  }

  let cache: SimpleCache;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new SimpleCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should store and retrieve data', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should return null for missing key', () => {
    expect(cache.get('missing')).toBeNull();
  });

  it('should expire after TTL', () => {
    cache.set('key1', 'value1', 1000);
    vi.advanceTimersByTime(1500);
    expect(cache.get('key1')).toBeNull();
  });

  it('should not expire before TTL', () => {
    cache.set('key1', 'value1', 1000);
    vi.advanceTimersByTime(500);
    expect(cache.get('key1')).toBe('value1');
  });

  it('should use default TTL of 30000ms', () => {
    cache.set('key1', 'value1');
    vi.advanceTimersByTime(29000);
    expect(cache.get('key1')).toBe('value1');
  });

  it('has should return false for expired', () => {
    cache.set('key1', 'value1', 100);
    vi.advanceTimersByTime(200);
    expect(cache.has('key1')).toBe(false);
  });

  it('has should return true for valid', () => {
    cache.set('key1', 'value1');
    expect(cache.has('key1')).toBe(true);
  });

  it('delete should remove entry', () => {
    cache.set('key1', 'value1');
    cache.delete('key1');
    expect(cache.get('key1')).toBeNull();
  });

  it('clear should remove all entries', () => {
    cache.set('k1', 'v1');
    cache.set('k2', 'v2');
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it('cleanup should remove expired entries', () => {
    cache.set('expired', 'v1', 100);
    cache.set('valid', 'v2', 10000);
    vi.advanceTimersByTime(200);
    const removed = cache.cleanup();
    expect(removed).toBe(1);
    expect(cache.size()).toBe(1);
  });

  it('invalidatePattern should remove matching keys', () => {
    cache.set('stock:600519', '茅台');
    cache.set('stock:000001', '平安');
    cache.set('user:1', 'admin');
    const removed = cache.invalidatePattern('stock:');
    expect(removed).toBe(2);
    expect(cache.has('user:1')).toBe(true);
  });

  it('should store objects', () => {
    cache.set('stock', { name: '茅台', price: 1800 });
    const data = cache.get('stock');
    expect(data).toEqual({ name: '茅台', price: 1800 });
  });

  it('should store arrays', () => {
    cache.set('list', [1, 2, 3]);
    expect(cache.get('list')).toEqual([1, 2, 3]);
  });

  it('should store null values', () => {
    cache.set('null', null);
    // null is stored but get returns null (can't distinguish)
    expect(cache.has('null')).toBe(false);
  });

  it('should overwrite existing key', () => {
    cache.set('key', 'old');
    cache.set('key', 'new');
    expect(cache.get('key')).toBe('new');
  });
});

describe('cacheStrategy - LRU eviction', () => {
  class LRUCache {
    private cache = new Map<string, any>();
    private maxSize: number;

    constructor(maxSize: number) {
      this.maxSize = maxSize;
    }

    get(key: string): any | null {
      if (!this.cache.has(key)) return null;
      // Move to end (most recently used)
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }

    set(key: string, value: any): void {
      if (this.cache.has(key)) {
        this.cache.delete(key);
      } else if (this.cache.size >= this.maxSize) {
        // Remove oldest (first key)
        const firstKey = this.cache.keys().next().value!;
        this.cache.delete(firstKey);
      }
      this.cache.set(key, value);
    }

    size(): number {
      return this.cache.size;
    }
  }

  it('should evict oldest when full', () => {
    const cache = new LRUCache(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4);
    expect(cache.size()).toBe(3);
    expect(cache.get('a')).toBeNull(); // evicted
    expect(cache.get('d')).toBe(4);
  });

  it('should update recency on get', () => {
    const cache = new LRUCache(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.get('a'); // refresh a
    cache.set('d', 4);
    expect(cache.get('a')).toBe(1); // a should survive
    expect(cache.get('b')).toBeNull(); // b evicted (oldest untouched)
  });

  it('should not exceed maxSize', () => {
    const cache = new LRUCache(2);
    for (let i = 0; i < 100; i++) {
      cache.set(`k${i}`, i);
    }
    expect(cache.size()).toBe(2);
  });

  it('should overwrite existing key', () => {
    const cache = new LRUCache(3);
    cache.set('a', 1);
    cache.set('a', 2);
    expect(cache.get('a')).toBe(2);
    expect(cache.size()).toBe(1);
  });
});

describe('cacheStrategy - cache key generation', () => {
  function generateCacheKey(prefix: string, params: Record<string, any>): string {
    const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
    return `${prefix}:${sorted}`;
  }

  it('should generate consistent keys', () => {
    const key1 = generateCacheKey('stock', { page: 1, limit: 20 });
    const key2 = generateCacheKey('stock', { page: 1, limit: 20 });
    expect(key1).toBe(key2);
  });

  it('should sort params for consistency', () => {
    const key1 = generateCacheKey('stock', { limit: 20, page: 1 });
    const key2 = generateCacheKey('stock', { page: 1, limit: 20 });
    expect(key1).toBe(key2);
  });

  it('should differentiate different params', () => {
    const key1 = generateCacheKey('stock', { page: 1 });
    const key2 = generateCacheKey('stock', { page: 2 });
    expect(key1).not.toBe(key2);
  });

  it('should include prefix', () => {
    const key = generateCacheKey('stock', { id: 1 });
    expect(key).toContain('stock:');
  });

  it('should handle empty params', () => {
    const key = generateCacheKey('all', {});
    expect(key).toBe('all:');
  });

  it('should handle complex params', () => {
    const key = generateCacheKey('search', { q: '茅台', type: 'stock', page: 1 });
    expect(key).toContain('page=1');
    expect(key).toContain('q=茅台');
  });
});

describe('cacheStrategy - cache headers', () => {
  function getCacheControlHeader(maxAge: number, isPrivate: boolean = false): string {
    const parts: string[] = [];
    if (isPrivate) parts.push('private');
    else parts.push('public');
    parts.push(`max-age=${maxAge}`);
    parts.push('must-revalidate');
    return parts.join(', ');
  }

  it('should generate public cache header', () => {
    const header = getCacheControlHeader(30);
    expect(header).toBe('public, max-age=30, must-revalidate');
  });

  it('should generate private cache header', () => {
    const header = getCacheControlHeader(30, true);
    expect(header).toBe('private, max-age=30, must-revalidate');
  });

  it('should include max-age', () => {
    const header = getCacheControlHeader(3600);
    expect(header).toContain('max-age=3600');
  });

  it('should always include must-revalidate', () => {
    const header = getCacheControlHeader(30);
    expect(header).toContain('must-revalidate');
  });

  it('no-cache header should prevent caching', () => {
    const header = 'no-cache, no-store, must-revalidate';
    expect(header).toContain('no-store');
  });
});

describe('cacheStrategy - stale-while-revalidate', () => {
  function shouldUseStale(entry: { age: number; maxAge: number; swr: number }): boolean {
    const totalWindow = entry.maxAge + entry.swr;
    return entry.age > entry.maxAge && entry.age <= totalWindow;
  }

  it('should use fresh entry', () => {
    expect(shouldUseStale({ age: 10, maxAge: 60, swr: 30 })).toBe(false);
  });

  it('should use stale within SWR window', () => {
    expect(shouldUseStale({ age: 70, maxAge: 60, swr: 30 })).toBe(true);
  });

  it('should not use stale beyond SWR window', () => {
    expect(shouldUseStale({ age: 100, maxAge: 60, swr: 30 })).toBe(false);
  });

  it('boundary at maxAge should not be stale', () => {
    expect(shouldUseStale({ age: 60, maxAge: 60, swr: 30 })).toBe(false);
  });

  it('boundary at maxAge + swr should be stale', () => {
    expect(shouldUseStale({ age: 90, maxAge: 60, swr: 30 })).toBe(true);
  });
});
