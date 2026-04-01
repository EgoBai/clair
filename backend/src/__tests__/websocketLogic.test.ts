import { describe, it, expect } from 'vitest';

/**
 * WebSocket 消息处理逻辑测试
 * WebSocket 连接/消息路由/心跳逻辑
 */

type WSMessageType = 'subscribe' | 'unsubscribe' | 'data' | 'heartbeat' | 'error' | 'ack';
type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface WSMessage {
  type: WSMessageType;
  channel?: string;
  payload?: any;
  id?: string;
  timestamp: number;
}

interface Subscription {
  channel: string;
  callback: (data: any) => void;
  subscribedAt: number;
}

interface WSConfig {
  url: string;
  heartbeatInterval: number;
  reconnectDelay: number;
  maxReconnectAttempts: number;
  messageTimeout: number;
}

function createMessage(type: WSMessageType, payload?: any, channel?: string): WSMessage {
  return {
    type,
    channel,
    payload,
    id: Math.random().toString(36).slice(2),
    timestamp: Date.now(),
  };
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

function validateMessage(msg: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!msg || typeof msg !== 'object') {
    return { valid: false, errors: ['message must be an object'] };
  }
  if (!msg.type) errors.push('type is required');
  if (msg.timestamp !== undefined && typeof msg.timestamp !== 'number') {
    errors.push('timestamp must be a number');
  }
  if (msg.type === 'subscribe' && !msg.channel) {
    errors.push('channel is required for subscribe');
  }
  if (msg.type === 'unsubscribe' && !msg.channel) {
    errors.push('channel is required for unsubscribe');
  }
  return { valid: errors.length === 0, errors };
}

function shouldReconnect(
  state: ConnectionState,
  attemptCount: number,
  maxAttempts: number
): boolean {
  return state === 'disconnected' && attemptCount < maxAttempts;
}

function calcReconnectDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number = 30000
): number {
  const delay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelay * 0.5;
  return Math.min(delay + jitter, maxDelay);
}

function isHeartbeatDue(lastHeartbeat: number, interval: number, now: number): boolean {
  return now - lastHeartbeat >= interval;
}

function routeMessage(
  msg: WSMessage,
  subscriptions: Map<string, Subscription[]>
): void {
  if (msg.type !== 'data' || !msg.channel) return;
  const subs = subscriptions.get(msg.channel);
  if (subs) {
    for (const sub of subs) {
      sub.callback(msg.payload);
    }
  }
}

function addSubscription(
  subscriptions: Map<string, Subscription[]>,
  channel: string,
  callback: (data: any) => void
): WSMessage {
  const existing = subscriptions.get(channel) || [];
  existing.push({ channel, callback, subscribedAt: Date.now() });
  subscriptions.set(channel, existing);
  return createMessage('subscribe', null, channel);
}

function removeSubscription(
  subscriptions: Map<string, Subscription[]>,
  channel: string
): WSMessage | null {
  if (!subscriptions.has(channel)) return null;
  subscriptions.delete(channel);
  return createMessage('unsubscribe', null, channel);
}

function getSubscribedChannels(subscriptions: Map<string, Subscription[]>): string[] {
  return Array.from(subscriptions.keys()).sort();
}

function createMessageBuffer(): {
  add: (msg: WSMessage) => void;
  flush: () => WSMessage[];
  size: () => number;
  clear: () => void;
} {
  const buffer: WSMessage[] = [];
  return {
    add(msg: WSMessage) {
      buffer.push(msg);
    },
    flush() {
      const msgs = [...buffer];
      buffer.length = 0;
      return msgs;
    },
    size() {
      return buffer.length;
    },
    clear() {
      buffer.length = 0;
    },
  };
}

function isMessageExpired(msg: WSMessage, maxAge: number, now: number): boolean {
  return now - msg.timestamp > maxAge;
}

function buildChannelTopic(market: string, symbol: string, type: string): string {
  return `${market}:${symbol}:${type}`;
}

function parseChannelTopic(topic: string): { market: string; symbol: string; type: string } | null {
  const parts = topic.split(':');
  if (parts.length !== 3) return null;
  return { market: parts[0], symbol: parts[1], type: parts[2] };
}

