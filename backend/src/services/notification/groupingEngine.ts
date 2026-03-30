/**
 * 通知分组引擎
 * 支持按类型/时间窗口/股票/优先级分组，智能合并相似通知
 */

import { NotificationPayload, NotificationType, NotificationPriority } from './types';

/** 分组策略 */
export type GroupingStrategy =
  | 'by_type'          // 按通知类型
  | 'by_stock'         // 按关联股票
  | 'by_priority'      // 按优先级
  | 'by_time_window'   // 按时间窗口
  | 'smart';           // 智能分组（组合策略）

/** 通知分组 */
export interface NotificationGroup {
  id: string;
  key: string;                // 分组键
  strategy: GroupingStrategy;
  notifications: NotificationPayload[];
  count: number;
  latestAt: number;
  earliestAt: number;
  title: string;              // 分组标题
  summary: string;            // 分组摘要
  priority: NotificationPriority;
  read: boolean;
  collapsed: boolean;         // 是否折叠显示
}

/** 分组配置 */
export interface GroupingConfig {
  strategy: GroupingStrategy;
  timeWindowMs?: number;      // 时间窗口（用于by_time_window）
  maxGroupSize?: number;      // 单组最大通知数
  autoCollapseThreshold?: number; // 自动折叠阈值
  mergeReadStatus?: boolean;  // 是否合并已读状态
}

/** 分组统计 */
export interface GroupingStats {
  totalGroups: number;
  totalNotifications: number;
  avgGroupSize: number;
  largestGroup: number;
  groupsByStrategy: Record<string, number>;
}

/** 默认配置 */
const DEFAULT_CONFIG: GroupingConfig = {
  strategy: 'by_type',
  timeWindowMs: 5 * 60 * 1000, // 5分钟
  maxGroupSize: 50,
  autoCollapseThreshold: 3,
  mergeReadStatus: true,
};

