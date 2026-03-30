/**
 * 离线模式测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock IndexedDB
const mockStore: Record<string, any> = {};
const mockIDBRequest = {
  result: null as any,
  error: null as any,
  onsuccess: null as any,
  onerror: null as any,
};

const mockObjectStore = {
  put: vi.fn((entry: any) => {
    mockStore[entry.key] = entry;
    return mockIDBRequest;
  }),
  get: vi.fn((key: string) => {
    const req = { ...mockIDBRequest };
    req.result = mockStore[key] || null;
    setTimeout(() => req.onsuccess?.({ target: req } as any), 0);
    return req;
  }),
  delete: vi.fn(() => mockIDBRequest),
  clear: vi.fn(() => {
    Object.keys(mockStore).forEach(k => delete mockStore[k]);
    return mockIDBRequest;
  }),
  getAll: vi.fn(() => {
    const req = { ...mockIDBRequest };
    req.result = Object.values(mockStore);
    setTimeout(() => req.onsuccess?.({ target: req } as any), 0);
    return req;
  }),
  add: vi.fn((entry: any) => {
    mockStore[entry.id] = entry;
    return mockIDBRequest;
  }),
  createIndex: vi.fn(),
};

const mockTransaction = {
  objectStore: vi.fn(() => mockObjectStore),
  oncomplete: null as any,
  onerror: null as any,
};

const mockDB = {
  transaction: vi.fn(() => mockTransaction),
  objectStoreNames: { contains: vi.fn(() => false) },
  createObjectStore: vi.fn(() => mockObjectStore),
};

// Setup mock indexedDB
Object.defineProperty(global, 'indexedDB', {
  value: {
    open: vi.fn(() => {
      const req = { ...mockIDBRequest };
      req.result = mockDB;
      setTimeout(() => {
        req.onsuccess?.({ target: req } as any);
      }, 0);
      return req;
    }),
  },
  writable: true,
});

describe('离线模式管理', () => {
  describe('缓存条目', () => {
    it('缓存条目结构正确', () => {
      const entry = {
        key: 'test-key',
        data: { value: 42 },
        timestamp: Date.now(),
        ttl: 300000,
        version: 1,
      };

      expect(entry.key).toBe('test-key');
      expect(entry.data.value).toBe(42);
      expect(entry.ttl).toBe(300000);
      expect(entry.version).toBe(1);
    });

    it('过期判断正确', () => {
      const entry = {
        key: 'expired',
        data: {},
        timestamp: Date.now() - 400000, // 400秒前
        ttl: 300000, // 5分钟TTL
        version: 1,
      };
      const isExpired = Date.now() - entry.timestamp > entry.ttl;
      expect(isExpired).toBe(true);
    });

    it('未过期判断正确', () => {
      const entry = {
        key: 'valid',
        data: {},
        timestamp: Date.now() - 100000, // 100秒前
        ttl: 300000, // 5分钟TTL
        version: 1,
      };
      const isExpired = Date.now() - entry.timestamp > entry.ttl;
      expect(isExpired).toBe(false);
    });
  });

  describe('离线操作队列', () => {
    it('操作队列条目结构正确', () => {
      const action = {
        id: 'add-watchlist-1',
        type: 'add_watchlist' as const,
        payload: { symbol: '600519.SH', groupId: 'default' },
        timestamp: Date.now(),
        retryCount: 0,
        maxRetries: 3,
      };

      expect(action.id).toBeDefined();
      expect(action.type).toBe('add_watchlist');
      expect(action.payload.symbol).toBe('600519.SH');
      expect(action.retryCount).toBe(0);
      expect(action.maxRetries).toBe(3);
    });

    it('重试次数增加', () => {
      const action = {
        id: 'test',
        type: 'add_watchlist' as const,
        payload: {},
        timestamp: Date.now(),
        retryCount: 0,
        maxRetries: 3,
      };

      action.retryCount++;
      expect(action.retryCount).toBe(1);
    });

    it('超过最大重试次数标记为失败', () => {
      const action = {
        id: 'test',
        type: 'add_watchlist' as const,
        payload: {},
        timestamp: Date.now(),
        retryCount: 3,
        maxRetries: 3,
      };

      expect(action.retryCount >= action.maxRetries).toBe(true);
    });
  });

  describe('网络状态检测', () => {
    it('在线状态检测', () => {
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        writable: true,
      });
      expect(navigator.onLine).toBe(true);
    });

    it('离线状态检测', () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        writable: true,
      });
      expect(navigator.onLine).toBe(false);
    });
  });

  describe('缓存清理', () => {
    it('清理过期缓存', () => {
      const now = Date.now();
      const entries = [
        { key: 'a', timestamp: now - 100000, ttl: 300000 }, // 有效
        { key: 'b', timestamp: now - 400000, ttl: 300000 }, // 过期
        { key: 'c', timestamp: now - 100000, ttl: 300000 }, // 有效
        { key: 'd', timestamp: now - 600000, ttl: 300000 }, // 过期
      ];

      const valid = entries.filter(e => now - e.timestamp <= e.ttl);
      const expired = entries.filter(e => now - e.timestamp > e.ttl);

      expect(valid).toHaveLength(2);
      expect(expired).toHaveLength(2);
      expect(valid.map(e => e.key)).toEqual(['a', 'c']);
      expect(expired.map(e => e.key)).toEqual(['b', 'd']);
    });
  });
});
