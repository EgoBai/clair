import { describe, it, expect } from 'vitest';

// API中间件链测试 - 请求生命周期、错误处理、中间件组合

interface MiddlewareContext {
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body?: any;
  statusCode: number;
  response?: any;
  error?: Error;
  startTime: number;
  metadata: Record<string, any>;
}

type Middleware = (ctx: MiddlewareContext, next: () => Promise<void>) => Promise<void>;

async function executeChain(ctx: MiddlewareContext, middlewares: Middleware[]): Promise<MiddlewareContext> {
  let index = 0;
  async function next(): Promise<void> {
    if (index < middlewares.length) {
      const mw = middlewares[index++];
      await mw(ctx, next);
    }
  }
  await next();
  return ctx;
}

function createLogger(): Middleware {
  return async (ctx, next) => {
    ctx.metadata.requestId = `req-${Date.now()}`;
    ctx.metadata.start = Date.now();
    await next();
    ctx.metadata.duration = Date.now() - ctx.metadata.start;
  };
}

function createCors(allowedOrigins: string[]): Middleware {
  return async (ctx, next) => {
    const origin = ctx.headers['origin'] || '*';
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      ctx.metadata.corsAllowed = true;
      ctx.metadata.allowOrigin = origin;
    } else {
      ctx.metadata.corsAllowed = false;
      ctx.statusCode = 403;
    }
    await next();
  };
}

function createAuth(tokenHeader: string = 'authorization'): Middleware {
  return async (ctx, next) => {
    const token = ctx.headers[tokenHeader];
    if (!token) {
      ctx.statusCode = 401;
      ctx.metadata.authError = 'missing_token';
      return;
    }
    if (token === 'Bearer invalid') {
      ctx.statusCode = 401;
      ctx.metadata.authError = 'invalid_token';
      return;
    }
    ctx.metadata.userId = 'user-123';
    ctx.metadata.authenticated = true;
    await next();
  };
}

function createRateLimiter(maxRequests: number, windowMs: number): Middleware {
  const requests = new Map<string, number[]>();
  return async (ctx, next) => {
    const ip = ctx.headers['x-forwarded-for'] || '127.0.0.1';
    const now = Date.now();
    const window = requests.get(ip) || [];
    const recent = window.filter(t => t > now - windowMs);
    if (recent.length >= maxRequests) {
      ctx.statusCode = 429;
      ctx.metadata.retryAfter = Math.ceil(windowMs / 1000);
      return;
    }
    recent.push(now);
    requests.set(ip, recent);
    ctx.metadata.remaining = maxRequests - recent.length;
    await next();
  };
}

function createBodyParser(maxSize: number): Middleware {
  return async (ctx, next) => {
    if (ctx.body && JSON.stringify(ctx.body).length > maxSize) {
      ctx.statusCode = 413;
      ctx.metadata.error = 'body_too_large';
      return;
    }
    ctx.metadata.bodyParsed = true;
    await next();
  };
}

function createErrorHandler(): Middleware {
  return async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      ctx.statusCode = 500;
      ctx.error = err instanceof Error ? err : new Error(String(err));
      ctx.metadata.errorHandled = true;
    }
  };
}

