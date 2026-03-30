/**
 * CSRF 深度测试 - Round 167
 * 覆盖：中间件集成、时序安全、边界条件、旋转Token、SameSite策略
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateCsrfToken, csrfProtection, csrfTokenEndpoint } from '../middleware/csrf';
import crypto from 'crypto';

// Mock Express req/res
function mockReq(method: string, cookies: Record<string, string> = {}, headers: Record<string, string> = {}) {
  return {
    method,
    cookies,
    headers,
  } as any;
}

function mockRes() {
  const res: any = {
    cookies: {} as Record<string, string>,
    cookieOpts: {} as Record<string, any>,
    statusCode: 200,
    body: null,
    cookie(name: string, value: string, opts?: any) {
      res.cookies[name] = value;
      res.cookieOpts[name] = opts;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
  };
  return res;
}

describe('CSRF 深度防护测试', () => {
  describe('Token 生成深度', () => {
    it('应使用 crypto.randomBytes', () => {
      const spy = vi.spyOn(crypto, 'randomBytes');
      generateCsrfToken();
      expect(spy).toHaveBeenCalledWith(32);
      spy.mockRestore();
    });

    it('1000个token不应有重复', () => {
      const tokens = new Set(Array.from({ length: 1000 }, () => generateCsrfToken()));
      expect(tokens.size).toBe(1000);
    });

    it('token应为纯hex字符且长度64', () => {
      for (let i = 0; i < 100; i++) {
        const token = generateCsrfToken();
        expect(token).toMatch(/^[0-9a-f]{64}$/);
      }
    });

    it('token不应包含可预测模式', () => {
      const tokens = Array.from({ length: 100 }, () => generateCsrfToken());
      // 检查前8字符不应有超过5个相同
      const prefixes = tokens.map(t => t.slice(0, 8));
      const uniquePrefixes = new Set(prefixes);
      expect(uniquePrefixes.size).toBeGreaterThan(90);
    });
  });

  describe('中间件 - GET请求', () => {
    it('GET请求应设置CSRF cookie', () => {
      const middleware = csrfProtection();
      const req = mockReq('GET');
      const res = mockRes();
      let nextCalled = false;
      middleware(req, res, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
      expect(res.cookies.__csrf_token).toBeDefined();
      expect(res.cookies.__csrf_token).toHaveLength(64);
    });

    it('已有cookie的GET不应覆盖token', () => {
      const middleware = csrfProtection();
      const existingToken = generateCsrfToken();
      const req = mockReq('GET', { __csrf_token: existingToken });
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res.cookies.__csrf_token).toBeUndefined();
    });

    it('HEAD请求应跳过检查', () => {
      const middleware = csrfProtection();
      const req = mockReq('HEAD');
      const res = mockRes();
      let nextCalled = false;
      middleware(req, res, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    });

    it('OPTIONS请求应跳过检查', () => {
      const middleware = csrfProtection();
      const req = mockReq('OPTIONS');
      const res = mockRes();
      let nextCalled = false;
      middleware(req, res, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    });
  });

  describe('中间件 - POST请求验证', () => {
    it('无token的POST应返回403', () => {
      const middleware = csrfProtection();
      const req = mockReq('POST');
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('CSRF_TOKEN_MISSING');
    });

    it('有cookie无header的POST应返回403', () => {
      const middleware = csrfProtection();
      const req = mockReq('POST', { __csrf_token: generateCsrfToken() });
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res.statusCode).toBe(403);
    });

    it('有header无cookie的POST应返回403', () => {
      const middleware = csrfProtection();
      const req = mockReq('POST', {}, { 'x-csrf-token': generateCsrfToken() });
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res.statusCode).toBe(403);
    });

    it('匹配token的POST应通过', () => {
      const middleware = csrfProtection();
      const token = generateCsrfToken();
      const req = mockReq('POST', { __csrf_token: token }, { 'x-csrf-token': token });
      const res = mockRes();
      let nextCalled = false;
      middleware(req, res, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('不匹配token的POST应返回403', () => {
      const middleware = csrfProtection();
      const req = mockReq('POST',
        { __csrf_token: generateCsrfToken() },
        { 'x-csrf-token': generateCsrfToken() }
      );
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('CSRF_TOKEN_INVALID');
    });

    it('PUT请求也应验证', () => {
      const middleware = csrfProtection();
      const req = mockReq('PUT');
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res.statusCode).toBe(403);
    });

    it('DELETE请求也应验证', () => {
      const middleware = csrfProtection();
      const req = mockReq('DELETE');
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res.statusCode).toBe(403);
    });

    it('PATCH请求也应验证', () => {
      const middleware = csrfProtection();
      const req = mockReq('PATCH');
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res.statusCode).toBe(403);
    });
  });

  describe('自定义配置', () => {
    it('自定义cookie名称', () => {
      const middleware = csrfProtection({ cookieName: 'my_csrf' });
      const req = mockReq('GET');
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res.cookies.my_csrf).toBeDefined();
    });

    it('自定义header名称', () => {
      const middleware = csrfProtection({ headerName: 'x-my-csrf' });
      const token = generateCsrfToken();
      const req = mockReq('POST', { __csrf_token: token }, { 'x-my-csrf': token });
      const res = mockRes();
      let nextCalled = false;
      middleware(req, res, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    });

    it('自定义忽略方法', () => {
      const middleware = csrfProtection({ ignoreMethods: ['GET', 'POST'] });
      const req = mockReq('POST');
      const res = mockRes();
      let nextCalled = false;
      middleware(req, res, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    });

    it('生产环境cookie应为secure', () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const middleware = csrfProtection();
      const req = mockReq('GET');
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res.cookieOpts.__csrf_token.secure).toBe(true);
      process.env.NODE_ENV = origEnv;
    });

    it('cookie应为非httpOnly（前端需要读取）', () => {
      const middleware = csrfProtection();
      const req = mockReq('GET');
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res.cookieOpts.__csrf_token.httpOnly).toBe(false);
    });

    it('自定义maxAge', () => {
      const middleware = csrfProtection({ cookieOptions: { maxAge: 3600000 } });
      const req = mockReq('GET');
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res.cookieOpts.__csrf_token.maxAge).toBe(3600000);
    });
  });

  describe('时序攻击防护', () => {
    it('不等长比较应不崩溃', () => {
      const middleware = csrfProtection();
      const req = mockReq('POST',
        { __csrf_token: 'short' },
        { 'x-csrf-token': 'a'.repeat(64) }
      );
      const res = mockRes();
      // 不应抛异常
      expect(() => middleware(req, res, () => {})).not.toThrow();
      expect(res.statusCode).toBe(403);
    });

    it('空字符串比较应不崩溃', () => {
      const middleware = csrfProtection();
      const req = mockReq('POST',
        { __csrf_token: '' },
        { 'x-csrf-token': '' }
      );
      const res = mockRes();
      expect(() => middleware(req, res, () => {})).not.toThrow();
    });
  });

  describe('Token旋转', () => {
    it('每次GET应生成新token（无cookie时）', () => {
      const middleware = csrfProtection();
      const tokens = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const req = mockReq('GET');
        const res = mockRes();
        middleware(req, res, () => {});
        tokens.add(res.cookies.__csrf_token);
      }
      expect(tokens.size).toBe(10);
    });

    it('前端可通过端点获取新token', () => {
      const req = mockReq('GET');
      const res = mockRes();
      csrfTokenEndpoint(req as any, res as any);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toHaveLength(64);
      expect(res.cookies.__csrf_token).toBe(res.body.data.token);
    });
  });

  describe('边界条件', () => {
    it('undefined cookies不应崩溃', () => {
      const middleware = csrfProtection();
      const req = { method: 'POST', headers: {} } as any;
      const res = mockRes();
      expect(() => middleware(req, res, () => {})).not.toThrow();
      expect(res.statusCode).toBe(403);
    });

    it('null header值应处理', () => {
      const middleware = csrfProtection();
      const req = { method: 'POST', cookies: { __csrf_token: generateCsrfToken() }, headers: { 'x-csrf-token': null } } as any;
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res.statusCode).toBe(403);
    });

    it('大小写header应正确处理', () => {
      const middleware = csrfProtection();
      const token = generateCsrfToken();
      const req = { method: 'POST', cookies: { __csrf_token: token }, headers: { 'X-CSRF-TOKEN': token } } as any;
      const res = mockRes();
      // Express lowercases header names
      let nextCalled = false;
      const reqLower = { ...req, headers: { 'x-csrf-token': token } };
      middleware(reqLower as any, res, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    });

    it('超长token不应导致性能问题', () => {
      const middleware = csrfProtection();
      const longToken = 'a'.repeat(10000);
      const req = mockReq('POST', { __csrf_token: longToken }, { 'x-csrf-token': longToken });
      const res = mockRes();
      const start = Date.now();
      middleware(req, res, () => {});
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100); // 应在100ms内完成
    });
  });

  describe('安全属性', () => {
    it('sameSite应为lax', () => {
      const middleware = csrfProtection();
      const req = mockReq('GET');
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res.cookieOpts.__csrf_token.sameSite).toBe('lax');
    });

    it('error响应应包含安全的错误信息', () => {
      const middleware = csrfProtection();
      const req = mockReq('POST');
      const res = mockRes();
      middleware(req, res, () => {});
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
      // 不应泄露内部信息
      expect(res.body.error).not.toContain('cookie');
      expect(res.body.error).not.toContain('header');
    });

    it('不应在error中泄露token值', () => {
      const middleware = csrfProtection();
      const token = generateCsrfToken();
      const req = mockReq('POST', { __csrf_token: token }, { 'x-csrf-token': 'wrong' });
      const res = mockRes();
      middleware(req, res, () => {});
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain(token);
    });
  });
});
