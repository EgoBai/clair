import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// 前端数据预取和缓存引擎
interface CacheConfig {
  maxSize: number;
  defaultTTL: number;
  strategy: 'lru' | 'fifo' | 'lfu';
}

interface PrefetchRule {
  pattern: RegExp;
  priority: number;
  ttl: number;
  prefetchOnHover: boolean;
  prefetchOnVisible: boolean;
}

class DataCache {
  private cache: Map<string, { data: any; expiresAt: number; accessCount: number; lastAccess: number }> = new Map();
  private config: CacheConfig;

  constructor(config: CacheConfig) {
    this.config = config;
  }

  set(key: string, data: any, ttl?: number): void {
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evict();
    }
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttl || this.config.defaultTTL),
      accessCount: 0,
      lastAccess: Date.now(),
    });
  }

  get(key: string): any | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    entry.accessCount++;
    entry.lastAccess = Date.now();
    return entry.data;
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
    let count = 0;
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  private evict(): void {
    if (this.config.strategy === 'lru') {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [key, entry] of this.cache) {
        if (oldestKey === null || entry.lastAccess < oldestTime) {
          oldestTime = entry.lastAccess;
          oldestKey = key;
        }
      }
      if (oldestKey) this.cache.delete(oldestKey);
    } else if (this.config.strategy === 'lfu') {
      let leastUsedKey: string | null = null;
      let leastCount = Infinity;
      for (const [key, entry] of this.cache) {
        if (entry.accessCount < leastCount) {
          leastCount = entry.accessCount;
          leastUsedKey = key;
        }
      }
      if (leastUsedKey) this.cache.delete(leastUsedKey);
    } else { // fifo
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
  }
}

class PrefetchManager {
  private rules: PrefetchRule[] = [];
  private prefetchQueue: { url: string; priority: number }[] = [];
  private prefetched: Set<string> = new Set();
  private maxConcurrent: number;

  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  addRule(rule: PrefetchRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  shouldPrefetch(url: string): PrefetchRule | null {
    for (const rule of this.rules) {
      if (rule.pattern.test(url)) return rule;
    }
    return null;
  }

  enqueue(url: string): boolean {
    if (this.prefetched.has(url)) return false;
    const rule = this.shouldPrefetch(url);
    if (!rule) return false;
    this.prefetchQueue.push({ url, priority: rule.priority });
    this.prefetchQueue.sort((a, b) => b.priority - a.priority);
    return true;
  }

  dequeue(): string | null {
    const item = this.prefetchQueue.shift();
    if (!item) return null;
    this.prefetched.add(item.url);
    return item.url;
  }

  isPrefetched(url: string): boolean {
    return this.prefetched.has(url);
  }

  getQueueSize(): number {
    return this.prefetchQueue.length;
  }

  clear(): void {
    this.prefetchQueue = [];
    this.prefetched.clear();
  }
}

function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = function (this: any, ...args: any[]) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
      timer = null;
    }, delay);
  } as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}

function throttle<T extends (...args: any[]) => any>(fn: T, interval: number): T {
  let lastTime = 0;
  return function (this: any, ...args: any[]) {
    const now = Date.now();
    if (now - lastTime >= interval) {
      lastTime = now;
      fn.apply(this, args);
    }
  } as T;
}

function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as any;
  if (obj instanceof Array) return obj.map(item => deepClone(item)) as any;
  if (obj instanceof Map) return new Map(Array.from(obj.entries()).map(([k, v]) => [deepClone(k), deepClone(v)])) as any;
  if (obj instanceof Set) return new Set(Array.from(obj).map(v => deepClone(v))) as any;

  const result: any = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      result[key] = deepClone((obj as any)[key]);
    }
  }
  return result;
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      return a.every((item, i) => deepEqual(item, b[i]));
    }
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(key => deepEqual(a[key], b[key]));
  }

  return false;
}

