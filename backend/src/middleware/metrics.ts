/**
 * Prometheus 指标中间件
 * 收集 HTTP 请求指标：请求数、延迟、状态码分布
 */

import { Request, Response, NextFunction } from 'express';

interface MetricEntry {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  timestamp: number;
}

class MetricsCollector {
  private requests: MetricEntry[] = [];
  private maxEntries = 10000;

  record(entry: MetricEntry): void {
    this.requests.push(entry);
    if (this.requests.length > this.maxEntries) {
      this.requests = this.requests.slice(-this.maxEntries / 2);
    }
  }

  /**
   * 生成 Prometheus 格式的指标
   */
  toPrometheusFormat(): string {
    const lines: string[] = [];

    // HTTP 请求总数
    lines.push('# HELP http_requests_total Total HTTP requests');
    lines.push('# TYPE http_requests_total counter');

    const requestCounts = new Map<string, number>();
    for (const r of this.requests) {
      const key = `${r.method}|${r.statusCode}`;
      requestCounts.set(key, (requestCounts.get(key) || 0) + 1);
    }
    for (const [key, count] of requestCounts) {
      const [method, status] = key.split('|');
      lines.push(`http_requests_total{method="${method}",status="${status}"} ${count}`);
    }

    // 活跃请求数
    lines.push('');
    lines.push('# HELP http_request_duration_ms Request duration in ms');
    lines.push('# TYPE http_request_duration_ms summary');

    const durations = new Map<string, number[]>();
    for (const r of this.requests.slice(-1000)) {
      const key = `${r.method}|${r.path}`;
      if (!durations.has(key)) durations.set(key, []);
      durations.get(key)!.push(r.duration);
    }
    for (const [key, vals] of durations) {
      const [method, path] = key.split('|');
      const sorted = vals.sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
      const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
      const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
      const sum = vals.reduce((a, b) => a + b, 0);
      lines.push(
        `http_request_duration_ms{method="${method}",path="${path}",quantile="0.5"} ${p50}`
      );
      lines.push(
        `http_request_duration_ms{method="${method}",path="${path}",quantile="0.95"} ${p95}`
      );
      lines.push(
        `http_request_duration_ms{method="${method}",path="${path}",quantile="0.99"} ${p99}`
      );
      lines.push(
        `http_request_duration_ms_sum{method="${method}",path="${path}"} ${sum}`
      );
      lines.push(
        `http_request_duration_ms_count{method="${method}",path="${path}"} ${vals.length}`
      );
    }

    // Node.js 进程指标
    const mem = process.memoryUsage();
    lines.push('');
    lines.push('# HELP process_memory_bytes Process memory usage');
    lines.push('# TYPE process_memory_bytes gauge');
    lines.push(`process_memory_bytes{type="rss"} ${mem.rss}`);
    lines.push(`process_memory_bytes{type="heapTotal"} ${mem.heapTotal}`);
    lines.push(`process_memory_bytes{type="heapUsed"} ${mem.heapUsed}`);
    lines.push(`process_memory_bytes{type="external"} ${mem.external}`);

    lines.push('');
    lines.push('# HELP process_uptime_seconds Process uptime');
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${Math.round(process.uptime())}`);

    return lines.join('\n') + '\n';
  }

  /**
   * 获取 JSON 格式的摘要
   */
  getSummary(): Record<string, unknown> {
    const recent = this.requests.slice(-1000);
    const durations = recent.map((r) => r.duration).sort((a, b) => a - b);
    const statusCounts: Record<string, number> = {};

    for (const r of this.requests) {
      const bucket = `${Math.floor(r.statusCode / 100)}xx`;
      statusCounts[bucket] = (statusCounts[bucket] || 0) + 1;
    }

    return {
      totalRequests: this.requests.length,
      recentRequests: recent.length,
      latency: {
        p50: durations[Math.floor(durations.length * 0.5)] || 0,
        p95: durations[Math.floor(durations.length * 0.95)] || 0,
        p99: durations[Math.floor(durations.length * 0.99)] || 0,
        avg: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
      },
      statusCodes: statusCounts,
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
      uptime: Math.round(process.uptime()),
    };
  }

  reset(): void {
    this.requests = [];
  }
}

export const metricsCollector = new MetricsCollector();

/**
 * Express 中间件：记录请求指标
 */
export function metricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();

    res.on('finish', () => {
      // 跳过健康检查和指标端点
      if (req.path === '/metrics' || req.path.startsWith('/health')) return;

      metricsCollector.record({
        method: req.method,
        path: req.route?.path || req.path,
        statusCode: res.statusCode,
        duration: Date.now() - start,
        timestamp: start,
      });
    });

    next();
  };
}

/**
 * Prometheus 指标端点
 */
export function metricsEndpoint() {
  return (_req: Request, res: Response): void => {
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metricsCollector.toPrometheusFormat());
  };
}
