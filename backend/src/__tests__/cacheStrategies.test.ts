import { describe, it, expect } from 'vitest';

describe('缓存策略与性能优化', () => {
  // LRU缓存
  const createLRUCache = <K, V>(capacity: number) => {
    const cache = new Map<K, V>();
    return {
      get: (key: K): V | undefined => {
        if (!cache.has(key)) return undefined;
        const value = cache.get(key)!;
        cache.delete(key);
        cache.set(key, value);
        return value;
      },
      put: (key: K, value: V) => {
        if (cache.has(key)) cache.delete(key);
        else if (cache.size >= capacity) {
          const firstKey = cache.keys().next().value!;
          cache.delete(firstKey);
        }
        cache.set(key, value);
      },
      size: () => cache.size,
      has: (key: K) => cache.has(key),
      keys: () => Array.from(cache.keys()),
    };
  };

  describe('LRU缓存', () => {
    it('基本get/put', () => {
      const lru = createLRUCache<string, number>(3);
      lru.put('a', 1);
      lru.put('b', 2);
      expect(lru.get('a')).toBe(1);
    });
    it('容量淘汰', () => {
      const lru = createLRUCache<string, number>(2);
      lru.put('a', 1);
      lru.put('b', 2);
      lru.put('c', 3);
      expect(lru.has('a')).toBe(false);
      expect(lru.get('b')).toBe(2);
    });
    it('访问刷新', () => {
      const lru = createLRUCache<string, number>(2);
      lru.put('a', 1);
      lru.put('b', 2);
      lru.get('a'); // refresh 'a'
      lru.put('c', 3);
      expect(lru.has('a')).toBe(true);
      expect(lru.has('b')).toBe(false);
    });
    it('更新已有key', () => {
      const lru = createLRUCache<string, number>(2);
      lru.put('a', 1);
      lru.put('a', 10);
      expect(lru.get('a')).toBe(10);
      expect(lru.size()).toBe(1);
    });
    it('不存在的key', () => {
      const lru = createLRUCache<string, number>(2);
      expect(lru.get('x')).toBeUndefined();
    });
    it('容量为1', () => {
      const lru = createLRUCache<string, number>(1);
      lru.put('a', 1);
      lru.put('b', 2);
      expect(lru.has('a')).toBe(false);
      expect(lru.get('b')).toBe(2);
    });
  });

  // TTL缓存
  const createTTLCache = <V>(defaultTTL: number) => {
    const cache = new Map<string, { value: V; expires: number }>();
    return {
      set: (key: string, value: V, ttl = defaultTTL) => {
        cache.set(key, { value, expires: Date.now() + ttl });
      },
      get: (key: string): V | undefined => {
        const entry = cache.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expires) { cache.delete(key); return undefined; }
        return entry.value;
      },
      has: (key: string) => {
        const entry = cache.get(key);
        if (!entry) return false;
        if (Date.now() > entry.expires) { cache.delete(key); return false; }
        return true;
      },
      size: () => {
        let count = 0;
        for (const [k, v] of cache) {
          if (Date.now() <= v.expires) count++;
        }
        return count;
      },
      cleanup: () => {
        for (const [k, v] of cache) {
          if (Date.now() > v.expires) cache.delete(k);
        }
      },
    };
  };

  describe('TTL缓存', () => {
    it('基本设置获取', () => {
      const cache = createTTLCache<number>(10000);
      cache.set('key', 42);
      expect(cache.get('key')).toBe(42);
    });
    it('不存在的key', () => {
      const cache = createTTLCache<number>(10000);
      expect(cache.get('missing')).toBeUndefined();
    });
    it('清理过期条目', () => {
      const cache = createTTLCache<number>(10000);
      cache.set('a', 1);
      cache.set('b', 2);
      // manual expiry trick
      (cache as any).cleanup;
      cache.cleanup();
      expect(cache.size()).toBe(2); // not expired yet
    });
  });

  // 写穿透缓存
  const createWriteThroughCache = <V>() => {
    const cache = new Map<string, V>();
    const store = new Map<string, V>();
    return {
      read: (key: string) => cache.get(key) ?? store.get(key),
      write: (key: string, value: V) => {
        store.set(key, value);
        cache.set(key, value);
      },
      invalidate: (key: string) => cache.delete(key),
      cacheSize: () => cache.size,
      storeSize: () => store.size,
    };
  };

  describe('写穿透缓存', () => {
    it('写入同步', () => {
      const c = createWriteThroughCache<number>();
      c.write('k', 1);
      expect(c.cacheSize()).toBe(1);
      expect(c.storeSize()).toBe(1);
    });
    it('读取命中缓存', () => {
      const c = createWriteThroughCache<string>();
      c.write('k', 'v');
      expect(c.read('k')).toBe('v');
    });
    it('失效后从store读', () => {
      const c = createWriteThroughCache<string>();
      c.write('k', 'v');
      c.invalidate('k');
      expect(c.read('k')).toBe('v');
    });
  });

  // 缓存预热
  const warmCache = <K, V>(cache: Map<K, V>, loader: (keys: K[]) => Map<K, V>, keys: K[]) => {
    const missing = keys.filter(k => !cache.has(k));
    if (missing.length === 0) return { loaded: 0, hitRate: 1 };
    const loaded = loader(missing);
    for (const [k, v] of loaded) cache.set(k, v);
    return { loaded: loaded.size, hitRate: (keys.length - missing.length) / keys.length };
  };

  describe('缓存预热', () => {
    it('全部未命中', () => {
      const cache = new Map<string, number>();
      const result = warmCache(cache, (keys) => new Map(keys.map(k => [k, Number(k)])), ['1', '2', '3']);
      expect(result.loaded).toBe(3);
      expect(result.hitRate).toBe(0);
    });
    it('部分命中', () => {
      const cache = new Map<string, number>();
      cache.set('1', 1);
      const result = warmCache(cache, (keys) => new Map(keys.map(k => [k, Number(k)])), ['1', '2', '3']);
      expect(result.loaded).toBe(2);
      expect(result.hitRate).toBeCloseTo(1 / 3);
    });
    it('全部命中', () => {
      const cache = new Map<string, number>();
      cache.set('1', 1);
      cache.set('2', 2);
      const result = warmCache(cache, () => new Map(), ['1', '2']);
      expect(result.loaded).toBe(0);
      expect(result.hitRate).toBe(1);
    });
  });

  // 缓存穿透保护
  const createBloomFilter = (size: number) => {
    const bits = new Uint8Array(size);
    const hash = (s: string, seed: number) => {
      let h = seed;
      for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) % size;
      return Math.abs(h);
    };
    return {
      add: (item: string) => {
        for (let i = 0; i < 3; i++) bits[hash(item, i + 1)] = 1;
      },
      mightContain: (item: string) => {
        for (let i = 0; i < 3; i++) {
          if (bits[hash(item, i + 1)] === 0) return false;
        }
        return true;
      },
    };
  };

  describe('布隆过滤器', () => {
    it('添加后可能包含', () => {
      const bf = createBloomFilter(1000);
      bf.add('hello');
      expect(bf.mightContain('hello')).toBe(true);
    });
    it('未添加可能不包含', () => {
      const bf = createBloomFilter(1000);
      expect(bf.mightContain('world')).toBe(false);
    });
    it('多元素', () => {
      const bf = createBloomFilter(10000);
      ['a', 'b', 'c', 'd', 'e'].forEach(k => bf.add(k));
      expect(bf.mightContain('a')).toBe(true);
      expect(bf.mightContain('c')).toBe(true);
    });
  });

  // 批量加载
  const batchLoader = <K, V>(loadFn: (keys: K[]) => Promise<Map<K, V>>) => {
    let batch: K[] = [];
    let timer: any = null;
    const pending = new Map<K, { resolve: (v: V | undefined) => void }[]>();
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(async () => {
        const keys = [...batch];
        batch = [];
        timer = null;
        const results = await loadFn(keys);
        for (const key of keys) {
          const waiters = pending.get(key) || [];
          waiters.forEach(w => w.resolve(results.get(key)));
          pending.delete(key);
        }
      }, 0);
    };
    return {
      load: (key: K): Promise<V | undefined> => {
        return new Promise(resolve => {
          if (!pending.has(key)) pending.set(key, []);
          pending.get(key)!.push({ resolve });
          if (!batch.includes(key)) batch.push(key);
          schedule();
        });
      },
    };
  };

  describe('批量加载器', () => {
    it('合并请求', async () => {
      let loadCount = 0;
      const loader = batchLoader(async (keys: string[]) => {
        loadCount++;
        return new Map(keys.map(k => [k, `value-${k}`]));
      });
      const [v1, v2] = await Promise.all([loader.load('a'), loader.load('b')]);
      expect(loadCount).toBe(1);
      expect(v1).toBe('value-a');
      expect(v2).toBe('value-b');
    });
  });
});
