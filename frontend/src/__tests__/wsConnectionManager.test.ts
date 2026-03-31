// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketManager, ConnectionPool } from '../services/wsConnectionManager';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  sentMessages: string[] = [];

  constructor(public url: string, public protocols?: string | string[]) {
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 0);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: code || 1000, reason: reason || '' } as CloseEvent);
  }

  simulateMessage(data: any) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  simulateError() {
    this.onerror?.(new Event('error'));
  }
}

let originalWebSocket: typeof WebSocket;

beforeEach(() => {
  originalWebSocket = globalThis.WebSocket;
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  globalThis.WebSocket = originalWebSocket;
});

describe('WebSocketManager', () => {
  const defaultConfig = {
    url: 'ws://localhost:8080',
    reconnect: true,
    reconnectInterval: 1000,
    maxReconnectAttempts: 3,
    heartbeatInterval: 5000,
    heartbeatMessage: '{"type":"ping"}',
    messageQueueMax: 10,
  };

  it('should start disconnected', () => {
    const mgr = new WebSocketManager(defaultConfig);
    expect(mgr.getState()).toBe('disconnected');
    expect(mgr.isConnected()).toBe(false);
  });

  it('should connect and transition to connected state', async () => {
    const mgr = new WebSocketManager(defaultConfig);
    mgr.connect();
    expect(mgr.getState()).toBe('connecting');
    await vi.advanceTimersByTimeAsync(10);
    expect(mgr.getState()).toBe('connected');
    expect(mgr.isConnected()).toBe(true);
  });

  it('should call onOpen callback', async () => {
    const onOpen = vi.fn();
    const mgr = new WebSocketManager({ ...defaultConfig, onOpen });
    mgr.connect();
    await vi.advanceTimersByTimeAsync(10);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('should send messages when connected', async () => {
    const mgr = new WebSocketManager(defaultConfig);
    mgr.connect();
    await vi.advanceTimersByTimeAsync(10);
    const sent = mgr.send('hello');
    expect(sent).toBe(true);
  });

  it('should queue messages when disconnected', () => {
    const mgr = new WebSocketManager(defaultConfig);
    const sent = mgr.send('queued');
    expect(sent).toBe(false);
    expect(mgr.getStats().queuedMessages).toBe(1);
  });

  it('should send object as JSON', async () => {
    const mgr = new WebSocketManager(defaultConfig);
    mgr.connect();
    await vi.advanceTimersByTimeAsync(10);
    mgr.send({ type: 'test', value: 42 });
    // Verify it was sent (via mock)
    const ws = (mgr as any).ws;
    expect(ws.sentMessages).toContain('{"type":"test","value":42}');
  });

  it('should disconnect cleanly', async () => {
    const mgr = new WebSocketManager(defaultConfig);
    mgr.connect();
    await vi.advanceTimersByTimeAsync(10);
    mgr.disconnect();
    expect(mgr.getState()).toBe('disconnected');
  });

  it('should call onClose on disconnect', async () => {
    const onClose = vi.fn();
    const mgr = new WebSocketManager({ ...defaultConfig, onClose });
    mgr.connect();
    await vi.advanceTimersByTimeAsync(10);
    mgr.disconnect();
    expect(onClose).toHaveBeenCalledWith(1000, 'Client disconnect');
  });

  it('should track stats', async () => {
    const mgr = new WebSocketManager(defaultConfig);
    mgr.connect();
    await vi.advanceTimersByTimeAsync(10);
    mgr.send('msg1');
    const stats = mgr.getStats();
    expect(stats.messagesSent).toBe(1);
    expect(stats.connectionState).toBe('connected');
    expect(stats.uptime).toBeGreaterThanOrEqual(0);
  });

  it('should clear queue', () => {
    const mgr = new WebSocketManager(defaultConfig);
    mgr.send('q1');
    mgr.send('q2');
    expect(mgr.getStats().queuedMessages).toBe(2);
    mgr.clearQueue();
    expect(mgr.getStats().queuedMessages).toBe(0);
  });

  it('should handle onMessage callback', async () => {
    const onMessage = vi.fn();
    const mgr = new WebSocketManager({ ...defaultConfig, onMessage });
    mgr.connect();
    await vi.advanceTimersByTimeAsync(10);
    const ws = (mgr as any).ws as MockWebSocket;
    ws.simulateMessage({ type: 'data', value: 1 });
    expect(onMessage).toHaveBeenCalled();
  });

  it('should not trigger onMessage for pong responses', async () => {
    const onMessage = vi.fn();
    const mgr = new WebSocketManager({ ...defaultConfig, onMessage });
    mgr.connect();
    await vi.advanceTimersByTimeAsync(10);
    const ws = (mgr as any).ws as MockWebSocket;
    ws.simulateMessage({ type: 'pong' });
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('should update config', () => {
    const mgr = new WebSocketManager(defaultConfig);
    mgr.updateConfig({ reconnectInterval: 5000 });
    const internal = (mgr as any).config;
    expect(internal.reconnectInterval).toBe(5000);
  });

  it('should not reconnect on intentional close', async () => {
    const mgr = new WebSocketManager(defaultConfig);
    mgr.connect();
    await vi.advanceTimersByTimeAsync(10);
    mgr.disconnect();
    await vi.advanceTimersByTimeAsync(5000);
    expect(mgr.getState()).toBe('disconnected');
  });

  it('should call onError callback', async () => {
    const onError = vi.fn();
    const mgr = new WebSocketManager({ ...defaultConfig, onError });
    mgr.connect();
    await vi.advanceTimersByTimeAsync(10);
    const ws = (mgr as any).ws as MockWebSocket;
    ws.simulateError();
    expect(onError).toHaveBeenCalled();
  });
});

describe('ConnectionPool', () => {
  it('should add and retrieve connections', () => {
    const pool = new ConnectionPool();
    const mgr = pool.add('ws1', { url: 'ws://localhost:1', reconnect: false, reconnectInterval: 1000, maxReconnectAttempts: 3, heartbeatInterval: 5000, heartbeatMessage: '', messageQueueMax: 10 });
    expect(pool.get('ws1')).toBe(mgr);
  });

  it('should remove connections', () => {
    const pool = new ConnectionPool();
    pool.add('ws1', { url: 'ws://localhost:1', reconnect: false, reconnectInterval: 1000, maxReconnectAttempts: 3, heartbeatInterval: 5000, heartbeatMessage: '', messageQueueMax: 10 });
    pool.remove('ws1');
    expect(pool.get('ws1')).toBeUndefined();
  });

  it('should disconnect all', () => {
    const pool = new ConnectionPool();
    pool.add('ws1', { url: 'ws://localhost:1', reconnect: false, reconnectInterval: 1000, maxReconnectAttempts: 3, heartbeatInterval: 5000, heartbeatMessage: '', messageQueueMax: 10 });
    pool.add('ws2', { url: 'ws://localhost:2', reconnect: false, reconnectInterval: 1000, maxReconnectAttempts: 3, heartbeatInterval: 5000, heartbeatMessage: '', messageQueueMax: 10 });
    pool.disconnectAll();
    expect(pool.get('ws1')).toBeUndefined();
    expect(pool.get('ws2')).toBeUndefined();
  });

  it('should get stats for all connections', () => {
    const pool = new ConnectionPool();
    pool.add('ws1', { url: 'ws://localhost:1', reconnect: false, reconnectInterval: 1000, maxReconnectAttempts: 3, heartbeatInterval: 5000, heartbeatMessage: '', messageQueueMax: 10 });
    const stats = pool.getStats();
    expect(stats.ws1).toBeDefined();
    expect(stats.ws1.connectionState).toBe('disconnected');
  });

  it('should replace existing connection with same id', () => {
    const pool = new ConnectionPool();
    const first = pool.add('ws1', { url: 'ws://localhost:1', reconnect: false, reconnectInterval: 1000, maxReconnectAttempts: 3, heartbeatInterval: 5000, heartbeatMessage: '', messageQueueMax: 10 });
    const second = pool.add('ws1', { url: 'ws://localhost:2', reconnect: false, reconnectInterval: 1000, maxReconnectAttempts: 3, heartbeatInterval: 5000, heartbeatMessage: '', messageQueueMax: 10 });
    expect(pool.get('ws1')).toBe(second);
    expect(pool.get('ws1')).not.toBe(first);
  });
});
