import { describe, it, expect } from 'vitest';

// ===== API路由与中间件引擎 =====
describe('API Route & Middleware Engine', () => {
  // 路由匹配
  const matchRoute = (pattern: string, path: string): { matched: boolean; params: Record<string, string> } => {
    const patternParts = pattern.split('/').filter(Boolean);
    const pathParts = path.split('/').filter(Boolean);
    if (patternParts.length !== pathParts.length) return { matched: false, params: {} };
    const params: Record<string, string> = {};
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = pathParts[i];
      } else if (patternParts[i] !== pathParts[i]) {
        return { matched: false, params: {} };
      }
    }
    return { matched: true, params };
  };

  // 中间件链
  type Middleware = (ctx: any, next: () => Promise<void>) => Promise<void>;
  const composeMiddleware = (middlewares: Middleware[]): Middleware => {
    return async (ctx, next) => {
      let index = -1;
      const dispatch = async (i: number): Promise<void> => {
        if (i <= index) throw new Error('next() called multiple times');
        index = i;
        const fn = i < middlewares.length ? middlewares[i] : next;
        if (fn) await fn(ctx, () => dispatch(i + 1));
      };
      await dispatch(0);
    };
  };

  // 请求验证器
  const validateRequest = (body: any, schema: Record<string, { type: string; required?: boolean; min?: number; max?: number }>): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    for (const [key, rule] of Object.entries(schema)) {
      const val = body?.[key];
      if (rule.required && (val === undefined || val === null)) {
        errors.push(`${key} is required`);
        continue;
      }
      if (val === undefined || val === null) continue;
      if (rule.type === 'string' && typeof val !== 'string') errors.push(`${key} must be string`);
      if (rule.type === 'number' && typeof val !== 'number') errors.push(`${key} must be number`);
      if (rule.type === 'boolean' && typeof val !== 'boolean') errors.push(`${key} must be boolean`);
      if (rule.type === 'array' && !Array.isArray(val)) errors.push(`${key} must be array`);
      if (typeof val === 'number') {
        if (rule.min !== undefined && val < rule.min) errors.push(`${key} must be >= ${rule.min}`);
        if (rule.max !== undefined && val > rule.max) errors.push(`${key} must be <= ${rule.max}`);
      }
      if (typeof val === 'string') {
        if (rule.min !== undefined && val.length < rule.min) errors.push(`${key} length must be >= ${rule.min}`);
        if (rule.max !== undefined && val.length > rule.max) errors.push(`${key} length must be <= ${rule.max}`);
      }
    }
    return { valid: errors.length === 0, errors };
  };

  // 响应格式化
  const formatResponse = (data: any, message: string = 'success', code: number = 200): any => {
    return { code, message, data, timestamp: Date.now() };
  };

  // 分页解析
  const parsePagination = (query: Record<string, any>, defaults: { page?: number; pageSize?: number; maxPageSize?: number } = {}): { page: number; pageSize: number; offset: number } => {
    const page = Math.max(1, parseInt(query.page) || defaults.page || 1);
    const maxPageSize = defaults.maxPageSize || 100;
    const pageSize = Math.min(maxPageSize, Math.max(1, parseInt(query.pageSize) || defaults.pageSize || 20));
    return { page, pageSize, offset: (page - 1) * pageSize };
  };

  // CORS头生成
  const corsHeaders = (origin: string, allowed: string[]): Record<string, string> => {
    const isAllowed = allowed.includes('*') || allowed.includes(origin);
    return isAllowed ? {
      'Access-Control-Allow-Origin': allowed.includes('*') ? '*' : origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    } : {};
  };

  // 缓存控制头
  const cacheHeaders = (maxAge: number, isPublic: boolean = true): Record<string, string> => {
    return {
      'Cache-Control': `${isPublic ? 'public' : 'private'}, max-age=${maxAge}`,
    };
  };

  // API版本解析
  const parseApiVersion = (acceptHeader: string): string => {
    const match = acceptHeader.match(/application\/vnd\.api\.v(\d+)\+json/);
    return match ? match[1] : '1';
  };

  describe('路由匹配', () => {
    it('精确匹配', () => {
      const result = matchRoute('/api/stocks', '/api/stocks');
      expect(result.matched).toBe(true);
    });

    it('参数匹配', () => {
      const result = matchRoute('/api/stocks/:id', '/api/stocks/123');
      expect(result.matched).toBe(true);
      expect(result.params.id).toBe('123');
    });

    it('多参数', () => {
      const result = matchRoute('/api/:type/:id', '/api/stocks/456');
      expect(result.matched).toBe(true);
      expect(result.params.type).toBe('stocks');
      expect(result.params.id).toBe('456');
    });

    it('不匹配', () => {
      expect(matchRoute('/api/stocks', '/api/funds').matched).toBe(false);
    });

    it('长度不匹配', () => {
      expect(matchRoute('/api/stocks', '/api/stocks/extra').matched).toBe(false);
    });

    it('根路径', () => {
      expect(matchRoute('/', '/').matched).toBe(true);
    });

    it('带尾部斜杠', () => {
      expect(matchRoute('/api/stocks/', '/api/stocks').matched).toBe(true);
    });
  });

  describe('中间件链', () => {
    it('按顺序执行', async () => {
      const order: number[] = [];
      const mw1: Middleware = async (ctx, next) => { order.push(1); await next(); };
      const mw2: Middleware = async (ctx, next) => { order.push(2); await next(); };
      const composed = composeMiddleware([mw1, mw2]);
      await composed({}, async () => { order.push(3); });
      expect(order).toEqual([1, 2, 3]);
    });

    it('空链直接调用next', async () => {
      let called = false;
      const composed = composeMiddleware([]);
      await composed({}, async () => { called = true; });
      expect(called).toBe(true);
    });

    it('中间件可以修改ctx', async () => {
      const ctx: any = {};
      const mw: Middleware = async (c, next) => { c.value = 42; await next(); };
      await composeMiddleware([mw])(ctx, async () => {});
      expect(ctx.value).toBe(42);
    });

    it('不调用next则后续不执行', async () => {
      const order: number[] = [];
      const mw1: Middleware = async (ctx, next) => { order.push(1); };
      const mw2: Middleware = async (ctx, next) => { order.push(2); await next(); };
      await composeMiddleware([mw1, mw2])({}, async () => { order.push(3); });
      expect(order).toEqual([1]);
    });
  });

  describe('请求验证', () => {
    it('有效请求', () => {
      const result = validateRequest({ name: 'test', age: 25 }, {
        name: { type: 'string', required: true },
        age: { type: 'number', min: 0, max: 150 },
      });
      expect(result.valid).toBe(true);
    });

    it('缺失必填字段', () => {
      const result = validateRequest({}, { name: { type: 'string', required: true } });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('name is required');
    });

    it('类型错误', () => {
      const result = validateRequest({ age: '25' }, { age: { type: 'number' } });
      expect(result.valid).toBe(false);
    });

    it('超出范围', () => {
      const result = validateRequest({ age: 200 }, { age: { type: 'number', max: 150 } });
      expect(result.valid).toBe(false);
    });

    it('可选字段缺失不报错', () => {
      const result = validateRequest({}, { nickname: { type: 'string' } });
      expect(result.valid).toBe(true);
    });

    it('null值视为缺失', () => {
      const result = validateRequest({ name: null }, { name: { type: 'string', required: true } });
      expect(result.valid).toBe(false);
    });

    it('数组类型', () => {
      const result = validateRequest({ tags: ['a', 'b'] }, { tags: { type: 'array' } });
      expect(result.valid).toBe(true);
    });

    it('非数组类型报错', () => {
      const result = validateRequest({ tags: 'a,b' }, { tags: { type: 'array' } });
      expect(result.valid).toBe(false);
    });

    it('字符串长度范围', () => {
      const result = validateRequest({ code: 'AB' }, { code: { type: 'string', min: 6, max: 6 } });
      expect(result.valid).toBe(false);
    });

    it('布尔类型', () => {
      const result = validateRequest({ active: true }, { active: { type: 'boolean' } });
      expect(result.valid).toBe(true);
    });
  });

  describe('响应格式化', () => {
    it('成功响应', () => {
      const resp = formatResponse({ id: 1 });
      expect(resp.code).toBe(200);
      expect(resp.message).toBe('success');
      expect(resp.data).toEqual({ id: 1 });
    });

    it('自定义消息', () => {
      const resp = formatResponse(null, 'created', 201);
      expect(resp.code).toBe(201);
    });

    it('包含时间戳', () => {
      const resp = formatResponse({});
      expect(resp.timestamp).toBeGreaterThan(0);
    });
  });

  describe('分页解析', () => {
    it('默认值', () => {
      const p = parsePagination({});
      expect(p.page).toBe(1);
      expect(p.pageSize).toBe(20);
    });

    it('自定义页码', () => {
      const p = parsePagination({ page: '3', pageSize: '10' });
      expect(p.page).toBe(3);
      expect(p.pageSize).toBe(10);
      expect(p.offset).toBe(20);
    });

    it('页码最小为1', () => {
      const p = parsePagination({ page: '-5' });
      expect(p.page).toBe(1);
    });

    it('pageSize上限', () => {
      const p = parsePagination({ pageSize: '999' }, { maxPageSize: 50 });
      expect(p.pageSize).toBe(50);
    });

    it('pageSize最小为1', () => {
      const p = parsePagination({ pageSize: '0' });
      expect(p.pageSize).toBe(20); // parseInt('0') is falsy, falls through to default
    });
  });

  describe('CORS头', () => {
    it('允许的源', () => {
      const headers = corsHeaders('https://example.com', ['https://example.com']);
      expect(headers['Access-Control-Allow-Origin']).toBe('https://example.com');
    });

    it('通配符允许所有', () => {
      const headers = corsHeaders('https://evil.com', ['*']);
      expect(headers['Access-Control-Allow-Origin']).toBe('*');
    });

    it('不允许的源返回空', () => {
      const headers = corsHeaders('https://evil.com', ['https://example.com']);
      expect(Object.keys(headers).length).toBe(0);
    });
  });

  describe('缓存控制头', () => {
    it('公共缓存', () => {
      const headers = cacheHeaders(3600);
      expect(headers['Cache-Control']).toBe('public, max-age=3600');
    });

    it('私有缓存', () => {
      const headers = cacheHeaders(60, false);
      expect(headers['Cache-Control']).toBe('private, max-age=60');
    });
  });

  describe('API版本解析', () => {
    it('版本号', () => {
      expect(parseApiVersion('application/vnd.api.v2+json')).toBe('2');
    });

    it('默认v1', () => {
      expect(parseApiVersion('application/json')).toBe('1');
    });

    it('空字符串', () => {
      expect(parseApiVersion('')).toBe('1');
    });
  });
});
