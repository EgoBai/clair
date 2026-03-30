/**
 * 通知聚合与摘要引擎
 * 将多个通知聚合为摘要报告，支持定时摘要、按需摘要、智能摘要
 */

import { NotificationPayload, NotificationType } from './types';

/** 摘要类型 */
export type DigestType = 'immediate' | 'hourly' | 'daily' | 'weekly' | 'on_demand';

/** 摘要报告 */
export interface DigestReport {
  id: string;
  userId: string;
  type: DigestType;
  title: string;
  notifications: NotificationPayload[];
  count: number;
  periodStart: number;
  periodEnd: number;
  generatedAt: number;
  // 统计
  byType: Record<NotificationType, number>;
  byPriority: Record<string, number>;
  unreadCount: number;
  // 摘要内容
  highlights: string[];     // 重要事项
  summary: string;          // 文本摘要
}

/** 聚合配置 */
export interface AggregationConfig {
  maxNotificationsPerDigest: number;
  highlightThreshold: 'high' | 'urgent'; // 高于此优先级的通知成为亮点
  includeRead: boolean;
}

const DEFAULT_CONFIG: AggregationConfig = {
  maxNotificationsPerDigest: 100,
  highlightThreshold: 'high',
  includeRead: false,
};

const TYPE_LABELS: Record<NotificationType, string> = {
  price_alert: '价格预警', news: '新闻', system: '系统通知',
  trade: '交易通知', report: '报告', watchlist_update: '自选更新',
  limit_up: '涨停', limit_down: '跌停', volume_surge: '放量异动',
};

export class DigestEngine {
  private notifications: Map<string, NotificationPayload[]> = new Map(); // userId -> notifications
  private digests: Map<string, DigestReport> = new Map();
  private config: AggregationConfig;

  constructor(config: Partial<AggregationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 添加通知 */
  addNotification(notification: NotificationPayload): void {
    if (!this.notifications.has(notification.userId)) {
      this.notifications.set(notification.userId, []);
    }
    this.notifications.get(notification.userId)!.push(notification);
  }

  /** 批量添加 */
  addNotifications(notifications: NotificationPayload[]): void {
    notifications.forEach(n => this.addNotification(n));
  }

  /** 生成即时摘要 */
  generateImmediateDigest(userId: string, notifications: NotificationPayload[]): DigestReport {
    return this.buildDigest(userId, 'immediate', notifications, Date.now() - 3600000, Date.now());
  }

  /** 生成小时摘要 */
  generateHourlyDigest(userId: string): DigestReport | null {
    const now = Date.now();
    const hourAgo = now - 3600000;
    return this.generateDigestForPeriod(userId, 'hourly', hourAgo, now);
  }

  /** 生成每日摘要 */
  generateDailyDigest(userId: string): DigestReport | null {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return this.generateDigestForPeriod(userId, 'daily', startOfDay, now.getTime());
  }

  /** 按需摘要 */
  generateOnDemandDigest(
    userId: string,
    options: {
      startTime?: number;
      endTime?: number;
      types?: NotificationType[];
      unreadOnly?: boolean;
    } = {}
  ): DigestReport | null {
    const end = options.endTime || Date.now();
    const start = options.startTime || end - 86400000; // 默认最近24小时
    let items = this.getNotificationsInPeriod(userId, start, end);

    if (options.types && options.types.length > 0) {
      items = items.filter(n => options.types!.includes(n.type));
    }
    if (options.unreadOnly) {
      items = items.filter(n => !n.read);
    }

    if (items.length === 0) return null;
    return this.buildDigest(userId, 'on_demand', items, start, end);
  }

  /** 生成周期摘要 */
  private generateDigestForPeriod(
    userId: string,
    type: DigestType,
    start: number,
    end: number
  ): DigestReport | null {
    const items = this.getNotificationsInPeriod(userId, start, end);
    if (items.length === 0) return null;
    return this.buildDigest(userId, type, items, start, end);
  }

  /** 获取时间段内的通知 */
  private getNotificationsInPeriod(userId: string, start: number, end: number): NotificationPayload[] {
    const all = this.notifications.get(userId) || [];
    return all.filter(n => {
      if (n.createdAt < start || n.createdAt > end) return false;
      if (!this.config.includeRead && n.read) return false;
      return true;
    }).slice(0, this.maxNotificationsPerDigest());
  }

  /** 构建摘要报告 */
  private buildDigest(
    userId: string,
    type: DigestType,
    notifications: NotificationPayload[],
    periodStart: number,
    periodEnd: number
  ): DigestReport {
    // 统计
    const byType: Partial<Record<NotificationType, number>> = {};
    const byPriority: Record<string, number> = {};
    let unreadCount = 0;

    for (const n of notifications) {
      byType[n.type] = (byType[n.type] || 0) + 1;
      byPriority[n.priority] = (byPriority[n.priority] || 0) + 1;
      if (!n.read) unreadCount++;
    }

    // 高亮
    const priorityLevel = this.config.highlightThreshold === 'urgent' ? 0 : 1;
    const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    const highlights = notifications
      .filter(n => (priorityOrder[n.priority] || 3) <= priorityLevel)
      .slice(0, 5)
      .map(n => n.title);

    // 文本摘要
    const typeEntries = Object.entries(byType) as [NotificationType, number][];
    const summary = typeEntries
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `${TYPE_LABELS[type]}×${count}`)
      .join(', ');

    const report: DigestReport = {
      id: `digest_${userId}_${type}_${Date.now()}`,
      userId,
      type,
      title: this.getDigestTitle(type, periodStart),
      notifications,
      count: notifications.length,
      periodStart,
      periodEnd,
      generatedAt: Date.now(),
      byType: byType as Record<NotificationType, number>,
      byPriority,
      unreadCount,
      highlights,
      summary: `共${notifications.length}条通知: ${summary}`,
    };

    this.digests.set(report.id, report);
    return report;
  }

  private getDigestTitle(type: DigestType, periodStart: number): string {
    const date = new Date(periodStart).toLocaleDateString('zh-CN');
    switch (type) {
      case 'immediate': return '即时通知摘要';
      case 'hourly': return `小时摘要 - ${new Date(periodStart).toLocaleTimeString('zh-CN')}`;
      case 'daily': return `每日摘要 - ${date}`;
      case 'weekly': return `每周摘要 - ${date}`;
      case 'on_demand': return '自定义摘要';
      default: return '通知摘要';
    }
  }

  private maxNotificationsPerDigest(): number {
    return this.config.maxNotificationsPerDigest;
  }

  // ========== 查询 ==========

  /** 获取用户所有摘要 */
  getDigests(userId: string): DigestReport[] {
    return Array.from(this.digests.values())
      .filter(d => d.userId === userId)
      .sort((a, b) => b.generatedAt - a.generatedAt);
  }

  /** 获取最新摘要 */
  getLatestDigest(userId: string, type?: DigestType): DigestReport | undefined {
    return this.getDigests(userId).find(d => !type || d.type === type);
  }

  /** 清空 */
  clear(): void {
    this.notifications.clear();
    this.digests.clear();
  }
}

export const digestEngine = new DigestEngine();
