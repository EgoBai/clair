import { describe, it, expect } from 'vitest';

// WebSocket消息队列管理
class MessageQueue<T> {
  private queue: T[] = [];
  private maxSize: number;
  private processing = false;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  enqueue(msg: T): boolean {
    if (this.queue.length >= this.maxSize) {
      this.queue.shift(); // drop oldest
    }
    this.queue.push(msg);
    return true;
  }

  dequeue(): T | undefined {
    return this.queue.shift();
  }

  peek(): T | undefined {
    return this.queue[0];
  }

  size(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
  }

  drain(batchSize: number): T[] {
    const batch = this.queue.splice(0, batchSize);
    return batch;
  }

  isFull(): boolean {
    return this.queue.length >= this.maxSize;
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }
}

// 订阅管理器
class SubscriptionManager {
  private subscriptions: Map<string, Set<string>> = new Map(); // topic -> clients

  subscribe(topic: string, clientId: string): boolean {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
    }
    const clients = this.subscriptions.get(topic)!;
    if (clients.has(clientId)) return false;
    clients.add(clientId);
    return true;
  }

  unsubscribe(topic: string, clientId: string): boolean {
    const clients = this.subscriptions.get(topic);
    if (!clients) return false;
    const result = clients.delete(clientId);
    if (clients.size === 0) this.subscriptions.delete(topic);
    return result;
  }

  getSubscribers(topic: string): string[] {
    return [...(this.subscriptions.get(topic) || [])];
  }

  getTopics(clientId: string): string[] {
    const topics: string[] = [];
    this.subscriptions.forEach((clients, topic) => {
      if (clients.has(clientId)) topics.push(topic);
    });
    return topics;
  }

  getTopicCount(): number {
    return this.subscriptions.size;
  }

  getTotalSubscriptions(): number {
    let total = 0;
    this.subscriptions.forEach(clients => total += clients.size);
    return total;
  }

  clearClient(clientId: string): number {
    let removed = 0;
    this.subscriptions.forEach((clients, topic) => {
      if (clients.delete(clientId)) removed++;
      if (clients.size === 0) this.subscriptions.delete(topic);
    });
    return removed;
  }
}

// 心跳管理器
class HeartbeatManager {
  private intervalMs: number;
  private timeoutMs: number;
  private lastPing: number = 0;
  private lastPong: number = 0;
  private missedPongs: number = 0;
  private maxMissed: number;

  constructor(intervalMs: number = 15000, timeoutMs: number = 10000, maxMissed: number = 3) {
    this.intervalMs = intervalMs;
    this.timeoutMs = timeoutMs;
    this.maxMissed = maxMissed;
  }

  ping(now: number = Date.now()): void {
    this.lastPing = now;
  }

  pong(now: number = Date.now()): void {
    this.lastPong = now;
    this.missedPongs = 0;
  }

  isAlive(now: number = Date.now()): boolean {
    if (this.lastPing === 0) return true; // never pinged
    return now - this.lastPong < this.timeoutMs;
  }

  shouldPing(now: number = Date.now()): boolean {
    return now - this.lastPing >= this.intervalMs;
  }

  recordMissedPong(): void {
    this.missedPongs++;
  }

  isDead(): boolean {
    return this.missedPongs >= this.maxMissed;
  }

  getMissedPongs(): number {
    return this.missedPongs;
  }
}

