import { describe, it, expect, beforeEach } from 'vitest';
import { isOriginAllowed, getCorsViolations } from '../middleware/corsConfig';

describe('CORS 加固 - 原点验证', () => {
  const whitelist = [
    'https://astock.example.com',
    'https://*.example.com',
    'http://localhost:3000',
    'http://localhost:5173',
  ];

  it('精确匹配白名单域名', () => {
    expect(isOriginAllowed('https://astock.example.com', whitelist)).toBe(true);
  });

  it('拒绝未在白名单的域名', () => {
    expect(isOriginAllowed('https://evil.com', whitelist)).toBe(false);
  });

  it('通配符子域名匹配', () => {
    expect(isOriginAllowed('https://sub.example.com', whitelist)).toBe(true);
    expect(isOriginAllowed('https://deep.sub.example.com', whitelist)).toBe(true);
    // example.com 也在 *.example.com 覆盖范围内
    expect(isOriginAllowed('https://example.com', whitelist)).toBe(true);
  });

  it('本地开发域名放行', () => {
    expect(isOriginAllowed('http://localhost:3000', whitelist)).toBe(true);
    expect(isOriginAllowed('http://localhost:5173', whitelist)).toBe(true);
  });

  it('无 Origin 头（同源请求）放行', () => {
    expect(isOriginAllowed(undefined, whitelist)).toBe(true);
  });

  it('空白名单拒绝所有', () => {
    expect(isOriginAllowed('https://any.com', [])).toBe(false);
  });

  it('通配符 * 允许所有', () => {
    expect(isOriginAllowed('https://anything.com', ['*'])).toBe(true);
  });

  it('拒绝 HTTP 非本地域名（安全考虑）', () => {
    // 不在白名单中
    expect(isOriginAllowed('http://example.com', whitelist)).toBe(false);
  });

  it('大小写敏感', () => {
    expect(isOriginAllowed('HTTPS://astock.example.com', whitelist)).toBe(false);
    expect(isOriginAllowed('https://astock.example.com', whitelist)).toBe(true);
  });

  it('拒绝 null origin', () => {
    expect(isOriginAllowed('null', whitelist)).toBe(false);
  });
});

describe('CORS 加固 - 违规日志', () => {
  it('违规日志存在且可读取', () => {
    const violations = getCorsViolations();
    expect(Array.isArray(violations)).toBe(true);
  });
});

describe('CORS 加固 - 安全场景', () => {
  const prodOrigins = ['https://astock.example.com'];

  it('生产环境仅允许白名单', () => {
    expect(isOriginAllowed('https://astock.example.com', prodOrigins)).toBe(true);
    expect(isOriginAllowed('https://evil.com', prodOrigins)).toBe(false);
    expect(isOriginAllowed('http://localhost:3000', prodOrigins)).toBe(false);
  });

  it('防止子域名接管攻击', () => {
    const origins = ['https://*.example.com'];
    // 合法子域名
    expect(isOriginAllowed('https://app.example.com', origins)).toBe(true);
    // 恶意尝试
    expect(isOriginAllowed('https://example.com.attacker.com', origins)).toBe(false);
    expect(isOriginAllowed('https://examplecom.attacker.com', origins)).toBe(false);
  });

  it('防止端口绕过', () => {
    const origins = ['https://example.com'];
    expect(isOriginAllowed('https://example.com:8443', origins)).toBe(false);
    expect(isOriginAllowed('https://example.com', origins)).toBe(true);
  });
});

describe('CORS 加固 - 预检请求行为', () => {
  // 模拟函数：构建 CORS 响应头
  function buildCorsHeaders(origin: string | undefined, allowedOrigins: string[]) {
    const allowed = isOriginAllowed(origin, allowedOrigins);
    return {
      allowed,
      origin: origin || '',
      headers: allowed ? {
        'Access-Control-Allow-Origin': origin!,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token, X-Request-ID',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
      } : {},
    };
  }

  const origins = ['https://app.example.com'];

  it('合法预检返回完整头', () => {
    const result = buildCorsHeaders('https://app.example.com', origins);
    expect(result.allowed).toBe(true);
    expect(result.headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
    expect(result.headers['Vary']).toBe('Origin');
  });

  it('非法预检返回空头', () => {
    const result = buildCorsHeaders('https://evil.com', origins);
    expect(result.allowed).toBe(false);
    expect(result.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
});
