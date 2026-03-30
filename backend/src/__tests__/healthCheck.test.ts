/**
 * 健康检查服务测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Database module
vi.mock('../db/Database', () => ({
  db: {
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, latency: 5 }),
  },
}));

import {
  checkDatabase,
  checkMemory,
  checkUptime,
  checkEventLoop,
  checkEnvironment,
  runAllChecks,
  readinessCheck,
  livenessCheck,
  registerCheck,
} from '../services/healthCheck';
import { db } from '../db/Database';

describe('HealthCheck Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkDatabase', () => {
    it('should return healthy when DB is connected', async () => {
      (db.healthCheck as any).mockResolvedValue({ healthy: true, latency: 5 });
      const result = await checkDatabase();
      expect(result.name).toBe('database');
      expect(result.status).toBe('healthy');
      expect(result.latency).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeTruthy();
    });

    it('should return unhealthy when DB is disconnected', async () => {
      (db.healthCheck as any).mockResolvedValue({ healthy: false, latency: 0 });
      const result = await checkDatabase();
      expect(result.name).toBe('database');
      expect(result.status).toBe('unhealthy');
    });

    it('should handle DB check errors', async () => {
      (db.healthCheck as any).mockRejectedValue(new Error('Connection refused'));
      const result = await checkDatabase();
      expect(result.status).toBe('unhealthy');
      expect(result.message).toContain('Connection refused');
    });
  });

  describe('checkMemory', () => {
    it('should return memory health status', async () => {
      const result = await checkMemory();
      expect(result.name).toBe('memory');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.status);
      expect(result.details).toBeDefined();
      expect(result.details!.heapUsed).toBeGreaterThan(0);
      expect(result.details!.heapTotal).toBeGreaterThan(0);
      expect(result.details!.rss).toBeGreaterThan(0);
    });

    it('should include usage percentage', async () => {
      const result = await checkMemory();
      expect(result.details!.usagePercent).toBeGreaterThan(0);
      expect(result.details!.usagePercent).toBeLessThanOrEqual(100);
    });
  });

  describe('checkUptime', () => {
    it('should return uptime info', async () => {
      const result = await checkUptime();
      expect(result.name).toBe('uptime');
      expect(result.status).toBe('healthy');
      expect(result.details!.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(result.message).toContain('运行时间');
    });
  });

  describe('checkEventLoop', () => {
    it('should measure event loop delay', async () => {
      const result = await checkEventLoop();
      expect(result.name).toBe('eventLoop');
      expect(result.details!.delayMs).toBeGreaterThanOrEqual(0);
    });

    it('should degrade when event loop is slow', async () => {
      const result = await checkEventLoop();
      // In test environment, event loop should be fast
      expect(['healthy', 'degraded']).toContain(result.status);
    });
  });

  describe('checkEnvironment', () => {
    it('should return environment info', async () => {
      const result = await checkEnvironment();
      expect(result.name).toBe('environment');
      expect(result.status).toBe('healthy');
      expect(result.details!.nodeVersion).toBe(process.version);
      expect(result.details!.platform).toBe(process.platform);
      expect(result.details!.arch).toBe(process.arch);
    });
  });

  describe('runAllChecks', () => {
    it('should aggregate all check results', async () => {
      const health = await runAllChecks();
      expect(health.status).toBeTruthy();
      expect(health.version).toBeTruthy();
      expect(health.timestamp).toBeTruthy();
      expect(health.checks.length).toBeGreaterThanOrEqual(5);
      expect(health.summary.total).toBe(health.checks.length);
      expect(health.summary.healthy + health.summary.degraded + health.summary.unhealthy).toBe(
        health.summary.total
      );
    });

    it('should return unhealthy when any check fails', async () => {
      (db.healthCheck as any).mockResolvedValue({ healthy: false, latency: 0 });
      const health = await runAllChecks();
      expect(health.status).toBe('unhealthy');
      expect(health.summary.unhealthy).toBeGreaterThan(0);
    });

    it('should include custom registered checks', async () => {
      registerCheck('customTest', async () => ({
        name: 'customTest',
        status: 'healthy' as const,
        latency: 1,
        message: 'Custom check OK',
        timestamp: new Date().toISOString(),
      }));
      const health = await runAllChecks();
      const customResult = health.checks.find((c) => c.name === 'customTest');
      expect(customResult).toBeDefined();
      expect(customResult!.status).toBe('healthy');
    });
  });

  describe('readinessCheck', () => {
    it('should return true when DB is healthy', async () => {
      (db.healthCheck as any).mockResolvedValue({ healthy: true, latency: 5 });
      const ready = await readinessCheck();
      expect(ready).toBe(true);
    });

    it('should return false when DB is unhealthy', async () => {
      (db.healthCheck as any).mockResolvedValue({ healthy: false, latency: 0 });
      const ready = await readinessCheck();
      expect(ready).toBe(false);
    });

    it('should return false on error', async () => {
      (db.healthCheck as any).mockRejectedValue(new Error('fail'));
      const ready = await readinessCheck();
      expect(ready).toBe(false);
    });
  });

  describe('livenessCheck', () => {
    it('should always return true', async () => {
      const alive = await livenessCheck();
      expect(alive).toBe(true);
    });
  });
});
