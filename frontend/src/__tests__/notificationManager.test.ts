import { describe, it, expect } from 'vitest';

// 通知系统管理器
interface Notification {
  id: string;
  type: 'price_alert' | 'news' | 'system' | 'trade' | 'report';
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  read: boolean;
  timestamp: number;
  data?: Record<string, any>;
}

class NotificationManager {
  private notifications: Notification[] = [];
  private maxCount: number;
  private subscribers: Map<string, (n: Notification) => void> = new Map();

  constructor(maxCount: number = 100) {
    this.maxCount = maxCount;
  }

  add(notification: Omit<Notification, 'id' | 'read' | 'timestamp'>): Notification {
    const n: Notification = {
      ...notification,
      id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      read: false,
      timestamp: Date.now(),
    };
    this.notifications.unshift(n);
    if (this.notifications.length > this.maxCount) {
      this.notifications = this.notifications.slice(0, this.maxCount);
    }
    this.subscribers.forEach(cb => cb(n));
    return n;
  }

  markRead(id: string): boolean {
    const n = this.notifications.find(x => x.id === id);
    if (!n) return false;
    n.read = true;
    return true;
  }

  markAllRead(type?: string): number {
    let count = 0;
    for (const n of this.notifications) {
      if (!type || n.type === type) {
        if (!n.read) { n.read = true; count++; }
      }
    }
    return count;
  }

  getUnread(type?: string): Notification[] {
    return this.notifications.filter(n => !n.read && (!type || n.type === type));
  }

  getByPriority(priority: string): Notification[] {
    return this.notifications.filter(n => n.priority === priority);
  }

  getByType(type: string): Notification[] {
    return this.notifications.filter(n => n.type === type);
  }

  getRecent(count: number): Notification[] {
    return this.notifications.slice(0, count);
  }

  delete(id: string): boolean {
    const idx = this.notifications.findIndex(x => x.id === id);
    if (idx === -1) return false;
    this.notifications.splice(idx, 1);
    return true;
  }

  clear(): void {
    this.notifications = [];
  }

  subscribe(key: string, callback: (n: Notification) => void): void {
    this.subscribers.set(key, callback);
  }

  unsubscribe(key: string): void {
    this.subscribers.delete(key);
  }

  getCount(): number {
    return this.notifications.length;
  }

  getUnreadCount(): number {
    return this.notifications.filter(n => !n.read).length;
  }

  getStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const n of this.notifications) {
      stats[n.type] = (stats[n.type] || 0) + 1;
    }
    return stats;
  }
}

// 推送调度器
class PushScheduler {
  private channels: Map<string, (msg: string) => void> = new Map();
  private queue: { channel: string; message: string; priority: string }[] = [];

  registerChannel(name: string, handler: (msg: string) => void): void {
    this.channels.set(name, handler);
  }

  push(channel: string, message: string, priority: string = 'medium'): boolean {
    const handler = this.channels.get(channel);
    if (!handler) {
      this.queue.push({ channel, message, priority });
      return false;
    }
    handler(message);
    return true;
  }

  flush(): number {
    let flushed = 0;
    const remaining: typeof this.queue = [];
    for (const item of this.queue) {
      const handler = this.channels.get(item.channel);
      if (handler) { handler(item.message); flushed++; }
      else remaining.push(item);
    }
    this.queue = remaining;
    return flushed;
  }

  getPendingCount(): number {
    return this.queue.length;
  }
}

