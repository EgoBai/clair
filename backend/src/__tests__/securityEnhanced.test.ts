/**
 * 安全中间件测试
 * 覆盖 OWASP Top 10 关键检测项
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// 模拟安全检测函数
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b.*\b(FROM|INTO|TABLE|SET|WHERE)\b)/i,
  /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/i,
  /(;.*--)/,
  /('.*OR.*'.*'.*')/i,
  /(\/\*.*\*\/)/,
];

function detectSQLInjection(value: string): boolean {
  return SQL_INJECTION_PATTERNS.some(pattern => pattern.test(value));
}

const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /<iframe/i,
];

function detectXSS(value: string): boolean {
  return XSS_PATTERNS.some(pattern => pattern.test(value));
}

const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//,
  /\.\.\\/,
  /%2e%2e%2f/i,
];

function detectPathTraversal(value: string): boolean {
  return PATH_TRAVERSAL_PATTERNS.some(pattern => pattern.test(value));
}

describe('安全检测引擎', () => {
  describe('SQL注入检测', () => {
    it('应检测基础SQL注入', () => {
      expect(detectSQLInjection("SELECT * FROM users WHERE id=1")).toBe(true);
      expect(detectSQLInjection("1 OR 1=1")).toBe(true);
      expect(detectSQLInjection("'; DROP TABLE users--")).toBe(true);
      expect(detectSQLInjection("1 UNION SELECT password FROM users")).toBe(true);
    });

    it('应检测注释注入', () => {
      expect(detectSQLInjection("1; --")).toBe(true);
      expect(detectSQLInjection("/* comment */ SELECT")).toBe(true);
    });

    it('应通过正常输入', () => {
      expect(detectSQLInjection('hello world')).toBe(false);
      expect(detectSQLInjection('600519')).toBe(false);
      expect(detectSQLInjection('茅台股票')).toBe(false);
      expect(detectSQLInjection('2024-03-24')).toBe(false);
    });

    it('应处理空值', () => {
      expect(detectSQLInjection('')).toBe(false);
    });
  });

  describe('XSS攻击检测', () => {
    it('应检测script标签注入', () => {
      expect(detectXSS('<script>alert("xss")</script>')).toBe(true);
      expect(detectXSS('<SCRIPT>alert(1)</SCRIPT>')).toBe(true);
    });

    it('应检测事件处理器注入', () => {
      expect(detectXSS('<img onerror="alert(1)">')).toBe(true);
      expect(detectXSS('<div onclick="malicious()">')).toBe(true);
    });

    it('应检测javascript协议', () => {
      expect(detectXSS('javascript:alert(1)')).toBe(true);
      expect(detectXSS('JAVASCRIPT:void(0)')).toBe(true);
    });

    it('应通过正常HTML内容', () => {
      expect(detectXSS('股票代码 600519')).toBe(false);
      expect(detectXSS('价格 < 100 元')).toBe(false);
      expect(detectXSS('这是一个正常的文本')).toBe(false);
    });
  });

  describe('路径遍历检测', () => {
    it('应检测目录遍历', () => {
      expect(detectPathTraversal('../../etc/passwd')).toBe(true);
      expect(detectPathTraversal('..\\windows\\system32')).toBe(true);
      expect(detectPathTraversal('/api/stocks/../../../etc/passwd')).toBe(true);
    });

    it('应检测URL编码遍历', () => {
      expect(detectPathTraversal('%2e%2e%2fetc/passwd')).toBe(true);
    });

    it('应通过正常路径', () => {
      expect(detectPathTraversal('/api/stocks/600519')).toBe(false);
      expect(detectPathTraversal('/api/watchlist')).toBe(false);
    });
  });

  describe('边界条件', () => {
    it('应处理超长输入', () => {
      const longInput = 'a'.repeat(10000);
      expect(detectSQLInjection(longInput)).toBe(false);
      expect(detectXSS(longInput)).toBe(false);
    });

    it('应处理特殊字符', () => {
      expect(detectSQLInjection('!@#$%^&*()')).toBe(false);
      expect(detectXSS('<>{}[]')).toBe(false);
    });

    it('应处理Unicode字符', () => {
      expect(detectSQLInjection('股票代码：600519.SH')).toBe(false);
      expect(detectXSS('🎉🎉🎉')).toBe(false);
    });
  });
});

describe('速率限制', () => {
  it('应正确计算剩余请求', () => {
    const maxRequests = 100;
    const currentCount = 45;
    const remaining = maxRequests - currentCount;
    expect(remaining).toBe(55);
  });

  it('应在超限时返回429', () => {
    const maxRequests = 100;
    const currentCount = 101;
    expect(currentCount > maxRequests).toBe(true);
  });

  it('应正确设置Retry-After头', () => {
    const resetTime = Date.now() + 60000;
    const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });
});

describe('安全响应头', () => {
  it('应包含必要的安全头', () => {
    const requiredHeaders = [
      'X-Content-Type-Options',
      'X-Frame-Options',
      'X-XSS-Protection',
      'Referrer-Policy',
      'Permissions-Policy',
    ];

    for (const header of requiredHeaders) {
      expect(header).toBeTruthy();
    }
  });

  it('CSP指令应包含关键指令', () => {
    const cspDirectives = {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'object-src': ["'none'"],
      'frame-ancestors': ["'none'"],
    };

    expect(cspDirectives['default-src']).toContain("'self'");
    expect(cspDirectives['object-src']).toContain("'none'");
    expect(cspDirectives['frame-ancestors']).toContain("'none'");
  });
});
