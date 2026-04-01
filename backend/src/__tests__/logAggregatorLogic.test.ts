import { describe, it, expect } from 'vitest';

/**
 * 日志聚合器逻辑测试
 * LogAggregator 解析/过滤/统计逻辑
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  source?: string;
  metadata?: Record<string, any>;
}

interface LogQuery {
  levels?: LogLevel[];
  source?: string;
  startTime?: number;
  endTime?: number;
  keyword?: string;
  limit?: number;
  offset?: number;
}

interface LogStats {
  total: number;
  byLevel: Record<LogLevel, number>;
  errorRate: number;
  sources: string[];
  timeRange: { start: number; end: number } | null;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

function parseLogLevel(line: string): LogLevel | null {
  const match = line.match(/\b(DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL)\b/i);
  if (!match) return null;
  const level = match[1].toLowerCase();
  if (level === 'warning') return 'warn';
  return level as LogLevel;
}

function parseTimestamp(line: string): number | null {
  // ISO format: 2024-01-15T10:30:00.000Z
  const isoMatch = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/);
  if (isoMatch) {
    const ts = new Date(isoMatch[1]).getTime();
    return isNaN(ts) ? null : ts;
  }
  // Unix timestamp
  const unixMatch = line.match(/\b(\d{10,13})\b/);
  if (unixMatch) {
    const ts = parseInt(unixMatch[1], 10);
    // If 10 digits, it's seconds
    return unixMatch[1].length === 10 ? ts * 1000 : ts;
  }
  return null;
}

function filterLogs(logs: LogEntry[], query: LogQuery): LogEntry[] {
  let result = [...logs];

  if (query.levels && query.levels.length > 0) {
    result = result.filter(l => query.levels!.includes(l.level));
  }

  if (query.source) {
    result = result.filter(l => l.source === query.source);
  }

  if (query.startTime !== undefined) {
    result = result.filter(l => l.timestamp >= query.startTime!);
  }

  if (query.endTime !== undefined) {
    result = result.filter(l => l.timestamp <= query.endTime!);
  }

  if (query.keyword) {
    const kw = query.keyword.toLowerCase();
    result = result.filter(l => l.message.toLowerCase().includes(kw));
  }

  // Sort by timestamp descending
  result.sort((a, b) => b.timestamp - a.timestamp);

  if (query.offset !== undefined) {
    result = result.slice(query.offset);
  }

  if (query.limit !== undefined) {
    result = result.slice(0, query.limit);
  }

  return result;
}

function calcLogStats(logs: LogEntry[]): LogStats {
  const byLevel: Record<LogLevel, number> = {
    debug: 0, info: 0, warn: 0, error: 0, fatal: 0,
  };
  const sources = new Set<string>();
  let minTs = Infinity;
  let maxTs = -Infinity;

  for (const log of logs) {
    byLevel[log.level]++;
    if (log.source) sources.add(log.source);
    minTs = Math.min(minTs, log.timestamp);
    maxTs = Math.max(maxTs, log.timestamp);
  }

  const errorCount = byLevel.error + byLevel.fatal;

  return {
    total: logs.length,
    byLevel,
    errorRate: logs.length > 0 ? errorCount / logs.length : 0,
    sources: [...sources].sort(),
    timeRange: logs.length > 0 ? { start: minTs, end: maxTs } : null,
  };
}

function groupByTimeWindow(
  logs: LogEntry[],
  windowMs: number
): Map<number, LogEntry[]> {
  const groups = new Map<number, LogEntry[]>();
  for (const log of logs) {
    const windowKey = Math.floor(log.timestamp / windowMs) * windowMs;
    const existing = groups.get(windowKey) || [];
    existing.push(log);
    groups.set(windowKey, existing);
  }
  return groups;
}

function detectAnomalies(
  logs: LogEntry[],
  windowMs: number,
  thresholdMultiplier: number
): Array<{ windowStart: number; count: number; avgCount: number }> {
  const windows = groupByTimeWindow(logs, windowMs);
  const counts = Array.from(windows.values()).map(w => w.length);
  if (counts.length === 0) return [];

  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const threshold = avg * thresholdMultiplier;

  const anomalies: Array<{ windowStart: number; count: number; avgCount: number }> = [];
  for (const [windowStart, entries] of windows) {
    if (entries.length > threshold) {
      anomalies.push({ windowStart, count: entries.length, avgCount: avg });
    }
  }
  return anomalies;
}

function searchLogs(
  logs: LogEntry[],
  keyword: string,
  caseSensitive = false
): LogEntry[] {
  if (!keyword) return [];
  return logs.filter(log => {
    const msg = caseSensitive ? log.message : log.message.toLowerCase();
    const kw = caseSensitive ? keyword : keyword.toLowerCase();
    return msg.includes(kw);
  });
}

function formatLogEntry(log: LogEntry): string {
  const ts = new Date(log.timestamp).toISOString();
  const src = log.source ? `[${log.source}]` : '';
  return `${ts} ${log.level.toUpperCase().padEnd(5)} ${src} ${log.message}`;
}

function deduplicateLogs(logs: LogEntry[], timeWindowMs: number): LogEntry[] {
  const seen = new Map<string, number>();
  return logs.filter(log => {
    const key = `${log.level}:${log.message}`;
    const lastSeen = seen.get(key);
    if (lastSeen && log.timestamp - lastSeen < timeWindowMs) {
      return false;
    }
    seen.set(key, log.timestamp);
    return true;
  });
}

describe('日志聚合器逻辑', () => {
  const now = 1700000000000;
  const mockLogs: LogEntry[] = [
    { timestamp: now - 5000, level: 'info', message: 'Server started', source: 'app' },
    { timestamp: now - 4000, level: 'debug', message: 'Config loaded', source: 'app' },
    { timestamp: now - 3000, level: 'warn', message: 'Slow query detected', source: 'db' },
    { timestamp: now - 2000, level: 'error', message: 'Connection timeout', source: 'db' },
    { timestamp: now - 1000, level: 'info', message: 'Request processed', source: 'api' },
    { timestamp: now, level: 'fatal', message: 'Out of memory', source: 'app' },
  ];

  describe('parseLogLevel', () => {
    it('should parse standard levels', () => {
      expect(parseLogLevel('[DEBUG] message')).toBe('debug');
      expect(parseLogLevel('[INFO] message')).toBe('info');
      expect(parseLogLevel('[WARN] message')).toBe('warn');
      expect(parseLogLevel('[ERROR] message')).toBe('error');
      expect(parseLogLevel('[FATAL] message')).toBe('fatal');
    });

    it('should handle WARNING as warn', () => {
      expect(parseLogLevel('[WARNING] message')).toBe('warn');
    });

    it('should be case insensitive', () => {
      expect(parseLogLevel('error: something failed')).toBe('error');
    });

    it('should return null for no match', () => {
      expect(parseLogLevel('just a message')).toBeNull();
    });
  });

  describe('parseTimestamp', () => {
    it('should parse ISO format', () => {
      const ts = parseTimestamp('2024-01-15T10:30:00.000Z log message');
      expect(ts).toBe(new Date('2024-01-15T10:30:00.000Z').getTime());
    });

    it('should parse 13-digit unix ms', () => {
      expect(parseTimestamp('1700000000000 error')).toBe(1700000000000);
    });

    it('should parse 10-digit unix seconds', () => {
      expect(parseTimestamp('1700000000 error')).toBe(1700000000000);
    });

    it('should return null for no match', () => {
      expect(parseTimestamp('no timestamp here')).toBeNull();
    });
  });

  describe('filterLogs', () => {
    it('should filter by level', () => {
      const result = filterLogs(mockLogs, { levels: ['error', 'fatal'] });
      expect(result.every(l => l.level === 'error' || l.level === 'fatal')).toBe(true);
    });

    it('should filter by source', () => {
      const result = filterLogs(mockLogs, { source: 'db' });
      expect(result.every(l => l.source === 'db')).toBe(true);
    });

    it('should filter by time range', () => {
      const result = filterLogs(mockLogs, { startTime: now - 3500, endTime: now - 1500 });
      expect(result.every(l => l.timestamp >= now - 3500 && l.timestamp <= now - 1500)).toBe(true);
    });

    it('should filter by keyword', () => {
      const result = filterLogs(mockLogs, { keyword: 'timeout' });
      expect(result).toHaveLength(1);
      expect(result[0].message).toContain('timeout');
    });

    it('should apply limit', () => {
      const result = filterLogs(mockLogs, { limit: 2 });
      expect(result).toHaveLength(2);
    });

    it('should sort by timestamp descending', () => {
      const result = filterLogs(mockLogs, {});
      for (let i = 1; i < result.length; i++) {
        expect(result[i].timestamp).toBeLessThanOrEqual(result[i - 1].timestamp);
      }
    });
  });

  describe('calcLogStats', () => {
    it('should count by level', () => {
      const stats = calcLogStats(mockLogs);
      expect(stats.byLevel.info).toBe(2);
      expect(stats.byLevel.error).toBe(1);
      expect(stats.byLevel.fatal).toBe(1);
    });

    it('should calculate error rate', () => {
      const stats = calcLogStats(mockLogs);
      expect(stats.errorRate).toBeCloseTo(2 / 6);
    });

    it('should list sources', () => {
      const stats = calcLogStats(mockLogs);
      expect(stats.sources).toEqual(['api', 'app', 'db']);
    });

    it('should handle empty logs', () => {
      const stats = calcLogStats([]);
      expect(stats.total).toBe(0);
      expect(stats.errorRate).toBe(0);
      expect(stats.timeRange).toBeNull();
    });
  });

  describe('groupByTimeWindow', () => {
    it('should group logs into windows', () => {
      const groups = groupByTimeWindow(mockLogs, 2000);
      expect(groups.size).toBeGreaterThan(0);
    });

    it('should place logs in correct windows', () => {
      const windowMs = 1000;
      const groups = groupByTimeWindow(mockLogs, windowMs);
      for (const [windowStart, entries] of groups) {
        for (const entry of entries) {
          expect(entry.timestamp).toBeGreaterThanOrEqual(windowStart);
          expect(entry.timestamp).toBeLessThan(windowStart + windowMs);
        }
      }
    });
  });

  describe('searchLogs', () => {
    it('should search case insensitive by default', () => {
      expect(searchLogs(mockLogs, 'TIMEOUT')).toHaveLength(1);
    });

    it('should search case sensitive when specified', () => {
      expect(searchLogs(mockLogs, 'TIMEOUT', true)).toHaveLength(0);
      expect(searchLogs(mockLogs, 'timeout', true)).toHaveLength(1);
    });

    it('should return empty for no match', () => {
      expect(searchLogs(mockLogs, 'nonexistent')).toHaveLength(0);
    });

    it('should return empty for empty keyword', () => {
      expect(searchLogs(mockLogs, '')).toHaveLength(0);
    });
  });

  describe('formatLogEntry', () => {
    it('should format with source', () => {
      const formatted = formatLogEntry(mockLogs[0]);
      expect(formatted).toContain('INFO');
      expect(formatted).toContain('[app]');
      expect(formatted).toContain('Server started');
    });

    it('should format without source', () => {
      const log: LogEntry = { timestamp: now, level: 'error', message: 'fail' };
      const formatted = formatLogEntry(log);
      expect(formatted).toContain('ERROR');
      expect(formatted).toContain('fail');
    });
  });

  describe('deduplicateLogs', () => {
    it('should remove duplicates within time window', () => {
      const logs: LogEntry[] = [
        { timestamp: 1000, level: 'error', message: 'fail' },
        { timestamp: 1500, level: 'error', message: 'fail' },
        { timestamp: 5000, level: 'error', message: 'fail' },
      ];
      const result = deduplicateLogs(logs, 2000);
      expect(result).toHaveLength(2);
    });

    it('should keep different messages', () => {
      const logs: LogEntry[] = [
        { timestamp: 1000, level: 'error', message: 'a' },
        { timestamp: 1000, level: 'error', message: 'b' },
      ];
      expect(deduplicateLogs(logs, 1000)).toHaveLength(2);
    });
  });

  describe('detectAnomalies', () => {
    it('should detect windows with unusually high counts', () => {
      const logs: LogEntry[] = [];
      for (let i = 0; i < 100; i++) {
        logs.push({ timestamp: i * 100, level: 'info', message: 'normal' });
      }
      // Spike in one window
      for (let i = 0; i < 50; i++) {
        logs.push({ timestamp: 5000 + i, level: 'error', message: 'spike' });
      }
      const anomalies = detectAnomalies(logs, 1000, 2);
      expect(anomalies.length).toBeGreaterThan(0);
    });

    it('should return empty for no anomalies', () => {
      const logs: LogEntry[] = [];
      for (let i = 0; i < 10; i++) {
        logs.push({ timestamp: i * 1000, level: 'info', message: 'steady' });
      }
      expect(detectAnomalies(logs, 1000, 3)).toHaveLength(0);
    });
  });
});
