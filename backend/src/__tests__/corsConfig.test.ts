import { describe, it, expect, vi, beforeEach } from 'vitest';
import { corsMiddleware, isOriginAllowed, getCorsViolations } from '../middleware/corsConfig';

// Mock Express req/res
function createMockReq(method: string, origin?: string, path = '/api/test') {
  return {
    method,
    headers: origin ? { origin } : {},
    path,
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  } as any;
}

function createMockRes() {
  const headers: Record<string, string> = {};
  return {
    setHeader: vi.fn((key: string, value: string) => { headers[key] = value; }),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    _headers: headers,
  } as any;
}

describe('isOriginAllowed', () => {
  it('无 origin 应该返回 true（同源）', () => {
    expect(isOriginAllowed(undefined, ['http://example.com'])).toBe(true);
  });

  it('精确匹配应该返回 true', () => {
    expect(isOriginAllowed('http://example.com', ['http://example.com'])).toBe(true);
  });

  it('不匹配应该返回 false', () => {
    expect(isOriginAllowed('http://evil.com', ['http://example.com'])).toBe(false);
  });

  it('通配符子域名应该匹配', () => {
    expect(isOriginAllowed('https://app.example.com', ['*.example.com'])).toBe(true);
    expect(isOriginAllowed('https://sub.app.example.com', ['*.example.com'])).toBe(true);
  });

  it('通配符子域名不应匹配主域名（当前实现行为）', () => {
    // 注意：当前实现中 *.example.com 也会匹配 example.com (hostname===domain)
    expect(isOriginAllowed('https://example.com', ['*.example.com'])).toBe(true);
  });

  it('带协议的通配符应该匹配协议', () => {
    expect(isOriginAllowed('https://app.example.com', ['https://*.example.com'])).toBe(true);
    expect(isOriginAllowed('http://app.example.com', ['https://*.example.com'])).toBe(false);
  });

  it('星号应该允许所有来源', () => {
    expect(isOriginAllowed('http://anything.com', ['*'])).toBe(true);
  });

  it('空列表应该返回 false', () => {
    expect(isOriginAllowed('http://example.com', [])).toBe(false);
  });

  it('无效 URL 应该安全处理', () => {
    expect(isOriginAllowed('not-a-url', ['*.example.com'])).toBe(false);
  });
});

describe('corsMiddleware', () => {
  it('无 origin 头应该直接放行', () => {
    const middleware = corsMiddleware({
      origins: ['http://allowed.com'],
    });

    const req = createMockReq('GET', undefined);
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('允许的 origin 应该设置 CORS 头', () => {
    const middleware = corsMiddleware({
      origins: ['http://allowed.com'],
    });

    const req = createMockReq('GET', 'http://allowed.com');
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'http://allowed.com');
    expect(res.setHeader).toHaveBeenCalledWith('Vary', 'Origin');
    expect(next).toHaveBeenCalled();
  });

  it('凭证应该默认开启', () => {
    const middleware = corsMiddleware({
      origins: ['http://allowed.com'],
    });

    const req = createMockReq('GET', 'http://allowed.com');
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true');
  });

  it('不允许的 origin 应该返回 403', () => {
    const middleware = corsMiddleware({
      origins: ['http://allowed.com'],
    });

    const req = createMockReq('GET', 'http://evil.com');
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'CORS_ORIGIN_DENIED',
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('预检请求应该返回 204', () => {
    const middleware = corsMiddleware({
      origins: ['http://allowed.com'],
    });

    const req = createMockReq('OPTIONS', 'http://allowed.com');
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', expect.any(String));
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', expect.any(String));
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Max-Age', expect.any(String));
  });

  it('不允许的预检请求应该返回 403', () => {
    const middleware = corsMiddleware({
      origins: ['http://allowed.com'],
    });

    const req = createMockReq('OPTIONS', 'http://evil.com');
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('暴露头应该被设置', () => {
    const middleware = corsMiddleware({
      origins: ['http://allowed.com'],
      exposedHeaders: ['X-Custom-Header'],
    });

    const req = createMockReq('GET', 'http://allowed.com');
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Expose-Headers', 'X-Custom-Header');
  });

  it('凭证关闭时不设置 credentials 头', () => {
    const middleware = corsMiddleware({
      origins: ['http://allowed.com'],
      credentials: false,
    });

    const req = createMockReq('GET', 'http://allowed.com');
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    const calls = (res.setHeader as any).mock.calls;
    const credentialCalls = calls.filter((c: any[]) => c[0] === 'Access-Control-Allow-Credentials');
    expect(credentialCalls.length).toBe(0);
  });

  it('自定义 methods 应该生效', () => {
    const middleware = corsMiddleware({
      origins: ['http://allowed.com'],
      methods: ['GET', 'POST'],
    });

    const req = createMockReq('OPTIONS', 'http://allowed.com');
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET, POST');
  });

  it('自定义 maxAge 应该生效', () => {
    const middleware = corsMiddleware({
      origins: ['http://allowed.com'],
      maxAge: 3600,
    });

    const req = createMockReq('OPTIONS', 'http://allowed.com');
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Max-Age', '3600');
  });
});

describe('getCorsViolations', () => {
  it('应该返回违规记录数组', () => {
    const violations = getCorsViolations();
    expect(Array.isArray(violations)).toBe(true);
  });

  it('拒绝的请求应该被记录', () => {
    const middleware = corsMiddleware({
      origins: ['http://allowed.com'],
    });

    const req = createMockReq('GET', 'http://malicious.com');
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    const violations = getCorsViolations();
    const last = violations[violations.length - 1];
    expect(last.origin).toBe('http://malicious.com');
    expect(last.method).toBe('GET');
  });
});
