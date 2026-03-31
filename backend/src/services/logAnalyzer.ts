/**
 * 日志分析引擎
 * Log Analysis Engine
 *
 * 日志解析、模式检测、异常统计、告警规则
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  source?: string;
  metadata?: Record<string, any>;
}

export interface LogPattern {
  name: string;
  regex: RegExp;
  level: LogLevel;
  description: string;
}

export interface AlertRule {
  name: string;
  condition: (stats: LogStats) => boolean;
  message: string;
}

export interface LogStats {
  total: number;
  byLevel: Record<LogLevel, number>;
  errorRate: number;
  topErrors: Array<{ message: string; count: number }>;
  alerts: string[];
}

/**
 * 日志解析器
 */
export class LogParser {
  private patterns: LogPattern[] = [];

  addPattern(pattern: LogPattern): void {
    this.patterns.push(pattern);
  }

  /**
   * 解析日志行
   */
  parseLine(line: string): LogEntry | null {
    // 标准格式: [TIMESTAMP] [LEVEL] message
    const stdMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\]\s*\[(\w+)\]\s*(.+)$/);
    if (stdMatch) {
      return {
        timestamp: new Date(stdMatch[1]).getTime(),
        level: stdMatch[2].toLowerCase() as LogLevel,
        message: stdMatch[3],
      };
    }

    // 简单格式: LEVEL: message
    const simpleMatch = line.match(/^(DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL):\s*(.+)$/i);
    if (simpleMatch) {
      return {
        timestamp: Date.now(),
        level: simpleMatch[1].toLowerCase().replace('warning', 'warn') as LogLevel,
        message: simpleMatch[2],
      };
    }

    // 模式匹配
    for (const pattern of this.patterns) {
      if (pattern.regex.test(line)) {
        return {
          timestamp: Date.now(),
          level: pattern.level,
          message: line,
          source: pattern.name,
        };
      }
    }

    return null;
  }

  /**
   * 批量解析
   */
  parseLines(lines: string[]): LogEntry[] {
    return lines.map(l => this.parseLine(l)).filter((e): e is LogEntry => e !== null);
  }
}

/**
 * 日志分析器
 */
export class LogAnalyzer {
  private entries: LogEntry[] = [];
  private alertRules: AlertRule[] = [];
  private maxEntries: number;

  constructor(maxEntries: number = 100_000) {
    this.maxEntries = maxEntries;
  }

  /**
   * 添加日志条目
   */
  addEntry(entry: LogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  /**
   * 添加告警规则
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.push(rule);
  }

  /**
   * 分析日志
   */
  analyze(since?: number): LogStats {
    const filtered = since
      ? this.entries.filter(e => e.timestamp >= since)
      : this.entries;

    const byLevel: Record<LogLevel, number> = {
      debug: 0, info: 0, warn: 0, error: 0, fatal: 0,
    };

    const errorMessages = new Map<string, number>();

    for (const entry of filtered) {
      byLevel[entry.level]++;
      if (entry.level === 'error' || entry.level === 'fatal') {
        const count = errorMessages.get(entry.message) || 0;
        errorMessages.set(entry.message, count + 1);
      }
    }

    const total = filtered.length;
    const errorCount = byLevel.error + byLevel.fatal;
    const errorRate = total > 0 ? errorCount / total : 0;

    const topErrors = Array.from(errorMessages.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([message, count]) => ({ message, count }));

    const stats: LogStats = { total, byLevel, errorRate, topErrors, alerts: [] };

    for (const rule of this.alertRules) {
      if (rule.condition(stats)) {
        stats.alerts.push(rule.message);
      }
    }

    return stats;
  }

  /**
   * 按时间窗口统计
   */
  hourlyBreakdown(hours: number = 24): Array<{ hour: number; count: number; errors: number }> {
    const now = Date.now();
    const start = now - hours * 3600_000;
    const buckets = new Map<number, { count: number; errors: number }>();

    for (const entry of this.entries) {
      if (entry.timestamp < start) continue;
      const hour = Math.floor(entry.timestamp / 3600_000);
      if (!buckets.has(hour)) buckets.set(hour, { count: 0, errors: 0 });
      const b = buckets.get(hour)!;
      b.count++;
      if (entry.level === 'error' || entry.level === 'fatal') b.errors++;
    }

    return Array.from(buckets.entries())
      .map(([hour, data]) => ({ hour, ...data }))
      .sort((a, b) => a.hour - b.hour);
  }

  /**
   * 搜索日志
   */
  search(query: string, options: { level?: LogLevel; limit?: number } = {}): LogEntry[] {
    const { level, limit = 100 } = options;
    const lowerQuery = query.toLowerCase();
    return this.entries
      .filter(e => {
        if (level && e.level !== level) return false;
        return e.message.toLowerCase().includes(lowerQuery);
      })
      .slice(-limit);
  }

  /**
   * 获取条目数
   */
  getCount(): number {
    return this.entries.length;
  }

  /**
   * 清空
   */
  clear(): void {
    this.entries = [];
  }
}
