import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LRUCache, VersionedCache } from '../services/cacheEngine';

describe('LRUCache', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new LRUCache({ maxSize: 5, defaultTTL: 1000, checkInterval: 100_000 });
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
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('should expire entries after TTL', () => {
    cache.set('key1', 'value1', 500);
    expect(cache.get('key1')).toBe('value1');
    vi.advanceTimersByTime(600);
    expect(cache.get('key1')).toBeUndefined();
  });

  it('should evict oldest entry when full', () => {
    for (let i = 0; i < 5; i++) cache.set(`k${i}`, `v${i}`);
    expect(cache.getStats().size).toBe(5);
    cache.set('k5', 'v5'); // should evict k0
    expect(cache.get('k0')).toBeUndefined();
    expect(cache.get('k5')).toBe('v5');
  });

  it('should track stats', () => {
    cache.set('k1', 'v1');
    cache.get('k1');
    cache.get('k2');
    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(0.5);
  });

  it('should delete entries', () => {
    cache.set('k1', 'v1');
    expect(cache.delete('k1')).toBe(true);
    expect(cache.get('k1')).toBeUndefined();
    expect(cache.delete('k1')).toBe(false);
  });

  it('should clear all entries', () => {
    cache.set('k1', 'v1');
    cache.set('k2', 'v2');
    cache.clear();
    expect(cache.getStats().size).toBe(0);
  });

  it('should check existence', () => {
    cache.set('k1', 'v1');
    expect(cache.has('k1')).toBe(true);
    expect(cache.has('k2')).toBe(false);
  });

  it('should handle expired entries in has()', () => {
    cache.set('k1', 'v1', 100);
    vi.advanceTimersByTime(200);
    expect(cache.has('k1')).toBe(false);
  });

  it('should batch get', () => {
    cache.set('a', '1');
    cache.set('b', '2');
    const result = cache.mget(['a', 'b', 'c']);
    expect(result.get('a')).toBe('1');
    expect(result.get('b')).toBe('2');
    expect(result.get('c')).toBeUndefined();
  });

  it('should batch set', () => {
    cache.mset([
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ]);
    expect(cache.get('a')).toBe('1');
    expect(cache.get('b')).toBe('2');
  });

  it('should return keys', () => {
    cache.set('a', '1');
    cache.set('b', '2');
    expect(cache.keys()).toContain('a');
    expect(cache.keys()).toContain('b');
  });

  it('should use getOrSet for cache-through', async () => {
    const factory = vi.fn().mockResolvedValue('fetched');
    const result = await cache.getOrSet('k1', factory);
    expect(result).toBe('fetched');
    expect(factory).toHaveBeenCalledTimes(1);

    // Second call should use cache
    const result2 = await cache.getOrSet('k1', factory);
    expect(result2).toBe('fetched');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('should set null marker on factory returning null', async () => {
    const factory = vi.fn().mockResolvedValue(null);
    const result = await cache.getOrSet('k1', factory);
    expect(result).toBeUndefined();

    // Second call should not call factory (penetration protection)
    const result2 = await cache.getOrSet('k1', factory);
    expect(result2).toBeUndefined();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('should handle factory errors gracefully', async () => {
    const factory = vi.fn().mockRejectedValue(new Error('db error'));
    const result = await cache.getOrSet('k1', factory);
    expect(result).toBeUndefined();
  });

  it('should track evictions', () => {
    for (let i = 0; i < 6; i++) cache.set(`k${i}`, `v${i}`);
    expect(cache.getStats().evictions).toBeGreaterThan(0);
  });

  it('should track penetrations', () => {
    cache.setNull('null-key');
    cache.get('null-key');
    expect(cache.getStats().penetrations).toBe(1);
  });

  it('should update LRU order on access', () => {
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    cache.set('d', '4');
    cache.set('e', '5');
    // Access 'a' to make it recently used
    cache.get('a');
    cache.set('f', '6'); // should evict 'b' (oldest untouched)
    expect(cache.get('a')).toBe('1');
    expect(cache.get('b')).toBeUndefined();
  });
});

describe('VersionedCache', () => {
  let cache: VersionedCache<string>;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new VersionedCache({ maxSize: 10, defaultTTL: 5000, checkInterval: 100_000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should get with matching version', () => {
    cache.set('k', 'v1', 1);
    expect(cache.get('k', 1)).toBe('v1');
  });

  it('should return undefined with mismatched version', () => {
    cache.set('k', 'v1', 1);
    expect(cache.get('k', 2)).toBeUndefined();
  });

  it('should invalidate entries', () => {
    cache.set('k', 'v1', 1);
    cache.invalidate('k');
    expect(cache.get('k', 1)).toBeUndefined();
  });

  it('should clear all', () => {
    cache.set('k1', 'v1', 1);
    cache.set('k2', 'v2', 2);
    cache.clear();
    expect(cache.get('k1', 1)).toBeUndefined();
    expect(cache.get('k2', 2)).toBeUndefined();
  });
});
