import { describe, it, expect } from 'vitest';

/**
 * 健康检查引擎逻辑测试
 * HealthCheck 依赖检查/聚合/状态判断
 */

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

interface DependencyCheck {
  name: string;
  status: 'up' | 'down';
  latency: number;
  lastChecked: number;
  error?: string;
}

interface HealthReport {
  status: HealthStatus;
  uptime: number;
  checks: DependencyCheck[];
  timestamp: number;
  version: string;
}

function aggregateHealth(checks: DependencyCheck[]): HealthStatus {
  if (checks.length === 0) return 'unhealthy';
  const down = checks.filter(c => c.status === 'down');
  if (down.length === 0) return 'healthy';
  if (down.length === checks.length) return 'unhealthy';
  return 'degraded';
}

function isCheckStale(check: DependencyCheck, maxAge: number, now: number): boolean {
  return now - check.lastChecked > maxAge;
}

function calcAverageLatency(checks: DependencyCheck[]): number {
  if (checks.length === 0) return 0;
  const total = checks.reduce((sum, c) => sum + c.latency, 0);
  return total / checks.length;
}

function findSlowChecks(checks: DependencyCheck[], threshold: number): DependencyCheck[] {
  return checks.filter(c => c.latency > threshold);
}

function buildHealthReport(
  checks: DependencyCheck[],
  startTime: number,
  version: string
): HealthReport {
  return {
    status: aggregateHealth(checks),
    uptime: Date.now() - startTime,
    checks,
    timestamp: Date.now(),
    version,
  };
}

function parseHealthUrl(baseUrl: string, path = '/health'): string {
  const clean = baseUrl.replace(/\/+$/, '');
  return `${clean}${path}`;
}

