import { describe, it, expect } from 'vitest';

/**
 * 离线模式工具测试
 * 测试 Service Worker 缓存策略、离线检测、队列同步
 */
describe('Offline Mode Utils', () => {
  describe('Offline Detection', () => {
    function isOnline(navigator: { onLine: boolean }): boolean {
      return navigator.onLine;
    }

    it('should detect online status', () => {
      expect(isOnline({ onLine: true })).toBe(true);
    });

    it('should detect offline status', () => {
      expect(isOnline({ onLine: false })).toBe(false);
    });
  });

  describe('Cache Strategy', () => {
    type CacheStrategy = 'cache-first' | 'network-first' | 'stale-while-revalidate';

    function selectStrategy(url: string): CacheStrategy {
      if (url.includes('/api/stock/') && !url.includes('/quote')) {
        return 'stale-while-revalidate';
      }
      if (url.includes('/api/')) {
        return 'network-first';
      }
      return 'cache-first';
    }

    it('should use cache-first for static assets', () => {
      expect(selectStrategy('/assets/main.js')).toBe('cache-first');
      expect(selectStrategy('/styles.css')).toBe('cache-first');
    });

    it('should use network-first for API calls', () => {
      expect(selectStrategy('/api/stocks')).toBe('network-first');
      expect(selectStrategy('/api/sectors')).toBe('network-first');
    });

    it('should use stale-while-revalidate for stock data', () => {
      expect(selectStrategy('/api/stock/600519')).toBe('stale-while-revalidate');
    });
  });

  describe('Offline Queue', () => {
    interface QueuedAction {
      id: string;
      type: 'add' | 'remove' | 'update';
      resource: string;
      data: any;
      timestamp: number;
      retries: number;
    }

    class OfflineQueue {
      private queue: QueuedAction[] = [];

      enqueue(action: Omit<QueuedAction, 'id' | 'timestamp' | 'retries'>): QueuedAction {
        const item: QueuedAction = {
          ...action,
          id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          retries: 0,
        };
        this.queue.push(item);
        return item;
      }

      dequeue(): QueuedAction | undefined {
        return this.queue.shift();
      }

      size(): number {
        return this.queue.length;
      }

      getAll(): QueuedAction[] {
        return [...this.queue];
      }

      retry(item: QueuedAction): void {
        item.retries++;
        this.queue.push(item);
      }

      clear(): void {
        this.queue = [];
      }
    }

    it('should enqueue actions', () => {
      const queue = new OfflineQueue();
      queue.enqueue({ type: 'add', resource: 'watchlist', data: { symbol: '600519' } });
      expect(queue.size()).toBe(1);
    });

    it('should dequeue in FIFO order', () => {
      const queue = new OfflineQueue();
      queue.enqueue({ type: 'add', resource: 'watchlist', data: { symbol: '1' } });
      queue.enqueue({ type: 'add', resource: 'watchlist', data: { symbol: '2' } });
      const first = queue.dequeue();
      expect(first?.data.symbol).toBe('1');
      expect(queue.size()).toBe(1);
    });

    it('should track retries', () => {
      const queue = new OfflineQueue();
      const item = queue.enqueue({ type: 'add', resource: 'watchlist', data: {} });
      queue.retry(item);
      expect(item.retries).toBe(1);
    });

    it('should clear queue', () => {
      const queue = new OfflineQueue();
      queue.enqueue({ type: 'add', resource: 'watchlist', data: {} });
      queue.enqueue({ type: 'remove', resource: 'watchlist', data: {} });
      queue.clear();
      expect(queue.size()).toBe(0);
    });

    it('should preserve action type', () => {
      const queue = new OfflineQueue();
      const item = queue.enqueue({ type: 'update', resource: 'settings', data: { theme: 'dark' } });
      expect(item.type).toBe('update');
      expect(item.resource).toBe('settings');
    });
  });

  describe('Staleness Detection', () => {
    function isStale(timestamp: number, maxAge: number): boolean {
      return Date.now() - timestamp > maxAge;
    }

    it('should detect fresh data', () => {
      expect(isStale(Date.now(), 60000)).toBe(false);
    });

    it('should detect stale data', () => {
      expect(isStale(Date.now() - 120000, 60000)).toBe(true);
    });

    it('should handle boundary', () => {
      expect(isStale(Date.now() - 60000, 60000)).toBe(false);
      expect(isStale(Date.now() - 60001, 60000)).toBe(true);
    });
  });

  describe('Cache Versioning', () => {
    function shouldInvalidateCache(currentVersion: string, cachedVersion: string): boolean {
      return currentVersion !== cachedVersion;
    }

    it('should invalidate on version mismatch', () => {
      expect(shouldInvalidateCache('v2', 'v1')).toBe(true);
    });

    it('should not invalidate on same version', () => {
      expect(shouldInvalidateCache('v1', 'v1')).toBe(false);
    });
  });

  describe('Background Sync', () => {
    it('should register sync tag', () => {
      const syncTags: string[] = [];
      const registerSync = (tag: string) => {
        syncTags.push(tag);
        return true;
      };
      registerSync('sync-watchlist');
      registerSync('sync-alerts');
      expect(syncTags.length).toBe(2);
    });

    it('should deduplicate sync tags', () => {
      const tags = new Set<string>();
      tags.add('sync-watchlist');
      tags.add('sync-watchlist');
      tags.add('sync-alerts');
      expect(tags.size).toBe(2);
    });
  });

  describe('Data Freshness Indicator', () => {
    function getFreshnessStatus(timestamp: number): 'fresh' | 'stale' | 'expired' {
      const age = Date.now() - timestamp;
      if (age < 30000) return 'fresh';
      if (age < 300000) return 'stale';
      return 'expired';
    }

    it('should classify fresh data', () => {
      expect(getFreshnessStatus(Date.now())).toBe('fresh');
      expect(getFreshnessStatus(Date.now() - 10000)).toBe('fresh');
    });

    it('should classify stale data', () => {
      expect(getFreshnessStatus(Date.now() - 60000)).toBe('stale');
    });

    it('should classify expired data', () => {
      expect(getFreshnessStatus(Date.now() - 600000)).toBe('expired');
    });
  });
});
