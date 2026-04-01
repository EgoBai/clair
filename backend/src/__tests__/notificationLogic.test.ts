import { describe, it, expect } from 'vitest';

/**
 * 通知逻辑测试
 * 分组/优先级路由/速率限制
 */

type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';
type NotificationChannel = 'push' | 'email' | 'sms' | 'websocket' | 'in_app';

interface Notification {
  id: string;
  type: string;
  priority: NotificationPriority;
  title: string;
  message: string;
  timestamp: number;
  symbol?: string;
  read: boolean;
}

interface NotificationGroup {
  key: string;
  notifications: Notification[];
  count: number;
  latestAt: number;
  priority: NotificationPriority;
}

function groupByType(notifications: Notification[]): NotificationGroup[] {
  const map = new Map<string, Notification[]>();
  notifications.forEach(n => {
    const existing = map.get(n.type) || [];
    existing.push(n);
    map.set(n.type, existing);
  });
  return Array.from(map.entries()).map(([type, notifs]) => {
    const priorityOrder: NotificationPriority[] = ['urgent', 'high', 'normal', 'low'];
    const highest = priorityOrder.find(p => notifs.some(n => n.priority === p)) || 'low';
    return {
      key: type,
      notifications: notifs,
      count: notifs.length,
      latestAt: Math.max(...notifs.map(n => n.timestamp)),
      priority: highest,
    };
  });
}

function groupByTimeWindow(notifications: Notification[], windowMs: number): NotificationGroup[] {
  if (notifications.length === 0) return [];
  const sorted = [...notifications].sort((a, b) => a.timestamp - b.timestamp);
  const groups: NotificationGroup[] = [];
  let currentGroup: Notification[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].timestamp - currentGroup[0].timestamp <= windowMs) {
      currentGroup.push(sorted[i]);
    } else {
      groups.push(createGroup(currentGroup));
      currentGroup = [sorted[i]];
    }
  }
  groups.push(createGroup(currentGroup));
  return groups;
}

function createGroup(notifs: Notification[]): NotificationGroup {
  const priorityOrder: NotificationPriority[] = ['urgent', 'high', 'normal', 'low'];
  const highest = priorityOrder.find(p => notifs.some(n => n.priority === p)) || 'low';
  return {
    key: `${notifs[0].type}_${notifs[0].timestamp}`,
    notifications: notifs,
    count: notifs.length,
    latestAt: Math.max(...notifs.map(n => n.timestamp)),
    priority: highest,
  };
}

function routeByPriority(notification: Notification): NotificationChannel[] {
  switch (notification.priority) {
    case 'urgent': return ['push', 'sms', 'websocket', 'in_app'];
    case 'high': return ['push', 'websocket', 'in_app'];
    case 'normal': return ['websocket', 'in_app'];
    case 'low': return ['in_app'];
    default: return ['in_app'];
  }
}

class RateLimiter {
  private counts = new Map<string, { count: number; windowStart: number }>();
  constructor(private maxPerMinute: number) {}

  canSend(userId: string, now: number): boolean {
    const entry = this.counts.get(userId);
    if (!entry || now - entry.windowStart >= 60000) {
      this.counts.set(userId, { count: 1, windowStart: now });
      return true;
    }
    if (entry.count < this.maxPerMinute) {
      entry.count++;
      return true;
    }
    return false;
  }

  getRemaining(userId: string): number {
    const entry = this.counts.get(userId);
    if (!entry) return this.maxPerMinute;
    return Math.max(0, this.maxPerMinute - entry.count);
  }
}

describe('通知逻辑', () => {
  const makeNotif = (overrides: Partial<Notification> = {}): Notification => ({
    id: '1', type: 'price_alert', priority: 'normal', title: 'T', message: 'M',
    timestamp: Date.now(), read: false, ...overrides,
  });

  describe('groupByType', () => {
    it('should group by notification type', () => {
      const notifs = [
        makeNotif({ type: 'price_alert', id: '1' }),
        makeNotif({ type: 'price_alert', id: '2' }),
        makeNotif({ type: 'news', id: '3' }),
      ];
      const groups = groupByType(notifs);
      expect(groups).toHaveLength(2);
      expect(groups.find(g => g.key === 'price_alert')?.count).toBe(2);
    });

    it('should pick highest priority for group', () => {
      const notifs = [
        makeNotif({ type: 'alert', priority: 'low' }),
        makeNotif({ type: 'alert', priority: 'urgent' }),
      ];
      const groups = groupByType(notifs);
      expect(groups[0].priority).toBe('urgent');
    });
  });

  describe('groupByTimeWindow', () => {
    it('should group notifications within window', () => {
      const notifs = [
        makeNotif({ timestamp: 1000 }),
        makeNotif({ timestamp: 2000 }),
        makeNotif({ timestamp: 10000 }),
      ];
      const groups = groupByTimeWindow(notifs, 5000);
      expect(groups).toHaveLength(2);
    });

    it('should handle empty', () => {
      expect(groupByTimeWindow([], 5000)).toHaveLength(0);
    });
  });

  describe('routeByPriority', () => {
    it('urgent should go to all channels', () => {
      const channels = routeByPriority(makeNotif({ priority: 'urgent' }));
      expect(channels).toContain('push');
      expect(channels).toContain('sms');
    });

    it('low should only go to in_app', () => {
      const channels = routeByPriority(makeNotif({ priority: 'low' }));
      expect(channels).toEqual(['in_app']);
    });
  });

  describe('RateLimiter', () => {
    it('should allow within limit', () => {
      const limiter = new RateLimiter(5);
      expect(limiter.canSend('user1', 1000)).toBe(true);
      expect(limiter.canSend('user1', 2000)).toBe(true);
    });

    it('should block after limit', () => {
      const limiter = new RateLimiter(2);
      limiter.canSend('user1', 1000);
      limiter.canSend('user1', 2000);
      expect(limiter.canSend('user1', 3000)).toBe(false);
    });

    it('should reset after window', () => {
      const limiter = new RateLimiter(1);
      limiter.canSend('user1', 1000);
      expect(limiter.canSend('user1', 61000)).toBe(true);
    });

    it('remaining should decrease', () => {
      const limiter = new RateLimiter(3);
      limiter.canSend('u', 1000);
      expect(limiter.getRemaining('u')).toBe(2);
    });
  });
});
