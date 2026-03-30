import { describe, it, expect, vi, beforeEach } from 'vitest';

// 通知引擎
interface Notification {
  id: string;
  type: 'price_alert' | 'volume_alert' | 'news' | 'system' | 'trade';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  data?: Record<string, any>;
}

interface AlertRule {
  id: string;
  symbol: string;
  condition: 'above' | 'below' | 'cross_up' | 'cross_down' | 'change_pct';
  value: number;
  enabled: boolean;
  triggered: boolean;
  triggeredAt: number | null;
  repeatable: boolean;
}

class NotificationEngine {
  private notifications: Notification[] = [];
  private alertRules: AlertRule[] = [];
  private listeners: Map<string, ((n: Notification) => void)[]> = new Map();

  addNotification(n: Omit<Notification, 'id' | 'timestamp' | 'read'>): Notification {
    const notification: Notification = {
      ...n,
      id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      read: false,
    };
    this.notifications.unshift(notification);
    this.notify('new', notification);
    return notification;
  }

  markRead(id: string): boolean {
    const n = this.notifications.find(n => n.id === id);
    if (n) { n.read = true; return true; }
    return false;
  }

  markAllRead(): number {
    let count = 0;
    for (const n of this.notifications) {
      if (!n.read) { n.read = true; count++; }
    }
    return count;
  }

  getUnread(): Notification[] {
    return this.notifications.filter(n => !n.read);
  }

  getUnreadCount(): number {
    return this.getUnread().length;
  }

  getByType(type: Notification['type']): Notification[] {
    return this.notifications.filter(n => n.type === type);
  }

  getByPriority(priority: Notification['priority']): Notification[] {
    return this.notifications.filter(n => n.priority === priority);
  }

  remove(id: string): boolean {
    const idx = this.notifications.findIndex(n => n.id === id);
    if (idx >= 0) { this.notifications.splice(idx, 1); return true; }
    return false;
  }

  clear(): number {
    const count = this.notifications.length;
    this.notifications = [];
    return count;
  }

  clearByType(type: Notification['type']): number {
    const before = this.notifications.length;
    this.notifications = this.notifications.filter(n => n.type !== type);
    return before - this.notifications.length;
  }

  getRecent(count: number = 10): Notification[] {
    return this.notifications.slice(0, count);
  }

  addAlertRule(rule: Omit<AlertRule, 'id' | 'triggered' | 'triggeredAt'>): AlertRule {
    const alertRule: AlertRule = {
      ...rule,
      id: `alert_${Date.now()}`,
      triggered: false,
      triggeredAt: null,
    };
    this.alertRules.push(alertRule);
    return alertRule;
  }

  checkAlerts(currentPrices: Record<string, number>): Notification[] {
    const triggered: Notification[] = [];
    for (const rule of this.alertRules) {
      if (!rule.enabled || (rule.triggered && !rule.repeatable)) continue;
      const price = currentPrices[rule.symbol];
      if (price === undefined) continue;

      let hit = false;
      switch (rule.condition) {
        case 'above': hit = price >= rule.value; break;
        case 'below': hit = price <= rule.value; break;
        case 'cross_up': hit = price >= rule.value; break;
        case 'cross_down': hit = price <= rule.value; break;
      }

      if (hit) {
        rule.triggered = true;
        rule.triggeredAt = Date.now();
        const n = this.addNotification({
          type: 'price_alert',
          title: `价格提醒: ${rule.symbol}`,
          message: `${rule.symbol} ${rule.condition === 'above' ? '突破' : '跌破'} ${rule.value}`,
          priority: 'high',
          data: { symbol: rule.symbol, price, rule: rule.condition },
        });
        triggered.push(n);
      }
    }
    return triggered;
  }

  removeAlertRule(id: string): boolean {
    const idx = this.alertRules.findIndex(r => r.id === id);
    if (idx >= 0) { this.alertRules.splice(idx, 1); return true; }
    return false;
  }

  getAlertRules(): AlertRule[] {
    return [...this.alertRules];
  }

