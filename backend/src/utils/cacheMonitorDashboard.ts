/**
 * 缓存监控面板
 * 聚合多级缓存、查询缓存、失效路由器、一致性引擎的监控数据
 * 提供统一的监控API
 * Round 100: 缓存统计监控
 */

import { multiLevelCache } from './multiLevelCache.js';
import { queryCache } from './queryCache.js';

// 监控指标
export interface CacheDashboardMetrics {
  timestamp: number;
  uptime: number;

  // 多级缓存
  multiLevel: {
    l1: {
      hitRate: number;
      entryCount: number;
      totalSize: number;
      evictions: number;
      avgLatency: number;
    };
    l2: {
      hitRate: number;
      entryCount: number;
      totalSize: number;
      evictions: number;
      avgLatency: number;
    };
    overall: {
      hitRate: number;
      totalEntries: number;
      penetrationRate: number;
    };
  };

  // 查询缓存
  queryCache: {
    hitRate: number;
    totalQueries: number;
    slowQueries: number;
    avgQueryTime: number;
    cacheSize: number;
  };

  // 热点分析
  hotKeys: Array<{ key: string; hits: number; level: string }>;

  // 健康评估
  health: {
    status: 'healthy' | 'degraded' | 'critical';
    score: number; // 0-100
    issues: string[];
    recommendations: string[];
  };

  // 趋势（最近N个快照）
  trend: {
    hitRateTrend: number[]; // 最近10个快照的命中率
    latencyTrend: number[];
    memoryTrend: number[];
  };
}

// 快照存储
interface Snapshot {
  timestamp: number;
  hitRate: number;
  avgLatency: number;
  memoryUsage: number;
}

export class CacheMonitorDashboard {
  private startTime: number;
  private snapshots: Snapshot[] = [];
  private snapshotLimit = 60; // 保留60个快照
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;
  private alertThresholds = {
    minHitRate: 0.5,
    maxLatency: 100, // ms
    maxMemory: 80 * 1024 * 1024, // 80MB
    maxPenetrationRate: 0.1,
  };

  constructor() {
    this.startTime = Date.now();
  }

  // ========== 采集 ==========

  collectSnapshot(): Snapshot {
    const metrics = multiLevelCache.getMetrics();
    const snapshot: Snapshot = {
      timestamp: Date.now(),
      hitRate: metrics.overall.hitRate,
      avgLatency: metrics.overall.avgLatency,
      memoryUsage: metrics.l1.totalSize + metrics.l2.totalSize,
    };

    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.snapshotLimit) {
      this.snapshots = this.snapshots.slice(-this.snapshotLimit);
    }

