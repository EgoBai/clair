import { describe, it, expect } from 'vitest';

// Notification and alerting system tests
describe('Notification & Alerting System', () => {
  // Notification builder
  describe('Notification Builder', () => {
    interface Notification {
      id: string;
      type: 'price' | 'volume' | 'news' | 'system' | 'trade';
      title: string;
      body: string;
      priority: 'low' | 'medium' | 'high' | 'critical';
      read: boolean;
      createdAt: number;
      data?: Record<string, unknown>;
    }

    function buildNotification(
      type: Notification['type'],
      title: string,
      body: string,
      priority: Notification['priority'] = 'medium',
      data?: Record<string, unknown>
    ): Notification {
      return {
        id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        title,
        body,
        priority,
        read: false,
        createdAt: Date.now(),
        data,
      };
    }

    it('should create notification with correct type', () => {
      const n = buildNotification('price', 'Price Alert', '600519 reached 2000');
      expect(n.type).toBe('price');
      expect(n.read).toBe(false);
    });

    it('should default to medium priority', () => {
      const n = buildNotification('system', 'Test', 'Body');
      expect(n.priority).toBe('medium');
    });

    it('should support critical priority', () => {
      const n = buildNotification('trade', 'Stop Loss', 'Triggered', 'critical');
      expect(n.priority).toBe('critical');
    });

    it('should include optional data', () => {
      const n = buildNotification('price', 'Alert', 'Body', 'high', { symbol: '600519', price: 2000 });
      expect(n.data?.symbol).toBe('600519');
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(buildNotification('system', 'T', 'B').id);
      }
      expect(ids.size).toBe(100);
    });
  });

  // Alert condition evaluator
  describe('Alert Condition Evaluator', () => {
    type Condition = {
      field: string;
      operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'crosses_above' | 'crosses_below';
      value: number;
      prevValue?: number;
    };

    function evaluateCondition(condition: Condition, currentValue: number): boolean {
      switch (condition.operator) {
        case 'gt': return currentValue > condition.value;
        case 'lt': return currentValue < condition.value;
        case 'gte': return currentValue >= condition.value;
        case 'lte': return currentValue <= condition.value;
        case 'eq': return Math.abs(currentValue - condition.value) < 0.0001;
        case 'crosses_above':
          return condition.prevValue !== undefined &&
                 condition.prevValue <= condition.value &&
                 currentValue > condition.value;
        case 'crosses_below':
          return condition.prevValue !== undefined &&
                 condition.prevValue >= condition.value &&
                 currentValue < condition.value;
        default: return false;
      }
    }

    it('should evaluate gt', () => {
      expect(evaluateCondition({ field: 'price', operator: 'gt', value: 100 }, 101)).toBe(true);
      expect(evaluateCondition({ field: 'price', operator: 'gt', value: 100 }, 99)).toBe(false);
      expect(evaluateCondition({ field: 'price', operator: 'gt', value: 100 }, 100)).toBe(false);
    });

    it('should evaluate lt', () => {
      expect(evaluateCondition({ field: 'price', operator: 'lt', value: 100 }, 99)).toBe(true);
      expect(evaluateCondition({ field: 'price', operator: 'lt', value: 100 }, 101)).toBe(false);
    });

    it('should evaluate gte', () => {
      expect(evaluateCondition({ field: 'price', operator: 'gte', value: 100 }, 100)).toBe(true);
    });

    it('should evaluate lte', () => {
      expect(evaluateCondition({ field: 'price', operator: 'lte', value: 100 }, 100)).toBe(true);
    });

    it('should evaluate eq with tolerance', () => {
      expect(evaluateCondition({ field: 'price', operator: 'eq', value: 100 }, 100.00001)).toBe(true);
    });

    it('should evaluate crosses_above', () => {
      const cond: Condition = { field: 'price', operator: 'crosses_above', value: 100, prevValue: 99 };
      expect(evaluateCondition(cond, 101)).toBe(true);
      expect(evaluateCondition(cond, 99)).toBe(false);
    });

    it('should evaluate crosses_below', () => {
      const cond: Condition = { field: 'price', operator: 'crosses_below', value: 100, prevValue: 101 };
      expect(evaluateCondition(cond, 99)).toBe(true);
      expect(evaluateCondition({ ...cond, prevValue: 99 }, 98)).toBe(false);
    });

    it('should not trigger crosses_above without crossing', () => {
      const cond: Condition = { field: 'price', operator: 'crosses_above', value: 100, prevValue: 101 };
      expect(evaluateCondition(cond, 102)).toBe(false); // was already above
    });
  });

  // Notification grouping
  describe('Notification Grouping', () => {
    interface Notification {
      type: string;
      symbol?: string;
      createdAt: number;
    }

    function groupNotifications(notifications: Notification[]): Map<string, Notification[]> {
      const groups = new Map<string, Notification[]>();
      for (const n of notifications) {
        const key = n.symbol ? `${n.type}:${n.symbol}` : n.type;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(n);
      }
      return groups;
    }

    it('should group by type', () => {
      const notifs: Notification[] = [
        { type: 'price', createdAt: 1 },
        { type: 'price', createdAt: 2 },
        { type: 'volume', createdAt: 3 },
      ];
      const groups = groupNotifications(notifs);
      expect(groups.get('price')).toHaveLength(2);
      expect(groups.get('volume')).toHaveLength(1);
    });

    it('should group by type and symbol', () => {
      const notifs: Notification[] = [
        { type: 'price', symbol: '600519', createdAt: 1 },
        { type: 'price', symbol: '000001', createdAt: 2 },
      ];
      const groups = groupNotifications(notifs);
      expect(groups.size).toBe(2);
    });

    it('should handle empty notifications', () => {
      expect(groupNotifications([]).size).toBe(0);
    });
  });

  // Rate limiting for notifications
  describe('Notification Rate Limiting', () => {
    class NotificationThrottler {
      private lastSent = new Map<string, number>();

      constructor(private minIntervalMs: number) {}

      shouldSend(key: string, now: number): boolean {
        const last = this.lastSent.get(key);
        if (last === undefined || now - last >= this.minIntervalMs) {
          this.lastSent.set(key, now);
          return true;
        }
        return false;
      }
    }

    it('should allow first notification', () => {
      const t = new NotificationThrottler(60000);
      expect(t.shouldSend('price:600519', 1000)).toBe(true);
    });

    it('should throttle rapid notifications', () => {
      const t = new NotificationThrottler(60000);
      t.shouldSend('price:600519', 1000);
      expect(t.shouldSend('price:600519', 2000)).toBe(false);
    });

    it('should allow after interval', () => {
      const t = new NotificationThrottler(60000);
      t.shouldSend('price:600519', 1000);
      expect(t.shouldSend('price:600519', 61000)).toBe(true);
    });

    it('should track different keys independently', () => {
      const t = new NotificationThrottler(60000);
      t.shouldSend('price:600519', 1000);
      expect(t.shouldSend('price:000001', 2000)).toBe(true);
    });
  });

  // Notification channel routing
  describe('Channel Routing', () => {
    type Channel = 'email' | 'push' | 'sms' | 'in-app';

    function routeByPriority(priority: string): Channel[] {
      switch (priority) {
        case 'critical': return ['push', 'sms', 'in-app'];
        case 'high': return ['push', 'in-app'];
        case 'medium': return ['in-app'];
        case 'low': return ['in-app'];
        default: return ['in-app'];
      }
    }

    it('should route critical to all channels', () => {
      const channels = routeByPriority('critical');
      expect(channels).toContain('push');
      expect(channels).toContain('sms');
      expect(channels).toContain('in-app');
    });

    it('should route low priority to in-app only', () => {
      expect(routeByPriority('low')).toEqual(['in-app']);
    });

    it('should route high to push and in-app', () => {
      const channels = routeByPriority('high');
      expect(channels).toContain('push');
      expect(channels).toContain('in-app');
      expect(channels).not.toContain('sms');
    });

    it('should default to in-app', () => {
      expect(routeByPriority('unknown')).toEqual(['in-app']);
    });
  });
});
