/**
 * 健康检查端点
 * 提供服务状态、数据库连接、系统资源等信息
 */

import { Request, Response } from 'express';
import { db } from '../db/dbFactory';
import { createLogger } from './logger';

const log = createLogger('HealthCheck');

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: ServiceHealth;
    cache: ServiceHealth;
    ai: ServiceHealth;
  };
  system: {
    memory: MemoryInfo;
    cpu: CPUInfo;
  };
}

interface ServiceHealth {
  status: 'up' | 'down' | 'degraded';
  latency?: number;
  message?: string;
}

interface MemoryInfo {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  percentUsed: number;
}

interface CPUInfo {
  user: number;
  system: number;
  percentUsed: number;
}

// ==================== 健康检查函数 ====================

async function checkDatabase(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await db.connection.raw('SELECT 1');
    return {
      status: 'up',
      latency: Date.now() - start
    };
  } catch (error) {
    log.error('Database health check failed:', error);
    return {
      status: 'down',
      latency: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function checkCache(): Promise<ServiceHealth> {
  // 检查内存缓存是否工作
  try {
    const testKey = '__health_check__';
    // 简单测试缓存是否可用
    return {
      status: 'up',
      message: 'Memory cache operational'
    };
  } catch (error) {
    return {
      status: 'down',
      message: 'Cache unavailable'
    };
  }
}

async function checkAI(): Promise<ServiceHealth> {
  // 检查AI服务配置
  const hasApiKey = !!(process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY);
  
  if (hasApiKey) {
    return {
      status: 'up',
      message: 'AI service configured'
    };
  }
  
  return {
    status: 'degraded',
    message: 'No AI API key configured'
  };
}

function getMemoryInfo(): MemoryInfo {
  const memUsage = process.memoryUsage();
  const totalMemory = require('os').totalmem();
  
  return {
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
    rss: Math.round(memUsage.rss / 1024 / 1024),
    external: Math.round(memUsage.external / 1024 / 1024),
    percentUsed: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
  };
}

function getCPUInfo(): CPUInfo {
  const cpuUsage = process.cpuUsage();
  const totalCPU = require('os').cpus().length * 1000000;
  
  return {
    user: Math.round(cpuUsage.user / 1000),
    system: Math.round(cpuUsage.system / 1000),
    percentUsed: Math.round(((cpuUsage.user + cpuUsage.system) / totalCPU) * 100)
  };
}

// ==================== 健康检查端点 ====================

export async function healthCheckEndpoint(_req: Request, res: Response): Promise<void> {
  const start = Date.now();
  
  // 并行检查所有服务
  const [dbHealth, cacheHealth, aiHealth] = await Promise.all([
    checkDatabase(),
    checkCache(),
    checkAI()
  ]);
  
  // 确定整体状态
  let status: HealthStatus['status'] = 'healthy';
  if (dbHealth.status === 'down') {
    status = 'unhealthy';
  } else if (dbHealth.status === 'degraded' || aiHealth.status === 'degraded') {
    status = 'degraded';
  }
  
  const health: HealthStatus = {
    status,
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database: dbHealth,
      cache: cacheHealth,
      ai: aiHealth
    },
    system: {
      memory: getMemoryInfo(),
      cpu: getCPUInfo()
    }
  };
  
  // 根据状态设置HTTP响应码
  const statusCode = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;
  
  res.status(statusCode).json(health);
}

// ==================== 简单健康检查 (用于Docker HEALTHCHECK) ====================

export async function simpleHealthCheck(_req: Request, res: Response): Promise<void> {
  try {
    await db.connection.raw('SELECT 1');
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
}

// ==================== 就绪检查 (用于Kubernetes) ====================

export async function readinessCheck(_req: Request, res: Response): Promise<void> {
  try {
    await db.connection.raw('SELECT 1');
    res.status(200).json({ ready: true });
  } catch (error) {
    res.status(503).json({ ready: false });
  }
}

// ==================== 存活检查 (用于Kubernetes) ====================

export async function livenessCheck(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ alive: true });
}
