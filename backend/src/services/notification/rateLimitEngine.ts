/**
 * 通知限频优化引擎
 * 支持多级限频、自适应调整、优先级豁免、智能降噪
 */

import { NotificationType, NotificationPriority } from './types';

/** 限频级别 */
export type RateLimitLevel = 'user' | 'type' | 'global';

/** 限频规则 */
export interface RateLimitRule {
  id: string;
  level: RateLimitLevel;
  target: string;           // userId, type名, 或 'global'
  maxPerMinute: number;
  maxPerHour: number;
  maxPerDay: number;
  // 优先级豁免
  exemptPriorities: NotificationPriority[];
  // 自适应
  adaptiveEnabled: boolean;
  burstAllowance: number;   // 允许的突发数量
  burstWindowMs: number;    // 窗口时间
}

/** 限频计数器 */
interface RateLimitCounter {
  minute: { count: number; resetAt: number };
  hour: { count: number; resetAt: number };
  day: { count: number; resetAt: number };
  burst: number[];          // 时间戳数组
}

/** 限频结果 */
export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  ruleId?: string;
  currentCount: number;
  limit: number;
  resetAt: number;
  retryAfterMs?: number;
}

/** 限频统计 */
export interface RateLimitStats {
  totalChecked: number;
  totalAllowed: number;
  totalBlocked: number;
  blockRate: number;
  byLevel: Record<RateLimitLevel, { checked: number; blocked: number }>;
  byType: Record<string, { checked: number; blocked: number }>;
}

/** 自适应配置 */
export interface AdaptiveConfig {
  enabled: boolean;
  highLoadThreshold: number;    // 高负载阈值（每分钟请求数）
  reductionFactor: number;      // 高负载时减少比例 (0-1)
  recoveryIntervalMs: number;   // 恢复间隔
}

export class RateLimitEngine {
  private rules: Map<string, RateLimitRule> = new Map();
  private counters: Map<string, RateLimitCounter> = new Map();
  private stats: RateLimitStats = {
    totalChecked: 0,
    totalAllowed: 0,
    totalBlocked: 0,
    blockRate: 0,
    byLevel: { user: { checked: 0, blocked: 0 }, type: { checked: 0, blocked: 0 }, global: { checked: 0, blocked: 0 } },
    byType: {},
  };
  private adaptiveConfig: AdaptiveConfig;
  private globalRequestTimestamps: number[] = [];

  constructor(adaptiveConfig: Partial<AdaptiveConfig> = {}) {
    this.adaptiveConfig = {
      enabled: true,
      highLoadThreshold: 1000,
      reductionFactor: 0.5,
      recoveryIntervalMs: 60000,
      ...adaptiveConfig,
    };
  }

  // ========== 规则管理 ==========

  /** 添加规则 */
  addRule(rule: Omit<RateLimitRule, 'id'>): RateLimitRule {
    const fullRule: RateLimitRule = {
      ...rule,
      id: `rl_${rule.level}_${rule.target}_${Date.now()}`,
    };
    this.rules.set(fullRule.id, fullRule);
    return fullRule;
  }

  /** 删除规则 */
  removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  /** 获取规则 */
  getRule(ruleId: string): RateLimitRule | undefined {
    return this.rules.get(ruleId);
  }

  /** 获取所有规则 */
  getAllRules(): RateLimitRule[] {
    return Array.from(this.rules.values());
  }

  // ========== 核心限频 ==========

  /** 检查是否允许发送 */
  check(
    userId: string,
    type: NotificationType,
    priority: NotificationPriority
  ): RateLimitResult {
    this.stats.totalChecked++;
    this.stats.byLevel.user.checked++;
    this.stats.byLevel.type.checked++;
    this.stats.byLevel.global.checked++;
    this.stats.byType[type] = this.stats.byType[type] || { checked: 0, blocked: 0 };
    this.stats.byType[type].checked++;

    // 记录全局请求
    this.recordGlobalRequest();

    // 检查自适应限频
    if (this.adaptiveConfig.enabled && this.isHighLoad()) {
      // 高负载下随机拒绝低优先级
      if (priority === 'low' && Math.random() < this.adaptiveConfig.reductionFactor) {
        this.recordBlock('user');
        return {
          allowed: false,
          reason: 'adaptive_high_load',
          currentCount: 0,
          limit: 0,
          resetAt: Date.now() + this.adaptiveConfig.recoveryIntervalMs,
          retryAfterMs: this.adaptiveConfig.recoveryIntervalMs,
        };
      }
    }

    // 检查用户级别限频
    const userResult = this.checkLevel('user', userId, priority);
    if (!userResult.allowed) {
      this.recordBlock('user');
      return userResult;
    }

    // 检查类型级别限频
    const typeResult = this.checkLevel('type', type, priority);
    if (!typeResult.allowed) {
      this.recordBlock('type');
      return typeResult;
    }

    // 检查全局限频
    const globalResult = this.checkLevel('global', 'global', priority);
    if (!globalResult.allowed) {
      this.recordBlock('global');
      return globalResult;
    }

    // 通过 — 记录计数
    this.incrementCounter(userId);
    this.incrementCounter(type);
    this.incrementCounter('global');

    this.stats.totalAllowed++;
    return {
      allowed: true,
      currentCount: userResult.currentCount + 1,
      limit: userResult.limit,
      resetAt: userResult.resetAt,
    };
  }

