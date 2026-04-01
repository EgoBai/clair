import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationGroupingEngine } from '../services/notification/groupingEngine';
import { NotificationPayload } from '../services/notification/types';

function makeNotification(overrides: Partial<NotificationPayload> = {}): NotificationPayload {
  return {
    id: `notif_${Date.now()}_${Math.random()}`,
    type: 'price_alert',
    priority: 'medium',
    title: 'Test Notification',
    body: 'Test body',
    channels: ['push'],
    userId: 'user1',
    read: false,
    status: 'pending',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('groupingEngine', () => {
  let engine: NotificationGroupingEngine;

  beforeEach(() => {
    engine = new NotificationGroupingEngine();
  });

  describe('addNotification', () => {
    it('should group by type by default', () => {
      engine.addNotification(makeNotification({ type: 'price_alert' }));
      engine.addNotification(makeNotification({ type: 'price_alert' }));
      engine.addNotification(makeNotification({ type: 'news' }));

      const groups = engine.getAllGroups();
      expect(groups.length).toBe(2);
    });

    it('should increment count on same group', () => {
      engine.addNotification(makeNotification({ type: 'price_alert' }));
      engine.addNotification(makeNotification({ type: 'price_alert' }));

      const groups = engine.getAllGroups();
      const priceGroup = groups.find(g => g.key === 'type:price_alert');
      expect(priceGroup?.count).toBe(2);
    });

    it('should track latest and earliest time', () => {
      const now = Date.now();
      engine.addNotification(makeNotification({ type: 'news', createdAt: now - 1000 }));
      engine.addNotification(makeNotification({ type: 'news', createdAt: now }));

      const group = engine.getGroup('type:news');
      expect(group?.latestAt).toBe(now);
      expect(group?.earliestAt).toBe(now - 1000);
    });

    it('should update priority to highest', () => {
      engine.addNotification(makeNotification({ priority: 'low' }));
      engine.addNotification(makeNotification({ priority: 'urgent' }));

      const groups = engine.getAllGroups();
      expect(groups[0].priority).toBe('urgent');
    });

    it('should auto-collapse when threshold reached', () => {
      const collapseEngine = new NotificationGroupingEngine({ autoCollapseThreshold: 2 });
      collapseEngine.addNotification(makeNotification());
      collapseEngine.addNotification(makeNotification());

      const groups = collapseEngine.getAllGroups();
      expect(groups[0].collapsed).toBe(true);
    });
  });

  describe('addNotifications', () => {
    it('should batch add and return affected groups', () => {
      const notifs = [
        makeNotification({ type: 'price_alert' }),
        makeNotification({ type: 'news' }),
      ];
      const groups = engine.addNotifications(notifs);
      expect(groups.length).toBeGreaterThan(0);
    });
  });

  describe('strategies', () => {
    it('should group by stock', () => {
      const stockEngine = new NotificationGroupingEngine({ strategy: 'by_stock' });
      stockEngine.addNotification(makeNotification({ data: { symbol: '000001' } }));
      stockEngine.addNotification(makeNotification({ data: { symbol: '000001' } }));
      stockEngine.addNotification(makeNotification({ data: { symbol: '600519' } }));

      const groups = stockEngine.getAllGroups();
      expect(groups.length).toBe(2);
    });

    it('should group by priority', () => {
      const prioEngine = new NotificationGroupingEngine({ strategy: 'by_priority' });
      prioEngine.addNotification(makeNotification({ priority: 'high' }));
      prioEngine.addNotification(makeNotification({ priority: 'low' }));

      const groups = prioEngine.getAllGroups();
      expect(groups.length).toBe(2);
    });

    it('should group by time window', () => {
      const timeEngine = new NotificationGroupingEngine({
        strategy: 'by_time_window',
        timeWindowMs: 60000,
      });
      const baseTime = 1700000000000;
      timeEngine.addNotification(makeNotification({ createdAt: baseTime }));
      timeEngine.addNotification(makeNotification({ createdAt: baseTime + 30000 }));
      timeEngine.addNotification(makeNotification({ createdAt: baseTime + 120000 }));

      const groups = timeEngine.getAllGroups();
      expect(groups.length).toBe(2);
    });

    it('should smart group market events by stock', () => {
      const smartEngine = new NotificationGroupingEngine({ strategy: 'smart' });
      smartEngine.addNotification(makeNotification({ type: 'limit_up', data: { symbol: '000001' } }));
      smartEngine.addNotification(makeNotification({ type: 'limit_up', data: { symbol: '600519' } }));
      smartEngine.addNotification(makeNotification({ type: 'news' }));

      const groups = smartEngine.getAllGroups();
      expect(groups.length).toBe(3);
    });
  });

  describe('getAllGroups', () => {
    it('should return empty array when no groups', () => {
      expect(engine.getAllGroups()).toEqual([]);
    });

    it('should sort by latest time', () => {
      const now = Date.now();
      engine.addNotification(makeNotification({ type: 'news', createdAt: now - 1000 }));
      engine.addNotification(makeNotification({ type: 'price_alert', createdAt: now }));

      const groups = engine.getAllGroups();
      expect(groups[0].latestAt).toBeGreaterThanOrEqual(groups[1].latestAt);
    });
  });

  describe('getGroup', () => {
    it('should return group by key', () => {
      engine.addNotification(makeNotification({ type: 'news' }));
      const group = engine.getGroup('type:news');
      expect(group).toBeDefined();
      expect(group?.key).toBe('type:news');
    });

    it('should return undefined for missing key', () => {
      expect(engine.getGroup('nonexistent')).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should return grouping stats', () => {
      engine.addNotification(makeNotification({ type: 'price_alert' }));
      engine.addNotification(makeNotification({ type: 'price_alert' }));
      engine.addNotification(makeNotification({ type: 'news' }));

      const stats = engine.getStats();
      expect(stats.totalGroups).toBe(2);
      expect(stats.totalNotifications).toBe(3);
      expect(stats.avgGroupSize).toBe(1.5);
      expect(stats.largestGroup).toBe(2);
    });
  });

  describe('updateConfig', () => {
    it('should rebuild groups on config change', () => {
      engine.addNotification(makeNotification({ type: 'price_alert', priority: 'high' }));
      engine.addNotification(makeNotification({ type: 'news', priority: 'low' }));

      engine.updateConfig({ strategy: 'by_priority' });

      const groups = engine.getAllGroups();
      expect(groups.some(g => g.key === 'priority:high')).toBe(true);
      expect(groups.some(g => g.key === 'priority:low')).toBe(true);
    });
  });

  describe('toggleCollapse', () => {
    it('should toggle collapse state', () => {
      engine.addNotification(makeNotification());
      const group = engine.getAllGroups()[0];
      expect(group.collapsed).toBe(false);

      engine.toggleCollapse(group.key);
      expect(engine.getGroup(group.key)?.collapsed).toBe(true);

      engine.toggleCollapse(group.key);
      expect(engine.getGroup(group.key)?.collapsed).toBe(false);
    });
  });

  describe('markGroupRead', () => {
    it('should mark group as read', () => {
      engine.addNotification(makeNotification({ read: false }));
      const group = engine.getAllGroups()[0];

      const result = engine.markGroupRead(group.key);
      expect(result).toBe(true);
    });
  });

  describe('markAllRead', () => {
    it('should mark all groups as read', () => {
      engine.addNotification(makeNotification());
      engine.addNotification(makeNotification({ type: 'news' }));

      const count = engine.markAllRead();
      expect(count).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear all groups', () => {
      engine.addNotification(makeNotification());
      engine.clear();
      expect(engine.getAllGroups()).toEqual([]);
    });
  });
});
