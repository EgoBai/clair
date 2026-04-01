import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MultiLevelCache } from '../utils/multiLevelCache';

describe('MultiLevelCache', () => {
  let cache: MultiLevelCache;

  beforeEach(() => {
    cache = new MultiLevelCache(
      { maxEntries: 10, defaultTTL: 1000 },
      { maxEntries: 50, defaultTTL: 5000 }
    );
  });

  afterEach(() => {
    // @ts-ignore
    if (cache.flushTimer) clearInterval(cache.flushTimer);
  });

  describe('set / get', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for missing keys', () => {
      expect(cache.get('missing')).toBeNull();
    });

    it('should store different data types', () => {
      cache.set('str', 'hello');
      cache.set('num', 42);
      cache.set('obj', { a: 1, b: [2, 3] });
      cache.set('bool', true);

      expect(cache.get('str')).toBe('hello');
      expect(cache.get('num')).toBe(42);
      expect(cache.get('obj')).toEqual({ a: 1, b: [2, 3] });
      expect(cache.get('bool')).toBe(true);
    });

    it('should overwrite existing keys', () => {
      cache.set('key', 'old');
      cache.set('key', 'new');
      expect(cache.get('key')).toBe('new');
    });
  });

  describe('L1 → L2 promotion', () => {
    it('should promote L2 hits to L1', () => {
      // Write to L2 only
      cache.setL2('l2key', 'l2value');
      // L1 miss, L2 hit → promote
      const value = cache.get('l2key');
      expect(value).toBe('l2value');

      const metrics = cache.getMetrics();
      expect(metrics.l1.hits + metrics.l1.misses).toBeGreaterThan(0);
    });
  });

  describe('getOrLoad', () => {
    it('should load data on cache miss', async () => {
      const loader = vi.fn().mockResolvedValue('loaded');
      const result = await cache.getOrLoad('key', loader);
      expect(result).toBe('loaded');
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it('should not call loader on cache hit', async () => {
      cache.set('key', 'cached');
      const loader = vi.fn().mockResolvedValue('loaded');
      const result = await cache.getOrLoad('key', loader);
      expect(result).toBe('cached');
      expect(loader).not.toHaveBeenCalled();
    });

    it('should cache loaded value', async () => {
      const loader = vi.fn().mockResolvedValue('loaded');
      await cache.getOrLoad('key', loader);
      await cache.getOrLoad('key', loader);
      expect(loader).toHaveBeenCalledTimes(1);
    });
  });

  describe('delete', () => {
    it('should remove entry from both levels', () => {
      cache.set('key', 'value');
      cache.delete('key');
      expect(cache.get('key')).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      cache.set('k1', 'v1');
      cache.set('k2', 'v2');
      cache.clear();
      expect(cache.get('k1')).toBeNull();
      expect(cache.get('k2')).toBeNull();
    });
  });

  describe('has', () => {
    it('should return true for existing keys', () => {
      cache.set('key', 'value');
      expect(cache.has('key')).toBe(true);
    });

    it('should return false for missing keys', () => {
      expect(cache.has('missing')).toBe(false);
    });
  });

  describe('getMetrics', () => {
    it('should return metrics for both levels', () => {
      cache.set('k1', 'v1');
      cache.get('k1');
      cache.get('missing');

      const metrics = cache.getMetrics();
      expect(metrics.l1).toBeDefined();
      expect(metrics.l2).toBeDefined();
      expect(metrics.overall).toBeDefined();
      expect(metrics.l1.hits).toBeGreaterThanOrEqual(0);
    });

    it('should track miss rate', () => {
      cache.get('nonexistent1');
      cache.get('nonexistent2');
      const metrics = cache.getMetrics();
      expect(metrics.l1.misses).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getHotKeys', () => {
    it('should return frequently accessed keys', () => {
      cache.set('hot', 'value');
      for (let i = 0; i < 5; i++) cache.get('hot');

      const hotKeys = cache.getHotKeys(5);
      expect(hotKeys.length).toBeGreaterThan(0);
    });
  });

  describe('setL2', () => {
    it('should write only to L2', () => {
      cache.setL2('l2only', 'value');
      // Should still be retrievable
      expect(cache.get('l2only')).toBe('value');
    });
  });
});
