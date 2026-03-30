import { describe, it, expect, vi, beforeEach } from 'vitest';
import { APICache } from '../services/apiCache';

describe('APICache', () => {
  let cache: APICache;

  beforeEach(() => {
    cache = new APICache(60);
  });

  describe('generateKey', () => {
    it('should generate consistent keys', () => {
      const key1 = cache.generateKey('/api/stocks', 'GET', { page: '1' });
      const key2 = cache.generateKey('/api/stocks', 'GET', { page: '1' });
      expect(key1).toBe(key2);
    });

    it('should differ for different queries', () => {
      const key1 = cache.generateKey('/api/stocks', 'GET', { page: '1' });
      const key2 = cache.generateKey('/api/stocks', 'GET', { page: '2' });
      expect(key1).not.toBe(key2);
    });

    it('should differ for different methods', () => {
      const key1 = cache.generateKey('/api/stocks', 'GET');
      const key2 = cache.generateKey('/api/stocks', 'POST');
      expect(key1).not.toBe(key2);
    });
  });

  describe('set and get', () => {
    it('should store and retrieve cache entry', () => {
      const key = 'test_key';
      cache.set(key, { data: 'test' }, {}, 200);
      const entry = cache.get(key);
      expect(entry).not.toBeNull();
      expect(entry!.body).toEqual({ data: 'test' });
      expect(entry!.statusCode).toBe(200);
    });

    it('should return null for missing key', () => {
      expect(cache.get('missing')).toBeNull();
    });

    it('should return null for fully expired entries', () => {
      vi.useFakeTimers();
      const c = new APICache(1); // 1 second TTL
      c.set('key', 'data', {}, 200);
      vi.advanceTimersByTime(2000); // past 1.5 * TTL
      expect(c.get('key')).toBeNull();
      vi.useRealTimers();
    });

    it('should return stale entries within grace period', () => {
      vi.useFakeTimers();
      const c = new APICache(10);
      c.set('key', 'data', {}, 200);
      vi.advanceTimersByTime(11000); // stale but within grace
      const entry = c.get('key');
      expect(entry).not.toBeNull();
      vi.useRealTimers();
    });
  });

  describe('isStale', () => {
    it('should return true for missing entries', () => {
      expect(cache.isStale('missing')).toBe(true);
    });

    it('should return false for fresh entries', () => {
      cache.set('key', 'data', {}, 200, 3600);
      expect(cache.isStale('key')).toBe(false);
    });
  });

  describe('invalidate', () => {
    it('should remove specific key', () => {
      cache.set('key', 'data', {}, 200);
      expect(cache.invalidate('key')).toBe(true);
      expect(cache.get('key')).toBeNull();
    });

    it('should return false for missing key', () => {
      expect(cache.invalidate('missing')).toBe(false);
    });
  });

  describe('invalidatePattern', () => {
    it('should remove matching keys', () => {
      cache.set('stock:000001', 'data1', {}, 200);
      cache.set('stock:600519', 'data2', {}, 200);
      cache.set('news:latest', 'data3', {}, 200);
      const count = cache.invalidatePattern(/^stock:/);
      expect(count).toBe(2);
      expect(cache.get('news:latest')).not.toBeNull();
    });
  });

  describe('ETag', () => {
    it('should generate ETag for entries', () => {
      cache.set('key', { data: 'test' }, {}, 200);
      const entry = cache.get('key');
      expect(entry!.etag).toBeDefined();
      expect(entry!.etag).toMatch(/^"[a-f0-9]+"$/);
    });

    it('should set ETag header', () => {
      cache.set('key', 'data', {}, 200);
      const entry = cache.get('key');
      expect(entry!.headers['ETag']).toBeDefined();
    });
  });

  describe('stats', () => {
    it('should return cache stats', () => {
      cache.set('k1', 'a', {}, 200);
      cache.set('k2', 'b', {}, 200);
      const stats = cache.getStats();
      expect(stats.entries).toBe(2);
      expect(stats.memoryEstimate).toBeDefined();
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      cache.set('k1', 'a', {}, 200);
      cache.set('k2', 'b', {}, 200);
      cache.clear();
      expect(cache.getStats().entries).toBe(0);
    });
  });

  describe('cleanExpired', () => {
    it('should remove expired entries', () => {
      vi.useFakeTimers();
      const c = new APICache(1);
      c.set('key', 'data', {}, 200);
      vi.advanceTimersByTime(2000);
      const cleaned = c.cleanExpired();
      expect(cleaned).toBe(1);
      vi.useRealTimers();
    });
  });

  describe('middleware', () => {
    it('should create middleware function', () => {
      const mw = cache.middleware({ ttl: 30 });
      expect(typeof mw).toBe('function');
    });

    it('should skip non-GET requests', () => {
      const mw = cache.middleware({ ttl: 30 });
      const req = { url: '/api/test', method: 'POST' };
      const res = { status: vi.fn(), setHeader: vi.fn(), json: vi.fn(), statusCode: 200 };
      const next = vi.fn();
      mw(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should skip when condition fails', () => {
      const mw = cache.middleware({ ttl: 30, condition: () => false });
      const req = { url: '/api/test', method: 'GET' };
      const res = { status: vi.fn(), setHeader: vi.fn(), json: vi.fn(), statusCode: 200 };
      const next = vi.fn();
      mw(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
