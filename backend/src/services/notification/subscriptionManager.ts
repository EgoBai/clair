/**
 * 订阅管理引擎
 * 管理用户通知订阅、主题订阅、股票订阅，支持条件规则和智能推荐
 */

import { NotificationType, NotificationChannel } from './types';

/** 订阅类型 */
export type SubscriptionType =
  | 'stock_price'        // 股票价格变动
  | 'stock_volume'       // 股票成交量异动
  | 'stock_limit'        // 涨跌停
  | 'index_change'       // 指数变动
  | 'sector_rotation'    // 板块轮动
  | 'news_keyword'       // 关键词新闻
  | 'financial_report'   // 财报发布
  | 'dividend'           // 分红除权
  | 'block_trade'        // 大宗交易
  | 'margin_change'      // 融资融券变动
  | 'northbound_flow'    // 北向资金
  | 'market_open_close'; // 开盘收盘提醒

/** 订阅条件 */
export interface SubscriptionCondition {
  field: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'contains' | 'in';
  value: unknown;
}

/** 订阅规则 */
export interface SubscriptionRule {
  id: string;
  userId: string;
  type: SubscriptionType;
  name: string;               // 用户自定义名称
  enabled: boolean;
  conditions: SubscriptionCondition[];
  channels: NotificationChannel[];
  priority: 'low' | 'medium' | 'high';
  // 关联数据
  symbol?: string;            // 股票代码
  keywords?: string[];        // 关键词（用于新闻订阅）
  sector?: string;            // 板块
  // 执行控制
  cooldownSeconds: number;    // 冷却时间（同规则不重复触发）
  maxTriggersPerDay: number;  // 每日最大触发次数
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  // 统计
  triggerCount: number;
  lastTriggeredAt?: number;
  createdAt: number;
  updatedAt: number;
}

/** 订阅触发记录 */
export interface SubscriptionTrigger {
  ruleId: string;
  triggeredAt: number;
  data: Record<string, unknown>;
  notificationId?: string;
}

/** 订阅统计 */
export interface SubscriptionStats {
  totalRules: number;
  activeRules: number;
  totalTriggers: number;
  triggersByType: Record<string, number>;
  topRules: Array<{ ruleId: string; name: string; triggers: number }>;
}

export class SubscriptionManager {
  private rules: Map<string, SubscriptionRule> = new Map();
  private userRules: Map<string, Set<string>> = new Map();
  private triggers: SubscriptionTrigger[] = [];
  private dailyTriggerCounts: Map<string, Map<string, number>> = new Map(); // date -> ruleId -> count
  private cooldowns: Map<string, number> = new Map(); // ruleId -> lastTriggerAt

  // ========== 规则管理 ==========

  /** 创建订阅规则 */
  createRule(rule: Omit<SubscriptionRule, 'id' | 'triggerCount' | 'createdAt' | 'updatedAt'>): SubscriptionRule {
    const fullRule: SubscriptionRule = {
      ...rule,
      id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      triggerCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.rules.set(fullRule.id, fullRule);

    if (!this.userRules.has(fullRule.userId)) {
      this.userRules.set(fullRule.userId, new Set());
    }
    this.userRules.get(fullRule.userId)!.add(fullRule.id);

    return fullRule;
  }

  /** 获取规则 */
  getRule(ruleId: string): SubscriptionRule | undefined {
    return this.rules.get(ruleId);
  }

  /** 获取用户所有规则 */
  getUserRules(userId: string): SubscriptionRule[] {
    const ruleIds = this.userRules.get(userId);
    if (!ruleIds) return [];
    return Array.from(ruleIds)
      .map(id => this.rules.get(id))
      .filter((r): r is SubscriptionRule => !!r);
  }

  /** 获取用户活跃规则 */
  getActiveUserRules(userId: string): SubscriptionRule[] {
    return this.getUserRules(userId).filter(r => r.enabled);
  }

  /** 更新规则 */
  updateRule(ruleId: string, updates: Partial<SubscriptionRule>): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;
    Object.assign(rule, updates, { updatedAt: Date.now() });
    return true;
  }

  /** 删除规则 */
  deleteRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    this.rules.delete(ruleId);
    const userSet = this.userRules.get(rule.userId);
    if (userSet) userSet.delete(ruleId);

