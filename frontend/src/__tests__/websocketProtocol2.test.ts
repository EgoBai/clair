/**
 * WebSocket协议与消息处理测试
 */
import { describe, it, expect } from 'vitest';

interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'quote' | 'heartbeat' | 'error' | 'snapshot';
  payload: any;
  timestamp: number;
  seq?: number;
}

function validateMessage(msg: any): msg is WSMessage {
  if (!msg || typeof msg !== 'object') return false;
  if (typeof msg.type !== 'string') return false;
  const validTypes = ['subscribe', 'unsubscribe', 'quote', 'heartbeat', 'error', 'snapshot'];
  if (!validTypes.includes(msg.type)) return false;
  if (typeof msg.timestamp !== 'number') return false;
  return true;
}

function parseMessage(raw: string): WSMessage | null {
  try {
    const parsed = JSON.parse(raw);
    return validateMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildSubscribeMessage(symbols: string[]): WSMessage {
  return { type: 'subscribe', payload: { symbols }, timestamp: Date.now() };
}

function buildHeartbeat(): WSMessage {
  return { type: 'heartbeat', payload: {}, timestamp: Date.now() };
}

class MessageBuffer {
  private buffer: WSMessage[] = [];
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  add(msg: WSMessage): void {
    this.buffer.push(msg);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  getBySeq(seq: number): WSMessage | undefined {
    return this.buffer.find(m => m.seq === seq);
  }

  getLatest(n: number): WSMessage[] {
    return this.buffer.slice(-n);
  }

  size(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer = [];
  }
}

class SubscriptionManager {
  private subscriptions: Map<string, Set<string>> = new Map();

  subscribe(clientId: string, symbols: string[]): void {
    if (!this.subscriptions.has(clientId)) {
      this.subscriptions.set(clientId, new Set());
    }
    for (const s of symbols) {
      this.subscriptions.get(clientId)!.add(s);
    }
  }

  unsubscribe(clientId: string, symbols: string[]): void {
    const subs = this.subscriptions.get(clientId);
    if (subs) {
      for (const s of symbols) subs.delete(s);
    }
  }

  getSubscribers(symbol: string): string[] {
    const result: string[] = [];
    for (const [clientId, symbols] of this.subscriptions) {
      if (symbols.has(symbol)) result.push(clientId);
    }
    return result;
  }

  getClientSubscriptions(clientId: string): string[] {
    return [...(this.subscriptions.get(clientId) || [])];
  }

  removeClient(clientId: string): void {
    this.subscriptions.delete(clientId);
  }
}

describe('WebSocket协议', () => {
  describe('消息验证', () => {
    it('有效消息通过验证', () => {
      expect(validateMessage({ type: 'quote', payload: {}, timestamp: Date.now() })).toBe(true);
    });

    it('无效类型拒绝', () => {
      expect(validateMessage({ type: 'invalid', payload: {}, timestamp: 0 })).toBe(false);
    });

    it('缺少timestamp拒绝', () => {
      expect(validateMessage({ type: 'quote', payload: {} })).toBe(false);
    });

    it('非对象拒绝', () => {
      expect(validateMessage('string')).toBe(false);
      expect(validateMessage(null)).toBe(false);
      expect(validateMessage(123)).toBe(false);
    });
  });

  describe('消息解析', () => {
    it('解析有效JSON', () => {
      const raw = JSON.stringify({ type: 'quote', payload: { price: 100 }, timestamp: 0 });
      const msg = parseMessage(raw);
      expect(msg).not.toBeNull();
      expect(msg!.type).toBe('quote');
    });

    it('无效JSON返回null', () => {
      expect(parseMessage('not json')).toBeNull();
    });

    it('格式错误返回null', () => {
      expect(parseMessage('{"foo":"bar"}')).toBeNull();
    });
  });

  describe('消息构建', () => {
    it('订阅消息包含symbols', () => {
      const msg = buildSubscribeMessage(['600519', '000858']);
      expect(msg.type).toBe('subscribe');
      expect(msg.payload.symbols).toHaveLength(2);
    });

    it('心跳消息格式正确', () => {
      const msg = buildHeartbeat();
      expect(msg.type).toBe('heartbeat');
      expect(msg.timestamp).toBeGreaterThan(0);
    });
  });

  describe('消息缓冲', () => {
    it('添加消息', () => {
      const buf = new MessageBuffer(10);
      buf.add({ type: 'quote', payload: {}, timestamp: 0, seq: 1 });
      expect(buf.size()).toBe(1);
    });

    it('超过最大容量淘汰旧消息', () => {
      const buf = new MessageBuffer(2);
      buf.add({ type: 'quote', payload: {}, timestamp: 0, seq: 1 });
      buf.add({ type: 'quote', payload: {}, timestamp: 1, seq: 2 });
      buf.add({ type: 'quote', payload: {}, timestamp: 2, seq: 3 });
      expect(buf.size()).toBe(2);
      expect(buf.getBySeq(1)).toBeUndefined();
      expect(buf.getBySeq(3)).toBeDefined();
    });

    it('按序号查找', () => {
      const buf = new MessageBuffer(10);
      buf.add({ type: 'quote', payload: { price: 100 }, timestamp: 0, seq: 5 });
      expect(buf.getBySeq(5)?.payload.price).toBe(100);
    });

    it('获取最新N条', () => {
      const buf = new MessageBuffer(10);
      for (let i = 0; i < 5; i++) buf.add({ type: 'quote', payload: {}, timestamp: i, seq: i });
      expect(buf.getLatest(3)).toHaveLength(3);
    });

    it('清空缓冲', () => {
      const buf = new MessageBuffer(10);
      buf.add({ type: 'quote', payload: {}, timestamp: 0 });
      buf.clear();
      expect(buf.size()).toBe(0);
    });
  });

  describe('订阅管理', () => {
    it('订阅股票', () => {
      const mgr = new SubscriptionManager();
      mgr.subscribe('client1', ['600519', '000858']);
      expect(mgr.getClientSubscriptions('client1')).toHaveLength(2);
    });

    it('获取订阅者', () => {
      const mgr = new SubscriptionManager();
      mgr.subscribe('c1', ['600519']);
      mgr.subscribe('c2', ['600519']);
      expect(mgr.getSubscribers('600519')).toHaveLength(2);
    });

    it('取消订阅', () => {
      const mgr = new SubscriptionManager();
      mgr.subscribe('c1', ['600519', '000858']);
      mgr.unsubscribe('c1', ['600519']);
      expect(mgr.getClientSubscriptions('c1')).toEqual(['000858']);
    });

    it('移除客户端', () => {
      const mgr = new SubscriptionManager();
      mgr.subscribe('c1', ['600519']);
      mgr.removeClient('c1');
      expect(mgr.getSubscribers('600519')).toHaveLength(0);
    });

    it('重复订阅去重', () => {
      const mgr = new SubscriptionManager();
      mgr.subscribe('c1', ['600519']);
      mgr.subscribe('c1', ['600519']);
      expect(mgr.getClientSubscriptions('c1')).toHaveLength(1);
    });

    it('空订阅列表', () => {
      const mgr = new SubscriptionManager();
      expect(mgr.getClientSubscriptions('unknown')).toEqual([]);
    });
  });
});
