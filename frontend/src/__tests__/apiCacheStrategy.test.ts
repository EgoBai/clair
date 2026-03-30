import { describe, it, expect } from 'vitest';

describe('APICacheStrategy', () => {
  interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
    key: string;
  }

  class ApiCache {
    private cache = new Map<string, CacheEntry<unknown>>();
    private defaultTTL: number;
    private maxSize: number;
    private hits = 0;
    private misses = 0;

    constructor(defaultTTL = 30000, maxSize = 100) {
      this.defaultTTL = defaultTTL;
      this.maxSize = maxSize;
    }

    get<T>(key: string): T | null {
      const entry = this.cache.get(key) as CacheEntry<T> | undefined;
      if (!entry) { this.misses++; return null; }
      if (Date.now() - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        this.misses++;
        return null;
      }
      this.hits++;
      return entry.data;
    }

    set<T>(key: string, data: T, ttl?: number): void {
      if (this.cache.size >= this.maxSize) {
        const oldest = this.findOldest();
        if (oldest) this.cache.delete(oldest);
      }
      this.cache.set(key, { data, timestamp: Date.now(), ttl: ttl ?? this.defaultTTL, key });
    }

    invalidate(pattern: string): number {
      let count = 0;
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) { this.cache.delete(key); count++; }
      }
      return count;
    }

    clear(): void { this.cache.clear(); this.hits = 0; this.misses = 0; }

    getStats() {
      const total = this.hits + this.misses;
      return { size: this.cache.size, hits: this.hits, misses: this.misses, hitRate: total > 0 ? this.hits / total : 0 };
    }

    private findOldest(): string | null {
      let oldest: string | null = null;
      let oldestTime = Infinity;
      for (const [key, entry] of this.cache) {
        if (entry.timestamp < oldestTime) { oldestTime = entry.timestamp; oldest = key; }
      }
      return oldest;
    }
  }

  it('should return null for missing key', () => {
    const cache = new ApiCache();
    expect(cache.get('missing')).toBeNull();
  });

  it('should return cached value', () => {
    const cache = new ApiCache();
    cache.set('key1', { value: 42 });
    expect(cache.get<{ value: number }>('key1')?.value).toBe(42);
  });

  it('should return null for expired entry', async () => {
    const cache = new ApiCache(1);
    cache.set('key1', 'data', 1);
    await new Promise(r => setTimeout(r, 5));
    const result = cache.get('key1');
    expect(result).toBeNull();
  });

  it('should invalidate by pattern', () => {
    const cache = new ApiCache();
    cache.set('/api/stocks/600519', 'data1');
    cache.set('/api/stocks/000858', 'data2');
    cache.set('/api/news', 'data3');
    const count = cache.invalidate('/api/stocks');
    expect(count).toBe(2);
    expect(cache.get('/api/news')).toBe('data3');
  });

  it('should track hit rate', () => {
    const cache = new ApiCache();
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.get('b');
    cache.get('c');
    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(2 / 3, 2);
  });

  it('should evict oldest when max size reached', () => {
    const cache = new ApiCache(30000, 3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4);
    expect(cache.get('a')).toBeNull();
    expect(cache.get('d')).toBe(4);
  });

  it('should clear all entries', () => {
    const cache = new ApiCache();
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.getStats().size).toBe(0);
    expect(cache.getStats().hits).toBe(0);
  });

  it('should report correct size', () => {
    const cache = new ApiCache();
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.getStats().size).toBe(3);
  });

  it('should handle custom TTL', () => {
    const cache = new ApiCache(30000);
    cache.set('key', 'data', 60000);
    expect(cache.get('key')).toBe('data');
  });

  it('should return zero hit rate with no access', () => {
    const cache = new ApiCache();
    expect(cache.getStats().hitRate).toBe(0);
  });

  it('should handle complex data types', () => {
    const cache = new ApiCache();
    const complexData = { stocks: [{ symbol: '600519', prices: [1800, 1805, 1810] }], meta: { count: 1 } };
    cache.set('complex', complexData);
    expect(cache.get<typeof complexData>('complex')).toEqual(complexData);
  });

  it('should not invalidate non-matching keys', () => {
    const cache = new ApiCache();
    cache.set('api/stocks', 'a');
    cache.set('api/news', 'b');
    const count = cache.invalidate('watchlist');
    expect(count).toBe(0);
  });
});