  /** 检查指定级别 */
  private checkLevel(
    level: RateLimitLevel,
    target: string,
    priority: NotificationPriority
  ): RateLimitResult {
    const rule = this.findRule(level, target);

    if (!rule) {
      return { allowed: true, currentCount: 0, limit: Infinity, resetAt: 0 };
    }

    // 优先级豁免
    if (rule.exemptPriorities.includes(priority)) {
      return { allowed: true, currentCount: 0, limit: Infinity, resetAt: 0 };
    }

    const counter = this.getOrCreateCounter(target);
    const now = Date.now();
    this.resetExpiredCounters(counter, now);

    // 检查突发
    if (rule.burstAllowance > 0) {
      counter.burst = counter.burst.filter(t => now - t < rule.burstWindowMs);
      if (counter.burst.length >= rule.burstAllowance) {
        return {
          allowed: false,
          reason: 'burst_limit',
          ruleId: rule.id,
          currentCount: counter.burst.length,
          limit: rule.burstAllowance,
          resetAt: counter.burst[0] + rule.burstWindowMs,
          retryAfterMs: counter.burst[0] + rule.burstWindowMs - now,
        };
      }
      counter.burst.push(now);
    }

    // 检查分钟限制
    if (counter.minute.count >= rule.maxPerMinute) {
      return {
        allowed: false,
        reason: 'per_minute',
        ruleId: rule.id,
        currentCount: counter.minute.count,
        limit: rule.maxPerMinute,
        resetAt: counter.minute.resetAt,
        retryAfterMs: counter.minute.resetAt - now,
      };
    }

    // 检查小时限制
    if (counter.hour.count >= rule.maxPerHour) {
      return {
        allowed: false,
        reason: 'per_hour',
        ruleId: rule.id,
        currentCount: counter.hour.count,
        limit: rule.maxPerHour,
        resetAt: counter.hour.resetAt,
        retryAfterMs: counter.hour.resetAt - now,
      };
    }

    // 检查日限制
    if (counter.day.count >= rule.maxPerDay) {
      return {
        allowed: false,
        reason: 'per_day',
        ruleId: rule.id,
        currentCount: counter.day.count,
        limit: rule.maxPerDay,
        resetAt: counter.day.resetAt,
        retryAfterMs: counter.day.resetAt - now,
      };
    }

    return {
      allowed: true,
      currentCount: counter.minute.count,
      limit: rule.maxPerMinute,
      resetAt: counter.minute.resetAt,
    };
  }

  // ========== 内部方法 ==========

  private findRule(level: RateLimitLevel, target: string): RateLimitRule | undefined {
    return Array.from(this.rules.values()).find(r => r.level === level && r.target === target);
  }

  private getOrCreateCounter(target: string): RateLimitCounter {
    if (!this.counters.has(target)) {
      const now = Date.now();
      this.counters.set(target, {
        minute: { count: 0, resetAt: now + 60000 },
        hour: { count: 0, resetAt: now + 3600000 },
        day: { count: 0, resetAt: this.getEndOfDay() },
        burst: [],
      });
    }
    return this.counters.get(target)!;
  }

  private resetExpiredCounters(counter: RateLimitCounter, now: number): void {
    if (now >= counter.minute.resetAt) {
      counter.minute = { count: 0, resetAt: now + 60000 };
    }
    if (now >= counter.hour.resetAt) {
      counter.hour = { count: 0, resetAt: now + 3600000 };
    }
    if (now >= counter.day.resetAt) {
      counter.day = { count: 0, resetAt: this.getEndOfDay() };
    }
  }

  private incrementCounter(target: string): void {
    const counter = this.getOrCreateCounter(target);
    counter.minute.count++;
    counter.hour.count++;
    counter.day.count++;
  }

  private getEndOfDay(): number {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return end.getTime();
  }

  private recordGlobalRequest(): void {
    const now = Date.now();
    this.globalRequestTimestamps.push(now);
    // 保留最近5分钟
    this.globalRequestTimestamps = this.globalRequestTimestamps.filter(t => now - t < 300000);
  }

  private isHighLoad(): boolean {
    const oneMinuteAgo = Date.now() - 60000;
    const recentRequests = this.globalRequestTimestamps.filter(t => t > oneMinuteAgo).length;
    return recentRequests > this.adaptiveConfig.highLoadThreshold;
  }

  private recordBlock(level: RateLimitLevel): void {
    this.stats.totalBlocked++;
    this.stats.byLevel[level].blocked++;
    this.stats.blockRate = this.stats.totalBlocked / this.stats.totalChecked;
  }

  // ========== 查询 ==========

  /** 获取当前计数 */
  getCurrentCount(target: string): { minute: number; hour: number; day: number } {
    const counter = this.counters.get(target);
    if (!counter) return { minute: 0, hour: 0, day: 0 };
    this.resetExpiredCounters(counter, Date.now());
    return {
      minute: counter.minute.count,
      hour: counter.hour.count,
      day: counter.day.count,
    };
  }

  /** 获取统计 */
  getStats(): RateLimitStats {
    return { ...this.stats };
  }

  /** 重置统计 */
  resetStats(): void {
    this.stats = {
      totalChecked: 0,
      totalAllowed: 0,
      totalBlocked: 0,
      blockRate: 0,
      byLevel: { user: { checked: 0, blocked: 0 }, type: { checked: 0, blocked: 0 }, global: { checked: 0, blocked: 0 } },
      byType: {},
    };
  }

  /** 清空 */
  clear(): void {
    this.rules.clear();
    this.counters.clear();
    this.globalRequestTimestamps = [];
    this.resetStats();
  }
}

export const rateLimitEngine = new RateLimitEngine();
