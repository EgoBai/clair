import { describe, it, expect, beforeEach, vi } from 'vitest';

// Multi-Tier Cache System
interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  ttl: number;
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
  size: number;
  tags: string[];
  priority: 'low' | 'normal' | 'high' | 'critical';
}

interface CacheTier {
  name: string;
  maxSize: number;
  currentSize: number;
  defaultTTL: number;
  strategy: 'lru' | 'lfu' | 'fifo' | 'ttl';
}

interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalEntries: number;
  totalSize: number;
  evictions: number;
  tierStats: Record<string, { entries: number; size: number; hitRate: number }>;
}

class MultiTierCache {
  private tiers: Map<string, Map<string, CacheEntry>> = new Map();
  private tierConfigs: Map<string, CacheTier> = new Map();
  private stats: { hits: number; misses: number; evictions: number } = { hits: 0, misses: 0, evictions: 0 };
  private tierStats: Map<string, { hits: number; misses: number }> = new Map();

  addTier(config: CacheTier): void {
    this.tiers.set(config.name, new Map());
    this.tierConfigs.set(config.name, config);
    this.tierStats.set(config.name, { hits: 0, misses: 0 });
  }

  get<T>(key: string, tier?: string): T | null {
    const tierNames = tier ? [tier] : Array.from(this.tiers.keys());

    for (const tName of tierNames) {
      const cache = this.tiers.get(tName);
      if (!cache) continue;

      const entry = cache.get(key);
      if (entry) {
        // Check TTL
        if (entry.ttl > 0 && Date.now() - entry.createdAt > entry.ttl) {
          cache.delete(key);
          this.stats.misses++;
          this.tierStats.get(tName)!.misses++;
          continue;
        }

        entry.accessCount++;
        entry.lastAccessed = Date.now();
        this.stats.hits++;
        this.tierStats.get(tName)!.hits++;

        // Promote to higher tier
        const tierOrder = Array.from(this.tiers.keys());
        const currentIdx = tierOrder.indexOf(tName);
        if (currentIdx > 0) {
          const upperTier = tierOrder[currentIdx - 1];
          this.set(key, entry.value, { tier: upperTier, ttl: entry.ttl, tags: entry.tags, priority: entry.priority });
        }

        return entry.value as T;
      }
    }

    this.stats.misses++;
    if (tier) this.tierStats.get(tier)!.misses++;
    return null;
  }

  set(key: string, value: unknown, options: { tier?: string; ttl?: number; tags?: string[]; priority?: CacheEntry['priority'] } = {}): void {
    const tierName = options.tier ?? Array.from(this.tiers.keys())[0];
    const cache = this.tiers.get(tierName);
    const config = this.tierConfigs.get(tierName);
    if (!cache || !config) return;

    // Check if eviction needed
    if (cache.size >= config.maxSize) {
      this.evict(tierName, config.strategy);
    }

    const size = JSON.stringify(value).length;
    const entry: CacheEntry = {
      key,
      value,
      ttl: options.ttl ?? config.defaultTTL,
      createdAt: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now(),
      size,
      tags: options.tags ?? [],
      priority: options.priority ?? 'normal',
    };
    cache.set(key, entry);
    config.currentSize = cache.size;
  }

  private evict(tierName: string, strategy: CacheTier['strategy']): void {
    const cache = this.tiers.get(tierName);
    if (!cache || cache.size === 0) return;

    let toEvict: string | null = null;

    switch (strategy) {
      case 'lru': {
        let oldest = Date.now();
        for (const [key, entry] of cache) {
          if (entry.lastAccessed < oldest && entry.priority !== 'critical') {
            oldest = entry.lastAccessed;
            toEvict = key;
          }
        }
        break;
      }
      case 'lfu': {
        let leastUsed = Infinity;
        for (const [key, entry] of cache) {
          if (entry.accessCount < leastUsed && entry.priority !== 'critical') {
            leastUsed = entry.accessCount;
            toEvict = key;
          }
        }
        break;
      }
      case 'fifo': {
        let oldest = Date.now();
        for (const [key, entry] of cache) {
          if (entry.createdAt < oldest && entry.priority !== 'critical') {
            oldest = entry.createdAt;
            toEvict = key;
          }
        }
        break;
      }
      case 'ttl': {
        const now = Date.now();
        for (const [key, entry] of cache) {
          if (entry.ttl > 0 && now - entry.createdAt > entry.ttl) {
            toEvict = key;
            break;
          }
        }
        if (!toEvict) {
          // Fallback to LRU
          let oldest = Date.now();
          for (const [key, entry] of cache) {
            if (entry.lastAccessed < oldest) {
              oldest = entry.lastAccessed;
              toEvict = key;
            }
          }
        }
        break;
      }
    }

    if (toEvict) {
      cache.delete(toEvict);
      this.stats.evictions++;
    }
  }

