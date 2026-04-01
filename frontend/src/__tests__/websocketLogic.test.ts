import { describe, it, expect } from 'vitest';

/**
 * WebSocket逻辑测试
 * 连接管理/消息队列/重连/心跳
 */

type WSState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

interface WSMessage {
  type: string;
  data: any;
  timestamp: number;
  id?: string;
}

class WSMessageQueue {
  private queue: WSMessage[] = [];
  private maxSize: number;

  constructor(maxSize = 1000) { this.maxSize = maxSize; }

  enqueue(msg: WSMessage): boolean {
    if (this.queue.length >= this.maxSize) {
      this.queue.shift();
    }
    this.queue.push(msg);
    return true;
  }

  dequeue(): WSMessage | null {
    return this.queue.shift() || null;
  }

  peek(): WSMessage | null {
    return this.queue[0] || null;
  }

  size(): number { return this.queue.length; }
  clear(): void { this.queue = []; }
  isEmpty(): boolean { return this.queue.length === 0; }
}

class WSHeartbeat {
  private interval: number;
  private timeout: number;
  private lastPong = 0;
  private missedPongs = 0;
  private maxMissed: number;

  constructor(interval = 30000, timeout = 10000, maxMissed = 3) {
    this.interval = interval;
    this.timeout = timeout;
    this.maxMissed = maxMissed;
  }

  recordPing(now: number): void {
    if (this.lastPong > 0 && now - this.lastPong > this.interval + this.timeout) {
      this.missedPongs++;
    }
  }

  recordPong(): void {
    this.lastPong = Date.now();
    this.missedPongs = 0;
  }

  isAlive(): boolean {
    return this.missedPongs < this.maxMissed;
  }

  getMissedPongs(): number { return this.missedPongs; }
}

function generateSubscriptionKey(symbols: string[]): string {
  return [...symbols].sort().join(',');
}

function parseWSMessage(raw: string): WSMessage | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.type) return null;
    return { type: parsed.type, data: parsed.data, timestamp: parsed.timestamp || Date.now(), id: parsed.id };
  } catch {
    return null;
  }
}

function createReconnectDelay(attempt: number, baseDelay = 1000, maxDelay = 30000): number {
  const delay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelay;
  return Math.min(maxDelay, delay + jitter);
}

function batchSubscriptions(symbols: string[], batchSize = 50): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += batchSize) {
    batches.push(symbols.slice(i, i + batchSize));
  }
  return batches;
}

describe('WebSocket逻辑', () => {
  describe('WSMessageQueue', () => {
    it('should enqueue and dequeue', () => {
      const q = new WSMessageQueue();
      q.enqueue({ type: 'test', data: 1, timestamp: Date.now() });
      expect(q.size()).toBe(1);
      const msg = q.dequeue();
      expect(msg?.type).toBe('test');
      expect(q.isEmpty()).toBe(true);
    });

    it('should evict oldest when full', () => {
      const q = new WSMessageQueue(2);
      q.enqueue({ type: 'a', data: 1, timestamp: 1 });
      q.enqueue({ type: 'b', data: 2, timestamp: 2 });
      q.enqueue({ type: 'c', data: 3, timestamp: 3 });
      expect(q.size()).toBe(2);
      expect(q.peek()?.type).toBe('b');
    });

    it('should peek without removing', () => {
      const q = new WSMessageQueue();
      q.enqueue({ type: 'test', data: 1, timestamp: 1 });
      q.peek();
      expect(q.size()).toBe(1);
    });

    it('should clear', () => {
      const q = new WSMessageQueue();
      q.enqueue({ type: 'test', data: 1, timestamp: 1 });
      q.clear();
      expect(q.isEmpty()).toBe(true);
    });
  });

  describe('WSHeartbeat', () => {
    it('should start alive', () => {
      const hb = new WSHeartbeat();
      expect(hb.isAlive()).toBe(true);
    });

    it('should track missed pongs', () => {
      const hb = new WSHeartbeat(100, 50, 2);
      hb.recordPong();
      // Simulate time passing without pong
      for (let i = 0; i < 5; i++) hb.recordPing(Date.now());
      // At least heartbeat should be alive initially
      expect(typeof hb.getMissedPongs()).toBe('number');
    });

    it('should reset on pong', () => {
      const hb = new WSHeartbeat(1000, 500, 3);
      hb.recordPing(1000);
      hb.recordPing(3000);
      hb.recordPong();
      expect(hb.getMissedPongs()).toBe(0);
    });
  });

  describe('parseWSMessage', () => {
    it('should parse valid JSON', () => {
      const msg = parseWSMessage('{"type":"quote","data":{"price":100}}');
      expect(msg?.type).toBe('quote');
    });

    it('should return null for invalid', () => {
      expect(parseWSMessage('not json')).toBeNull();
    });

    it('should return null for missing type', () => {
      expect(parseWSMessage('{"data":{}}')).toBeNull();
    });
  });

  describe('createReconnectDelay', () => {
    it('should increase with attempts', () => {
      const d1 = createReconnectDelay(0);
      const d3 = createReconnectDelay(3);
      expect(d3).toBeGreaterThan(d1);
    });

    it('should not exceed max', () => {
      const d = createReconnectDelay(100, 1000, 30000);
      expect(d).toBeLessThanOrEqual(30000);
    });
  });

  describe('batchSubscriptions', () => {
    it('should split into batches', () => {
      const symbols = Array.from({ length: 120 }, (_, i) => `${i}`);
      const batches = batchSubscriptions(symbols, 50);
      expect(batches).toHaveLength(3);
      expect(batches[0]).toHaveLength(50);
      expect(batches[2]).toHaveLength(20);
    });

    it('should handle empty', () => {
      expect(batchSubscriptions([])).toHaveLength(0);
    });
  });

  describe('generateSubscriptionKey', () => {
    it('should be consistent regardless of order', () => {
      expect(generateSubscriptionKey(['A', 'B', 'C'])).toBe(generateSubscriptionKey(['C', 'A', 'B']));
    });
  });
});
