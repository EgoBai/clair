/**
 * 安全增强中间件 + 输入验证 + 限流 补充测试
 * 目标: 20+ 测试用例
 */

import { describe, it, expect } from 'vitest';

// ==================== 输入安全扫描 ====================

describe('输入安全扫描', () => {
  // SQL注入检测模式
  const SQL_PATTERNS = [
    /('|--|;|\/\*|\*\/)/i,
    /(union\s+select|drop\s+table|insert\s+into|delete\s+from|update\s+.+set)/i,
    /(exec\s*\(|execute\s+|xp_|sp_)/i,
    /(\bor\b|\band\b)\s+\d+\s*=\s*\d+/i,
  ];

  // XSS检测模式
  const XSS_PATTERNS = [
    /<script[\s>]/i,
    /javascript\s*:/i,
    /on\w+\s*=/i,
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /eval\s*\(/i,
  ];

  // 路径遍历模式
  const PATH_TRAVERSAL_PATTERNS = [
    /\.\.[/\\]/,
    /%2e%2e/i,
    /%252e/i,
  ];

  function detectSQLInjection(input: string): boolean {
    return SQL_PATTERNS.some(p => p.test(input));
  }

  function detectXSS(input: string): boolean {
    return XSS_PATTERNS.some(p => p.test(input));
  }

  function detectPathTraversal(input: string): boolean {
    return PATH_TRAVERSAL_PATTERNS.some(p => p.test(input));
  }

  describe('SQL注入检测', () => {
    it('应检测单引号注入', () => {
      expect(detectSQLInjection("admin'--")).toBe(true);
    });

    it('应检测UNION SELECT', () => {
      expect(detectSQLInjection('UNION SELECT * FROM users')).toBe(true);
    });

    it('应检测DROP TABLE', () => {
      expect(detectSQLInjection('DROP TABLE users')).toBe(true);
    });

    it('应检测INSERT INTO', () => {
      expect(detectSQLInjection('INSERT INTO users VALUES(1,2)')).toBe(true);
    });

    it('应检测注释注入', () => {
      expect(detectSQLInjection('1; DROP TABLE users --')).toBe(true);
    });

    it('应检测OR 1=1注入', () => {
      expect(detectSQLInjection("' OR 1=1")).toBe(true);
    });

    it('正常输入不应触发', () => {
      expect(detectSQLInjection('贵州茅台')).toBe(false);
      expect(detectSQLInjection('600519')).toBe(false);
      expect(detectSQLInjection('白酒行业')).toBe(false);
    });

    it('正常英文不应触发', () => {
      expect(detectSQLInjection('Apple Inc')).toBe(false);
      expect(detectSQLInjection('buy and sell')).toBe(false);
    });
  });

  describe('XSS检测', () => {
    it('应检测script标签', () => {
      expect(detectXSS('<script>alert(1)</script>')).toBe(true);
    });

    it('应检测javascript协议', () => {
      expect(detectXSS('javascript:alert(1)')).toBe(true);
    });

    it('应检测事件处理器', () => {
      expect(detectXSS('<img onerror=alert(1)>')).toBe(true);
    });

    it('应检测iframe标签', () => {
      expect(detectXSS('<iframe src="evil.com">')).toBe(true);
    });

    it('应检测eval调用', () => {
      expect(detectXSS('eval(document.cookie)')).toBe(true);
    });

    it('正常内容不应触发', () => {
      expect(detectXSS('这是一条正常的评论')).toBe(false);
      expect(detectXSS('The stock price is < 100')).toBe(false);
    });
  });

  describe('路径遍历检测', () => {
    it('应检测../遍历', () => {
      expect(detectPathTraversal('../../etc/passwd')).toBe(true);
    });

    it('应检测反斜杠遍历', () => {
      expect(detectPathTraversal('..\\windows\\system32')).toBe(true);
    });

    it('应检测URL编码遍历', () => {
      expect(detectPathTraversal('%2e%2e/')).toBe(true);
    });

    it('正常路径不应触发', () => {
      expect(detectPathTraversal('/api/stocks/600519')).toBe(false);
      expect(detectPathTraversal('/api/search?q=茅台')).toBe(false);
    });
  });
});

// ==================== 限流算法测试 ====================

describe('限流算法', () => {
  // 滑动窗口限流器实现
  class SlidingWindowRateLimiter {
    private requests: Map<string, number[]> = new Map();
    constructor(private windowMs: number, private maxRequests: number) {}

    isAllowed(key: string): { allowed: boolean; remaining: number; resetAt: number } {
      const now = Date.now();
      const windowStart = now - this.windowMs;
      const timestamps = (this.requests.get(key) || []).filter(t => t > windowStart);
      timestamps.push(now);
      this.requests.set(key, timestamps);

      return {
        allowed: timestamps.length <= this.maxRequests,
        remaining: Math.max(0, this.maxRequests - timestamps.length),
        resetAt: now + this.windowMs,
      };
    }

    getRequestCount(key: string): number {
      const now = Date.now();
      const windowStart = now - this.windowMs;
      return (this.requests.get(key) || []).filter(t => t > windowStart).length;
    }

    reset(key?: string): void {
      if (key) this.requests.delete(key);
      else this.requests.clear();
    }
  }

  it('应允许窗口内的请求', () => {
    const limiter = new SlidingWindowRateLimiter(60000, 5);
    const result = limiter.isAllowed('user1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('应限制超出窗口的请求', () => {
    const limiter = new SlidingWindowRateLimiter(60000, 3);
    limiter.isAllowed('user1');
    limiter.isAllowed('user1');
    limiter.isAllowed('user1');
    const result = limiter.isAllowed('user1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('不同key应独立计数', () => {
    const limiter = new SlidingWindowRateLimiter(60000, 2);
    limiter.isAllowed('user1');
    limiter.isAllowed('user1');
    const u1 = limiter.isAllowed('user1');
    const u2 = limiter.isAllowed('user2');
    expect(u1.allowed).toBe(false);
    expect(u2.allowed).toBe(true);
  });

  it('重置后应重新计数', () => {
    const limiter = new SlidingWindowRateLimiter(60000, 1);
    limiter.isAllowed('user1');
    expect(limiter.isAllowed('user1').allowed).toBe(false);
    limiter.reset('user1');
    expect(limiter.isAllowed('user1').allowed).toBe(true);
  });

  it('getRequestCount应返回当前窗口请求数', () => {
    const limiter = new SlidingWindowRateLimiter(60000, 10);
    limiter.isAllowed('u1');
    limiter.isAllowed('u1');
    limiter.isAllowed('u1');
    expect(limiter.getRequestCount('u1')).toBe(3);
    expect(limiter.getRequestCount('u2')).toBe(0);
  });

  it('resetAt应为未来时间', () => {
    const limiter = new SlidingWindowRateLimiter(60000, 5);
    const result = limiter.isAllowed('u1');
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });
});

// ==================== 路径归一化测试 ====================

describe('API路径归一化', () => {
  function normalizePath(path: string): string {
    return path
      .replace(/\/api\/stocks\/[^/]+/, '/api/stocks/:symbol')
      .replace(/\/api\/news\/[^/]+/, '/api/news/:id')
      .replace(/\/api\/backtest\/[^/]+/, '/api/backtest/:id')
      .replace(/\/api\/portfolio\/[^/]+/, '/api/portfolio/:id')
      .replace(/\?.*$/, '');
  }

  it('应归一化股票代码路径', () => {
    expect(normalizePath('/api/stocks/600519')).toBe('/api/stocks/:symbol');
  });

  it('应归一化新闻ID路径', () => {
    expect(normalizePath('/api/news/12345')).toBe('/api/news/:id');
  });

  it('应去除查询参数', () => {
    expect(normalizePath('/api/stocks/600519?page=1&size=20')).toBe('/api/stocks/:symbol');
  });

  it('无参数路径应保持不变', () => {
    expect(normalizePath('/api/stocks')).toBe('/api/stocks');
  });
});
