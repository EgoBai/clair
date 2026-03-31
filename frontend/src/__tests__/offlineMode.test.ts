import { describe, it, expect } from 'vitest';

/**
 * 离线模式引擎测试
 */

interface OfflineConfig {
  enabled: boolean;
  maxCacheAge: number;  // ms
  maxCacheSize: number; // bytes
  syncOnReconnect: boolean;
}

interface CachedRequest {
  url: string;
  method: string;
  response: any;
  timestamp: number;
  etag?: string;
}

interface SyncQueue {
  id: string;
  url: string;
  method: string;
  body: any;
  timestamp: number;
  retries: number;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
}

class OfflineManager {
  private cache: Map<string, CachedRequest> = new Map();
  private syncQueue: SyncQueue[] = [];
  private config: OfflineConfig;
  private isOnline: boolean = true;

  constructor(config: OfflineConfig) {
    this.config = config;
  }

  cacheRequest(url: string, method: string, response: any): void {
    if (!this.config.enabled) return;
    this.cache.set(url, {
      url, method, response,
      timestamp: Date.now(),
    });
  }

  getCachedResponse(url: string): any | null {
    const cached = this.cache.get(url);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > this.config.maxCacheAge) {
      this.cache.delete(url);
      return null;
    }
    return cached.response;
  }

  addToSyncQueue(url: string, method: string, body: any): string {
    const id = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.syncQueue.push({
      id, url, method, body,
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
    });
    return id;
  }

  getSyncQueue(): SyncQueue[] {
    return [...this.syncQueue];
  }

  setOnline(online: boolean): void {
    this.isOnline = online;
  }

  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  clearCache(): void {
    this.cache.clear();
  }

  clearSyncQueue(): void {
    this.syncQueue = [];
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  getPendingSyncCount(): number {
    return this.syncQueue.filter(s => s.status === 'pending').length;
  }
}

describe('Offline Mode Engine', () => {
  const config: OfflineConfig = {
    enabled: true,
    maxCacheAge: 3600000,
    maxCacheSize: 50 * 1024 * 1024,
    syncOnReconnect: true,
  };

  let manager: OfflineManager;

  beforeEach(() => {
    manager = new OfflineManager(config);
  });

  describe('缓存管理', () => {
    it('应该缓存请求', () => {
      manager.cacheRequest('/api/stocks', 'GET', { data: 'test' });
      expect(manager.getCacheSize()).toBe(1);
    });

    it('应该获取缓存响应', () => {
      const response = { data: 'test' };
      manager.cacheRequest('/api/stocks', 'GET', response);
      expect(manager.getCachedResponse('/api/stocks')).toEqual(response);
    });

    it('不存在的URL应该返回null', () => {
      expect(manager.getCachedResponse('/api/unknown')).toBeNull();
    });

    it('应该清除缓存', () => {
      manager.cacheRequest('/api/stocks', 'GET', { data: 'test' });
      manager.clearCache();
      expect(manager.getCacheSize()).toBe(0);
    });
  });

  describe('同步队列', () => {
    it('应该添加到同步队列', () => {
      const id = manager.addToSyncQueue('/api/orders', 'POST', { stock: '000001' });
      expect(id).toBeTruthy();
      expect(manager.getSyncQueue().length).toBe(1);
    });

    it('应该获取待同步数量', () => {
      manager.addToSyncQueue('/api/orders', 'POST', {});
      manager.addToSyncQueue('/api/watchlist', 'PUT', {});
      expect(manager.getPendingSyncCount()).toBe(2);
    });

    it('应该清除同步队列', () => {
      manager.addToSyncQueue('/api/orders', 'POST', {});
      manager.clearSyncQueue();
      expect(manager.getSyncQueue().length).toBe(0);
    });
  });

  describe('在线状态', () => {
    it('默认应该在线', () => {
      expect(manager.getOnlineStatus()).toBe(true);
    });

    it('应该设置离线', () => {
      manager.setOnline(false);
      expect(manager.getOnlineStatus()).toBe(false);
    });

    it('应该恢复在线', () => {
      manager.setOnline(false);
      manager.setOnline(true);
      expect(manager.getOnlineStatus()).toBe(true);
    });
  });

  describe('配置', () => {
    it('禁用时不应该缓存', () => {
      const disabledManager = new OfflineManager({ ...config, enabled: false });
      disabledManager.cacheRequest('/api/stocks', 'GET', { data: 'test' });
      expect(disabledManager.getCacheSize()).toBe(0);
    });
  });
});