describe('API中间件链测试', () => {
  const baseCtx = (): MiddlewareContext => ({
    method: 'GET',
    path: '/api/test',
    headers: {},
    query: {},
    statusCode: 200,
    startTime: Date.now(),
    metadata: {},
  });

  describe('中间件执行', () => {
    it('单个中间件执行', async () => {
      const ctx = baseCtx();
      const called: boolean[] = [];
      const mw: Middleware = async (_ctx, next) => { called.push(true); await next(); };
      await executeChain(ctx, [mw]);
      expect(called).toHaveLength(1);
    });

    it('多个中间件按顺序执行', async () => {
      const ctx = baseCtx();
      const order: number[] = [];
      const mw1: Middleware = async (_ctx, next) => { order.push(1); await next(); };
      const mw2: Middleware = async (_ctx, next) => { order.push(2); await next(); };
      const mw3: Middleware = async (_ctx, next) => { order.push(3); await next(); };
      await executeChain(ctx, [mw1, mw2, mw3]);
      expect(order).toEqual([1, 2, 3]);
    });

    it('空中间件链', async () => {
      const ctx = baseCtx();
      await executeChain(ctx, []);
      expect(ctx.statusCode).toBe(200);
    });

    it('中间件可修改上下文', async () => {
      const ctx = baseCtx();
      const mw: Middleware = async (c, next) => {
        c.metadata.modified = true;
        c.statusCode = 201;
        await next();
      };
      await executeChain(ctx, [mw]);
      expect(ctx.metadata.modified).toBe(true);
      expect(ctx.statusCode).toBe(201);
    });
  });

  describe('短路返回', () => {
    it('中间件不调用next可短路', async () => {
      const ctx = baseCtx();
      const called: boolean[] = [];
      const mw1: Middleware = async (c) => { c.statusCode = 401; };
      const mw2: Middleware = async (_c, next) => { called.push(true); await next(); };
      await executeChain(ctx, [mw1, mw2]);
      expect(called).toHaveLength(0);
      expect(ctx.statusCode).toBe(401);
    });

    it('认证失败短路后续中间件', async () => {
      const ctx = baseCtx();
      const handlerCalled: boolean[] = [];
      await executeChain(ctx, [
        createAuth(),
        async () => { handlerCalled.push(true); },
      ]);
      expect(ctx.statusCode).toBe(401);
      expect(handlerCalled).toHaveLength(0);
    });

    it('CORS拒绝短路', async () => {
      const ctx = { ...baseCtx(), headers: { origin: 'http://evil.com' } };
      await executeChain(ctx, [createCors(['http://allowed.com'])]);
      expect(ctx.metadata.corsAllowed).toBe(false);
      expect(ctx.statusCode).toBe(403);
    });

    it('限流短路', async () => {
      const ctx1 = { ...baseCtx(), headers: { 'x-forwarded-for': '10.0.0.1' } };
      const limiter = createRateLimiter(1, 60000);
      await executeChain(ctx1, [limiter]);
      expect(ctx1.statusCode).toBe(200);

      const ctx2 = { ...baseCtx(), headers: { 'x-forwarded-for': '10.0.0.1' } };
      await executeChain(ctx2, [limiter]);
      expect(ctx2.statusCode).toBe(429);
    });
  });

  describe('错误处理', () => {
    it('捕获中间件异常', async () => {
      const ctx = baseCtx();
      const errorMw: Middleware = async () => { throw new Error('boom'); };
      await executeChain(ctx, [createErrorHandler(), errorMw]);
      expect(ctx.statusCode).toBe(500);
      expect(ctx.metadata.errorHandled).toBe(true);
    });

    it('捕获异步异常', async () => {
      const ctx = baseCtx();
      const errorMw: Middleware = async () => {
        await new Promise((_, reject) => setTimeout(() => reject(new Error('async boom')), 1));
      };
      await executeChain(ctx, [createErrorHandler(), errorMw]);
      expect(ctx.statusCode).toBe(500);
    });

    it('正常流程不触发错误处理', async () => {
      const ctx = baseCtx();
      await executeChain(ctx, [createErrorHandler(), async (_ctx, next) => { await next(); }]);
      expect(ctx.statusCode).toBe(200);
      expect(ctx.metadata.errorHandled).toBeUndefined();
    });
  });

  describe('中间件组合', () => {
    it('完整请求生命周期', async () => {
      const ctx = { ...baseCtx(), headers: { origin: 'http://app.com', authorization: 'Bearer valid' } };
      await executeChain(ctx, [
        createErrorHandler(),
        createLogger(),
        createCors(['http://app.com']),
        createAuth(),
        createBodyParser(1024),
        async (c, next) => {
          c.response = { data: 'ok' };
          await next();
        },
      ]);
      expect(ctx.statusCode).toBe(200);
      expect(ctx.response).toEqual({ data: 'ok' });
      expect(ctx.metadata.corsAllowed).toBe(true);
      expect(ctx.metadata.authenticated).toBe(true);
      expect(ctx.metadata.requestId).toBeDefined();
    });

    it('认证+限流+处理器组合', async () => {
      const ctx = { ...baseCtx(), headers: { authorization: 'Bearer valid', 'x-forwarded-for': '10.0.0.2' } };
      await executeChain(ctx, [
        createAuth(),
        createRateLimiter(100, 60000),
        async (c) => { c.response = { users: [] }; },
      ]);
      expect(ctx.statusCode).toBe(200);
      expect(ctx.response).toEqual({ users: [] });
    });

    it('body过大被拒绝', async () => {
      const ctx = { ...baseCtx(), body: { data: 'x'.repeat(2000) } };
      await executeChain(ctx, [createBodyParser(100)]);
      expect(ctx.statusCode).toBe(413);
    });
  });

  describe('上下文传递', () => {
    it('中间件之间共享metadata', async () => {
      const ctx = baseCtx();
      await executeChain(ctx, [
        async (c, next) => { c.metadata.step1 = 'done'; await next(); },
        async (c, next) => { c.metadata.step2 = c.metadata.step1 + '_used'; await next(); },
      ]);
      expect(ctx.metadata.step2).toBe('done_used');
    });

    it('后续中间件可读取前序修改', async () => {
      const ctx = baseCtx();
      await executeChain(ctx, [
        createLogger(),
        async (c, next) => {
          expect(c.metadata.requestId).toBeDefined();
          await next();
        },
      ]);
    });
  });
});
