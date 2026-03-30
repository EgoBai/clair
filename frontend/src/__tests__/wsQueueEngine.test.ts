import { describe, it, expect, vi } from 'vitest';
import {
  MessageQueue,
  createConnectionStateMachine,
  type MessagePriority,
} from '../utils/wsQueueEngine';

describe('MessageQueue', () => {
  it('应入队消息', () => {
    const q = new MessageQueue();
    const id = q.enqueue('test', { data: 1 });
    expect(id).toBeTruthy();
    expect(q.size).toBe(1);
    expect(q.pendingCount).toBe(1);
  });

  it('应按优先级出队', () => {
    const q = new MessageQueue();
    q.enqueue('low', 1, 'low');
    q.enqueue('high', 2, 'high');
    q.enqueue('normal', 3, 'normal');

    const batch = q.dequeue(3);
    expect(batch[0].priority).toBe('high');
    expect(batch[1].priority).toBe('normal');
    expect(batch[2].priority).toBe('low');
  });

  it('应标记发送成功', () => {
    const q = new MessageQueue();
    const id = q.enqueue('test', 1);
    expect(q.markSent(id)).toBe(true);
    expect(q.getStats().sent).toBe(1);
  });

  it('应处理失败重试', () => {
    vi.useFakeTimers();
    const q = new MessageQueue({ maxRetries: 3, retryDelay: 100 });
    const id = q.enqueue('test', 1);

    q.markFailed(id, 'timeout');
    expect(q.getStats().retries).toBe(1);

    vi.advanceTimersByTime(200);
    expect(q.retryingCount).toBe(0); // 应重新变为pending

    vi.useRealTimers();
  });

  it('超过最大重试应标记failed', () => {
    const q = new MessageQueue({ maxRetries: 2 });
    const id = q.enqueue('test', 1);
    q.markFailed(id, 'err');
    q.markFailed(id, 'err');
    expect(q.getStats().failed).toBe(1);
  });

  it('应背压控制丢弃低优先级', () => {
    const q = new MessageQueue({ maxSize: 3 });
    q.enqueue('a', 1, 'high');
    q.enqueue('b', 2, 'normal');
    q.enqueue('c', 3, 'low');
    q.enqueue('d', 4, 'high'); // 触发背压

    expect(q.size).toBeLessThanOrEqual(3);
    expect(q.getStats().dropped).toBeGreaterThan(0);
  });

  it('peek应返回最高优先级', () => {
    const q = new MessageQueue();
    q.enqueue('low', 1, 'low');
    q.enqueue('high', 2, 'high');
    const msg = q.peek();
    expect(msg?.priority).toBe('high');
  });

  it('clear应清空队列', () => {
    const q = new MessageQueue();
    q.enqueue('a', 1);
    q.enqueue('b', 2);
    q.clear();
    expect(q.size).toBe(0);
  });

  it('remove应移除指定消息', () => {
    const q = new MessageQueue();
    const id = q.enqueue('a', 1);
    q.enqueue('b', 2);
    q.remove(id);
    expect(q.size).toBe(1);
  });

  it('getByPriority应按优先级过滤', () => {
    const q = new MessageQueue();
    q.enqueue('a', 1, 'high');
    q.enqueue('b', 2, 'low');
    q.enqueue('c', 3, 'high');
    expect(q.getByPriority('high').length).toBe(2);
  });

  it('应正确统计', () => {
    const q = new MessageQueue();
    q.enqueue('a', 1);
    q.enqueue('b', 2);
    const id = q.enqueue('c', 3);
    q.markSent(id);
    const stats = q.getStats();
    expect(stats.enqueued).toBe(3);
    expect(stats.sent).toBe(1);
    expect(stats.total).toBe(3);
  });
});

describe('createConnectionStateMachine', () => {
  it('初始状态应为disconnected', () => {
    const sm = createConnectionStateMachine();
    expect(sm.state.state).toBe('disconnected');
  });

  it('应转换状态', () => {
    const sm = createConnectionStateMachine();
    sm.transition('connecting');
    expect(sm.state.state).toBe('connecting');

    sm.transition('connected');
    expect(sm.state.state).toBe('connected');
    expect(sm.state.lastConnected).toBeDefined();
    expect(sm.state.reconnectAttempts).toBe(0);
  });

  it('重连应增加计数', () => {
    const sm = createConnectionStateMachine();
    sm.transition('reconnecting');
    expect(sm.state.reconnectAttempts).toBe(1);
    sm.transition('reconnecting');
    expect(sm.state.reconnectAttempts).toBe(2);
  });

  it('canSend应检查状态', () => {
    const sm = createConnectionStateMachine();
    expect(sm.canSend()).toBe(false);
    sm.transition('connected');
    expect(sm.canSend()).toBe(true);
  });

  it('shouldReconnect应控制重连', () => {
    const sm = createConnectionStateMachine();
    expect(sm.shouldReconnect()).toBe(true);
    sm.transition('connected');
    expect(sm.shouldReconnect()).toBe(false);
  });

  it('error应记录错误', () => {
    const sm = createConnectionStateMachine();
    sm.transition('error', 'timeout');
    expect(sm.state.error).toBe('timeout');
  });
});
