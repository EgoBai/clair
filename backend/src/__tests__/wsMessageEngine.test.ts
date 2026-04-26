import { describe, it, expect, beforeEach } from 'vitest';

// WebSocket消息处理引擎
interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'heartbeat' | 'data' | 'error' | 'snapshot';
  channel?: string;
  payload?: any;
  timestamp?: number;
  seq?: number;
}

interface Subscription {
  channel: string;
  params: Record<string, any>;
  callback: (data: any) => void;
}

class WSMessageHandler {
  private subscriptions: Map<string, Subscription> = new Map();
  private messageQueue: WSMessage[] = [];
  private seqCounter = 0;
  private heartbeatInterval: number | null = null;
  private lastHeartbeat = 0;
  private missedHeartbeats = 0;
  private maxMissedHeartbeats = 3;

  subscribe(channel: string, params: Record<string, any>, callback: (data: any) => void): WSMessage {
    const sub: Subscription = { channel, params, callback };
    this.subscriptions.set(channel, sub);
    return {
      type: 'subscribe',
      channel,
      payload: params,
      timestamp: Date.now(),
      seq: ++this.seqCounter,
    };
  }

  unsubscribe(channel: string): WSMessage | null {
    if (!this.subscriptions.has(channel)) return null;
    this.subscriptions.delete(channel);
    return {
      type: 'unsubscribe',
      channel,
      timestamp: Date.now(),
      seq: ++this.seqCounter,
    };
  }

  handleMessage(msg: WSMessage): { handled: boolean; error?: string } {
    if (!msg.type) return { handled: false, error: 'Missing message type' };

    switch (msg.type) {
      case 'heartbeat':
        this.lastHeartbeat = Date.now();
        this.missedHeartbeats = 0;
        return { handled: true };

      case 'data':
        if (!msg.channel) return { handled: false, error: 'Missing channel' };
        const sub = this.subscriptions.get(msg.channel);
        if (sub) {
          sub.callback(msg.payload);
          return { handled: true };
        }
        return { handled: false, error: `No subscription for channel: ${msg.channel}` };

      case 'error':
        return { handled: true, error: msg.payload?.message || 'Unknown error' };

      case 'snapshot':
        if (!msg.channel) return { handled: false, error: 'Missing channel' };
        const snapSub = this.subscriptions.get(msg.channel);
        if (snapSub) {
          snapSub.callback({ type: 'snapshot', data: msg.payload });
          return { handled: true };
        }
        return { handled: false };

      default:
        return { handled: false, error: `Unknown message type: ${msg.type}` };
    }
  }

  queueMessage(msg: WSMessage): void {
    this.messageQueue.push(msg);
  }

  flushQueue(): WSMessage[] {
    const msgs = [...this.messageQueue];
    this.messageQueue = [];
    return msgs;
  }

  getQueueSize(): number {
    return this.messageQueue.length;
  }

  getSubscriptions(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  isHealthy(): boolean {
    return this.missedHeartbeats < this.maxMissedHeartbeats;
  }

  recordMissedHeartbeat(): void {
    this.missedHeartbeats++;
  }

  getMissedHeartbeats(): number {
    return this.missedHeartbeats;
  }

  reset(): void {
    this.subscriptions.clear();
    this.messageQueue = [];
    this.seqCounter = 0;
    this.missedHeartbeats = 0;
  }
}

function validateWSMessage(msg: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!msg || typeof msg !== 'object') {
    return { valid: false, errors: ['Message must be an object'] };
  }

  if (!msg.type || typeof msg.type !== 'string') {
    errors.push('Missing or invalid type field');
  }

  const validTypes = ['subscribe', 'unsubscribe', 'heartbeat', 'data', 'error', 'snapshot'];
  if (msg.type && !validTypes.includes(msg.type)) {
    errors.push(`Invalid type: ${msg.type}`);
  }

  if (msg.type === 'subscribe' && !msg.channel) {
    errors.push('Subscribe message must have channel');
  }

  if (msg.type === 'data' && !msg.channel) {
    errors.push('Data message must have channel');
  }

