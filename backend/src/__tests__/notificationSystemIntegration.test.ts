/**
 * 通知系统综合集成测试
 * 测试通知服务、渠道、模板、分组、限频、路由器的协同工作
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationService } from '../services/notification/service';
import { WebSocketChannelHandler, EmailChannelHandler, InAppChannelHandler } from '../services/notification/channels';
import { NotificationGroupingEngine } from '../services/notification/groupingEngine';
import { RateLimitEngine } from '../services/notification/rateLimitEngine';
import { NotificationRouter } from '../services/notification/priorityRouter';
import { DigestEngine } from '../services/notification/digestEngine';
import { TemplateFormatter } from '../services/notification/templateFormatter';
import type { NotificationPayload, NotificationType, NotificationPriority } from '../services/notification/types';

function createNotif(overrides: Partial<NotificationPayload> = {}): NotificationPayload {
  return {
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    type: 'price_alert',
    priority: 'medium',
    title: 'Test',
    body: 'Body',
    channels: ['in_app'],
    userId: 'user_001',
    read: false,
    status: 'pending',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('Notification System Integration', () => {
  let service: NotificationService;
  let wsHandler: WebSocketChannelHandler;
  let emailHandler: EmailChannelHandler;
  let inAppHandler: InAppChannelHandler;
  let grouper: NotificationGroupingEngine;
  let rateLimiter: RateLimitEngine;
  let router: NotificationRouter;
  let digest: DigestEngine;
  let formatter: TemplateFormatter;

  beforeEach(() => {
    service = new NotificationService();
    wsHandler = new WebSocketChannelHandler();
    emailHandler = new EmailChannelHandler();
    inAppHandler = new InAppChannelHandler();
    grouper = new NotificationGroupingEngine({ autoCollapseThreshold: 10 });
    rateLimiter = new RateLimitEngine({ enabled: false });
    router = new NotificationRouter();
    digest = new DigestEngine();
    formatter = new TemplateFormatter();

    service.registerChannelHandler(wsHandler);
    service.registerChannelHandler(emailHandler);
    service.registerChannelHandler(inAppHandler);
  });

  describe('End-to-End Notification Flow', () => {
    it('should create, route, group, and digest notifications', () => {
      // Create notifications
      const n1 = service.createNotification('user_001', 'price_alert', '茅台突破1800', '价格已突破预警线', {
        priority: 'high',
        channels: ['in_app', 'email'],
      });
      const n2 = service.createNotification('user_001', 'price_alert', '茅台回调', '价格回落到1780', {
        priority: 'medium',
        channels: ['in_app'],
      });
      const n3 = service.createNotification('user_001', 'news', '市场新闻', '重大消息', {
        priority: 'low',
        channels: ['in_app'],
      });

      expect(n1).not.toBeNull();
      expect(n2).not.toBeNull();
      expect(n3).not.toBeNull();

      // Route
      const r1 = router.route(n1!);
      expect(r1.channels.length).toBeGreaterThan(0);

      // Group
      grouper.addNotification(n1!);
      grouper.addNotification(n2!);
      grouper.addNotification(n3!);
      const groups = grouper.getAllGroups();
      expect(groups.length).toBeGreaterThan(0);

      // Digest
      digest.addNotification(n1!);
      digest.addNotification(n2!);
      digest.addNotification(n3!);
      const dailyDigest = digest.generateDailyDigest('user_001');
      expect(dailyDigest).not.toBeNull();
      expect(dailyDigest!.count).toBe(3);
    });

    it('should respect rate limiting', () => {
      rateLimiter.addRule({
        level: 'user', target: 'user_001',
        maxPerMinute: 2, maxPerHour: 10, maxPerDay: 50,
        exemptPriorities: [], adaptiveEnabled: false,
        burstAllowance: 0, burstWindowMs: 0,
      });

      expect(rateLimiter.check('user_001', 'price_alert', 'medium').allowed).toBe(true);
      expect(rateLimiter.check('user_001', 'price_alert', 'medium').allowed).toBe(true);
      expect(rateLimiter.check('user_001', 'price_alert', 'medium').allowed).toBe(false);

      // urgent should still work if exempted
      rateLimiter.clear();
      rateLimiter.addRule({
        level: 'user', target: 'user_001',
        maxPerMinute: 1, maxPerHour: 1, maxPerDay: 1,
        exemptPriorities: ['urgent'], adaptiveEnabled: false,
        burstAllowance: 0, burstWindowMs: 0,
      });

      rateLimiter.check('user_001', 'price_alert', 'medium');
      expect(rateLimiter.check('user_001', 'price_alert', 'medium').allowed).toBe(false);
      expect(rateLimiter.check('user_001', 'price_alert', 'urgent').allowed).toBe(true);
    });

    it('should route with priority escalation', () => {
      const urgentNotif = createNotif({ priority: 'urgent', type: 'trade' });
      const result = router.route(urgentNotif);

      expect(result.channels).toContain('websocket');
      expect(result.channels).toContain('push');
      expect(result.channels).toContain('email');
      expect(result.channels).toContain('sms');
    });

    it('should format template variables for email', () => {
      const template = '{{stockName}} 涨跌幅: {{change | percent}}, 成交额: {{turnover | chineseUnit}}';
      const result = formatter.render(template, {
        stockName: '贵州茅台',
        change: 3.5,
        turnover: 500000000,
      });

      expect(result).toContain('贵州茅台');
      expect(result).toContain('+3.50%');
      expect(result).toContain('5.00亿');
    });

    it('should group by type and by stock', () => {
      // By type
      grouper.addNotification(createNotif({ type: 'price_alert', data: { symbol: '600519' } }));
      grouper.addNotification(createNotif({ type: 'price_alert', data: { symbol: '300750' } }));
      grouper.addNotification(createNotif({ type: 'news' }));

      expect(grouper.getAllGroups()).toHaveLength(2);

      // Switch to by stock
      grouper.updateConfig({ strategy: 'by_stock' });
      expect(grouper.getAllGroups()).toHaveLength(3);
    });

    it('should track channel delivery status', () => {
      const notif = createNotif({ channels: ['in_app'] });
      const result = inAppHandler.getUserNotifications('user_001');
      expect(result).toHaveLength(0);

      service.createNotification('user_001', 'system', 'Test', 'Body', { channels: ['in_app'] });
      const after = inAppHandler.getUserNotifications('user_001');
      expect(after.length).toBeGreaterThanOrEqual(1);
    });

    it('should generate digest with highlights', () => {
      const notifs = [
        createNotif({ userId: 'u1', type: 'limit_up', priority: 'high', title: 'maotai_limit_up', createdAt: Date.now() }),
        createNotif({ userId: 'u1', type: 'news', priority: 'low', title: 'normal_news', createdAt: Date.now() }),
        createNotif({ userId: 'u1', type: 'price_alert', priority: 'high', title: 'ningde_breakout', createdAt: Date.now() }),
      ];

      notifs.forEach(n => digest.addNotification(n));
      const d = digest.generateDailyDigest('u1');

      expect(d).not.toBeNull();
      expect(d!.highlights).toContain('maotai_limit_up');
      expect(d!.highlights).toContain('ningde_breakout');
      expect(d!.highlights).not.toContain('normal_news');
    });

    it('should handle batch notifications across multiple users', () => {
      const userIds = ['user_001', 'user_002', 'user_003'];
      const notifs = service.batchCreate({
        userIds,
        type: 'system',
        title: '系统维护通知',
        body: '系统将于今晚23:00进行维护',
        channels: ['in_app'],
        priority: 'medium',
      });

      expect(notifs).toHaveLength(3);
      expect(notifs.every(n => n.title === '系统维护通知')).toBe(true);
    });

    it('should handle complete notification lifecycle', () => {
      // 1. Create
      const notif = service.createNotification('user_001', 'price_alert', 'Alert', 'Price hit target', {
        priority: 'high',
        channels: ['in_app'],
      });
      expect(notif).not.toBeNull();

      // 2. Get stats
      const stats = service.getStats('user_001');
      expect(stats.total).toBe(1);
      expect(stats.unread).toBe(1);

      // 3. Mark as read
      service.markAsRead(notif!.id);
      expect(service.getUnreadCount('user_001')).toBe(0);

      // 4. Delete
      service.deleteNotification(notif!.id);
      expect(service.getStats('user_001').total).toBe(0);
    });
  });
});
