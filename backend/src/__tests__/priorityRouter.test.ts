import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationRouter } from '../services/notification/priorityRouter';
import { NotificationPayload, NotificationType, NotificationPriority, NotificationChannel } from '../services/notification/types';

function makeNotification(overrides: Partial<NotificationPayload> = {}): NotificationPayload {
  return {
    id: `notif_${Date.now()}_${Math.random()}`,
    type: 'price_alert',
    priority: 'medium',
    title: 'Test',
    body: 'Test body',
    channels: ['push'],
    userId: 'user1',
    read: false,
    status: 'pending',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('priorityRouter', () => {
  let router: NotificationRouter;

  beforeEach(() => {
    router = new NotificationRouter();
  });

  describe('route', () => {
    it('should route urgent notifications to all channels', () => {
      const notif = makeNotification({ priority: 'urgent' });
      const result = router.route(notif);

      expect(result.channels).toContain('websocket');
      expect(result.channels).toContain('push');
      expect(result.channels).toContain('email');
      expect(result.channels).toContain('sms');
    });

    it('should route high priority to websocket/push/in_app', () => {
      const notif = makeNotification({ priority: 'high' });
      const result = router.route(notif);

      expect(result.channels).toContain('websocket');
      expect(result.channels).toContain('push');
      expect(result.channels).toContain('in_app');
    });

    it('should route trade notifications to multiple channels', () => {
      const notif = makeNotification({ type: 'trade' });
      const result = router.route(notif);

      expect(result.channels).toContain('websocket');
      expect(result.channels).toContain('push');
      expect(result.channels).toContain('in_app');
      expect(result.channels).toContain('email');
    });

    it('should route market events to websocket/in_app', () => {
      const notif = makeNotification({ type: 'limit_up' });
      const result = router.route(notif);

      expect(result.channels).toContain('websocket');
      expect(result.channels).toContain('in_app');
    });

    it('should route price alerts', () => {
      const notif = makeNotification({ type: 'price_alert' });
      const result = router.route(notif);

      expect(result.channels).toContain('websocket');
      expect(result.channels).toContain('push');
    });

    it('should route news to in_app only by default', () => {
      const notif = makeNotification({ type: 'news', priority: 'low' });
      const result = router.route(notif);

      expect(result.channels).toContain('in_app');
    });

    it('should include notification in result', () => {
      const notif = makeNotification();
      const result = router.route(notif);

      expect(result.notification).toBe(notif);
    });

    it('should track if delayed', () => {
      const notif = makeNotification({ priority: 'low' });
      const result = router.route(notif);

      expect(result.delayed).toBe(false);
    });

    it('should track if escalated', () => {
      const notif = makeNotification({ priority: 'medium' });
      const result = router.route(notif);

      expect(result.escalated).toBe(false);
    });
  });

  describe('routeBatch', () => {
    it('should route multiple notifications', () => {
      const notifs = [
        makeNotification({ priority: 'urgent' }),
        makeNotification({ priority: 'low' }),
      ];
      const results = router.routeBatch(notifs);

      expect(results).toHaveLength(2);
      expect(results[0].channels.length).toBeGreaterThan(results[1].channels.length);
    });
  });

  describe('custom rules', () => {
    it('should use custom rules', () => {
      const customRouter = new NotificationRouter([
        {
          id: 'custom',
          name: 'Custom Rule',
          enabled: true,
          types: ['price_alert'],
          channels: ['sms'],
        },
        {
          id: 'default',
          name: 'Default',
          enabled: true,
          channels: ['in_app'],
        },
      ]);

      const notif = makeNotification({ type: 'price_alert' });
      const result = customRouter.route(notif);

      expect(result.channels).toContain('sms');
    });
  });

  describe('getStats', () => {
    it('should track routing stats', () => {
      router.route(makeNotification({ priority: 'urgent' }));
      router.route(makeNotification({ priority: 'low' }));

      const stats = router.getStats();
      expect(stats.totalRouted).toBe(2);
    });

    it('should track by channel', () => {
      router.route(makeNotification({ priority: 'urgent' }));

      const stats = router.getStats();
      expect(stats.byChannel['websocket']).toBeGreaterThan(0);
    });
  });

  describe('addRule', () => {
    it('should add a routing rule', () => {
      const customRouter = new NotificationRouter([]);
      customRouter.addRule({
        id: 'custom_system',
        name: 'Custom System',
        enabled: true,
        types: ['system'],
        channels: ['email'],
      });
      customRouter.addRule({
        id: 'default',
        name: 'Default',
        enabled: true,
        channels: ['in_app'],
      });

      const notif = makeNotification({ type: 'system' });
      const result = customRouter.route(notif);
      expect(result.channels).toContain('email');
    });

    it('should return all rules via getAllRules', () => {
      const before = router.getAllRules().length;
      router.addRule({ id: 'new', name: 'New', enabled: true, channels: ['sms'] });
      expect(router.getAllRules().length).toBe(before + 1);
    });
  });

  describe('removeRule', () => {
    it('should remove a routing rule', () => {
      router.removeRule('urgent_all_channels');

      const notif = makeNotification({ priority: 'urgent', type: 'limit_up' });
      const result = router.route(notif);
      // Should fall to next matching rule
      expect(result.channels.length).toBeLessThan(5);
    });

    it('should return false for nonexistent rule', () => {
      expect(router.removeRule('nonexistent')).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should track routing stats after multiple routes', () => {
      router.route(makeNotification());
      router.route(makeNotification({ type: 'news' }));

      const stats = router.getStats();
      expect(stats.totalRouted).toBe(2);
    });
  });
});
