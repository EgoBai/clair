/**
 * Prometheus 指标中间件
 * 收集HTTP请求指标供Prometheus抓取
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';

const log = createLogger('Metrics');

// ==================== 指标收集器 ====================

interface MetricEntry {
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

class MetricsCollector {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();
  private labels = new Map<string, Record<string, string>>();

  // 计数器递增
  incCounter(name: string, labels: Record<string, string> = {}, value: number = 1): void {
    const key = this.getKey(name, labels);
    this.counters.set(key, (this.counters.get(key) || 0) + value);
    this.labels.set(key, labels);
  }

  // 设置仪表盘值
  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.getKey(name, labels);
    this.gauges.set(key, value);
    this.labels.set(key, labels);
  }

  // 记录直方图值
  observeHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.getKey(name, labels);
    const values = this.histograms.get(key) || [];
    values.push(value);
    this.histograms.set(key, values);
    this.labels.set(key, labels);
  }

  // 记录请求（兼容旧API）
  record(entry: { method: string; path: string; statusCode: number; duration: number; timestamp: number }): void {
    this.incCounter('http_requests_total', { method: entry.method, path: entry.path, status: entry.statusCode.toString() });
    this.observeHistogram('http_request_duration_seconds', entry.duration / 1000, { method: entry.method, path: entry.path });
  }

  // 获取摘要（兼容旧API）
  getSummary(): { totalRequests: number; avgDuration: number } {
    let totalRequests = 0;
    let totalDuration = 0;
    
    for (const [key, value] of this.counters.entries()) {
      if (key.startsWith('http_requests_total')) {
        totalRequests += value;
      }
    }
    
    for (const [, values] of this.histograms.entries()) {
      totalDuration += values.reduce((a, b) => a + b, 0);
    }
    
    return {
      totalRequests,
      avgDuration: totalRequests > 0 ? totalDuration / totalRequests : 0
    };
  }

  // 重置（兼容旧API）
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.labels.clear();
  }

  // 导出Prometheus格式（兼容旧API）
  toPrometheusFormat(): string {
    return this.export();
  }

  // 导出Prometheus格式
  export(): string {
    const lines: string[] = [];

    // 导出计数器
    for (const [key, value] of this.counters.entries()) {
      const { name, labels } = this.parseKey(key);
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name}${this.formatLabels(labels)} ${value}`);
    }

    // 导出仪表盘
    for (const [key, value] of this.gauges.entries()) {
      const { name, labels } = this.parseKey(key);
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name}${this.formatLabels(labels)} ${value}`);
    }

    // 导出直方图
    for (const [key, values] of this.histograms.entries()) {
      const { name, labels } = this.parseKey(key);
      lines.push(`# TYPE ${name} histogram`);
      
      const sorted = values.sort((a, b) => a - b);
      const buckets = [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10];
      
      for (const bucket of buckets) {
        const count = sorted.filter(v => v <= bucket).length;
        lines.push(`${name}_bucket{le="${bucket}",...${this.formatLabels(labels).slice(1)} ${count}`);
      }
      
      lines.push(`${name}_sum${this.formatLabels(labels)} ${values.reduce((a, b) => a + b, 0)}`);
      lines.push(`${name}_count${this.formatLabels(labels)} ${values.length}`);
    }

    return lines.join('\n');
  }

  private getKey(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  private parseKey(key: string): { name: string; labels: Record<string, string> } {
    const match = key.match(/^([^{]+)\{(.*)\}$/);
    if (!match) return { name: key, labels: {} };
    
    const name = match[1];
    const labels: Record<string, string> = {};
    
    match[2].split(',').forEach(pair => {
      const [k, v] = pair.split('=');
      if (k && v) {
        labels[k] = v.replace(/"/g, '');
      }
    });
    
    return { name, labels };
  }

  private formatLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return '';
    return `{${entries.map(([k, v]) => `${k}="${v}"`).join(',')}}`;
  }
}

export const metrics = new MetricsCollector();
export const metricsCollector = metrics;

// ==================== HTTP 请求指标中间件 ====================

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const path = req.path;

  // 监听响应完成事件
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const statusCode = res.statusCode;
    const method = req.method;

    // 记录请求计数
    metrics.incCounter('http_requests_total', {
      method,
      path,
      status: statusCode.toString()
    });

    // 记录请求持续时间
    metrics.observeHistogram('http_request_duration_seconds', duration, {
      method,
      path
    });

    // 记录活跃请求数
    metrics.setGauge('http_requests_active', 1, { method });
  });

  next();
}

// ==================== 系统指标收集 ====================

export function collectSystemMetrics(): void {
  const memUsage = process.memoryUsage();
  
  metrics.setGauge('nodejs_heap_used_bytes', memUsage.heapUsed);
  metrics.setGauge('nodejs_heap_total_bytes', memUsage.heapTotal);
  metrics.setGauge('nodejs_external_bytes', memUsage.external);
  metrics.setGauge('nodejs_rss_bytes', memUsage.rss);
  
  metrics.setGauge('nodejs_uptime_seconds', process.uptime());
}

// 定期收集系统指标
setInterval(collectSystemMetrics, 10000);

// ==================== 指标端点 ====================

export function metricsEndpoint(_req: Request, res: Response): void {
  collectSystemMetrics();
  
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(metrics.export());
}

// ==================== 业务指标 ====================

export function recordDatabaseQuery(duration: number, success: boolean): void {
  metrics.observeHistogram('db_query_duration_seconds', duration);
  metrics.incCounter('db_queries_total', { success: success.toString() });
}

export function recordCacheHit(hit: boolean): void {
  metrics.incCounter('cache_operations_total', { type: hit ? 'hit' : 'miss' });
}

export function recordAICall(provider: string, duration: number, success: boolean): void {
  metrics.observeHistogram('ai_call_duration_seconds', duration, { provider });
  metrics.incCounter('ai_calls_total', { provider, success: success.toString() });
}
