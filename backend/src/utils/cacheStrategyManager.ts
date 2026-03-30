/**
 * 缓存策略管理器
 * 统一管理预热、失效、一致性、监控
 * Round 97: 缓存完善
 */

import { multiLevelCache } from './multiLevelCache.js';
import { queryCache } from './queryCache.js';

// 预热策略
export interface WarmupStrategy {
  name: string;
  pattern: string;
  loader: () => Promise<any>;
  ttl: number;
  tags: string[];
  priority: number; // 1-10, 越高越先执行
  schedule?: string; // cron-like: 'market-open', 'market-close', 'daily'
}

// 失效策略
export interface InvalidationRule {
  name: string;
  trigger: 'time' | 'event' | 'dependency' | 'threshold';
  pattern: string;
  condition?: () => boolean;
  maxAge?: number; // ms
  dependencies?: string[]; // 依赖的其他缓存key前缀
}

// 一致性检查
export interface ConsistencyCheck {
  name: string;
  keys: string[];
  validator: (values: any[]) => boolean;
  repair?: () => Promise<void>;
  interval: number; // ms
}

// 缓存事件
export type CacheEventType = 'hit' | 'miss' | 'set' | 'delete' | 'evict' | 'warmup' | 'invalidate' | 'error';

export interface CacheEvent {
  type: CacheEventType;
  key: string;
  timestamp: number;
  level?: 'L1' | 'L2' | 'both';
  metadata?: Record<string, any>;
}

// 监控快照
export interface MonitoringSnapshot {
  timestamp: number;
  l1HitRate: number;
  l2HitRate: number;
  overallHitRate: number;
  totalEntries: number;
  memoryUsage: number;
  avgLatency: number;
  hotKeys: Array<{ key: string; hits: number }>;
  invalidations: number;
  warmupSuccess: number;
  warmupFailed: number;
  consistencyErrors: number;
  events: CacheEvent[];
}

export class CacheStrategyManager {
  private warmupStrategies: WarmupStrategy[] = [];
  private invalidationRules: InvalidationRule[] = [];
  private consistencyChecks: ConsistencyCheck[] = [];
  private events: CacheEvent[] = [];
  private eventLimit = 1000;
  private invalidationCount = 0;
  private warmupStats = { success: 0, failed: 0 };
  private consistencyErrors = 0;
  private timers: ReturnType<typeof setInterval>[] = [];
  private started = false;

  // ========== 预热策略 ==========

  registerWarmup(strategy: WarmupStrategy): void {
    this.warmupStrategies.push(strategy);
    this.warmupStrategies.sort((a, b) => b.priority - a.priority);
  }

  async executeWarmup(scope?: 'market-open' | 'market-close' | 'daily' | 'all'): Promise<{
    success: number;
    failed: number;
    duration: number;
  }> {
    const start = Date.now();
    let success = 0;
    let failed = 0;

    const strategies = scope === 'all' || !scope
      ? this.warmupStrategies
      : this.warmupStrategies.filter(s => s.schedule === scope);

    for (const strategy of strategies) {
      try {
        const data = await strategy.loader();
        multiLevelCache.setL2(`warmup:${strategy.pattern}`, data, strategy.ttl, strategy.tags);
        success++;
        this.recordEvent({
          type: 'warmup',
          key: strategy.pattern,
          timestamp: Date.now(),
          level: 'L2',
          metadata: { strategy: strategy.name },
        });
      } catch (err) {
        failed++;
        this.recordEvent({
          type: 'error',
          key: strategy.pattern,
          timestamp: Date.now(),
          metadata: { error: String(err), phase: 'warmup' },
        });
      }
    }

    this.warmupStats.success += success;
    this.warmupStats.failed += failed;

    return { success, failed, duration: Date.now() - start };
  }

  // ========== 失效策略 ==========

  registerInvalidationRule(rule: InvalidationRule): void {
    this.invalidationRules.push(rule);
  }

  /**
   * 触发失效 - 按规则或直接按pattern
   */
  invalidate(patternOrRule: string): number {
    const removed = multiLevelCache.invalidatePattern(patternOrRule);
    queryCache.invalidate(patternOrRule);
    this.invalidationCount += removed;
    this.recordEvent({
      type: 'invalidate',
      key: patternOrRule,
      timestamp: Date.now(),
      metadata: { removed },
    });
    return removed;
  }

  /**
   * 按标签失效 + 级联失效依赖
   */
  invalidateByTagWithCascade(tag: string): number {
    let total = multiLevelCache.invalidateByTag(tag);

    // 级联失效：查找依赖此tag的规则
    for (const rule of this.invalidationRules) {
      if (rule.trigger === 'dependency' && rule.dependencies?.includes(tag)) {
        total += multiLevelCache.invalidatePattern(rule.pattern);
        this.recordEvent({
          type: 'invalidate',
          key: rule.pattern,
          timestamp: Date.now(),
          metadata: { cascade: true, parent: tag },
        });
      }
    }

    this.invalidationCount += total;
    return total;
  }

