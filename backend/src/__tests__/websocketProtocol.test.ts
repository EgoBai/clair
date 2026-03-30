import { describe, it, expect, beforeEach } from 'vitest';

// WebSocket协议测试 - 消息格式、订阅管理、心跳、重连

interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'heartbeat' | 'data' | 'error' | 'auth' | 'snapshot';
  payload: any;
  timestamp: number;
  seq?: number;
  id?: string;
}

interface Subscription {
  id: string;
  channel: string;
  symbol?: string;
  createdAt: number;
  active: boolean;
}

interface ConnectionState {
  status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'failed';
  retryCount: number;
  lastHeartbeat: number;
  latency: number;
}

function createMessage(type: WSMessage['type'], payload: any): WSMessage {
  return { type, payload, timestamp: Date.now() };
}

function validateMessage(raw: string): { valid: boolean; message?: WSMessage; error?: string } {
  try {
    const msg = JSON.parse(raw);
    if (!msg.type || !['subscribe', 'unsubscribe', 'heartbeat', 'data', 'error', 'auth', 'snapshot'].includes(msg.type)) {
      return { valid: false, error: 'invalid_type' };
    }
    return { valid: true, message: msg };
  } catch {
    return { valid: false, error: 'parse_error' };
  }
}

class SubscriptionManager {
  private subscriptions = new Map<string, Subscription>();
  private counter = 0;

  subscribe(channel: string, symbol?: string): Subscription {
    const sub: Subscription = {
      id: `sub-${++this.counter}`,
      channel,
      symbol,
      createdAt: Date.now(),
      active: true,
    };
    this.subscriptions.set(sub.id, sub);
    return sub;
  }

  unsubscribe(id: string): boolean {
    const sub = this.subscriptions.get(id);
    if (sub) {
      sub.active = false;
      this.subscriptions.delete(id);
      return true;
    }
    return false;
  }

  getActive(): Subscription[] {
    return Array.from(this.subscriptions.values()).filter(s => s.active);
  }

  getByChannel(channel: string): Subscription[] {
    return this.getActive().filter(s => s.channel === channel);
  }

  unsubscribeAll(): number {
    const count = this.subscriptions.size;
    this.subscriptions.clear();
    return count;
  }

  hasActiveForSymbol(symbol: string): boolean {
    return this.getActive().some(s => s.symbol === symbol);
  }
}

function calculateReconnectDelay(retry: number, initial: number, multiplier: number, max: number): number {
  return Math.min(initial * Math.pow(multiplier, retry), max);
}

function isStale(lastHeartbeat: number, timeout: number): boolean {
  return Date.now() - lastHeartbeat > timeout;
}

function createSnapshotMessage(data: any, seq: number): WSMessage {
  return { type: 'snapshot', payload: data, timestamp: Date.now(), seq };
}

