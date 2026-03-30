import { describe, it, expect } from 'vitest';

// API网关与中间件测试
describe('API网关引擎', () => {
  describe('请求路由', () => {
    type Route = { method: string; path: string; handler: string };

    const matchRoute = (routes: Route[], method: string, path: string): string | null => {
      for (const route of routes) {
        if (route.method !== method) continue;
        const pattern = route.path.replace(/:(\w+)/g, '([^/]+)');
        const regex = new RegExp(`^${pattern}$`);
        if (regex.test(path)) return route.handler;
      }
      return null;
    };

    const routes: Route[] = [
      { method: 'GET', path: '/api/stocks', handler: 'listStocks' },
      { method: 'GET', path: '/api/stocks/:code', handler: 'getStock' },
      { method: 'POST', path: '/api/stocks', handler: 'createStock' },
      { method: 'GET', path: '/api/stocks/:code/history', handler: 'getHistory' },
      { method: 'GET', path: '/api/market/indices', handler: 'listIndices' },
    ];

    it('匹配简单路径', () => {
      expect(matchRoute(routes, 'GET', '/api/stocks')).toBe('listStocks');
    });

    it('匹配参数路径', () => {
      expect(matchRoute(routes, 'GET', '/api/stocks/600000')).toBe('getStock');
    });

    it('区分HTTP方法', () => {
      expect(matchRoute(routes, 'POST', '/api/stocks')).toBe('createStock');
    });

    it('嵌套参数路径', () => {
      expect(matchRoute(routes, 'GET', '/api/stocks/600000/history')).toBe('getHistory');
    });

    it('不匹配返回null', () => {
      expect(matchRoute(routes, 'GET', '/api/unknown')).toBeNull();
    });

    it('方法不匹配返回null', () => {
      expect(matchRoute(routes, 'DELETE', '/api/stocks')).toBeNull();
    });

    it('深层路径匹配', () => {
      expect(matchRoute(routes, 'GET', '/api/market/indices')).toBe('listIndices');
    });
  });

  describe('参数提取', () => {
    const extractParams = (pattern: string, path: string): Record<string, string> | null => {
      const paramNames: string[] = [];
      const regexStr = pattern.replace(/:(\w+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
      });
      const match = new RegExp(`^${regexStr}$`).exec(path);
      if (!match) return null;
      const params: Record<string, string> = {};
      paramNames.forEach((name, i) => { params[name] = match[i + 1]; });
      return params;
    };

    it('提取单参数', () => {
      const params = extractParams('/api/stocks/:code', '/api/stocks/600000');
      expect(params).toEqual({ code: '600000' });
    });

    it('提取多参数', () => {
      const params = extractParams('/api/:market/stocks/:code', '/api/sh/stocks/600000');
      expect(params).toEqual({ market: 'sh', code: '600000' });
    });

    it('不匹配返回null', () => {
      expect(extractParams('/api/:code', '/other/path')).toBeNull();
    });

    it('无参数路径', () => {
      const params = extractParams('/api/stocks', '/api/stocks');
      expect(params).toEqual({});
    });
  });

  describe('请求限速', () => {
    const createRateLimiter = (maxRequests: number, windowMs: number) => {
      const windows = new Map<string, { count: number; resetAt: number }>();

      return {
        check(key: string): { allowed: boolean; remaining: number; resetIn: number } {
          const now = Date.now();
          let window = windows.get(key);
          if (!window || now > window.resetAt) {
            window = { count: 0, resetAt: now + windowMs };
            windows.set(key, window);
          }
          window.count++;
          return {
            allowed: window.count <= maxRequests,
            remaining: Math.max(0, maxRequests - window.count),
            resetIn: window.resetAt - now,
          };
        },
        reset(key: string) { windows.delete(key); },
      };
    };

    it('允许在限制内', () => {
      const limiter = createRateLimiter(5, 60000);
      const result = limiter.check('client1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('超出限制拒绝', () => {
      const limiter = createRateLimiter(2, 60000);
      limiter.check('client1');
      limiter.check('client1');
      const result = limiter.check('client1');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('不同客户端独立计数', () => {
      const limiter = createRateLimiter(1, 60000);
      limiter.check('c1');
      expect(limiter.check('c2').allowed).toBe(true);
    });

    it('重置计数', () => {
      const limiter = createRateLimiter(1, 60000);
      limiter.check('c1');
      limiter.reset('c1');
      expect(limiter.check('c1').allowed).toBe(true);
    });

    it('resetIn为正数', () => {
      const limiter = createRateLimiter(10, 60000);
      const result = limiter.check('c1');
      expect(result.resetIn).toBeGreaterThan(0);
    });
  });

  describe('请求重试', () => {
    const withRetry = async <T>(
      fn: () => Promise<T>,
      maxRetries: number,
      backoffMs: number
    ): Promise<T> => {
      let lastError: Error | null = null;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await fn();
        } catch (e) {
          lastError = e as Error;
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, backoffMs * Math.pow(2, attempt)));
          }
        }
      }
      throw lastError;
    };

    it('首次成功不重试', async () => {
      let calls = 0;
      const result = await withRetry(async () => {
        calls++;
        return 'ok';
      }, 3, 10);
      expect(result).toBe('ok');
      expect(calls).toBe(1);
    });

    it('重试后成功', async () => {
      let calls = 0;
      const result = await withRetry(async () => {
        calls++;
        if (calls < 3) throw new Error('fail');
        return 'recovered';
      }, 3, 10);
      expect(result).toBe('recovered');
      expect(calls).toBe(3);
    });

    it('超重试次数抛异常', async () => {
      await expect(
        withRetry(async () => { throw new Error('always fail'); }, 2, 10)
      ).rejects.toThrow('always fail');
    });

    it('不重试次数为0直接抛', async () => {
      await expect(
        withRetry(async () => { throw new Error('no retry'); }, 0, 10)
      ).rejects.toThrow('no retry');
    });
  });

  describe('请求合并', () => {
    const createRequestCoalescer = <K, V>() => {
      const pending = new Map<K, Promise<V>>();

      return {
        async execute(key: K, fn: () => Promise<V>): Promise<V> {
          if (pending.has(key)) return pending.get(key)!;
          const promise = fn().finally(() => pending.delete(key));
          pending.set(key, promise);
          return promise;
        },
        pendingCount: () => pending.size,
      };
    };

    it('相同key复用promise', async () => {
      const coalescer = createRequestCoalescer<string, number>();
      let calls = 0;
      const fn = async () => { calls++; return 42; };
      const [r1, r2] = await Promise.all([
        coalescer.execute('key', fn),
        coalescer.execute('key', fn),
      ]);
      expect(r1).toBe(42);
      expect(r2).toBe(42);
      expect(calls).toBe(1);
    });

    it('不同key独立执行', async () => {
      const coalescer = createRequestCoalescer<string, number>();
      let calls = 0;
      const fn = async () => ++calls;
      await Promise.all([
        coalescer.execute('a', fn),
        coalescer.execute('b', fn),
      ]);
      expect(calls).toBe(2);
    });
  });

  describe('CORS处理', () => {
    const corsCheck = (
      origin: string,
      allowedOrigins: string[],
      method: string,
      allowedMethods: string[]
    ): { allowed: boolean; headers: Record<string, string> } => {
      const originAllowed = allowedOrigins.includes('*') || allowedOrigins.includes(origin);
      const methodAllowed = allowedMethods.includes(method);
      return {
        allowed: originAllowed && methodAllowed,
        headers: originAllowed ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': allowedMethods.join(', '),
        } : {},
      };
    };

    it('允许匹配的origin和method', () => {
      const result = corsCheck('https://example.com', ['https://example.com'], 'GET', ['GET', 'POST']);
      expect(result.allowed).toBe(true);
    });

    it('拒绝不匹配origin', () => {
      const result = corsCheck('https://evil.com', ['https://example.com'], 'GET', ['GET']);
      expect(result.allowed).toBe(false);
    });

    it('拒绝不匹配method', () => {
      const result = corsCheck('https://example.com', ['https://example.com'], 'DELETE', ['GET']);
      expect(result.allowed).toBe(false);
    });

    it('通配符origin', () => {
      const result = corsCheck('https://any.com', ['*'], 'GET', ['GET']);
      expect(result.allowed).toBe(true);
    });

    it('拒绝时无CORS头', () => {
      const result = corsCheck('https://evil.com', ['https://ok.com'], 'GET', ['GET']);
      expect(result.headers).toEqual({});
    });
  });

  describe('请求日志', () => {
    const createRequestLogger = () => {
      const logs: { method: string; path: string; status: number; duration: number }[] = [];

      return {
        log(method: string, path: string, status: number, duration: number) {
          logs.push({ method, path, status, duration });
        },
        getByStatus(status: number) {
          return logs.filter(l => l.status === status);
        },
        getSlow(thresholdMs: number) {
          return logs.filter(l => l.duration > thresholdMs);
        },
        avgDuration() {
          return logs.length > 0 ? logs.reduce((s, l) => s + l.duration, 0) / logs.length : 0;
        },
        errorRate() {
          if (logs.length === 0) return 0;
          return logs.filter(l => l.status >= 400).length / logs.length;
        },
        all: () => logs,
      };
    };

    it('记录请求', () => {
      const logger = createRequestLogger();
      logger.log('GET', '/api/stocks', 200, 50);
      expect(logger.all()).toHaveLength(1);
    });

    it('按状态码过滤', () => {
      const logger = createRequestLogger();
      logger.log('GET', '/a', 200, 10);
      logger.log('GET', '/b', 404, 5);
      logger.log('GET', '/c', 200, 20);
      expect(logger.getByStatus(200)).toHaveLength(2);
    });

    it('慢请求检测', () => {
      const logger = createRequestLogger();
      logger.log('GET', '/fast', 200, 10);
      logger.log('GET', '/slow', 200, 5000);
      expect(logger.getSlow(1000)).toHaveLength(1);
    });

    it('平均响应时间', () => {
      const logger = createRequestLogger();
      logger.log('GET', '/a', 200, 100);
      logger.log('GET', '/b', 200, 200);
      expect(logger.avgDuration()).toBe(150);
    });

    it('错误率', () => {
      const logger = createRequestLogger();
      logger.log('GET', '/a', 200, 10);
      logger.log('GET', '/b', 500, 10);
      logger.log('GET', '/c', 404, 10);
      expect(logger.errorRate()).toBeCloseTo(2 / 3);
    });

    it('空日志错误率为0', () => {
      const logger = createRequestLogger();
      expect(logger.errorRate()).toBe(0);
    });
  });
});
