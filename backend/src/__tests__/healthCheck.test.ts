import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthCheckService, createDefaultHealthCheck } from '../services/healthCheck';

describe('HealthCheckService', () => {
  let service: HealthCheckService;

  beforeEach(() => {
    service = new HealthCheckService('1.2.3');
  });

  describe('register and unregister', () => {
    it('should register a check', () => {
      service.register('test', async () => ({ status: 'pass' }));
      expect(service.getRegisteredChecks()).toContain('test');
    });

    it('should unregister a check', () => {
      service.register('test', async () => ({ status: 'pass' }));
      expect(service.unregister('test')).toBe(true);
      expect(service.getRegisteredChecks()).not.toContain('test');
    });

    it('should return false for unregistering unknown check', () => {
      expect(service.unregister('unknown')).toBe(false);
    });
  });

  describe('checkAll', () => {
    it('should return healthy when all checks pass', async () => {
      service.register('db', async () => ({ status: 'pass' }));
      service.register('cache', async () => ({ status: 'pass' }));

      const result = await service.checkAll();
      expect(result.status).toBe('healthy');
      expect(result.version).toBe('1.2.3');
      expect(result.checks).toHaveLength(2);
    });

    it('should return degraded when some checks warn', async () => {
      service.register('db', async () => ({ status: 'pass' }));
      service.register('cache', async () => ({ status: 'warn', message: 'Slow' }));

      const result = await service.checkAll();
      expect(result.status).toBe('degraded');
    });

    it('should return unhealthy when any check fails', async () => {
      service.register('db', async () => ({ status: 'pass' }));
      service.register('cache', async () => ({ status: 'fail', message: 'Down' }));

      const result = await service.checkAll();
      expect(result.status).toBe('unhealthy');
    });

    it('should handle check exceptions', async () => {
      service.register('broken', async () => { throw new Error('crash'); });

      const result = await service.checkAll();
      expect(result.status).toBe('unhealthy');
      expect(result.checks[0].status).toBe('fail');
      expect(result.checks[0].message).toBe('crash');
    });

    it('should measure latency', async () => {
      service.register('fast', async () => ({ status: 'pass' }));
      const result = await service.checkAll();
      expect(result.checks[0].latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should include uptime', async () => {
      const result = await service.checkAll();
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should include timestamp', async () => {
      const before = Date.now();
      const result = await service.checkAll();
      const after = Date.now();
      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('check single', () => {
    it('should run single check', async () => {
      service.register('test', async () => ({ status: 'pass', message: 'OK' }));
      const result = await service.check('test');
      expect(result?.status).toBe('pass');
      expect(result?.message).toBe('OK');
    });

    it('should return null for unknown check', async () => {
      const result = await service.check('unknown');
      expect(result).toBeNull();
    });
  });

  describe('createDefaultHealthCheck', () => {
    it('should create service with default checks', () => {
      const s = createDefaultHealthCheck('2.0.0');
      expect(s.getRegisteredChecks()).toContain('memory');
      expect(s.getRegisteredChecks()).toContain('uptime');
    });

    it('should run default checks', async () => {
      const s = createDefaultHealthCheck();
      const result = await s.checkAll();
      expect(result.checks.length).toBeGreaterThanOrEqual(2);
    });
  });
});
