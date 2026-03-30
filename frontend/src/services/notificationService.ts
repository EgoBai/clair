/**
 * 前端通知服务
 * 处理通知的获取、标记已读、订阅等
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

export interface AppNotification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channels: NotificationChannel[];
  userId: string;
  read: boolean;
  status: string;
  createdAt: number;
  readAt?: number;
  expiresAt?: number;
  icon?: string;
  actionUrl?: string;
}

export interface NotificationStats {
  total: number;
  unread: number;
  byType: Record<NotificationType, number>;
  byPriority: Record<NotificationPriority, number>;
}

export interface NotificationPreferences {
  userId: string;
  globalEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  subscriptions: Array<{
    userId: string;
    type: NotificationType;
    channels: NotificationChannel[];
    enabled: boolean;
    createdAt: number;
    updatedAt: number;
  }>;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  dailyDigest: boolean;
  maxDailyNotifications: number;
}

export interface NotificationQuery {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
  type?: NotificationType;
  priority?: NotificationPriority;
  sortBy?: 'createdAt' | 'priority';
}

class NotificationApiService {
  private baseUrl = '/api/notifications';

  async getUserNotifications(userId: string, query?: NotificationQuery): Promise<AppNotification[]> {
    const params = new URLSearchParams();
    if (query?.limit) params.set('limit', String(query.limit));
    if (query?.offset) params.set('offset', String(query.offset));
    if (query?.unreadOnly) params.set('unreadOnly', 'true');
    if (query?.type) params.set('type', query.type);
    if (query?.priority) params.set('priority', query.priority);
    if (query?.sortBy) params.set('sortBy', query.sortBy);

    const res = await fetch(`${this.baseUrl}/user/${userId}?${params}`);
    const json = await res.json();
    return json.data;
  }

  async getNotification(id: string): Promise<AppNotification> {
    const res = await fetch(`${this.baseUrl}/${id}`);
    const json = await res.json();
    return json.data;
  }

  async createNotification(params: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    priority?: NotificationPriority;
    channels?: NotificationChannel[];
    data?: Record<string, unknown>;
    expiresInSeconds?: number;
    icon?: string;
    actionUrl?: string;
  }): Promise<AppNotification> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const json = await res.json();
    return json.data;
  }

  async markAsRead(id: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/${id}/read`, { method: 'PATCH' });
    return res.ok;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const res = await fetch(`${this.baseUrl}/user/${userId}/read-all`, { method: 'PATCH' });
    const json = await res.json();
    return parseInt(json.message.match(/\d+/)?.[0] || '0', 10);
  }

  async deleteNotification(id: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/${id}`, { method: 'DELETE' });
    return res.ok;
  }

  async clearUserNotifications(userId: string): Promise<number> {
    const res = await fetch(`${this.baseUrl}/user/${userId}/clear`, { method: 'DELETE' });
    const json = await res.json();
    return parseInt(json.message.match(/\d+/)?.[0] || '0', 10);
  }

  async getStats(userId: string): Promise<NotificationStats> {
    const res = await fetch(`${this.baseUrl}/user/${userId}/stats`);
    const json = await res.json();
    return json.data;
  }

  async getUnreadCount(userId: string): Promise<number> {
    const res = await fetch(`${this.baseUrl}/user/${userId}/unread-count`);
    const json = await res.json();
    return json.data.count;
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const res = await fetch(`${this.baseUrl}/user/${userId}/preferences`);
    const json = await res.json();
    return json.data;
  }

  async updatePreferences(userId: string, prefs: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    const res = await fetch(`${this.baseUrl}/user/${userId}/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    });
    const json = await res.json();
    return json.data;
  }
}

export const notificationApi = new NotificationApiService();

// 通知图标映射
export const NOTIFICATION_ICONS: Record<NotificationType, string> = {
  price_alert: '📈',
  news: '📰',
  system: '⚙️',
  trade: '💰',
  report: '📋',
  watchlist_update: '⭐',
  limit_up: '🔴',
  limit_down: '🟢',
  volume_surge: '📊',
};

// 通知类型标签
export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  price_alert: '价格预警',
  news: '新闻资讯',
  system: '系统通知',
  trade: '交易通知',
  report: '报告',
  watchlist_update: '自选更新',
  limit_up: '涨停通知',
  limit_down: '跌停通知',
  volume_surge: '放量异动',
};

// 优先级颜色
export const PRIORITY_COLORS: Record<NotificationPriority, string> = {
  urgent: '#ff4d4f',
  high: '#fa8c16',
  medium: '#1890ff',
  low: '#8c8c8c',
};

// 格式化时间
export function formatNotificationTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}天前`;

  return new Date(timestamp).toLocaleDateString('zh-CN');
}
