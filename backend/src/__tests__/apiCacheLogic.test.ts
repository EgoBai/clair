import { describe, it, expect } from 'vitest';

/**
 * API缓存逻辑测试
 * TTL/失效策略/缓存键生成/压缩
 */

interface CacheEntry<T = any> {
  key: string;
  value: T;
  ttl: number;
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
  size: number;
}

class LRUCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private currentSize = 0;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  set<T>(key: string, value: T, ttl = 300000): void {
    const now = Date.now();
    const size = JSON.stringify(value).length;
    while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
      const oldest = this.getOldestKey();
      if (oldest) this.delete(oldest);
    }
    this.cache.set(key, {
      key, value, ttl, createdAt: now, accessCount: 0, lastAccessed: now, size,
    });
    this.currentSize += size;
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    const now = Date.now();
    if (now - entry.createdAt > entry.ttl) {
      this.delete(key);
      return null;
    }
    entry.accessCount++;
    entry.lastAccessed = now;
    return entry.value as T;
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    this.currentSize -= entry.size;
    return this.cache.delete(key);
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  getStats(): { size: number; maxSize: number; currentSize: number; hitRate: number } {
    const entries = Array.from(this.cache.values());
    const totalAccess = entries.reduce((s, e) => s + e.accessCount, 0);
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      currentSize: this.currentSize,
      hitRate: entries.length > 0 ? totalAccess / entries.length : 0,
    };
  }

  private getOldestKey(): string | null {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldest = key;
      }
    }
    return oldest;
  }
}

function generateCacheKey(method: string, path: string, params?: Record<string, any>): string {
  const paramStr = params ? JSON.stringify(params, Object.keys(params).sort()) : '';
  return `${method}:${path}:${paramStr}`;
}

function isExpired(entry: CacheEntry, now: number): boolean {
  return now - entry.createdAt > entry.ttl;
}

function shouldCache(method: string, statusCode: number): boolean {
  if (method !== 'GET') return false;
  return statusCode >= 200 && statusCode < 300;
}

describe('API缓存逻辑', () => {
  describe('LRUCache', () => {
    it('should store and retrieve values', () => {
      const cache = new LRUCache();
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for missing keys', () => {
      const cache = new LRUCache();
      expect(cache.get('missing')).toBeNull();
    });

    it('should expire entries', async () => {
      const cache = new LRUCache();
      cache.set('key1', 'value1', 1);
      await new Promise(r => setTimeout(r, 10));
      expect(cache.get('key1')).toBeNull();
    });

    it('should evict when over capacity', () => {
      const cache = new LRUCache(100);
      cache.set('a', 'x'.repeat(50));
      cache.set('b', 'y'.repeat(50));
      cache.set('c', 'z'.repeat(50));
      const stats = cache.getStats();
      expect(stats.currentSize).toBeLessThanOrEqual(100);
    });

    it('should delete entries', () => {
      const cache = new LRUCache();
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeNull();
    });

    it('should clear all', () => {
      const cache = new LRUCache();
      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();
      expect(cache.getStats().size).toBe(0);
    });

    it('should track stats', () => {
      const cache = new LRUCache();
      cache.set('a', 1);
      cache.get('a');
      cache.get('a');
      const stats = cache.getStats();
      expect(stats.size).toBe(1);
      expect(stats.hitRate).toBeGreaterThan(0);
    });
  });

  describe('generateCacheKey', () => {
    it('should generate consistent keys', () => {
      const key1 = generateCacheKey('GET', '/api/stocks', { page: 1, limit: 10 });
      const key2 = generateCacheKey('GET', '/api/stocks', { limit: 10, page: 1 });
      expect(key1).toBe(key2);
    });

    it('should include method and path', () => {
      const key = generateCacheKey('GET', '/api/stocks');
      expect(key).toContain('GET');
      expect(key).toContain('/api/stocks');
    });
  });

  describe('isExpired', () => {
    it('should detect expired entries', () => {
      const entry: CacheEntry = { key: 'k', value: 'v', ttl: 1000, createdAt: 0, accessCount: 0, lastAccessed: 0, size: 10 };
      expect(isExpired(entry, 2000)).toBe(true);
      expect(isExpired(entry, 500)).toBe(false);
    });
  });

  describe('shouldCache', () => {
    it('should cache GET 2xx', () => {
      expect(shouldCache('GET', 200)).toBe(true);
      expect(shouldCache('GET', 201)).toBe(true);
    });

    it('should not cache POST', () => {
      expect(shouldCache('POST', 200)).toBe(false);
    });

    it('should not cache errors', () => {
      expect(shouldCache('GET', 500)).toBe(false);
      expect(shouldCache('GET', 404)).toBe(false);
    });
  });
});