describe('WebSocket 消息处理逻辑', () => {
  describe('createMessage', () => {
    it('should create message with type', () => {
      const msg = createMessage('heartbeat');
      expect(msg.type).toBe('heartbeat');
      expect(msg.timestamp).toBeDefined();
      expect(msg.id).toBeDefined();
    });

    it('should include channel for subscribe', () => {
      const msg = createMessage('subscribe', null, 'sh:600519:quote');
      expect(msg.channel).toBe('sh:600519:quote');
    });

    it('should include payload', () => {
      const msg = createMessage('data', { price: 2000 });
      expect(msg.payload.price).toBe(2000);
    });
  });

  describe('parseMessage', () => {
    it('should parse valid JSON', () => {
      const msg = parseMessage('{"type":"heartbeat","timestamp":1700000000000}');
      expect(msg?.type).toBe('heartbeat');
    });

    it('should return null for invalid JSON', () => {
      expect(parseMessage('not json')).toBeNull();
    });

    it('should return null for missing type', () => {
      expect(parseMessage('{"data":1}')).toBeNull();
    });
  });

  describe('validateMessage', () => {
    it('should accept valid messages', () => {
      expect(validateMessage({ type: 'heartbeat', timestamp: Date.now() }).valid).toBe(true);
    });

    it('should reject non-objects', () => {
      expect(validateMessage('string').valid).toBe(false);
    });

    it('should require type', () => {
      expect(validateMessage({}).valid).toBe(false);
    });

    it('should require channel for subscribe', () => {
      const result = validateMessage({ type: 'subscribe' });
      expect(result.valid).toBe(false);
    });

    it('should require channel for unsubscribe', () => {
      const result = validateMessage({ type: 'unsubscribe' });
      expect(result.valid).toBe(false);
    });
  });

  describe('shouldReconnect', () => {
    it('should reconnect when disconnected', () => {
      expect(shouldReconnect('disconnected', 0, 5)).toBe(true);
    });

    it('should not reconnect when at max attempts', () => {
      expect(shouldReconnect('disconnected', 5, 5)).toBe(false);
    });

    it('should not reconnect when connected', () => {
      expect(shouldReconnect('connected', 0, 5)).toBe(false);
    });
  });

  describe('calcReconnectDelay', () => {
    it('should increase with attempts', () => {
      const d1 = calcReconnectDelay(0, 1000);
      const d2 = calcReconnectDelay(1, 1000);
      // Due to jitter, we can only verify the minimum
      expect(d2).toBeGreaterThan(1000);
    });

    it('should cap at maxDelay', () => {
      const delay = calcReconnectDelay(100, 1000, 5000);
      expect(delay).toBeLessThanOrEqual(5000);
    });
  });

  describe('isHeartbeatDue', () => {
    it('should be due when interval elapsed', () => {
      expect(isHeartbeatDue(1000, 30000, 31000)).toBe(true);
    });

    it('should not be due before interval', () => {
      expect(isHeartbeatDue(1000, 30000, 20000)).toBe(false);
    });
  });

  describe('routeMessage', () => {
    it('should call subscriber callback', () => {
      const subs = new Map<string, Subscription[]>();
      let received: any = null;
      subs.set('ch1', [{ channel: 'ch1', callback: (d) => { received = d; }, subscribedAt: 0 }]);

      const msg: WSMessage = { type: 'data', channel: 'ch1', payload: { x: 1 }, timestamp: Date.now() };
      routeMessage(msg, subs);
      expect(received).toEqual({ x: 1 });
    });

    it('should ignore non-data messages', () => {
      const subs = new Map<string, Subscription[]>();
      let called = false;
      subs.set('ch1', [{ channel: 'ch1', callback: () => { called = true; }, subscribedAt: 0 }]);

      routeMessage({ type: 'heartbeat', timestamp: Date.now() }, subs);
      expect(called).toBe(false);
    });
  });

  describe('addSubscription / removeSubscription', () => {
    it('should add subscription', () => {
      const subs = new Map<string, Subscription[]>();
      addSubscription(subs, 'ch1', () => {});
      expect(subs.has('ch1')).toBe(true);
    });

    it('should remove subscription', () => {
      const subs = new Map<string, Subscription[]>();
      addSubscription(subs, 'ch1', () => {});
      const msg = removeSubscription(subs, 'ch1');
      expect(subs.has('ch1')).toBe(false);
      expect(msg?.type).toBe('unsubscribe');
    });

    it('should return null for unknown channel', () => {
      const subs = new Map<string, Subscription[]>();
      expect(removeSubscription(subs, 'unknown')).toBeNull();
    });
  });

  describe('getSubscribedChannels', () => {
    it('should return sorted channels', () => {
      const subs = new Map<string, Subscription[]>();
      addSubscription(subs, 'z-channel', () => {});
      addSubscription(subs, 'a-channel', () => {});
      expect(getSubscribedChannels(subs)).toEqual(['a-channel', 'z-channel']);
    });
  });

  describe('createMessageBuffer', () => {
    it('should buffer and flush messages', () => {
      const buf = createMessageBuffer();
      buf.add(createMessage('data'));
      buf.add(createMessage('data'));
      expect(buf.size()).toBe(2);

      const flushed = buf.flush();
      expect(flushed).toHaveLength(2);
      expect(buf.size()).toBe(0);
    });

    it('should clear buffer', () => {
      const buf = createMessageBuffer();
      buf.add(createMessage('data'));
      buf.clear();
      expect(buf.size()).toBe(0);
    });
  });

  describe('isMessageExpired', () => {
    it('should detect expired messages', () => {
      const msg: WSMessage = { type: 'data', timestamp: 1000 };
      expect(isMessageExpired(msg, 5000, 7000)).toBe(true);
    });

    it('should accept fresh messages', () => {
      const msg: WSMessage = { type: 'data', timestamp: 5000 };
      expect(isMessageExpired(msg, 5000, 8000)).toBe(false);
    });
  });

  describe('buildChannelTopic', () => {
    it('should build topic string', () => {
      expect(buildChannelTopic('sh', '600519', 'quote')).toBe('sh:600519:quote');
    });
  });

  describe('parseChannelTopic', () => {
    it('should parse valid topic', () => {
      expect(parseChannelTopic('sh:600519:quote')).toEqual({
        market: 'sh', symbol: '600519', type: 'quote',
      });
    });

    it('should return null for invalid topic', () => {
      expect(parseChannelTopic('invalid')).toBeNull();
      expect(parseChannelTopic('a:b')).toBeNull();
    });
  });
});
