/**
 * 通知核心服务测试
 *
 * 影子测试治理批次 2：直接测试 backend/src/services/notification/service.ts
 * 的真实 NotificationService，不再在测试文件内抄一份实现。
 * 模板通过真实单例 templateManager 注册。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationService } from '../services/notification/service';
import { templateManager } from '../services/notification/templates';
import type { NotificationPreferences } from '../services/notification/types';

/** 测试夹具：构造一份完整的用户偏好（仅作为 setUserPreferences 的输入数据） */
function makePreferences(
  userId: string,
  overrides: Partial<NotificationPreferences> = {}
): NotificationPreferences {
  return {
    userId,
    globalEnabled: true,
    pushEnabled: true,
    emailEnabled: false,
    smsEnabled: false,
    subscriptions: [],
    quietHoursEnabled: false,
    quietHoursStart: '23:00',
    quietHoursEnd: '07:00',
    dailyDigest: false,
    maxDailyNotifications: 100,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    // 每个用例使用全新实例，避免单例状态串场
    service = new NotificationService();
  });

  describe('createNotification', () => {
    it('should create a basic notification', () => {
      const n = service.createNotification('user_1', 'price_alert', '价格预警', '000001 上涨5%', { channels: ['in_app'] });
      expect(n).not.toBeNull();
      expect(n!.userId).toBe('user_1');
      expect(n!.type).toBe('price_alert');
      expect(n!.priority).toBe('medium');
      expect(n!.channels).toContain('in_app');
      expect(n!.status).toBe('pending');
    });

    it('should return null when rate limited', () => {
      // 真实实现每分钟最多 30 条：前 30 条成功，第 31 条被限频
      for (let i = 0; i < 30; i++) {
        const created = service.createNotification('user_limited', 'system', `限频${i}`, 'ok', { channels: ['in_app'] });
        expect(created).not.toBeNull();
      }
      const n = service.createNotification('user_limited', 'system', '限频', 'too many');
      expect(n).toBeNull();
    });

    it('should return null when global disabled', () => {
      service.setUserPreferences(makePreferences('user_disabled', { globalEnabled: false }));
      const n = service.createNotification('user_disabled', 'system', '通知', '内容', { channels: ['in_app'] });
      expect(n).toBeNull();
    });

    it('should return null when all channels filtered out', () => {
      service.setUserPreferences(makePreferences('user_no_push', { pushEnabled: false }));
      const n = service.createNotification('user_no_push', 'system', '通知', '内容', { channels: ['push'] });
      expect(n).toBeNull();
    });

    it('should use custom priority', () => {
      const n = service.createNotification('user_1', 'system', '紧急', '异常', { priority: 'urgent', channels: ['in_app'] });
      expect(n!.priority).toBe('urgent');
    });

    it('should set expiration', () => {
      const n = service.createNotification('user_1', 'system', '过期', '过期内容', { expiresInSeconds: 3600, channels: ['in_app'] });
      expect(n!.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should set optional fields', () => {
      const n = service.createNotification('user_1', 'system', '通知', '内容', {
        data: { key: 'value' },
        icon: '🔔',
        actionUrl: 'stocks/000001',
        channels: ['in_app'],
      });
      expect(n!.data).toEqual({ key: 'value' });
      expect(n!.icon).toBe('🔔');
      expect(n!.actionUrl).toBe('stocks/000001');
    });

    it('should drop illegal actionUrl outside the route whitelist', () => {
      // 真实实现会丢弃带前导斜杠 / 协议 / 未命中路由的 actionUrl（防止点通知掉出站点）
      const n = service.createNotification('user_1', 'system', '通知', '内容', {
        actionUrl: '/test',
        channels: ['in_app'],
      });
      expect(n).not.toBeNull();
      expect(n!.actionUrl).toBeUndefined();
    });
  });

  describe('createFromTemplate', () => {
    beforeEach(() => {
      templateManager.addTemplate({
        id: 'test_template', type: 'price_alert',
        titleTemplate: '{{symbol}} 预警',
        bodyTemplate: '当前价 {{price}}，偏离 {{deviation}}%',
        defaultChannels: ['push', 'in_app'], defaultPriority: 'high',
        icon: '🔔', actionUrlTemplate: 'stocks/{{symbol}}',
        enabled: true,
      });
    });

    it('should create notification from template', () => {
      const n = service.createFromTemplate('user_1', 'test_template', { symbol: '000001', price: '15.80', deviation: '5' });
      expect(n).not.toBeNull();
      expect(n!.title).toBe('000001 预警');
      expect(n!.body).toContain('15.80');
    });

    it('should return null for non-existent template', () => {
      const n = service.createFromTemplate('user_1', 'nonexistent', {});
      expect(n).toBeNull();
    });

    it('should return null for disabled template', () => {
      templateManager.addTemplate({
        id: 'disabled_tmpl', type: 'system', titleTemplate: '{{msg}}', bodyTemplate: '{{msg}}',
        defaultChannels: ['in_app'], defaultPriority: 'low', enabled: false,
      });
      const n = service.createFromTemplate('user_1', 'disabled_tmpl', { msg: 'test' });
      expect(n).toBeNull();
    });
  });

  describe('batchCreate', () => {
    it('should create notifications for multiple users', () => {
      const results = service.batchCreate({
        userIds: ['user_1', 'user_2', 'user_3'],
        type: 'system', title: '公告', body: '重要通知', channels: ['in_app'],
        priority: 'high',
      });
      expect(results).toHaveLength(3);
    });

    it('should return empty for empty user list', () => {
      const results = service.batchCreate({ userIds: [], type: 'system', title: 't', body: 'b' });
      expect(results).toHaveLength(0);
    });
  });

  describe('getUserNotifications', () => {
    it('should return empty for user with no notifications', () => {
      expect(service.getUserNotifications('nonexistent')).toEqual([]);
    });

    it('should return notifications in reverse chronological order', () => {
      service.createNotification('user_1', 'system', '第一', 'first', { channels: ['in_app'] });
      service.createNotification('user_1', 'system', '第二', 'second', { channels: ['in_app'] });
      const notifications = service.getUserNotifications('user_1');
      expect(notifications).toHaveLength(2);
      expect(notifications[0].createdAt).toBeGreaterThanOrEqual(notifications[1].createdAt);
    });

    it('should filter unread only', () => {
      const n1 = service.createNotification('user_1', 'system', '未读', 'unread', { channels: ['in_app'] });
      const n2 = service.createNotification('user_1', 'system', '已读', 'read', { channels: ['in_app'] });
      if (n2) service.markAsRead(n2.id);
      const unread = service.getUserNotifications('user_1', { unreadOnly: true });
      expect(unread).toHaveLength(1);
      expect(unread[0].title).toBe('未读');
    });

    it('should filter by type', () => {
      service.createNotification('user_1', 'price_alert', '价格', 'alert', { channels: ['in_app'] });
      service.createNotification('user_1', 'news', '新闻', 'news', { channels: ['in_app'] });
      const priceAlerts = service.getUserNotifications('user_1', { type: 'price_alert' });
      expect(priceAlerts).toHaveLength(1);
      expect(priceAlerts[0].type).toBe('price_alert');
    });

    it('should filter by priority', () => {
      service.createNotification('user_1', 'system', '紧急', 'urgent', { priority: 'urgent', channels: ['in_app'] });
      service.createNotification('user_1', 'system', '普通', 'normal', { channels: ['in_app'] });
      const urgent = service.getUserNotifications('user_1', { priority: 'urgent' });
      expect(urgent).toHaveLength(1);
    });

    it('should apply limit and offset', () => {
      for (let i = 0; i < 10; i++) {
        service.createNotification('user_1', 'system', `通知${i}`, `body${i}`, { channels: ['in_app'] });
      }
      const page = service.getUserNotifications('user_1', { limit: 3, offset: 5 });
      expect(page).toHaveLength(3);
    });

    it('should sort by priority', () => {
      service.createNotification('user_1', 'system', '低级', 'low', { priority: 'low', channels: ['in_app'] });
      service.createNotification('user_1', 'system', '紧急', 'urgent', { priority: 'urgent', channels: ['in_app'] });
      service.createNotification('user_1', 'system', '中级', 'medium', { channels: ['in_app'] });
      const sorted = service.getUserNotifications('user_1', { sortBy: 'priority' });
      expect(sorted[0].priority).toBe('urgent');
      expect(sorted[1].priority).toBe('medium');
    });

    it('should exclude expired notifications', async () => {
      const n = service.createNotification('user_1', 'system', '过期', 'expired', { expiresInSeconds: 0.001, channels: ['in_app'] });
      await new Promise(r => setTimeout(r, 50));
      const list = service.getUserNotifications('user_1');
      expect(list.find(item => item.id === n!.id)).toBeUndefined();
    });
  });

  describe('getNotification', () => {
    it('should retrieve by ID', () => {
      const n = service.createNotification('user_1', 'system', '测试', 'test', { channels: ['in_app'] });
      const found = service.getNotification(n!.id);
      expect(found).toBeDefined();
      expect(found!.title).toBe('测试');
    });

    it('should return undefined for unknown ID', () => {
      expect(service.getNotification('nonexistent')).toBeUndefined();
    });
  });

  describe('markAsRead', () => {
    it('should mark single notification as read', () => {
      const n = service.createNotification('user_1', 'system', 'test', 'test', { channels: ['in_app'] });
      const result = service.markAsRead(n!.id);
      expect(result).toBe(true);
      expect(service.getNotification(n!.id)!.read).toBe(true);
      expect(service.getNotification(n!.id)!.readAt).toBeGreaterThan(0);
    });

    it('should return false for unknown ID', () => {
      expect(service.markAsRead('unknown')).toBe(false);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', () => {
      service.createNotification('user_1', 'system', 'A', 'a', { channels: ['in_app'] });
      service.createNotification('user_1', 'system', 'B', 'b', { channels: ['in_app'] });
      const count = service.markAllAsRead('user_1');
      expect(count).toBe(2);
      expect(service.getUnreadCount('user_1')).toBe(0);
    });

    it('should return 0 for user with no notifications', () => {
      expect(service.markAllAsRead('nonexistent')).toBe(0);
    });
  });

  describe('deleteNotification', () => {
    it('should delete notification by ID', () => {
      const n = service.createNotification('user_1', 'system', '删除', 'delete', { channels: ['in_app'] });
      expect(service.deleteNotification(n!.id)).toBe(true);
      expect(service.getNotification(n!.id)).toBeUndefined();
    });

    it('should return false for unknown ID', () => {
      expect(service.deleteNotification('unknown')).toBe(false);
    });
  });

  describe('clearUserNotifications', () => {
    it('should clear all notifications for user', () => {
      service.createNotification('user_1', 'system', 'A', 'a', { channels: ['in_app'] });
      service.createNotification('user_1', 'system', 'B', 'b', { channels: ['in_app'] });
      expect(service.clearUserNotifications('user_1')).toBe(2);
      expect(service.getUserNotifications('user_1')).toHaveLength(0);
    });

    it('should return 0 for user with no notifications', () => {
      expect(service.clearUserNotifications('nonexistent')).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return empty stats for new user', () => {
      const stats = service.getStats('new_user');
      expect(stats.total).toBe(0);
      expect(stats.unread).toBe(0);
    });

    it('should calculate stats correctly', () => {
      for (let i = 0; i < 3; i++) {
        service.createNotification('user_1', 'price_alert', '价格', `p${i}`, { priority: 'high', channels: ['in_app'] });
      }
      service.createNotification('user_1', 'news', '新闻', 'n1', { priority: 'low', channels: ['in_app'] });
      const stats = service.getStats('user_1');
      expect(stats.total).toBe(4);
      expect(stats.unread).toBe(4);
      expect(stats.byType.price_alert).toBe(3);
      expect(stats.byType.news).toBe(1);
      expect(stats.byPriority.high).toBe(3);
      expect(stats.byPriority.low).toBe(1);
    });
  });

  describe('getUnreadCount', () => {
    it('should return correct unread count', () => {
      service.createNotification('user_1', 'system', 'A', 'a', { channels: ['in_app'] });
      service.createNotification('user_1', 'system', 'B', 'b', { channels: ['in_app'] });
      const all = service.getUserNotifications('user_1');
      if (all[0]) service.markAsRead(all[0].id);
      expect(service.getUnreadCount('user_1')).toBe(1);
    });
  });

  describe('preferences', () => {
    it('should create default preferences', () => {
      const prefs = service.getUserPreferences('new_user');
      expect(prefs.globalEnabled).toBe(true);
      expect(prefs.pushEnabled).toBe(true);
      expect(prefs.emailEnabled).toBe(false);
      expect(prefs.dailyDigest).toBe(false);
    });

    it('should update preferences', () => {
      const prefs = service.getUserPreferences('user_1');
      prefs.pushEnabled = false;
      service.setUserPreferences(prefs);
      expect(service.getUserPreferences('user_1').pushEnabled).toBe(false);
    });
  });

  describe('dispatchToChannels', () => {
    it('should use registered channel handlers', async () => {
      let sent = false;
      service.registerChannelHandler({
        channel: 'in_app',
        send: async () => { sent = true; return true; },
      });
      const n = service.createNotification('user_1', 'system', 'test', 'test', { channels: ['in_app'] });
      expect(n).not.toBeNull();
      // 真实 createNotification 内部异步分发；等待微任务/事件循环后状态应变 sent
      await new Promise(r => setTimeout(r, 0));
      expect(sent).toBe(true);
      expect(n!.status).toBe('sent');
    });

    it('should handle missing channel handler gracefully', async () => {
      // 默认偏好允许 in_app，但未注册任何渠道处理器：不应抛错，状态保持 pending
      const n = service.createNotification('user_1', 'system', 'test', 'test', { channels: ['in_app'] });
      expect(n).not.toBeNull();
      await new Promise(r => setTimeout(r, 0));
      expect(service.getNotification(n!.id)!.status).toBe('pending');
    });
  });

  describe('clear', () => {
    it('should reset all state', () => {
      const n = service.createNotification('user_1', 'system', 'A', 'a', { channels: ['in_app'] });
      service.clear();
      expect(service.getNotification(n!.id)).toBeUndefined();
      expect(service.getUserNotifications('user_1')).toHaveLength(0);
      expect(service.getStats('user_1').total).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty title/body', () => {
      const n = service.createNotification('user_1', 'system', '', '', { channels: ['in_app'] });
      expect(n).not.toBeNull();
      expect(n!.title).toBe('');
    });

    it('should handle very long body', () => {
      const longBody = 'A'.repeat(10000);
      const n = service.createNotification('user_1', 'system', '长消息', longBody, { channels: ['in_app'] });
      expect(n!.body.length).toBe(10000);
    });
  });
});
