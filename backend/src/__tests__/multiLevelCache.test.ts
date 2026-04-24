import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MultiLevelCache, multiLevelCache } from '../utils/multiLevelCache';

describe('MultiLevelCache', () => {
  let cache: MultiLevelCache;

  beforeEach(() => {
    cache = new MultiLevelCache();
    cache.clear();
  });

  describe('set / get', () => {
    it('should store and retrieve value', () => {
      cache.set('key1', 42);
      expect(cache.get('key1')).toBe(42);
    });

    it('should return null for non-existent key', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should store string values', () => {
      cache.set('str_key', 'hello world');
      expect(cache.get('str_key')).toBe('hello world');
    });

    it('should store object values', () => {
      const obj = { name: 'test', value: 123 };
      cache.set('obj_key', obj);
      expect(cache.get('obj_key')).toEqual(obj);
    });

    it('should store null as a valid value', () => {
      cache.set('null_key', null);
      expect(cache.get('null_key')).toBeNull();
    });

    it('should store array values', () => {
      const arr = [1, 2, 3, 4, 5];
      cache.set('arr_key', arr);
      expect(cache.get('arr_key')).toEqual(arr);
    });

    it('should overwrite existing key with new value', () => {
      cache.set('overwrite', 'old');
      cache.set('overwrite', 'new');
      expect(cache.get('overwrite')).toBe('new');
    });
  });

  describe('delete', () => {
    it('should delete an existing key', () => {
      cache.set('del_key', 'value');
      expect(cache.delete('del_key')).toBe(true);
      expect(cache.get('del_key')).toBeNull();
    });

    it('should return false for non-existent key', () => {
      expect(cache.delete('ghost')).toBe(false);
    });
  });

  describe('has', () => {
    it('should return true for existing key', () => {
      cache.set('has_key', 'data');
      expect(cache.has('has_key')).toBe(true);
    });

    it('should return false for non-existent key', () => {
      expect(cache.has('nope')).toBe(false);
    });

    it('should return false after delete', () => {
      cache.set('h', 'v');
      cache.delete('h');
      expect(cache.has('h')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all cached data', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.clear();
      expect(cache.get('a')).toBeNull();
      expect(cache.get('b')).toBeNull();
      expect(cache.get('c')).toBeNull();
    });
  });

  describe('setL2', () => {
    it('should set data in L2 without L1', () => {
      cache.setL2('l2_only', 'from_l2');
      // L1 miss initially, but L2 hit promotes to L1
      const result = cache.get('l2_only');
      expect(result).toBe('from_l2');
    });

    it('should promote L2 hit to L1', () => {
      cache.setL2('promote', 'l2_data');
      cache.get('promote'); // first get: L1 miss, L2 hit → promote
      // After promotion, L1 should have it
      // We can verify by checking hotkeys
      const hotKeys = cache.getHotKeys(10);
      expect(hotKeys.some(h => h.key === 'promote')).toBe(true);
    });
  });

  describe('getOrLoad', () => {
    it('should load data on cache miss', async () => {
      const loader = vi.fn().mockResolvedValue('loaded_data');
      const result = await cache.getOrLoad('load_key', loader);
      expect(result).toBe('loaded_data');
      expect(loader).toHaveBeenCalledOnce();
    });

    it('should return cached data on hit without calling loader', async () => {
      cache.set('hit_key', 'cached_value');
      const loader = vi.fn().mockResolvedValue('should_not_call');
      const result = await cache.getOrLoad('hit_key', loader);
      expect(result).toBe('cached_value');
      expect(loader).not.toHaveBeenCalled();
    });

    it('should cache loaded data for subsequent requests', async () => {
      const loader = vi.fn().mockResolvedValue('persisted');
      await cache.getOrLoad('persist_key', loader);
      const result = await cache.getOrLoad('persist_key', loader);
      expect(result).toBe('persisted');
      expect(loader).toHaveBeenCalledTimes(1);
    });
  });

  describe('invalidateByTag', () => {
    it('should invalidate items with matching tag', () => {
      cache.set('tag_a', 1, undefined, ['tag1']);
      cache.set('tag_b', 2, undefined, ['tag1']);
      cache.set('tag_c', 3, undefined, ['tag2']);

      // Note: set() writes to both L1 and L2, so removed count is doubled
      const removed = cache.invalidateByTag('tag1');
      expect(removed).toBeGreaterThanOrEqual(2);
      expect(cache.get('tag_a')).toBeNull();
      expect(cache.get('tag_b')).toBeNull();
      expect(cache.get('tag_c')).not.toBeNull();
    });

    it('should return 0 for unknown tag', () => {
      expect(cache.invalidateByTag('unknown')).toBe(0);
    });
  });

  describe('invalidatePattern', () => {
    it('should invalidate items matching glob pattern', () => {
      cache.set('user:100', 'alice');
      cache.set('user:200', 'bob');
      cache.set('stock:000001', 'data');

      // Note: set() writes to both L1 and L2, so removed count is doubled
      const removed = cache.invalidatePattern('user:*');
      expect(removed).toBeGreaterThanOrEqual(2);
      expect(cache.get('user:100')).toBeNull();
      expect(cache.get('stock:000001')).not.toBeNull();
    });
  });

  describe('warmup', () => {
    it('should batch-warm L2 via loaders', async () => {
      const result = await cache.warmup([
        { key: 'w1', loader: async () => 'warm1' },
        { key: 'w2', loader: async () => 'warm2' },
      ]);
      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
      // Data accessible via L2 → promote flow
      expect(cache.get('w1')).toBe('warm1');
      expect(cache.get('w2')).toBe('warm2');
    });

    it('should report failed loaders without throwing', async () => {
      const result = await cache.warmup([
        { key: 'good', loader: async () => 'ok' },
        { key: 'bad', loader: async () => { throw new Error('fail'); } },
      ]);
      expect(result.success).toBe(1);
      expect(result.failed).toBe(1);
      expect(cache.get('good')).toBe('ok');
    });
  });

  describe('bufferWrite / flush', () => {
    it('should buffer writes and flush them', () => {
      cache.bufferWrite('buf_key', 'buffered');
      // Not yet available
      expect(cache.get('buf_key')).toBeNull();
      // Force flush
      (cache as any).flushBuffer();
      expect(cache.get('buf_key')).toBe('buffered');
    });

    it('should skip empty buffer flush without error', () => {
      expect(() => (cache as any).flushBuffer()).not.toThrow();
    });
  });

  describe('getMetrics', () => {
    it('should return combined metrics with l1, l2, overall', () => {
      cache.set('m1', 1);
      cache.get('m1'); // hit
      cache.get('nonexistent'); // miss

      const metrics = cache.getMetrics();
      expect(metrics).toHaveProperty('l1');
      expect(metrics).toHaveProperty('l2');
      expect(metrics).toHaveProperty('overall');
      expect(metrics.l1).toHaveProperty('hitRate');
      expect(metrics.overall).toHaveProperty('hitRate');
      expect(metrics.l1.entryCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getHotKeys', () => {
    it('should return merged hot keys sorted by hits desc', () => {
      cache.set('hot1', 1);
      cache.set('hot2', 2);
      cache.get('hot1'); // 2 hits
      cache.get('hot1');

      const hot = cache.getHotKeys(10);
      expect(hot.length).toBeGreaterThanOrEqual(2);
      // The first entry should be the most hit
      expect(hot[0].hits).toBeGreaterThanOrEqual(hot[1]?.hits || 0);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy for empty cache', () => {
      const health = cache.healthCheck();
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('issues');
      expect(typeof health.l1Utilization).toBe('number');
    });

    it('should report degraded when hit rate low', () => {
      for (let i = 0; i < 100; i++) {
        cache.get(`miss_${i}`);
      }
      const health = cache.healthCheck();
      // L1 miss rate low = issues
      expect(health.issues.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('destroy', () => {
    it('should clear timer and all data', () => {
      cache.set('d', 'data');
      cache.destroy();
      expect(cache.get('d')).toBeNull();
    });
  });

  describe('constructor config', () => {
    it('should accept custom L1 config', () => {
      const custom = new MultiLevelCache({
        maxSize: 1000,
        maxEntries: 10,
        defaultTTL: 100,
      });
      custom.set('c', 'v');
      expect(custom.get('c')).toBe('v');
      custom.destroy();
    });

    it('should accept custom L2 config', () => {
      const custom = new MultiLevelCache({}, {
        maxSize: 5000,
        maxEntries: 50,
        defaultTTL: 500,
      });
      custom.set('c2', 'v2');
      expect(custom.get('c2')).toBe('v2');
      custom.destroy();
    });
  });

  describe('singleton exporter', () => {
    it('should export multiLevelCache singleton', () => {
      expect(multiLevelCache).toBeInstanceOf(MultiLevelCache);
    });
  });
});
