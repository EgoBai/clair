/**
 * 通知核心服务测试
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Inline NotificationService for testing
type NotificationType = string;
type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';
type NotificationChannel = 'push' | 'email' | 'sms' | 'websocket' | 'in_app';
type NotificationStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'expired';

interface NotificationPayload {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channels: NotificationChannel[];
  userId: string;
  read: boolean;
  status: NotificationStatus;
  createdAt: number;
  readAt?: number;
  expiresAt?: number;
  icon?: string;
  actionUrl?: string;
}

interface NotificationPreferences {
  userId: string;
  globalEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  subscriptions: Array<{ userId: string; type: string; channels: string[]; enabled: boolean; createdAt: number; updatedAt: number }>;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  dailyDigest: boolean;
  maxDailyNotifications: number;
  createdAt: number;
  updatedAt: number;
}

interface NotificationStats {
  total: number;
  unread: number;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
}

interface BatchNotificationRequest {
  userIds: string[];
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channels?: string[];
  priority?: string;
}

interface NotificationTemplate {
  id: string;
  type: string;
  titleTemplate: string;
  bodyTemplate: string;
  defaultChannels: string[];
  defaultPriority: string;
  icon?: string;
  actionUrlTemplate?: string;
  enabled: boolean;
}

class SimpleTemplateManager {
  templates: Map<string, NotificationTemplate> = new Map();

  register(tmpl: NotificationTemplate) {
    this.templates.set(tmpl.id, tmpl);
  }

  getTemplate(id: string): NotificationTemplate | undefined {
    return this.templates.get(id);
  }

  renderNotification(templateId: string, data: Record<string, unknown>): { title: string; body: string; icon?: string; actionUrl?: string; channels?: string[]; priority?: string } | null {
    const tmpl = this.templates.get(templateId);
    if (!tmpl || !tmpl.enabled) return null;
    const title = tmpl.titleTemplate.replace(/\{\{(\w+)\}\}/g, (_, k) => String(data[k] || ''));
    const body = tmpl.bodyTemplate.replace(/\{\{(\w+)\}\}/g, (_, k) => String(data[k] || ''));
    return { title, body, icon: tmpl.icon, actionUrl: tmpl.actionUrlTemplate?.replace(/\{\{(\w+)\}\}/g, (_, k) => String(data[k] || '')), channels: tmpl.defaultChannels, priority: tmpl.defaultPriority };
  }
}

class TestNotificationService {
  notifications: Map<string, NotificationPayload> = new Map();
  userNotifications: Map<string, Set<string>> = new Map();
  preferences: Map<string, NotificationPreferences> = new Map();
  channelHandlers: Map<string, { send: (n: any) => Promise<boolean>; channel: string }> = new Map();
  rateLimitCounters: Map<string, { count: number; resetAt: number }> = new Map();
  maxNotificationsPerUser = 500;
  defaultRateLimit = { maxPerMinute: 30, maxPerHour: 300 };
  templateManager = new SimpleTemplateManager();

  registerChannelHandler(handler: { channel: string; send: (n: any) => Promise<boolean> }) {
    this.channelHandlers.set(handler.channel, handler);
  }

  generateId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  createDefaultPreferences(userId: string): NotificationPreferences {
    return {
      userId, globalEnabled: true, pushEnabled: true, emailEnabled: false, smsEnabled: false,
      subscriptions: [], quietHoursEnabled: false, quietHoursStart: '23:00', quietHoursEnd: '07:00',
      dailyDigest: false, maxDailyNotifications: 100, createdAt: Date.now(), updatedAt: Date.now(),
    };
  }

  getUserPreferences(userId: string): NotificationPreferences {
    let prefs = this.preferences.get(userId);
    if (!prefs) {
      prefs = this.createDefaultPreferences(userId);
      this.preferences.set(userId, prefs);
    }
    return prefs;
  }

  setUserPreferences(prefs: NotificationPreferences) {
    prefs.updatedAt = Date.now();
    this.preferences.set(prefs.userId, prefs);
  }

  checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const counter = this.rateLimitCounters.get(userId);
    if (!counter || now > counter.resetAt) {
      this.rateLimitCounters.set(userId, { count: 1, resetAt: now + 60000 });
      return true;
    }
    if (counter.count >= this.defaultRateLimit.maxPerMinute) return false;
    counter.count++;
    return true;
  }

  addUserNotification(userId: string, notificationId: string) {
    if (!this.userNotifications.has(userId)) this.userNotifications.set(userId, new Set());
    this.userNotifications.get(userId)!.add(notificationId);
  }

  filterChannelsByPreferences(userId: string, type: string, channels?: NotificationChannel[]): NotificationChannel[] {
    if (!channels) return ['in_app'];
    const prefs = this.getUserPreferences(userId);
    if (!prefs.globalEnabled) return [];
    return channels.filter(ch => {
      if (ch === 'push' && !prefs.pushEnabled) return false;
      if (ch === 'email' && !prefs.emailEnabled) return false;
      if (ch === 'sms' && !prefs.smsEnabled) return false;
      if (ch === 'in_app') return true;
      const sub = prefs.subscriptions.find(s => s.type === type);
      if (sub) return sub.enabled && sub.channels.includes(ch);
      return true;
    });
  }

  cleanupUserNotifications(userId: string) {
    const ids = this.userNotifications.get(userId);
    if (!ids || ids.size <= this.maxNotificationsPerUser) return;
    for (const id of ids) {
      const n = this.notifications.get(id);
      if (n && n.expiresAt && Date.now() > n.expiresAt) { this.notifications.delete(id); ids.delete(id); }
    }
    if (ids.size > this.maxNotificationsPerUser) {
      const sorted = Array.from(ids).map(id => this.notifications.get(id)).filter((n): n is NotificationPayload => !!n).sort((a, b) => a.createdAt - b.createdAt);
      const toDelete = sorted.filter(n => n.read).slice(0, ids.size - this.maxNotificationsPerUser);
      for (const n of toDelete) { this.notifications.delete(n.id); ids.delete(n.id); }
    }
  }

  createNotification(userId: string, type: string, title: string, body: string, options: any = {}): NotificationPayload | null {
    if (!this.checkRateLimit(userId)) return null;
    const prefs = this.getUserPreferences(userId);
    if (!prefs.globalEnabled) return null;

    let finalTitle = title;
    let finalBody = body;
    let finalChannels = options.channels;
    let finalPriority = options.priority;
    let finalIcon = options.icon;
    let finalActionUrl = options.actionUrl;

    if (options.templateId && options.templateData) {
      const rendered = this.templateManager.renderNotification(options.templateId, options.templateData);
      if (rendered) {
        finalTitle = rendered.title;
        finalBody = rendered.body;
        finalIcon = finalIcon || rendered.icon;
        finalActionUrl = finalActionUrl || rendered.actionUrl;
        finalChannels = finalChannels || rendered.channels;
        finalPriority = finalPriority || rendered.priority;
      }
    }

    finalChannels = this.filterChannelsByPreferences(userId, type, finalChannels);
    if (finalChannels.length === 0) return null;

    const notification: NotificationPayload = {
      id: this.generateId(), type, priority: finalPriority || 'medium',
      title: finalTitle, body: finalBody, data: options.data,
      channels: finalChannels, userId, read: false, status: 'pending',
      createdAt: Date.now(),
      expiresAt: options.expiresInSeconds ? Date.now() + options.expiresInSeconds * 1000 : undefined,
      icon: finalIcon, actionUrl: finalActionUrl,
    };

    this.notifications.set(notification.id, notification);
    this.addUserNotification(userId, notification.id);
    this.cleanupUserNotifications(userId);
    this.dispatchToChannels(notification);

    return notification;
  }

  createFromTemplate(userId: string, templateId: string, data: Record<string, unknown>, overrides: any = {}): NotificationPayload | null {
    const template = this.templateManager.getTemplate(templateId);
    if (!template || !template.enabled) return null;
    const rendered = this.templateManager.renderNotification(templateId, data);
    if (!rendered) return null;
    return this.createNotification(userId, template.type, rendered.title, rendered.body, {
      priority: rendered.priority || overrides.priority,
      channels: rendered.channels || overrides.channels,
      data, icon: rendered.icon, actionUrl: rendered.actionUrl,
    });
  }

  batchCreate(request: BatchNotificationRequest): NotificationPayload[] {
    const notifications: NotificationPayload[] = [];
    for (const userId of request.userIds) {
      const notification = this.createNotification(userId, request.type, request.title, request.body, { priority: request.priority, channels: request.channels, data: request.data });
      if (notification) notifications.push(notification);
    }
    return notifications;
  }

  getUserNotifications(userId: string, options: any = {}): NotificationPayload[] {
    const ids = this.userNotifications.get(userId);
    if (!ids) return [];
    let notifications = Array.from(ids).map(id => this.notifications.get(id)).filter((n): n is NotificationPayload => {
      if (!n) return false;
      if (n.expiresAt && Date.now() > n.expiresAt) return false;
      if (options.unreadOnly && n.read) return false;
      if (options.type && n.type !== options.type) return false;
      if (options.priority && n.priority !== options.priority) return false;
      return true;
    });

    if (options.sortBy === 'priority') {
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      notifications.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || b.createdAt - a.createdAt);
    } else {
      notifications.sort((a, b) => b.createdAt - a.createdAt);
    }

    const offset = options.offset || 0;
    const limit = options.limit || 50;
    return notifications.slice(offset, offset + limit);
  }

  getNotification(notificationId: string): NotificationPayload | undefined {
    return this.notifications.get(notificationId);
  }

  markAsRead(notificationId: string): boolean {
    const notification = this.notifications.get(notificationId);
    if (!notification) return false;
    notification.read = true;
    notification.readAt = Date.now();
    notification.status = 'read';
    return true;
  }

  markAllAsRead(userId: string): number {
    const ids = this.userNotifications.get(userId);
    if (!ids) return 0;
    let count = 0;
    for (const id of ids) {
      const notification = this.notifications.get(id);
      if (notification && !notification.read) {
        notification.read = true; notification.readAt = Date.now(); notification.status = 'read'; count++;
      }
    }
    return count;
  }

  deleteNotification(notificationId: string): boolean {
    const notification = this.notifications.get(notificationId);
    if (!notification) return false;
    this.notifications.delete(notificationId);
    const userNotifs = this.userNotifications.get(notification.userId);
    if (userNotifs) userNotifs.delete(notificationId);
    return true;
  }

  clearUserNotifications(userId: string): number {
    const ids = this.userNotifications.get(userId);
    if (!ids) return 0;
    const count = ids.size;
    for (const id of ids) this.notifications.delete(id);
    ids.clear();
    return count;
  }

  getStats(userId: string): NotificationStats {
    const ids = this.userNotifications.get(userId);
    if (!ids) return { total: 0, unread: 0, byType: {}, byPriority: {} };
    const byType: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let unread = 0;
    for (const id of ids) {
      const notification = this.notifications.get(id);
      if (!notification) continue;
      if (notification.expiresAt && Date.now() > notification.expiresAt) continue;
      byType[notification.type] = (byType[notification.type] || 0) + 1;
      byPriority[notification.priority] = (byPriority[notification.priority] || 0) + 1;
      if (!notification.read) unread++;
    }
    return { total: ids.size, unread, byType, byPriority };
  }

  getUnreadCount(userId: string): number {
    return this.getStats(userId).unread;
  }

  async dispatchToChannels(notification: NotificationPayload) {
    for (const channel of notification.channels) {
      const handler = this.channelHandlers.get(channel);
      if (handler) {
        try {
          await handler.send(notification);
          notification.status = 'sent';
        } catch (e) {
          console.error(`Channel ${channel} failed`);
        }
      }
    }
  }

  clear() {
    this.notifications.clear();
    this.userNotifications.clear();
    this.preferences.clear();
    this.rateLimitCounters.clear();
  }
}

describe('NotificationService', () => {
  let service: TestNotificationService;

  beforeEach(() => {
    service = new TestNotificationService();
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
      service.rateLimitCounters.set('user_limited', { count: 30, resetAt: Date.now() + 60000 });
      const n = service.createNotification('user_limited', 'system', '限频', 'too many');
      expect(n).toBeNull();
    });

    it('should return null when global disabled', () => {
      service.setUserPreferences({
        userId: 'user_disabled', globalEnabled: false, pushEnabled: true, emailEnabled: false,
        smsEnabled: false, subscriptions: [], quietHoursEnabled: false, quietHoursStart: '23:00',
        quietHoursEnd: '07:00', dailyDigest: false, maxDailyNotifications: 100,
        createdAt: Date.now(), updatedAt: Date.now(),
      });
      const n = service.createNotification('user_disabled', 'system', '通知', '内容', { channels: ['in_app'] });
      expect(n).toBeNull();
    });

    it('should return null when all channels filtered out', () => {
      service.setUserPreferences({
        userId: 'user_no_push', globalEnabled: true, pushEnabled: false, emailEnabled: false,
        smsEnabled: false, subscriptions: [], quietHoursEnabled: false, quietHoursStart: '23:00',
        quietHoursEnd: '07:00', dailyDigest: false, maxDailyNotifications: 100,
        createdAt: Date.now(), updatedAt: Date.now(),
      });
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
        actionUrl: '/test',
        channels: ['in_app'],
      });
      expect(n!.data).toEqual({ key: 'value' });
      expect(n!.icon).toBe('🔔');
      expect(n!.actionUrl).toBe('/test');
    });
  });

  describe('createFromTemplate', () => {
    beforeEach(() => {
      service.templateManager.register({
        id: 'test_template', type: 'price_alert',
        titleTemplate: '{{symbol}} 预警',
        bodyTemplate: '当前价 {{price}}，偏离 {{deviation}}%',
        defaultChannels: ['push', 'in_app'], defaultPriority: 'high',
        icon: '🔔', actionUrlTemplate: '/stock/{{symbol}}',
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
      service.templateManager.register({
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
        send: async (n: any) => { sent = true; return true; },
      });
      const n = service.createNotification('user_1', 'system', 'test', 'test', { channels: ['in_app'] });
      if (n) service.notifications.set(n.id, n);
      await service.dispatchToChannels(n!);
      expect(sent).toBe(true);
      expect(n!.status).toBe('sent');
    });

    it('should handle missing channel handler gracefully', async () => {
      const n = service.createNotification('user_1', 'system', 'test', 'test', { channels: ['sms'] });
      await service.dispatchToChannels(n!);
      expect(n!.status).toBe('pending');
    });
  });

  describe('clear', () => {
    it('should reset all state', () => {
      service.createNotification('user_1', 'system', 'A', 'a', { channels: ['in_app'] });
      service.clear();
      expect(service.notifications.size).toBe(0);
      expect(service.userNotifications.size).toBe(0);
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
