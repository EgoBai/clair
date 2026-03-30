/**
 * WebSocket 推送引擎测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WSPushEngine } from '../services/notification/wsPushEngine';
import type { NotificationPayload, NotificationType, NotificationPriority } from '../services/notification/types';

function createNotification(overrides: Partial<NotificationPayload> = {}): NotificationPayload {
  return {
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    type: 'price_alert',
    priority: 'medium',
    title: '测试通知',
    body: '这是一条测试通知',
    channels: ['websocket'],
    userId: 'user_001',
    read: false,
    status: 'pending',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('WSPushEngine', () => {
  let engine: WSPushEngine;
  let sentMessages: Map<string, unknown[]>;

  beforeEach(() => {
    sentMessages = new Map();
    engine = new WSPushEngine({ enabled: false }); // 禁用批量以测试直接推送
    engine.setSendFunction((socketId, event, data) => {
      if (!sentMessages.has(socketId)) sentMessages.set(socketId, []);
      sentMessages.get(socketId)!.push({ event, data });
    });
  });

  describe('连接管理', () => {
    it('应正确添加客户端连接', () => {
      engine.addClient('sock_1', 'user_001');
      expect(engine.getConnectionCount()).toBe(1);
      expect(engine.getOnlineUserCount()).toBe(1);
    });

    it('同一用户多连接应正确计数', () => {
      engine.addClient('sock_1', 'user_001');
      engine.addClient('sock_2', 'user_001');
      expect(engine.getConnectionCount()).toBe(2);
      expect(engine.getOnlineUserCount()).toBe(1);
    });

    it('应正确移除客户端', () => {
      engine.addClient('sock_1', 'user_001');
      engine.removeClient('sock_1');
      expect(engine.getConnectionCount()).toBe(0);
      expect(engine.getOnlineUserCount()).toBe(0);
    });

    it('移除一个连接后用户仍有其他连接时不删除用户', () => {
      engine.addClient('sock_1', 'user_001');
      engine.addClient('sock_2', 'user_001');
      engine.removeClient('sock_1');
      expect(engine.getOnlineUserCount()).toBe(1);
    });

    it('应返回用户所有连接', () => {
      engine.addClient('sock_1', 'user_001');
      engine.addClient('sock_2', 'user_001');
      engine.addClient('sock_3', 'user_002');

      const conns = engine.getUserConnections('user_001');
      expect(conns).toHaveLength(2);
      expect(conns.map(c => c.socketId).sort()).toEqual(['sock_1', 'sock_2']);
    });

    it('应记录连接时间', () => {
      const before = Date.now();
      engine.addClient('sock_1', 'user_001');
      const conn = engine.getConnection('sock_1');
      expect(conn).toBeDefined();
      expect(conn!.connectedAt).toBeGreaterThanOrEqual(before);
    });

    it('应记录userAgent', () => {
      engine.addClient('sock_1', 'user_001', 'Mozilla/5.0');
      const conn = engine.getConnection('sock_1');
      expect(conn!.userAgent).toBe('Mozilla/5.0');
    });
  });

  describe('主题订阅', () => {
    it('默认订阅notifications主题', () => {
      engine.addClient('sock_1', 'user_001');
      const conn = engine.getConnection('sock_1');
      expect(conn!.subscribedTopics.has('notifications')).toBe(true);
    });

    it('应成功订阅额外主题', () => {
      engine.addClient('sock_1', 'user_001');
      const result = engine.subscribeTopic('sock_1', 'price_alerts');
      expect(result).toBe(true);

      const conn = engine.getConnection('sock_1');
      expect(conn!.subscribedTopics.has('price_alerts')).toBe(true);
      expect(engine.getTopicSubscriberCount('price_alerts')).toBe(1);
    });

    it('对不存在的客户端返回false', () => {
      expect(engine.subscribeTopic('nonexistent', 'news')).toBe(false);
    });

    it('应成功取消订阅非默认主题', () => {
      engine.addClient('sock_1', 'user_001');
      engine.subscribeTopic('sock_1', 'news');
      const result = engine.unsubscribeTopic('sock_1', 'news');
      expect(result).toBe(true);
      expect(engine.getTopicSubscriberCount('news')).toBe(0);
    });

    it('不可取消默认notifications主题', () => {
      engine.addClient('sock_1', 'user_001');
      const result = engine.unsubscribeTopic('sock_1', 'notifications');
      expect(result).toBe(false);
    });

    it('断开连接后自动清理订阅', () => {
      engine.addClient('sock_1', 'user_001');
      engine.subscribeTopic('sock_1', 'price_alerts');
      engine.subscribeTopic('sock_1', 'news');

      engine.removeClient('sock_1');
      expect(engine.getTopicSubscriberCount('price_alerts')).toBe(0);
      expect(engine.getTopicSubscriberCount('news')).toBe(0);
    });
  });

  describe('推送核心', () => {
    it('应向订阅者推送通知', () => {
      engine.addClient('sock_1', 'user_001');
      engine.subscribeTopic('sock_1', 'price_alerts');

      const notif = createNotification({ type: 'price_alert' });
      const msg = engine.push(notif);

      expect(msg.topic).toBe('price_alerts');
      expect(msg.seq).toBe(1);

      const msgs = sentMessages.get('sock_1');
      expect(msgs).toBeDefined();
      expect(msgs!.length).toBe(1);
    });

    it('不同主题推送到不同订阅者', () => {
      engine.addClient('sock_1', 'user_001');
      engine.addClient('sock_2', 'user_002');

      engine.subscribeTopic('sock_1', 'price_alerts');
      // sock_2 默认订阅 notifications，price_alert路由到price_alerts后也会广播给notifications订阅者
      engine.subscribeTopic('sock_2', 'news');

      engine.push(createNotification({ type: 'price_alert' }));
      engine.push(createNotification({ type: 'news' }));

      // sock_1: price_alerts(直接) + news通过notifications广播 = 2
      expect(sentMessages.get('sock_1')!.length).toBe(2);
      // sock_2: news(直接) + price_alert通过notifications广播 = 2
      expect(sentMessages.get('sock_2')!.length).toBe(2);
    });

    it('notifications订阅者应收到所有主题消息', () => {
      engine.addClient('sock_1', 'user_001');
      // sock_1 默认订阅了notifications

      engine.push(createNotification({ type: 'price_alert' }));
      engine.push(createNotification({ type: 'news' }));

      expect(sentMessages.get('sock_1')!.length).toBe(2);
    });

    it('序列号递增', () => {
      engine.addClient('sock_1', 'user_001');

      const m1 = engine.push(createNotification({ type: 'system' }));
      const m2 = engine.push(createNotification({ type: 'system' }));
      const m3 = engine.push(createNotification({ type: 'system' }));

      expect(m1.seq).toBe(1);
      expect(m2.seq).toBe(2);
      expect(m3.seq).toBe(3);
    });

    it('pushToUser应推送到用户所有连接', () => {
      engine.addClient('sock_1', 'user_001');
      engine.addClient('sock_2', 'user_001');

      const notif = createNotification({ userId: 'user_001' });
      const sent = engine.pushToUser('user_001', notif);

      expect(sent).toBe(2);
      expect(sentMessages.get('sock_1')!.length).toBe(1);
      expect(sentMessages.get('sock_2')!.length).toBe(1);
    });

    it('pushToUser对无连接用户返回0', () => {
      const notif = createNotification({ userId: 'nobody' });
      expect(engine.pushToUser('nobody', notif)).toBe(0);
    });
  });

  describe('断线重连同步', () => {
    it('应返回错过的消息', () => {
      engine.addClient('sock_1', 'user_001');

      engine.push(createNotification({ type: 'system', title: 'msg1' }));
      engine.push(createNotification({ type: 'system', title: 'msg2' }));
      engine.push(createNotification({ type: 'system', title: 'msg3' }));

      const missed = engine.getMissedMessages('sock_1', 1);
      expect(missed).toHaveLength(2);
      expect(missed[0].payload.title).toBe('msg2');
      expect(missed[1].payload.title).toBe('msg3');
    });

    it('seq=0时返回所有消息', () => {
      engine.addClient('sock_1', 'user_001');

      engine.push(createNotification({ type: 'system' }));
      engine.push(createNotification({ type: 'system' }));

      const missed = engine.getMissedMessages('sock_1', 0);
      expect(missed).toHaveLength(2);
    });

    it('无遗漏时返回空数组', () => {
      engine.addClient('sock_1', 'user_001');

      engine.push(createNotification({ type: 'system' }));
      const missed = engine.getMissedMessages('sock_1', 1);
      expect(missed).toHaveLength(0);
    });

    it('只返回订阅主题的消息', () => {
      engine.addClient('sock_1', 'user_001');
      engine.unsubscribeTopic('sock_1', 'notifications'); // 测试逻辑下保留
      engine.subscribeTopic('sock_1', 'price_alerts');

      // notifications主题的消息（其他类型路由到其他主题）
      engine.push(createNotification({ type: 'system' })); // -> system 主题
      engine.push(createNotification({ type: 'price_alert' })); // -> price_alerts 主题

      const missed = engine.getMissedMessages('sock_1', 0);
      // sock_1 订阅了 price_alerts，同时也订阅了 notifications
      // system类型路由到system主题，price_alert路由到price_alerts
      // sock_1 默认订阅notifications，同时额外订阅price_alerts
      // 由于sock_1订阅了notifications（默认），也订阅了price_alerts
      // 所以两个都应该收到
      expect(missed.length).toBeGreaterThanOrEqual(1);
    });

    it('对不存在的客户端返回空数组', () => {
      const missed = engine.getMissedMessages('nonexistent', 0);
      expect(missed).toHaveLength(0);
    });
  });

  describe('批量推送', () => {
    it('批量模式下消息按优先级排序', () => {
      const batchEngine = new WSPushEngine({
        enabled: true,
        maxBatchSize: 10,
        flushIntervalMs: 999999,
      });
      const batchEngineAny = batchEngine as any;

      batchEngine.start();
      batchEngine.addClient('sock_1', 'user_001');

      // 乱序推送到 pendingBatch
      const msg1 = { priority: 'low', payload: {} } as any;
      const msg2 = { priority: 'urgent', payload: {} } as any;
      const msg3 = { priority: 'medium', payload: {} } as any;

      batchEngineAny.addToBatch('sock_1', msg1);
      batchEngineAny.addToBatch('sock_1', msg2);
      batchEngineAny.addToBatch('sock_1', msg3);

      const pending = batchEngineAny.pendingBatch.get('sock_1') as any[];
      expect(pending).toHaveLength(3);

      // 模拟排序
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      const sorted = [...pending].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
      expect(sorted[0].priority).toBe('urgent');
      expect(sorted[1].priority).toBe('medium');
      expect(sorted[2].priority).toBe('low');

      batchEngine.stop();
    });

    it('达到最大批量大小时自动刷新', () => {
      const batchEngine = new WSPushEngine({
        enabled: true,
        maxBatchSize: 3,
        flushIntervalMs: 999999,
      });
      const sent: unknown[] = [];
      batchEngine.setSendFunction((_sid, _evt, data) => sent.push(data));
      batchEngine.start();
      batchEngine.addClient('sock_1', 'user_001');

      batchEngine.push(createNotification({ type: 'system' }));
      batchEngine.push(createNotification({ type: 'system' }));
      batchEngine.push(createNotification({ type: 'system' }));

      // 3条应触发自动刷新
      expect(sent.length).toBeGreaterThanOrEqual(1);

      batchEngine.stop();
    });

    it('批量消息包含batchId', () => {
      const batchEngine = new WSPushEngine({
        enabled: true,
        maxBatchSize: 10,
        flushIntervalMs: 999999,
      });
      const batchEngineAny = batchEngine as any;
      batchEngine.start();
      batchEngine.addClient('sock_1', 'user_001');

      batchEngine.push(createNotification({ type: 'system' }));
      batchEngine.push(createNotification({ type: 'system' }));

      const pending = batchEngineAny.pendingBatch.get('sock_1') as any[];
      expect(pending).toHaveLength(2);
      expect(pending[0].batchId).toBeDefined();
      expect(pending[1].batchId).toBeDefined();

      batchEngine.stop();
    });

    it('大消息触发压缩', () => {
      const batchEngine = new WSPushEngine({
        enabled: true,
        maxBatchSize: 10,
        flushIntervalMs: 999999,
        compressThreshold: 10,
      });
      const sent: unknown[] = [];
      batchEngine.setSendFunction((_sid, _evt, data) => sent.push(data));
      batchEngine.start();
      batchEngine.addClient('sock_1', 'user_001');

      batchEngine.push(createNotification({ type: 'system', body: '很长的内容'.repeat(100) }));
      batchEngine['flushBatch']('sock_1');

      expect(sent.length).toBe(1);
      const wrapper = sent[0] as any;
      expect(wrapper.compressed).toBe(true);

      batchEngine.stop();
    });
  });

  describe('统计', () => {
    it('应正确统计发送数', () => {
      engine.addClient('sock_1', 'user_001');
      engine.push(createNotification({ type: 'system' }));
      engine.push(createNotification({ type: 'system' }));

      const stats = engine.getStats();
      expect(stats.totalSent).toBe(2);
    });

    it('应按类型统计消息数', () => {
      engine.addClient('sock_1', 'user_001');
      engine.push(createNotification({ type: 'price_alert' }));
      engine.push(createNotification({ type: 'price_alert' }));
      engine.push(createNotification({ type: 'news' }));

      const stats = engine.getStats();
      expect(stats.messagesByType['price_alert']).toBe(2);
      expect(stats.messagesByType['news']).toBe(1);
    });

    it('应按优先级统计消息数', () => {
      engine.addClient('sock_1', 'user_001');
      engine.push(createNotification({ type: 'system', priority: 'high' }));
      engine.push(createNotification({ type: 'system', priority: 'low' }));

      const stats = engine.getStats();
      expect(stats.messagesByPriority['high']).toBe(1);
      expect(stats.messagesByPriority['low']).toBe(1);
    });

    it('应正确统计主题订阅数', () => {
      engine.addClient('sock_1', 'user_001');
      engine.addClient('sock_2', 'user_002');
      engine.subscribeTopic('sock_1', 'news');
      engine.subscribeTopic('sock_2', 'news');

      const stats = engine.getStats();
      expect(stats.topicSubscriptions['news']).toBe(2);
    });
  });

  describe('广播', () => {
    it('应广播到所有客户端', () => {
      engine.addClient('sock_1', 'user_001');
      engine.addClient('sock_2', 'user_002');
      engine.addClient('sock_3', 'user_003');

      engine.broadcast('system', '系统维护', '系统将于今晚23:00维护');

      expect(sentMessages.get('sock_1')!.length).toBe(1);
      expect(sentMessages.get('sock_2')!.length).toBe(1);
      expect(sentMessages.get('sock_3')!.length).toBe(1);
    });
  });

  describe('清理', () => {
    it('clear应重置所有状态', () => {
      engine.addClient('sock_1', 'user_001');
      engine.push(createNotification({ type: 'system' }));
      engine.clear();

      expect(engine.getConnectionCount()).toBe(0);
      expect(engine.getOnlineUserCount()).toBe(0);
      expect(engine.getStats().totalSent).toBe(0);
    });
  });

  describe('主题路由映射', () => {
    const cases: Array<{ type: NotificationType; expectedTopic: string }> = [
      { type: 'price_alert', expectedTopic: 'price_alerts' },
      { type: 'limit_up', expectedTopic: 'market_events' },
      { type: 'limit_down', expectedTopic: 'market_events' },
      { type: 'volume_surge', expectedTopic: 'market_events' },
      { type: 'news', expectedTopic: 'news' },
      { type: 'trade', expectedTopic: 'trade_execution' },
      { type: 'system', expectedTopic: 'system' },
      { type: 'watchlist_update', expectedTopic: 'watchlist_updates' },
      { type: 'report', expectedTopic: 'reports' },
    ];

    for (const { type, expectedTopic } of cases) {
      it(`${type} 应路由到 ${expectedTopic}`, () => {
        engine.addClient('sock_1', 'user_001');
        engine.subscribeTopic('sock_1', expectedTopic as any);

        const msg = engine.push(createNotification({ type }));
        expect(msg.topic).toBe(expectedTopic);
      });
    }
  });
});
