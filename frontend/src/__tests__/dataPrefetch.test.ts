import { describe, it, expect } from 'vitest';
import { DataPrefetchManager, globalPrefetcher, RoutePrefetchMap } from '../utils/dataPrefetch';

describe('DataPrefetchManager', () => {
  it('should create an instance', () => {
    const manager = new DataPrefetchManager();
    expect(manager).toBeDefined();
  });

  it('should report stats', () => {
    const manager = new DataPrefetchManager({ maxCacheSize: 10, maxConcurrent: 2 });
    const stats = manager.getStats();
    expect(stats.queueSize).toBe(0);
    expect(stats.loadingCount).toBe(0);
    expect(stats.cacheSize).toBe(0);
    expect(stats.maxCacheSize).toBe(10);
  });

  it('should enqueue and process tasks', async () => {
    const manager = new DataPrefetchManager({ maxConcurrent: 1, ttl: 5000 });
    let callCount = 0;
    manager.enqueue('key1', async () => { callCount++; return 'data1'; }, 1);
    await new Promise(r => setTimeout(r, 100));
    expect(callCount).toBeGreaterThanOrEqual(1);
  });

  it('should not duplicate same key', async () => {
    const manager = new DataPrefetchManager();
    let callCount = 0;
    manager.enqueue('dup', async () => { callCount++; return 'data'; });
    manager.enqueue('dup', async () => { callCount++; return 'data'; });
    await new Promise(r => setTimeout(r, 100));
    expect(callCount).toBeLessThanOrEqual(1);
  });

  it('should clear all', () => {
    const manager = new DataPrefetchManager();
    manager.enqueue('a', async () => 'a');
    manager.enqueue('b', async () => 'b');
    manager.clear();
    const stats = manager.getStats();
    expect(stats.queueSize).toBe(0);
    expect(stats.cacheSize).toBe(0);
  });

  it('should get cached data', async () => {
    const manager = new DataPrefetchManager({ ttl: 5000 });
    manager.enqueue('cached', async () => ({ value: 42 }));
    await new Promise(r => setTimeout(r, 200));
    const result = manager.get('cached');
    expect(result).toEqual({ value: 42 });
  });

  it('should return undefined for missing key', () => {
    const manager = new DataPrefetchManager();
    expect(manager.get('nonexistent')).toBeUndefined();
  });

  it('should check loading status', async () => {
    const manager = new DataPrefetchManager({ maxConcurrent: 1 });
    manager.enqueue('loading-test', () => new Promise(r => setTimeout(() => r('done'), 500)));
    expect(manager.isLoading('loading-test')).toBe(true);
    await new Promise(r => setTimeout(r, 600));
    expect(manager.isLoading('loading-test')).toBe(false);
  });
});

describe('globalPrefetcher', () => {
  it('should be a DataPrefetchManager instance', () => {
    expect(globalPrefetcher).toBeInstanceOf(DataPrefetchManager);
  });
});

describe('RoutePrefetchMap', () => {
  it('should add routes', () => {
    const map = new RoutePrefetchMap();
    map.addRoute('/home', '/stocks', () => Promise.resolve('stocks'));
    map.addRoute('/home', '/etf', () => Promise.resolve('etf'));
    expect(map).toBeDefined();
  });

  it('should prefetch for route', () => {
    const map = new RoutePrefetchMap();
    map.addRoute('/page', '/next', () => Promise.resolve('data'));
    map.prefetchForRoute('/page');
    map.prefetchForRoute('/unknown');
  });
});
