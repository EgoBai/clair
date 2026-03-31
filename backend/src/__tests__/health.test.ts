import { describe, it, expect } from 'vitest';

/**
 * 健康检查测试
 */

interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency: number;
  lastCheck: string;
  details?: Record<string, any>;
}

interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: HealthCheckResult[];
  uptime: number;
  timestamp: string;
  version: string;
}

function assessHealth(results: HealthCheckResult[]): 'healthy' | 'degraded' | 'unhealthy' {
  const unhealthy = results.filter(r => r.status === 'unhealthy');
  const degraded = results.filter(r => r.status === 'degraded');

  if (unhealthy.length > 0) return 'unhealthy';
  if (degraded.length > 0) return 'degraded';
  return 'healthy';
}

function checkLatency(latency: number, thresholds: { warning: number; critical: number }): 'healthy' | 'degraded' | 'unhealthy' {
  if (latency >= thresholds.critical) return 'unhealthy';
  if (latency >= thresholds.warning) return 'degraded';
  return 'healthy';
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

function calcAvailability(checks: HealthCheckResult[]): number {
  if (checks.length === 0) return 0;
  const healthy = checks.filter(c => c.status === 'healthy').length;
  return Math.round((healthy / checks.length) * 10000) / 100;
}

describe('Health Check', () => {
  const sampleResults: HealthCheckResult[] = [
    { service: 'database', status: 'healthy', latency: 5, lastCheck: '2024-01-01T00:00:00Z' },
    { service: 'cache', status: 'healthy', latency: 2, lastCheck: '2024-01-01T00:00:00Z' },
    { service: 'api', status: 'degraded', latency: 150, lastCheck: '2024-01-01T00:00:00Z' },
    { service: 'websocket', status: 'healthy', latency: 10, lastCheck: '2024-01-01T00:00:00Z' },
  ];

  describe('健康评估', () => {
    it('全部健康应该返回healthy', () => {
      const allHealthy = sampleResults.map(r => ({ ...r, status: 'healthy' as const }));
      expect(assessHealth(allHealthy)).toBe('healthy');
    });

    it('有降级服务应该返回degraded', () => {
      expect(assessHealth(sampleResults)).toBe('degraded');
    });

    it('有不健康服务应该返回unhealthy', () => {
      const withUnhealthy = [...sampleResults, { service: 'queue', status: 'unhealthy' as const, latency: 5000, lastCheck: '2024-01-01T00:00:00Z' }];
      expect(assessHealth(withUnhealthy)).toBe('unhealthy');
    });

    it('空数组应该返回healthy', () => {
      expect(assessHealth([])).toBe('healthy');
    });
  });

  describe('延迟检查', () => {
    it('低延迟应该返回healthy', () => {
      expect(checkLatency(5, { warning: 100, critical: 500 })).toBe('healthy');
    });

    it('中等延迟应该返回degraded', () => {
      expect(checkLatency(150, { warning: 100, critical: 500 })).toBe('degraded');
    });

    it('高延迟应该返回unhealthy', () => {
      expect(checkLatency(600, { warning: 100, critical: 500 })).toBe('unhealthy');
    });

    it('边界值应该正确处理', () => {
      expect(checkLatency(100, { warning: 100, critical: 500 })).toBe('degraded');
      expect(checkLatency(500, { warning: 100, critical: 500 })).toBe('unhealthy');
    });
  });

  describe('运行时间格式化', () => {
    it('应该格式化天时分', () => {
      expect(formatUptime(90061)).toBe('1d 1h 1m');
    });

    it('应该处理零', () => {
      expect(formatUptime(0)).toBe('0d 0h 0m');
    });

    it('应该处理只有秒的情况', () => {
      expect(formatUptime(30)).toBe('0d 0h 0m');
    });

    it('应该处理长时间', () => {
      expect(formatUptime(86400 * 30 + 3600 * 5 + 60 * 10)).toBe('30d 5h 10m');
    });
  });

  describe('可用性计算', () => {
    it('应该正确计算可用性百分比', () => {
      const avail = calcAvailability(sampleResults);
      expect(avail).toBe(75); // 3/4 healthy
    });

    it('全部健康应该是100%', () => {
      const allHealthy = sampleResults.map(r => ({ ...r, status: 'healthy' as const }));
      expect(calcAvailability(allHealthy)).toBe(100);
    });

    it('空数组应该返回0', () => {
      expect(calcAvailability([])).toBe(0);
    });

    it('全部不健康应该是0%', () => {
      const allUnhealthy = sampleResults.map(r => ({ ...r, status: 'unhealthy' as const }));
      expect(calcAvailability(allUnhealthy)).toBe(0);
    });
  });
});
