import { describe, it, expect, beforeEach } from 'vitest';

// Advanced query cache with LRU, TTL, and key patterns
interface CacheEntry<T> {
  value: T;
  createdAt: number;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
}

class AdvancedQueryCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private maxSize: number;
  private defaultTTL: number;

  constructor(maxSize = 100, defaultTTL = 60000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  set<T>(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }
    this.cache.set(key, {
      value,
      createdAt: now,
      expiresAt: now + (ttl || this.defaultTTL),
      accessCount: 0,
      lastAccessed: now,
    });
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    // Re-insert for LRU ordering (Map preserves insertion order)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value as T;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  clearExpired(): number {
    const now = Date.now();
    let cleared = 0;
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleared++;
      }
    }
    return cleared;
  }

  clearByPattern(pattern: RegExp): number {
    let cleared = 0;
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        cleared++;
      }
    }
    return cleared;
  }

  getStats() {
    const now = Date.now();
    let expired = 0;
    let totalAccess = 0;
    for (const entry of this.cache.values()) {
      if (now > entry.expiresAt) expired++;
      totalAccess += entry.accessCount;
    }
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      expired,
      totalAccess,
      hitRate: this.cache.size > 0 ? totalAccess / this.cache.size : 0,
    };
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    if (oldestKey) this.cache.delete(oldestKey);
  }
}

describe('AdvancedQueryCache', () => {
  let cache: AdvancedQueryCache;

  beforeEach(() => {
    cache = new AdvancedQueryCache(5, 100);
  });

  describe('基本操作', () => {
    it('应该设置和获取值', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('应该返回undefined当key不存在', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('应该支持不同类型的数据', () => {
      const bigCache = new AdvancedQueryCache(10, 100);
      bigCache.set('str', 'hello');
      bigCache.set('num', 42);
      bigCache.set('obj', { a: 1, b: [2, 3] });
      bigCache.set('arr', [1, 2, 3]);
      bigCache.set('null', null);
      bigCache.set('bool', false);

      expect(bigCache.get('str')).toBe('hello');
      expect(bigCache.get('num')).toBe(42);
      expect(bigCache.get('obj')).toEqual({ a: 1, b: [2, 3] });
      expect(bigCache.get('arr')).toEqual([1, 2, 3]);
      expect(bigCache.get('null')).toBeNull();
      expect(bigCache.get('bool')).toBe(false);
    });

    it('应该覆盖已有key的值', () => {
      cache.set('key', 'v1');
      cache.set('key', 'v2');
      expect(cache.get('key')).toBe('v2');
      expect(cache.size()).toBe(1);
    });

    it('应该删除key', () => {
      cache.set('key', 'value');
      expect(cache.delete('key')).toBe(true);
      expect(cache.get('key')).toBeUndefined();
    });

    it('删除不存在的key返回false', () => {
      expect(cache.delete('nope')).toBe(false);
    });

    it('应该清空缓存', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();
      expect(cache.size()).toBe(0);
    });

    it('应该检查key是否存在', () => {
      cache.set('key', 'val');
      expect(cache.has('key')).toBe(true);
      expect(cache.has('missing')).toBe(false);
    });
  });

  describe('TTL过期', () => {
    it('应该在TTL后过期', async () => {
      cache.set('key', 'value', 50);
      expect(cache.get('key')).toBe('value');
      await new Promise(r => setTimeout(r, 60));
      expect(cache.get('key')).toBeUndefined();
    });

    it('has应该对过期key返回false', async () => {
      cache.set('key', 'val', 50);
      await new Promise(r => setTimeout(r, 60));
      expect(cache.has('key')).toBe(false);
    });

    it('应该清除过期条目', async () => {
      cache.set('a', 1, 50);
      cache.set('b', 2, 200);
      await new Promise(r => setTimeout(r, 60));
      const cleared = cache.clearExpired();
      expect(cleared).toBe(1);
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(true);
    });

    it('使用默认TTL', () => {
      const fastCache = new AdvancedQueryCache(10, 50);
      fastCache.set('key', 'val');
      expect(fastCache.get('key')).toBe('val');
    });

    it('不同key可以有不同TTL', async () => {
      cache.set('fast', 'a', 30);
      cache.set('slow', 'b', 100);
      await new Promise(r => setTimeout(r, 40));
      expect(cache.get('fast')).toBeUndefined();
      expect(cache.get('slow')).toBe('b');
    });
  });

  describe('LRU淘汰', () => {
    it('应该在容量满时淘汰最久未访问的', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4);
      cache.set('e', 5);
      // a是最久未访问的
      cache.set('f', 6);
      expect(cache.has('a')).toBe(false);
      expect(cache.has('f')).toBe(true);
    });

    it('访问应该更新LRU位置', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4);
      cache.set('e', 5);
      cache.get('a'); // a现在是最近访问
      cache.set('f', 6);
      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
    });

    it('覆盖不应增加size', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4);
      cache.set('e', 5);
      cache.set('a', 99); // 覆盖
      expect(cache.size()).toBe(5);
    });
  });

  describe('模式匹配清除', () => {
    it('应该按正则模式清除', () => {
      cache.set('user:1', 'alice');
      cache.set('user:2', 'bob');
      cache.set('stock:600000', '浦发银行');
      cache.set('stock:000001', '平安银行');
      const cleared = cache.clearByPattern(/^user:/);
      expect(cleared).toBe(2);
      expect(cache.has('stock:600000')).toBe(true);
      expect(cache.has('user:1')).toBe(false);
    });

    it('不匹配任何key时返回0', () => {
      cache.set('key', 'val');
      expect(cache.clearByPattern(/xyz/)).toBe(0);
    });
  });

  describe('统计信息', () => {
    it('应该返回正确的统计', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.get('a');
      cache.get('a');
      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(5);
      expect(stats.totalAccess).toBe(2);
    });

    it('应该列出所有keys', () => {
      cache.set('x', 1);
      cache.set('y', 2);
      expect(cache.keys().sort()).toEqual(['x', 'y']);
    });

    it('空缓存的统计', () => {
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.expired).toBe(0);
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('边界条件', () => {
    it('maxSize为1应该只有一个entry', () => {
      const tinyCache = new AdvancedQueryCache(1, 100);
      tinyCache.set('a', 1);
      tinyCache.set('b', 2);
      expect(tinyCache.size()).toBe(1);
      expect(tinyCache.has('b')).toBe(true);
    });

    it('空字符串key是合法的', () => {
      cache.set('', 'empty-key');
      expect(cache.get('')).toBe('empty-key');
    });

    it('非常长的key是合法的', () => {
      const longKey = 'x'.repeat(1000);
      cache.set(longKey, 'long');
      expect(cache.get(longKey)).toBe('long');
    });

    it('特殊字符key', () => {
      cache.set('key:with:colons', 1);
      cache.set('key.with.dots', 2);
      cache.set('key/with/slashes', 3);
      expect(cache.get('key:with:colons')).toBe(1);
      expect(cache.get('key.with.dots')).toBe(2);
      expect(cache.get('key/with/slashes')).toBe(3);
    });
  });
});
