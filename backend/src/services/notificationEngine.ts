/**
 * 通知引擎
 * Notification Engine
 *
 * 多渠道通知(WebSocket/邮件/短信/推送)、通知模板、优先级管理
 */

export type NotificationChannel = 'websocket' | 'email' | 'sms' | 'push';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Notification {
  id: string;
  title: string;
  body: string;
  channel: NotificationChannel;
  priority: NotificationPriority;
  recipient: string;
  data?: Record<string, any>;
  createdAt: number;
  sentAt?: number;
  readAt?: number;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
}

export interface NotificationTemplate {
  id: string;
  name: string;
  titleTemplate: string;
  bodyTemplate: string;
  channels: NotificationChannel[];
  defaultPriority: NotificationPriority;
}

/**
 * 通知管理器
 */
export class NotificationEngine {
  private notifications: Map<string, Notification> = new Map();
  private templates: Map<string, NotificationTemplate> = new Map();
  private channels: Map<NotificationChannel, (n: Notification) => Promise<boolean>> = new Map();
  private history: Notification[] = [];
  private idCounter = 0;

  constructor() {
    // 默认通道处理器
    this.channels.set('websocket', async () => true);
    this.channels.set('email', async () => true);
    this.channels.set('sms', async () => true);
    this.channels.set('push', async () => true);
  }

  /**
   * 注册通知模板
   */
  registerTemplate(template: NotificationTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * 注册通道处理器
   */
  registerChannel(channel: NotificationChannel, handler: (n: Notification) => Promise<boolean>): void {
    this.channels.set(channel, handler);
  }

  /**
   * 创建通知
   */
  async create(
    params: Omit<Notification, 'id' | 'createdAt' | 'status'>
  ): Promise<Notification> {
    const id = `notif-${++this.idCounter}`;
    const notification: Notification = {
      ...params,
      id,
      createdAt: Date.now(),
      status: 'pending',
    };
    this.notifications.set(id, notification);
    return notification;
  }

  /**
   * 从模板创建通知
   */
  async createFromTemplate(
    templateId: string,
    variables: Record<string, string>,
    recipient: string,
    channel?: NotificationChannel
  ): Promise<Notification | null> {
    const template = this.templates.get(templateId);
    if (!template) return null;

    const interpolate = (str: string) =>
      str.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || '');

    return this.create({
      title: interpolate(template.titleTemplate),
      body: interpolate(template.bodyTemplate),
      channel: channel ?? template.channels[0],
      priority: template.defaultPriority,
      recipient,
    });
  }

  /**
   * 发送通知
   */
  async send(id: string): Promise<boolean> {
    const notification = this.notifications.get(id);
    if (!notification) return false;

    const handler = this.channels.get(notification.channel);
    if (!handler) {
      notification.status = 'failed';
      return false;
    }

    try {
      const success = await handler(notification);
      notification.status = success ? 'sent' : 'failed';
      notification.sentAt = Date.now();
      if (success) this.history.push({ ...notification });
      return success;
    } catch {
      notification.status = 'failed';
      return false;
    }
  }

  /**
   * 标记已读
   */
  markAsRead(id: string): boolean {
    const notification = this.notifications.get(id);
    if (!notification) return false;
    notification.status = 'read';
    notification.readAt = Date.now();
    return true;
  }

  /**
   * 获取用户通知
   */
  getUserNotifications(recipient: string, unreadOnly: boolean = false): Notification[] {
    return Array.from(this.notifications.values())
      .filter(n => n.recipient === recipient && (!unreadOnly || !n.readAt))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 批量标记已读
   */
  markAllAsRead(recipient: string): number {
    let count = 0;
    for (const n of this.notifications.values()) {
      if (n.recipient === recipient && !n.readAt) {
        n.readAt = Date.now();
        n.status = 'read';
        count++;
      }
    }
    return count;
  }

  /**
   * 获取统计信息
   */
  getStats(recipient?: string): {
    total: number;
    pending: number;
    sent: number;
    read: number;
    failed: number;
  } {
    const filtered = recipient
      ? Array.from(this.notifications.values()).filter(n => n.recipient === recipient)
      : Array.from(this.notifications.values());

    return {
      total: filtered.length,
      pending: filtered.filter(n => n.status === 'pending').length,
      sent: filtered.filter(n => ['sent', 'delivered'].includes(n.status)).length,
      read: filtered.filter(n => n.status === 'read').length,
      failed: filtered.filter(n => n.status === 'failed').length,
    };
  }

  /**
   * 清理旧通知
   */
  cleanup(maxAge: number = 7 * 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAge;
    let cleaned = 0;
    for (const [id, n] of this.notifications) {
      if (n.createdAt < cutoff && n.status !== 'pending') {
        this.notifications.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }
}
