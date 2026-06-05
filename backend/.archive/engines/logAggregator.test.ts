import { describe, it, expect, beforeEach } from 'vitest';

/**
 * 日志聚合器测试
 */

interface LogSource {
  name: string;
  type: 'application' | 'database' | 'system' | 'security';
  enabled: boolean;
}

interface AggregatedLog {
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

  registerSource(source: LogSource): void {
    this.sources.set(source.name, source);
  }

  ingest(entry: Omit<AggregatedLog, 'id'>): void {
    const source = this.sources.get(entry.source);
    if (source && !source.enabled) return;

    const log: AggregatedLog = {
      ...entry,
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    this.logs.push(log);
  }

  query(filter?: { level?: string; source?: string; since?: string }): AggregatedLog[] {
    let result = [...this.logs];
    if (filter?.level) result = result.filter(l => l.level === filter.level);
    if (filter?.source) result = result.filter(l => l.source === filter.source);
    if (filter?.since) result = result.filter(l => l.timestamp >= filter.since!);
    return result;
  }

  getStats(): { total: number; byLevel: Record<string, number>; bySource: Record<string, number> } {
    const byLevel: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    for (const log of this.logs) {
      byLevel[log.level] = (byLevel[log.level] || 0) + 1;
      bySource[log.source] = (bySource[log.source] || 0) + 1;
    }
    return { total: this.logs.length, byLevel, bySource };
  }

  clear(): void {
    this.logs = [];
  }
}

describe('LogAggregator', () => {
  let aggregator: LogAggregator;

  beforeEach(() => {
    aggregator = new LogAggregator();
  });

  describe('日志源管理', () => {
    it('应该注册日志源', () => {
      aggregator.registerSource({ name: 'app', type: 'application', enabled: true });
      aggregator.ingest({
        source: 'app',
        level: 'info',
        message: 'test',
        timestamp: new Date().toISOString(),
      });
      const stats = aggregator.getStats();
      expect(stats.total).toBe(1);
    });

    it('禁用的日志源不应该接收日志', () => {
      aggregator.registerSource({ name: 'disabled', type: 'application', enabled: false });
      aggregator.ingest({
        source: 'disabled',
        level: 'info',
        message: 'should be ignored',
        timestamp: new Date().toISOString(),
      });
      const stats = aggregator.getStats();
      expect(stats.total).toBe(0);
    });
  });

  describe('日志记录', () => {
    it('应该正确记录不同级别的日志', () => {
      aggregator.registerSource({ name: 'app', type: 'application', enabled: true });
      aggregator.ingest({ source: 'app', level: 'debug', message: 'debug msg', timestamp: '2024-01-01T00:00:00Z' });
      aggregator.ingest({ source: 'app', level: 'info', message: 'info msg', timestamp: '2024-01-01T00:01:00Z' });
      aggregator.ingest({ source: 'app', level: 'warn', message: 'warn msg', timestamp: '2024-01-01T00:02:00Z' });
      aggregator.ingest({ source: 'app', level: 'error', message: 'error msg', timestamp: '2024-01-01T00:03:00Z' });

      const stats = aggregator.getStats();
      expect(stats.total).toBe(4);
      expect(stats.byLevel['debug']).toBe(1);
      expect(stats.byLevel['info']).toBe(1);
      expect(stats.byLevel['warn']).toBe(1);
      expect(stats.byLevel['error']).toBe(1);
    });

    it('每条日志应该有唯一ID', () => {
      aggregator.registerSource({ name: 'app', type: 'application', enabled: true });
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        aggregator.ingest({
          source: 'app',
          level: 'info',
          message: `msg ${i}`,
          timestamp: new Date().toISOString(),
        });
      }
      const logs = aggregator.query();
      for (const log of logs) {
        expect(ids.has(log.id)).toBe(false);
        ids.add(log.id);
      }
    });
  });

  describe('日志查询', () => {
    beforeEach(() => {
      aggregator.registerSource({ name: 'app', type: 'application', enabled: true });
      aggregator.registerSource({ name: 'db', type: 'database', enabled: true });
      aggregator.ingest({ source: 'app', level: 'info', message: 'info1', timestamp: '2024-01-01T00:00:00Z' });
      aggregator.ingest({ source: 'app', level: 'error', message: 'error1', timestamp: '2024-01-01T01:00:00Z' });
      aggregator.ingest({ source: 'db', level: 'warn', message: 'warn1', timestamp: '2024-01-01T02:00:00Z' });
    });

    it('应该按级别过滤', () => {
      const errors = aggregator.query({ level: 'error' });
      expect(errors.length).toBe(1);
      expect(errors[0].message).toBe('error1');
    });

    it('应该按来源过滤', () => {
      const dbLogs = aggregator.query({ source: 'db' });
      expect(dbLogs.length).toBe(1);
      expect(dbLogs[0].source).toBe('db');
    });

    it('应该按时间过滤', () => {
      const recent = aggregator.query({ since: '2024-01-01T01:00:00Z' });
      expect(recent.length).toBe(2);
    });
  });

  describe('统计', () => {
    it('应该正确统计各级别数量', () => {
      aggregator.registerSource({ name: 'app', type: 'application', enabled: true });
      for (let i = 0; i < 10; i++) {
        aggregator.ingest({
          source: 'app',
          level: i < 7 ? 'info' : 'error',
          message: `msg ${i}`,
          timestamp: new Date().toISOString(),
        });
      }
      const stats = aggregator.getStats();
      expect(stats.byLevel['info']).toBe(7);
      expect(stats.byLevel['error']).toBe(3);
    });

    it('应该正确统计各来源数量', () => {
      aggregator.registerSource({ name: 'app', type: 'application', enabled: true });
      aggregator.registerSource({ name: 'db', type: 'database', enabled: true });
      for (let i = 0; i < 5; i++) {
        aggregator.ingest({ source: 'app', level: 'info', message: 'm', timestamp: '2024-01-01T00:00:00Z' });
      }
      for (let i = 0; i < 3; i++) {
        aggregator.ingest({ source: 'db', level: 'info', message: 'm', timestamp: '2024-01-01T00:00:00Z' });
      }
      const stats = aggregator.getStats();
      expect(stats.bySource['app']).toBe(5);
      expect(stats.bySource['db']).toBe(3);
    });
  });

  describe('清理', () => {
    it('应该清除所有日志', () => {
      aggregator.registerSource({ name: 'app', type: 'application', enabled: true });
      aggregator.ingest({ source: 'app', level: 'info', message: 'test', timestamp: '2024-01-01T00:00:00Z' });
      aggregator.clear();
      expect(aggregator.getStats().total).toBe(0);
    });
  });
});
