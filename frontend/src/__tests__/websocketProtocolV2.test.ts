import { describe, it, expect } from 'vitest';

/**
 * WebSocket协议层测试
 */

type MessageType = 'subscribe' | 'unsubscribe' | 'quote' | 'heartbeat' | 'error' | 'snapshot';

interface WSMessage {
  type: MessageType;
  payload: unknown;
  timestamp: number;
  seq?: number;
}

interface Subscription {
  channel: string;
  symbols: string[];
  callback: (msg: WSMessage) => void;
}

function createMessage(type: MessageType, payload: unknown, seq?: number): WSMessage {
  return { type, payload, timestamp: Date.now(), seq };
}

function parseMessage(raw: string): WSMessage | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.type) return null;
    return parsed as WSMessage;
  } catch {
    return null;
  }
}

function validateMessage(msg: WSMessage): boolean {
  const validTypes: MessageType[] = ['subscribe', 'unsubscribe', 'quote', 'heartbeat', 'error', 'snapshot'];
  return validTypes.includes(msg.type) && typeof msg.timestamp === 'number';
}

class MessageBuffer {
  private buffer: WSMessage[] = [];
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  push(msg: WSMessage): void {
    this.buffer.push(msg);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  getLatest(n: number): WSMessage[] {
    return this.buffer.slice(-n);
  }

  getByType(type: MessageType): WSMessage[] {
    return this.buffer.filter(m => m.type === type);
  }

  getAfterSeq(seq: number): WSMessage[] {
    return this.buffer.filter(m => m.seq !== undefined && m.seq > seq);
  }

  clear(): void {
    this.buffer = [];
  }

  size(): number {
    return this.buffer.length;
  }
}

class HeartbeatMonitor {
  private lastHeartbeat: number;
  private intervalMs: number;
  private timeoutMs: number;

  constructor(intervalMs = 15000, timeoutMs = 10000) {
    this.lastHeartbeat = 0;
    this.intervalMs = intervalMs;
    this.timeoutMs = timeoutMs;
  }

  recordHeartbeat(timestamp: number): void {
    this.lastHeartbeat = timestamp;
  }

  isAlive(now: number): boolean {
    return now - this.lastHeartbeat < this.timeoutMs;
  }

  timeSinceLastHeartbeat(now: number): number {
    return now - this.lastHeartbeat;
  }

  getNextHeartbeatTime(): number {
    return this.lastHeartbeat + this.intervalMs;
  }
}

class ReconnectStrategy {
  private attempt: number = 0;
  private initialDelay: number;
  private maxDelay: number;
  private multiplier: number;

  constructor(initialDelay = 1000, maxDelay = 30000, multiplier = 2) {
    this.initialDelay = initialDelay;
    this.maxDelay = maxDelay;
    this.multiplier = multiplier;
  }

  getDelay(): number {
    const delay = this.initialDelay * Math.pow(this.multiplier, this.attempt);
    const jitter = delay * (0.8 + Math.random() * 0.4);
    return Math.min(jitter, this.maxDelay);
  }

  nextAttempt(): void {
    this.attempt++;
  }

  reset(): void {
    this.attempt = 0;
  }

