/**
 * healthCheck.test.ts
 * 健康检查服务测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  timestamp: string;
  checks: Record<string, ServiceHealth>;
  version?: string;
}

interface ServiceHealth {
  status: 'up' | 'down' | 'degraded';
  latency: number;
  lastChecked: string;
  error?: string;
  details?: Record<string, unknown>;
}

type HealthCheckFn = () => Promise<ServiceHealth>;

class HealthChecker {
  private checks: Map<string, HealthCheckFn> = new Map();
  private results: Map<string, ServiceHealth> = new Map();
  private interval: ReturnType<typeof setInterval> | null = null;
  private startTime: number;
  private checkTimeout = 5000;

  constructor(private options?: { checkIntervalMs?: number; timeoutMs?: number }) {
    this.startTime = Date.now();
    this.checkTimeout = options?.timeoutMs ?? 5000;
  }

  register(name: string, checkFn: HealthCheckFn): void {
    this.checks.set(name, checkFn);
  }

  unregister(name: string): boolean {
    return this.checks.delete(name);
  }

  hasCheck(name: string): boolean {
    return this.checks.has(name);
  }

  getRegisteredChecks(): string[] {
    return Array.from(this.checks.keys());
  }

  getResults(): Map<string, ServiceHealth> {
    return new Map(this.results);
  }

  getCheckResult(name: string): ServiceHealth | undefined {
    return this.results.get(name);
  }

  async runCheck(name: string): Promise<ServiceHealth> {
    const checkFn = this.checks.get(name);
    if (!checkFn) {
      return {
        status: 'down',
        latency: 0,
        lastChecked: new Date().toISOString(),
        error: `Check "${name}" not registered`,
      };
    }

    const startTime = Date.now();
    try {
      const result = await Promise.race([
        checkFn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Health check "${name}" timed out after ${this.checkTimeout}ms`)), this.checkTimeout),
        ),
      ]);
      result.lastChecked = new Date().toISOString();
      this.results.set(name, result);
      return result;
    } catch (error) {
      const health: ServiceHealth = {
        status: 'down',
        latency: Date.now() - startTime,
        lastChecked: new Date().toISOString(),
        error: (error as Error).message,
      };
      this.results.set(name, health);
      return health;
    }
  }

  async runAllChecks(): Promise<Record<string, ServiceHealth>> {
    const results: Record<string, ServiceHealth> = {};
    const promises = Array.from(this.checks.keys()).map(async (name) => {
      results[name] = await this.runCheck(name);
    });
    await Promise.all(promises);
    return results;
  }

  async getOverallStatus(): Promise<HealthStatus> {
    const checks = await this.runAllChecks();
    const status = this.computeOverallStatus(checks);

    return {
      status,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  getOverallStatusSync(): HealthStatus {
    const entries = Array.from(this.results.entries());
    const checks: Record<string, ServiceHealth> = {};
    for (const [name, health] of entries) {
      checks[name] = health;
    }

    // If no checks have been run, compute default
    if (entries.length === 0) {
      return {
        status: this.checks.size > 0 ? 'degraded' : 'healthy',
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        timestamp: new Date().toISOString(),
        checks: {},
      };
    }

    return {
      status: this.computeOverallStatus(checks),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private computeOverallStatus(checks: Record<string, ServiceHealth>): HealthStatus['status'] {
    const values = Object.values(checks);
    if (values.length === 0) return 'healthy';

    const anyDown = values.some(v => v.status === 'down');
    const anyDegraded = values.some(v => v.status === 'degraded');

    if (anyDown) return 'unhealthy';
    if (anyDegraded) return 'degraded';
    return 'healthy';
  }

  async startPeriodicChecks(): Promise<void> {
    const intervalMs = this.options?.checkIntervalMs ?? 30000;

    // Run once immediately
    await this.runAllChecks();

    // Then periodically
    this.interval = setInterval(() => {
      this.runAllChecks().catch(() => {});
    }, intervalMs);
  }

  stopPeriodicChecks(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  isRunning(): boolean {
    return this.interval !== null;
  }

  getStartTime(): Date {
    return new Date(this.startTime);
  }

  // Helper to create an "up" response
  up(details?: Record<string, unknown>): ServiceHealth {
    return {
      status: 'up',
      latency: 0,
      lastChecked: new Date().toISOString(),
      details,
    };
  }

  // Helper to create a "down" response
  down(error: string, details?: Record<string, unknown>): ServiceHealth {
    return {
      status: 'down',
      latency: 0,
      lastChecked: new Date().toISOString(),
      error,
      details,
    };
  }

  // Helper to create a "degraded" response
  degraded(error: string, latency: number, details?: Record<string, unknown>): ServiceHealth {
    return {
      status: 'degraded',
      latency,
      lastChecked: new Date().toISOString(),
      error,
      details,
    };
  }

  async isHealthy(): Promise<boolean> {
    const status = await this.getOverallStatus();
    return status.status === 'healthy';
  }
}

describe('HealthChecker', () => {
  let hc: HealthChecker;

  beforeEach(() => {
    hc = new HealthChecker();
  });

  // --- Registration ---

  it('should register a health check', () => {
    hc.register('db', () => Promise.resolve(hc.up()));
    expect(hc.hasCheck('db')).toBe(true);
    expect(hc.getRegisteredChecks()).toContain('db');
  });

  it('should unregister a health check', () => {
    hc.register('db', () => Promise.resolve(hc.up()));
    expect(hc.unregister('db')).toBe(true);
    expect(hc.hasCheck('db')).toBe(false);
  });

  it('should return false when unregistering non-existent check', () => {
    expect(hc.unregister('nonexistent')).toBe(false);
  });

  // --- Running Checks ---

  it('should run a single check and return healthy result', async () => {
    hc.register('db', () => Promise.resolve(hc.up()));
    const result = await hc.runCheck('db');
    expect(result.status).toBe('up');
    expect(result.latency).toBeGreaterThanOrEqual(0);
    expect(result.lastChecked).toBeTruthy();
  });

  it('should run a single check and return down result on failure', async () => {
    hc.register('failing', () => Promise.reject(new Error('Connection refused')));
    const result = await hc.runCheck('failing');
    expect(result.status).toBe('down');
    expect(result.error).toContain('Connection refused');
  });

  it('should return error for non-existent check', async () => {
    const result = await hc.runCheck('nonexistent');
    expect(result.status).toBe('down');
    expect(result.error).toContain('not registered');
  });

  it('should handle delayed successful checks', async () => {
    hc.register('slow', () =>
      new Promise(resolve => setTimeout(() => resolve(hc.up()), 10)),
    );
    const result = await hc.runCheck('slow');
    expect(result.status).toBe('up');
    // Latency comes from the check function response (which is 0 from up()),
    // not from the measured time, so we just verify it ran successfully
  });

  // --- Timeout Handling ---

  it('should timeout slow health checks', async () => {
    const fastHc = new HealthChecker({ timeoutMs: 50 });
    fastHc.register('very_slow', () =>
      new Promise(resolve => setTimeout(() => resolve(fastHc.up()), 500)),
    );
    const result = await fastHc.runCheck('very_slow');
    expect(result.status).toBe('down');
    expect(result.error).toContain('timed out');
  });

  // --- runAllChecks ---

  it('should run all registered checks', async () => {
    hc.register('db', () => Promise.resolve(hc.up()));
    hc.register('cache', () => Promise.resolve(hc.up()));
    hc.register('api', () => Promise.resolve(hc.up()));

    const results = await hc.runAllChecks();
    const keys = Object.keys(results);
    expect(keys).toContain('db');
    expect(keys).toContain('cache');
    expect(keys).toContain('api');
    expect(Object.values(results).every(r => r.status === 'up')).toBe(true);
  });

  it('should handle mixed success and failure in runAllChecks', async () => {
    hc.register('ok', () => Promise.resolve(hc.up()));
    hc.register('fail', () => Promise.reject(new Error('Down')));

    const results = await hc.runAllChecks();
    expect(results.ok.status).toBe('up');
    expect(results.fail.status).toBe('down');
  });

  // --- Overall Status ---

  it('should report healthy when all checks pass', async () => {
    hc.register('a', () => Promise.resolve(hc.up()));
    hc.register('b', () => Promise.resolve(hc.up()));

    const status = await hc.getOverallStatus();
    expect(status.status).toBe('healthy');
    expect(status.uptime).toBeGreaterThanOrEqual(0);
  });

  it('should report unhealthy when a check is down', async () => {
    hc.register('a', () => Promise.resolve(hc.up()));
    hc.register('b', () => Promise.reject(new Error('Down')));

    const status = await hc.getOverallStatus();
    expect(status.status).toBe('unhealthy');
  });

  it('should report degraded when a check is degraded', async () => {
    hc.register('a', () => Promise.resolve(hc.up()));
    hc.register('b', () => Promise.resolve(hc.degraded('High latency', 2000)));

    const status = await hc.getOverallStatus();
    expect(status.status).toBe('degraded');
  });

  it('should report unhealthy over degraded', async () => {
    hc.register('a', () => Promise.resolve(hc.down('Outage')));
    hc.register('b', () => Promise.resolve(hc.degraded('Slow', 2000)));

    const status = await hc.getOverallStatus();
    expect(status.status).toBe('unhealthy');
  });

  it('should report healthy with no checks registered', async () => {
    const status = await hc.getOverallStatus();
    expect(status.status).toBe('healthy');
  });

  // --- Sync status ---

  it('should report status synchronously from cached results', async () => {
    hc.register('db', () => Promise.resolve(hc.up()));
    await hc.runAllChecks();

    const syncStatus = hc.getOverallStatusSync();
    expect(syncStatus.status).toBe('healthy');
    expect(syncStatus.checks.db).toBeDefined();
  });

  it('should handle sync status with no cached results', () => {
    hc.register('db', () => Promise.resolve(hc.up()));
    const status = hc.getOverallStatusSync();
    // Checks registered but not yet run - considered degraded
    expect(status.status).toBe('degraded');
  });

  // --- Periodic Checks ---

  it('should start and stop periodic checks', async () => {
    hc.register('db', () => Promise.resolve(hc.up()));

    await hc.startPeriodicChecks();
    expect(hc.isRunning()).toBe(true);

    hc.stopPeriodicChecks();
    expect(hc.isRunning()).toBe(false);
  });

  it('should populate results after periodic check starts', async () => {
    hc.register('db', () => Promise.resolve(hc.up()));
    await hc.startPeriodicChecks();

    expect(hc.getCheckResult('db')).toBeDefined();
    hc.stopPeriodicChecks();
  });

  // --- Helpers ---

  it('should create healthy response with up()', () => {
    const result = hc.up({ memory: '256MB' });
    expect(result.status).toBe('up');
    expect(result.details).toEqual({ memory: '256MB' });
  });

  it('should create down response with down()', () => {
    const result = hc.down('Connection lost', { host: 'localhost' });
    expect(result.status).toBe('down');
    expect(result.error).toBe('Connection lost');
    expect(result.details).toEqual({ host: 'localhost' });
  });

  it('should create degraded response with degraded()', () => {
    const result = hc.degraded('High memory', 3000);
    expect(result.status).toBe('degraded');
    expect(result.latency).toBe(3000);
  });

  // --- isHealthy ---

  it('should return true when all healthy', async () => {
    hc.register('a', () => Promise.resolve(hc.up()));
    expect(await hc.isHealthy()).toBe(true);
  });

  it('should return false when any check is down', async () => {
    hc.register('a', () => Promise.reject(new Error('fail')));
    expect(await hc.isHealthy()).toBe(false);
  });

  // --- getResults / getCheckResult ---

  it('should return all cached results', async () => {
    hc.register('x', () => Promise.resolve(hc.up()));
    await hc.runCheck('x');

    const results = hc.getResults();
    expect(results.get('x')).toBeDefined();
    expect(results.get('x')!.status).toBe('up');
  });

  it('should return single cached result', async () => {
    hc.register('y', () => Promise.resolve(hc.up()));
    await hc.runCheck('y');

    const result = hc.getCheckResult('y');
    expect(result).toBeDefined();
    expect(result!.status).toBe('up');
  });

  it('should return undefined for check result not yet run', () => {
    hc.register('z', () => Promise.resolve(hc.up()));
    expect(hc.getCheckResult('z')).toBeUndefined();
  });

  // --- Start Time ---

  it('should track start time', () => {
    const now = Date.now();
    const startTime = hc.getStartTime().getTime();
    expect(Math.abs(startTime - now)).toBeLessThan(100);
  });
});
