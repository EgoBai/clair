/**
 * 通知系统 - 类型定义
 */

export type NotificationType =
  | 'price_alert'
  | 'news'
  | 'system'
  | 'trade'
  | 'report'
  | 'watchlist_update'
  | 'limit_up'
  | 'limit_down'
  | 'volume_surge';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

export type NotificationChannel = 'push' | 'email' | 'sms' | 'websocket' | 'in_app';

export type NotificationStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'expired';

export interface NotificationPayload {
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

export interface NotificationTemplate {
  id: string;
  type: NotificationType;
  titleTemplate: string;
  bodyTemplate: string;
  defaultChannels: NotificationChannel[];
  defaultPriority: NotificationPriority;
  icon?: string;
  actionUrlTemplate?: string;
  enabled: boolean;
}

export interface NotificationSubscription {
  userId: string;
  type: NotificationType;
  channels: NotificationChannel[];
  enabled: boolean;
  quietHoursStart?: string; // HH:mm
  quietHoursEnd?: string;
  createdAt: number;
  updatedAt: number;
}

export interface NotificationPreferences {
  userId: string;
  globalEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  subscriptions: NotificationSubscription[];
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  dailyDigest: boolean;
  maxDailyNotifications: number;
  createdAt: number;
  updatedAt: number;
}

export interface NotificationStats {
  total: number;
  unread: number;
  byType: Record<NotificationType, number>;
  byPriority: Record<NotificationPriority, number>;
}

export interface BatchNotificationRequest {
  userIds: string[];
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channels?: NotificationChannel[];
  priority?: NotificationPriority;
}

export interface NotificationChannelHandler {
  channel: NotificationChannel;
  send: (notification: NotificationPayload) => Promise<boolean>;
}
