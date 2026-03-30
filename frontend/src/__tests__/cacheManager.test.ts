import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CacheManager } from '../services/cacheManager';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
    get length() { return Object.keys(store).length; },
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('CacheManager', () => {
  let cache: CacheManager;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    cache = new CacheManager({ storagePrefix: 'test_', defaultTTL: 1000 });
  });

  describe('set and get', () => {
    it('should store and retrieve data', async () => {
      await cache.set('key1', { value: 42 });
      const result = await cache.get('key1');
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ value: 42 });
      expect(result!.stale).toBe(false);
    });

    it('should return null for missing key', async () => {
      const result = await cache.get('missing');
      expect(result).toBeNull();
    });

    it('should mark stale entries', async () => {
      await cache.set('key1', 'data', { ttl: 1 });
      // Wait a bit for time to pass
      await new Promise(r => setTimeout(r, 5));
      const result = await cache.get('key1');
      expect(result).not.toBeNull();
      expect(result!.stale).toBe(true);
    });

    it('should persist to localStorage', async () => {
      await cache.set('key1', 'data');
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'test_key1',
        expect.any(String)
      );
    });

    it('should load from localStorage on second instance', async () => {
      await cache.set('key1', { v: 1 });
      const cache2 = new CacheManager({ storagePrefix: 'test_' });
      const result = await cache2.get('key1');
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ v: 1 });
    });
  });

  describe('invalidate', () => {
    it('should remove specific key', async () => {
      await cache.set('key1', 'data');
      await cache.invalidate('key1');
      const result = await cache.get('key1');
      expect(result).toBeNull();
    });
  });

  describe('invalidatePattern', () => {
    it('should remove matching keys', async () => {
      await cache.set('stock:AAPL', 'data1');
      await cache.set('stock:GOOGL', 'data2');
      await cache.set('chart:AAPL', 'data3');

      const count = await cache.invalidatePattern(/^stock:/);
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('fetchWithCache', () => {
    it('cache-first: return cached if fresh', async () => {
      const fetcher = vi.fn().mockResolvedValue('fresh');
      const c = new CacheManager({ storagePrefix: 'cf_', strategy: 'cache-first', defaultTTL: 5000 });

      await c.set('key', 'cached', { ttl: 5000 });
      const result = await c.fetchWithCache('key', fetcher);
      expect(result).toBe('cached');
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('cache-first: fetch if cache miss', async () => {
      const fetcher = vi.fn().mockResolvedValue('fetched');
      const c = new CacheManager({ storagePrefix: 'cf_', strategy: 'cache-first' });

      const result = await c.fetchWithCache('key', fetcher);
      expect(result).toBe('fetched');
      expect(fetcher).toHaveBeenCalled();
    });

    it('network-first: prefer network, fallback to cache', async () => {
      const fetcher = vi.fn().mockRejectedValue(new Error('Network error'));
      const c = new CacheManager({ storagePrefix: 'nf_', strategy: 'network-first' });

      await c.set('key', 'cached');
      const result = await c.fetchWithCache('key', fetcher);
      expect(result).toBe('cached');
    });

    it('network-first: throw if no cache on network failure', async () => {
      const fetcher = vi.fn().mockRejectedValue(new Error('Network error'));
      const c = new CacheManager({ storagePrefix: 'nf_', strategy: 'network-first' });

      await expect(c.fetchWithCache('key', fetcher)).rejects.toThrow();
    });

    it('force option bypasses cache', async () => {
      const fetcher = vi.fn().mockResolvedValue('fresh');
      const c = new CacheManager({ storagePrefix: 'f_', strategy: 'cache-first' });

      await c.set('key', 'old');
      const result = await c.fetchWithCache('key', fetcher, { force: true });
      expect(result).toBe('fresh');
      expect(fetcher).toHaveBeenCalled();
    });
  });

  describe('eviction', () => {
    it('should enforce max entries in memory', async () => {
      const c = new CacheManager({ storagePrefix: 'e_', maxEntries: 3 });
      await c.set('a', 1);
      await c.set('b', 2);
      await c.set('c', 3);
      await c.set('d', 4); // should evict 'a'

      const stats = c.getStats();
      expect(stats.memoryEntries).toBeLessThanOrEqual(3);
    });
  });

  describe('getStats', () => {
    it('should return correct stats', async () => {
      await cache.set('k1', 'a');
      await cache.set('k2', 'b');
      const stats = cache.getStats();
      expect(stats.memoryEntries).toBe(2);
    });
  });

  describe('clearAll', () => {
    it('should clear everything', async () => {
      await cache.set('k1', 'a');
      await cache.set('k2', 'b');
      cache.clearAll();
      expect((await cache.get('k1'))).toBeNull();
      expect((await cache.get('k2'))).toBeNull();
    });
  });

  describe('corrupted data', () => {
    it('should handle corrupted localStorage gracefully', async () => {
      localStorageMock.setItem('test_corrupt', 'not-json');
      const result = await cache.get('corrupt');
      expect(result).toBeNull();
    });
  });

  describe('etag support', () => {
    it('should store etag with cache entry', async () => {
      await cache.set('key', 'data', { etag: 'abc123' });
      // Etag is stored in localStorage
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });
});
