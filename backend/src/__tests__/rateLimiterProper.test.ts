import { describe, it, expect } from 'vitest';
import { rateLimit, apiRateLimit, syncRateLimit } from '../middleware/rateLimit';

describe('Rate Limiter Proper', () => {
  describe('rateLimit factory', () => {
    it('should create rate limit middleware', () => {
      const middleware = rateLimit({ windowMs: 60000, max: 100 });
      expect(typeof middleware).toBe('function');
    });

    it('should create with default options', () => {
      const middleware = rateLimit();
      expect(typeof middleware).toBe('function');
    });

    it('should create API rate limit', () => {
      expect(typeof apiRateLimit).toBe('function');
    });

    it('should create sync rate limit', () => {
      expect(typeof syncRateLimit).toBe('function');
    });

    it('should accept custom window and max', () => {
      const middleware = rateLimit({ windowMs: 10000, max: 5 });
      expect(typeof middleware).toBe('function');
    });

    it('should accept custom message', () => {
      const middleware = rateLimit({ windowMs: 60000, max: 100, message: 'Too many requests' });
      expect(typeof middleware).toBe('function');
    });

    it('should handle zero max', () => {
      const middleware = rateLimit({ windowMs: 60000, max: 0 });
      expect(typeof middleware).toBe('function');
    });

    it('should handle very large window', () => {
      const middleware = rateLimit({ windowMs: 86400000, max: 10000 });
      expect(typeof middleware).toBe('function');
    });

    it('should handle very small window', () => {
      const middleware = rateLimit({ windowMs: 100, max: 1 });
      expect(typeof middleware).toBe('function');
    });

    it('should accept empty skipPaths', () => {
      const middleware = rateLimit({ windowMs: 60000, max: 100, skipPaths: [] });
      expect(typeof middleware).toBe('function');
    });

    it('should accept multiple skipPaths', () => {
      const middleware = rateLimit({ windowMs: 60000, max: 100, skipPaths: ['/health', '/metrics', '/ping'] });
      expect(typeof middleware).toBe('function');
    });
  });

  describe('中间件基本功能', () => {
    it('应在第一次请求时调用next', () => {
      const middleware = rateLimit({ windowMs: 60000, max: 100 });
      const req = { path: '/api/test', ip: '172.16.0.1', socket: { remoteAddress: '172.16.0.1' }, headers: {} } as any;
      const headers: Record<string, string> = {};
      const res = { set: (k: string, v: string) => { headers[k] = v; }, get: (k: string) => headers[k] } as any;
      let called = false;
      middleware(req, res, () => { called = true; });
      expect(called).toBe(true);
      expect(headers['X-RateLimit-Limit']).toBeTruthy();
      expect(headers['X-RateLimit-Remaining']).toBeTruthy();
    });

    it('应跳过健康检查路径', () => {
      const middleware = rateLimit({ windowMs: 60000, max: 0 });
      const req = { path: '/health', ip: '172.16.0.2', socket: { remoteAddress: '172.16.0.2' }, headers: {} } as any;
      const res = { set: () => {} } as any;
      let called = false;
      middleware(req, res, () => { called = true; });
      expect(called).toBe(true);
    });

    it('应为API路径设置缓存控制头', () => {
      const middleware = rateLimit({ windowMs: 60000, max: 100 });
      const req = { path: '/api/stocks', ip: '172.16.0.3', socket: { remoteAddress: '172.16.0.3' }, headers: {} } as any;
      const headers: Record<string, string> = {};
      const res = { set: (k: string, v: string) => { headers[k] = v; } } as any;
      middleware(req, res, () => {});
      expect(headers['X-RateLimit-Limit']).toBe('100');
    });
  });
});
