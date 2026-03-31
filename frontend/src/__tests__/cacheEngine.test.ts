import { describe, it, expect, beforeEach } from 'vitest';

/**
 * 缓存引擎测试
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
  accessCount: number;
  lastAccess: number;
}

class SimpleCache<T = any> {
  private store: Map<string, CacheEntry<T>> = new Map();
  private defaultTTL: number;
  private maxSize: number;

  constructor(defaultTTL: number = 60000, maxSize: number = 1000) {
    this.defaultTTL = defaultTTL;
    this.maxSize = maxSize;
  }

  set(key: string, value: T, ttl?: number): void {
    if (this.store.size >= this.maxSize) {
      this.evict();
    }
    const now = Date.now();
    this.store.set(key, {
      value,
      expiresAt: now + (ttl || this.defaultTTL),
      createdAt: now,
      accessCount: 0,
      lastAccess: now,
    });
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    entry.accessCount++;
    entry.lastAccess = Date.now();
    return entry.value;
  }

  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  keys(): string[] {
    return [...this.store.keys()];
  }

  private evict(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    for (const [key, entry] of this.store) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }
    if (oldestKey) this.store.delete(oldestKey);
  }

  getStats(): { size: number; maxSize: number; hitRate: number } {
    let totalAccess = 0;
    let totalEntries = 0;
    for (const entry of this.store.values()) {
      totalAccess += entry.accessCount;
      totalEntries++;
    }
    return {
      size: this.store.size,
      maxSize: this.maxSize,
      hitRate: totalEntries > 0 ? totalAccess / totalEntries : 0,
    };
  }

  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }
}

describe('Cache Engine', () => {
  let cache: SimpleCache;

  beforeEach(() => {
    cache = new SimpleCache(5000, 100);
  });

  describe('基本操作', () => {
    it('应该设置和获取值', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('应该返回undefined当key不存在', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('应该正确检查key是否存在', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('应该删除key', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.has('key1')).toBe(false);
    });

    it('应该清除所有缓存', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });

  describe('过期', () => {
    it('过期的key应该返回undefined', async () => {
      cache.set('key1', 'value1', 10);
      await new Promise(r => setTimeout(r, 20));
      expect(cache.get('key1')).toBeUndefined();
    });

    it('未过期的key应该正常返回', () => {
      cache.set('key1', 'value1', 10000);
      expect(cache.get('key1')).toBe('value1');
    });

    it('cleanup应该清理过期项', async () => {
      cache.set('key1', 'v1', 10);
      cache.set('key2', 'v2', 10000);
      await new Promise(r => setTimeout(r, 20));
      const cleaned = cache.cleanup();
      expect(cleaned).toBe(1);
      expect(cache.has('key2')).toBe(true);
    });
  });

  describe('淘汰策略', () => {
    it('达到最大容量应该淘汰旧条目', () => {
      const smallCache = new SimpleCache(60000, 3);
      smallCache.set('a', 1);
      smallCache.set('b', 2);
      smallCache.set('c', 3);
      smallCache.set('d', 4); // 应该淘汰a（最先设置的）
      expect(smallCache.size()).toBe(3);
      expect(smallCache.has('d')).toBe(true);
    });
  });

  describe('统计', () => {
    it('应该返回正确的统计信息', () => {
      cache.set('k1', 'v1');
      cache.set('k2', 'v2');
      cache.get('k1');
      cache.get('k1');
      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(100);
      expect(stats.hitRate).toBe(1); // (2+0)/2
    });
  });

  describe('类型支持', () => {
    it('应该支持对象类型', () => {
      const objCache = new SimpleCache<{ name: string; value: number }>();
      objCache.set('obj', { name: 'test', value: 42 });
      const result = objCache.get('obj');
      expect(result?.name).toBe('test');
      expect(result?.value).toBe(42);
    });

    it('应该支持数组类型', () => {
      const arrCache = new SimpleCache<number[]>();
      arrCache.set('arr', [1, 2, 3]);
      expect(arrCache.get('arr')).toEqual([1, 2, 3]);
    });

    it('应该支持null值', () => {
      cache.set('null', null);
      expect(cache.get('null')).toBeNull();
    });
  });

  describe('keys', () => {
    it('应该返回所有key', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      const keys = cache.keys();
      expect(keys).toContain('a');
      expect(keys).toContain('b');
      expect(keys).toContain('c');
      expect(keys.length).toBe(3);
    });
  });
});