  if (msg.type === 'data' && msg.payload === undefined) {
    errors.push('Data message must have payload');
  }

  if (msg.timestamp !== undefined && typeof msg.timestamp !== 'number') {
    errors.push('Timestamp must be a number');
  }

  return { valid: errors.length === 0, errors };
}

function buildHeartbeatMessage(): WSMessage {
  return {
    type: 'heartbeat',
    timestamp: Date.now(),
  };
}

function parseWSMessage(raw: string): { message: WSMessage | null; error?: string } {
  try {
    const parsed = JSON.parse(raw);
    const validation = validateWSMessage(parsed);
    if (!validation.valid) {
      return { message: null, error: validation.errors.join('; ') };
    }
    return { message: parsed as WSMessage };
  } catch (e) {
    return { message: null, error: 'Invalid JSON' };
  }
}

describe('WebSocket消息处理引擎', () => {
  describe('WSMessageHandler', () => {
    let handler: WSMessageHandler;

    beforeEach(() => {
      handler = new WSMessageHandler();
    });

    describe('订阅管理', () => {
      it('应该成功订阅频道', () => {
        const msg = handler.subscribe('stock:600000', { interval: '1m' }, () => {});
        expect(msg.type).toBe('subscribe');
        expect(msg.channel).toBe('stock:600000');
        expect(msg.seq).toBe(1);
      });

      it('应该成功取消订阅', () => {
        handler.subscribe('stock:600000', {}, () => {});
        const msg = handler.unsubscribe('stock:600000');
        expect(msg).not.toBeNull();
        expect(msg!.type).toBe('unsubscribe');
      });

      it('取消不存在的订阅应该返回null', () => {
        expect(handler.unsubscribe('nonexistent')).toBeNull();
      });

      it('应该列出所有订阅', () => {
        handler.subscribe('a', {}, () => {});
        handler.subscribe('b', {}, () => {});
        expect(handler.getSubscriptions().sort()).toEqual(['a', 'b']);
      });

      it('seq应该递增', () => {
        const m1 = handler.subscribe('a', {}, () => {});
        const m2 = handler.subscribe('b', {}, () => {});
        expect(m2.seq).toBe(m1.seq! + 1);
      });
    });

    describe('消息处理', () => {
      it('应该处理heartbeat消息', () => {
        const result = handler.handleMessage({ type: 'heartbeat', timestamp: Date.now() });
        expect(result.handled).toBe(true);
      });

      it('应该将data消息分发到订阅者', () => {
        let received: any = null;
        handler.subscribe('stock:600000', {}, (data) => { received = data; });
        handler.handleMessage({ type: 'data', channel: 'stock:600000', payload: { price: 10 } });
        expect(received).toEqual({ price: 10 });
      });

      it('未订阅频道的data应该返回错误', () => {
        const result = handler.handleMessage({ type: 'data', channel: 'unknown', payload: {} });
        expect(result.handled).toBe(false);
        expect(result.error).toContain('No subscription');
      });

      it('缺少channel的data应该返回错误', () => {
        const result = handler.handleMessage({ type: 'data', payload: {} });
        expect(result.handled).toBe(false);
      });

      it('应该处理error消息', () => {
        const result = handler.handleMessage({ type: 'error', payload: { message: 'test error' } });
        expect(result.handled).toBe(true);
        expect(result.error).toBe('test error');
      });

      it('snapshot应该分发到订阅者', () => {
        let received: any = null;
        handler.subscribe('depth', {}, (data) => { received = data; });
        handler.handleMessage({ type: 'snapshot', channel: 'depth', payload: { bids: [1, 2] } });
        expect(received.type).toBe('snapshot');
      });

      it('缺少type应该返回错误', () => {
        const result = handler.handleMessage({ payload: {} } as WSMessage);
        expect(result.handled).toBe(false);
        expect(result.error).toContain('Missing message type');
      });

      it('未知type应该返回错误', () => {
        const result = handler.handleMessage({ type: 'unknown' } as unknown as WSMessage);
        expect(result.handled).toBe(false);
        expect(result.error).toContain('Unknown');
      });
    });

    describe('消息队列', () => {
      it('应该正确入队和出队', () => {
        handler.queueMessage({ type: 'data', channel: 'a', payload: 1 });
        handler.queueMessage({ type: 'data', channel: 'b', payload: 2 });
        expect(handler.getQueueSize()).toBe(2);
        const flushed = handler.flushQueue();
        expect(flushed).toHaveLength(2);
        expect(handler.getQueueSize()).toBe(0);
      });

      it('flush应该清空队列', () => {
        handler.queueMessage({ type: 'heartbeat' });
        handler.flushQueue();
        expect(handler.flushQueue()).toEqual([]);
      });
    });

    describe('健康检查', () => {
      it('初始状态应该是健康的', () => {
        expect(handler.isHealthy()).toBe(true);
      });

      it('多次丢失心跳应该变为不健康', () => {
        handler.recordMissedHeartbeat();
        handler.recordMissedHeartbeat();
        handler.recordMissedHeartbeat();
        expect(handler.isHealthy()).toBe(false);
      });

      it('收到心跳应该重置计数', () => {
        handler.recordMissedHeartbeat();
        handler.recordMissedHeartbeat();
        handler.handleMessage({ type: 'heartbeat', timestamp: Date.now() });
        expect(handler.getMissedHeartbeats()).toBe(0);
        expect(handler.isHealthy()).toBe(true);
      });
    });

    describe('reset', () => {
      it('应该清除所有状态', () => {
        handler.subscribe('a', {}, () => {});
        handler.queueMessage({ type: 'heartbeat' });
        handler.recordMissedHeartbeat();
        handler.reset();
        expect(handler.getSubscriptions()).toEqual([]);
        expect(handler.getQueueSize()).toBe(0);
        expect(handler.isHealthy()).toBe(true);
      });
    });
  });

  describe('validateWSMessage', () => {
    it('应该验证有效的subscribe消息', () => {
      const result = validateWSMessage({ type: 'subscribe', channel: 'test' });
      expect(result.valid).toBe(true);
    });

    it('应该验证有效的data消息', () => {
      const result = validateWSMessage({ type: 'data', channel: 'test', payload: {} });
      expect(result.valid).toBe(true);
    });

    it('应该拒绝非对象输入', () => {
      expect(validateWSMessage(null).valid).toBe(false);
      expect(validateWSMessage('string').valid).toBe(false);
      expect(validateWSMessage(42).valid).toBe(false);
    });

    it('应该拒绝缺少type的消息', () => {
      const result = validateWSMessage({});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing or invalid type field');
    });

    it('应该拒绝无效type', () => {
      const result = validateWSMessage({ type: 'invalid' });
      expect(result.valid).toBe(false);
    });

    it('subscribe缺少channel应该报错', () => {
      const result = validateWSMessage({ type: 'subscribe' });
      expect(result.valid).toBe(false);
    });

    it('data缺少channel应该报错', () => {
      const result = validateWSMessage({ type: 'data', payload: {} });
      expect(result.valid).toBe(false);
    });

    it('data缺少payload应该报错', () => {
      const result = validateWSMessage({ type: 'data', channel: 'test' });
      expect(result.valid).toBe(false);
    });
  });

  describe('parseWSMessage', () => {
    it('应该解析有效的JSON', () => {
      const result = parseWSMessage('{"type":"heartbeat","timestamp":123}');
      expect(result.message).not.toBeNull();
      expect(result.message!.type).toBe('heartbeat');
    });

    it('无效JSON应该返回错误', () => {
      const result = parseWSMessage('not json');
      expect(result.message).toBeNull();
      expect(result.error).toBe('Invalid JSON');
    });

    it('有效JSON但无效消息应该返回错误', () => {
      const result = parseWSMessage('{"foo":"bar"}');
      expect(result.message).toBeNull();
    });
  });

  describe('buildHeartbeatMessage', () => {
    it('应该生成heartbeat消息', () => {
      const msg = buildHeartbeatMessage();
      expect(msg.type).toBe('heartbeat');
      expect(msg.timestamp).toBeTypeOf('number');
    });
  });
});
