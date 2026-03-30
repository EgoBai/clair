import { describe, it, expect } from 'vitest';

describe('Cache & Performance Engine', () => {
  // LRU Cache
  class LRUCache<K, V> {
    private map = new Map<K, V>();
    constructor(private capacity: number) {}
    get(key: K): V | undefined {
      if (!this.map.has(key)) return undefined;
      const val = this.map.get(key)!;
      this.map.delete(key);
      this.map.set(key, val);
      return val;
    }
    put(key: K, value: V): void {
      if (this.map.has(key)) this.map.delete(key);
      this.map.set(key, value);
      if (this.map.size > this.capacity) {
        const first = this.map.keys().next().value!;
        this.map.delete(first);
      }
    }
    size(): number { return this.map.size; }
    has(key: K): boolean { return this.map.has(key); }
    keys(): K[] { return [...this.map.keys()]; }
  }

  describe('LRU Cache', () => {
    it('基本存取', () => {
      const cache = new LRUCache<string, number>(3);
      cache.put('a', 1);
      expect(cache.get('a')).toBe(1);
    });
    it('容量限制', () => {
      const cache = new LRUCache(2);
      cache.put('a', 1);
      cache.put('b', 2);
      cache.put('c', 3);
      expect(cache.has('a')).toBe(false);
      expect(cache.has('c')).toBe(true);
    });
    it('访问刷新', () => {
      const cache = new LRUCache(2);
      cache.put('a', 1);
      cache.put('b', 2);
      cache.get('a');
      cache.put('c', 3);
      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
    });
    it('更新值', () => {
      const cache = new LRUCache(2);
      cache.put('a', 1);
      cache.put('a', 2);
      expect(cache.get('a')).toBe(2);
      expect(cache.size()).toBe(1);
    });
    it('不存在返回undefined', () => {
      expect(new LRUCache(5).get('x')).toBeUndefined();
    });
    it('容量1', () => {
      const cache = new LRUCache(1);
      cache.put('a', 1);
      cache.put('b', 2);
      expect(cache.has('a')).toBe(false);
      expect(cache.size()).toBe(1);
    });
    it('keys顺序', () => {
      const cache = new LRUCache(3);
      cache.put('a', 1);
      cache.put('b', 2);
      cache.put('c', 3);
      expect(cache.keys()).toEqual(['a', 'b', 'c']);
    });
    it('空缓存size为0', () => {
      expect(new LRUCache(10).size()).toBe(0);
    });
  });

  // 防抖/节流
  const debounce = <T extends (...args: any[]) => any>(fn: T, ms: number): T => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return ((...args: any[]) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    }) as T;
  };

  const throttle = <T extends (...args: any[]) => any>(fn: T, ms: number): T => {
    let last = 0;
    return ((...args: any[]) => {
      const now = Date.now();
      if (now - last >= ms) { last = now; fn(...args); }
    }) as T;
  };

  describe('防抖节流', () => {
    it('防抖函数创建', () => {
      const fn = debounce(() => {}, 100);
      expect(typeof fn).toBe('function');
    });
    it('节流函数创建', () => {
      const fn = throttle(() => {}, 100);
      expect(typeof fn).toBe('function');
    });
    it('防抖多次调用只执行一次', async () => {
      let count = 0;
      const fn = debounce(() => count++, 10);
      fn(); fn(); fn();
      await new Promise(r => setTimeout(r, 20));
      expect(count).toBe(1);
    });
    it('节流限频', async () => {
      let count = 0;
      const fn = throttle(() => count++, 50);
      fn(); fn(); fn();
      expect(count).toBe(1);
      await new Promise(r => setTimeout(r, 60));
      fn();
      expect(count).toBe(2);
    });
  });

  // 缓存策略
  class TTLCache<K, V> {
    private cache = new Map<K, { value: V; expiry: number }>();
    constructor(private defaultTTL: number) {}
    set(key: K, value: V, ttl?: number): void {
      this.cache.set(key, { value, expiry: Date.now() + (ttl || this.defaultTTL) });
    }
    get(key: K): V | undefined {
      const entry = this.cache.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiry) { this.cache.delete(key); return undefined; }
      return entry.value;
    }
    has(key: K): boolean { return this.get(key) !== undefined; }
    clear(): void { this.cache.clear(); }
    size(): number { return this.cache.size; }
    cleanup(): number {
      const now = Date.now();
      let removed = 0;
      for (const [k, v] of this.cache) {
        if (now > v.expiry) { this.cache.delete(k); removed++; }
      }
      return removed;
    }
  }

  describe('TTL缓存', () => {
    it('基本存取', () => {
      const cache = new TTLCache(10000);
      cache.set('k', 'v');
      expect(cache.get('k')).toBe('v');
    });
    it('过期返回undefined', async () => {
      const cache = new TTLCache(10);
      cache.set('k', 'v');
      await new Promise(r => setTimeout(r, 15));
      expect(cache.get('k')).toBeUndefined();
    });
    it('自定义TTL', () => {
      const cache = new TTLCache(1000);
      cache.set('k', 'v', 5000);
      expect(cache.get('k')).toBe('v');
    });
    it('清理过期', async () => {
      const cache = new TTLCache(5);
      cache.set('a', 1);
      cache.set('b', 2);
      await new Promise(r => setTimeout(r, 10));
      const removed = cache.cleanup();
      expect(removed).toBe(2);
    });
    it('清空', () => {
      const cache = new TTLCache(10000);
      cache.set('a', 1);
      cache.clear();
      expect(cache.size()).toBe(0);
    });
    it('不存在', () => {
      expect(new TTLCache(1000).has('x')).toBe(false);
    });
  });

  // 连接池模拟
  class ConnectionPool {
    private pool: boolean[] = [];
    private waiting: ((conn: number) => void)[] = [];
    constructor(private max: number) {
      for (let i = 0; i < max; i++) this.pool.push(true);
    }
    acquire(): Promise<number> {
      for (let i = 0; i < this.max; i++) {
        if (this.pool[i]) { this.pool[i] = false; return Promise.resolve(i); }
      }
      return new Promise(resolve => this.waiting.push(resolve));
    }
    release(conn: number): void {
      if (this.waiting.length > 0) {
        const next = this.waiting.shift()!;
        next(conn);
      } else {
        this.pool[conn] = true;
      }
    }
    available(): number { return this.pool.filter(Boolean).length; }
  }

  describe('连接池', () => {
    it('获取连接', async () => {
      const pool = new ConnectionPool(3);
      const conn = await pool.acquire();
      expect(conn).toBeGreaterThanOrEqual(0);
      expect(pool.available()).toBe(2);
    });
    it('释放连接', async () => {
      const pool = new ConnectionPool(2);
      const c1 = await pool.acquire();
      pool.release(c1);
      expect(pool.available()).toBe(2);
    });
    it('等待队列', async () => {
      const pool = new ConnectionPool(1);
      await pool.acquire();
      const p = pool.acquire();
      pool.release(0);
      const conn = await p;
      expect(conn).toBe(0);
    });
    it('全部占用', async () => {
      const pool = new ConnectionPool(2);
      await pool.acquire();
      await pool.acquire();
      expect(pool.available()).toBe(0);
    });
  });

  // 批处理器
  class BatchProcessor<T> {
    private batch: T[] = [];
    constructor(private batchSize: number, private flush: (items: T[]) => void) {}
    add(item: T): boolean {
      this.batch.push(item);
      if (this.batch.length >= this.batchSize) {
        this.drain();
        return true;
      }
      return false;
    }
    drain(): void {
      if (this.batch.length > 0) {
        this.flush([...this.batch]);
        this.batch = [];
      }
    }
    size(): number { return this.batch.length; }
  }

  describe('批处理器', () => {
    it('不满不触发', () => {
      let flushed: number[] = [];
      const bp = new BatchProcessor<number>(3, items => flushed = items);
      bp.add(1);
      expect(flushed.length).toBe(0);
    });
    it('满批触发', () => {
      let flushed: number[] = [];
      const bp = new BatchProcessor(2, items => flushed = items);
      bp.add(1);
      const triggered = bp.add(2);
      expect(triggered).toBe(true);
      expect(flushed.length).toBe(2);
    });
    it('手动排空', () => {
      let flushed: number[] = [];
      const bp = new BatchProcessor(10, items => flushed = items);
      bp.add(1); bp.add(2);
      bp.drain();
      expect(flushed.length).toBe(2);
    });
    it('排空后重置', () => {
      let callCount = 0;
      const bp = new BatchProcessor(2, () => callCount++);
      bp.add(1); bp.add(2);
      bp.add(3);
      expect(callCount).toBe(1);
      expect(bp.size()).toBe(1);
    });
    it('空排空不调用', () => {
      let called = false;
      const bp = new BatchProcessor(5, () => called = true);
      bp.drain();
      expect(called).toBe(false);
    });
  });

  // 重试策略
  const withRetry = async <T>(fn: () => Promise<T>, maxRetries: number = 3, delay: number = 100): Promise<T> => {
    let lastError: Error | undefined;
    for (let i = 0; i <= maxRetries; i++) {
      try { return await fn(); }
      catch (e) {
        lastError = e as Error;
        if (i < maxRetries) await new Promise(r => setTimeout(r, delay));
      }
    }
    throw lastError;
  };

  describe('重试策略', () => {
    it('首次成功', async () => {
      let attempts = 0;
      const result = await withRetry(async () => { attempts++; return 42; });
      expect(result).toBe(42);
      expect(attempts).toBe(1);
    });
    it('重试后成功', async () => {
      let attempts = 0;
      const result = await withRetry(async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return 'ok';
      }, 3, 10);
      expect(result).toBe('ok');
      expect(attempts).toBe(3);
    });
    it('全部失败抛错', async () => {
      let attempts = 0;
      try {
        await withRetry(async () => { attempts++; throw new Error('fail'); }, 2, 10);
      } catch (e) {
        expect((e as Error).message).toBe('fail');
      }
      expect(attempts).toBe(3);
    });
    it('零重试', async () => {
      let attempts = 0;
      try {
        await withRetry(async () => { attempts++; throw new Error('fail'); }, 0, 10);
      } catch {}
      expect(attempts).toBe(1);
    });
  });
});
