import { describe, it, expect } from 'vitest';

// 通知与消息系统测试

interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  read: boolean;
  createdAt: number;
  data?: Record<string, any>;
}

function createNotification(
  type: Notification['type'],
  title: string,
  message: string,
  priority: Notification['priority'] = 'normal',
  data?: Record<string, any>
): Notification {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type,
    title,
    message,
    priority,
    read: false,
    createdAt: Date.now(),
    data,
  };
}

function groupNotifications(
  notifications: Notification[],
  groupBy: 'type' | 'priority' | 'date'
): Map<string, Notification[]> {
  const groups = new Map<string, Notification[]>();
  
  for (const n of notifications) {
    let key: string;
    switch (groupBy) {
      case 'type':
        key = n.type;
        break;
      case 'priority':
        key = n.priority;
        break;
      case 'date':
        key = new Date(n.createdAt).toISOString().slice(0, 10);
        break;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(n);
  }
  
  return groups;
}

function filterNotifications(
  notifications: Notification[],
  filters: {
    types?: Notification['type'][];
    priorities?: Notification['priority'][];
    unreadOnly?: boolean;
    since?: number;
  }
): Notification[] {
  return notifications.filter(n => {
    if (filters.types && !filters.types.includes(n.type)) return false;
    if (filters.priorities && !filters.priorities.includes(n.priority)) return false;
    if (filters.unreadOnly && n.read) return false;
    if (filters.since && n.createdAt < filters.since) return false;
    return true;
  });
}

function countUnread(notifications: Notification[]): number {
  return notifications.filter(n => !n.read).length;
}

function countByType(notifications: Notification[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const n of notifications) {
    counts[n.type] = (counts[n.type] || 0) + 1;
  }
  return counts;
}

function sortByPriority(notifications: Notification[]): Notification[] {
  const order: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };
  return [...notifications].sort((a, b) => order[a.priority] - order[b.priority]);
}

function expireNotifications(
  notifications: Notification[],
  maxAge: number,
  now: number = Date.now()
): Notification[] {
  return notifications.filter(n => now - n.createdAt < maxAge);
}

function mergeNotifications(
  existing: Notification[],
  incoming: Notification[]
): Notification[] {
  const existingIds = new Set(existing.map(n => n.id));
  const newOnes = incoming.filter(n => !existingIds.has(n.id));
  return [...existing, ...newOnes].sort((a, b) => b.createdAt - a.createdAt);
}

