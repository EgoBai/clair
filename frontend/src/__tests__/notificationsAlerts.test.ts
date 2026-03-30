import { describe, it, expect } from 'vitest';

// ===== 前端通知与告警系统测试 =====

interface Alert {
  id: string;
  type: 'price' | 'volume' | 'change' | 'technical' | 'news';
  symbol: string;
  condition: string;
  value: number;
  currentValue: number;
  triggered: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: number;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  timestamp: number;
  link?: string;
}

function evaluateAlert(alert: Alert): boolean {
  switch (alert.condition) {
    case 'above': return alert.currentValue > alert.value;
    case 'below': return alert.currentValue < alert.value;
    case 'equals': return Math.abs(alert.currentValue - alert.value) < 0.001;
    case 'crosses_above': return alert.currentValue > alert.value && !alert.triggered;
    case 'crosses_below': return alert.currentValue < alert.value && !alert.triggered;
    default: return false;
  }
}

function createNotification(title: string, message: string, type: Notification['type'] = 'info'): Notification {
  return {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title, message, type,
    read: false,
    timestamp: Date.now(),
  };
}

function filterNotifications(notifications: Notification[], filters: { type?: string; unreadOnly?: boolean }): Notification[] {
  return notifications.filter(n => {
    if (filters.type && n.type !== filters.type) return false;
    if (filters.unreadOnly && n.read) return false;
    return true;
  });
}

function markAllRead(notifications: Notification[]): Notification[] {
  return notifications.map(n => ({ ...n, read: true }));
}

function getAlertPriority(priceChange: number, volume: number, avgVolume: number): Alert['priority'] {
  const volRatio = avgVolume > 0 ? volume / avgVolume : 1;
  const absChange = Math.abs(priceChange);
  if (absChange > 9 || volRatio > 5) return 'critical';
  if (absChange > 5 || volRatio > 3) return 'high';
  if (absChange > 2 || volRatio > 2) return 'medium';
  return 'low';
}

function groupAlertsBySymbol(alerts: Alert[]): Record<string, Alert[]> {
  const groups: Record<string, Alert[]> = {};
  for (const a of alerts) {
    if (!groups[a.symbol]) groups[a.symbol] = [];
    groups[a.symbol].push(a);
  }
  return groups;
}

function deduplicateNotifications(notifications: Notification[], windowMs: number = 60000): Notification[] {
  const seen = new Map<string, Notification>();
  for (const n of notifications) {
    const key = `${n.title}-${n.message}`;
    const existing = seen.get(key);
    if (!existing || n.timestamp - existing.timestamp > windowMs) {
      seen.set(key, n);
    }
  }
  return Array.from(seen.values());
}

function generateAlertMessage(alert: Alert): string {
  const typeNames: Record<string, string> = {
    price: '价格', volume: '成交量', change: '涨跌幅', technical: '技术信号', news: '新闻',
  };
  const condNames: Record<string, string> = {
    above: '突破', below: '跌破', equals: '触及', crosses_above: '上穿', crosses_below: '下穿',
  };
  return `${alert.symbol} ${typeNames[alert.type] || alert.type}${condNames[alert.condition] || alert.condition} ${alert.value}`;
}

function calculateNotificationBadge(notifications: Notification[]): { total: number; byType: Record<string, number> } {
  const unread = notifications.filter(n => !n.read);
  const byType: Record<string, number> = {};
  for (const n of unread) {
    byType[n.type] = (byType[n.type] || 0) + 1;
  }
  return { total: unread.length, byType };
}

