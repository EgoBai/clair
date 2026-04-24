// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OfflineMessageQueue, MessageDeduplicator, type PushMessage } from '../hooks/useWSNotification';

function createMessage(overrides: Partial<PushMessage> = {}): PushMessage {
  return {
    id: `msg-${Math.random()}`,
    topic: 'notifications',
    type: 'system',
    priority: 'medium',
    payload: {
      id: `payload-${Math.random()}`,
      type: 'system',
      priority: 'medium',
      title: 'Test',
      body: 'Test message',
      channels: ['ws'],
      userId: 'user1',
      read: false,
      status: 'delivered',
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

  it('初始大小应为 0', () => {
    expect(queue.size()).toBe(0);
  });

  it('enqueue 应增加大小', () => {
    queue.enqueue(createMessage());
    expect(queue.size()).toBe(1);
  });

  it('dequeue 应清空队列', () => {
    queue.enqueue(createMessage());
    queue.enqueue(createMessage());
    const result = queue.dequeue();
    expect(result.length).toBe(2);
    expect(queue.size()).toBe(0);
  });

  it('超出容量应丢弃低优先级消息', () => {
    for (let i = 0; i < 15; i++) {
      queue.enqueue(createMessage({ priority: 'low', id: `low-${i}` }));
    }
    expect(queue.size()).toBeLessThanOrEqual(10);
  });

  it('高优先级应排在前面', () => {
    queue.enqueue(createMessage({ priority: 'low', id: 'low1' }));
    queue.enqueue(createMessage({ priority: 'urgent', id: 'urgent1' }));
    queue.enqueue(createMessage({ priority: 'medium', id: 'med1' }));

    const result = queue.dequeue();
    expect(result[0].priority).toBe('urgent');
    expect(result[result.length - 1].priority).toBe('low');
  });

  it('clear 应清空队列', () => {
    queue.enqueue(createMessage());
    queue.enqueue(createMessage());
    queue.clear();
    expect(queue.size()).toBe(0);
  });
});

describe('MessageDeduplicator', () => {
  let dedup: MessageDeduplicator;

  beforeEach(() => {
    dedup = new MessageDeduplicator(5000);
  });

  it('新消息不应是重复', () => {
    const msg = createMessage({ id: 'test-1', seq: 1 });
    expect(dedup.isDuplicate(msg)).toBe(false);
  });

  it('相同消息应被检测为重复', () => {
    const msg = createMessage({ id: 'test-1', seq: 1 });
    expect(dedup.isDuplicate(msg)).toBe(false);
    expect(dedup.isDuplicate(msg)).toBe(true);
  });

  it('不同消息不应是重复', () => {
    const msg1 = createMessage({ id: 'test-1', seq: 1 });
    const msg2 = createMessage({ id: 'test-2', seq: 2 });
    expect(dedup.isDuplicate(msg1)).toBe(false);
    expect(dedup.isDuplicate(msg2)).toBe(false);
  });

  it('size 应跟踪已见消息数', () => {
    dedup.isDuplicate(createMessage({ id: 'a', seq: 1 }));
    dedup.isDuplicate(createMessage({ id: 'b', seq: 2 }));
    expect(dedup.size()).toBe(2);
  });

  it('clear 应重置', () => {
    dedup.isDuplicate(createMessage({ id: 'a', seq: 1 }));
    dedup.clear();
    expect(dedup.size()).toBe(0);
  });

  it('相同 id 不同 seq 应为不同消息', () => {
    const msg1 = createMessage({ id: 'same-id', seq: 1 });
    const msg2 = createMessage({ id: 'same-id', seq: 2 });
    expect(dedup.isDuplicate(msg1)).toBe(false);
    expect(dedup.isDuplicate(msg2)).toBe(false);
  });
});
