/**
 * 后端 WebSocket 消息处理测试
 * 覆盖消息解析、订阅管理、广播逻辑
 */

import { describe, it, expect, beforeEach } from 'vitest';

describe('WebSocket 消息处理', () => {
  describe('消息格式解析', () => {
    interface WSMessage {
      type: 'subscribe' | 'unsubscribe' | 'data' | 'heartbeat' | 'error';
      channel?: string;
      payload?: unknown;
      timestamp?: number;
    }

    function parseMessage(raw: string): WSMessage | null {
      try {
        const msg = JSON.parse(raw);
        if (!msg.type) return null;
        return msg as WSMessage;
      } catch {
        return null;
      }
    }

    function validateMessage(msg: WSMessage): boolean {
      if (msg.type === 'subscribe' || msg.type === 'unsubscribe') {
        return typeof msg.channel === 'string' && msg.channel.length > 0;
      }
      return true;
    }

    it('应正确解析有效消息', () => {
      const msg = parseMessage('{"type":"subscribe","channel":"quote:600519"}');
      expect(msg).not.toBeNull();
      expect(msg!.type).toBe('subscribe');
      expect(msg!.channel).toBe('quote:600519');
    });

    it('无效JSON应返回null', () => {
      expect(parseMessage('not json')).toBeNull();
    });

    it('缺少type应返回null', () => {
      expect(parseMessage('{"channel":"test"}')).toBeNull();
    });

    it('subscribe应要求channel', () => {
      expect(validateMessage({ type: 'subscribe', channel: '' })).toBe(false);
      expect(validateMessage({ type: 'subscribe', channel: 'quote:600519' })).toBe(true);
    });
  });

  describe('订阅管理', () => {
    class SubscriptionManager {
      private subscriptions = new Map<string, Set<string>>();

      subscribe(clientId: string, channel: string): boolean {
        if (!this.subscriptions.has(channel)) this.subscriptions.set(channel, new Set());
        const clients = this.subscriptions.get(channel)!;
        if (clients.has(clientId)) return false;
        clients.add(clientId);
        return true;
      }

      unsubscribe(clientId: string, channel: string): boolean {
        const clients = this.subscriptions.get(channel);
        if (!clients || !clients.has(clientId)) return false;
        clients.delete(clientId);
        if (clients.size === 0) this.subscriptions.delete(channel);
        return true;
      }

      getSubscribers(channel: string): string[] {
        return Array.from(this.subscriptions.get(channel) || []);
      }

      getClientChannels(clientId: string): string[] {
        const channels: string[] = [];
        for (const [channel, clients] of this.subscriptions) {
          if (clients.has(clientId)) channels.push(channel);
        }
        return channels;
      }

      unsubscribeAll(clientId: string): number {
        let count = 0;
        for (const [, clients] of this.subscriptions) {
          if (clients.delete(clientId)) count++;
        }
        return count;
      }
    }

    let mgr: SubscriptionManager;

    beforeEach(() => { mgr = new SubscriptionManager(); });

    it('应能订阅频道', () => {
      expect(mgr.subscribe('c1', 'quote:600519')).toBe(true);
      expect(mgr.getSubscribers('quote:600519')).toContain('c1');
    });

    it('重复订阅应返回false', () => {
      mgr.subscribe('c1', 'quote:600519');
      expect(mgr.subscribe('c1', 'quote:600519')).toBe(false);
    });

    it('应能取消订阅', () => {
      mgr.subscribe('c1', 'quote:600519');
      expect(mgr.unsubscribe('c1', 'quote:600519')).toBe(true);
      expect(mgr.getSubscribers('quote:600519')).toHaveLength(0);
    });

    it('应能获取客户端所有频道', () => {
      mgr.subscribe('c1', 'quote:600519');
      mgr.subscribe('c1', 'quote:000858');
      expect(mgr.getClientChannels('c1')).toHaveLength(2);
    });

    it('取消全部订阅应返回数量', () => {
      mgr.subscribe('c1', 'ch1');
      mgr.subscribe('c1', 'ch2');
      expect(mgr.unsubscribeAll('c1')).toBe(2);
    });
  });

  describe('消息广播', () => {
    function broadcast(subscribers: string[], message: unknown, sendFn: (clientId: string, msg: unknown) => boolean): { sent: number; failed: number } {
      let sent = 0, failed = 0;
      for (const client of subscribers) {
        if (sendFn(client, message)) sent++;
        else failed++;
      }
      return { sent, failed };
    }

    it('应统计发送成功和失败数', () => {
      const sendFn = (clientId: string) => clientId !== 'offline';
      const result = broadcast(['c1', 'offline', 'c3'], { type: 'data' }, sendFn);
      expect(result.sent).toBe(2);
      expect(result.failed).toBe(1);
    });
  });

  describe('心跳检测', () => {
    function checkHeartbeat(lastSeen: number, now: number, timeoutMs: number = 30000): boolean {
      return now - lastSeen < timeoutMs;
    }

    it('在超时范围内应为活跃', () => {
      expect(checkHeartbeat(1000, 20000)).toBe(true);
    });

    it('超时应标记为不活跃', () => {
      expect(checkHeartbeat(1000, 40000)).toBe(false);
    });
  });
});
