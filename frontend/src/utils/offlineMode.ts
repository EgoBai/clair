import logger from './logger';
/**
 * 离线模式管理器
 * 
 * 功能:
 * - 网络状态检测与监听
 * - 离线数据缓存 (IndexedDB)
 * - 请求队列 (离线操作待同步)
 * - 自动恢复机制
 * - 离线状态 UI 提示
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ==================== 类型定义 ====================

export type NetworkStatus = 'online' | 'offline' | 'reconnecting';

export interface OfflineAction {
  id: string;
  type: 'add_watchlist' | 'remove_watchlist' | 'set_alert' | 'update_portfolio';
  payload: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

export interface CacheEntry<T = unknown> {
  key: string;
  data: T;
  timestamp: number;
  ttl: number; // 生存时间 (ms)
  version: number;
}

export interface OfflineConfig {
  /** 缓存默认TTL (ms) */
  defaultTTL: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 重试间隔 (ms) */
  retryInterval: number;
  /** IndexedDB 数据库名 */
  dbName: string;
  /** 最大缓存条目数 */
  maxCacheSize: number;
}

const DEFAULT_CONFIG: OfflineConfig = {
  defaultTTL: 5 * 60 * 1000,  // 5分钟
  maxRetries: 3,
  retryInterval: 5000,
  dbName: 'a-stock-offline',
  maxCacheSize: 1000,
};

// ==================== IndexedDB 缓存层 ====================

class OfflineCache {
  private db: IDBDatabase | null = null;
  private config: OfflineConfig;
  private initPromise: Promise<void> | null = null;

  constructor(config: Partial<OfflineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        resolve();
        return;
      }

      const request = indexedDB.open(this.config.dbName, 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('cache')) {
          const store = db.createObjectStore('cache', { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains('offlineQueue')) {
          const queueStore = db.createObjectStore('offlineQueue', { keyPath: 'id' });
          queueStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => {
        logger.error('[OfflineCache] IndexedDB init failed:', request.error);
        resolve(); // 降级到内存缓存
      };
    });

    return this.initPromise;
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    await this.init();
    if (!this.db) return null;

    return new Promise((resolve) => {
      const tx = this.db!.transaction('cache', 'readonly');
      const store = tx.objectStore('cache');
      const request = store.get(key);

      request.onsuccess = () => {
        const entry = request.result as CacheEntry<T> | undefined;
        if (!entry) {
          resolve(null);
          return;
        }

        // 检查 TTL
        if (Date.now() - entry.timestamp > entry.ttl) {
          this.delete(key); // 异步删除过期数据
          resolve(null);
          return;
        }

        resolve(entry);
      };

      request.onerror = () => resolve(null);
    });
  }

  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    await this.init();
    if (!this.db) return;

    const entry: CacheEntry<T> = {
      key,
      data,
      timestamp: Date.now(),
      ttl: ttl || this.config.defaultTTL,
      version: 1,
    };

