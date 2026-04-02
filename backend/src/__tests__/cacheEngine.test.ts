import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LRUCache, VersionedCache } from '../services/cacheEngine';

describe('cacheEngine', () => {
  describe('LRUCache', () => {
    let cache: LRUCache<string>;

    beforeEach(() => {
      vi.useFakeTimers();
      cache = new LRUCache<string>({ maxSize: 5, defaultTTL: 10000, checkInterval: 60000 });
    });

    afterEach(() => {
      cache.destroy();
      vi.useRealTimers();
    });

    it('should set and get values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for missing keys', () => {
      expect(cache.get('missing')).toBeUndefined();
    });

    it('should expire entries after TTL', () => {
      cache.set('key1', 'value1', 5000);
      vi.advanceTimersByTime(6000);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should evict oldest entry when max size reached', () => {
      for (let i = 0; i < 5; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      cache.set('key5', 'value5');
      expect(cache.get('key0')).toBeUndefined();
      expect(cache.get('key5')).toBe('value5');
    });

    it('should move accessed items to end (LRU behavior)', () => {
      for (let i = 0; i < 5; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      cache.get('key0'); // access key0 to make it most recent
      cache.set('key5', 'value5');
      expect(cache.get('key0')).toBe('value0'); // should survive
      expect(cache.get('key1')).toBeUndefined(); // should be evicted
    });

    it('should track hit count', () => {
      cache.set('key1', 'value1');
      cache.get('key1');
      cache.get('key1');
      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
    });

    it('should track misses', () => {
      cache.get('nonexistent');
      const stats = cache.getStats();
      expect(stats.misses).toBe(1);
    });

    it('should calculate hit rate', () => {
      cache.set('key1', 'value1');
      cache.get('key1'); // hit
      cache.get('key2'); // miss
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0.5);
    });

    it('should delete entries', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.getStats().size).toBe(0);
    });

    it('should check existence without updating LRU', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('missing')).toBe(false);
    });

    it('should check has for expired entries', () => {
      cache.set('key1', 'value1', 1000);
      vi.advanceTimersByTime(2000);
      expect(cache.has('key1')).toBe(false);
    });

    it('should support batch get (mget)', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      const result = cache.mget(['a', 'b', 'c']);
      expect(result.get('a')).toBe('1');
      expect(result.get('b')).toBe('2');
      expect(result.get('c')).toBeUndefined();
    });

    it('should support batch set (mset)', () => {
      cache.mset([
        { key: 'a', value: '1' },
        { key: 'b', value: '2' },
      ]);
      expect(cache.get('a')).toBe('1');
      expect(cache.get('b')).toBe('2');
    });

    it('should return all keys', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      expect(cache.keys()).toEqual(['a', 'b']);
    });

    it('should set null marker for penetration protection', () => {
      cache.setNull('nullkey');
      expect(cache.get('nullkey')).toBeUndefined();
      const stats = cache.getStats();
      expect(stats.penetrations).toBeGreaterThan(0);
    });

    it('should getOrSet with factory function', async () => {
      const result = await cache.getOrSet('key1', async () => 'fetched');
      expect(result).toBe('fetched');
      expect(cache.get('key1')).toBe('fetched');
    });

    it('should return cached value in getOrSet', async () => {
      cache.set('key1', 'cached');
      const result = await cache.getOrSet('key1', async () => 'fetched');
      expect(result).toBe('cached');
    });

    it('should set null marker when factory returns null', async () => {
      const result = await cache.getOrSet('key1', async () => null);
      expect(result).toBeUndefined();
      // second call should hit penetration protection
      const spy = vi.fn(async () => 'should not call');
      await cache.getOrSet('key1', spy);
      expect(spy).not.toHaveBeenCalled();
    });

    it('should handle factory errors gracefully', async () => {
      const result = await cache.getOrSet('key1', async () => {
        throw new Error('fail');
      });
      expect(result).toBeUndefined();
    });

    it('should track evictions', () => {
      for (let i = 0; i < 6; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      const stats = cache.getStats();
      expect(stats.evictions).toBe(1);
    });

    it('should return size in stats', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(5);
    });

    it('should use custom TTL per entry', () => {
      cache.set('short', 'value', 100);
      cache.set('long', 'value', 50000);
      vi.advanceTimersByTime(200);
      expect(cache.get('short')).toBeUndefined();
      expect(cache.get('long')).toBe('value');
    });

    it('should handle different value types', () => {
      const numCache = new LRUCache<number>();
      numCache.set('num', 42);
      expect(numCache.get('num')).toBe(42);
      numCache.destroy();

      const objCache = new LRUCache<{ x: number }>();
      objCache.set('obj', { x: 1 });
      expect(objCache.get('obj')).toEqual({ x: 1 });
      objCache.destroy();
    });
  });

  describe('VersionedCache', () => {
    let vcache: VersionedCache<string>;

    beforeEach(() => {
      vcache = new VersionedCache<string>({ maxSize: 10, defaultTTL: 60000, checkInterval: 60000 });
    });

    afterEach(() => {
      vcache.clear();
    });

    it('should return data with matching version', () => {
      vcache.set('key1', 'data', 1);
      expect(vcache.get('key1', 1)).toBe('data');
    });

    it('should return undefined with wrong version', () => {
      vcache.set('key1', 'data', 1);
      expect(vcache.get('key1', 2)).toBeUndefined();
    });

    it('should invalidate entries', () => {
      vcache.set('key1', 'data', 1);
      vcache.invalidate('key1');
      expect(vcache.get('key1', 1)).toBeUndefined();
    });

    it('should clear all entries', () => {
      vcache.set('a', '1', 1);
      vcache.set('b', '2', 1);
      vcache.clear();
      expect(vcache.get('a', 1)).toBeUndefined();
    });
  });
});
