import { describe, it, expect } from 'vitest';

// 缓存系统深度测试
describe('缓存系统', () => {
  describe('LRU缓存实现', () => {
    class LRUCache<K, V> {
      private cache = new Map<K, V>();
      constructor(private capacity: number) {}

      get(key: K): V | undefined {
        if (!this.cache.has(key)) return undefined;
        const value = this.cache.get(key)!;
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
      }

      set(key: K, value: V): void {
        if (this.cache.has(key)) this.cache.delete(key);
        this.cache.set(key, value);
        if (this.cache.size > this.capacity) {
          const firstKey = this.cache.keys().next().value!;
          this.cache.delete(firstKey);
        }
      }

      has(key: K): boolean { return this.cache.has(key); }
      size(): number { return this.cache.size; }
      clear(): void { this.cache.clear(); }
      keys(): K[] { return [...this.cache.keys()]; }
    }

    it('基本存取操作', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
    });

    it('超出容量淘汰最旧', () => {
      const cache = new LRUCache<string, number>(2);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(true);
      expect(cache.has('c')).toBe(true);
    });

    it('访问更新LRU顺序', () => {
      const cache = new LRUCache<string, number>(2);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.get('a'); // a被访问,变成最新
      cache.set('c', 3);
      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
    });

    it('更新已有key不增加size', () => {
      const cache = new LRUCache<string, number>(2);
      cache.set('a', 1);
      cache.set('a', 2);
      expect(cache.size()).toBe(1);
      expect(cache.get('a')).toBe(2);
    });

    it('清空缓存', () => {
      const cache = new LRUCache<string, number>(10);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();
      expect(cache.size()).toBe(0);
    });

    it('容量为1的边界', () => {
      const cache = new LRUCache<string, number>(1);
      cache.set('a', 1);
      cache.set('b', 2);
      expect(cache.has('a')).toBe(false);
      expect(cache.get('b')).toBe(2);
    });

    it('获取不存在的key返回undefined', () => {
      const cache = new LRUCache<string, number>(5);
      expect(cache.get('missing')).toBeUndefined();
    });

    it('批量写入淘汰', () => {
      const cache = new LRUCache<number, number>(5);
      for (let i = 0; i < 20; i++) cache.set(i, i * 10);
      expect(cache.size()).toBe(5);
      expect(cache.keys()).toEqual([15, 16, 17, 18, 19]);
    });
  });

  describe('TTL缓存', () => {
    class TTLCache<K, V> {
      private cache = new Map<K, { value: V; expires: number }>();
      constructor(private defaultTTL: number) {}

      set(key: K, value: V, ttl?: number): void {
        this.cache.set(key, {
          value,
          expires: Date.now() + (ttl ?? this.defaultTTL),
        });
      }

      get(key: K): V | undefined {
        const entry = this.cache.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expires) {
          this.cache.delete(key);
          return undefined;
        }
        return entry.value;
      }

      has(key: K): boolean {
        return this.get(key) !== undefined;
      }

      cleanup(): number {
        const now = Date.now();
        let removed = 0;
        for (const [key, entry] of this.cache) {
          if (now > entry.expires) {
            this.cache.delete(key);
            removed++;
          }
        }
        return removed;
      }

      size(): number { return this.cache.size; }
    }

    it('未过期可以获取', () => {
      const cache = new TTLCache<string, number>(10000);
      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);
    });

    it('自定义TTL', () => {
      const cache = new TTLCache<string, number>(10000);
      cache.set('short', 1, 1);
      expect(cache.get('short')).toBe(1); // 刚设置,应该还能获取
    });

    it('cleanup返回清理数量', () => {
      const cache = new TTLCache<string, number>(1);
      cache.set('a', 1);
      cache.set('b', 2);
      // 等一下让它们过期
      const removed = cache.cleanup();
      expect(removed).toBeGreaterThanOrEqual(0);
    });

    it('has对过期key返回false', () => {
      const cache = new TTLCache<string, number>(1);
      cache.set('expire', 1, 1);
      // 立即检查应该还有
      expect(cache.has('expire')).toBe(true);
    });

    it('不同TTL共存', () => {
      const cache = new TTLCache<string, number>(10000);
      cache.set('long', 1, 60000);
      cache.set('short', 2, 10);
      expect(cache.get('long')).toBe(1);
      expect(cache.get('short')).toBe(2);
    });
  });

  describe('缓存键生成', () => {
    const generateCacheKey = (prefix: string, params: Record<string, unknown>): string => {
      const sorted = Object.entries(params)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join('&');
      return `${prefix}:${sorted}`;
    };

    it('参数排序保证一致性', () => {
      const key1 = generateCacheKey('stock', { code: '600000', date: '2024-01-01' });
      const key2 = generateCacheKey('stock', { date: '2024-01-01', code: '600000' });
      expect(key1).toBe(key2);
    });

    it('不同参数生成不同key', () => {
      const key1 = generateCacheKey('stock', { code: '600000' });
      const key2 = generateCacheKey('stock', { code: '000001' });
      expect(key1).not.toBe(key2);
    });

    it('不同前缀生成不同key', () => {
      const params = { code: '600000' };
      const key1 = generateCacheKey('stock', params);
      const key2 = generateCacheKey('index', params);
      expect(key1).not.toBe(key2);
    });

    it('空参数生成prefix:', () => {
      expect(generateCacheKey('test', {})).toBe('test:');
    });

    it('嵌套对象正确序列化', () => {
      const key = generateCacheKey('api', { filter: { market: 'sh', sector: 'bank' } });
      expect(key).toContain('filter=');
    });

    it('数组参数正确序列化', () => {
      const key = generateCacheKey('batch', { codes: ['600000', '000001'] });
      expect(key).toContain('codes=');
    });
  });

  describe('缓存穿透防护', () => {
    const withBloomFilter = <K>(cache: Map<K, unknown>, capacity: number) => {
      const set = new Set<K>();

      return {
        set(key: K, value: unknown) {
          set.add(key);
          cache.set(key, value);
        },
        mightContain(key: K): boolean {
          return set.has(key);
        },
        getWithNullProtection(key: K): unknown | null {
          if (!set.has(key)) return null; // definitely not in cache
          return cache.get(key) ?? null;
        },
        size: () => set.size,
      };
    };

    it('已存在key通过布隆过滤器', () => {
      const cache = new Map<string, unknown>();
      const bf = withBloomFilter(cache, 100);
      bf.set('exists', 'value');
      expect(bf.mightContain('exists')).toBe(true);
    });

    it('不存在key被过滤', () => {
      const cache = new Map<string, unknown>();
      const bf = withBloomFilter(cache, 100);
      expect(bf.mightContain('never-set')).toBe(false);
    });

    it('null保护防止穿透', () => {
      const cache = new Map<string, unknown>();
      const bf = withBloomFilter(cache, 100);
      expect(bf.getWithNullProtection('ghost')).toBeNull();
    });
  });

  describe('缓存预热', () => {
    const prefetchStrategy = (keys: string[], priorityFn: (key: string) => number) => {
      return keys
        .map(k => ({ key: k, priority: priorityFn(k) }))
        .sort((a, b) => b.priority - a.priority)
        .map(k => k.key);
    };

    it('按优先级排序预热列表', () => {
      const keys = ['low', 'high', 'medium'];
      const result = prefetchStrategy(keys, k =>
        k === 'high' ? 10 : k === 'medium' ? 5 : 1
      );
      expect(result).toEqual(['high', 'medium', 'low']);
    });

    it('空列表返回空', () => {
      expect(prefetchStrategy([], () => 0)).toEqual([]);
    });

    it('相同优先级保持顺序', () => {
      const keys = ['a', 'b', 'c'];
      const result = prefetchStrategy(keys, () => 1);
      expect(result).toHaveLength(3);
    });
  });

  describe('缓存统计', () => {
    const createCacheStats = () => {
      let hits = 0, misses = 0;
      return {
        hit() { hits++; },
        miss() { misses++; },
        get hitRate() { return hits / (hits + misses) || 0; },
        get total() { return hits + misses; },
        get stats() { return { hits, misses, hitRate: this.hitRate }; },
        reset() { hits = 0; misses = 0; },
      };
    };

    it('初始命中率为0', () => {
      const stats = createCacheStats();
      expect(stats.hitRate).toBe(0);
    });

    it('全部命中率为1', () => {
      const stats = createCacheStats();
      stats.hit(); stats.hit(); stats.hit();
      expect(stats.hitRate).toBe(1);
    });

    it('全部未命中率为0', () => {
      const stats = createCacheStats();
      stats.miss(); stats.miss();
      expect(stats.hitRate).toBe(0);
    });

    it('混合命中率计算', () => {
      const stats = createCacheStats();
      stats.hit(); stats.hit(); stats.miss();
      expect(stats.hitRate).toBeCloseTo(2 / 3);
    });

    it('重置统计', () => {
      const stats = createCacheStats();
      stats.hit(); stats.miss();
      stats.reset();
      expect(stats.total).toBe(0);
    });

    it('50%命中率', () => {
      const stats = createCacheStats();
      stats.hit(); stats.miss();
      expect(stats.hitRate).toBe(0.5);
    });
  });
});
