import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Round 201 — WebSocket Connection Pool & Smart Reconnection
 * 导入真实模块 src/utils/wsConnectionPool.ts，删除内联重实现。
 */

import { WebSocketConnectionPool, type WSConnectionConfig } from '../utils/wsConnectionPool';

const sampleConfig = (overrides: Partial<WSConnectionConfig> = {}): WSConnectionConfig => ({
  url: 'wss://quotes.example.com',
  channels: ['sh000001'],
  priority: 1,
  maxRetries: 10,
  heartbeatInterval: 30000,
  ...overrides,
});

describe('Round 201: WebSocket Connection Pool', () => {
  let pool: WebSocketConnectionPool;

  beforeEach(() => {
    pool = new WebSocketConnectionPool(6, 1000, 30000);
  });

  describe('Connection Management', () => {
    it('adds a connection and maps channels', () => {
      const id = pool.addConnection(sampleConfig({ channels: ['sh000001', 'sz399001'] }));
      expect(id).toBeTruthy();
      expect(pool.size()).toBe(1);
      expect(pool.getConnectionByChannel('sh000001')).toBeDefined();
      expect(pool.getConnectionByChannel('sz399001')).toBeDefined();
    });

    it('removes connection and cleans channel map', () => {
      const id = pool.addConnection(sampleConfig());
      pool.removeConnection(id);
      expect(pool.size()).toBe(0);
      expect(pool.getConnectionByChannel('sh000001')).toBeUndefined();
    });

    it('supports multiple connections with different channels', () => {
      pool.addConnection(sampleConfig({ url: 'wss://a.example.com', channels: ['ch1', 'ch2'] }));
      pool.addConnection(sampleConfig({ url: 'wss://b.example.com', channels: ['ch3', 'ch4'], priority: 2 }));
      expect(pool.size()).toBe(2);
      expect(pool.getConnectionByChannel('ch1')?.url).toBe('wss://a.example.com');
      expect(pool.getConnectionByChannel('ch4')?.url).toBe('wss://b.example.com');
    });

    it('returns false for removing non-existent connection', () => {
      expect(pool.removeConnection('fake-id')).toBe(false);
    });

    it('getAllConnections returns all', () => {
      pool.addConnection(sampleConfig({ channels: ['ch1'], maxRetries: 5 }));
      pool.addConnection(sampleConfig({ channels: ['ch2'], maxRetries: 5, priority: 2 }));
      expect(pool.getAllConnections()).toHaveLength(2);
    });
  });

  describe('Smart Reconnection', () => {
    it('calculates exponential backoff delay with jitter', () => {
      const d0 = pool.getReconnectDelay(0);
      const d1 = pool.getReconnectDelay(1);
      const d2 = pool.getReconnectDelay(2);
      const d5 = pool.getReconnectDelay(5);
      expect(d0).toBeGreaterThanOrEqual(1000);
      expect(d0).toBeLessThan(1500);
      expect(d1).toBeGreaterThanOrEqual(2000);
      expect(d1).toBeLessThan(2500);
      expect(d2).toBeGreaterThanOrEqual(4000);
      expect(d2).toBeLessThan(4500);
      expect(d5).toBeLessThanOrEqual(30000);
    });

    it('caps delay at maxReconnectDelay', () => {
      const d100 = pool.getReconnectDelay(100);
      expect(d100).toBeLessThanOrEqual(30000);
    });

    it('shouldReconnect respects hardcoded retry limit (10)', () => {
      const id = pool.addConnection(sampleConfig());
      expect(pool.shouldReconnect(id)).toBe(true);
      for (let i = 0; i < 10; i++) {
        pool.markReconnecting(id);
      }
      expect(pool.shouldReconnect(id)).toBe(false);
    });

    it('shouldReconnect false for non-existent connection', () => {
      expect(pool.shouldReconnect('fake-id')).toBe(false);
    });

    it('resets retry count on successful connection', () => {
      const id = pool.addConnection(sampleConfig());
      pool.markReconnecting(id);
      pool.markReconnecting(id);
      pool.resetRetryCount(id);
      const conn = pool.getAllConnections()[0];
      expect(conn.retryCount).toBe(0);
      expect(conn.state).toBe('open');
    });

    it('tracks reconnect count globally', () => {
      const id = pool.addConnection(sampleConfig());
      pool.markReconnecting(id);
      pool.markReconnecting(id);
      expect(pool.getStats().reconnectCount).toBe(2);
    });
  });

  describe('Message Queue', () => {
    it('enqueues and flushes messages', () => {
      const id = pool.addConnection(sampleConfig());
      pool.enqueueMessage(id, { type: 'subscribe', channel: 'ch1' });
      pool.enqueueMessage(id, { type: 'ping' });
      const flushed = pool.flushQueue(id);
      expect(flushed).toHaveLength(2);
      expect(pool.flushQueue(id)).toHaveLength(0);
    });

    it('enqueue returns false for non-existent connection', () => {
      expect(pool.enqueueMessage('fake', { type: 'test' })).toBe(false);
    });

    it('flush returns empty for non-existent connection', () => {
      expect(pool.flushQueue('fake')).toEqual([]);
    });
  });

  describe('Heartbeat & Latency', () => {
    it('updates heartbeat timestamp', () => {
      const id = pool.addConnection(sampleConfig());
      pool.updateHeartbeat(id);
      expect(pool.isHeartbeatStale(id, 60000)).toBe(false);
    });

    it('detects stale heartbeat', () => {
      const id = pool.addConnection(sampleConfig());
      expect(pool.isHeartbeatStale(id, 60000)).toBe(true);
    });

    it('tracks latency per connection', () => {
      const id = pool.addConnection(sampleConfig());
      pool.resetRetryCount(id);
      pool.setLatency(id, 42);
      expect(pool.getStats().avgLatency).toBe(42);
    });

    it('calculates average latency across connections', () => {
      const id1 = pool.addConnection(sampleConfig({ channels: ['ch1'] }));
      const id2 = pool.addConnection(sampleConfig({ url: 'wss://b.example.com', channels: ['ch2'], priority: 2 }));
      pool.resetRetryCount(id1);
      pool.resetRetryCount(id2);
      pool.setLatency(id1, 30);
      pool.setLatency(id2, 50);
      expect(pool.getStats().avgLatency).toBe(40);
    });
  });

  describe('Pool Statistics', () => {
    it('tracks total and active connections', () => {
      pool.addConnection(sampleConfig({ channels: ['ch1'] }));
      pool.addConnection(sampleConfig({ url: 'wss://b.example.com', channels: ['ch2'], priority: 2 }));
      const stats = pool.getStats();
      expect(stats.totalConnections).toBe(2);
      expect(stats.activeConnections).toBe(0);
    });

    it('counts queued messages', () => {
      const id = pool.addConnection(sampleConfig());
      pool.enqueueMessage(id, 'msg1');
      pool.enqueueMessage(id, 'msg2');
      pool.enqueueMessage(id, 'msg3');
      expect(pool.getStats().queuedMessages).toBe(3);
    });

    it('prioritize sorts by priority', () => {
      pool.addConnection(sampleConfig({ url: 'wss://a.example.com', channels: ['ch1'], priority: 3 }));
      pool.addConnection(sampleConfig({ url: 'wss://b.example.com', channels: ['ch2'], priority: 1 }));
      pool.addConnection(sampleConfig({ url: 'wss://c.example.com', channels: ['ch3'], priority: 2 }));
      const sorted = pool.prioritize();
      expect(sorted[0].priority).toBe(1);
      expect(sorted[1].priority).toBe(2);
      expect(sorted[2].priority).toBe(3);
    });
  });
});