    return true;
  }

  /** 启用/禁用规则 */
  toggleRule(ruleId: string, enabled: boolean): boolean {
    return this.updateRule(ruleId, { enabled });
  }

  /** 批量启用/禁用用户所有规则 */
  toggleAllUserRules(userId: string, enabled: boolean): number {
    const rules = this.getUserRules(userId);
    rules.forEach(r => { r.enabled = enabled; r.updatedAt = Date.now(); });
    return rules.length;
  }

  // ========== 触发评估 ==========

  /** 评估规则是否应触发 */
  evaluateRule(ruleId: string, data: Record<string, unknown>): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule || !rule.enabled) return false;

    // 检查冷却
    if (this.isInCooldown(ruleId, rule.cooldownSeconds)) return false;

    // 检查每日限制
    if (this.isDailyLimitReached(ruleId, rule.maxTriggersPerDay)) return false;

    // 检查静默时段
    if (rule.quietHoursEnabled && this.isInQuietHours(rule.quietHoursStart, rule.quietHoursEnd)) {
      return false;
    }

    // 评估条件
    return this.evaluateConditions(rule.conditions, data);
  }

  /** 触发规则 */
  triggerRule(ruleId: string, data: Record<string, unknown>): SubscriptionTrigger | null {
    if (!this.evaluateRule(ruleId, data)) return null;

    const rule = this.rules.get(ruleId)!;
    const trigger: SubscriptionTrigger = {
      ruleId,
      triggeredAt: Date.now(),
      data,
    };

    // 更新统计
    rule.triggerCount++;
    rule.lastTriggeredAt = Date.now();
    this.triggers.push(trigger);
    this.cooldowns.set(ruleId, Date.now());
    this.incrementDailyCount(ruleId);

    return trigger;
  }

  /** 批量评估所有用户规则 */
  evaluateAllUserRules(userId: string, data: Record<string, unknown>): SubscriptionTrigger[] {
    const rules = this.getActiveUserRules(userId);
    const triggers: SubscriptionTrigger[] = [];

    for (const rule of rules) {
      const trigger = this.triggerRule(rule.id, data);
      if (trigger) triggers.push(trigger);
    }

    return triggers;
  }

  // ========== 条件评估 ==========

  private evaluateConditions(conditions: SubscriptionCondition[], data: Record<string, unknown>): boolean {
    if (conditions.length === 0) return true; // 无条件则始终触发

    return conditions.every(cond => this.evaluateCondition(cond, data));
  }

  private evaluateCondition(condition: SubscriptionCondition, data: Record<string, unknown>): boolean {
    const actual = data[condition.field];
    const expected = condition.value;

    switch (condition.operator) {
      case 'gt': return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
      case 'lt': return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
      case 'gte': return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
      case 'lte': return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
      case 'eq': return actual === expected;
      case 'contains':
        if (typeof actual === 'string' && typeof expected === 'string') {
          return actual.includes(expected);
        }
        if (Array.isArray(actual)) {
          return actual.includes(expected);
        }
        return false;
      case 'in':
        if (Array.isArray(expected)) {
          return expected.includes(actual);
        }
        return false;
      default: return false;
    }
  }

  // ========== 控制逻辑 ==========

  private isInCooldown(ruleId: string, cooldownSeconds: number): boolean {
    const lastTrigger = this.cooldowns.get(ruleId);
    if (!lastTrigger) return false;
    return Date.now() - lastTrigger < cooldownSeconds * 1000;
  }

  private isDailyLimitReached(ruleId: string, maxPerDay: number): boolean {
    const today = new Date().toISOString().split('T')[0];
    const dailyCounts = this.dailyTriggerCounts.get(today);
    if (!dailyCounts) return false;
    return (dailyCounts.get(ruleId) || 0) >= maxPerDay;
  }

  private incrementDailyCount(ruleId: string): void {
    const today = new Date().toISOString().split('T')[0];
    if (!this.dailyTriggerCounts.has(today)) {
      this.dailyTriggerCounts.set(today, new Map());
    }
    const dailyCounts = this.dailyTriggerCounts.get(today)!;
    dailyCounts.set(ruleId, (dailyCounts.get(ruleId) || 0) + 1);
  }

  private isInQuietHours(start: string, end: string): boolean {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (start <= end) {
      return currentTime >= start && currentTime <= end;
    }
    // 跨午夜（如 23:00 - 07:00）
    return currentTime >= start || currentTime <= end;
  }

  // ========== 查询与统计 ==========

  /** 获取触发记录 */
  getTriggers(ruleId?: string, limit = 100): SubscriptionTrigger[] {
    let result = this.triggers;
    if (ruleId) {
      result = result.filter(t => t.ruleId === ruleId);
    }
    return result.slice(-limit);
  }

  /** 获取统计 */
  getStats(userId?: string): SubscriptionStats {
    const rules = userId
      ? this.getUserRules(userId)
      : Array.from(this.rules.values());

    const activeRules = rules.filter(r => r.enabled).length;
    const totalTriggers = rules.reduce((sum, r) => sum + r.triggerCount, 0);

    const triggersByType: Record<string, number> = {};
    rules.forEach(r => {
      triggersByType[r.type] = (triggersByType[r.type] || 0) + r.triggerCount;
    });

    const topRules = rules
      .map(r => ({ ruleId: r.id, name: r.name, triggers: r.triggerCount }))
      .sort((a, b) => b.triggers - a.triggers)
      .slice(0, 10);

    return {
      totalRules: rules.length,
      activeRules,
      totalTriggers,
      triggersByType,
      topRules,
    };
  }

  /** 推荐订阅（基于用户已有规则） */
  suggestSubscriptions(userId: string): Array<{ type: SubscriptionType; reason: string }> {
    const existing = this.getUserRules(userId);
    const existingTypes = new Set(existing.map(r => r.type));
    const suggestions: Array<{ type: SubscriptionType; reason: string }> = [];

    if (!existingTypes.has('stock_limit') && existingTypes.has('stock_price')) {
      suggestions.push({ type: 'stock_limit', reason: '您已有价格预警，建议添加涨跌停提醒' });
    }
    if (!existingTypes.has('northbound_flow')) {
      suggestions.push({ type: 'northbound_flow', reason: '北向资金是重要的市场风向标' });
    }
    if (!existingTypes.has('financial_report') && existing.some(r => r.symbol)) {
      suggestions.push({ type: 'financial_report', reason: '您关注的股票可能即将发布财报' });
    }
    if (!existingTypes.has('market_open_close')) {
      suggestions.push({ type: 'market_open_close', reason: '添加开盘收盘提醒不错过交易时间' });
    }

    return suggestions;
  }

  /** 清空 */
  clear(): void {
    this.rules.clear();
    this.userRules.clear();
    this.triggers = [];
    this.dailyTriggerCounts.clear();
    this.cooldowns.clear();
  }
}

export const subscriptionManager = new SubscriptionManager();
