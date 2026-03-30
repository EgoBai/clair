import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OfflineQueueService } from '../services/offlineQueue';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', { value: true, writable: true });

describe('OfflineQueueService', () => {
  let queue: OfflineQueueService;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    queue = new OfflineQueueService({ storageKey: 'test_queue' });
  });

  afterEach(() => {
    queue.clear();
  });

  describe('enqueue', () => {
    it('should add action to queue', () => {
      const id = queue.enqueue('api_call', { url: '/api/test', method: 'POST' });
      expect(id).toBeTruthy();
      expect(queue.getSize()).toBe(1);
    });

    it('should generate unique IDs', () => {
      const id1 = queue.enqueue('api_call', { url: '/api/1' });
      const id2 = queue.enqueue('api_call', { url: '/api/2' });
      expect(id1).not.toBe(id2);
    });

    it('should respect max queue size', () => {
      const q = new OfflineQueueService({ maxQueueSize: 3, storageKey: 'test_small' });
      q.enqueue('api_call', { url: '/1' }, { priority: 'low' });
      q.enqueue('api_call', { url: '/2' }, { priority: 'high' });
      q.enqueue('api_call', { url: '/3' }, { priority: 'medium' });
      q.enqueue('api_call', { url: '/4' }, { priority: 'high' });
      expect(q.getSize()).toBe(3);
    });

    it('should sort by priority', () => {
      queue.enqueue('api_call', { url: '/low' }, { priority: 'low' });
      queue.enqueue('api_call', { url: '/high' }, { priority: 'high' });
      queue.enqueue('api_call', { url: '/medium' }, { priority: 'medium' });

      const items = queue.getQueue();
      expect(items[0].priority).toBe('high');
      expect(items[1].priority).toBe('medium');
      expect(items[2].priority).toBe('low');
    });

    it('should set default TTL', () => {
      const id = queue.enqueue('api_call', { url: '/test' });
      const action = queue.getQueue().find(a => a.id === id);
      expect(action?.expiresAt).toBeDefined();
      expect(action!.expiresAt!).toBeGreaterThan(Date.now());
    });

    it('should use custom maxRetries', () => {
      const id = queue.enqueue('api_call', { url: '/test' }, { maxRetries: 5 });
      const action = queue.getQueue().find(a => a.id === id);
      expect(action?.maxRetries).toBe(5);
    });
  });

  describe('remove', () => {
    it('should remove action by ID', () => {
      const id = queue.enqueue('api_call', { url: '/test' });
      expect(queue.getSize()).toBe(1);
      const removed = queue.remove(id);
      expect(removed).toBe(true);
      expect(queue.getSize()).toBe(0);
    });

    it('should return false for non-existent ID', () => {
      expect(queue.remove('nonexistent')).toBe(false);
    });
  });

  describe('getByType', () => {
    it('should filter by type', () => {
      queue.enqueue('api_call', { url: '/api' });
      queue.enqueue('websocket_send', { data: 'ws' });
      queue.enqueue('api_call', { url: '/api2' });

      const apiCalls = queue.getByType('api_call');
      expect(apiCalls).toHaveLength(2);
    });
  });

  describe('getStats', () => {
    it('should return correct stats', () => {
      queue.enqueue('api_call', { url: '/1' }, { priority: 'high' });
      queue.enqueue('api_call', { url: '/2' }, { priority: 'high' });
      queue.enqueue('websocket_send', { data: 'x' }, { priority: 'low' });

      const stats = queue.getStats();
      expect(stats.total).toBe(3);
      expect(stats.byPriority.high).toBe(2);
      expect(stats.byPriority.low).toBe(1);
      expect(stats.byType.api_call).toBe(2);
      expect(stats.byType.websocket_send).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all actions', () => {
      queue.enqueue('api_call', { url: '/1' });
      queue.enqueue('api_call', { url: '/2' });
      queue.clear();
      expect(queue.getSize()).toBe(0);
    });
  });

  describe('subscribe', () => {
    it('should notify listeners on enqueue', () => {
      const listener = vi.fn();
      queue.subscribe(listener);
      queue.enqueue('api_call', { url: '/test' });
      expect(listener).toHaveBeenCalled();
    });

    it('should notify listeners on remove', () => {
      const listener = vi.fn();
      const id = queue.enqueue('api_call', { url: '/test' });
      queue.subscribe(listener);
      queue.remove(id);
      expect(listener).toHaveBeenCalled();
    });

    it('should unsubscribe', () => {
      const listener = vi.fn();
      const unsub = queue.subscribe(listener);
      unsub();
      queue.enqueue('api_call', { url: '/test' });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('flush', () => {
    it('should return 0,0 when queue is empty', async () => {
      const result = await queue.flush();
      expect(result).toEqual({ succeeded: 0, failed: 0 });
    });

    it('should call onFlush with batch', async () => {
      const onFlush = vi.fn().mockResolvedValue(undefined);
      const q = new OfflineQueueService({ storageKey: 'test_flush', onFlush });
      q.enqueue('api_call', { url: '/test' });
      const result = await q.flush();
      expect(onFlush).toHaveBeenCalled();
      expect(result.succeeded).toBe(1);
    });

    it('should handle onFlush failure gracefully', async () => {
      const onFlush = vi.fn().mockRejectedValue(new Error('Batch failed'));
      const onActionFailed = vi.fn();
      const q = new OfflineQueueService({
        storageKey: 'test_fail',
        onFlush,
        onActionFailed,
      });
      q.enqueue('api_call', { url: 'http://localhost:0/test' });
      await q.flush();
      // Individual execution also fails since no server, but action is processed
      expect(onFlush).toHaveBeenCalled();
    });
  });

  describe('expired actions', () => {
    it('should clean expired actions on load', () => {
      const id = queue.enqueue('api_call', { url: '/test' }, {
        expiresAt: Date.now() - 1000,
      });
      // Trigger load from storage by creating new instance
      const q2 = new OfflineQueueService({ storageKey: 'test_queue' });
      expect(q2.getSize()).toBe(0);
    });
  });

  describe('persistence', () => {
    it('should save to localStorage on enqueue', () => {
      queue.enqueue('api_call', { url: '/test' });
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'test_queue',
        expect.any(String)
      );
    });

    it('should load from localStorage on init', () => {
      queue.enqueue('api_call', { url: '/test' });
      const q2 = new OfflineQueueService({ storageKey: 'test_queue' });
      expect(q2.getSize()).toBe(1);
    });
  });

  describe('online status', () => {
    it('should report online status', () => {
      expect(queue.getOnlineStatus()).toBe(true);
    });
  });
});