function summarizeNotifications(notifications: Notification[]): {
  total: number;
  unread: number;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
  latest: Notification | null;
} {
  return {
    total: notifications.length,
    unread: countUnread(notifications),
    byType: countByType(notifications),
    byPriority: notifications.reduce((acc, n) => {
      acc[n.priority] = (acc[n.priority] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    latest: notifications.length > 0
      ? notifications.reduce((latest, n) => n.createdAt > latest.createdAt ? n : latest)
      : null,
  };
}

describe('通知与消息系统', () => {
  const sampleNotifications: Notification[] = [
    { id: '1', type: 'info', title: 'A', message: 'msg', priority: 'normal', read: false, createdAt: 1000 },
    { id: '2', type: 'success', title: 'B', message: 'msg', priority: 'low', read: true, createdAt: 2000 },
    { id: '3', type: 'warning', title: 'C', message: 'msg', priority: 'high', read: false, createdAt: 3000 },
    { id: '4', type: 'error', title: 'D', message: 'msg', priority: 'critical', read: false, createdAt: 4000 },
    { id: '5', type: 'info', title: 'E', message: 'msg', priority: 'normal', read: true, createdAt: 5000 },
  ];

  describe('创建通知', () => {
    it('默认优先级normal', () => {
      const n = createNotification('info', '标题', '消息');
      expect(n.priority).toBe('normal');
    });

    it('自定义优先级', () => {
      const n = createNotification('error', '标题', '消息', 'critical');
      expect(n.priority).toBe('critical');
    });

    it('默认未读', () => {
      const n = createNotification('info', '标题', '消息');
      expect(n.read).toBe(false);
    });

    it('生成唯一ID', () => {
      const n1 = createNotification('info', 'A', 'msg');
      const n2 = createNotification('info', 'B', 'msg');
      expect(n1.id).not.toBe(n2.id);
    });

    it('包含数据', () => {
      const n = createNotification('info', 'A', 'msg', 'normal', { symbol: '600519' });
      expect(n.data?.symbol).toBe('600519');
    });
  });

  describe('分组', () => {
    it('按类型分组', () => {
      const groups = groupNotifications(sampleNotifications, 'type');
      expect(groups.get('info')?.length).toBe(2);
      expect(groups.get('error')?.length).toBe(1);
    });

    it('按优先级分组', () => {
      const groups = groupNotifications(sampleNotifications, 'priority');
      expect(groups.get('normal')?.length).toBe(2);
      expect(groups.get('critical')?.length).toBe(1);
    });

    it('按日期分组', () => {
      const groups = groupNotifications(sampleNotifications, 'date');
      expect(groups.size).toBeGreaterThan(0);
    });
  });

  describe('筛选', () => {
    it('按类型筛选', () => {
      const filtered = filterNotifications(sampleNotifications, { types: ['info', 'error'] });
      expect(filtered.length).toBe(3);
    });

    it('按优先级筛选', () => {
      const filtered = filterNotifications(sampleNotifications, { priorities: ['critical'] });
      expect(filtered.length).toBe(1);
    });

    it('仅未读', () => {
      const filtered = filterNotifications(sampleNotifications, { unreadOnly: true });
      expect(filtered.every(n => !n.read)).toBe(true);
    });

    it('时间范围', () => {
      const filtered = filterNotifications(sampleNotifications, { since: 3000 });
      expect(filtered.length).toBe(3);
    });

    it('组合筛选', () => {
      const filtered = filterNotifications(sampleNotifications, {
        types: ['info'],
        unreadOnly: true,
      });
      expect(filtered.every(n => n.type === 'info' && !n.read)).toBe(true);
    });
  });

  describe('计数', () => {
    it('未读计数', () => {
      expect(countUnread(sampleNotifications)).toBe(3);
    });

    it('空数组未读0', () => {
      expect(countUnread([])).toBe(0);
    });

    it('按类型计数', () => {
      const counts = countByType(sampleNotifications);
      expect(counts['info']).toBe(2);
      expect(counts['error']).toBe(1);
    });
  });

  describe('排序', () => {
    it('按优先级排序', () => {
      const sorted = sortByPriority(sampleNotifications);
      expect(sorted[0].priority).toBe('critical');
      expect(sorted[sorted.length - 1].priority).toBe('low');
    });

    it('不修改原数组', () => {
      const original = [...sampleNotifications];
      sortByPriority(sampleNotifications);
      expect(sampleNotifications[0].id).toBe(original[0].id);
    });
  });

  describe('过期清理', () => {
    it('清理旧通知', () => {
      const active = expireNotifications(sampleNotifications, 3000, 5000);
      expect(active.length).toBe(3);
    });

    it('保留所有新通知', () => {
      const active = expireNotifications(sampleNotifications, 10000, 5000);
      expect(active.length).toBe(5);
    });

    it('全过期', () => {
      const active = expireNotifications(sampleNotifications, 100, 10000);
      expect(active.length).toBe(0);
    });
  });

  describe('合并', () => {
    it('合并新通知', () => {
      const incoming: Notification[] = [
        { id: '6', type: 'info', title: 'F', message: 'msg', priority: 'normal', read: false, createdAt: 6000 },
      ];
      const merged = mergeNotifications(sampleNotifications, incoming);
      expect(merged.length).toBe(6);
    });

    it('跳过重复ID', () => {
      const incoming: Notification[] = [
        { id: '1', type: 'info', title: 'dup', message: 'msg', priority: 'normal', read: false, createdAt: 6000 },
      ];
      const merged = mergeNotifications(sampleNotifications, incoming);
      expect(merged.length).toBe(5);
    });

    it('按时间倒序', () => {
      const incoming: Notification[] = [
        { id: '6', type: 'info', title: 'F', message: 'msg', priority: 'normal', read: false, createdAt: 6000 },
      ];
      const merged = mergeNotifications(sampleNotifications, incoming);
      expect(merged[0].createdAt).toBe(6000);
    });
  });

  describe('汇总', () => {
    it('正确统计', () => {
      const summary = summarizeNotifications(sampleNotifications);
      expect(summary.total).toBe(5);
      expect(summary.unread).toBe(3);
      expect(summary.byType['info']).toBe(2);
      expect(summary.byPriority['critical']).toBe(1);
    });

    it('最新通知', () => {
      const summary = summarizeNotifications(sampleNotifications);
      expect(summary.latest?.id).toBe('5');
    });

    it('空数组', () => {
      const summary = summarizeNotifications([]);
      expect(summary.total).toBe(0);
      expect(summary.latest).toBe(null);
    });
  });
});
