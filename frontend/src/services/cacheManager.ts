/**
 * Cache Manager Service
 * 缓存管理器 - 用于离线数据缓存和策略管理
 */

export interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl: number;
  etag?: string;
  staleWhileRevalidate?: boolean;
}

export interface CacheConfig {
  defaultTTL: number;
  maxEntries: number;
  storagePrefix: string;
  strategy: 'cache-first' | 'network-first' | 'stale-while-revalidate';
}

const DEFAULT_CONFIG: CacheConfig = {
  defaultTTL: 5 * 60 * 1000, // 5 minutes
  maxEntries: 200,
  storagePrefix: 'a_stock_cache_',
  strategy: 'stale-while-revalidate',
};

import { safeGetItem, safeSetItem, safeRemoveItem, safeKey, safeLength } from '../utils/safeStorage';

export class CacheManager {
  private config: CacheConfig;
  private memoryCache: Map<string, CacheEntry> = new Map();
  private accessOrder: string[] = [];

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async get<T>(key: string): Promise<{ data: T; stale: boolean } | null> {
    // Check memory cache first
    const memEntry = this.memoryCache.get(key) as CacheEntry<T> | undefined;
    if (memEntry) {
      const stale = Date.now() - memEntry.timestamp > memEntry.ttl;
      this.updateAccessOrder(key);
      return { data: memEntry.data, stale };
    }

    // Check localStorage
    try {
      const stored = safeGetItem(this.config.storagePrefix + key);
      if (stored) {
        const entry: CacheEntry<T> = JSON.parse(stored);
        const stale = Date.now() - entry.timestamp > entry.ttl;

        // Promote to memory cache
        this.memoryCache.set(key, entry as CacheEntry);
        this.updateAccessOrder(key);

        return { data: entry.data, stale };
      }
    } catch {
      // Parse error, remove corrupted entry
      safeRemoveItem(this.config.storagePrefix + key);
    }

    return null;
  }

  async set<T>(
    key: string,
    data: T,
    options: Partial<Pick<CacheEntry, 'ttl' | 'etag' | 'staleWhileRevalidate'>> = {}
  ): Promise<void> {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: options.ttl ?? this.config.defaultTTL,
      etag: options.etag,
      staleWhileRevalidate: options.staleWhileRevalidate,
    };

    // Enforce max entries
    this.enforceMaxEntries();

    // Store in memory
    this.memoryCache.set(key, entry as CacheEntry);
    this.updateAccessOrder(key);

    // Persist to localStorage
    try {
      safeSetItem(
        this.config.storagePrefix + key,
        JSON.stringify(entry)
      );
    } catch {
      // Storage full, evict oldest
      this.evictOldest();
      try {
        safeSetItem(
          this.config.storagePrefix + key,
          JSON.stringify(entry)
        );
      } catch {
        // Give up
      }
    }
  }

  async invalidate(key: string): Promise<void> {
    this.memoryCache.delete(key);
    safeRemoveItem(this.config.storagePrefix + key);
    this.accessOrder = this.accessOrder.filter(k => k !== key);
  }

  async invalidatePattern(pattern: RegExp): Promise<number> {
    let count = 0;

    // Memory cache
    for (const key of this.memoryCache.keys()) {
      if (pattern.test(key)) {
        this.memoryCache.delete(key);
        count++;
      }
    }

    // localStorage
    for (let i = 0; i < safeLength(); i++) {
      const storageKey = safeKey(i);
      if (storageKey?.startsWith(this.config.storagePrefix)) {
        const cacheKey = storageKey.slice(this.config.storagePrefix.length);
        if (pattern.test(cacheKey)) {
          safeRemoveItem(storageKey);
          count++;
        }
      }
    }

    this.accessOrder = this.accessOrder.filter(k => !pattern.test(k));
    return count;
  }

  async fetchWithCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: { ttl?: number; force?: boolean } = {}
  ): Promise<T> {
    if (options.force) {
      const data = await fetcher();
      await this.set(key, data, { ttl: options.ttl });
      return data;
    }

    switch (this.config.strategy) {
      case 'cache-first': {
        const cached = await this.get<T>(key);
        if (cached && !cached.stale) return cached.data;
        const data = await fetcher();
        await this.set(key, data, { ttl: options.ttl });
        return data;
      }

      case 'network-first': {
        try {
          const data = await fetcher();
          await this.set(key, data, { ttl: options.ttl });
          return data;
        } catch {
          const cached = await this.get<T>(key);
          if (cached) return cached.data;
          throw new Error('Network failed and no cache available');
        }
      }

      case 'stale-while-revalidate': {
        const cached = await this.get<T>(key);
        if (cached && !cached.stale) return cached.data;

        // Start background revalidation
        fetcher()
          .then(data => this.set(key, data, { ttl: options.ttl }))
          .catch(() => {}); // Silently fail background update

        if (cached) return cached.data;

        // No cache, must wait for network
        const data = await fetcher();
        await this.set(key, data, { ttl: options.ttl });
        return data;
      }
    }
  }

  private updateAccessOrder(key: string): void {
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);
  }

  private enforceMaxEntries(): void {
    while (this.memoryCache.size >= this.config.maxEntries) {
      const oldest = this.accessOrder.shift();
      if (oldest) {
        this.memoryCache.delete(oldest);
      } else {
        break;
      }
    }
  }

  private evictOldest(): void {
    for (let i = 0; i < safeLength() && i < 5; i++) {
      const key = safeKey(i);
      if (key?.startsWith(this.config.storagePrefix)) {
        safeRemoveItem(key);
      }
    }
  }

  getStats(): { memoryEntries: number; storageEntries: number } {
    let storageEntries = 0;
    for (let i = 0; i < safeLength(); i++) {
      if (safeKey(i)?.startsWith(this.config.storagePrefix)) {
        storageEntries++;
      }
    }
    return { memoryEntries: this.memoryCache.size, storageEntries };
  }

  clearAll(): void {
    this.memoryCache.clear();
    this.accessOrder = [];
    for (let i = safeLength() - 1; i >= 0; i--) {
      const key = safeKey(i);
      if (key?.startsWith(this.config.storagePrefix)) {
        safeRemoveItem(key);
      }
    }
  }
}

export const stockCache = new CacheManager({
  defaultTTL: 2 * 60 * 1000, // 2 min for stock data
  storagePrefix: 'a_stock_',
});

export const chartCache = new CacheManager({
  defaultTTL: 10 * 60 * 1000, // 10 min for chart data
  storagePrefix: 'a_chart_',
  maxEntries: 50,
});
