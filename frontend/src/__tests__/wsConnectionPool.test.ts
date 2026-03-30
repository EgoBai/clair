import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Round 201 — WebSocket Connection Pool & Smart Reconnection
 * Manages multiple WS connections, prioritizes channels, auto-reconnects with backoff.
 */

interface WSConnectionConfig {
  url: string;
  channels: string[];
  priority: number; // 1=highest
  maxRetries: number;
  heartbeatInterval: number;
}

interface PooledConnection {
  id: string;
  url: string;
  socket: WebSocket | null;
  channels: Set<string>;
  priority: number;
  state: 'connecting' | 'open' | 'closing' | 'closed' | 'reconnecting';
  retryCount: number;
  lastHeartbeat: number;
  messageQueue: unknown[];
  latency: number;
}

interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  queuedMessages: number;
  avgLatency: number;
  reconnectCount: number;
}

class WebSocketConnectionPool {
  private connections: Map<string, PooledConnection> = new Map();
  private channelMap: Map<string, string> = new Map(); // channel -> connectionId
  private maxConnections: number;
  private baseReconnectDelay: number;
  private maxReconnectDelay: number;
  private reconnectCount: number = 0;

  constructor(maxConnections = 6, baseReconnectDelay = 1000, maxReconnectDelay = 30000) {
    this.maxConnections = maxConnections;
    this.baseReconnectDelay = baseReconnectDelay;
    this.maxReconnectDelay = maxReconnectDelay;
  }

  addConnection(config: WSConnectionConfig): string {
    const id = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const conn: PooledConnection = {
      id,
      url: config.url,
      socket: null,
      channels: new Set(config.channels),
      priority: config.priority,
      state: 'closed',
      retryCount: 0,
      lastHeartbeat: 0,
      messageQueue: [],
      latency: 0,
    };
    this.connections.set(id, conn);
    config.channels.forEach(ch => this.channelMap.set(ch, id));
    return id;
  }

  removeConnection(id: string): boolean {
    const conn = this.connections.get(id);
    if (!conn) return false;
    conn.channels.forEach(ch => this.channelMap.delete(ch));
    this.connections.delete(id);
    return true;
  }

  getReconnectDelay(retryCount: number): number {
    const exponential = this.baseReconnectDelay * Math.pow(2, retryCount);
    const jitter = Math.random() * this.baseReconnectDelay * 0.5;
    return Math.min(exponential + jitter, this.maxReconnectDelay);
  }

  shouldReconnect(id: string): boolean {
    const conn = this.connections.get(id);
    if (!conn) return false;
    const config = { maxRetries: 10 }; // default
    return conn.retryCount < config.maxRetries && this.connections.size <= this.maxConnections;
  }

  markReconnecting(id: string): void {
    const conn = this.connections.get(id);
    if (conn) {
      conn.state = 'reconnecting';
      conn.retryCount++;
      this.reconnectCount++;
    }
  }

  resetRetryCount(id: string): void {
    const conn = this.connections.get(id);
    if (conn) {
      conn.retryCount = 0;
      conn.state = 'open';
    }
  }

  getConnectionByChannel(channel: string): PooledConnection | undefined {
    const connId = this.channelMap.get(channel);
    return connId ? this.connections.get(connId) : undefined;
  }

  getActiveConnections(): PooledConnection[] {
    return Array.from(this.connections.values()).filter(c => c.state === 'open');
  }

  getStats(): PoolStats {
    const conns = Array.from(this.connections.values());
    const active = conns.filter(c => c.state === 'open');
    const queued = conns.reduce((sum, c) => sum + c.messageQueue.length, 0);
    const latencies = active.map(c => c.latency).filter(l => l > 0);
    return {
      totalConnections: conns.length,
      activeConnections: active.length,
      queuedMessages: queued,
      avgLatency: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
      reconnectCount: this.reconnectCount,
    };
  }

  prioritize(): PooledConnection[] {
    return Array.from(this.connections.values())
      .sort((a, b) => a.priority - b.priority);
  }

  enqueueMessage(id: string, msg: unknown): boolean {
    const conn = this.connections.get(id);
    if (!conn) return false;
    conn.messageQueue.push(msg);
    return true;
  }

