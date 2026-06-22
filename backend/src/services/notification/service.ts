/**
 * 通知系统 - 核心服务
 */

import {
  NotificationPayload,
  NotificationType,
  NotificationPriority,
  NotificationChannel,
  NotificationStatus,
  NotificationPreferences,
  NotificationStats,
  BatchNotificationRequest,
  NotificationChannelHandler,
} from './types';
import { templateManager } from './templates';

export class NotificationService {
  private notifications: Map<string, NotificationPayload> = new Map();
  private userNotifications: Map<string, Set<string>> = new Map();
  private preferences: Map<string, NotificationPreferences> = new Map();
  private channelHandlers: Map<NotificationChannel, NotificationChannelHandler> = new Map();
  private rateLimitCounters: Map<string, { count: number; resetAt: number }> = new Map();
  private maxNotificationsPerUser = 500;
  private defaultRateLimit = { maxPerMinute: 30, maxPerHour: 300 };

  /**
   * 注册渠道处理器
   */
  registerChannelHandler(handler: NotificationChannelHandler): void {
    this.channelHandlers.set(handler.channel, handler);
  }

  /**
   * 创建通知
   */
  createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    options: {
      priority?: NotificationPriority;
      channels?: NotificationChannel[];
      data?: Record<string, unknown>;
      expiresInSeconds?: number;
      icon?: string;
      actionUrl?: string;
      templateId?: string;
      templateData?: Record<string, unknown>;
    } = {}
  ): NotificationPayload | null {
    // 检查频率限制
    if (!this.checkRateLimit(userId)) {
      console.warn(`[Notification] 用户 ${userId} 超过频率限制`);
      return null;
    }

    // 检查用户偏好
    const prefs = this.getUserPreferences(userId);
    if (!prefs.globalEnabled) return null;

    // 如果使用模板
    let finalTitle = title;
    let finalBody = body;
    let finalChannels = options.channels;
    let finalPriority = options.priority;
    let finalIcon = options.icon;
    let finalActionUrl = options.actionUrl;

    if (options.templateId && options.templateData) {
      const rendered = templateManager.renderNotification(
        options.templateId,
        options.templateData
      );
      if (rendered) {
        finalTitle = rendered.title;
        finalBody = rendered.body;
        finalIcon = finalIcon || rendered.icon;
        finalActionUrl = finalActionUrl || rendered.actionUrl;
        finalChannels = finalChannels || (rendered.channels as NotificationChannel[]);
        finalPriority = finalPriority || (rendered.priority as NotificationPriority);
      }
    }

    // 应用用户订阅偏好
    finalChannels = this.filterChannelsByPreferences(userId, type, finalChannels);

    if (finalChannels.length === 0) return null;

    const notification: NotificationPayload = {
      id: this.generateId(),
      type,
      priority: finalPriority || 'medium',
      title: finalTitle,
      body: finalBody,
      data: options.data,
      channels: finalChannels,
      userId,
      read: false,
      status: 'pending',
      createdAt: Date.now(),
      expiresAt: options.expiresInSeconds
        ? Date.now() + options.expiresInSeconds * 1000
        : undefined,
      icon: finalIcon,
      actionUrl: finalActionUrl,
    };

    // 存储通知
    this.notifications.set(notification.id, notification);
    this.addUserNotification(userId, notification.id);

    // 清理过期通知
    this.cleanupUserNotifications(userId);

    // 异步分发到各渠道
    this.dispatchToChannels(notification);

    return notification;
  }

  /**
   * 从模板创建通知
   */
  createFromTemplate(
    userId: string,
    templateId: string,
    data: Record<string, unknown>,
    overrides: Partial<NotificationPayload> = {}
  ): NotificationPayload | null {
    const template = templateManager.getTemplate(templateId);
    if (!template || !template.enabled) return null;

    const rendered = templateManager.renderNotification(templateId, data);
    if (!rendered) return null;

    return this.createNotification(userId, template.type, rendered.title, rendered.body, {
      priority: (rendered.priority as NotificationPriority) || overrides.priority,
      channels: (rendered.channels as NotificationChannel[]) || overrides.channels,
      data,
      icon: rendered.icon,
      actionUrl: rendered.actionUrl,
    });
  }

  /**
   * 批量创建通知
   */
  batchCreate(request: BatchNotificationRequest): NotificationPayload[] {
    const notifications: NotificationPayload[] = [];

    for (const userId of request.userIds) {
      const notification = this.createNotification(
        userId,
        request.type,
        request.title,
        request.body,
        {
          priority: request.priority,
          channels: request.channels,
          data: request.data,
        }
      );
      if (notification) {
        notifications.push(notification);
      }
    }

    return notifications;
  }

  /**
   * 获取用户通知列表
   */
  getUserNotifications(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
      type?: NotificationType;
      priority?: NotificationPriority;
      sortBy?: 'createdAt' | 'priority';
    } = {}
  ): NotificationPayload[] {
    const ids = this.userNotifications.get(userId);
    if (!ids) return [];

    const notifications = Array.from(ids)
      .map(id => this.notifications.get(id))
      .filter((n): n is NotificationPayload => {
        if (!n) return false;
        if (n.expiresAt && Date.now() > n.expiresAt) return false;
        if (options.unreadOnly && n.read) return false;
        if (options.type && n.type !== options.type) return false;
        if (options.priority && n.priority !== options.priority) return false;
        return true;
      });

    // 排序
    if (options.sortBy === 'priority') {
      const priorityOrder: Record<NotificationPriority, number> = {
        urgent: 0,
        high: 1,
        medium: 2,
        low: 3,
      };
      notifications.sort(
        (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || b.createdAt - a.createdAt
      );
    } else {
      notifications.sort((a, b) => b.createdAt - a.createdAt);
    }

    // 分页
    const offset = options.offset || 0;
    const limit = options.limit || 50;
    return notifications.slice(offset, offset + limit);
  }

  /**
   * 获取单个通知
   */
  getNotification(notificationId: string): NotificationPayload | undefined {
    return this.notifications.get(notificationId);
  }

  /**
   * 标记已读
   */
  markAsRead(notificationId: string): boolean {
    const notification = this.notifications.get(notificationId);
    if (!notification) return false;
    notification.read = true;
    notification.readAt = Date.now();
    notification.status = 'read';
    return true;
  }

  /**
   * 批量标记已读
   */
  markAllAsRead(userId: string): number {
    const ids = this.userNotifications.get(userId);
    if (!ids) return 0;

    let count = 0;
    for (const id of ids) {
      const notification = this.notifications.get(id);
      if (notification && !notification.read) {
        notification.read = true;
        notification.readAt = Date.now();
        notification.status = 'read';
        count++;
      }
    }
    return count;
  }

  /**
   * 删除通知
   */
  deleteNotification(notificationId: string): boolean {
    const notification = this.notifications.get(notificationId);
    if (!notification) return false;
    this.notifications.delete(notificationId);

    const userId = notification.userId;
    const userNotifs = this.userNotifications.get(userId);
    if (userNotifs) {
      userNotifs.delete(notificationId);
    }
    return true;
  }

  /**
   * 清空用户所有通知
   */
  clearUserNotifications(userId: string): number {
    const ids = this.userNotifications.get(userId);
    if (!ids) return 0;

    const count = ids.size;
    for (const id of ids) {
      this.notifications.delete(id);
    }
    ids.clear();
    return count;
  }

  /**
   * 获取通知统计
   */
  getStats(userId: string): NotificationStats {
    const ids = this.userNotifications.get(userId);
    if (!ids) {
      return { total: 0, unread: 0, byType: {} as Record<NotificationType, number>, byPriority: {} as Record<NotificationPriority, number> };
    }

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

    return {
      total: ids.size,
      unread,
      byType: byType as Record<NotificationType, number>,
      byPriority: byPriority as Record<NotificationPriority, number>,
    };
  }

  /**
   * 获取未读数量
   */
  getUnreadCount(userId: string): number {
    return this.getStats(userId).unread;
  }

  /**
   * 设置用户偏好
   */
  setUserPreferences(prefs: NotificationPreferences): void {
    prefs.updatedAt = Date.now();
    this.preferences.set(prefs.userId, prefs);
  }

  /**
   * 获取用户偏好
   */
  getUserPreferences(userId: string): NotificationPreferences {
    let prefs = this.preferences.get(userId);
    if (!prefs) {
      prefs = this.createDefaultPreferences(userId);
      this.preferences.set(userId, prefs);
    }
    return prefs;
  }

  // === 内部方法 ===

  private generateId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private addUserNotification(userId: string, notificationId: string): void {
    if (!this.userNotifications.has(userId)) {
      this.userNotifications.set(userId, new Set());
    }
    this.userNotifications.get(userId)!.add(notificationId);
  }

  private cleanupUserNotifications(userId: string): void {
    const ids = this.userNotifications.get(userId);
    if (!ids || ids.size <= this.maxNotificationsPerUser) return;

    // 删除过期的
    for (const id of ids) {
      const n = this.notifications.get(id);
      if (n && n.expiresAt && Date.now() > n.expiresAt) {
        this.notifications.delete(id);
        ids.delete(id);
      }
    }

    // 还是太多就删除最旧的已读通知
    if (ids.size > this.maxNotificationsPerUser) {
      const sorted = Array.from(ids)
        .map(id => this.notifications.get(id))
        .filter((n): n is NotificationPayload => !!n)
        .sort((a, b) => a.createdAt - b.createdAt);

      const toDelete = sorted.filter(n => n.read).slice(0, ids.size - this.maxNotificationsPerUser);
      for (const n of toDelete) {
        this.notifications.delete(n.id);
        ids.delete(n.id);
      }
    }
  }

  private checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const counter = this.rateLimitCounters.get(userId);

    if (!counter || now > counter.resetAt) {
      this.rateLimitCounters.set(userId, { count: 1, resetAt: now + 60000 });
      return true;
    }

    if (counter.count >= this.defaultRateLimit.maxPerMinute) {
      return false;
    }

    counter.count++;
    return true;
  }

  private filterChannelsByPreferences(
    userId: string,
    type: NotificationType,
    channels?: NotificationChannel[]
  ): NotificationChannel[] {
    if (!channels) return ['in_app'];

    const prefs = this.getUserPreferences(userId);
    if (!prefs.globalEnabled) return [];

    return channels.filter(ch => {
      if (ch === 'push' && !prefs.pushEnabled) return false;
      if (ch === 'email' && !prefs.emailEnabled) return false;
      if (ch === 'sms' && !prefs.smsEnabled) return false;
      if (ch === 'in_app') return true;

      // 检查订阅
      const sub = prefs.subscriptions.find(s => s.type === type);
      if (sub) {
        return sub.enabled && sub.channels.includes(ch);
      }
      return true;
    });
  }

  private async dispatchToChannels(notification: NotificationPayload): Promise<void> {
    for (const channel of notification.channels) {
      const handler = this.channelHandlers.get(channel);
      if (handler) {
        try {
          await handler.send(notification);
          notification.status = 'sent';
        } catch (error) {
          console.error(`[Notification] 渠道 ${channel} 发送失败:`, error);
        }
      }
    }
  }

  private createDefaultPreferences(userId: string): NotificationPreferences {
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
    };
  }

  /**
   * 清空所有数据（测试用）
   */
  clear(): void {
    this.notifications.clear();
    this.userNotifications.clear();
    this.preferences.clear();
    this.rateLimitCounters.clear();
  }
}

export const notificationService = new NotificationService();