  on(event: string, callback: (n: Notification) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: (n: Notification) => void): void {
    const list = this.listeners.get(event);
    if (list) {
      const idx = list.indexOf(callback);
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  private notify(event: string, notification: Notification): void {
    const list = this.listeners.get(event) || [];
    for (const cb of list) cb(notification);
  }

  getStats(): { total: number; unread: number; byType: Record<string, number>; byPriority: Record<string, number> } {
    const byType: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    for (const n of this.notifications) {
      byType[n.type] = (byType[n.type] || 0) + 1;
      byPriority[n.priority] = (byPriority[n.priority] || 0) + 1;
    }
    return { total: this.notifications.length, unread: this.getUnreadCount(), byType, byPriority };
  }
}

describe('通知引擎', () => {
  let engine: NotificationEngine;

  beforeEach(() => {
    engine = new NotificationEngine();
  });

  describe('通知管理', () => {
    it('应该添加通知', () => {
      const n = engine.addNotification({ type: 'system', title: '测试', message: '消息', priority: 'medium' });
      expect(n.id).toBeTruthy();
      expect(n.read).toBe(false);
    });

    it('应该标记已读', () => {
      const n = engine.addNotification({ type: 'system', title: '测试', message: '消息', priority: 'medium' });
      expect(engine.markRead(n.id)).toBe(true);
      expect(engine.getUnreadCount()).toBe(0);
    });

    it('应该批量标记已读', () => {
      engine.addNotification({ type: 'system', title: '1', message: '1', priority: 'low' });
      engine.addNotification({ type: 'system', title: '2', message: '2', priority: 'low' });
      expect(engine.markAllRead()).toBe(2);
      expect(engine.getUnreadCount()).toBe(0);
    });

    it('应该按类型筛选', () => {
      engine.addNotification({ type: 'price_alert', title: '1', message: '1', priority: 'high' });
      engine.addNotification({ type: 'news', title: '2', message: '2', priority: 'low' });
      expect(engine.getByType('price_alert')).toHaveLength(1);
      expect(engine.getByType('news')).toHaveLength(1);
    });

    it('应该按优先级筛选', () => {
      engine.addNotification({ type: 'system', title: '1', message: '1', priority: 'critical' });
      engine.addNotification({ type: 'system', title: '2', message: '2', priority: 'low' });
      expect(engine.getByPriority('critical')).toHaveLength(1);
    });

    it('应该删除通知', () => {
      const n = engine.addNotification({ type: 'system', title: '1', message: '1', priority: 'low' });
      expect(engine.remove(n.id)).toBe(true);
      expect(engine.remove(n.id)).toBe(false);
    });

    it('应该清空所有通知', () => {
      engine.addNotification({ type: 'system', title: '1', message: '1', priority: 'low' });
      engine.addNotification({ type: 'system', title: '2', message: '2', priority: 'low' });
      expect(engine.clear()).toBe(2);
    });

    it('应该按类型清空', () => {
      engine.addNotification({ type: 'price_alert', title: '1', message: '1', priority: 'high' });
      engine.addNotification({ type: 'news', title: '2', message: '2', priority: 'low' });
      expect(engine.clearByType('price_alert')).toBe(1);
    });

    it('应该获取最近的通知', () => {
      for (let i = 0; i < 15; i++) {
        engine.addNotification({ type: 'system', title: `${i}`, message: `${i}`, priority: 'low' });
      }
      expect(engine.getRecent(5)).toHaveLength(5);
    });
  });

  describe('价格提醒', () => {
    it('应该添加提醒规则', () => {
      const rule = engine.addAlertRule({ symbol: '600519', condition: 'above', value: 1800, enabled: true, repeatable: false });
      expect(rule.id).toBeTruthy();
      expect(rule.triggered).toBe(false);
    });

    it('应该触发价格提醒', () => {
      engine.addAlertRule({ symbol: '600519', condition: 'above', value: 1800, enabled: true, repeatable: false });
      const triggered = engine.checkAlerts({ '600519': 1850 });
      expect(triggered.length).toBe(1);
    });

    it('不应该触发未达条件的提醒', () => {
      engine.addAlertRule({ symbol: '600519', condition: 'above', value: 1800, enabled: true, repeatable: false });
      const triggered = engine.checkAlerts({ '600519': 1750 });
      expect(triggered.length).toBe(0);
    });

    it('非重复提醒只触发一次', () => {
      engine.addAlertRule({ symbol: '600519', condition: 'above', value: 1800, enabled: true, repeatable: false });
      engine.checkAlerts({ '600519': 1850 });
      const triggered = engine.checkAlerts({ '600519': 1900 });
      expect(triggered.length).toBe(0);
    });

    it('重复提醒可以多次触发', () => {
      engine.addAlertRule({ symbol: '600519', condition: 'above', value: 1800, enabled: true, repeatable: true });
      engine.checkAlerts({ '600519': 1850 });
      const triggered = engine.checkAlerts({ '600519': 1900 });
      expect(triggered.length).toBe(1);
    });

    it('禁用的规则不应该触发', () => {
      engine.addAlertRule({ symbol: '600519', condition: 'above', value: 1800, enabled: false, repeatable: false });
      expect(engine.checkAlerts({ '600519': 1850 }).length).toBe(0);
    });

    it('应该删除提醒规则', () => {
      const rule = engine.addAlertRule({ symbol: '600519', condition: 'above', value: 1800, enabled: true, repeatable: false });
      expect(engine.removeAlertRule(rule.id)).toBe(true);
      expect(engine.getAlertRules()).toHaveLength(0);
    });

    it('跌破条件应该触发', () => {
      engine.addAlertRule({ symbol: '600519', condition: 'below', value: 1700, enabled: true, repeatable: false });
      const triggered = engine.checkAlerts({ '600519': 1650 });
      expect(triggered.length).toBe(1);
    });
  });

  describe('事件监听', () => {
    it('应该触发new事件', () => {
      const handler = vi.fn();
      engine.on('new', handler);
      engine.addNotification({ type: 'system', title: '测试', message: '消息', priority: 'medium' });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('应该取消监听', () => {
      const handler = vi.fn();
      engine.on('new', handler);
      engine.off('new', handler);
      engine.addNotification({ type: 'system', title: '测试', message: '消息', priority: 'medium' });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('统计', () => {
    it('应该提供统计信息', () => {
      engine.addNotification({ type: 'price_alert', title: '1', message: '1', priority: 'high' });
      engine.addNotification({ type: 'news', title: '2', message: '2', priority: 'low' });
      const stats = engine.getStats();
      expect(stats.total).toBe(2);
      expect(stats.unread).toBe(2);
      expect(stats.byType['price_alert']).toBe(1);
      expect(stats.byPriority['high']).toBe(1);
    });
  });
});
