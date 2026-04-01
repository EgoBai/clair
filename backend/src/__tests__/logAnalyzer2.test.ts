/**
 * 后端日志分析引擎测试
 * 覆盖日志解析、错误聚合、告警触发
 */

import { describe, it, expect } from 'vitest';

describe('日志分析引擎', () => {
  describe('日志解析', () => {
    interface LogEntry {
      timestamp: string;
      level: 'info' | 'warn' | 'error' | 'fatal';
      service: string;
      message: string;
      metadata?: Record<string, unknown>;
    }

    function parseLogLine(line: string): LogEntry | null {
      const match = line.match(/^\[(.+?)\]\s+(INFO|WARN|ERROR|FATAL)\s+\[(.+?)\]\s+(.+)$/);
      if (!match) return null;
      return {
        timestamp: match[1],
        level: match[2].toLowerCase() as LogEntry['level'],
        service: match[3],
        message: match[4],
      };
    }

    it('应正确解析标准格式日志', () => {
      const entry = parseLogLine('[2024-01-15T10:30:00Z] ERROR [api-service] Connection timeout');
      expect(entry).not.toBeNull();
      expect(entry!.level).toBe('error');
      expect(entry!.service).toBe('api-service');
    });

    it('无效格式应返回null', () => {
      expect(parseLogLine('random text')).toBeNull();
    });
  });

  describe('错误聚合', () => {
    interface ErrorSummary {
      message: string;
      count: number;
      firstSeen: string;
      lastSeen: string;
      services: string[];
    }

    function aggregateErrors(logs: { message: string; timestamp: string; service: string }[]): ErrorSummary[] {
      const map = new Map<string, ErrorSummary>();
      for (const log of logs) {
        const key = log.message.slice(0, 100);
        if (!map.has(key)) {
          map.set(key, { message: key, count: 0, firstSeen: log.timestamp, lastSeen: log.timestamp, services: [] });
        }
        const summary = map.get(key)!;
        summary.count++;
        summary.lastSeen = log.timestamp;
        if (!summary.services.includes(log.service)) summary.services.push(log.service);
      }
      return Array.from(map.values()).sort((a, b) => b.count - a.count);
    }

    it('应正确聚合相同错误', () => {
      const logs = [
        { message: 'Connection timeout', timestamp: '10:00', service: 'api' },
        { message: 'Connection timeout', timestamp: '10:05', service: 'api' },
        { message: 'Out of memory', timestamp: '10:10', service: 'worker' },
      ];
      const result = aggregateErrors(logs);
      expect(result[0].message).toBe('Connection timeout');
      expect(result[0].count).toBe(2);
    });
  });

  describe('告警规则匹配', () => {
    interface AlertRule {
      name: string;
      condition: (stats: { errorRate: number; errorCount: number; p99Latency: number }) => boolean;
      severity: 'critical' | 'warning' | 'info';
    }

    function evaluateAlerts(stats: { errorRate: number; errorCount: number; p99Latency: number }, rules: AlertRule[]): AlertRule[] {
      return rules.filter(r => r.condition(stats));
    }

    it('应触发匹配的告警', () => {
      const rules: AlertRule[] = [
        { name: 'high_error_rate', condition: s => s.errorRate > 5, severity: 'critical' },
        { name: 'high_latency', condition: s => s.p99Latency > 1000, severity: 'warning' },
        { name: 'low_error', condition: s => s.errorRate < 1, severity: 'info' },
      ];
      const triggered = evaluateAlerts({ errorRate: 10, errorCount: 100, p99Latency: 2000 }, rules);
      expect(triggered).toHaveLength(2);
      expect(triggered.map(r => r.name)).toContain('high_error_rate');
      expect(triggered.map(r => r.name)).toContain('high_latency');
    });
  });

  describe('日志采样', () => {
    function sampleLogs<T>(logs: T[], rate: number, seed: number = 42): T[] {
      const result: T[] = [];
      let hash = seed;
      for (const log of logs) {
        hash = (hash * 1103515245 + 12345) & 0x7fffffff;
        if ((hash / 0x7fffffff) < rate) result.push(log);
      }
      return result;
    }

    it('采样率1.0应返回全部', () => {
      const logs = [1, 2, 3, 4, 5];
      expect(sampleLogs(logs, 1.0)).toHaveLength(5);
    });

    it('采样率0应返回空', () => {
      const logs = [1, 2, 3, 4, 5];
      expect(sampleLogs(logs, 0)).toHaveLength(0);
    });
  });
});
