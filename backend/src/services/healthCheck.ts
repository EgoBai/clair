/**
 * 综合健康检查服务
 * 支持多层级检查：数据库、Redis、内存、磁盘、外部依赖
 */

import { db } from '../db/Database';

export interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency: number;
  message?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
  checks: HealthCheckResult[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
}

type CheckFn = () => Promise<HealthCheckResult>;

const checks: Map<string, CheckFn> = new Map();

/**
 * 注册自定义健康检查
 */
export function registerCheck(name: string, fn: CheckFn): void {
  checks.set(name, fn);
}

/**
 * 数据库健康检查
 */
export async function checkDatabase(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const result = await db.healthCheck();
    return {
      name: 'database',
      status: result.healthy ? 'healthy' : 'unhealthy',
      latency: Date.now() - start,
      message: result.healthy ? 'PostgreSQL 连接正常' : 'PostgreSQL 连接失败',
      details: { latency: result.latency },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      name: 'database',
      status: 'unhealthy',
      latency: Date.now() - start,
      message: `数据库检查异常: ${error instanceof Error ? error.message : '未知错误'}`,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * 内存使用检查
 */
export async function checkMemory(): Promise<HealthCheckResult> {
  const start = Date.now();
  const usage = process.memoryUsage();
  const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
  const rssUsedMB = Math.round(usage.rss / 1024 / 1024);
  const usagePercent = (usage.heapUsed / usage.heapTotal) * 100;

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  let message = `堆内存: ${heapUsedMB}MB / ${heapTotalMB}MB (${usagePercent.toFixed(1)}%)`;

  if (usagePercent > 90) {
    status = 'unhealthy';
    message += ' - 内存严重不足';
  } else if (usagePercent > 75) {
    status = 'degraded';
    message += ' - 内存使用较高';
  }

  return {
    name: 'memory',
    status,
    latency: Date.now() - start,
    message,
    details: {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      rss: usage.rss,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers,
      usagePercent: Math.round(usagePercent * 100) / 100,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * 进程运行时间检查
 */
export async function checkUptime(): Promise<HealthCheckResult> {
  const start = Date.now();
  const uptimeSeconds = process.uptime();
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);

  return {
    name: 'uptime',
    status: 'healthy',
    latency: Date.now() - start,
    message: `运行时间: ${hours}小时${minutes}分钟`,
    details: { uptimeSeconds: Math.round(uptimeSeconds) },
    timestamp: new Date().toISOString(),
  };
}

/**
 * 事件循环延迟检查
 */
export async function checkEventLoop(): Promise<HealthCheckResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const loopStart = process.hrtime.bigint();
    setImmediate(() => {
      const delay = Number(process.hrtime.bigint() - loopStart) / 1e6;
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (delay > 100) status = 'unhealthy';
      else if (delay > 50) status = 'degraded';

      resolve({
        name: 'eventLoop',
        status,
        latency: Date.now() - start,
        message: `事件循环延迟: ${delay.toFixed(2)}ms`,
        details: { delayMs: Math.round(delay * 100) / 100 },
        timestamp: new Date().toISOString(),
      });
    });
  });
}

/**
 * Node.js 版本与环境检查
 */
export async function checkEnvironment(): Promise<HealthCheckResult> {
  const start = Date.now();
  return {
    name: 'environment',
    status: 'healthy',
    latency: Date.now() - start,
    message: `Node.js ${process.version}`,
    details: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      env: process.env.NODE_ENV || 'development',
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * 执行所有健康检查
 */
export async function runAllChecks(): Promise<SystemHealth> {
  const builtInChecks: CheckFn[] = [
    checkDatabase,
    checkMemory,
    checkUptime,
    checkEventLoop,
    checkEnvironment,
  ];

  const customChecks = Array.from(checks.values());
  const allChecks = [...builtInChecks, ...customChecks];

  const results: HealthCheckResult[] = await Promise.all(
    allChecks.map(async (fn) => {
      try {
        return await fn();
      } catch (error) {
        return {
          name: fn.name || 'unknown',
          status: 'unhealthy' as const,
          latency: 0,
          message: `检查执行失败: ${error instanceof Error ? error.message : '未知错误'}`,
          timestamp: new Date().toISOString(),
        };
      }
    })
  );

  const summary = {
    total: results.length,
    healthy: results.filter((r) => r.status === 'healthy').length,
    degraded: results.filter((r) => r.status === 'degraded').length,
    unhealthy: results.filter((r) => r.status === 'unhealthy').length,
  };

  let overallStatus: SystemHealth['status'] = 'healthy';
  if (summary.unhealthy > 0) overallStatus = 'unhealthy';
  else if (summary.degraded > 0) overallStatus = 'degraded';

  return {
    status: overallStatus,
    version: process.env.APP_VERSION || '1.7.0',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: results,
    summary,
  };
}

/**
 * 轻量级就绪检查 (Kubernetes readiness probe)
 */
export async function readinessCheck(): Promise<boolean> {
  try {
    const dbHealth = await db.healthCheck();
    return dbHealth.healthy;
  } catch {
    return false;
  }
}

/**
 * 存活检查 (Kubernetes liveness probe)
 */
export async function livenessCheck(): Promise<boolean> {
  return true;
}