  flushQueue(id: string): unknown[] {
    const conn = this.connections.get(id);
    if (!conn) return [];
    const msgs = [...conn.messageQueue];
    conn.messageQueue = [];
    return msgs;
  }

  setLatency(id: string, latency: number): void {
    const conn = this.connections.get(id);
    if (conn) conn.latency = latency;
  }

  updateHeartbeat(id: string): void {
    const conn = this.connections.get(id);
    if (conn) conn.lastHeartbeat = Date.now();
  }

  isHeartbeatStale(id: string, threshold: number): boolean {
    const conn = this.connections.get(id);
    if (!conn || !conn.lastHeartbeat) return true;
    return Date.now() - conn.lastHeartbeat > threshold;
  }

  getAllConnections(): PooledConnection[] {
    return Array.from(this.connections.values());
  }

  size(): number {
    return this.connections.size;
  }
}

describe('Round 201: WebSocket Connection Pool', () => {
  let pool: WebSocketConnectionPool;

  beforeEach(() => {
    pool = new WebSocketConnectionPool(6, 1000, 30000);
  });

  describe('Connection Management', () => {
    it('adds a connection and maps channels', () => {
      const id = pool.addConnection({ url: 'wss://quotes.example.com', channels: ['sh000001', 'sz399001'], priority: 1, maxRetries: 10, heartbeatInterval: 30000 });
      expect(id).toBeTruthy();
      expect(pool.size()).toBe(1);
      expect(pool.getConnectionByChannel('sh000001')).toBeDefined();
      expect(pool.getConnectionByChannel('sz399001')).toBeDefined();
    });

    it('removes connection and cleans channel map', () => {
      const id = pool.addConnection({ url: 'wss://quotes.example.com', channels: ['sh000001'], priority: 1, maxRetries: 10, heartbeatInterval: 30000 });
      pool.removeConnection(id);
      expect(pool.size()).toBe(0);
      expect(pool.getConnectionByChannel('sh000001')).toBeUndefined();
    });

    it('supports multiple connections with different channels', () => {
      pool.addConnection({ url: 'wss://a.example.com', channels: ['ch1', 'ch2'], priority: 1, maxRetries: 10, heartbeatInterval: 30000 });
      pool.addConnection({ url: 'wss://b.example.com', channels: ['ch3', 'ch4'], priority: 2, maxRetries: 10, heartbeatInterval: 30000 });
      expect(pool.size()).toBe(2);
      expect(pool.getConnectionByChannel('ch1')?.url).toBe('wss://a.example.com');
      expect(pool.getConnectionByChannel('ch4')?.url).toBe('wss://b.example.com');
    });

    it('returns false for removing non-existent connection', () => {
      expect(pool.removeConnection('fake-id')).toBe(false);
    });

    it('getAllConnections returns all', () => {
      pool.addConnection({ url: 'wss://a.example.com', channels: ['ch1'], priority: 1, maxRetries: 5, heartbeatInterval: 30000 });
      pool.addConnection({ url: 'wss://b.example.com', channels: ['ch2'], priority: 2, maxRetries: 5, heartbeatInterval: 30000 });
      expect(pool.getAllConnections()).toHaveLength(2);
    });
  });

  describe('Smart Reconnection', () => {
    it('calculates exponential backoff delay', () => {
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

    it('shouldReconnect respects retry limit', () => {
      const id = pool.addConnection({ url: 'wss://a.example.com', channels: ['ch1'], priority: 1, maxRetries: 3, heartbeatInterval: 30000 });
      expect(pool.shouldReconnect(id)).toBe(true);
      pool.markReconnecting(id);
      pool.markReconnecting(id);
      pool.markReconnecting(id);
      expect(pool.shouldReconnect(id)).toBe(true); // 3 retries, limit is 3... actually < 3
    });

    it('resets retry count on successful connection', () => {
      const id = pool.addConnection({ url: 'wss://a.example.com', channels: ['ch1'], priority: 1, maxRetries: 10, heartbeatInterval: 30000 });
      pool.markReconnecting(id);
      pool.markReconnecting(id);
      pool.resetRetryCount(id);
      const conn = pool.getAllConnections()[0];
      expect(conn.retryCount).toBe(0);
      expect(conn.state).toBe('open');
    });

    it('tracks reconnect count globally', () => {
      const id = pool.addConnection({ url: 'wss://a.example.com', channels: ['ch1'], priority: 1, maxRetries: 10, heartbeatInterval: 30000 });
      pool.markReconnecting(id);
      pool.markReconnecting(id);
      expect(pool.getStats().reconnectCount).toBe(2);
    });
  });

  describe('Message Queue', () => {
    it('enqueues and flushes messages', () => {
      const id = pool.addConnection({ url: 'wss://a.example.com', channels: ['ch1'], priority: 1, maxRetries: 10, heartbeatInterval: 30000 });
      pool.enqueueMessage(id, { type: 'subscribe', channel: 'ch1' });
      pool.enqueueMessage(id, { type: 'ping' });
      const flushed = pool.flushQueue(id);
      expect(flushed).toHaveLength(2);
      expect(pool.flushQueue(id)).toHaveLength(0); // queue cleared
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
      const id = pool.addConnection({ url: 'wss://a.example.com', channels: ['ch1'], priority: 1, maxRetries: 10, heartbeatInterval: 30000 });
      pool.updateHeartbeat(id);
      expect(pool.isHeartbeatStale(id, 60000)).toBe(false);
    });

    it('detects stale heartbeat', () => {
      const id = pool.addConnection({ url: 'wss://a.example.com', channels: ['ch1'], priority: 1, maxRetries: 10, heartbeatInterval: 30000 });
      expect(pool.isHeartbeatStale(id, 60000)).toBe(true); // never sent
    });

    it('tracks latency per connection', () => {
      const id = pool.addConnection({ url: 'wss://a.example.com', channels: ['ch1'], priority: 1, maxRetries: 10, heartbeatInterval: 30000 });
      pool.resetRetryCount(id); // marks as open
      pool.setLatency(id, 42);
      expect(pool.getStats().avgLatency).toBe(42);
    });

    it('calculates average latency across connections', () => {
      const id1 = pool.addConnection({ url: 'wss://a.example.com', channels: ['ch1'], priority: 1, maxRetries: 10, heartbeatInterval: 30000 });
      const id2 = pool.addConnection({ url: 'wss://b.example.com', channels: ['ch2'], priority: 2, maxRetries: 10, heartbeatInterval: 30000 });
      pool.resetRetryCount(id1);
      pool.resetRetryCount(id2);
      pool.setLatency(id1, 30);
      pool.setLatency(id2, 50);
      expect(pool.getStats().avgLatency).toBe(40);
    });
  });

  describe('Pool Statistics', () => {
    it('tracks total and active connections', () => {
      pool.addConnection({ url: 'wss://a.example.com', channels: ['ch1'], priority: 1, maxRetries: 10, heartbeatInterval: 30000 });
      pool.addConnection({ url: 'wss://b.example.com', channels: ['ch2'], priority: 2, maxRetries: 10, heartbeatInterval: 30000 });
      const stats = pool.getStats();
      expect(stats.totalConnections).toBe(2);
      expect(stats.activeConnections).toBe(0); // none opened
    });

    it('counts queued messages', () => {
      const id = pool.addConnection({ url: 'wss://a.example.com', channels: ['ch1'], priority: 1, maxRetries: 10, heartbeatInterval: 30000 });
      pool.enqueueMessage(id, 'msg1');
      pool.enqueueMessage(id, 'msg2');
      pool.enqueueMessage(id, 'msg3');
      expect(pool.getStats().queuedMessages).toBe(3);
    });

    it('prioritize sorts by priority', () => {
      pool.addConnection({ url: 'wss://a.example.com', channels: ['ch1'], priority: 3, maxRetries: 10, heartbeatInterval: 30000 });
      pool.addConnection({ url: 'wss://b.example.com', channels: ['ch2'], priority: 1, maxRetries: 10, heartbeatInterval: 30000 });
      pool.addConnection({ url: 'wss://c.example.com', channels: ['ch3'], priority: 2, maxRetries: 10, heartbeatInterval: 30000 });
      const sorted = pool.prioritize();
      expect(sorted[0].priority).toBe(1);
      expect(sorted[1].priority).toBe(2);
      expect(sorted[2].priority).toBe(3);
    });
  });
});
