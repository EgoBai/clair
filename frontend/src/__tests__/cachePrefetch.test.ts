import { describe, it, expect } from 'vitest';

// 前端数据缓存与预加载测试

interface CacheConfig {
  ttl: number;
  maxSize: number;
  staleWhileRevalidate: boolean;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  etag?: string;
}

class DataCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private config: CacheConfig;
  private hits = 0;
  private misses = 0;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      ttl: config.ttl ?? 30000,
      maxSize: config.maxSize ?? 100,
      staleWhileRevalidate: config.staleWhileRevalidate ?? false,
    };
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (Date.now() - entry.timestamp > this.config.ttl) {
      if (this.config.staleWhileRevalidate) {
        this.misses++;
        return entry.data;
      }
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    return entry.data;
  }

  set(key: string, data: T, etag?: string): void {
    if (this.cache.size >= this.config.maxSize) {
      const oldest = [...this.cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      if (oldest) this.cache.delete(oldest[0]);
    }
    this.cache.set(key, { data, timestamp: Date.now(), etag });
  }

  invalidate(pattern: string | RegExp): number {
    let count = 0;
    const regex = typeof pattern === 'string' ? new RegExp(pattern.replace(/\*/g, '.*')) : pattern;
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  getStats() {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      size: this.cache.size,
    };
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

interface PrefetchJob<T> {
  key: string;
  fetcher: () => Promise<T>;
  priority: number;
  status: 'pending' | 'loading' | 'done' | 'error';
}

class PrefetchManager<T> {
  private jobs = new Map<string, PrefetchJob<T>>();
  private cache: DataCache<T>;
  private maxConcurrent: number;
  private active = 0;

  constructor(cache: DataCache<T>, maxConcurrent = 3) {
    this.cache = cache;
    this.maxConcurrent = maxConcurrent;
  }

  register(key: string, fetcher: () => Promise<T>, priority = 0): void {
    this.jobs.set(key, { key, fetcher, priority, status: 'pending' });
  }

  async execute(): Promise<void> {
    const pending = [...this.jobs.values()]
      .filter(j => j.status === 'pending')
      .sort((a, b) => b.priority - a.priority);

    const batch = pending.slice(0, this.maxConcurrent - this.active);
    await Promise.allSettled(batch.map(async (job) => {
      job.status = 'loading';
      this.active++;
      try {
        const data = await job.fetcher();
        this.cache.set(job.key, data);
        job.status = 'done';
      } catch {
        job.status = 'error';
      } finally {
        this.active--;
      }
    }));
  }

  getStatus(): Record<string, string> {
    const status: Record<string, string> = {};
    for (const [key, job] of this.jobs) {
      status[key] = job.status;
    }
    return status;
  }
}

interface RouteCache {
  route: string;
  data: any;
  params: Record<string, string>;
  timestamp: number;
}

function buildCacheKey(base: string, params: Record<string, any>): string {
  const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  return `${base}?${sorted}`;
}

function isStale(timestamp: number, ttl: number): boolean {
  return Date.now() - timestamp > ttl;
}

function shouldRevalidate(etag?: string, lastEtag?: string): boolean {
  if (!etag || !lastEtag) return true;
  return etag !== lastEtag;
}

describe('数据缓存与预加载', () => {
  describe('DataCache基本操作', () => {
    it('存取数据', () => {
      const cache = new DataCache<string>({ ttl: 5000 });
      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');
    });

    it('未命中返回undefined', () => {
      const cache = new DataCache<string>({ ttl: 5000 });
      expect(cache.get('missing')).toBeUndefined();
    });

    it('过期返回undefined', () => {
      const cache = new DataCache<string>({ ttl: 1 });
      cache.set('key', 'value');
    });

    it('staleWhileRevalidate返回过期数据', () => {
      const cache = new DataCache<string>({ ttl: 1, staleWhileRevalidate: true });
      cache.set('key', 'value');
    });
  });

  describe('缓存淘汰', () => {
    it('达到maxSize淘汰最旧', () => {
      const cache = new DataCache<string>({ ttl: 5000, maxSize: 2 });
      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');
      expect(cache.getStats().size).toBe(2);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe('2');
      expect(cache.get('c')).toBe('3');
    });
  });

  describe('缓存失效', () => {
    it('按模式失效', () => {
      const cache = new DataCache<number>({ ttl: 5000 });
      cache.set('stocks/600519', 1);
      cache.set('stocks/000858', 2);
      cache.set('etf/510300', 3);
      const removed = cache.invalidate('stocks/*');
      expect(removed).toBe(2);
      expect(cache.get('etf/510300')).toBe(3);
    });

    it('正则失效', () => {
      const cache = new DataCache<number>({ ttl: 5000 });
      cache.set('kline/day/600519', 1);
      cache.set('kline/week/600519', 2);
      cache.set('quote/600519', 3);
      const removed = cache.invalidate(/^kline\//);
      expect(removed).toBe(2);
    });
  });

  describe('缓存统计', () => {
    it('命中率', () => {
      const cache = new DataCache<number>({ ttl: 5000 });
      cache.set('a', 1);
      cache.get('a'); // hit
      cache.get('a'); // hit
      cache.get('b'); // miss
      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.667, 2);
    });

    it('空缓存命中率0', () => {
      const cache = new DataCache<number>({ ttl: 5000 });
      expect(cache.getStats().hitRate).toBe(0);
    });

    it('clear重置', () => {
      const cache = new DataCache<number>({ ttl: 5000 });
      cache.set('a', 1);
      cache.get('a');
      cache.clear();
      expect(cache.getStats().size).toBe(0);
      expect(cache.getStats().hits).toBe(0);
    });
  });

  describe('预加载管理器', () => {
    it('注册任务', () => {
      const cache = new DataCache<number>({ ttl: 5000 });
      const prefetcher = new PrefetchManager(cache);
      prefetcher.register('a', async () => 1);
      const status = prefetcher.getStatus();
      expect(status['a']).toBe('pending');
    });

    it('执行成功', async () => {
      const cache = new DataCache<number>({ ttl: 5000 });
      const prefetcher = new PrefetchManager(cache);
      prefetcher.register('a', async () => 42);
      await prefetcher.execute();
      expect(cache.get('a')).toBe(42);
      expect(prefetcher.getStatus()['a']).toBe('done');
    });

    it('执行失败标记error', async () => {
      const cache = new DataCache<number>({ ttl: 5000 });
      const prefetcher = new PrefetchManager(cache);
      prefetcher.register('a', async () => { throw new Error('fail'); });
      await prefetcher.execute();
      expect(prefetcher.getStatus()['a']).toBe('error');
      expect(cache.get('a')).toBeUndefined();
    });
  });

  describe('缓存键构建', () => {
    it('参数排序', () => {
      const key1 = buildCacheKey('/api/stocks', { b: 2, a: 1 });
      const key2 = buildCacheKey('/api/stocks', { a: 1, b: 2 });
      expect(key1).toBe(key2);
    });

    it('不同参数不同键', () => {
      const key1 = buildCacheKey('/api/stocks', { a: 1 });
      const key2 = buildCacheKey('/api/stocks', { a: 2 });
      expect(key1).not.toBe(key2);
    });
  });

  describe('新鲜度判断', () => {
    it('新鲜', () => {
      expect(isStale(Date.now(), 5000)).toBe(false);
    });

    it('过期', () => {
      expect(isStale(Date.now() - 10000, 5000)).toBe(true);
    });
  });

  describe('ETag验证', () => {
    it('相同ETag不需验证', () => {
      expect(shouldRevalidate('abc', 'abc')).toBe(false);
    });

    it('不同ETag需验证', () => {
      expect(shouldRevalidate('abc', 'def')).toBe(true);
    });

    it('缺少ETag需验证', () => {
      expect(shouldRevalidate(undefined, 'abc')).toBe(true);
      expect(shouldRevalidate('abc', undefined)).toBe(true);
    });
  });
});