describe('WebSocket协议测试', () => {
  describe('消息构造', () => {
    it('创建订阅消息', () => {
      const msg = createMessage('subscribe', { channel: 'quotes', symbol: '600519' });
      expect(msg.type).toBe('subscribe');
      expect(msg.payload.symbol).toBe('600519');
      expect(msg.timestamp).toBeGreaterThan(0);
    });

    it('创建心跳消息', () => {
      const msg = createMessage('heartbeat', { ping: true });
      expect(msg.type).toBe('heartbeat');
      expect(msg.payload.ping).toBe(true);
    });

    it('创建数据消息', () => {
      const msg = createMessage('data', { symbol: '600519', price: 1900, change: 2.5 });
      expect(msg.type).toBe('data');
      expect(msg.payload.price).toBe(1900);
    });

    it('创建错误消息', () => {
      const msg = createMessage('error', { code: 4001, message: 'auth failed' });
      expect(msg.type).toBe('error');
      expect(msg.payload.code).toBe(4001);
    });
  });

  describe('消息验证', () => {
    it('有效消息', () => {
      const result = validateMessage('{"type":"subscribe","payload":{}}');
      expect(result.valid).toBe(true);
      expect(result.message?.type).toBe('subscribe');
    });

    it('无效JSON', () => {
      const result = validateMessage('not json');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('parse_error');
    });

    it('无效类型', () => {
      const result = validateMessage('{"type":"unknown"}');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_type');
    });

    it('缺少type字段', () => {
      const result = validateMessage('{"payload":{}}');
      expect(result.valid).toBe(false);
    });

    it('空对象', () => {
      const result = validateMessage('{}');
      expect(result.valid).toBe(false);
    });
  });

  describe('订阅管理', () => {
    let manager: SubscriptionManager;

    beforeEach(() => {
      manager = new SubscriptionManager();
    });

    it('创建订阅', () => {
      const sub = manager.subscribe('quotes', '600519');
      expect(sub.id).toBeDefined();
      expect(sub.channel).toBe('quotes');
      expect(sub.symbol).toBe('600519');
      expect(sub.active).toBe(true);
    });

    it('获取活跃订阅', () => {
      manager.subscribe('quotes', '600519');
      manager.subscribe('trades', '000858');
      expect(manager.getActive()).toHaveLength(2);
    });

    it('取消订阅', () => {
      const sub = manager.subscribe('quotes', '600519');
      expect(manager.unsubscribe(sub.id)).toBe(true);
      expect(manager.getActive()).toHaveLength(0);
    });

    it('取消不存在的订阅', () => {
      expect(manager.unsubscribe('nonexistent')).toBe(false);
    });

    it('按频道过滤', () => {
      manager.subscribe('quotes', '600519');
      manager.subscribe('trades', '000858');
      manager.subscribe('quotes', '300750');
      expect(manager.getByChannel('quotes')).toHaveLength(2);
      expect(manager.getByChannel('trades')).toHaveLength(1);
    });

    it('按股票检查', () => {
      manager.subscribe('quotes', '600519');
      expect(manager.hasActiveForSymbol('600519')).toBe(true);
      expect(manager.hasActiveForSymbol('000858')).toBe(false);
    });

    it('取消所有订阅', () => {
      manager.subscribe('quotes', '600519');
      manager.subscribe('trades', '000858');
      const count = manager.unsubscribeAll();
      expect(count).toBe(2);
      expect(manager.getActive()).toHaveLength(0);
    });

    it('ID唯一性', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(manager.subscribe('test').id);
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('重连策略', () => {
    it('指数退避', () => {
      const delays = [0, 1, 2, 3, 4].map(r =>
        calculateReconnectDelay(r, 1000, 2, 30000)
      );
      expect(delays[0]).toBe(1000);
      expect(delays[1]).toBe(2000);
      expect(delays[2]).toBe(4000);
      expect(delays[3]).toBe(8000);
      expect(delays[4]).toBe(16000);
    });

    it('最大延迟限制', () => {
      const delay = calculateReconnectDelay(20, 1000, 2, 30000);
      expect(delay).toBe(30000);
    });

    it('首次连接延迟', () => {
      const delay = calculateReconnectDelay(0, 500, 1.5, 30000);
      expect(delay).toBe(500);
    });

    it('延迟单调递增', () => {
      let prev = 0;
      for (let i = 0; i < 10; i++) {
        const delay = calculateReconnectDelay(i, 1000, 2, 60000);
        expect(delay).toBeGreaterThanOrEqual(prev);
        prev = delay;
      }
    });
  });

  describe('心跳检测', () => {
    it('数据新鲜', () => {
      expect(isStale(Date.now(), 10000)).toBe(false);
    });

    it('数据过期', () => {
      expect(isStale(Date.now() - 20000, 10000)).toBe(true);
    });

    it('边界值', () => {
      expect(isStale(Date.now() - 10000, 10000)).toBe(false);
      expect(isStale(Date.now() - 10001, 10000)).toBe(true);
    });
  });

  describe('快照消息', () => {
    it('包含序列号', () => {
      const snap = createSnapshotMessage({ prices: [100, 101, 102] }, 42);
      expect(snap.type).toBe('snapshot');
      expect(snap.seq).toBe(42);
    });

    it('数据完整性', () => {
      const data = { symbol: '600519', price: 1900, volume: 1000000 };
      const snap = createSnapshotMessage(data, 1);
      expect(snap.payload).toEqual(data);
    });

    it('序列号递增', () => {
      let seq = 0;
      const snaps = [];
      for (let i = 0; i < 5; i++) {
        snaps.push(createSnapshotMessage({}, ++seq));
      }
      expect(snaps.map(s => s.seq)).toEqual([1, 2, 3, 4, 5]);
    });
  });
});
