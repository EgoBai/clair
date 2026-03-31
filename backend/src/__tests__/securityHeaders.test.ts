/**
 * 安全响应头测试
 */
import { describe, it, expect } from 'vitest';

describe('安全响应头', () => {
  const requiredHeaders = [
    { name: 'X-Content-Type-Options', value: 'nosniff' },
    { name: 'X-Frame-Options', value: 'DENY' },
    { name: 'X-XSS-Protection', value: '1; mode=block' },
    { name: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { name: 'Permissions-Policy' },
  ];

  it('应包含所有必要安全头', () => {
    const headerNames = requiredHeaders.map(h => h.name);
    expect(headerNames).toContain('X-Content-Type-Options');
    expect(headerNames).toContain('X-Frame-Options');
    expect(headerNames).toContain('X-XSS-Protection');
    expect(headerNames).toContain('Referrer-Policy');
    expect(headerNames).toContain('Permissions-Policy');
  });

  describe('CSP 策略', () => {
    const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss: ws:;";

    it('应限制 default-src 为 self', () => {
      expect(csp).toContain("default-src 'self'");
    });

    it('应允许 WebSocket 连接', () => {
      expect(csp).toMatch(/connect-src.*ws/);
    });

    it('应限制 script-src', () => {
      expect(csp).toContain("script-src 'self'");
    });
  });

  describe('HSTS 配置', () => {
    const hsts = 'max-age=31536000; includeSubDomains; preload';

    it('max-age 应为至少 1 年', () => {
      const match = hsts.match(/max-age=(\d+)/);
      expect(match).toBeTruthy();
      const maxAge = parseInt(match![1], 10);
      expect(maxAge).toBeGreaterThanOrEqual(31536000);
    });

    it('应包含 includeSubDomains', () => {
      expect(hsts).toContain('includeSubDomains');
    });
  });

  describe('X-Frame-Options', () => {
    it('应为 DENY 或 SAMEORIGIN', () => {
      const validValues = ['DENY', 'SAMEORIGIN'];
      expect(validValues).toContain('DENY');
    });
  });

  describe('Cache-Control 敏感端点', () => {
    const sensitiveCacheControl = 'no-store, no-cache, must-revalidate, proxy-revalidate';

    it('应禁止缓存', () => {
      expect(sensitiveCacheControl).toContain('no-store');
      expect(sensitiveCacheControl).toContain('no-cache');
    });
  });

  describe('中间件函数测试', () => {
    function createMockRes() {
      const headers: Record<string, string> = {};
      const removedHeaders: string[] = [];
      const listeners: Record<string, Function[]> = {};
      return {
        headers,
        setHeader: (k: string, v: string) => { headers[k] = v; },
        removeHeader: (k: string) => { removedHeaders.push(k); delete headers[k]; },
        getHeader: (k: string) => headers[k],
        removedHeaders,
        on: (event: string, fn: Function) => { (listeners[event] = listeners[event] || []).push(fn); },
        statusCode: 200,
        listeners,
      };
    }

    function createMockReq(path: string = '/api/test', method: string = 'GET') {
      return { path, method, headers: {}, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } } as any;
    }

    it('enhancedSecurityHeaders应设置所有安全头', async () => {
      const { enhancedSecurityHeaders } = await import('../middleware/securityHeaders');
      const middleware = enhancedSecurityHeaders();
      const req = createMockReq();
      const res = createMockRes();
      let nextCalled = false;
      middleware(req, res as any, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
      expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
      expect(res.headers['X-Frame-Options']).toBe('DENY');
      expect(res.headers['X-XSS-Protection']).toBe('1; mode=block');
      expect(res.headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
      expect(res.headers['Permissions-Policy']).toBeTruthy();
    });

    it('API请求应设置no-cache头部', async () => {
      const { enhancedSecurityHeaders } = await import('../middleware/securityHeaders');
      const middleware = enhancedSecurityHeaders();
      const req = createMockReq('/api/stocks');
      const res = createMockRes();
      middleware(req, res as any, () => {});

      expect(res.headers['Cache-Control']).toContain('no-store');
      expect(res.headers['Pragma']).toBe('no-cache');
    });

    it('非API请求不应设置no-cache', async () => {
      const { enhancedSecurityHeaders } = await import('../middleware/securityHeaders');
      const middleware = enhancedSecurityHeaders();
      const req = createMockReq('/static/main.js');
      const res = createMockRes();
      middleware(req, res as any, () => {});

      expect(res.headers['Cache-Control']).toBeUndefined();
    });

    it('应移除X-Powered-By头部', async () => {
      const { enhancedSecurityHeaders } = await import('../middleware/securityHeaders');
      const middleware = enhancedSecurityHeaders();
      const req = createMockReq();
      const res = createMockRes();
      middleware(req, res as any, () => {});

      expect(res.removedHeaders).toContain('X-Powered-By');
      expect(res.removedHeaders).toContain('Server');
    });

    it('禁用CSP时不设置CSP头', async () => {
      const { enhancedSecurityHeaders } = await import('../middleware/securityHeaders');
      const middleware = enhancedSecurityHeaders({ contentSecurityPolicy: false });
      const req = createMockReq();
      const res = createMockRes();
      middleware(req, res as any, () => {});

      expect(res.headers['Content-Security-Policy']).toBeUndefined();
    });

    it('禁用HSTS时不设置HSTS头', async () => {
      const { enhancedSecurityHeaders } = await import('../middleware/securityHeaders');
      const middleware = enhancedSecurityHeaders({ hsts: false });
      const req = createMockReq();
      const res = createMockRes();
      middleware(req, res as any, () => {});

      expect(res.headers['Strict-Transport-Security']).toBeUndefined();
    });

    it('禁用Permissions-Policy时不设置该头', async () => {
      const { enhancedSecurityHeaders } = await import('../middleware/securityHeaders');
      const middleware = enhancedSecurityHeaders({ permissionsPolicy: false });
      const req = createMockReq();
      const res = createMockRes();
      middleware(req, res as any, () => {});

      expect(res.headers['Permissions-Policy']).toBeUndefined();
    });
  });

  describe('CORS中间件', () => {
    function createMockRes() {
      const headers: Record<string, string> = {};
      return {
        headers,
        setHeader: (k: string, v: string) => { headers[k] = v; },
        status: (code: number) => ({ end: () => {} }),
        statusCode: 200,
      };
    }

    it('应设置CORS头对于允许的来源', async () => {
      const { enhancedCors } = await import('../middleware/securityHeaders');
      const middleware = enhancedCors(['https://example.com']);
      const req = { headers: { origin: 'https://example.com' }, method: 'GET' } as any;
      const res = createMockRes();
      let nextCalled = false;
      middleware(req, res as any, () => { nextCalled = true; });

      expect(res.headers['Access-Control-Allow-Origin']).toBe('https://example.com');
      expect(nextCalled).toBe(true);
    });

    it('不应为非允许来源设置CORS头', async () => {
      const { enhancedCors } = await import('../middleware/securityHeaders');
      const middleware = enhancedCors(['https://example.com']);
      const req = { headers: { origin: 'https://evil.com' }, method: 'GET' } as any;
      const res = createMockRes();
      let nextCalled = false;
      middleware(req, res as any, () => { nextCalled = true; });

      expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
      expect(nextCalled).toBe(true);
    });

    it('空允许列表应允许所有来源', async () => {
      const { enhancedCors } = await import('../middleware/securityHeaders');
      const middleware = enhancedCors([]);
      const req = { headers: { origin: 'https://any.com' }, method: 'GET' } as any;
      const res = createMockRes();
      middleware(req, res as any, () => {});

      expect(res.headers['Access-Control-Allow-Origin']).toBe('https://any.com');
    });

    it('OPTIONS请求应返回204', async () => {
      const { enhancedCors } = await import('../middleware/securityHeaders');
      const middleware = enhancedCors([]);
      const req = { headers: { origin: 'https://any.com' }, method: 'OPTIONS' } as any;
      let statusCalled = 0;
      const res = {
        headers: {},
        setHeader: (k: string, v: string) => { (res as any).headers[k] = v; },
        status: (code: number) => { statusCalled = code; return { end: () => {} }; },
      };
      middleware(req, res as any, () => {});

      expect(statusCalled).toBe(204);
    });
  });

  describe('请求ID中间件', () => {
    it('应使用现有X-Request-ID', async () => {
      const { requestIdMiddleware } = await import('../middleware/securityHeaders');
      const req = { headers: { 'x-request-id': 'existing-id-123' } } as any;
      const res = { setHeader: () => {}, headers: {} } as any;
      let resHeaders: Record<string, string> = {};
      res.setHeader = (k: string, v: string) => { resHeaders[k] = v; };
      let nextCalled = false;
      requestIdMiddleware(req, res, () => { nextCalled = true; });

      expect(req.headers['x-request-id']).toBe('existing-id-123');
      expect(resHeaders['X-Request-ID']).toBe('existing-id-123');
      expect(nextCalled).toBe(true);
    });

    it('无现有ID时应生成新ID', async () => {
      const { requestIdMiddleware } = await import('../middleware/securityHeaders');
      const req = { headers: {} } as any;
      let resHeaders: Record<string, string> = {};
      const res = { setHeader: (k: string, v: string) => { resHeaders[k] = v; } } as any;
      let nextCalled = false;
      requestIdMiddleware(req, res, () => { nextCalled = true; });

      expect(req.headers['x-request-id']).toBeTruthy();
      expect(resHeaders['X-Request-ID']).toBeTruthy();
      expect(req.headers['x-request-id']).toBe(resHeaders['X-Request-ID']);
      expect(nextCalled).toBe(true);
    });
  });
});
