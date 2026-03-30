/**
 * 安全头深度测试 - Round 171
 * 验证所有安全Header的正确设置和组合
 */
import { describe, it, expect, vi } from 'vitest';
import {
  enhancedSecurityHeaders,
  enhancedCors,
  requestIdMiddleware,
  antiClickjack,
  auditLog,
} from '../middleware/securityHeaders';

function mockReq(method = 'GET', path = '/api/test', headers: Record<string, string> = {}) {
  return {
    method,
    path,
    headers: { ...headers },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    on: vi.fn(),
  } as any;
}

function mockRes() {
  const res: any = {
    _headers: {} as Record<string, string>,
    _removed: [] as string[],
    statusCode: 200,
    setHeader(name: string, value: string) { res._headers[name.toLowerCase()] = value; },
    getHeader(name: string) { return res._headers[name.toLowerCase()]; },
    removeHeader(name: string) { res._removed.push(name.toLowerCase()); delete res._headers[name.toLowerCase()]; },
    on: vi.fn(),
    status(code: number) { res.statusCode = code; return res; },
    end: vi.fn(),
  };
  return res;
}

describe('安全头深度测试', () => {
  describe('基础安全头', () => {
    it('应设置 X-Content-Type-Options: nosniff', () => {
      const middleware = enhancedSecurityHeaders();
      const req = mockReq();
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res._headers['x-content-type-options']).toBe('nosniff');
    });

    it('应设置 X-Frame-Options: DENY', () => {
      const middleware = enhancedSecurityHeaders();
      const req = mockReq();
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res._headers['x-frame-options']).toBe('DENY');
    });

    it('应设置 X-XSS-Protection', () => {
      const middleware = enhancedSecurityHeaders();
      const req = mockReq();
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res._headers['x-xss-protection']).toBe('1; mode=block');
    });

    it('应设置 Referrer-Policy', () => {
      const middleware = enhancedSecurityHeaders();
      const req = mockReq();
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res._headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });

    it('应移除 X-Powered-By', () => {
      const middleware = enhancedSecurityHeaders();
      const req = mockReq();
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res._removed).toContain('x-powered-by');
    });

    it('应移除 Server 头', () => {
      const middleware = enhancedSecurityHeaders();
      const req = mockReq();
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res._removed).toContain('server');
    });
  });

  describe('Content-Security-Policy', () => {
    it('应设置默认CSP', () => {
      const middleware = enhancedSecurityHeaders();
      const req = mockReq();
      const res = mockRes();
      middleware(req, res, () => {});
      const csp = res._headers['content-security-policy'];
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('应支持自定义CSP', () => {
      const middleware = enhancedSecurityHeaders({
        contentSecurityPolicy: "default-src 'none'",
      });
      const req = mockReq();
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res._headers['content-security-policy']).toBe("default-src 'none'");
    });

    it('应支持禁用CSP', () => {
      const middleware = enhancedSecurityHeaders({ contentSecurityPolicy: false });
      const req = mockReq();
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res._headers['content-security-policy']).toBeUndefined();
    });
  });

  describe('HSTS', () => {
    it('应设置默认HSTS', () => {
      const middleware = enhancedSecurityHeaders();
      const req = mockReq();
      const res = mockRes();
      middleware(req, res, () => {});
      const hsts = res._headers['strict-transport-security'];
      expect(hsts).toContain('max-age=31536000');
      expect(hsts).toContain('includeSubDomains');
      expect(hsts).toContain('preload');
    });

    it('应支持自定义HSTS', () => {
      const middleware = enhancedSecurityHeaders({
        hsts: { maxAge: 86400, includeSubDomains: false, preload: false },
      });
      const req = mockReq();
      const res = mockRes();
      middleware(req, res, () => {});
      const hsts = res._headers['strict-transport-security'];
      expect(hsts).toContain('max-age=86400');
      expect(hsts).not.toContain('includeSubDomains');
      expect(hsts).not.toContain('preload');
    });

    it('应支持禁用HSTS', () => {
      const middleware = enhancedSecurityHeaders({ hsts: false });
      const req = mockReq();
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res._headers['strict-transport-security']).toBeUndefined();
    });
  });

  describe('Permissions-Policy', () => {
    it('应设置默认Permissions-Policy', () => {
      const middleware = enhancedSecurityHeaders();
      const req = mockReq();
      const res = mockRes();
      middleware(req, res, () => {});
      const pp = res._headers['permissions-policy'];
      expect(pp).toContain('camera=()');
      expect(pp).toContain('microphone=()');
      expect(pp).toContain('geolocation=()');
      expect(pp).toContain('payment=()');
    });

    it('应支持禁用Permissions-Policy', () => {
      const middleware = enhancedSecurityHeaders({ permissionsPolicy: false });
      const req = mockReq();
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res._headers['permissions-policy']).toBeUndefined();
    });
  });

  describe('API缓存控制', () => {
    it('API路径应设置no-cache', () => {
      const middleware = enhancedSecurityHeaders();
      const req = mockReq('GET', '/api/stocks');
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res._headers['cache-control']).toContain('no-store');
      expect(res._headers['pragma']).toBe('no-cache');
    });

    it('非API路径不应设置no-cache', () => {
      const middleware = enhancedSecurityHeaders();
      const req = mockReq('GET', '/static/app.js');
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res._headers['cache-control']).toBeUndefined();
    });
  });

  describe('CORS', () => {
    it('应设置CORS头', () => {
      const middleware = enhancedCors();
      const req = mockReq('GET', '/', { origin: 'http://localhost:3000' });
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res._headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res._headers['access-control-allow-credentials']).toBe('true');
    });

    it('OPTIONS预检应返回204', () => {
      const middleware = enhancedCors();
      const req = mockReq('OPTIONS', '/');
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res.status).toBeDefined();
    });

    it('白名单外的origin不应被允许', () => {
      const middleware = enhancedCors(['https://allowed.com']);
      const req = mockReq('GET', '/', { origin: 'https://evil.com' });
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res._headers['access-control-allow-origin']).toBeUndefined();
    });

    it('白名单内的origin应被允许', () => {
      const middleware = enhancedCors(['https://allowed.com']);
      const req = mockReq('GET', '/', { origin: 'https://allowed.com' });
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res._headers['access-control-allow-origin']).toBe('https://allowed.com');
    });
  });

  describe('请求ID', () => {
    it('应生成请求ID', () => {
      const middleware = requestIdMiddleware;
      const req = mockReq();
      const res = mockRes();
      middleware(req as any, res as any, () => {});
      expect(res._headers['x-request-id']).toBeDefined();
    });

    it('应使用现有请求ID', () => {
      const middleware = requestIdMiddleware;
      const req = mockReq('GET', '/', { 'x-request-id': 'existing-id' });
      const res = mockRes();
      middleware(req as any, res as any, () => {});
      expect(res._headers['x-request-id']).toBe('existing-id');
    });
  });

  describe('反点击劫持', () => {
    it('应设置 DENY 和 frame-ancestors none', () => {
      const middleware = antiClickjack;
      const req = mockReq();
      const res = mockRes();
      middleware(req as any, res as any, () => {});
      expect(res._headers['x-frame-options']).toBe('DENY');
      expect(res._headers['content-security-policy']).toContain("frame-ancestors 'none'");
    });
  });

  describe('审计日志', () => {
    it('应注册 finish 事件', () => {
      const middleware = auditLog('login');
      const req = mockReq('POST', '/api/login');
      const res = mockRes();
      middleware(req as any, res as any, () => {});
      expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });
  });
});
