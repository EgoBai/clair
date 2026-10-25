/**
 * Health Check Service
 * 健康检查服务 - 系统状态监控
 */

import { getDbStatus, deriveHealthContract } from '../db/dbFactory';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  uptime: number;
  checks: HealthCheck[];
  version: string;
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  latencyMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

type CheckFn = () => Promise<{ status: 'pass' | 'fail' | 'warn'; message?: string; details?: Record<string, unknown> }>;

export class HealthCheckService {
  private checks: Map<string, CheckFn> = new Map();
  private startTime: number = Date.now();
  private version: string;

  constructor(version: string = '1.0.0') {
    this.version = version;
  }

  register(name: string, check: CheckFn): void {
    this.checks.set(name, check);
  }

  unregister(name: string): boolean {
    return this.checks.delete(name);
  }

  async checkAll(): Promise<HealthStatus> {
    const checks: HealthCheck[] = [];

    for (const [name, checkFn] of this.checks) {
      const start = performance.now();
      try {
        const result = await checkFn();
        checks.push({
          name,
          status: result.status,
          latencyMs: Math.round(performance.now() - start),
          message: result.message,
          details: result.details,
        });
      } catch (error) {
        checks.push({
          name,
          status: 'fail',
          latencyMs: Math.round(performance.now() - start),
          message: (error as Error).message,
        });
      }
    }

    const hasFail = checks.some(c => c.status === 'fail');
    const hasWarn = checks.some(c => c.status === 'warn');

    return {
      status: hasFail ? 'unhealthy' : hasWarn ? 'degraded' : 'healthy',
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      checks,
      version: this.version,
    };
  }

  async check(name: string): Promise<HealthCheck | null> {
    const checkFn = this.checks.get(name);
    if (!checkFn) return null;

    const start = performance.now();
    try {
      const result = await checkFn();
      return {
        name,
        status: result.status,
        latencyMs: Math.round(performance.now() - start),
        message: result.message,
        details: result.details,
      };
    } catch (error) {
      return {
        name,
        status: 'fail',
        latencyMs: Math.round(performance.now() - start),
        message: (error as Error).message,
      };
    }
  }

  getRegisteredChecks(): string[] {
    return Array.from(this.checks.keys());
  }

  getUptime(): number {
    return Date.now() - this.startTime;
  }
}

// Default checks
export function createDefaultHealthCheck(version?: string): HealthCheckService {
  const service = new HealthCheckService(version);

  service.register('memory', async () => {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
      const percentUsed = (usage.heapUsed / usage.heapTotal) * 100;

      return {
        status: percentUsed > 90 ? 'fail' : percentUsed > 70 ? 'warn' : 'pass',
        details: { heapUsedMB, heapTotalMB, percentUsed: Math.round(percentUsed) },
      };
    }
    return { status: 'pass', message: 'Memory info not available' };
  });

  service.register('uptime', async () => {
    const uptimeMs = Date.now() - service.getUptime();
    const uptimeSec = Math.round(uptimeMs / 1000);
    return {
      status: 'pass',
      details: { uptimeSeconds: uptimeSec },
    };
  });

  // 数据库降级可观测性：内存模式即降级态。
  // ⚠️ 措辞更正（R0'-9 之后）：内存库**不再**生成任何行情/估值
  //    （伪造生成器已删除），它只持有真实股票清单；行情类读取走诚实空态
  //    （生产环境由 InMemoryDatabase 升级为显式失败 FabricatedDataRefusedError）。
  //    故此处不能说「行情为伪造数据」，只能说「无真实行情来源」。
  //    三字段取值统一走 dbFactory.deriveHealthContract()（唯一真源）。
  service.register('database', async () => {
    const { degraded, stockCount } = getDbStatus();
    const contract = deriveHealthContract();
    return {
      status: degraded ? 'warn' : 'pass',
      message: degraded
        ? '数据库已降级为内存库，无真实行情/估值来源（dataSource=unavailable），禁止视为真实数据'
        : undefined,
      details: {
        dbType: contract.dbType,
        degraded: contract.degraded,
        dataSource: contract.dataSource,
        stockCount,
      },
    };
  });

  return service;
}
