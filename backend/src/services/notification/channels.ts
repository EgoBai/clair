/**
 * 通知系统 - 渠道管理器
 */

import { NotificationChannelHandler, NotificationPayload, NotificationChannel } from './types';

/**
 * WebSocket 渠道处理器
 */
export class WebSocketChannelHandler implements NotificationChannelHandler {
  channel: NotificationChannel = 'websocket';
  private wsService: any;
  private userSocketMap: Map<string, string[]> = new Map();

  constructor(wsService?: any) {
    this.wsService = wsService;
  }

  registerUserSocket(userId: string, socketId: string): void {
    if (!this.userSocketMap.has(userId)) {
      this.userSocketMap.set(userId, []);
    }
    const sockets = this.userSocketMap.get(userId)!;
    if (!sockets.includes(socketId)) {
      sockets.push(socketId);
    }
  }

  unregisterUserSocket(userId: string, socketId: string): void {
    const sockets = this.userSocketMap.get(userId);
    if (sockets) {
      const idx = sockets.indexOf(socketId);
      if (idx > -1) sockets.splice(idx, 1);
      if (sockets.length === 0) this.userSocketMap.delete(userId);
    }
  }

  unregisterSocket(socketId: string): void {
    for (const [userId, sockets] of this.userSocketMap) {
      const idx = sockets.indexOf(socketId);
      if (idx > -1) sockets.splice(idx, 1);
      if (sockets.length === 0) this.userSocketMap.delete(userId);
    }
  }

  getConnectedUsers(): string[] {
    return Array.from(this.userSocketMap.keys());
  }

  getUserSocketCount(userId: string): number {
    return this.userSocketMap.get(userId)?.length || 0;
  }

  async send(notification: NotificationPayload): Promise<boolean> {
    if (this.wsService) {
      const socketIds = this.userSocketMap.get(notification.userId);
      if (socketIds && socketIds.length > 0) {
        for (const socketId of socketIds) {
          this.wsService.sendToClient(socketId, {
            type: 'notification',
            data: notification,
            timestamp: Date.now(),
          });
        }
        return true;
      }
    }
    return false;
  }
}

/**
 * 邮件渠道处理器
 */
export class EmailChannelHandler implements NotificationChannelHandler {
  channel: NotificationChannel = 'email';
  private sentEmails: Array<{ to: string; subject: string; body: string; sentAt: number }> = [];

  async send(notification: NotificationPayload): Promise<boolean> {
    // 模拟邮件发送
    this.sentEmails.push({
      to: notification.userId,
      subject: notification.title,
      body: notification.body,
      sentAt: Date.now(),
    });
    return true;
  }

  getSentEmails(): Array<{ to: string; subject: string; body: string; sentAt: number }> {
    return this.sentEmails;
  }

  clearSent(): void {
    this.sentEmails = [];
  }
}

/**
 * 应用内通知渠道处理器
 */
export class InAppChannelHandler implements NotificationChannelHandler {
  channel: NotificationChannel = 'in_app';
  private notifications: Map<string, NotificationPayload[]> = new Map();

  async send(notification: NotificationPayload): Promise<boolean> {
    if (!this.notifications.has(notification.userId)) {
      this.notifications.set(notification.userId, []);
    }
    this.notifications.get(notification.userId)!.push(notification);
    return true;
  }

  getUserNotifications(userId: string): NotificationPayload[] {
    return this.notifications.get(userId) || [];
  }

  clear(): void {
    this.notifications.clear();
  }
}

/**
 * 推送通知渠道处理器
 */
export class PushChannelHandler implements NotificationChannelHandler {
  channel: NotificationChannel = 'push';
  private pushedNotifications: Array<{ userId: string; title: string; body: string; pushedAt: number }> = [];

  async send(notification: NotificationPayload): Promise<boolean> {
    this.pushedNotifications.push({
      userId: notification.userId,
      title: notification.title,
      body: notification.body,
      pushedAt: Date.now(),
    });
    return true;
  }

  getPushedNotifications(): Array<{ userId: string; title: string; body: string; pushedAt: number }> {
    return this.pushedNotifications;
  }

  clear(): void {
    this.pushedNotifications = [];
  }
}

/**
 * 短信渠道处理器
 */
export class SmsChannelHandler implements NotificationChannelHandler {
  channel: NotificationChannel = 'sms';
  private sentSms: Array<{ phone: string; content: string; sentAt: number }> = [];

  async send(notification: NotificationPayload): Promise<boolean> {
    this.sentSms.push({
      phone: notification.userId,
      content: `${notification.title}: ${notification.body}`,
      sentAt: Date.now(),
    });
    return true;
  }

  getSentSms(): Array<{ phone: string; content: string; sentAt: number }> {
    return this.sentSms;
  }

  clear(): void {
    this.sentSms = [];
  }
}

/**
 * 渠道管理器 - 注册和管理所有渠道
 */
export class ChannelManager {
  private handlers: Map<NotificationChannel, NotificationChannelHandler> = new Map();

  register(handler: NotificationChannelHandler): void {
    this.handlers.set(handler.channel, handler);
  }

  get(channel: NotificationChannel): NotificationChannelHandler | undefined {
    return this.handlers.get(channel);
  }

  getAll(): NotificationChannelHandler[] {
    return Array.from(this.handlers.values());
  }

  unregister(channel: NotificationChannel): void {
    this.handlers.delete(channel);
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const channelManager = new ChannelManager();