describe('WebSocket管理器', () => {
  describe('消息队列', () => {
    it('入队出队FIFO', () => {
      const q = new MessageQueue<string>();
      q.enqueue('a');
      q.enqueue('b');
      expect(q.dequeue()).toBe('a');
      expect(q.dequeue()).toBe('b');
    });

    it('空队列出队返回undefined', () => {
      expect(new MessageQueue().dequeue()).toBeUndefined();
    });

    it('peek不移除', () => {
      const q = new MessageQueue<string>();
      q.enqueue('a');
      expect(q.peek()).toBe('a');
      expect(q.size()).toBe(1);
    });

    it('超限自动丢弃最旧', () => {
      const q = new MessageQueue<number>(3);
      q.enqueue(1); q.enqueue(2); q.enqueue(3); q.enqueue(4);
      expect(q.size()).toBe(3);
      expect(q.peek()).toBe(2);
    });

    it('清空队列', () => {
      const q = new MessageQueue<number>();
      q.enqueue(1); q.enqueue(2);
      q.clear();
      expect(q.isEmpty()).toBe(true);
    });

    it('批量取出', () => {
      const q = new MessageQueue<number>();
      [1, 2, 3, 4, 5].forEach(n => q.enqueue(n));
      const batch = q.drain(3);
      expect(batch).toEqual([1, 2, 3]);
      expect(q.size()).toBe(2);
    });

    it('满队列检测', () => {
      const q = new MessageQueue<number>(2);
      q.enqueue(1); q.enqueue(2);
      expect(q.isFull()).toBe(true);
    });

    it('空队列检测', () => {
      expect(new MessageQueue().isEmpty()).toBe(true);
    });

    it('drain超过大小返回所有', () => {
      const q = new MessageQueue<number>();
      q.enqueue(1); q.enqueue(2);
      expect(q.drain(10)).toEqual([1, 2]);
      expect(q.isEmpty()).toBe(true);
    });
  });

  describe('订阅管理', () => {
    it('订阅成功', () => {
      const sm = new SubscriptionManager();
      expect(sm.subscribe('topic1', 'client1')).toBe(true);
    });

    it('重复订阅返回false', () => {
      const sm = new SubscriptionManager();
      sm.subscribe('topic1', 'client1');
      expect(sm.subscribe('topic1', 'client1')).toBe(false);
    });

    it('取消订阅', () => {
      const sm = new SubscriptionManager();
      sm.subscribe('topic1', 'client1');
      expect(sm.unsubscribe('topic1', 'client1')).toBe(true);
    });

    it('取消不存在的订阅返回false', () => {
      const sm = new SubscriptionManager();
      expect(sm.unsubscribe('topic1', 'client1')).toBe(false);
    });

    it('获取订阅者列表', () => {
      const sm = new SubscriptionManager();
      sm.subscribe('t', 'c1');
      sm.subscribe('t', 'c2');
      expect(sm.getSubscribers('t')).toHaveLength(2);
    });

    it('获取客户端订阅的主题', () => {
      const sm = new SubscriptionManager();
      sm.subscribe('t1', 'c1');
      sm.subscribe('t2', 'c1');
      expect(sm.getTopics('c1')).toHaveLength(2);
    });

    it('主题计数', () => {
      const sm = new SubscriptionManager();
      sm.subscribe('t1', 'c1');
      sm.subscribe('t2', 'c2');
      expect(sm.getTopicCount()).toBe(2);
    });

    it('总订阅数', () => {
      const sm = new SubscriptionManager();
      sm.subscribe('t1', 'c1');
      sm.subscribe('t1', 'c2');
      expect(sm.getTotalSubscriptions()).toBe(2);
    });

    it('清除客户端所有订阅', () => {
      const sm = new SubscriptionManager();
      sm.subscribe('t1', 'c1');
      sm.subscribe('t2', 'c1');
      sm.subscribe('t1', 'c2');
      const removed = sm.clearClient('c1');
      expect(removed).toBe(2);
      expect(sm.getTopics('c1')).toHaveLength(0);
      expect(sm.getSubscribers('t1')).toContain('c2');
    });

    it('空主题自动清理', () => {
      const sm = new SubscriptionManager();
      sm.subscribe('t', 'c');
      sm.unsubscribe('t', 'c');
      expect(sm.getTopicCount()).toBe(0);
    });
  });

  describe('心跳管理', () => {
    it('初始状态存活', () => {
      const hb = new HeartbeatManager();
      expect(hb.isAlive()).toBe(true);
    });

    it('ping后未超时存活', () => {
      const hb = new HeartbeatManager(15000, 10000);
      hb.ping(1000);
      hb.pong(1000);
      expect(hb.isAlive(5000)).toBe(true);
    });

    it('超时后不存活', () => {
      const hb = new HeartbeatManager(15000, 10000);
      hb.ping(1000);
      hb.pong(1000);
      expect(hb.isAlive(20000)).toBe(false);
    });

    it('pong重置存活状态', () => {
      const hb = new HeartbeatManager(15000, 5000);
      hb.ping(1000);
      expect(hb.isAlive(7000)).toBe(false);
      hb.pong(7000);
      expect(hb.isAlive(8000)).toBe(true);
    });

    it('应该发送心跳', () => {
      const hb = new HeartbeatManager(1000, 10000);
      hb.ping(0);
      expect(hb.shouldPing(500)).toBe(false);
      expect(hb.shouldPing(1001)).toBe(true);
    });

    it('连续丢包判定死亡', () => {
      const hb = new HeartbeatManager(15000, 10000, 3);
      hb.recordMissedPong();
      hb.recordMissedPong();
      expect(hb.isDead()).toBe(false);
      hb.recordMissedPong();
      expect(hb.isDead()).toBe(true);
    });

    it('丢包计数', () => {
      const hb = new HeartbeatManager();
      hb.recordMissedPong();
      hb.recordMissedPong();
      expect(hb.getMissedPongs()).toBe(2);
    });

    it('pong重置丢包计数', () => {
      const hb = new HeartbeatManager();
      hb.recordMissedPong();
      hb.pong();
      expect(hb.getMissedPongs()).toBe(0);
    });
  });
});