  /**
   * 运行所有基于阈值的失效规则
   */
  runThresholdInvalidation(): number {
    let total = 0;
    for (const rule of this.invalidationRules) {
      if (rule.trigger === 'threshold' && rule.condition?.()) {
        total += this.invalidate(rule.pattern);
      }
      if (rule.trigger === 'time' && rule.maxAge) {
        // 时间失效由LRU自身TTL处理，这里做额外的强制清理
        const removed = this.invalidate(rule.pattern);
        total += removed;
      }
    }
    return total;
  }

  // ========== 一致性 ==========

  registerConsistencyCheck(check: ConsistencyCheck): void {
    this.consistencyChecks.push(check);
  }

  async runConsistencyChecks(): Promise<{ passed: number; failed: number; repaired: number }> {
    let passed = 0;
    let failed = 0;
    let repaired = 0;

    for (const check of this.consistencyChecks) {
      const values = check.keys.map(k => multiLevelCache.get(k));
      const isValid = check.validator(values);

      if (isValid) {
        passed++;
      } else {
        failed++;
        this.consistencyErrors++;
        this.recordEvent({
          type: 'error',
          key: check.name,
          timestamp: Date.now(),
          metadata: { phase: 'consistency', keys: check.keys },
        });

        if (check.repair) {
          try {
            await check.repair();
            repaired++;
          } catch {
            // repair failed, skip
          }
        }
      }
    }

    return { passed, failed, repaired };
  }

  // ========== 监控 ==========

  getSnapshot(): MonitoringSnapshot {
    const metrics = multiLevelCache.getMetrics();
    const hotKeys = multiLevelCache.getHotKeys(10);

    return {
      timestamp: Date.now(),
      l1HitRate: metrics.l1.hitRate,
      l2HitRate: metrics.l2.hitRate,
      overallHitRate: metrics.overall.hitRate,
      totalEntries: metrics.overall.totalEntries,
      memoryUsage: metrics.l1.totalSize + metrics.l2.totalSize,
      avgLatency: metrics.overall.avgLatency,
      hotKeys: hotKeys.map(h => ({ key: h.key, hits: h.hits })),
      invalidations: this.invalidationCount,
      warmupSuccess: this.warmupStats.success,
      warmupFailed: this.warmupStats.failed,
      consistencyErrors: this.consistencyErrors,
      events: this.events.slice(-50),
    };
  }

  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'critical';
    details: string[];
  } {
    const health = multiLevelCache.healthCheck();
    const details: string[] = [...health.issues];

    if (this.warmupStats.failed > this.warmupStats.success * 0.3) {
      details.push('预热失败率过高');
    }
    if (this.consistencyErrors > 10) {
      details.push('一致性错误累积过多');
    }

    let status: 'healthy' | 'degraded' | 'critical' = health.status;
    if (details.length > 5) status = 'critical';

    return { status, details };
  }

  getEventLog(type?: CacheEventType, limit = 50): CacheEvent[] {
    if (!type) return this.events.slice(-limit);
    return this.events.filter(e => e.type === type).slice(-limit);
  }

  // ========== 生命周期 ==========

  start(): void {
    if (this.started) return;
    this.started = true;

    // 每分钟运行阈值失效检查
    this.timers.push(setInterval(() => this.runThresholdInvalidation(), 60000));

    // 每5分钟运行一致性检查
    this.timers.push(setInterval(() => this.runConsistencyChecks(), 300000));

    // 市场开盘预热 (9:15集合竞价开始)
    this.scheduleWarmup('market-open', 9, 15);
    // 市场收盘清理 (15:30)
    this.scheduleWarmup('market-close', 15, 30);
  }

  stop(): void {
    this.started = false;
    this.timers.forEach(t => clearInterval(t));
    this.timers = [];
  }

  reset(): void {
    this.events = [];
    this.invalidationCount = 0;
    this.warmupStats = { success: 0, failed: 0 };
    this.consistencyErrors = 0;
  }

  // ========== 内部 ==========

  private recordEvent(event: CacheEvent): void {
    this.events.push(event);
    if (this.events.length > this.eventLimit) {
      this.events = this.events.slice(-this.eventLimit / 2);
    }
  }

  private scheduleWarmup(scope: 'market-open' | 'market-close', hour: number, minute: number): void {
    const check = () => {
      const now = new Date();
      if (now.getHours() === hour && now.getMinutes() === minute) {
        this.executeWarmup(scope);
      }
    };
    this.timers.push(setInterval(check, 60000));
  }
}

// 单例
export const cacheStrategyManager = new CacheStrategyManager();
export default CacheStrategyManager;