/** 通知类型中文标签 */
const TYPE_LABELS: Record<NotificationType, string> = {
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

export class NotificationGroupingEngine {
  private groups: Map<string, NotificationGroup> = new Map();
  private config: GroupingConfig;

  constructor(config: Partial<GroupingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 更新配置 */
  updateConfig(config: Partial<GroupingConfig>): void {
    this.config = { ...this.config, ...config };
    this.rebuild();
  }

  /** 添加通知到分组 */
  addNotification(notification: NotificationPayload): NotificationGroup {
    const key = this.getGroupKey(notification);
    let group = this.groups.get(key);

    if (!group) {
      group = this.createGroup(key, notification);
      this.groups.set(key, group);
    }

    group.notifications.push(notification);
    group.count++;
    group.latestAt = Math.max(group.latestAt, notification.createdAt);
    group.earliestAt = Math.min(group.earliestAt, notification.createdAt);

    // 更新优先级（取最高）
    const priorityOrder: Record<NotificationPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    if (priorityOrder[notification.priority] < priorityOrder[group.priority]) {
      group.priority = notification.priority;
    }

    // 更新已读状态
    if (this.config.mergeReadStatus) {
      group.read = group.notifications.every(n => n.read);
    }

    // 更新摘要
    group.summary = this.generateSummary(group);

    // 自动折叠
    if (this.config.autoCollapseThreshold && group.count >= this.config.autoCollapseThreshold) {
      group.collapsed = true;
    }

    // 限制组大小
    if (this.config.maxGroupSize && group.count > this.config.maxGroupSize) {
      // 移除最旧的通知
      group.notifications.sort((a, b) => b.createdAt - a.createdAt);
      group.notifications = group.notifications.slice(0, this.config.maxGroupSize);
      group.count = group.notifications.length;
    }

    return group;
  }

  /** 批量添加 */
  addNotifications(notifications: NotificationPayload[]): NotificationGroup[] {
    const groups = new Map<string, NotificationGroup>();
    for (const n of notifications) {
      const group = this.addNotification(n);
      groups.set(group.id, group);
    }
    return Array.from(groups.values());
  }

  /** 获取分组键 */
  private getGroupKey(notification: NotificationPayload): string {
    switch (this.config.strategy) {
      case 'by_type':
        return `type:${notification.type}`;

      case 'by_stock': {
        const symbol = (notification.data?.symbol as string) || 'general';
        return `stock:${symbol}`;
      }

      case 'by_priority':
        return `priority:${notification.priority}`;

      case 'by_time_window': {
        const window = this.config.timeWindowMs || 300000;
        const windowStart = Math.floor(notification.createdAt / window) * window;
        return `time:${windowStart}`;
      }

      case 'smart': {
        // 智能分组：市场事件按股票，其他按类型
        if (['limit_up', 'limit_down', 'volume_surge', 'price_alert'].includes(notification.type)) {
          const symbol = (notification.data?.symbol as string) || 'unknown';
          return `smart:market:${symbol}`;
        }
        return `smart:${notification.type}`;
      }

      default:
        return `type:${notification.type}`;
    }
  }

  /** 创建分组 */
  private createGroup(key: string, notification: NotificationPayload): NotificationGroup {
    const [strategy] = key.split(':');
    const label = this.getGroupLabel(key, notification);

    return {
      id: `group_${key.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`,
      key,
      strategy: this.config.strategy,
      notifications: [],
      count: 0,
      latestAt: notification.createdAt,
      earliestAt: notification.createdAt,
      title: label,
      summary: '',
      priority: notification.priority,
      read: notification.read,
      collapsed: false,
    };
  }

  /** 获取分组标签 */
  private getGroupLabel(key: string, notification: NotificationPayload): string {
    const [prefix, value] = key.split(':');

    switch (prefix) {
      case 'type':
        return TYPE_LABELS[value as NotificationType] || value;
      case 'stock':
        return value === 'general' ? '通用通知' : `${notification.data?.name || value} 相关`;
      case 'priority': {
        const labels: Record<string, string> = { urgent: '紧急通知', high: '重要通知', medium: '一般通知', low: '低优先级' };
        return labels[value] || value;
      }
      case 'time':
        return `${new Date(Number(value)).toLocaleTimeString('zh-CN')} 时段`;
      case 'smart': {
        if (value === 'market') {
          const [, symbol] = key.split(':').slice(1);
          return `市场事件 - ${notification.data?.name || symbol}`;
        }
        return `智能分组 - ${TYPE_LABELS[value as NotificationType] || value}`;
      }
      default:
        return '通知分组';
    }
  }

  /** 生成摘要 */
  private generateSummary(group: NotificationGroup): string {
    if (group.count === 1) return group.notifications[0].title;

    const typeCounts: Partial<Record<NotificationType, number>> = {};
    for (const n of group.notifications) {
      typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
    }

    const parts = Object.entries(typeCounts).map(([type, count]) => {
      return `${TYPE_LABELS[type as NotificationType]}×${count}`;
    });

    return `${group.count}条通知: ${parts.join(', ')}`;
  }

  // ========== 查询 ==========

  /** 获取所有分组 */
  getAllGroups(): NotificationGroup[] {
    return Array.from(this.groups.values())
      .sort((a, b) => b.latestAt - a.latestAt);
  }

  /** 按键获取分组 */
  getGroup(key: string): NotificationGroup | undefined {
    return this.groups.get(key);
  }

  /** 获取未读分组 */
  getUnreadGroups(): NotificationGroup[] {
    return this.getAllGroups().filter(g => !g.read);
  }

  /** 获取折叠的分组 */
  getCollapsedGroups(): NotificationGroup[] {
    return this.getAllGroups().filter(g => g.collapsed);
  }

  /** 标记分组已读 */
  markGroupRead(key: string): boolean {
    const group = this.groups.get(key);
    if (!group) return false;
    group.read = true;
    group.notifications.forEach(n => { n.read = true; n.readAt = Date.now(); });
    return true;
  }

  /** 全部标记已读 */
  markAllRead(): number {
    let count = 0;
    for (const group of this.groups.values()) {
      if (!group.read) {
        group.read = true;
        group.notifications.forEach(n => { n.read = true; n.readAt = Date.now(); });
        count += group.count;
      }
    }
    return count;
  }

  /** 展开/折叠分组 */
  toggleCollapse(key: string): boolean {
    const group = this.groups.get(key);
    if (!group) return false;
    group.collapsed = !group.collapsed;
    return group.collapsed;
  }

  /** 获取统计 */
  getStats(): GroupingStats {
    const groups = this.getAllGroups();
    const totalNotifications = groups.reduce((sum, g) => sum + g.count, 0);
    const largestGroup = groups.reduce((max, g) => Math.max(max, g.count), 0);

    const groupsByStrategy: Record<string, number> = {};
    for (const g of groups) {
      groupsByStrategy[g.strategy] = (groupsByStrategy[g.strategy] || 0) + 1;
    }

    return {
      totalGroups: groups.length,
      totalNotifications,
      avgGroupSize: groups.length > 0 ? totalNotifications / groups.length : 0,
      largestGroup,
      groupsByStrategy,
    };
  }

  /** 重建分组 */
  private rebuild(): void {
    const allNotifications = Array.from(this.groups.values())
      .flatMap(g => g.notifications);
    this.groups.clear();
    this.addNotifications(allNotifications);
  }

  /** 清空 */
  clear(): void {
    this.groups.clear();
  }
}

export const notificationGroupingEngine = new NotificationGroupingEngine();