describe('通知系统管理器', () => {
  const makeNotification = (overrides: Partial<Omit<Notification, 'id' | 'read' | 'timestamp'>> = {}) => ({
    type: 'system' as const,
    title: 'Test',
    message: 'Test message',
    priority: 'medium' as const,
    ...overrides,
  });

  describe('通知管理', () => {
    it('添加通知', () => {
      const nm = new NotificationManager();
      const n = nm.add(makeNotification());
      expect(n.id).toBeDefined();
      expect(n.read).toBe(false);
    });

    it('标记已读', () => {
      const nm = new NotificationManager();
      const n = nm.add(makeNotification());
      expect(nm.markRead(n.id)).toBe(true);
      expect(nm.getUnread()).toHaveLength(0);
    });

    it('标记不存在的通知返回false', () => {
      const nm = new NotificationManager();
      expect(nm.markRead('nonexist')).toBe(false);
    });

    it('全部标记已读', () => {
      const nm = new NotificationManager();
      nm.add(makeNotification());
      nm.add(makeNotification({ type: 'news' }));
      const count = nm.markAllRead();
      expect(count).toBe(2);
    });

    it('按类型标记已读', () => {
      const nm = new NotificationManager();
      nm.add(makeNotification({ type: 'system' }));
      nm.add(makeNotification({ type: 'news' }));
      const count = nm.markAllRead('system');
      expect(count).toBe(1);
    });

    it('获取未读', () => {
      const nm = new NotificationManager();
      nm.add(makeNotification());
      nm.add(makeNotification());
      expect(nm.getUnread()).toHaveLength(2);
    });

    it('按类型筛选', () => {
      const nm = new NotificationManager();
      nm.add(makeNotification({ type: 'price_alert' }));
      nm.add(makeNotification({ type: 'news' }));
      expect(nm.getByType('price_alert')).toHaveLength(1);
    });

    it('按优先级筛选', () => {
      const nm = new NotificationManager();
      nm.add(makeNotification({ priority: 'critical' }));
      nm.add(makeNotification({ priority: 'low' }));
      expect(nm.getByPriority('critical')).toHaveLength(1);
    });

    it('获取最近N条', () => {
      const nm = new NotificationManager();
      for (let i = 0; i < 10; i++) nm.add(makeNotification());
      expect(nm.getRecent(5)).toHaveLength(5);
    });

    it('删除通知', () => {
      const nm = new NotificationManager();
      const n = nm.add(makeNotification());
      expect(nm.delete(n.id)).toBe(true);
      expect(nm.getCount()).toBe(0);
    });

    it('清空所有', () => {
      const nm = new NotificationManager();
      nm.add(makeNotification());
      nm.add(makeNotification());
      nm.clear();
      expect(nm.getCount()).toBe(0);
    });

    it('超限自动清理', () => {
      const nm = new NotificationManager(3);
      for (let i = 0; i < 5; i++) nm.add(makeNotification());
      expect(nm.getCount()).toBe(3);
    });

    it('计数正确', () => {
      const nm = new NotificationManager();
      nm.add(makeNotification());
      nm.add(makeNotification());
      expect(nm.getCount()).toBe(2);
      expect(nm.getUnreadCount()).toBe(2);
    });

    it('统计正确', () => {
      const nm = new NotificationManager();
      nm.add(makeNotification({ type: 'news' }));
      nm.add(makeNotification({ type: 'news' }));
      nm.add(makeNotification({ type: 'system' }));
      const stats = nm.getStats();
      expect(stats['news']).toBe(2);
      expect(stats['system']).toBe(1);
    });
  });

  describe('订阅通知', () => {
    it('收到新通知回调', () => {
      const nm = new NotificationManager();
      const received: Notification[] = [];
      nm.subscribe('test', n => received.push(n));
      nm.add(makeNotification());
      expect(received).toHaveLength(1);
    });

    it('取消订阅', () => {
      const nm = new NotificationManager();
      const received: Notification[] = [];
      nm.subscribe('test', n => received.push(n));
      nm.unsubscribe('test');
      nm.add(makeNotification());
      expect(received).toHaveLength(0);
    });

    it('多订阅者', () => {
      const nm = new NotificationManager();
      let count = 0;
      nm.subscribe('a', () => count++);
      nm.subscribe('b', () => count++);
      nm.add(makeNotification());
      expect(count).toBe(2);
    });
  });

  describe('推送调度器', () => {
    it('注册后直接推送', () => {
      const ps = new PushScheduler();
      let received = '';
      ps.registerChannel('ch1', msg => received = msg);
      expect(ps.push('ch1', 'hello')).toBe(true);
      expect(received).toBe('hello');
    });

    it('未注册频道入队', () => {
      const ps = new PushScheduler();
      expect(ps.push('unknown', 'msg')).toBe(false);
      expect(ps.getPendingCount()).toBe(1);
    });

    it('flush处理待发送', () => {
      const ps = new PushScheduler();
      ps.push('ch1', 'msg1');
      ps.push('ch1', 'msg2');
      const received: string[] = [];
      ps.registerChannel('ch1', msg => received.push(msg));
      const flushed = ps.flush();
      expect(flushed).toBe(2);
      expect(received).toEqual(['msg1', 'msg2']);
    });

    it('flush后未注册频道保留', () => {
      const ps = new PushScheduler();
      ps.push('unknown', 'msg');
      ps.flush();
      expect(ps.getPendingCount()).toBe(1);
    });
  });
});
