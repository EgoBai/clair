import { describe, it, expect } from 'vitest';

/**
 * 通知铃铛组件逻辑测试
 * NotificationBell 组件状态管理/交互逻辑
 */

type NotificationPriority = 'urgent' | 'high' | 'medium' | 'low';
type NotificationType = 'price_alert' | 'trade_signal' | 'news' | 'system' | 'watchlist';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  priority: NotificationPriority;
  read: boolean;
  readAt?: number;
  createdAt: number;
  actionUrl?: string;
  icon?: string;
}

interface NotificationStats {
  total: number;
  unread: number;
  byType: Record<NotificationType, number>;
  byPriority: Record<NotificationPriority, number>;
}

function formatUnreadBadge(count: number): string {
  if (count <= 0) return '';
  return count > 99 ? '99+' : String(count);
}

function formatNotificationTime(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp;
  if (diff < 0) return '刚刚';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}个月前`;
  return `${Math.floor(months / 12)}年前`;
}

function priorityLabel(priority: NotificationPriority): string {
  const map: Record<NotificationPriority, string> = {
    urgent: '紧急',
    high: '重要',
    medium: '普通',
    low: '低',
  };
  return map[priority];
}

function prioritySortWeight(priority: NotificationPriority): number {
  const map: Record<NotificationPriority, number> = {
    urgent: 4,
    high: 3,
    medium: 2,
    low: 1,
  };
  return map[priority];
}

function sortNotifications(notifications: Notification[]): Notification[] {
  return [...notifications].sort((a, b) => {
    // Unread first
    if (a.read !== b.read) return a.read ? 1 : -1;
    // Then by priority
    const pDiff = prioritySortWeight(b.priority) - prioritySortWeight(a.priority);
    if (pDiff !== 0) return pDiff;
    // Then by time (newest first)
    return b.createdAt - a.createdAt;
  });
}

function markAsRead(notifications: Notification[], id: string): Notification[] {
  return notifications.map(n =>
    n.id === id ? { ...n, read: true, readAt: Date.now() } : n
  );
}

function markAllAsRead(notifications: Notification[]): Notification[] {
  return notifications.map(n => ({ ...n, read: true, readAt: Date.now() }));
}

function deleteNotification(notifications: Notification[], id: string): {
  result: Notification[];
  wasUnread: boolean;
} {
  const target = notifications.find(n => n.id === id);
  return {
    result: notifications.filter(n => n.id !== id),
    wasUnread: target ? !target.read : false,
  };
}

function calcUnreadDelta(notifications: Notification[], id: string): number {
  const n = notifications.find(n => n.id === id);
  return n && !n.read ? -1 : 0;
}

function filterByType(notifications: Notification[], type: NotificationType): Notification[] {
  return notifications.filter(n => n.type === type);
}

function filterUnread(notifications: Notification[]): Notification[] {
  return notifications.filter(n => !n.read);
}

function groupByPriority(notifications: Notification[]): Record<NotificationPriority, Notification[]> {
  const groups: Record<NotificationPriority, Notification[]> = {
    urgent: [], high: [], medium: [], low: [],
  };
  for (const n of notifications) {
    groups[n.priority].push(n);
  }
  return groups;
}

function calcStats(notifications: Notification[]): NotificationStats {
  const byType: Record<NotificationType, number> = {
    price_alert: 0, trade_signal: 0, news: 0, system: 0, watchlist: 0,
  };
  const byPriority: Record<NotificationPriority, number> = {
    urgent: 0, high: 0, medium: 0, low: 0,
  };
  let unread = 0;
  for (const n of notifications) {
    byType[n.type]++;
    byPriority[n.priority]++;
    if (!n.read) unread++;
  }
  return { total: notifications.length, unread, byType, byPriority };
}

function shouldPollNotification(lastPoll: number, interval: number, now = Date.now()): boolean {
  return now - lastPoll >= interval;
}

function truncateBody(body: string, maxLines = 2): string {
  const lines = body.split('\n');
  if (lines.length <= maxLines) return body;
  return lines.slice(0, maxLines).join('\n') + '...';
}

describe('通知铃铛组件逻辑', () => {
  const now = 1700000000000;

  const mockNotifications: Notification[] = [
    { id: '1', type: 'price_alert', title: '价格预警', body: '贵州茅台突破2000', priority: 'urgent', read: false, createdAt: now - 60000 },
    { id: '2', type: 'news', title: '财经新闻', body: '央行降准', priority: 'medium', read: true, createdAt: now - 3600000 },
    { id: '3', type: 'trade_signal', title: '交易信号', body: '买入信号', priority: 'high', read: false, createdAt: now - 120000 },
    { id: '4', type: 'system', title: '系统通知', body: '版本更新', priority: 'low', read: false, createdAt: now - 86400000 },
  ];

  describe('formatUnreadBadge', () => {
    it('should format normal counts', () => {
      expect(formatUnreadBadge(1)).toBe('1');
      expect(formatUnreadBadge(50)).toBe('50');
      expect(formatUnreadBadge(99)).toBe('99');
    });

    it('should cap at 99+', () => {
      expect(formatUnreadBadge(100)).toBe('99+');
      expect(formatUnreadBadge(999)).toBe('99+');
    });

    it('should return empty for zero/negative', () => {
      expect(formatUnreadBadge(0)).toBe('');
      expect(formatUnreadBadge(-1)).toBe('');
    });
  });

  describe('formatNotificationTime', () => {
    it('should format seconds', () => {
      expect(formatNotificationTime(now - 30000, now)).toBe('30秒前');
    });

    it('should format minutes', () => {
      expect(formatNotificationTime(now - 120000, now)).toBe('2分钟前');
    });

    it('should format hours', () => {
      expect(formatNotificationTime(now - 7200000, now)).toBe('2小时前');
    });

    it('should format days', () => {
      expect(formatNotificationTime(now - 172800000, now)).toBe('2天前');
    });

    it('should format months', () => {
      expect(formatNotificationTime(now - 5184000000, now)).toBe('2个月前');
    });

    it('should format years', () => {
      expect(formatNotificationTime(now - 63072000000, now)).toBe('2年前');
    });

    it('should handle future timestamps', () => {
      expect(formatNotificationTime(now + 1000, now)).toBe('刚刚');
    });
  });

  describe('priorityLabel', () => {
    it('should return Chinese labels', () => {
      expect(priorityLabel('urgent')).toBe('紧急');
      expect(priorityLabel('high')).toBe('重要');
      expect(priorityLabel('medium')).toBe('普通');
      expect(priorityLabel('low')).toBe('低');
    });
  });

  describe('sortNotifications', () => {
    it('should sort unread first', () => {
      const sorted = sortNotifications(mockNotifications);
      const firstRead = sorted.findIndex(n => n.read);
      const lastUnread = sorted.length - 1 - [...sorted].reverse().findIndex(n => !n.read);
      expect(firstRead).toBeGreaterThan(lastUnread);
    });

    it('should not mutate original array', () => {
      const original = [...mockNotifications];
      sortNotifications(mockNotifications);
      expect(mockNotifications.map(n => n.id)).toEqual(original.map(n => n.id));
    });
  });

  describe('markAsRead', () => {
    it('should mark specific notification as read', () => {
      const result = markAsRead(mockNotifications, '1');
      const target = result.find(n => n.id === '1');
      expect(target?.read).toBe(true);
      expect(target?.readAt).toBeDefined();
    });

    it('should not affect other notifications', () => {
      const result = markAsRead(mockNotifications, '1');
      const other = result.find(n => n.id === '3');
      expect(other?.read).toBe(false);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all as read', () => {
      const result = markAllAsRead(mockNotifications);
      expect(result.every(n => n.read)).toBe(true);
    });
  });

  describe('deleteNotification', () => {
    it('should remove notification', () => {
      const { result } = deleteNotification(mockNotifications, '1');
      expect(result).toHaveLength(3);
      expect(result.find(n => n.id === '1')).toBeUndefined();
    });

    it('should track if deleted was unread', () => {
      const { wasUnread: unread1 } = deleteNotification(mockNotifications, '1');
      expect(unread1).toBe(true);

      const { wasUnread: read2 } = deleteNotification(mockNotifications, '2');
      expect(read2).toBe(false);
    });
  });

  describe('calcUnreadDelta', () => {
    it('should return -1 for unread', () => {
      expect(calcUnreadDelta(mockNotifications, '1')).toBe(-1);
    });

    it('should return 0 for read', () => {
      expect(calcUnreadDelta(mockNotifications, '2')).toBe(0);
    });
  });

  describe('filterByType', () => {
    it('should filter by type', () => {
      const alerts = filterByType(mockNotifications, 'price_alert');
      expect(alerts).toHaveLength(1);
      expect(alerts[0].id).toBe('1');
    });
  });

  describe('filterUnread', () => {
    it('should return only unread', () => {
      const unread = filterUnread(mockNotifications);
      expect(unread.every(n => !n.read)).toBe(true);
      expect(unread).toHaveLength(3);
    });
  });

  describe('groupByPriority', () => {
    it('should group by priority', () => {
      const groups = groupByPriority(mockNotifications);
      expect(groups.urgent).toHaveLength(1);
      expect(groups.high).toHaveLength(1);
      expect(groups.medium).toHaveLength(1);
      expect(groups.low).toHaveLength(1);
    });
  });

  describe('calcStats', () => {
    it('should calculate correct stats', () => {
      const stats = calcStats(mockNotifications);
      expect(stats.total).toBe(4);
      expect(stats.unread).toBe(3);
      expect(stats.byType.price_alert).toBe(1);
      expect(stats.byPriority.urgent).toBe(1);
    });
  });

  describe('shouldPollNotification', () => {
    it('should return true when interval elapsed', () => {
      expect(shouldPollNotification(now - 30000, 30000, now)).toBe(true);
    });

    it('should return false when interval not elapsed', () => {
      expect(shouldPollNotification(now - 10000, 30000, now)).toBe(false);
    });
  });

  describe('truncateBody', () => {
    it('should not truncate short text', () => {
      expect(truncateBody('hello')).toBe('hello');
      expect(truncateBody('line1\nline2')).toBe('line1\nline2');
    });

    it('should truncate long text', () => {
      expect(truncateBody('line1\nline2\nline3')).toBe('line1\nline2...');
    });
  });
});