describe('数据预取和缓存引擎', () => {
  describe('DataCache - LRU策略', () => {
    let cache: DataCache;

    beforeEach(() => {
      cache = new DataCache({ maxSize: 3, defaultTTL: 100, strategy: 'lru' });
    });

    it('应该存储和获取数据', () => {
      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);
    });

    it('不存在的key返回undefined', () => {
      expect(cache.get('x')).toBeUndefined();
    });

    it('LRU淘汰最久未访问的', async () => {
      cache.set('a', 1);
      await new Promise(r => setTimeout(r, 5));
      cache.set('b', 2);
      await new Promise(r => setTimeout(r, 5));
      cache.set('c', 3);
      await new Promise(r => setTimeout(r, 5));
      cache.get('a'); // a变成最近访问
      cache.set('d', 4); // b被淘汰（最早设置且未被get刷新）
      expect(cache.has('b')).toBe(false);
      expect(cache.has('a')).toBe(true);
    });

    it('过期数据应该返回undefined', async () => {
      cache.set('a', 1, 50);
      await new Promise(r => setTimeout(r, 60));
      expect(cache.get('a')).toBeUndefined();
    });

    it('应该清除过期条目', async () => {
      cache.set('a', 1, 50);
      cache.set('b', 2, 200);
      await new Promise(r => setTimeout(r, 60));
      expect(cache.clearExpired()).toBe(1);
    });
  });

  describe('DataCache - LFU策略', () => {
    it('应该淘汰最少使用的', () => {
      const cache = new DataCache({ maxSize: 3, defaultTTL: 10000, strategy: 'lfu' });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.get('a'); cache.get('a'); cache.get('a'); // a最常用
      cache.get('b'); // b用了一次
      // c没用过 → c被淘汰
      cache.set('d', 4);
      expect(cache.has('c')).toBe(false);
      expect(cache.has('a')).toBe(true);
    });
  });

  describe('DataCache - FIFO策略', () => {
    it('应该淘汰最早加入的', () => {
      const cache = new DataCache({ maxSize: 3, defaultTTL: 10000, strategy: 'fifo' });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4); // a被淘汰
      expect(cache.has('a')).toBe(false);
      expect(cache.has('d')).toBe(true);
    });
  });

  describe('PrefetchManager', () => {
    let pm: PrefetchManager;

    beforeEach(() => {
      pm = new PrefetchManager();
      pm.addRule({ pattern: /\/api\/stock/, priority: 10, ttl: 30000, prefetchOnHover: true, prefetchOnVisible: false });
      pm.addRule({ pattern: /\/api\/market/, priority: 5, ttl: 60000, prefetchOnHover: false, prefetchOnVisible: true });
    });

    it('应该匹配规则', () => {
      expect(pm.shouldPrefetch('/api/stock/600000')).not.toBeNull();
      expect(pm.shouldPrefetch('/api/market/stats')).not.toBeNull();
      expect(pm.shouldPrefetch('/api/user/profile')).toBeNull();
    });

    it('应该按优先级入队', () => {
      pm.enqueue('/api/market/stats');
      pm.enqueue('/api/stock/600000');
      const first = pm.dequeue();
      expect(first).toBe('/api/stock/600000'); // 优先级10 > 5
    });

    it('已预取的URL不应该重复入队', () => {
      pm.enqueue('/api/stock/600000');
      pm.dequeue();
      expect(pm.enqueue('/api/stock/600000')).toBe(false);
    });

    it('不匹配规则的URL不应该入队', () => {
      expect(pm.enqueue('/other/url')).toBe(false);
    });

    it('应该检查预取状态', () => {
      pm.enqueue('/api/stock/600000');
      pm.dequeue();
      expect(pm.isPrefetched('/api/stock/600000')).toBe(true);
      expect(pm.isPrefetched('/other')).toBe(false);
    });

    it('clear应该清空所有', () => {
      pm.enqueue('/api/stock/600000');
      pm.clear();
      expect(pm.getQueueSize()).toBe(0);
      expect(pm.isPrefetched('/api/stock/600000')).toBe(false);
    });
  });

  describe('deepClone', () => {
    it('应该深拷贝对象', () => {
      const obj = { a: 1, b: { c: 2 } };
      const clone = deepClone(obj);
      clone.b.c = 3;
      expect(obj.b.c).toBe(2);
    });

    it('应该深拷贝数组', () => {
      const arr = [[1, 2], [3, 4]];
      const clone = deepClone(arr);
      clone[0][0] = 99;
      expect(arr[0][0]).toBe(1);
    });

    it('应该拷贝Date', () => {
      const date = new Date();
      const clone = deepClone(date);
      expect(clone.getTime()).toBe(date.getTime());
      expect(clone).not.toBe(date);
    });

    it('应该拷贝Map', () => {
      const map = new Map([['a', { v: 1 }]]);
      const clone = deepClone(map);
      expect(clone.get('a')).toEqual({ v: 1 });
      expect(clone.get('a')).not.toBe(map.get('a'));
    });

    it('null应该返回null', () => {
      expect(deepClone(null)).toBeNull();
    });

    it('基本类型应该原样返回', () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone('str')).toBe('str');
      expect(deepClone(true)).toBe(true);
    });
  });

  describe('deepEqual', () => {
    it('相同对象应该相等', () => {
      expect(deepEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toBe(true);
    });

    it('不同对象应该不相等', () => {
      expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    });

    it('相同数组应该相等', () => {
      expect(deepEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
    });

    it('不同长度数组应该不相等', () => {
      expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    });

    it('null vs null应该相等', () => {
      expect(deepEqual(null, null)).toBe(true);
    });

    it('null vs object应该不相等', () => {
      expect(deepEqual(null, {})).toBe(false);
    });

    it('基本类型应该用===', () => {
      expect(deepEqual(1, 1)).toBe(true);
      expect(deepEqual(1, '1')).toBe(false);
    });
  });
});