describe('通知与告警系统', () => {
  describe('告警评估', () => {
    it('above触发', () => {
      const alert: Alert = { id: '1', type: 'price', symbol: 'TEST', condition: 'above', value: 10, currentValue: 11, triggered: false, priority: 'medium', createdAt: Date.now() };
      expect(evaluateAlert(alert)).toBe(true);
    });

    it('below触发', () => {
      const alert: Alert = { id: '1', type: 'price', symbol: 'TEST', condition: 'below', value: 10, currentValue: 9, triggered: false, priority: 'medium', createdAt: Date.now() };
      expect(evaluateAlert(alert)).toBe(true);
    });

    it('above不触发', () => {
      const alert: Alert = { id: '1', type: 'price', symbol: 'TEST', condition: 'above', value: 10, currentValue: 9, triggered: false, priority: 'medium', createdAt: Date.now() };
      expect(evaluateAlert(alert)).toBe(false);
    });

    it('crosses_above首次触发', () => {
      const alert: Alert = { id: '1', type: 'price', symbol: 'TEST', condition: 'crosses_above', value: 10, currentValue: 11, triggered: false, priority: 'medium', createdAt: Date.now() };
      expect(evaluateAlert(alert)).toBe(true);
    });

    it('crosses_above已触发不重复', () => {
      const alert: Alert = { id: '1', type: 'price', symbol: 'TEST', condition: 'crosses_above', value: 10, currentValue: 11, triggered: true, priority: 'medium', createdAt: Date.now() };
      expect(evaluateAlert(alert)).toBe(false);
    });

    it('equals近似相等', () => {
      const alert: Alert = { id: '1', type: 'price', symbol: 'TEST', condition: 'equals', value: 10, currentValue: 10.0005, triggered: false, priority: 'medium', createdAt: Date.now() };
      expect(evaluateAlert(alert)).toBe(true);
    });

    it('未知条件返回false', () => {
      const alert: Alert = { id: '1', type: 'price', symbol: 'TEST', condition: 'unknown', value: 10, currentValue: 11, triggered: false, priority: 'medium', createdAt: Date.now() };
      expect(evaluateAlert(alert)).toBe(false);
    });
  });

  describe('通知创建', () => {
    it('生成唯一ID', () => {
      const n1 = createNotification('标题', '内容');
      const n2 = createNotification('标题', '内容');
      expect(n1.id).not.toBe(n2.id);
    });

    it('默认类型为info', () => {
      expect(createNotification('t', 'm').type).toBe('info');
    });

    it('自定义类型', () => {
      expect(createNotification('t', 'm', 'error').type).toBe('error');
    });

    it('默认未读', () => {
      expect(createNotification('t', 'm').read).toBe(false);
    });
  });

  describe('通知筛选', () => {
    const notifs: Notification[] = [
      createNotification('t1', 'm1', 'info'),
      { ...createNotification('t2', 'm2', 'error'), read: true },
      createNotification('t3', 'm3', 'warning'),
    ];

    it('按类型筛选', () => {
      expect(filterNotifications(notifs, { type: 'info' })).toHaveLength(1);
    });

    it('仅未读筛选', () => {
      expect(filterNotifications(notifs, { unreadOnly: true })).toHaveLength(2);
    });

    it('组合筛选', () => {
      expect(filterNotifications(notifs, { type: 'error', unreadOnly: true })).toHaveLength(0);
    });

    it('无筛选返回全部', () => {
      expect(filterNotifications(notifs, {})).toHaveLength(3);
    });
  });

  describe('标记已读', () => {
    it('全部标记已读', () => {
      const notifs = [createNotification('a', 'b'), createNotification('c', 'd')];
      const result = markAllRead(notifs);
      expect(result.every(n => n.read)).toBe(true);
    });

    it('不修改原数组', () => {
      const notifs = [createNotification('a', 'b')];
      markAllRead(notifs);
      expect(notifs[0].read).toBe(false);
    });
  });

  describe('告警优先级', () => {
    it('涨停=critical', () => {
      expect(getAlertPriority(10, 1e7, 1e6)).toBe('critical');
    });

    it('大幅波动+放量=high', () => {
      expect(getAlertPriority(6, 4e6, 1e6)).toBe('high');
    });

    it('小幅波动=low', () => {
      expect(getAlertPriority(0.5, 1e6, 1e6)).toBe('low');
    });

    it('中等波动=medium', () => {
      expect(getAlertPriority(3, 1.5e6, 1e6)).toBe('medium');
    });

    it('超高成交量=critical', () => {
      expect(getAlertPriority(0, 6e6, 1e6)).toBe('critical');
    });
  });

  describe('告警分组', () => {
    it('按股票代码分组', () => {
      const alerts: Alert[] = [
        { id: '1', type: 'price', symbol: '600519', condition: 'above', value: 10, currentValue: 11, triggered: false, priority: 'medium', createdAt: 1 },
        { id: '2', type: 'volume', symbol: '600519', condition: 'above', value: 1e6, currentValue: 2e6, triggered: false, priority: 'high', createdAt: 2 },
        { id: '3', type: 'price', symbol: '000858', condition: 'below', value: 100, currentValue: 90, triggered: false, priority: 'medium', createdAt: 3 },
      ];
      const groups = groupAlertsBySymbol(alerts);
      expect(groups['600519']).toHaveLength(2);
      expect(groups['000858']).toHaveLength(1);
    });
  });

  describe('通知去重', () => {
    it('窗口内重复去重', () => {
      const now = Date.now();
      const notifs: Notification[] = [
        { id: '1', title: 't', message: 'm', type: 'info', read: false, timestamp: now },
        { id: '2', title: 't', message: 'm', type: 'info', read: false, timestamp: now + 1000 },
      ];
      expect(deduplicateNotifications(notifs, 60000)).toHaveLength(1);
    });

    it('窗口外更新为最新通知', () => {
      const now = Date.now();
      const notifs: Notification[] = [
        { id: '1', title: 't', message: 'm', type: 'info', read: false, timestamp: now },
        { id: '2', title: 't', message: 'm', type: 'info', read: false, timestamp: now + 120000 },
      ];
      // Function keeps latest per key when outside window → returns 1
      const result = deduplicateNotifications(notifs, 60000);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2'); // keeps the latest
    });

    it('不同消息不去重', () => {
      const now = Date.now();
      const notifs: Notification[] = [
        { id: '1', title: 't1', message: 'm1', type: 'info', read: false, timestamp: now },
        { id: '2', title: 't2', message: 'm2', type: 'info', read: false, timestamp: now },
      ];
      expect(deduplicateNotifications(notifs)).toHaveLength(2);
    });
  });

  describe('告警消息生成', () => {
    it('生成可读消息', () => {
      const alert: Alert = { id: '1', type: 'price', symbol: '600519', condition: 'above', value: 1900, currentValue: 1950, triggered: false, priority: 'high', createdAt: 1 };
      const msg = generateAlertMessage(alert);
      expect(msg).toContain('600519');
      expect(msg).toContain('价格');
      expect(msg).toContain('突破');
      expect(msg).toContain('1900');
    });
  });

  describe('通知徽章', () => {
    it('计算未读数', () => {
      const notifs: Notification[] = [
        { ...createNotification('a', 'b'), read: false },
        { ...createNotification('c', 'd'), read: true },
        { ...createNotification('e', 'f'), read: false },
      ];
      const badge = calculateNotificationBadge(notifs);
      expect(badge.total).toBe(2);
    });

    it('按类型统计', () => {
      const notifs: Notification[] = [
        createNotification('a', 'b', 'info'),
        createNotification('c', 'd', 'error'),
        createNotification('e', 'f', 'info'),
      ];
      const badge = calculateNotificationBadge(notifs);
      expect(badge.byType['info']).toBe(2);
      expect(badge.byType['error']).toBe(1);
    });

    it('全部已读徽章为0', () => {
      const notifs = [createNotification('a', 'b')].map(n => ({ ...n, read: true }));
      expect(calculateNotificationBadge(notifs).total).toBe(0);
    });
  });
});