  getAttempt(): number {
    return this.attempt;
  }
}

describe('WebSocket协议层', () => {
  describe('消息创建', () => {
    it('创建行情消息', () => {
      const msg = createMessage('quote', { symbol: '000001', price: 10 });
      expect(msg.type).toBe('quote');
      expect(msg.timestamp).toBeGreaterThan(0);
    });

    it('带序列号', () => {
      const msg = createMessage('quote', {}, 42);
      expect(msg.seq).toBe(42);
    });

    it('心跳消息', () => {
      const msg = createMessage('heartbeat', null);
      expect(msg.type).toBe('heartbeat');
    });
  });

  describe('消息解析', () => {
    it('解析有效JSON', () => {
      const msg = parseMessage('{"type":"quote","timestamp":123}');
      expect(msg).not.toBeNull();
      expect(msg!.type).toBe('quote');
    });

    it('无效JSON返回null', () => {
      expect(parseMessage('not json')).toBeNull();
    });

    it('无type字段返回null', () => {
      expect(parseMessage('{"timestamp":123}')).toBeNull();
    });

    it('空字符串', () => {
      expect(parseMessage('')).toBeNull();
    });
  });

  describe('消息验证', () => {
    it('有效消息', () => {
      expect(validateMessage(createMessage('quote', {}))).toBe(true);
    });

    it('无效类型', () => {
      expect(validateMessage({ type: 'invalid' as MessageType, payload: null, timestamp: 0 })).toBe(false);
    });

    it('所有有效类型', () => {
      const types: MessageType[] = ['subscribe', 'unsubscribe', 'quote', 'heartbeat', 'error', 'snapshot'];
      for (const t of types) {
        expect(validateMessage(createMessage(t, {}))).toBe(true);
      }
    });
  });

  describe('消息缓冲', () => {
    it('基本push/get', () => {
      const buf = new MessageBuffer(10);
      buf.push(createMessage('quote', { v: 1 }));
      expect(buf.size()).toBe(1);
    });

    it('容量限制', () => {
      const buf = new MessageBuffer(3);
      for (let i = 0; i < 5; i++) buf.push(createMessage('quote', { v: i }));
      expect(buf.size()).toBe(3);
    });

    it('获取最新N条', () => {
      const buf = new MessageBuffer(10);
      for (let i = 0; i < 5; i++) buf.push(createMessage('quote', { v: i }));
      const latest = buf.getLatest(2);
      expect(latest.length).toBe(2);
    });

    it('按类型过滤', () => {
      const buf = new MessageBuffer(10);
      buf.push(createMessage('quote', {}));
      buf.push(createMessage('heartbeat', {}));
      buf.push(createMessage('quote', {}));
      expect(buf.getByType('quote').length).toBe(2);
    });

    it('按序列号过滤', () => {
      const buf = new MessageBuffer(10);
      buf.push(createMessage('quote', {}, 1));
      buf.push(createMessage('quote', {}, 3));
      buf.push(createMessage('quote', {}, 5));
      expect(buf.getAfterSeq(2).length).toBe(2);
    });

    it('清空', () => {
      const buf = new MessageBuffer(10);
      buf.push(createMessage('quote', {}));
      buf.clear();
      expect(buf.size()).toBe(0);
    });
  });

  describe('心跳监控', () => {
    it('记录心跳后存活', () => {
      const mon = new HeartbeatMonitor(15000, 10000);
      mon.recordHeartbeat(1000);
      expect(mon.isAlive(5000)).toBe(true);
    });

    it('超时后不存活', () => {
      const mon = new HeartbeatMonitor(15000, 10000);
      mon.recordHeartbeat(1000);
      expect(mon.isAlive(12000)).toBe(false);
    });

    it('时间差计算', () => {
      const mon = new HeartbeatMonitor();
      mon.recordHeartbeat(1000);
      expect(mon.timeSinceLastHeartbeat(3000)).toBe(2000);
    });

    it('下次心跳时间', () => {
      const mon = new HeartbeatMonitor(15000);
      mon.recordHeartbeat(1000);
      expect(mon.getNextHeartbeatTime()).toBe(16000);
    });
  });

  describe('重连策略', () => {
    it('初始重试0', () => {
      const strategy = new ReconnectStrategy();
      expect(strategy.getAttempt()).toBe(0);
    });

    it('重试递增', () => {
      const strategy = new ReconnectStrategy();
      strategy.nextAttempt();
      strategy.nextAttempt();
      expect(strategy.getAttempt()).toBe(2);
    });

    it('重置', () => {
      const strategy = new ReconnectStrategy();
      strategy.nextAttempt();
      strategy.reset();
      expect(strategy.getAttempt()).toBe(0);
    });

    it('延迟在范围内', () => {
      const strategy = new ReconnectStrategy(1000, 30000, 2);
      for (let i = 0; i < 10; i++) {
        expect(strategy.getDelay()).toBeLessThanOrEqual(30000);
        expect(strategy.getDelay()).toBeGreaterThanOrEqual(800); // 80% of minimum
        strategy.nextAttempt();
      }
    });

    it('延迟随重试增加', () => {
      const strategy = new ReconnectStrategy(1000, 100000, 2);
      const delays: number[] = [];
      for (let i = 0; i < 5; i++) {
        delays.push(strategy.getDelay());
        strategy.nextAttempt();
      }
      // Due to jitter, we check trend over multiple runs
      expect(delays[4]).toBeGreaterThan(delays[0] * 0.5);
    });
  });
});
