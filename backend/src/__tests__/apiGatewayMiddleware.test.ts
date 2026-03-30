import { describe, it, expect } from 'vitest';

// API网关与中间件测试
describe('API Gateway & Middleware', () => {
  // 请求验证
  describe('Request Validation', () => {
    const validateStockCode = (code: string): boolean => {
      return /^(sh|sz|bj)\d{6}$/i.test(code) || /^\d{6}$/.test(code);
    };

    const validatePagination = (page?: number, pageSize?: number) => {
      return {
        page: Math.max(1, Math.min(page ?? 1, 10000)),
        pageSize: Math.max(1, Math.min(pageSize ?? 20, 100)),
      };
    };

    const validateDateRange = (start?: string, end?: string): string[] => {
      const errors: string[] = [];
      if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) errors.push('invalid start date');
      if (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) errors.push('invalid end date');
      if (start && end && start > end) errors.push('start > end');
      return errors;
    };

    it('valid 6-digit stock code', () => {
      expect(validateStockCode('600519')).toBe(true);
      expect(validateStockCode('000858')).toBe(true);
      expect(validateStockCode('300750')).toBe(true);
    });

    it('valid prefixed stock code', () => {
      expect(validateStockCode('sh600519')).toBe(true);
      expect(validateStockCode('SZ000858')).toBe(true);
    });

    it('invalid stock code', () => {
      expect(validateStockCode('12345')).toBe(false);
      expect(validateStockCode('abc123456')).toBe(false);
      expect(validateStockCode('')).toBe(false);
    });

    it('pagination defaults', () => {
      const p = validatePagination();
      expect(p.page).toBe(1);
      expect(p.pageSize).toBe(20);
    });

    it('pagination bounds', () => {
      const p = validatePagination(-1, 999);
      expect(p.page).toBe(1);
      expect(p.pageSize).toBe(100);
    });

    it('valid date range', () => {
      expect(validateDateRange('2024-01-01', '2024-12-31')).toEqual([]);
    });

    it('invalid date format', () => {
      expect(validateDateRange('01-01-2024')).toContain('invalid start date');
    });

    it('start after end', () => {
      expect(validateDateRange('2024-12-31', '2024-01-01')).toContain('start > end');
    });

    it('optional dates should pass when omitted', () => {
      expect(validateDateRange()).toEqual([]);
    });
  });

  // 响应格式化
  describe('Response Formatting', () => {
    const formatSuccess = <T>(data: T, meta?: Record<string, any>) => ({
      success: true,
      data,
      meta: { timestamp: Date.now(), ...meta },
    });

    const formatError = (code: string, message: string, details?: any) => ({
      success: false,
      error: { code, message, details },
    });

    const formatPaginated = <T>(items: T[], total: number, page: number, pageSize: number) => ({
      success: true,
      data: items,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasNext: page * pageSize < total,
        hasPrev: page > 1,
      },
    });

    it('success response should have correct structure', () => {
      const res = formatSuccess({ stocks: [] });
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect(res.meta.timestamp).toBeDefined();
    });

    it('error response should have correct structure', () => {
      const res = formatError('NOT_FOUND', 'Stock not found');
      expect(res.success).toBe(false);
      expect(res.error.code).toBe('NOT_FOUND');
    });

    it('paginated response should calculate totalPages', () => {
      const res = formatPaginated([1, 2, 3], 25, 1, 10);
      expect(res.pagination.totalPages).toBe(3);
      expect(res.pagination.hasNext).toBe(true);
      expect(res.pagination.hasPrev).toBe(false);
    });

    it('last page should have no next', () => {
      const res = formatPaginated([1], 21, 3, 10);
      expect(res.pagination.hasNext).toBe(false);
      expect(res.pagination.hasPrev).toBe(true);
    });

    it('empty paginated response', () => {
      const res = formatPaginated([], 0, 1, 10);
      expect(res.pagination.total).toBe(0);
      expect(res.pagination.totalPages).toBe(0);
    });
  });

  // 缓存键构建
  describe('Cache Key Building', () => {
    const buildCacheKey = (prefix: string, params: Record<string, any>): string => {
      const sorted = Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join('&');
      return `${prefix}:${sorted}`;
    };

    const matchPattern = (key: string, pattern: string): boolean => {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      return regex.test(key);
    };

    it('should build deterministic keys', () => {
      const k1 = buildCacheKey('stock', { b: 2, a: 1 });
      const k2 = buildCacheKey('stock', { a: 1, b: 2 });
      expect(k1).toBe(k2);
    });

    it('should exclude undefined values', () => {
      const key = buildCacheKey('stock', { a: 1, b: undefined, c: 3 });
      expect(key).not.toContain('b');
    });

    it('should match wildcard patterns', () => {
      expect(matchPattern('stock:600519', 'stock:*')).toBe(true);
      expect(matchPattern('stock:600519', 'etf:*')).toBe(false);
    });

    it('should match single char wildcard', () => {
      expect(matchPattern('600519', '60051?')).toBe(true);
      expect(matchPattern('60051X', '60051?')).toBe(true);
      expect(matchPattern('60051', '60051?')).toBe(false);
      expect(matchPattern('6005199', '60051?')).toBe(false);
    });

    it('exact match', () => {
      expect(matchPattern('stock:a=1', 'stock:a=1')).toBe(true);
    });
  });

  // API版本管理
  describe('API Versioning', () => {
    const parseVersion = (v: string) => {
      const parts = v.replace(/^v/, '').split('.').map(Number);
      return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
    };

    const compareVersions = (a: string, b: string): number => {
      const va = parseVersion(a);
      const vb = parseVersion(b);
      if (va.major !== vb.major) return va.major - vb.major;
      if (va.minor !== vb.minor) return va.minor - vb.minor;
      return va.patch - vb.patch;
    };

    const isDeprecated = (current: string, deprecated: string): boolean => {
      return compareVersions(current, deprecated) >= 0;
    };

    it('should parse version string', () => {
      expect(parseVersion('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
      expect(parseVersion('2.0')).toEqual({ major: 2, minor: 0, patch: 0 });
    });

    it('should compare versions correctly', () => {
      expect(compareVersions('v1.0.0', 'v2.0.0')).toBeLessThan(0);
      expect(compareVersions('v2.0.0', 'v1.0.0')).toBeGreaterThan(0);
      expect(compareVersions('v1.0.0', 'v1.0.0')).toBe(0);
    });

    it('should detect deprecated versions', () => {
      expect(isDeprecated('v2.0.0', 'v1.0.0')).toBe(true);
      expect(isDeprecated('v1.0.0', 'v2.0.0')).toBe(false);
    });

    it('patch version comparison', () => {
      expect(compareVersions('v1.0.1', 'v1.0.0')).toBeGreaterThan(0);
    });

    it('minor version comparison', () => {
      expect(compareVersions('v1.1.0', 'v1.0.5')).toBeGreaterThan(0);
    });
  });

  // 错误分类
  describe('Error Classification', () => {
    const classifyHttpError = (status: number): { type: string; retryable: boolean } => {
      if (status >= 400 && status < 500) {
        if (status === 429) return { type: 'rate_limit', retryable: true };
        if (status === 408) return { type: 'timeout', retryable: true };
        return { type: 'client_error', retryable: false };
      }
      if (status >= 500) return { type: 'server_error', retryable: true };
      return { type: 'success', retryable: false };
    };

    const getRetryDelay = (attempt: number, baseMs: number = 1000): number => {
      return Math.min(baseMs * Math.pow(2, attempt), 30000);
    };

    it('429 should be retryable', () => {
      expect(classifyHttpError(429).retryable).toBe(true);
    });

    it('400 should not be retryable', () => {
      expect(classifyHttpError(400).retryable).toBe(false);
    });

    it('500 should be retryable', () => {
      expect(classifyHttpError(500).retryable).toBe(true);
    });

    it('502 should be retryable', () => {
      expect(classifyHttpError(502).retryable).toBe(true);
    });

    it('404 should not be retryable', () => {
      expect(classifyHttpError(404).retryable).toBe(false);
    });

    it('200 should be success', () => {
      expect(classifyHttpError(200).type).toBe('success');
    });

    it('exponential backoff should increase', () => {
      expect(getRetryDelay(0)).toBe(1000);
      expect(getRetryDelay(1)).toBe(2000);
      expect(getRetryDelay(2)).toBe(4000);
    });

    it('max delay should be capped', () => {
      expect(getRetryDelay(20)).toBe(30000);
    });
  });

  // CORS配置
  describe('CORS Configuration', () => {
    const isOriginAllowed = (origin: string, allowed: string[]): boolean => {
      if (allowed.includes('*')) return true;
      return allowed.some(a => {
        if (a.startsWith('*.')) {
          const domain = a.slice(2);
          return origin.endsWith(domain);
        }
        return origin === a;
      });
    };

    const buildCorsHeaders = (origin: string, allowed: string[]) => {
      if (!isOriginAllowed(origin, allowed)) return {};
      return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      };
    };

    it('exact origin match', () => {
      expect(isOriginAllowed('https://example.com', ['https://example.com'])).toBe(true);
    });

    it('wildcard allows all', () => {
      expect(isOriginAllowed('https://any.com', ['*'])).toBe(true);
    });

    it('subdomain wildcard', () => {
      expect(isOriginAllowed('https://api.example.com', ['*.example.com'])).toBe(true);
      expect(isOriginAllowed('https://other.com', ['*.example.com'])).toBe(false);
    });

    it('non-matching origin should return empty headers', () => {
      const headers = buildCorsHeaders('https://evil.com', ['https://good.com']);
      expect(Object.keys(headers).length).toBe(0);
    });

    it('matching origin should return CORS headers', () => {
      const headers = buildCorsHeaders('https://good.com', ['https://good.com']);
      expect(headers['Access-Control-Allow-Origin']).toBe('https://good.com');
    });
  });

  // 限速
  describe('Rate Limiting', () => {
    class RateLimiter {
      private counts: Map<string, { count: number; resetAt: number }> = new Map();
      constructor(private maxRequests: number, private windowMs: number) {}

      tryAcquire(key: string): { allowed: boolean; remaining: number; resetAt: number } {
        const now = Date.now();
        const entry = this.counts.get(key);
        if (!entry || now > entry.resetAt) {
          this.counts.set(key, { count: 1, resetAt: now + this.windowMs });
          return { allowed: true, remaining: this.maxRequests - 1, resetAt: now + this.windowMs };
        }
        if (entry.count >= this.maxRequests) {
          return { allowed: false, remaining: 0, resetAt: entry.resetAt };
        }
        entry.count++;
        return { allowed: true, remaining: this.maxRequests - entry.count, resetAt: entry.resetAt };
      }
    }

    it('should allow first request', () => {
      const limiter = new RateLimiter(10, 60000);
      const result = limiter.tryAcquire('user1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it('should block after max requests', () => {
      const limiter = new RateLimiter(2, 60000);
      limiter.tryAcquire('user1');
      limiter.tryAcquire('user1');
      const result = limiter.tryAcquire('user1');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('different keys should be independent', () => {
      const limiter = new RateLimiter(1, 60000);
      expect(limiter.tryAcquire('a').allowed).toBe(true);
      expect(limiter.tryAcquire('b').allowed).toBe(true);
      expect(limiter.tryAcquire('a').allowed).toBe(false);
    });

    it('should reset after window', async () => {
      const limiter = new RateLimiter(1, 50);
      limiter.tryAcquire('user1');
      expect(limiter.tryAcquire('user1').allowed).toBe(false);
      await new Promise(r => setTimeout(r, 60));
      expect(limiter.tryAcquire('user1').allowed).toBe(true);
    });

    it('remaining should decrease', () => {
      const limiter = new RateLimiter(5, 60000);
      expect(limiter.tryAcquire('k').remaining).toBe(4);
      expect(limiter.tryAcquire('k').remaining).toBe(3);
      expect(limiter.tryAcquire('k').remaining).toBe(2);
    });
  });
});

// 消息队列与事件系统
describe('Message Queue & Event System', () => {
  class EventBus {
    private handlers: Map<string, Set<Function>> = new Map();
    private history: Array<{ event: string; data: any; timestamp: number }> = [];

    on(event: string, handler: Function) {
      if (!this.handlers.has(event)) this.handlers.set(event, new Set());
      this.handlers.get(event)!.add(handler);
    }

    off(event: string, handler: Function) {
      this.handlers.get(event)?.delete(handler);
    }

    emit(event: string, data?: any) {
      this.history.push({ event, data, timestamp: Date.now() });
      this.handlers.get(event)?.forEach(h => h(data));
    }

    getHistory(event?: string) {
      return event ? this.history.filter(h => h.event === event) : this.history;
    }

    clear() {
      this.handlers.clear();
      this.history = [];
    }
  }

  it('should register and emit events', () => {
    const bus = new EventBus();
    let received: any = null;
    bus.on('test', (d: any) => { received = d; });
    bus.emit('test', { value: 42 });
    expect(received).toEqual({ value: 42 });
  });

  it('should support multiple listeners', () => {
    const bus = new EventBus();
    let count = 0;
    bus.on('test', () => count++);
    bus.on('test', () => count++);
    bus.emit('test');
    expect(count).toBe(2);
  });

  it('should unregister handlers', () => {
    const bus = new EventBus();
    let count = 0;
    const handler = () => count++;
    bus.on('test', handler);
    bus.emit('test');
    bus.off('test', handler);
    bus.emit('test');
    expect(count).toBe(1);
  });

  it('should maintain event history', () => {
    const bus = new EventBus();
    bus.emit('a', 1);
    bus.emit('b', 2);
    bus.emit('a', 3);
    expect(bus.getHistory().length).toBe(3);
    expect(bus.getHistory('a').length).toBe(2);
  });

  it('should clear all handlers and history', () => {
    const bus = new EventBus();
    let count = 0;
    bus.on('test', () => count++);
    bus.emit('test');
    bus.clear();
    bus.emit('test');
    expect(count).toBe(1);
    expect(bus.getHistory().length).toBe(1);
  });

  it('event with no listeners should not throw', () => {
    const bus = new EventBus();
    expect(() => bus.emit('nonexistent')).not.toThrow();
  });

  it('duplicate handler registration should only fire once', () => {
    const bus = new EventBus();
    let count = 0;
    const handler = () => count++;
    bus.on('test', handler);
    bus.on('test', handler);
    bus.emit('test');
    expect(count).toBe(1);
  });
});
