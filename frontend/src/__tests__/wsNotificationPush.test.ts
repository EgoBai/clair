/**
 * WebSocket 通知推送测试
 * 测试 OfflineMessageQueue, MessageDeduplicator 及相关逻辑
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OfflineMessageQueue,
  MessageDeduplicator,
} from '../hooks/useWSNotification';
import type { PushMessage, NotificationType, NotificationPriority, PushTopic } from '../hooks/useWSNotification';

function createPushMessage(overrides: Partial<PushMessage> = {}): PushMessage {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    topic: 'notifications',
    type: 'system',
    priority: 'medium',
    payload: {
      id: `notif_${Date.now()}`,
      type: 'system',
      priority: 'medium',
      title: '测试通知',
      body: '内容',
      channels: ['websocket'],
      userId: 'user_001',
      read: false,
      status: 'sent',
      createdAt: Date.now(),
    },
    timestamp: Date.now(),
    seq: Math.floor(Math.random() * 10000),
    ...overrides,
  };
}

describe('OfflineMessageQueue', () => {
  let queue: OfflineMessageQueue;

  beforeEach(() => {
    queue = new OfflineMessageQueue(10);
  });

  it('应正确入队和出队消息', () => {
    const msg1 = createPushMessage({ id: 'msg1', priority: 'high' });
    const msg2 = createPushMessage({ id: 'msg2', priority: 'low' });

    queue.enqueue(msg1);
    queue.enqueue(msg2);
    expect(queue.size()).toBe(2);

    const result = queue.dequeue();
    expect(result).toHaveLength(2);
    expect(queue.size()).toBe(0);
  });

  it('出队应按优先级排序', () => {
    queue.enqueue(createPushMessage({ id: 'low1', priority: 'low' }));
    queue.enqueue(createPushMessage({ id: 'urgent1', priority: 'urgent' }));
    queue.enqueue(createPushMessage({ id: 'medium1', priority: 'medium' }));
    queue.enqueue(createPushMessage({ id: 'high1', priority: 'high' }));

    const result = queue.dequeue();
    expect(result[0].priority).toBe('urgent');
    expect(result[1].priority).toBe('high');
    expect(result[2].priority).toBe('medium');
    expect(result[3].priority).toBe('low');
  });

  it('超出容量应丢弃低优先级消息', () => {
    const smallQueue = new OfflineMessageQueue(3);

    smallQueue.enqueue(createPushMessage({ id: 'low', priority: 'low' }));
    smallQueue.enqueue(createPushMessage({ id: 'high', priority: 'high' }));
    smallQueue.enqueue(createPushMessage({ id: 'urgent', priority: 'urgent' }));
    smallQueue.enqueue(createPushMessage({ id: 'low2', priority: 'low' })); // 第4条，应该丢弃最旧的low

    const result = smallQueue.dequeue();
    expect(result.length).toBeLessThanOrEqual(3);

    // urgent和high应该保留
    const ids = result.map(m => m.id);
    expect(ids).toContain('urgent');
    expect(ids).toContain('high');
  });

  it('clear应清空队列', () => {
    queue.enqueue(createPushMessage());
    queue.enqueue(createPushMessage());
    queue.clear();
    expect(queue.size()).toBe(0);
  });

  it('空队列dequeue返回空数组', () => {
    expect(queue.dequeue()).toEqual([]);
  });
});

describe('MessageDeduplicator', () => {
  let dedup: MessageDeduplicator;

  beforeEach(() => {
    dedup = new MessageDeduplicator(1000); // 1秒窗口
  });

  it('首次消息不判为重复', () => {
    const msg = createPushMessage({ id: 'msg1', seq: 1 });
    expect(dedup.isDuplicate(msg)).toBe(false);
  });

  it('相同id和seq判为重复', () => {
    const msg = createPushMessage({ id: 'msg1', seq: 1 });
    dedup.isDuplicate(msg);
    expect(dedup.isDuplicate(msg)).toBe(true);
  });

  it('不同seq不判为重复', () => {
    const msg1 = createPushMessage({ id: 'msg1', seq: 1 });
    const msg2 = createPushMessage({ id: 'msg1', seq: 2 });
    dedup.isDuplicate(msg1);
    expect(dedup.isDuplicate(msg2)).toBe(false);
  });

  it('不同id不判为重复', () => {
    const msg1 = createPushMessage({ id: 'msg1', seq: 1 });
    const msg2 = createPushMessage({ id: 'msg2', seq: 1 });
    dedup.isDuplicate(msg1);
    expect(dedup.isDuplicate(msg2)).toBe(false);
  });

  it('过期后不判为重复', async () => {
    const shortDedup = new MessageDeduplicator(50); // 50ms窗口
    const msg = createPushMessage({ id: 'msg1', seq: 1 });

    shortDedup.isDuplicate(msg);
    expect(shortDedup.isDuplicate(msg)).toBe(true);

    await new Promise(r => setTimeout(r, 100));
    expect(shortDedup.isDuplicate(msg)).toBe(false);
  });

  it('clear应清空已见记录', () => {
    const msg = createPushMessage({ id: 'msg1', seq: 1 });
    dedup.isDuplicate(msg);
    dedup.clear();
    expect(dedup.isDuplicate(msg)).toBe(false);
  });

  it('size返回当前记录数', () => {
    expect(dedup.size()).toBe(0);
    dedup.isDuplicate(createPushMessage({ id: 'a', seq: 1 }));
    expect(dedup.size()).toBe(1);
    dedup.isDuplicate(createPushMessage({ id: 'b', seq: 2 }));
    expect(dedup.size()).toBe(2);
  });
});

describe('PushMessage 类型和主题', () => {
  it('所有通知类型应有对应的主题路由', () => {
    const typeTopics: Record<NotificationType, PushTopic> = {
      price_alert: 'price_alerts',
      limit_up: 'market_events',
      limit_down: 'market_events',
      volume_surge: 'market_events',
      news: 'news',
      trade: 'trade_execution',
      system: 'system',
      watchlist_update: 'watchlist_updates',
      report: 'reports',
    };

    for (const [type, topic] of Object.entries(typeTopics)) {
      const msg = createPushMessage({ type: type as NotificationType, topic: topic as PushTopic });
      expect(msg.topic).toBe(topic);
      expect(msg.type).toBe(type);
    }
  });

  it('优先级值应正确', () => {
    const priorities: NotificationPriority[] = ['low', 'medium', 'high', 'urgent'];
    for (const p of priorities) {
      const msg = createPushMessage({ priority: p });
      expect(msg.priority).toBe(p);
    }
  });

  it('序列号应为数字', () => {
    const msg = createPushMessage({ seq: 42 });
    expect(typeof msg.seq).toBe('number');
    expect(msg.seq).toBe(42);
  });
});

describe('批量消息处理', () => {
  it('批量消息中的每条应有batchId', () => {
    const batchId = 'batch_001';
    const messages = [
      createPushMessage({ id: 'm1', batchId }),
      createPushMessage({ id: 'm2', batchId }),
      createPushMessage({ id: 'm3', batchId }),
    ];

    for (const msg of messages) {
      expect(msg.batchId).toBe(batchId);
    }
  });

  it('批量消息去重应正常工作', () => {
    const dedup = new MessageDeduplicator();
    const messages = [
      createPushMessage({ id: 'm1', seq: 1 }),
      createPushMessage({ id: 'm2', seq: 2 }),
      createPushMessage({ id: 'm1', seq: 1 }), // 重复
    ];

    const unique = messages.filter(m => !dedup.isDuplicate(m));
    expect(unique).toHaveLength(2);
    expect(unique.map(m => m.id)).toEqual(['m1', 'm2']);
  });
});

describe('离线队列和去重联合', () => {
  it('去重后入队，出队应保持优先级排序', () => {
    const queue = new OfflineMessageQueue(100);
    const dedup = new MessageDeduplicator();

    const messages = [
      createPushMessage({ id: 'm1', seq: 1, priority: 'low' }),
      createPushMessage({ id: 'm2', seq: 2, priority: 'urgent' }),
      createPushMessage({ id: 'm3', seq: 3, priority: 'medium' }),
      createPushMessage({ id: 'm1', seq: 1, priority: 'low' }), // 重复
      createPushMessage({ id: 'm4', seq: 4, priority: 'high' }),
    ];

    for (const msg of messages) {
      if (!dedup.isDuplicate(msg)) {
        queue.enqueue(msg);
      }
    }

    expect(queue.size()).toBe(4);

    const result = queue.dequeue();
    expect(result[0].priority).toBe('urgent');
    expect(result[1].priority).toBe('high');
    expect(result[2].priority).toBe('medium');
    expect(result[3].priority).toBe('low');
  });
});

describe('断线重连场景', () => {
  it('重连后应能获取错过的消息序列', () => {
    const queue = new OfflineMessageQueue();
    const allMessages = [
      createPushMessage({ seq: 1 }),
      createPushMessage({ seq: 2 }),
      createPushMessage({ seq: 3 }),
      createPushMessage({ seq: 4 }),
      createPushMessage({ seq: 5 }),
    ];

    // 客户端最后收到 seq=2，断线期间产生了 seq=3,4,5
    const lastSeq = 2;
    const missed = allMessages.filter(m => m.seq > lastSeq);

    // 入队
    missed.forEach(m => queue.enqueue(m));
    expect(queue.size()).toBe(3);

    const result = queue.dequeue();
    expect(result.map(m => m.seq)).toEqual([3, 4, 5]);
  });

  it('重连后序列号应从断点继续', () => {
    const messages = [
      createPushMessage({ seq: 10 }),
      createPushMessage({ seq: 11 }),
      createPushMessage({ seq: 12 }),
    ];

    let lastSeq = 9;
    for (const msg of messages) {
      lastSeq = Math.max(lastSeq, msg.seq);
    }
    expect(lastSeq).toBe(12);
  });
});
