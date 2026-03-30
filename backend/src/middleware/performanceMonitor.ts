/**
 * API 性能监控中间件
 * 响应时间 + 错误率 + 慢请求追踪
 * 参考 Sentry 监控方案
 */

import { Request, Response, NextFunction } from 'express';

interface RequestMetric {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  timestamp: number;
  error?: string;
}

interface EndpointStats {
  count: number;
  totalDuration: number;
  minDuration: number;
  maxDuration: number;
  errorCount: number;
  statusCodes: Map<number, number>;
  lastError?: string;
  lastErrorTime?: string;
  p50: number;
  p95: number;
  p99: number;
  durations: number[];
}

class PerformanceMonitor {
  private metrics: RequestMetric[] = [];
  private endpointStats: Map<string, EndpointStats> = new Map();
  private maxMetrics = 10000;
  private slowThreshold: number; // 毫秒

  constructor(slowThreshold = 2000) {
    this.slowThreshold = slowThreshold;
  }

  /**
   * Express 中间件
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      const path = this.normalizePath(req.path);

      res.on('finish', () => {
        const duration = Date.now() - start;
        const metric: RequestMetric = {
          method: req.method,
          path,
          statusCode: res.statusCode,
          duration,
          timestamp: start,
        };

        this.recordMetric(metric);
        this.updateEndpointStats(metric);

        // 慢请求警告
        if (duration > this.slowThreshold) {
          console.warn(`[SLOW] ${req.method} ${req.path} - ${duration}ms`);
        }
      });

      next();
    };
  }

  private normalizePath(path: string): string {
    // 把 /api/stocks/600519 归一化为 /api/stocks/:symbol
    return path
      .replace(/\/api\//, '/api/')
      .replace(/\/[0-9a-f]{8,}/g, '/:id')
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[A-Z0-9]{6}/g, '/:symbol');
  }

  private recordMetric(metric: RequestMetric) {
    this.metrics.push(metric);
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics / 2);
    }
  }

  private updateEndpointStats(metric: RequestMetric) {
    const key = `${metric.method} ${metric.path}`;
    let stats = this.endpointStats.get(key);

    if (!stats) {
      stats = {
        count: 0,
        totalDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        errorCount: 0,
        statusCodes: new Map(),
        p50: 0,
        p95: 0,
        p99: 0,
        durations: [],
      };
      this.endpointStats.set(key, stats);
    }

    stats.count++;
    stats.totalDuration += metric.duration;
    stats.minDuration = Math.min(stats.minDuration, metric.duration);
    stats.maxDuration = Math.max(stats.maxDuration, metric.duration);

    // 保留最近500个用于百分位计算
    stats.durations.push(metric.duration);
    if (stats.durations.length > 500) stats.durations = stats.durations.slice(-500);

    // 计算百分位
    const sorted = [...stats.durations].sort((a, b) => a - b);
    stats.p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    stats.p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    stats.p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;

    // 状态码统计
    const sc = stats.statusCodes.get(metric.statusCode) || 0;
    stats.statusCodes.set(metric.statusCode, sc + 1);

    // 错误追踪
    if (metric.statusCode >= 400) {
      stats.errorCount++;
      stats.lastError = `HTTP ${metric.statusCode}`;
      stats.lastErrorTime = new Date(metric.timestamp).toISOString();
    }
  }

  /**
   * 获取概览统计
   */
  getOverview(timeRangeMs = 3600000) {
    const now = Date.now();
    const recent = this.metrics.filter(m => now - m.timestamp < timeRangeMs);

    const totalRequests = recent.length;
    const errorRequests = recent.filter(m => m.statusCode >= 400).length;
    const slowRequests = recent.filter(m => m.duration > this.slowThreshold).length;
    const avgDuration = totalRequests > 0
      ? +(recent.reduce((s, m) => s + m.duration, 0) / totalRequests).toFixed(1)
      : 0;

    const durations = recent.map(m => m.duration).sort((a, b) => a - b);
    const p50 = durations[Math.floor(durations.length * 0.5)] || 0;
    const p95 = durations[Math.floor(durations.length * 0.95)] || 0;
    const p99 = durations[Math.floor(durations.length * 0.99)] || 0;

    // 按分钟统计请求量
    const requestsPerMinute: { time: string; count: number; errors: number; avgDuration: number }[] = [];
    const minuteBuckets = new Map<number, { count: number; errors: number; totalDuration: number }>();

    for (const m of recent) {
      const minuteKey = Math.floor(m.timestamp / 60000) * 60000;
      const bucket = minuteBuckets.get(minuteKey) || { count: 0, errors: 0, totalDuration: 0 };
      bucket.count++;
      if (m.statusCode >= 400) bucket.errors++;
      bucket.totalDuration += m.duration;
      minuteBuckets.set(minuteKey, bucket);
    }

    for (const [time, bucket] of minuteBuckets) {
      requestsPerMinute.push({
        time: new Date(time).toISOString().slice(11, 16),
        count: bucket.count,
        errors: bucket.errors,
        avgDuration: +(bucket.totalDuration / bucket.count).toFixed(0),
      });
    }

    // 按状态码分布
    const statusCodeDistribution: { code: number; count: number }[] = [];
    const scMap = new Map<number, number>();
    for (const m of recent) {
      scMap.set(m.statusCode, (scMap.get(m.statusCode) || 0) + 1);
    }
    for (const [code, count] of scMap) {
      statusCodeDistribution.push({ code, count });
    }
    statusCodeDistribution.sort((a, b) => b.count - a.count);

    return {
      timeRange: `${timeRangeMs / 60000}min`,
      totalRequests,
      errorRequests,
      errorRate: totalRequests > 0 ? +((errorRequests / totalRequests) * 100).toFixed(2) : 0,
      slowRequests,
      slowRate: totalRequests > 0 ? +((slowRequests / totalRequests) * 100).toFixed(2) : 0,
      avgDuration,
      p50,
      p95,
      p99,
      requestsPerMinute,
      statusCodeDistribution,
    };
  }