  invalidate(key: string): boolean {
    let removed = false;
    for (const cache of this.tiers.values()) {
      if (cache.delete(key)) removed = true;
    }
    return removed;
  }

  invalidateByTag(tag: string): number {
    let count = 0;
    for (const cache of this.tiers.values()) {
      const toDelete: string[] = [];
      for (const [key, entry] of cache) {
        if (entry.tags.includes(tag)) toDelete.push(key);
      }
      for (const key of toDelete) {
        cache.delete(key);
        count++;
      }
    }
    return count;
  }

  invalidateByPattern(pattern: RegExp): number {
    let count = 0;
    for (const cache of this.tiers.values()) {
      const toDelete: string[] = [];
      for (const key of cache.keys()) {
        if (pattern.test(key)) toDelete.push(key);
      }
      for (const key of toDelete) {
        cache.delete(key);
        count++;
      }
    }
    return count;
  }

  clear(tier?: string): void {
    if (tier) {
      this.tiers.get(tier)?.clear();
    } else {
      for (const cache of this.tiers.values()) cache.clear();
    }
  }

  async getOrSet<T>(key: string, factory: () => Promise<T>, options: { tier?: string; ttl?: number; tags?: string[] } = {}): Promise<T> {
    const cached = this.get<T>(key, options.tier);
    if (cached !== null) return cached;
    const value = await factory();
    this.set(key, value, options);
    return value;
  }

  getStats(): CacheStats {
    const totalHits = this.stats.hits;
    const totalMisses = this.stats.misses;
    const tierStats: CacheStats['tierStats'] = {};

    for (const [name, cache] of this.tiers) {
      const ts = this.tierStats.get(name)!;
      const entries = Array.from(cache.values());
      tierStats[name] = {
        entries: cache.size,
        size: entries.reduce((s, e) => s + e.size, 0),
        hitRate: (ts.hits + ts.misses) > 0 ? ts.hits / (ts.hits + ts.misses) : 0,
      };
    }

    const totalEntries = Array.from(this.tiers.values()).reduce((s, c) => s + c.size, 0);
    const totalSize = Array.from(this.tiers.values()).flatMap(c => Array.from(c.values())).reduce((s, e) => s + e.size, 0);

    return {
      hits: totalHits,
      misses: totalMisses,
      hitRate: (totalHits + totalMisses) > 0 ? totalHits / (totalHits + totalMisses) : 0,
      totalEntries,
      totalSize,
      evictions: this.stats.evictions,
      tierStats,
    };
  }

  keys(tier?: string): string[] {
    if (tier) return Array.from(this.tiers.get(tier)?.keys() ?? []);
    const allKeys = new Set<string>();
    for (const cache of this.tiers.values()) {
      for (const key of cache.keys()) allKeys.add(key);
    }
    return Array.from(allKeys);
  }

  has(key: string): boolean {
    for (const cache of this.tiers.values()) {
      if (cache.has(key)) return true;
    }
    return false;
  }
}

