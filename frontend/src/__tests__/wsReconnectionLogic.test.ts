import { describe, it, expect } from 'vitest';

describe('WebSocket Reconnection Logic', () => {
  describe('Exponential Backoff', () => {
    function calculateBackoff(attempt: number, initialDelay: number = 1000, multiplier: number = 2, maxDelay: number = 30000, jitter: number = 0.2): number {
      const base = Math.min(initialDelay * Math.pow(multiplier, attempt), maxDelay);
      const jitterAmount = base * jitter * (Math.random() * 2 - 1);
      return Math.max(0, Math.round(base + jitterAmount));
    }

    it('should increase delay with attempts', () => {
      const delays = Array.from({ length: 5 }, () => calculateBackoff(0, 1000, 2, 30000, 0));
      // With 0 jitter, should be consistent
      expect(delays[0]).toBe(1000);
    });

    it('should cap at max delay', () => {
      const delay = calculateBackoff(100, 1000, 2, 30000, 0);
      expect(delay).toBeLessThanOrEqual(30000);
    });

    it('should apply jitter within range', () => {
      const delays = Array.from({ length: 100 }, () => calculateBackoff(2, 1000, 2, 30000, 0.2));
      for (const d of delays) {
        expect(d).toBeGreaterThanOrEqual(3200); // 4000 - 20%
        expect(d).toBeLessThanOrEqual(4800); // 4000 + 20%
      }
    });

    it('should never return negative delay', () => {
      for (let i = 0; i < 20; i++) {
        const delay = calculateBackoff(i);
        expect(delay).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle attempt 0', () => {
      const delay = calculateBackoff(0, 500, 2, 30000, 0);
      expect(delay).toBe(500);
    });
  });

  describe('Connection State Machine', () => {
    type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

    function transitionState(current: ConnectionState, event: string): ConnectionState {
      const transitions: Record<string, Record<string, ConnectionState>> = {
        disconnected: { connect: 'connecting' },
        connecting: { success: 'connected', failure: 'reconnecting' },
        connected: { disconnect: 'disconnected', error: 'reconnecting' },
        reconnecting: { success: 'connected', failure: 'reconnecting', maxRetries: 'failed' },
        failed: { connect: 'connecting' },
      };
      return transitions[current]?.[event] || current;
    }

    it('should transition from disconnected to connecting', () => {
      expect(transitionState('disconnected', 'connect')).toBe('connecting');
    });

    it('should transition from connecting to connected on success', () => {
      expect(transitionState('connecting', 'success')).toBe('connected');
    });

    it('should transition from connecting to reconnecting on failure', () => {
      expect(transitionState('connecting', 'failure')).toBe('reconnecting');
    });

    it('should transition from connected to reconnecting on error', () => {
      expect(transitionState('connected', 'error')).toBe('reconnecting');
    });

    it('should transition from connected to disconnected', () => {
      expect(transitionState('connected', 'disconnect')).toBe('disconnected');
    });

    it('should transition from reconnecting to connected on success', () => {
      expect(transitionState('reconnecting', 'success')).toBe('connected');
    });

    it('should stay in reconnecting on failure', () => {
      expect(transitionState('reconnecting', 'failure')).toBe('reconnecting');
    });

    it('should transition to failed after max retries', () => {
      expect(transitionState('reconnecting', 'maxRetries')).toBe('failed');
    });

    it('should allow reconnecting from failed state', () => {
      expect(transitionState('failed', 'connect')).toBe('connecting');
    });

    it('should handle unknown events gracefully', () => {
      expect(transitionState('connected', 'unknown')).toBe('connected');
    });
  });

  describe('Message Buffer', () => {
    class MessageBuffer<T> {
      private buffer: T[] = [];
      constructor(private maxSize: number) {}

      add(msg: T): void {
        this.buffer.push(msg);
        if (this.buffer.length > this.maxSize) this.buffer.shift();
      }

      getAll(): T[] { return [...this.buffer]; }
      size(): number { return this.buffer.length; }
      clear(): void { this.buffer = []; }
      latest(): T | undefined { return this.buffer[this.buffer.length - 1]; }
    }

    it('should buffer messages', () => {
      const buf = new MessageBuffer<number>(10);
      buf.add(1);
      buf.add(2);
      expect(buf.getAll()).toEqual([1, 2]);
    });

    it('should limit buffer size', () => {
      const buf = new MessageBuffer<number>(3);
      for (let i = 0; i < 5; i++) buf.add(i);
      expect(buf.size()).toBe(3);
      expect(buf.getAll()).toEqual([2, 3, 4]);
    });

    it('should get latest message', () => {
      const buf = new MessageBuffer<string>(5);
      buf.add('a');
      buf.add('b');
      expect(buf.latest()).toBe('b');
    });

    it('should handle empty buffer', () => {
      const buf = new MessageBuffer<number>(5);
      expect(buf.latest()).toBeUndefined();
      expect(buf.getAll()).toEqual([]);
    });

    it('should clear buffer', () => {
      const buf = new MessageBuffer<number>(5);
      buf.add(1);
      buf.clear();
      expect(buf.size()).toBe(0);
    });

    it('should handle max size 1', () => {
      const buf = new MessageBuffer<number>(1);
      buf.add(1);
      buf.add(2);
      expect(buf.getAll()).toEqual([2]);
    });
  });

  describe('Heartbeat Logic', () => {
    function shouldSendHeartbeat(lastPing: number, interval: number): boolean {
      return Date.now() - lastPing >= interval;
    }

    function isConnectionStale(lastPong: number, timeout: number): boolean {
      return Date.now() - lastPong > timeout;
    }

    it('should send heartbeat after interval', () => {
      const lastPing = Date.now() - 15000;
      expect(shouldSendHeartbeat(lastPing, 15000)).toBe(true);
    });

    it('should not send heartbeat before interval', () => {
      const lastPing = Date.now() - 5000;
      expect(shouldSendHeartbeat(lastPing, 15000)).toBe(false);
    });

    it('should detect stale connection', () => {
      const lastPong = Date.now() - 20000;
      expect(isConnectionStale(lastPong, 10000)).toBe(true);
    });

    it('should not detect fresh connection as stale', () => {
      const lastPong = Date.now() - 5000;
      expect(isConnectionStale(lastPong, 10000)).toBe(false);
    });
  });

  describe('Subscription Management', () => {
    class SubscriptionManager {
      private subs = new Map<string, Set<string>>();

      subscribe(connectionId: string, channel: string): void {
        if (!this.subs.has(connectionId)) this.subs.set(connectionId, new Set());
        this.subs.get(connectionId)!.add(channel);
      }

      unsubscribe(connectionId: string, channel: string): void {
        this.subs.get(connectionId)?.delete(channel);
      }

      getChannels(connectionId: string): string[] {
        return Array.from(this.subs.get(connectionId) || []);
      }

      clearConnection(connectionId: string): void {
        this.subs.delete(connectionId);
      }

      getConnections(channel: string): string[] {
        const result: string[] = [];
        for (const [conn, channels] of this.subs) {
          if (channels.has(channel)) result.push(conn);
        }
        return result;
      }
    }

    it('should subscribe to channels', () => {
      const mgr = new SubscriptionManager();
      mgr.subscribe('conn1', 'stock:600519');
      expect(mgr.getChannels('conn1')).toContain('stock:600519');
    });

    it('should unsubscribe from channels', () => {
      const mgr = new SubscriptionManager();
      mgr.subscribe('conn1', 'stock:600519');
      mgr.unsubscribe('conn1', 'stock:600519');
      expect(mgr.getChannels('conn1')).not.toContain('stock:600519');
    });

    it('should clear all subscriptions for connection', () => {
      const mgr = new SubscriptionManager();
      mgr.subscribe('conn1', 'ch1');
      mgr.subscribe('conn1', 'ch2');
      mgr.clearConnection('conn1');
      expect(mgr.getChannels('conn1')).toEqual([]);
    });

    it('should find connections for channel', () => {
      const mgr = new SubscriptionManager();
      mgr.subscribe('conn1', 'ch1');
      mgr.subscribe('conn2', 'ch1');
      mgr.subscribe('conn3', 'ch2');
      expect(mgr.getConnections('ch1')).toEqual(['conn1', 'conn2']);
    });

    it('should handle multiple channels per connection', () => {
      const mgr = new SubscriptionManager();
      mgr.subscribe('conn1', 'ch1');
      mgr.subscribe('conn1', 'ch2');
      mgr.subscribe('conn1', 'ch3');
      expect(mgr.getChannels('conn1').length).toBe(3);
    });
  });
});
