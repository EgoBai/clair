import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LRUCache,
  LFUCache,
  TTLCache,
  createCache,
} from '../utils/cacheEngine';

describe('cacheEngine', () => {
  describe('LRUCache', () => {
    let cache: LRUCache<string>;

    beforeEach(() => {
      cache = new LRUCache({ maxSize: 5, defaultTTL: 0 });
    });

    it('should set and get values', () => {
      cache.set('k1', 'v1');
      expect(cache.get('k1')).toBe('v1');
    });

    it('should return undefined for missing keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should evict LRU entry when full', () => {
      for (let i = 0; i < 5; i++) {
        cache.set(`k${i}`, `v${i}`);
      }
      // Full, adding k5 should evict k0 (least recently used)
      cache.set('k5', 'v5');
      expect(cache.get('k0')).toBeUndefined();
      expect(cache.get('k5')).toBe('v5');
    });

    it('should update LRU on get', () => {
      for (let i = 0; i < 5; i++) {
        cache.set(`k${i}`, `v${i}`);
      }
      // Access k0 to make it recently used
      cache.get('k0');
      // Now k1 should be evicted (oldest after k0 was moved)
      cache.set('k5', 'v5');
      expect(cache.get('k0')).toBe('v0');
      expect(cache.get('k1')).toBeUndefined();
    });

    it('should delete entries', () => {
      cache.set('k1', 'v1');
      expect(cache.delete('k1')).toBe(true);
      expect(cache.get('k1')).toBeUndefined();
    });

    it('should return false on delete nonexistent', () => {
      expect(cache.delete('nope')).toBe(false);
    });

    it('should check has', () => {
      cache.set('k1', 'v1');
      expect(cache.has('k1')).toBe(true);
      expect(cache.has('nope')).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('k1', 'v1');
      cache.set('k2', 'v2');
      cache.clear();
      expect(cache.getStats().size).toBe(0);
      expect(cache.get('k1')).toBeUndefined();
    });

    it('should track stats', () => {
      cache.set('k1', 'v1');
      cache.get('k1');
      cache.get('missing');

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.size).toBe(1);
    });

    it('should return keys and values', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      expect(cache.keys()).toEqual(['a', 'b']);
      expect(cache.values()).toEqual(['1', '2']);
    });

    it('should handle eviction callback', () => {
      const onEvict = vi.fn();
      const evictCache = new LRUCache({ maxSize: 2, onEvict });

      evictCache.set('k1', 'v1');
      evictCache.set('k2', 'v2');
      evictCache.set('k3', 'v3');

      expect(onEvict).toHaveBeenCalledWith('k1', expect.objectContaining({ key: 'k1' }));
    });

    it('should handle expired entries', () => {
      const ttlCache = new LRUCache({ defaultTTL: 50 });
      ttlCache.set('k1', 'v1');

      expect(ttlCache.get('k1')).toBe('v1');

      vi.useFakeTimers();
      vi.advanceTimersByTime(100);
      expect(ttlCache.get('k1')).toBeUndefined();
      vi.useRealTimers();
    });
  });

  describe('LFUCache', () => {
    let cache: LFUCache<string>;

    beforeEach(() => {
      cache = new LFUCache({ maxSize: 3, defaultTTL: 0 });
    });

    it('should set and get values', () => {
      cache.set('k1', 'v1');
      expect(cache.get('k1')).toBe('v1');
    });

    it('should evict least frequently used', () => {
      cache.set('k1', 'v1');
      cache.set('k2', 'v2');
      cache.set('k3', 'v3');

      // k1 and k2 accessed more
      cache.get('k1');
      cache.get('k2');

      // Add k4, should evict k3 (least frequently used)
      cache.set('k4', 'v4');
      expect(cache.get('k3')).toBeUndefined();
      expect(cache.get('k4')).toBe('v4');
    });

    it('should track stats', () => {
      cache.set('k1', 'v1');
      cache.get('k1');
      cache.get('missing');

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should handle clear', () => {
      cache.set('k1', 'v1');
      cache.clear();
      expect(cache.getStats().size).toBe(0);
    });

    it('should handle delete', () => {
      cache.set('k1', 'v1');
      expect(cache.delete('k1')).toBe(true);
      expect(cache.has('k1')).toBe(false);
    });
  });

  describe('TTLCache', () => {
    let cache: TTLCache<string>;

    beforeEach(() => {
      vi.useFakeTimers();
      cache = new TTLCache({ defaultTTL: 1000 });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should set and get values', () => {
      cache.set('k1', 'v1');
      expect(cache.get('k1')).toBe('v1');
    });

    it('should auto-expire entries', () => {
      cache.set('k1', 'v1', 500);
      vi.advanceTimersByTime(600);
      expect(cache.get('k1')).toBeUndefined();
    });

    it('should not expire before TTL', () => {
      cache.set('k1', 'v1', 1000);
      vi.advanceTimersByTime(500);
      expect(cache.get('k1')).toBe('v1');
    });

    it('should handle clear', () => {
      cache.set('k1', 'v1');
      cache.clear();
      expect(cache.getStats().size).toBe(0);
    });

    it('should handle delete', () => {
      cache.set('k1', 'v1');
      expect(cache.delete('k1')).toBe(true);
    });
  });

  describe('createCache', () => {
    it('should create LRU cache by default', () => {
      const cache = createCache();
      expect(cache).toBeInstanceOf(LRUCache);
    });

    it('should create LFU cache', () => {
      const cache = createCache('lfu');
      expect(cache).toBeInstanceOf(LFUCache);
    });

    it('should create TTL cache', () => {
      const cache = createCache('ttl');
      expect(cache).toBeInstanceOf(TTLCache);
    });
  });
});