    return new Promise((resolve) => {
      const tx = this.db!.transaction('cache', 'readwrite');
      const store = tx.objectStore('cache');
      store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async delete(key: string): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve) => {
      const tx = this.db!.transaction('cache', 'readwrite');
      const store = tx.objectStore('cache');
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async clear(): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve) => {
      const tx = this.db!.transaction('cache', 'readwrite');
      const store = tx.objectStore('cache');
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async cleanup(): Promise<number> {
    await this.init();
    if (!this.db) return 0;

    return new Promise((resolve) => {
      const tx = this.db!.transaction('cache', 'readwrite');
      const store = tx.objectStore('cache');
      const index = store.index('timestamp');
      const request = index.openCursor();
      let deleted = 0;
      const now = Date.now();

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const entry = cursor.value as CacheEntry;
          if (now - entry.timestamp > entry.ttl) {
            cursor.delete();
            deleted++;
          }
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(deleted);
      tx.onerror = () => resolve(0);
    });
  }
}

// ==================== 离线操作队列 ====================

class OfflineQueue {
  private db: IDBDatabase | null = null;
  private config: OfflineConfig;
  private processing = false;

  constructor(config: OfflineConfig) {
    this.config = config;
  }

  setDatabase(db: IDBDatabase | null): void {
    this.db = db;
  }

  async enqueue(action: Omit<OfflineAction, 'id' | 'retryCount'>): Promise<void> {
    if (!this.db) return;

    const fullAction: OfflineAction = {
      ...action,
      id: `${action.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      retryCount: 0,
      maxRetries: this.config.maxRetries,
    };

    return new Promise((resolve) => {
      const tx = this.db!.transaction('offlineQueue', 'readwrite');
      const store = tx.objectStore('offlineQueue');
      store.add(fullAction);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async getQueue(): Promise<OfflineAction[]> {
    if (!this.db) return [];

    return new Promise((resolve) => {
      const tx = this.db!.transaction('offlineQueue', 'readonly');
      const store = tx.objectStore('offlineQueue');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  }

  async remove(id: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      const tx = this.db!.transaction('offlineQueue', 'readwrite');
      const store = tx.objectStore('offlineQueue');
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async incrementRetry(id: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      const tx = this.db!.transaction('offlineQueue', 'readwrite');
      const store = tx.objectStore('offlineQueue');
      const request = store.get(id);

      request.onsuccess = () => {
        const action = request.result as OfflineAction | undefined;
        if (action) {
          action.retryCount++;
          store.put(action);
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async clear(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      const tx = this.db!.transaction('offlineQueue', 'readwrite');
      const store = tx.objectStore('offlineQueue');
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async getPendingCount(): Promise<number> {
    const queue = await this.getQueue();
    return queue.filter(a => a.retryCount < a.maxRetries).length;
  }
}

// ==================== 离线管理器 ====================

export class OfflineManager {
  private cache: OfflineCache;
  private queue: OfflineQueue;
  private config: OfflineConfig;
  private statusListeners: Set<(status: NetworkStatus) => void> = new Set();
  private queueListeners: Set<(count: number) => void> = new Set();
  private _status: NetworkStatus = typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'offline';
  private retryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<OfflineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new OfflineCache(this.config);
    this.queue = new OfflineQueue(this.config);

    this.setupNetworkListeners();
    this.startRetryTimer();
  }

  get status(): NetworkStatus {
    return this._status;
  }

  private setupNetworkListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this._status = 'online';
      this.notifyStatusListeners();
      this.processQueue(); // 上线后自动处理队列
    });

    window.addEventListener('offline', () => {
      this._status = 'offline';
      this.notifyStatusListeners();
    });
  }

  private startRetryTimer(): void {
    if (this.retryTimer) return;

    this.retryTimer = setInterval(async () => {
      if (this._status === 'online') {
        await this.processQueue();
      }
    }, this.config.retryInterval);
  }

  destroy(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
    this.statusListeners.clear();
    this.queueListeners.clear();
  }

  onStatusChange(listener: (status: NetworkStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onQueueChange(listener: (count: number) => void): () => void {
    this.queueListeners.add(listener);
    return () => this.queueListeners.delete(listener);
  }

  private notifyStatusListeners(): void {
    for (const listener of this.statusListeners) {
      listener(this._status);
    }
  }

  private notifyQueueListeners(count: number): void {
    for (const listener of this.queueListeners) {
      listener(count);
    }
  }

  // === 缓存操作 ===

  async getCached<T>(key: string): Promise<T | null> {
    const entry = await this.cache.get<T>(key);
    return entry ? entry.data : null;
  }

  async setCache<T>(key: string, data: T, ttl?: number): Promise<void> {
    await this.cache.set(key, data, ttl);
  }

  async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  async cleanupCache(): Promise<number> {
    return this.cache.cleanup();
  }

  // === 离线操作队列 ===

  async enqueueAction(
    type: OfflineAction['type'],
    payload: Record<string, unknown>
  ): Promise<void> {
    await this.queue.setDatabase((this.cache as any).db);
    await this.queue.enqueue({ type, payload, timestamp: Date.now(), maxRetries: 3 });
    const count = await this.queue.getPendingCount();
    this.notifyQueueListeners(count);
  }

  async getPendingCount(): Promise<number> {
    return this.queue.getPendingCount();
  }

  async processQueue(): Promise<{ success: number; failed: number }> {
    const queue = await this.queue.getQueue();
    let success = 0;
    let failed = 0;

    for (const action of queue) {
      if (action.retryCount >= action.maxRetries) {
        failed++;
        continue;
      }

      try {
        // 这里需要实际的 API 调用逻辑
        // 根据 action.type 执行对应操作
        await this.executeAction(action);
        await this.queue.remove(action.id);
        success++;
      } catch {
        await this.queue.incrementRetry(action.id);
        if (action.retryCount + 1 >= action.maxRetries) {
          failed++;
        }
      }
    }

    const remaining = await this.queue.getPendingCount();
    this.notifyQueueListeners(remaining);

    return { success, failed };
  }

  private async executeAction(action: OfflineAction): Promise<void> {
    // 根据 action type 执行对应 API 调用
    // 实际实现中会调用具体的 API 方法
    // removed: console.log

    switch (action.type) {
      case 'add_watchlist':
        // await api.addToWatchlist(action.payload.symbol, action.payload.groupId);
        break;
      case 'remove_watchlist':
        // await api.removeFromWatchlist(action.payload.symbol);
        break;
      case 'set_alert':
        // await api.createAlert(action.payload);
        break;
      case 'update_portfolio':
        // await api.updatePortfolio(action.payload);
        break;
    }
  }
}

// ==================== React Hooks ====================

/**
 * 网络状态 Hook
 */
export function useNetworkStatus(): {
  status: NetworkStatus;
  isOnline: boolean;
} {
  const [status, setStatus] = useState<NetworkStatus>(() =>
    typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'offline'
  );

  useEffect(() => {
    const handleOnline = () => setStatus('online');
    const handleOffline = () => setStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return {
    status,
    isOnline: status === 'online',
  };
}

/**
 * 离线缓存 Hook
 */
export function useOfflineCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl?: number
): {
  data: T | null;
  loading: boolean;
  error: Error | null;
  isStale: boolean;
  refresh: () => Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isStale, setIsStale] = useState(false);
  const managerRef = useRef<OfflineManager | null>(null);

  if (!managerRef.current) {
    managerRef.current = new OfflineManager();
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 先尝试从缓存获取
      const cached = await managerRef.current!.getCached<T>(key);
      if (cached) {
        setData(cached);
        setIsStale(false);
      }

      // 尝试从网络获取
      if (navigator.onLine) {
        const fresh = await fetcher();
        await managerRef.current!.setCache(key, fresh, ttl);
        setData(fresh);
        setIsStale(false);
      } else if (!cached) {
        throw new Error('离线且无缓存数据');
      } else {
        setIsStale(true);
      }
    } catch (err) {
      setError(err as Error);
      // 如果有缓存数据，降级使用
      const cached = await managerRef.current!.getCached<T>(key);
      if (cached) {
        setData(cached);
        setIsStale(true);
      }
    } finally {
      setLoading(false);
    }
  }, [key, fetcher, ttl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, isStale, refresh: fetchData };
}

/**
 * 离线操作队列 Hook
 */
export function useOfflineQueue(): {
  pendingCount: number;
  enqueueAction: (type: OfflineAction['type'], payload: Record<string, unknown>) => Promise<void>;
  processQueue: () => Promise<{ success: number; failed: number }>;
} {
  const [pendingCount, setPendingCount] = useState(0);
  const managerRef = useRef<OfflineManager | null>(null);

  if (!managerRef.current) {
    managerRef.current = new OfflineManager();
  }

  useEffect(() => {
    const manager = managerRef.current!;
    const unsub = manager.onQueueChange(setPendingCount);
    manager.getPendingCount().then(setPendingCount);
    return unsub;
  }, []);

  const enqueueAction = useCallback(
    async (type: OfflineAction['type'], payload: Record<string, unknown>) => {
      await managerRef.current!.enqueueAction(type, payload);
    },
    []
  );

  const processQueue = useCallback(async () => {
    return managerRef.current!.processQueue();
  }, []);

  return { pendingCount, enqueueAction, processQueue };
}

// ==================== 导出默认实例 ====================

let defaultManager: OfflineManager | null = null;

export function getOfflineManager(): OfflineManager {
  if (!defaultManager) {
    defaultManager = new OfflineManager();
  }
  return defaultManager;
}
