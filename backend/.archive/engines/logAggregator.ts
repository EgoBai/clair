/**
 * 日志聚合器
 * 支持多来源日志收集、过滤、聚合输出
 */

export interface LogSource {
  name: string;
  type: 'application' | 'database' | 'system' | 'security';
  enabled: boolean;
}

export interface AggregatedLog {
  id: string;
  source: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

class LogAggregator {
  private logs: AggregatedLog[] = [];
  private sources: Map<string, LogSource> = new Map();
  private maxLogs = 50000;
  private retentionMs = 24 * 60 * 60 * 1000; // 24h

  /**
   * 注册日志源
   */
  registerSource(source: LogSource): void {
    this.sources.set(source.name, source);
  }

  /**
   * 记录日志
   */
  ingest(entry: Omit<AggregatedLog, 'id'>): void {
    const source = this.sources.get(entry.source);
    if (source && !source.enabled) return;

    const log: AggregatedLog = {
      ...entry,
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    this.logs.push(log);
    this.cleanup();
  }

  /**
   * 查询日志
   */
  query(options: {
    source?: string;
    level?: string;
    startTime?: string;
    endTime?: string;
    keyword?: string;
    limit?: number;
    offset?: number;
  }): { logs: AggregatedLog[]; total: number } {
    let filtered = [...this.logs];

    if (options.source) {
      filtered = filtered.filter((l) => l.source === options.source);
    }
    if (options.level) {
      filtered = filtered.filter((l) => l.level === options.level);
    }
    if (options.startTime) {
      filtered = filtered.filter((l) => l.timestamp >= options.startTime!);
    }
    if (options.endTime) {
      filtered = filtered.filter((l) => l.timestamp <= options.endTime!);
    }
    if (options.keyword) {
      filtered = filtered.filter((l) =>
        l.message.toLowerCase().includes(options.keyword!.toLowerCase())
      );
    }

    const total = filtered.length;
    const limit = options.limit || 100;
    const offset = options.offset || 0;
    const logs = filtered.slice(offset, offset + limit);

    return { logs, total };
  }

  /**
   * 按时间窗口聚合统计
   */
  aggregateByWindow(windowMinutes = 5): Array<{
    windowStart: string;
    windowEnd: string;
    counts: Record<string, number>;
    total: number;
  }> {
    const windowMs = windowMinutes * 60 * 1000;
    const windows: Map<number, Record<string, number>> = new Map();

    for (const log of this.logs) {
      const ts = new Date(log.timestamp).getTime();
      const windowKey = Math.floor(ts / windowMs) * windowMs;

      if (!windows.has(windowKey)) {
        windows.set(windowKey, { debug: 0, info: 0, warn: 0, error: 0 });
      }
      const counts = windows.get(windowKey)!;
      counts[log.level] = (counts[log.level] || 0) + 1;
    }

    return Array.from(windows.entries())
      .sort(([a], [b]) => a - b)
      .map(([windowStart, counts]) => ({
        windowStart: new Date(windowStart).toISOString(),
        windowEnd: new Date(windowStart + windowMs).toISOString(),
        counts,
        total: Object.values(counts).reduce((a, b) => a + b, 0),
      }));
  }

  /**
   * 获取错误率统计
   */
  getErrorRate(windowMinutes = 60): {
    total: number;
    errors: number;
    rate: number;
    windowMinutes: number;
  } {
    const cutoff = Date.now() - windowMinutes * 60 * 1000;
    const recent = this.logs.filter(
      (l) => new Date(l.timestamp).getTime() > cutoff
    );
    const errors = recent.filter((l) => l.level === 'error').length;
    const total = recent.length;

    return {
      total,
      errors,
      rate: total > 0 ? Math.round((errors / total) * 10000) / 100 : 0,
      windowMinutes,
    };
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalLogs: number;
    sourcesRegistered: number;
    levelBreakdown: Record<string, number>;
    oldestLog?: string;
    newestLog?: string;
  } {
    const levelBreakdown: Record<string, number> = {};
    for (const log of this.logs) {
      levelBreakdown[log.level] = (levelBreakdown[log.level] || 0) + 1;
    }

    return {
      totalLogs: this.logs.length,
      sourcesRegistered: this.sources.size,
      levelBreakdown,
      oldestLog: this.logs.length > 0 ? this.logs[0].timestamp : undefined,
      newestLog: this.logs.length > 0 ? this.logs[this.logs.length - 1].timestamp : undefined,
    };
  }

  /**
   * 清理过期日志
   */
  private cleanup(): void {
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs / 2);
    }
  }

  /**
   * 清空日志
   */
  clear(): void {
    this.logs = [];
  }
}

export const logAggregator = new LogAggregator();

// 注册默认日志源
logAggregator.registerSource({ name: 'backend', type: 'application', enabled: true });
logAggregator.registerSource({ name: 'frontend', type: 'application', enabled: true });
logAggregator.registerSource({ name: 'database', type: 'database', enabled: true });
logAggregator.registerSource({ name: 'nginx', type: 'system', enabled: true });
logAggregator.registerSource({ name: 'auth', type: 'security', enabled: true });
