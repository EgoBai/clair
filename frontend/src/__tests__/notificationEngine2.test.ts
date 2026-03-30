import { describe, it, expect } from 'vitest';

// 通知引擎 v2
interface Notification {
  id: string; type: 'price' | 'volume' | 'news' | 'technical' | 'system';
  title: string; message: string; timestamp: number;
  read: boolean; priority: 'low' | 'medium' | 'high' | 'critical';
  stockCode?: string;
}

interface NotificationRule {
  type: Notification['type'];
  condition: (data: any) => boolean;
  template: (data: any) => { title: string; message: string };
  priority: Notification['priority'];
}

function createNotification(rule: NotificationRule, data: any): Notification {
  const content = rule.template(data);
  return {
    id: `${rule.type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: rule.type,
    title: content.title,
    message: content.message,
    timestamp: Date.now(),
    read: false,
    priority: rule.priority,
    stockCode: data.stockCode,
  };
}

function sortByPriority(notifications: Notification[]): Notification[] {
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...notifications].sort((a, b) => order[a.priority] - order[b.priority]);
}

function filterByType(notifications: Notification[], types: Notification['type'][]): Notification[] {
  return notifications.filter(n => types.includes(n.type));
}

function markAllRead(notifications: Notification[]): Notification[] {
  return notifications.map(n => ({ ...n, read: true }));
}

function countUnread(notifications: Notification[]): number {
  return notifications.filter(n => !n.read).length;
}

function groupByType(notifications: Notification[]): Record<string, Notification[]> {
  return notifications.reduce((groups, n) => {
    (groups[n.type] = groups[n.type] || []).push(n);
    return groups;
  }, {} as Record<string, Notification[]>);
}

function cleanupOld(notifications: Notification[], maxAge: number, now: number): Notification[] {
  return notifications.filter(n => now - n.timestamp < maxAge);
}

function batchNotifications(notifications: Notification[], windowMs: number): Notification[][] {
  if (notifications.length === 0) return [];
  const sorted = [...notifications].sort((a, b) => a.timestamp - b.timestamp);
  const batches: Notification[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const last = batches[batches.length - 1];
    if (sorted[i].timestamp - last[last.length - 1].timestamp <= windowMs) {
      last.push(sorted[i]);
    } else {
      batches.push([sorted[i]]);
    }
  }
  return batches;
}

function calcNotificationStats(notifications: Notification[]): {
  total: number; unread: number; byType: Record<string, number>; byPriority: Record<string, number>;
} {
  const byType: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  notifications.forEach(n => {
    byType[n.type] = (byType[n.type] || 0) + 1;
    byPriority[n.priority] = (byPriority[n.priority] || 0) + 1;
  });
  return { total: notifications.length, unread: countUnread(notifications), byType, byPriority };
}

describe('通知引擎 v2', () => {
  const now = Date.now();
  const sampleNotifs: Notification[] = [
    { id: '1', type: 'price', title: '股价提醒', message: '涨到15', timestamp: now, read: false, priority: 'high', stockCode: '000001' },
    { id: '2', type: 'volume', title: '放量提醒', message: '成交量翻倍', timestamp: now - 1000, read: true, priority: 'medium' },
    { id: '3', type: 'news', title: '新闻', message: '重大利好', timestamp: now - 2000, read: false, priority: 'critical' },
    { id: '4', type: 'system', title: '系统', message: '维护通知', timestamp: now - 5000, read: false, priority: 'low' },
  ];

  describe('创建通知', () => {
    it('应按规则创建通知', () => {
      const rule: NotificationRule = {
        type: 'price',
        condition: (d) => d.price > 10,
        template: (d) => ({ title: `${d.code} 股价提醒`, message: `当前价 ${d.price}` }),
        priority: 'high',
      };
      const n = createNotification(rule, { code: '000001', price: 15, stockCode: '000001' });
      expect(n.type).toBe('price');
      expect(n.read).toBe(false);
      expect(n.title).toContain('000001');
    });
  });

  describe('优先级排序', () => {
    it('critical应排在最前', () => {
      const sorted = sortByPriority(sampleNotifs);
      expect(sorted[0].priority).toBe('critical');
    });

    it('low应排在最后', () => {
      const sorted = sortByPriority(sampleNotifs);
      expect(sorted[sorted.length - 1].priority).toBe('low');
    });
  });

  describe('类型过滤', () => {
    it('应只返回指定类型', () => {
      const result = filterByType(sampleNotifs, ['price', 'volume']);
      expect(result.every(n => ['price', 'volume'].includes(n.type))).toBe(true);
    });

    it('空类型应返回空', () => {
      expect(filterByType(sampleNotifs, []).length).toBe(0);
    });
  });

  describe('全部已读', () => {
    it('应标记所有通知为已读', () => {
      const result = markAllRead(sampleNotifs);
      expect(result.every(n => n.read)).toBe(true);
    });
  });

  describe('未读计数', () => {
    it('应正确统计未读数', () => {
      expect(countUnread(sampleNotifs)).toBe(3);
    });
  });

  describe('按类型分组', () => {
    it('应正确分组', () => {
      const groups = groupByType(sampleNotifs);
      expect(groups['price'].length).toBe(1);
      expect(groups['volume'].length).toBe(1);
    });
  });

  describe('清理过期通知', () => {
    it('应保留未过期的', () => {
      const result = cleanupOld(sampleNotifs, 3000, now);
      expect(result.length).toBe(3);
    });

    it('过期时间很短应只保留最新', () => {
      expect(cleanupOld(sampleNotifs, 500, now).length).toBe(1);
    });
  });

  describe('通知批量合并', () => {
    it('时间窗口内应合并', () => {
      const result = batchNotifications(sampleNotifs, 3000);
      expect(result.length).toBeLessThan(sampleNotifs.length);
    });

    it('空数组应返回空', () => {
      expect(batchNotifications([], 1000).length).toBe(0);
    });
  });

  describe('通知统计', () => {
    it('应返回正确的统计信息', () => {
      const stats = calcNotificationStats(sampleNotifs);
      expect(stats.total).toBe(4);
      expect(stats.unread).toBe(3);
      expect(stats.byType['price']).toBe(1);
      expect(stats.byPriority['critical']).toBe(1);
    });
  });
});