    return snapshot;
  }

  // ========== 仪表盘 ==========

  getDashboardMetrics(): CacheDashboardMetrics {
    // 采集当前快照
    this.collectSnapshot();

    const mlMetrics = multiLevelCache.getMetrics();
    const qStats = queryCache.getStats();
    const hotKeys = multiLevelCache.getHotKeys(10);
    const health = multiLevelCache.healthCheck();

    // 健康评分
    const score = this.calculateHealthScore(mlMetrics, qStats, health);
    const recommendations = this.generateRecommendations(mlMetrics, qStats);

    // 趋势
    const recentSnapshots = this.snapshots.slice(-10);

    return {
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,

      multiLevel: {
        l1: {
          hitRate: mlMetrics.l1.hitRate,
          entryCount: mlMetrics.l1.entryCount,
          totalSize: mlMetrics.l1.totalSize,
          evictions: mlMetrics.l1.evictions,
          avgLatency: mlMetrics.l1.avgLatency,
        },
        l2: {
          hitRate: mlMetrics.l2.hitRate,
          entryCount: mlMetrics.l2.entryCount,
          totalSize: mlMetrics.l2.totalSize,
          evictions: mlMetrics.l2.evictions,
          avgLatency: mlMetrics.l2.avgLatency,
        },
        overall: {
          hitRate: mlMetrics.overall.hitRate,
          totalEntries: mlMetrics.overall.totalEntries,
          penetrationRate: mlMetrics.overall.penetrationRate,
        },
      },

      queryCache: {
        hitRate: qStats.hitRate,
        totalQueries: qStats.totalQueries,
        slowQueries: qStats.slowQueries,
        avgQueryTime: qStats.avgQueryTime,
        cacheSize: qStats.cacheSize,
      },

      hotKeys: hotKeys.map(h => ({
        key: h.key,
        hits: h.hits,
        level: h.age < 30000 ? 'L1' : 'L2',
      })),

      health: {
        status: health.status,
        score,
        issues: health.issues,
        recommendations,
      },

      trend: {
        hitRateTrend: recentSnapshots.map(s => s.hitRate),
        latencyTrend: recentSnapshots.map(s => s.avgLatency),
        memoryTrend: recentSnapshots.map(s => s.memoryUsage),
      },
    };
  }

  // ========== 健康评分 ==========

  private calculateHealthScore(
    mlMetrics: ReturnType<typeof multiLevelCache.getMetrics>,
    qStats: ReturnType<typeof queryCache.getStats>,
    health: ReturnType<typeof multiLevelCache.healthCheck>
  ): number {
    let score = 100;

    // 命中率扣分
    if (mlMetrics.overall.hitRate < this.alertThresholds.minHitRate) {
      score -= (this.alertThresholds.minHitRate - mlMetrics.overall.hitRate) * 100;
    }

    // 延迟扣分
    if (mlMetrics.overall.avgLatency > this.alertThresholds.maxLatency) {
      score -= Math.min(20, (mlMetrics.overall.avgLatency - this.alertThresholds.maxLatency) / 10);
    }

    // 内存扣分
    const totalMemory = mlMetrics.l1.totalSize + mlMetrics.l2.totalSize;
    if (totalMemory > this.alertThresholds.maxMemory) {
      score -= Math.min(20, (totalMemory - this.alertThresholds.maxMemory) / (1024 * 1024));
    }

    // 慢查询扣分
    if (qStats.totalQueries > 0) {
      const slowRate = qStats.slowQueries / qStats.totalQueries;
      if (slowRate > 0.05) {
        score -= slowRate * 50;
      }
    }

    // 问题数量扣分
    score -= health.issues.length * 5;

    return Math.max(0, Math.round(score));
  }

  private generateRecommendations(
    mlMetrics: ReturnType<typeof multiLevelCache.getMetrics>,
    qStats: ReturnType<typeof queryCache.getStats>
  ): string[] {
    const recommendations: string[] = [];

    if (mlMetrics.l1.hitRate < 0.3) {
      recommendations.push('L1命中率偏低，考虑增加L1缓存容量或调整TTL');
    }
    if (mlMetrics.l2.evictions > mlMetrics.l2.hits * 0.5) {
      recommendations.push('L2频繁驱逐，建议增大L2容量');
    }
    if (mlMetrics.overall.penetrationRate > 0.1) {
      recommendations.push('缓存穿透率过高，建议启用布隆过滤器或空值缓存');
    }
    if (qStats.slowQueries > 10) {
      recommendations.push('慢查询较多，建议优化SQL或增加索引');
    }
    if (mlMetrics.l1.totalSize > 8 * 1024 * 1024) {
      recommendations.push('L1内存使用较高，关注内存压力');
    }

    return recommendations;
  }

  // ========== 报告 ==========

  generateReport(): string {
    const metrics = this.getDashboardMetrics();
    const lines: string[] = [];

    lines.push('=== 缓存监控报告 ===');
    lines.push(`时间: ${new Date(metrics.timestamp).toLocaleString()}`);
    lines.push(`运行: ${Math.round(metrics.uptime / 1000)}s`);
    lines.push('');
    lines.push('[L1 内存缓存]');
    lines.push(`  命中率: ${(metrics.multiLevel.l1.hitRate * 100).toFixed(1)}%`);
    lines.push(`  条目: ${metrics.multiLevel.l1.entryCount}`);
    lines.push(`  内存: ${(metrics.multiLevel.l1.totalSize / 1024).toFixed(1)}KB`);
    lines.push('');
    lines.push('[L2 持久化缓存]');
    lines.push(`  命中率: ${(metrics.multiLevel.l2.hitRate * 100).toFixed(1)}%`);
    lines.push(`  条目: ${metrics.multiLevel.l2.entryCount}`);
    lines.push('');
    lines.push('[查询缓存]');
    lines.push(`  命中率: ${(metrics.queryCache.hitRate * 100).toFixed(1)}%`);
    lines.push(`  总查询: ${metrics.queryCache.totalQueries}`);
    lines.push(`  慢查询: ${metrics.queryCache.slowQueries}`);
    lines.push('');
    lines.push(`[健康评分: ${metrics.health.score}/100]`);
    lines.push(`状态: ${metrics.health.status}`);

    if (metrics.health.issues.length > 0) {
      lines.push('问题:');
      metrics.health.issues.forEach(i => lines.push(`  ⚠ ${i}`));
    }
    if (metrics.health.recommendations.length > 0) {
      lines.push('建议:');
      metrics.health.recommendations.forEach(r => lines.push(`  💡 ${r}`));
    }

    return lines.join('\n');
  }

  // ========== 配置 ==========

  setThresholds(thresholds: Partial<typeof this.alertThresholds>): void {
    Object.assign(this.alertThresholds, thresholds);
  }

  getThresholds(): typeof this.alertThresholds {
    return { ...this.alertThresholds };
  }

  // ========== 生命周期 ==========

  start(intervalMs = 30000): void {
    if (this.snapshotTimer) return;
    this.snapshotTimer = setInterval(() => this.collectSnapshot(), intervalMs);
  }

  stop(): void {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
  }

  getSnapshots(limit = 60): Snapshot[] {
    return this.snapshots.slice(-limit);
  }

  clear(): void {
    this.snapshots = [];
  }
}

export const cacheMonitorDashboard = new CacheMonitorDashboard();
export default CacheMonitorDashboard;