  /**
   * 获取端点统计
   */
  getEndpointStats() {
    const result: {
      endpoint: string;
      count: number;
      avgDuration: number;
      minDuration: number;
      maxDuration: number;
      errorCount: number;
      errorRate: number;
      p50: number;
      p95: number;
      p99: number;
    }[] = [];

    for (const [endpoint, stats] of this.endpointStats) {
      result.push({
        endpoint,
        count: stats.count,
        avgDuration: +(stats.totalDuration / stats.count).toFixed(1),
        minDuration: stats.minDuration,
        maxDuration: stats.maxDuration,
        errorCount: stats.errorCount,
        errorRate: +((stats.errorCount / stats.count) * 100).toFixed(2),
        p50: stats.p50,
        p95: stats.p95,
        p99: stats.p99,
      });
    }

    return result.sort((a, b) => b.avgDuration - a.avgDuration);
  }

  /**
   * 获取慢请求列表
   */
  getSlowRequests(limit = 20) {
    return this.metrics
      .filter(m => m.duration > this.slowThreshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit)
      .map(m => ({
        method: m.method,
        path: m.path,
        duration: m.duration,
        statusCode: m.statusCode,
        time: new Date(m.timestamp).toISOString(),
      }));
  }

  /**
   * 获取错误请求列表
   */
  getErrorRequests(limit = 20) {
    return this.metrics
      .filter(m => m.statusCode >= 400)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map(m => ({
        method: m.method,
        path: m.path,
        statusCode: m.statusCode,
        duration: m.duration,
        time: new Date(m.timestamp).toISOString(),
      }));
  }

  /**
   * 健康评分 (0-100)
   */
  getHealthScore(timeRangeMs = 3600000) {
    const overview = this.getOverview(timeRangeMs);

    let score = 100;

    // 错误率扣分
    if (overview.errorRate > 5) score -= 30;
    else if (overview.errorRate > 1) score -= 15;
    else if (overview.errorRate > 0.1) score -= 5;

    // 平均响应时间扣分
    if (overview.avgDuration > 5000) score -= 25;
    else if (overview.avgDuration > 2000) score -= 15;
    else if (overview.avgDuration > 1000) score -= 8;
    else if (overview.avgDuration > 500) score -= 3;

    // P99响应时间扣分
    if (overview.p99 > 10000) score -= 15;
    else if (overview.p99 > 5000) score -= 8;
    else if (overview.p99 > 3000) score -= 3;

    // 慢请求比例扣分
    if (overview.slowRate > 10) score -= 15;
    else if (overview.slowRate > 5) score -= 8;
    else if (overview.slowRate > 1) score -= 3;

    return {
      score: Math.max(0, Math.round(score)),
      grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F',
      breakdown: {
        errorPenalty: overview.errorRate > 5 ? 30 : overview.errorRate > 1 ? 15 : overview.errorRate > 0.1 ? 5 : 0,
        latencyPenalty: overview.avgDuration > 5000 ? 25 : overview.avgDuration > 2000 ? 15 : overview.avgDuration > 1000 ? 8 : overview.avgDuration > 500 ? 3 : 0,
        p99Penalty: overview.p99 > 10000 ? 15 : overview.p99 > 5000 ? 8 : overview.p99 > 3000 ? 3 : 0,
        slowRatePenalty: overview.slowRate > 10 ? 15 : overview.slowRate > 5 ? 8 : overview.slowRate > 1 ? 3 : 0,
      },
    };
  }
}

// 单例
export const performanceMonitor = new PerformanceMonitor(2000);

export { PerformanceMonitor };
