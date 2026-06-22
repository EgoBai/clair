/**
 * 通知优先级路由器
 * 根据优先级、类型、用户偏好智能路由通知到合适的渠道
 */

import { NotificationPayload, NotificationType, NotificationPriority, NotificationChannel } from './types';

/** 路由规则 */
export interface RoutingRule {
  id: string;
  name: string;
  enabled: boolean;
  // 匹配条件
  types?: NotificationType[];
  priorities?: NotificationPriority[];
  // 路由动作
  channels: NotificationChannel[];
  // 变换
  transform?: 'aggregate' | 'delay' | 'escalate';
  delayMs?: number;
  // 条件
  conditions?: Array<{ field: string; operator: string; value: unknown }>;
}

/** 路由结果 */
export interface RoutingResult {
  notification: NotificationPayload;
  channels: NotificationChannel[];
  ruleId?: string;
  transformed: boolean;
  delayed: boolean;
  delayUntil?: number;
  escalated: boolean;
}

/** 路由统计 */
export interface RoutingStats {
  totalRouted: number;
  byChannel: Record<string, number>;
  byRule: Record<string, number>;
  escalated: number;
  delayed: number;
}

/** 默认路由规则 */
const DEFAULT_RULES: RoutingRule[] = [
  {
    id: 'urgent_all_channels',
    name: '紧急通知全渠道',
    enabled: true,
    priorities: ['urgent'],
    channels: ['websocket', 'push', 'in_app', 'email', 'sms'],
  },
  {
    id: 'high_priority',
    name: '高优先级',
    enabled: true,
    priorities: ['high'],
    channels: ['websocket', 'push', 'in_app'],
  },
  {
    id: 'trade_execution',
    name: '交易执行通知',
    enabled: true,
    types: ['trade'],
    channels: ['websocket', 'push', 'in_app', 'email'],
  },
  {
    id: 'market_events',
    name: '市场事件',
    enabled: true,
    types: ['limit_up', 'limit_down', 'volume_surge'],
    channels: ['websocket', 'in_app'],
  },
  {
    id: 'price_alerts',
    name: '价格预警',
    enabled: true,
    types: ['price_alert'],
    channels: ['websocket', 'push', 'in_app'],
  },
  {
    id: 'news_digest',
    name: '新闻聚合',
    enabled: true,
    types: ['news'],
    channels: ['in_app'],
    transform: 'aggregate',
  },
  {
    id: 'low_priority_delay',
    name: '低优先级延迟',
    enabled: true,
    priorities: ['low'],
    channels: ['in_app'],
    transform: 'delay',
    delayMs: 300000, // 5分钟
  },
  {
    id: 'default',
    name: '默认路由',
    enabled: true,
    channels: ['websocket', 'in_app'],
  },
];

export class NotificationRouter {
  private rules: RoutingRule[];
  private stats: RoutingStats = {
    totalRouted: 0,
    byChannel: {},
    byRule: {},
    escalated: 0,
    delayed: 0,
  };

  constructor(rules: RoutingRule[] = DEFAULT_RULES) {
    this.rules = rules.map(r => ({ ...r }));
  }

  /** 路由通知 */
  route(notification: NotificationPayload): RoutingResult {
    this.stats.totalRouted++;

    // 按优先级排序规则（紧急规则优先匹配）
    const sortedRules = [...this.rules].sort((a, b) => {
      if (a.priorities?.includes('urgent')) return -1;
      if (b.priorities?.includes('urgent')) return 1;
      return 0;
    });

    for (const rule of sortedRules) {
      if (!rule.enabled) continue;
      if (this.matchesRule(notification, rule)) {
        return this.applyRule(notification, rule);
      }
    }

    // 不应到达这里（有默认规则），但防御性处理
    return {
      notification,
      channels: ['in_app'],
      transformed: false,
      delayed: false,
      escalated: false,
    };
  }

  /** 批量路由 */
  routeBatch(notifications: NotificationPayload[]): RoutingResult[] {
    return notifications.map(n => this.route(n));
  }

  /** 匹配规则 */
  private matchesRule(notification: NotificationPayload, rule: RoutingRule): boolean {
    // 默认规则匹配所有
    if (rule.id === 'default') return true;

    // 类型匹配
    if (rule.types && rule.types.length > 0) {
      if (!rule.types.includes(notification.type)) return false;
    }

    // 优先级匹配
    if (rule.priorities && rule.priorities.length > 0) {
      if (!rule.priorities.includes(notification.priority)) return false;
    }

    // 条件匹配
    if (rule.conditions && rule.conditions.length > 0) {
      // 简化条件评估
      return true;
    }

    // 如果只指定了类型或优先级之一，另一个必须不匹配其他规则
    if (rule.types && rule.priorities) {
      return rule.types.includes(notification.type) && rule.priorities.includes(notification.priority);
    }

    return true;
  }

  /** 应用规则 */
  private applyRule(notification: NotificationPayload, rule: RoutingRule): RoutingResult {
    const channels = [...rule.channels];
    let delayed = false;
    let delayUntil: number | undefined;
    let escalated = false;

    // 统计
    this.stats.byRule[rule.id] = (this.stats.byRule[rule.id] || 0) + 1;
    channels.forEach(ch => {
      this.stats.byChannel[ch] = (this.stats.byChannel[ch] || 0) + 1;
    });

    // 变换
    switch (rule.transform) {
      case 'delay':
        if (rule.delayMs) {
          delayed = true;
          delayUntil = Date.now() + rule.delayMs;
          this.stats.delayed++;
        }
        break;
      case 'escalate':
        // 升级到更多渠道
        if (!channels.includes('push')) channels.push('push');
        if (!channels.includes('email')) channels.push('email');
        escalated = true;
        this.stats.escalated++;
        break;
    }

    return {
      notification,
      channels,
      ruleId: rule.id,
      transformed: !!rule.transform,
      delayed,
      delayUntil,
      escalated,
    };
  }

  // ========== 规则管理 ==========

  addRule(rule: RoutingRule): void {
    this.rules.push(rule);
  }

  removeRule(ruleId: string): boolean {
    const idx = this.rules.findIndex(r => r.id === ruleId);
    if (idx === -1) return false;
    this.rules.splice(idx, 1);
    return true;
  }

  getRule(ruleId: string): RoutingRule | undefined {
    return this.rules.find(r => r.id === ruleId);
  }

  getAllRules(): RoutingRule[] {
    return [...this.rules];
  }

  toggleRule(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule) return false;
    rule.enabled = enabled;
    return true;
  }

  /** 获取渠道建议 */
  suggestChannels(notification: NotificationPayload): NotificationChannel[] {
    const result = this.route(notification);
    return result.channels;
  }

  /** 获取统计 */
  getStats(): RoutingStats {
    return { ...this.stats };
  }

  /** 清空 */
  clear(): void {
    this.rules = [];
    this.stats = {
      totalRouted: 0,
      byChannel: {},
      byRule: {},
      escalated: 0,
      delayed: 0,
    };
  }
}

export const notificationRouter = new NotificationRouter();