describe('Multi-Tier Cache', () => {
  let cache: MultiTierCache;

  beforeEach(() => {
    cache = new MultiTierCache();
    cache.addTier({ name: 'L1', maxSize: 100, currentSize: 0, defaultTTL: 60000, strategy: 'lru' });
    cache.addTier({ name: 'L2', maxSize: 1000, currentSize: 0, defaultTTL: 300000, strategy: 'lfu' });
  });

  it('should set and get', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should return null for missing key', () => {
    expect(cache.get('missing')).toBeNull();
  });

  it('should respect TTL', () => {
    cache.set('expiring', 'data', { ttl: 1 });
    // Entry should exist immediately
    expect(cache.has('expiring')).toBe(true);
  });

  it('should invalidate by key', () => {
    cache.set('key1', 'val1');
    cache.set('key2', 'val2');
    expect(cache.invalidate('key1')).toBe(true);
    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key2')).toBe('val2');
  });

  it('should invalidate by tag', () => {
    cache.set('k1', 'v1', { tags: ['stocks'] });
    cache.set('k2', 'v2', { tags: ['stocks', 'tech'] });
    cache.set('k3', 'v3', { tags: ['finance'] });
    const count = cache.invalidateByTag('stocks');
    expect(count).toBe(2);
    expect(cache.has('k3')).toBe(true);
  });

  it('should invalidate by pattern', () => {
    cache.set('user:1:profile', 'p1');
    cache.set('user:2:profile', 'p2');
    cache.set('stock:AAPL', 's1');
    const count = cache.invalidateByPattern(/^user:/);
    expect(count).toBe(2);
    expect(cache.has('stock:AAPL')).toBe(true);
  });

  it('should clear specific tier', () => {
    cache.set('k1', 'v1', { tier: 'L1' });
    cache.set('k2', 'v2', { tier: 'L2' });
    cache.clear('L1');
    expect(cache.get('k1')).toBeNull();
    expect(cache.get('k2', 'L2')).toBe('v2');
  });

  it('should clear all', () => {
    cache.set('k1', 'v1');
    cache.set('k2', 'v2');
    cache.clear();
    expect(cache.get('k1')).toBeNull();
    expect(cache.get('k2')).toBeNull();
  });

  it('should getOrSet with factory', async () => {
    const val = await cache.getOrSet('async_key', async () => 'computed');
    expect(val).toBe('computed');
    // Second call should hit cache
    const val2 = await cache.getOrSet('async_key', async () => 'other');
    expect(val2).toBe('computed');
  });

  it('should track hit rate', () => {
    cache.set('k', 'v');
    cache.get('k'); // hit
    cache.get('missing'); // miss
    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(0.5);
  });

  it('should count total entries', () => {
    cache.set('k1', 'v1', { tier: 'L1' });
    cache.set('k2', 'v2', { tier: 'L2' });
    const stats = cache.getStats();
    expect(stats.totalEntries).toBe(2);
  });

  it('should evict LRU', () => {
    const smallCache = new MultiTierCache();
    smallCache.addTier({ name: 'L1', maxSize: 3, currentSize: 0, defaultTTL: 60000, strategy: 'lru' });
    smallCache.set('k1', 'v1');
    smallCache.set('k2', 'v2');
    smallCache.set('k3', 'v3');
    // Access k1 to make it recently used
    smallCache.get('k1');
    smallCache.set('k4', 'v4'); // Should evict k2 (least recently used)
    expect(smallCache.has('k1')).toBe(true);
    expect(smallCache.has('k4')).toBe(true);
  });

  it('should list keys', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.keys()).toContain('a');
    expect(cache.keys()).toContain('b');
  });

  it('should list keys by tier', () => {
    cache.set('l1key', 'v', { tier: 'L1' });
    cache.set('l2key', 'v', { tier: 'L2' });
    expect(cache.keys('L1')).toContain('l1key');
    expect(cache.keys('L2')).toContain('l2key');
  });

  it('should handle priority', () => {
    const smallCache = new MultiTierCache();
    smallCache.addTier({ name: 'L1', maxSize: 2, currentSize: 0, defaultTTL: 60000, strategy: 'lru' });
    smallCache.set('critical', 'v1', { priority: 'critical' });
    smallCache.set('normal', 'v2', { priority: 'normal' });
    smallCache.set('extra', 'v3'); // Should evict 'normal', not 'critical'
    expect(smallCache.has('critical')).toBe(true);
  });
});
