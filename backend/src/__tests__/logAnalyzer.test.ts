import { describe, it, expect } from 'vitest';

/**
 * 日志分析器测试
 */

interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source: string;
  metadata?: Record<string, any>;
}

interface LogStats {
  totalEntries: number;
  errorCount: number;
  warnCount: number;
  errorRate: number;
  avgEntriesPerMinute: number;
  topErrors: Array<{ message: string; count: number }>;
  sourceBreakdown: Record<string, number>;
}

class LogParser {
  parseLine(line: string): LogEntry | null {
    const match = line.match(/^\[(\d+)\]\s+(INFO|WARN|ERROR|DEBUG)\s+\[(\w+)\]\s+(.*)$/);
    if (!match) return null;
    return {
      timestamp: parseInt(match[1]),
      level: match[2].toLowerCase() as LogEntry['level'],
      source: match[3],
      message: match[4],
    };
  }
}

class LogAnalyzer {
  private entries: LogEntry[] = [];

  add(entry: LogEntry): void {
    this.entries.push(entry);
  }

  getStats(): LogStats {
    const errors = this.entries.filter(e => e.level === 'error');
    const warns = this.entries.filter(e => e.level === 'warn');
    const timeSpan = this.entries.length > 1
      ? (this.entries[this.entries.length - 1].timestamp - this.entries[0].timestamp) / 60000
      : 1;

    const errorMessages = new Map<string, number>();
    errors.forEach(e => errorMessages.set(e.message, (errorMessages.get(e.message) || 0) + 1));
    const topErrors = Array.from(errorMessages.entries())
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const sourceBreakdown: Record<string, number> = {};
    this.entries.forEach(e => { sourceBreakdown[e.source] = (sourceBreakdown[e.source] || 0) + 1; });

    return {
      totalEntries: this.entries.length,
      errorCount: errors.length,
      warnCount: warns.length,
      errorRate: this.entries.length > 0 ? errors.length / this.entries.length : 0,
      avgEntriesPerMinute: timeSpan > 0 ? this.entries.length / timeSpan : 0,
      topErrors,
      sourceBreakdown,
    };
  }

  getEntriesByLevel(level: LogEntry['level']): LogEntry[] {
    return this.entries.filter(e => e.level === level);
  }

  getEntriesByTimeRange(start: number, end: number): LogEntry[] {
    return this.entries.filter(e => e.timestamp >= start && e.timestamp <= end);
  }

  findAnomalies(threshold: number = 10): Array<{ timestamp: number; count: number }> {
    if (this.entries.length < 2) return [];
    const windowMs = 60000;
    const anomalies: Array<{ timestamp: number; count: number }> = [];
    for (let i = 0; i < this.entries.length; i++) {
      const windowEnd = this.entries[i].timestamp + windowMs;
      const count = this.entries.filter(e => e.timestamp >= this.entries[i].timestamp && e.timestamp <= windowEnd).length;
      if (count >= threshold) {
        anomalies.push({ timestamp: this.entries[i].timestamp, count });
      }
    }
    return anomalies;
  }
}

describe('日志分析器', () => {
  describe('LogParser', () => {
    const parser = new LogParser();

    it('should parse valid log line', () => {
      const entry = parser.parseLine('[1700000000000] INFO [api] Server started');
      expect(entry).not.toBeNull();
      expect(entry!.level).toBe('info');
      expect(entry!.source).toBe('api');
      expect(entry!.message).toBe('Server started');
    });

    it('should return null for invalid line', () => {
      expect(parser.parseLine('random text')).toBeNull();
    });

    it('should handle all log levels', () => {
      expect(parser.parseLine('[0] INFO [x] m')!.level).toBe('info');
      expect(parser.parseLine('[0] WARN [x] m')!.level).toBe('warn');
      expect(parser.parseLine('[0] ERROR [x] m')!.level).toBe('error');
      expect(parser.parseLine('[0] DEBUG [x] m')!.level).toBe('debug');
    });
  });

  describe('LogAnalyzer', () => {
    const makeEntry = (level: LogEntry['level'], ts = Date.now(), source = 'api', message = 'test'): LogEntry => ({
      timestamp: ts, level, source, message,
    });

    it('should count entries', () => {
      const analyzer = new LogAnalyzer();
      analyzer.add(makeEntry('info'));
      analyzer.add(makeEntry('error'));
      analyzer.add(makeEntry('warn'));
      const stats = analyzer.getStats();
      expect(stats.totalEntries).toBe(3);
      expect(stats.errorCount).toBe(1);
      expect(stats.warnCount).toBe(1);
    });

    it('should calculate error rate', () => {
      const analyzer = new LogAnalyzer();
      analyzer.add(makeEntry('info'));
      analyzer.add(makeEntry('error'));
      expect(analyzer.getStats().errorRate).toBe(0.5);
    });

    it('should filter by level', () => {
      const analyzer = new LogAnalyzer();
      analyzer.add(makeEntry('info'));
      analyzer.add(makeEntry('error'));
      analyzer.add(makeEntry('error'));
      expect(analyzer.getEntriesByLevel('error')).toHaveLength(2);
    });

    it('should filter by time range', () => {
      const analyzer = new LogAnalyzer();
      analyzer.add(makeEntry('info', 1000));
      analyzer.add(makeEntry('info', 2000));
      analyzer.add(makeEntry('info', 3000));
      expect(analyzer.getEntriesByTimeRange(1500, 2500)).toHaveLength(1);
    });

    it('should find top errors', () => {
      const analyzer = new LogAnalyzer();
      analyzer.add(makeEntry('error', 1000, 'api', 'DB timeout'));
      analyzer.add(makeEntry('error', 2000, 'api', 'DB timeout'));
      analyzer.add(makeEntry('error', 3000, 'api', 'Auth failed'));
      const stats = analyzer.getStats();
      expect(stats.topErrors[0].message).toBe('DB timeout');
      expect(stats.topErrors[0].count).toBe(2);
    });

    it('should build source breakdown', () => {
      const analyzer = new LogAnalyzer();
      analyzer.add(makeEntry('info', 1000, 'api'));
      analyzer.add(makeEntry('info', 2000, 'db'));
      analyzer.add(makeEntry('info', 3000, 'api'));
      const stats = analyzer.getStats();
      expect(stats.sourceBreakdown['api']).toBe(2);
      expect(stats.sourceBreakdown['db']).toBe(1);
    });

    it('should detect anomalies', () => {
      const analyzer = new LogAnalyzer();
      const base = 1000000;
      for (let i = 0; i < 15; i++) {
        analyzer.add(makeEntry('error', base + i * 1000));
      }
      const anomalies = analyzer.findAnomalies(10);
      expect(anomalies.length).toBeGreaterThan(0);
    });
  });
});
