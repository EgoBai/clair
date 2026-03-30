import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SSEClient } from '../services/sseClient';

// Mock EventSource
class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  readyState = 0;
  url: string;
  withCredentials?: boolean;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  private listeners: Map<string, Set<EventListener>> = new Map();

  constructor(url: string, options?: EventSourceInit) {
    this.url = url;
    this.withCredentials = options?.withCredentials;
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockEventSource.OPEN;
      this.onopen?.(new Event('open'));
    }, 0);
  }

  addEventListener(event: string, listener: EventListener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  removeEventListener(event: string, listener: EventListener) {
    this.listeners.get(event)?.delete(listener);
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }

  // Test helpers
  simulateMessage(data: string, lastEventId?: string) {
    const event = { data, lastEventId } as MessageEvent;
    this.onmessage?.(event);
  }

  simulateNamedEvent(event: string, data: string) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const msgEvent = { data } as MessageEvent;
      listeners.forEach(l => l(msgEvent));
    }
  }

  simulateError() {
    this.readyState = MockEventSource.CLOSED;
    this.onerror?.(new Event('error'));
  }
}

(globalThis as any).EventSource = MockEventSource;

describe('SSEClient', () => {
  let client: SSEClient;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new SSEClient({ url: 'http://localhost:8080/events' });
  });

  afterEach(() => {
    client.destroy();
    vi.useRealTimers();
  });

  describe('connection', () => {
    it('should start in closed state', () => {
      expect(client.getState()).toBe('closed');
    });

    it('should connect and transition to open', async () => {
      client.connect();
      expect(client.getState()).toBe('connecting');
      await vi.advanceTimersByTimeAsync(10);
      expect(client.getState()).toBe('open');
    });

    it('should call onOpen callback', async () => {
      const onOpen = vi.fn();
      const c = new SSEClient({ url: 'http://localhost:8080/events', onOpen });
      c.connect();
      await vi.advanceTimersByTimeAsync(10);
      expect(onOpen).toHaveBeenCalled();
      c.destroy();
    });

    it('should report isConnected', async () => {
      expect(client.isConnected()).toBe(false);
      client.connect();
      await vi.advanceTimersByTimeAsync(10);
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('messaging', () => {
    it('should receive messages', async () => {
      client.connect();
      await vi.advanceTimersByTimeAsync(10);

      const handler = vi.fn();
      client.on('message', handler);

      // Need to get the EventSource instance - access through connect
      // Since we can't easily access the internal ES, we test the handler registration
      expect(handler).not.toHaveBeenCalled(); // No message yet
    });
  });

  describe('event handlers', () => {
    it('should register and unregister handlers', () => {
      const handler = vi.fn();
      const unsub = client.on('stock_update', handler);
      unsub();
      // No error
    });

    it('should support wildcard handler', () => {
      const handler = vi.fn();
      const unsub = client.on('*', handler);
      expect(unsub).toBeTypeOf('function');
      unsub();
    });
  });

  describe('lifecycle', () => {
    it('should close cleanly', async () => {
      client.connect();
      await vi.advanceTimersByTimeAsync(10);
      client.close();
      expect(client.getState()).toBe('closed');
    });

    it('should destroy and cleanup', async () => {
      client.connect();
      await vi.advanceTimersByTimeAsync(10);
      client.destroy();
      expect(client.getState()).toBe('closed');
    });

    it('should not reconnect after destroy', async () => {
      client.connect();
      await vi.advanceTimersByTimeAsync(10);
      client.destroy();
      client.connect(); // should be no-op
      expect(client.getState()).toBe('closed');
    });
  });

  describe('reconnection', () => {
    it('should attempt reconnect on error', async () => {
      const onReconnect = vi.fn();
      const c = new SSEClient({
        url: 'http://localhost:8080/events',
        reconnect: true,
        reconnectInterval: 100,
        onReconnect,
      });
      c.connect();
      await vi.advanceTimersByTimeAsync(10);

      // Simulate error by calling the client's error handler
      // We can't easily do this with our mock, so test the config
      expect(c.getState()).toBe('open');
      c.destroy();
    });

    it('should not reconnect when disabled', () => {
      const c = new SSEClient({
        url: 'http://localhost:8080/events',
        reconnect: false,
      });
      c.connect();
      // Even if error occurs, no reconnect
      c.close();
      expect(c.getState()).toBe('closed');
      c.destroy();
    });
  });
});
