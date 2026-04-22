import { describe, it, expect } from 'vitest';

// WebSocket协议引擎 v3
interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'data' | 'heartbeat' | 'error' | 'snapshot';
  channel?: string;
  payload: any;
  timestamp: number;
  seq?: number;
}

interface Subscription {
  channel: string;
  symbols: string[];
  interval: number;
  callback: (data: any) => void;
}

function encodeMessage(msg: WSMessage): string {
  return JSON.stringify(msg);
}

function decodeMessage(raw: string): WSMessage | null {
  try {
    const msg = JSON.parse(raw);
    if (!msg.type || !msg.timestamp) return null;
    return msg;
  } catch {
    return null;
  }
}

function createSubscribeMessage(channels: string[], symbols: string[]): WSMessage {
  return {
    type: 'subscribe',
    payload: { channels, symbols },
    timestamp: Date.now(),
  };
}

function createHeartbeat(lastSeq: number): WSMessage {
  return {
    type: 'heartbeat',
    payload: { lastSeq },
    timestamp: Date.now(),
    seq: lastSeq,
  };
}

function shouldReconnect(code: number, reason: string): boolean {
  if (code === 1000) return false; // 正常关闭
  if (code === 4001) return false; // 认证失败
  if (code === 4003) return false; // 被禁止
  return true;
}

function calcReconnectDelay(attempt: number, base: number = 1000, max: number = 30000): number {
  const delay = Math.min(base * Math.pow(2, attempt), max);
  return delay + Math.random() * delay * 0.3; // jitter
}

function detectMessageGap(seq: number, lastSeq: number): number {
  return Math.max(0, seq - lastSeq - 1);
}

function batchSubscriptions(subs: Subscription[]): Map<string, string[]> {
  const batches = new Map<string, string[]>();
  subs.forEach(s => {
    const existing = batches.get(s.channel) || [];
    batches.set(s.channel, [...existing, ...s.symbols]);
  });
  return batches;
}

function validateWSMessage(msg: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!msg.type) errors.push('缺少type字段');
  if (msg.timestamp === undefined) errors.push('缺少timestamp字段');
  if (msg.type === 'data' && !msg.channel) errors.push('data类型缺少channel');
  if (msg.type === 'subscribe' && !msg.payload) errors.push('subscribe类型缺少payload');
  return { valid: errors.length === 0, errors };
}

describe('WebSocket协议引擎 v3', () => {
  describe('消息编解码', () => {
    it('应正确编码消息', () => {
      const msg: WSMessage = { type: 'heartbeat', payload: {}, timestamp: 123 };
      const encoded = encodeMessage(msg);
      expect(typeof encoded).toBe('string');
      expect(JSON.parse(encoded).type).toBe('heartbeat');
    });

    it('应正确解码有效消息', () => {
      const raw = JSON.stringify({ type: 'data', payload: { price: 10 }, timestamp: 123 });
      const decoded = decodeMessage(raw);
      expect(decoded?.type).toBe('data');
    });

    it('无效JSON应返回null', () => {
      expect(decodeMessage('not json')).toBeNull();
    });

    it('缺少必需字段应返回null', () => {
      expect(decodeMessage('{"payload":{}}')).toBeNull();
    });
  });

  describe('订阅消息', () => {
    it('应创建正确的订阅消息', () => {
      const msg = createSubscribeMessage(['quote'], ['000001', '000002']);
      expect(msg.type).toBe('subscribe');
      expect(msg.payload.channels).toContain('quote');
    });
  });

  describe('心跳', () => {
    it('应创建带序列号的心跳', () => {
      const hb = createHeartbeat(42);
      expect(hb.type).toBe('heartbeat');
      expect(hb.seq).toBe(42);
    });
  });

  describe('重连决策', () => {
    it('正常关闭不应重连', () => { expect(shouldReconnect(1000, 'normal')).toBe(false); });
    it('认证失败不应重连', () => { expect(shouldReconnect(4001, 'auth fail')).toBe(false); });
    it('网络断开应重连', () => { expect(shouldReconnect(1006, 'abnormal')).toBe(true); });
    it('服务端错误应重连', () => { expect(shouldReconnect(1011, 'server error')).toBe(true); });
  });

  describe('重连延迟', () => {
    it('应随重试次数增加', () => {
      const d1 = calcReconnectDelay(0);
      const d2 = calcReconnectDelay(3);
      expect(d2).toBeGreaterThan(d1 - d1 * 0.3);
    });

    it('不应超过最大值', () => {
      expect(calcReconnectDelay(20, 1000, 30000)).toBeLessThanOrEqual(39000);
    });
  });

  describe('消息间隙检测', () => {
    it('连续序列号应无间隙', () => { expect(detectMessageGap(5, 4)).toBe(0); });
    it('跳过消息应检测到间隙', () => { expect(detectMessageGap(10, 5)).toBe(4); });
    it('乱序应返回0', () => { expect(detectMessageGap(3, 5)).toBe(0); });
  });

  describe('订阅合并', () => {
    it('同频道订阅应合并', () => {
      const subs: Subscription[] = [
        { channel: 'quote', symbols: ['000001'], interval: 1000, callback: () => {  },
        { channel: 'quote', symbols: ['000002'], interval: 1000, callback: () => {  },
        { channel: 'kline', symbols: ['000001'], interval: 5000, callback: () => {  },
      ];
      const batches = batchSubscriptions(subs);
      expect(batches.get('quote')!.length).toBe(2);
      expect(batches.get('kline')!.length).toBe(1);
    });
  });

  describe('消息验证', () => {
    it('完整消息应通过', () => {
      expect(validateWSMessage({ type: 'data', channel: 'quote', payload: {}, timestamp: 1 }).valid).toBe(true);
    });

    it('缺少type应失败', () => {
      expect(validateWSMessage({ payload: {}, timestamp: 1 }).valid).toBe(false);
    });

    it('data类型缺少channel应失败', () => {
      const result = validateWSMessage({ type: 'data', payload: {}, timestamp: 1 });
      expect(result.valid).toBe(false);
    });
  });
});
