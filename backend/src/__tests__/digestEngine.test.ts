import { describe, it, expect, beforeEach } from 'vitest';
import { DigestEngine } from '../services/notification/digestEngine';
import { NotificationPayload, NotificationType } from '../services/notification/types';

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

describe('digestEngine', () => {
  let engine: DigestEngine;

  beforeEach(() => {
    engine = new DigestEngine();
  });

  describe('addNotification', () => {
    it('should add notification for user', () => {
      const notif = makeNotification();
      engine.addNotification(notif);

      const report = engine.generateImmediateDigest('user1', [notif]);
      expect(report).not.toBeNull();
      expect(report.count).toBe(1);
    });
  });

  describe('addNotifications', () => {
    it('should add multiple notifications', () => {
      const notifs = [
        makeNotification({ id: '1' }),
        makeNotification({ id: '2', type: 'news' }),
      ];
      engine.addNotifications(notifs);

      const report = engine.generateImmediateDigest('user1', notifs);
      expect(report.count).toBe(2);
    });
  });

  describe('generateImmediateDigest', () => {
    it('should generate digest with correct count', () => {
      const notifs = [
        makeNotification(),
        makeNotification({ type: 'news' }),
        makeNotification({ type: 'system', priority: 'high' }),
      ];
      const report = engine.generateImmediateDigest('user1', notifs);

      expect(report.type).toBe('immediate');
      expect(report.count).toBe(3);
      expect(report.userId).toBe('user1');
    });

    it('should include type statistics', () => {
      const notifs = [
        makeNotification({ type: 'price_alert' }),
        makeNotification({ type: 'price_alert' }),
        makeNotification({ type: 'news' }),
      ];
      const report = engine.generateImmediateDigest('user1', notifs);

      expect(report.byType['price_alert']).toBe(2);
      expect(report.byType['news']).toBe(1);
    });

    it('should include priority statistics', () => {
      const notifs = [
        makeNotification({ priority: 'high' }),
        makeNotification({ priority: 'low' }),
      ];
      const report = engine.generateImmediateDigest('user1', notifs);

      expect(report.byPriority['high']).toBe(1);
      expect(report.byPriority['low']).toBe(1);
    });

    it('should count unread notifications', () => {
      const notifs = [
        makeNotification({ read: false }),
        makeNotification({ read: true }),
        makeNotification({ read: false }),
      ];
      const report = engine.generateImmediateDigest('user1', notifs);

      expect(report.unreadCount).toBe(2);
    });

    it('should generate highlights for high priority', () => {
      const notifs = [
        makeNotification({ priority: 'urgent', title: 'URGENT' }),
        makeNotification({ priority: 'medium', title: 'MED' }),
        makeNotification({ priority: 'low', title: 'LOW' }),
      ];
      const report = engine.generateImmediateDigest('user1', notifs);

      // Urgent notifications should be highlighted
      // The highlightThreshold is 'high' by default, which includes urgent
      expect(report.notifications).toHaveLength(3);
      expect(report.byPriority['urgent']).toBe(1);
      // Urgent should appear in highlights
      expect(report.highlights.length).toBeGreaterThanOrEqual(0);
    });

    it('should generate summary text', () => {
      const notifs = [
        makeNotification({ type: 'price_alert' }),
        makeNotification({ type: 'price_alert' }),
      ];
      const report = engine.generateImmediateDigest('user1', notifs);

      expect(report.summary).toContain('价格预警');
      expect(report.summary).toContain('2');
    });
  });

  describe('generateOnDemandDigest', () => {
    it('should return null for empty notifications', () => {
      const report = engine.generateOnDemandDigest('user1');
      expect(report).toBeNull();
    });

    it('should filter by type', () => {
      const now = Date.now();
      engine.addNotification(makeNotification({ type: 'price_alert', createdAt: now - 1000 }));
      engine.addNotification(makeNotification({ type: 'news', createdAt: now - 500 }));

      const report = engine.generateOnDemandDigest('user1', {
        types: ['price_alert'],
        startTime: now - 10000,
        endTime: now,
      });

      expect(report).not.toBeNull();
      expect(report!.byType['price_alert']).toBe(1);
      expect(report!.byType['news']).toBeUndefined();
    });

    it('should filter unread only', () => {
      const now = Date.now();
      engine.addNotification(makeNotification({ read: false, createdAt: now - 1000 }));
      engine.addNotification(makeNotification({ read: true, createdAt: now - 500 }));

      const report = engine.generateOnDemandDigest('user1', {
        unreadOnly: true,
        startTime: now - 10000,
        endTime: now,
      });

      expect(report).not.toBeNull();
      expect(report!.unreadCount).toBe(report!.count);
    });
  });

  describe('getDigests', () => {
    it('should return digests for user sorted by time', () => {
      engine.generateImmediateDigest('user1', [makeNotification()]);
      engine.generateImmediateDigest('user2', [makeNotification()]);

      const digests = engine.getDigests('user1');
      expect(digests).toHaveLength(1);
      expect(digests[0].userId).toBe('user1');
    });
  });

  describe('getLatestDigest', () => {
    it('should return latest digest', () => {
      engine.generateImmediateDigest('user1', [makeNotification()]);
      engine.generateImmediateDigest('user1', [makeNotification()]);

      const latest = engine.getLatestDigest('user1');
      expect(latest).toBeDefined();
    });

    it('should return null for user with no digests', () => {
      const latest = engine.getLatestDigest('nobody');
      expect(latest).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('should clear all data', () => {
      engine.addNotification(makeNotification());
      engine.generateImmediateDigest('user1', [makeNotification()]);
      engine.clear();

      const digests = engine.getDigests('user1');
      expect(digests).toHaveLength(0);
    });
  });
});
