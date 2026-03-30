import { describe, it, expect } from 'vitest';

describe('NotificationSystem', () => {
  type NotificationType = 'price_alert' | 'news' | 'system' | 'trade' | 'report';
  type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

  interface Notification {
    id: string;
    type: NotificationType;
    priority: NotificationPriority;
    title: string;
    message: string;
    read: boolean;
    createdAt: string;
    symbol?: string;
    link?: string;
  }

  function createNotification(data: Omit<Notification, 'id' | 'read' | 'createdAt'>): Notification {
    return {
      ...data,
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      read: false,
      createdAt: new Date().toISOString(),
    };
  }

  function filterNotifications(notifications: Notification[], filters: { type?: NotificationType; unreadOnly?: boolean; priority?: NotificationPriority }): Notification[] {
    let result = [...notifications];
    if (filters.type) result = result.filter(n => n.type === filters.type);
    if (filters.unreadOnly) result = result.filter(n => !n.read);
    if (filters.priority) result = result.filter(n => n.priority === filters.priority);
    return result;
  }

  function markAllRead(notifications: Notification[]): Notification[] {
    return notifications.map(n => ({ ...n, read: true }));
  }

  function countUnread(notifications: Notification[]): Record<NotificationType, number> {
    const counts: Record<NotificationType, number> = { price_alert: 0, news: 0, system: 0, trade: 0, report: 0 };
    for (const n of notifications) {
      if (!n.read) counts[n.type]++;
    }
    return counts;
  }

  function sortByPriority(notifications: Notification[]): Notification[] {
    const priorityOrder: Record<NotificationPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return [...notifications].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  function groupByType(notifications: Notification[]): Map<NotificationType, Notification[]> {
    const groups = new Map<NotificationType, Notification[]>();
    for (const n of notifications) {
      const group = groups.get(n.type) || [];
      group.push(n);
      groups.set(n.type, group);
    }
    return groups;
  }

  const mockNotifications: Notification[] = [
    { id: '1', type: 'price_alert', priority: 'high', title: '价格突破', message: '贵州茅台突破1800元', read: false, createdAt: '2026-03-24T04:00:00Z', symbol: '600519' },
    { id: '2', type: 'news', priority: 'medium', title: '重大新闻', message: '央行降准0.5个百分点', read: false, createdAt: '2026-03-24T03:00:00Z' },
    { id: '3', type: 'system', priority: 'low', title: '系统更新', message: '新版本已上线', read: true, createdAt: '2026-03-24T02:00:00Z' },
    { id: '4', type: 'trade', priority: 'critical', title: '涨停预警', message: '宁德时代触及涨停', read: false, createdAt: '2026-03-24T04:30:00Z', symbol: '300750' },
    { id: '5', type: 'report', priority: 'medium', title: '财报发布', message: '贵州茅台2025年报已发布', read: true, createdAt: '2026-03-23T10:00:00Z', symbol: '600519' },
    { id: '6', type: 'price_alert', priority: 'medium', title: '跌停预警', message: '平安银行触及跌停', read: false, createdAt: '2026-03-24T04:15:00Z', symbol: '000001' },
  ];

  it('should create notification with id and timestamp', () => {
    const n = createNotification({ type: 'price_alert', priority: 'high', title: 'Test', message: 'Test message' });
    expect(n.id).toBeDefined();
    expect(n.read).toBe(false);
    expect(n.createdAt).toBeDefined();
  });

  it('should filter by type', () => {
    const result = filterNotifications(mockNotifications, { type: 'price_alert' });
    expect(result.every(n => n.type === 'price_alert')).toBe(true);
  });

  it('should filter unread only', () => {
    const result = filterNotifications(mockNotifications, { unreadOnly: true });
    expect(result.every(n => !n.read)).toBe(true);
  });

  it('should filter by priority', () => {
    const result = filterNotifications(mockNotifications, { priority: 'critical' });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('trade');
  });

  it('should mark all as read', () => {
    const result = markAllRead(mockNotifications);
    expect(result.every(n => n.read)).toBe(true);
  });

  it('should count unread by type', () => {
    const counts = countUnread(mockNotifications);
    expect(counts.price_alert).toBe(2);
    expect(counts.news).toBe(1);
    expect(counts.system).toBe(0);
    expect(counts.trade).toBe(1);
  });

  it('should sort by priority', () => {
    const sorted = sortByPriority(mockNotifications);
    expect(sorted[0].priority).toBe('critical');
    expect(sorted[sorted.length - 1].priority).toBe('low');
  });

  it('should group by type', () => {
    const groups = groupByType(mockNotifications);
    expect(groups.get('price_alert')).toHaveLength(2);
    expect(groups.get('news')).toHaveLength(1);
  });

  it('should preserve notification properties', () => {
    const result = filterNotifications(mockNotifications, { type: 'price_alert' });
    expect(result[0].symbol).toBe('600519');
  });

  it('should handle empty notifications', () => {
    const counts = countUnread([]);
    expect(Object.values(counts).every(c => c === 0)).toBe(true);
    const groups = groupByType([]);
    expect(groups.size).toBe(0);
  });

  it('should combine multiple filters', () => {
    const result = filterNotifications(mockNotifications, { type: 'price_alert', unreadOnly: true });
    expect(result.every(n => n.type === 'price_alert' && !n.read)).toBe(true);
  });
});