function shouldAlert(
  check: DependencyCheck,
  previousStatus: 'up' | 'down'
): boolean {
  return check.status === 'down' && previousStatus === 'up';
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function categorizeChecks(
  checks: DependencyCheck[]
): { healthy: DependencyCheck[]; unhealthy: DependencyCheck[] } {
  return {
    healthy: checks.filter(c => c.status === 'up'),
    unhealthy: checks.filter(c => c.status === 'down'),
  };
}

function calcReliability(
  history: Array<{ timestamp: number; status: 'up' | 'down' }>,
  windowMs: number,
  now: number
): number {
  const windowStart = now - windowMs;
  const inWindow = history.filter(h => h.timestamp >= windowStart);
  if (inWindow.length === 0) return 1;
  const upCount = inWindow.filter(h => h.status === 'up').length;
  return upCount / inWindow.length;
}

function generateCheckId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function isCriticalCheck(name: string): boolean {
  const critical = ['database', 'redis', 'mq', 'cache'];
  return critical.some(c => name.toLowerCase().includes(c));
}

describe('健康检查逻辑', () => {
  const mockChecks: DependencyCheck[] = [
    { name: 'database', status: 'up', latency: 15, lastChecked: Date.now() },
    { name: 'redis', status: 'up', latency: 5, lastChecked: Date.now() },
    { name: 'mq', status: 'down', latency: 0, lastChecked: Date.now(), error: 'connection refused' },
    { name: 'cache', status: 'up', latency: 8, lastChecked: Date.now() },
  ];

  describe('aggregateHealth', () => {
    it('should return healthy when all up', () => {
      const checks: DependencyCheck[] = [
        { name: 'a', status: 'up', latency: 10, lastChecked: 0 },
        { name: 'b', status: 'up', latency: 10, lastChecked: 0 },
      ];
      expect(aggregateHealth(checks)).toBe('healthy');
    });

    it('should return unhealthy when all down', () => {
      const checks: DependencyCheck[] = [
        { name: 'a', status: 'down', latency: 0, lastChecked: 0 },
        { name: 'b', status: 'down', latency: 0, lastChecked: 0 },
      ];
      expect(aggregateHealth(checks)).toBe('unhealthy');
    });

    it('should return degraded when some down', () => {
      expect(aggregateHealth(mockChecks)).toBe('degraded');
    });

    it('should return unhealthy for empty checks', () => {
      expect(aggregateHealth([])).toBe('unhealthy');
    });
  });

  describe('isCheckStale', () => {
    it('should detect stale checks', () => {
      const check: DependencyCheck = { name: 'x', status: 'up', latency: 5, lastChecked: 1000 };
      expect(isCheckStale(check, 5000, 7000)).toBe(true);
    });

    it('should accept fresh checks', () => {
      const check: DependencyCheck = { name: 'x', status: 'up', latency: 5, lastChecked: 1000 };
      expect(isCheckStale(check, 5000, 5000)).toBe(false);
    });
  });

  describe('calcAverageLatency', () => {
    it('should calculate average', () => {
      expect(calcAverageLatency(mockChecks)).toBe(7); // (15+5+0+8)/4 = 7
    });

    it('should handle empty array', () => {
      expect(calcAverageLatency([])).toBe(0);
    });
  });

  describe('findSlowChecks', () => {
    it('should find checks above threshold', () => {
      const slow = findSlowChecks(mockChecks, 10);
      expect(slow).toHaveLength(1);
      expect(slow[0].name).toBe('database');
    });

    it('should return empty when all fast', () => {
      expect(findSlowChecks(mockChecks, 100)).toHaveLength(0);
    });
  });

  describe('buildHealthReport', () => {
    it('should build complete report', () => {
      const report = buildHealthReport(mockChecks, Date.now() - 60000, '1.0.0');
      expect(report.status).toBe('degraded');
      expect(report.version).toBe('1.0.0');
      expect(report.uptime).toBeGreaterThan(0);
    });
  });

  describe('parseHealthUrl', () => {
    it('should combine base and path', () => {
      expect(parseHealthUrl('http://localhost:3000')).toBe('http://localhost:3000/health');
    });

    it('should strip trailing slashes', () => {
      expect(parseHealthUrl('http://localhost:3000///')).toBe('http://localhost:3000/health');
    });

    it('should accept custom path', () => {
      expect(parseHealthUrl('http://localhost:3000', '/ready')).toBe('http://localhost:3000/ready');
    });
  });

  describe('shouldAlert', () => {
    it('should alert on transition to down', () => {
      const check: DependencyCheck = { name: 'x', status: 'down', latency: 0, lastChecked: 0 };
      expect(shouldAlert(check, 'up')).toBe(true);
    });

    it('should not alert if already down', () => {
      const check: DependencyCheck = { name: 'x', status: 'down', latency: 0, lastChecked: 0 };
      expect(shouldAlert(check, 'down')).toBe(false);
    });

    it('should not alert on recovery', () => {
      const check: DependencyCheck = { name: 'x', status: 'up', latency: 5, lastChecked: 0 };
      expect(shouldAlert(check, 'down')).toBe(false);
    });
  });

  describe('formatUptime', () => {
    it('should format days', () => {
      expect(formatUptime(86400000 * 2 + 3600000 * 5)).toBe('2d 5h 0m');
    });

    it('should format hours', () => {
      expect(formatUptime(3600000 * 3 + 60000 * 15)).toBe('3h 15m 0s');
    });

    it('should format minutes', () => {
      expect(formatUptime(60000 * 5 + 1000 * 30)).toBe('5m 30s');
    });

    it('should format seconds', () => {
      expect(formatUptime(45000)).toBe('45s');
    });
  });

  describe('categorizeChecks', () => {
    it('should separate healthy and unhealthy', () => {
      const { healthy, unhealthy } = categorizeChecks(mockChecks);
      expect(healthy).toHaveLength(3);
      expect(unhealthy).toHaveLength(1);
    });
  });

  describe('calcReliability', () => {
    it('should calculate uptime percentage', () => {
      const history = [
        { timestamp: 1000, status: 'up' as const },
        { timestamp: 2000, status: 'up' as const },
        { timestamp: 3000, status: 'down' as const },
        { timestamp: 4000, status: 'up' as const },
      ];
      expect(calcReliability(history, 5000, 4500)).toBe(0.75);
    });

    it('should return 1 for empty history', () => {
      expect(calcReliability([], 1000, 2000)).toBe(1);
    });

    it('should only consider window', () => {
      const history = [
        { timestamp: 1000, status: 'down' as const },
        { timestamp: 5000, status: 'up' as const },
      ];
      expect(calcReliability(history, 2000, 5500)).toBe(1);
    });
  });

  describe('generateCheckId', () => {
    it('should slugify name', () => {
      expect(generateCheckId('Database Primary')).toBe('database-primary');
      expect(generateCheckId('Redis Cache!')).toBe('redis-cache');
    });
  });

  describe('isCriticalCheck', () => {
    it('should identify critical checks', () => {
      expect(isCriticalCheck('database')).toBe(true);
      expect(isCriticalCheck('Redis Primary')).toBe(true);
      expect(isCriticalCheck('external-api')).toBe(false);
    });
  });
});
