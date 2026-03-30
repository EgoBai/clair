import { describe, it, expect } from 'vitest';

describe('API网关与请求处理V2', () => {
  // 请求验证
  const validateRequest = (body: any, schema: { required: string[]; types: Record<string, string> }) => {
    const errors: string[] = [];
    for (const field of schema.required) {
      if (body[field] === undefined || body[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }
    for (const [field, type] of Object.entries(schema.types)) {
      if (body[field] !== undefined && typeof body[field] !== type) {
        errors.push(`Field ${field} expected ${type}, got ${typeof body[field]}`);
      }
    }
    return { valid: errors.length === 0, errors };
  };

  describe('请求验证', () => {
    it('有效请求', () => {
      const result = validateRequest({ name: 'test', age: 25 }, { required: ['name'], types: { name: 'string', age: 'number' } });
      expect(result.valid).toBe(true);
    });
    it('缺少必填字段', () => {
      const result = validateRequest({ age: 25 }, { required: ['name'], types: {} });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('name');
    });
    it('类型不匹配', () => {
      const result = validateRequest({ age: '25' }, { required: [], types: { age: 'number' } });
      expect(result.valid).toBe(false);
    });
    it('空body', () => {
      const result = validateRequest({}, { required: ['id'], types: {} });
      expect(result.valid).toBe(false);
    });
    it('额外字段忽略', () => {
      const result = validateRequest({ name: 'a', extra: true }, { required: ['name'], types: { name: 'string' } });
      expect(result.valid).toBe(true);
    });
  });

  // 分页
  const paginate = <T>(items: T[], page: number, pageSize: number) => {
    const total = items.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const data = items.slice(start, start + pageSize);
    return { data, page, pageSize, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
  };

  describe('分页', () => {
    const items = Array.from({ length: 25 }, (_, i) => i + 1);

    it('第一页', () => {
      const result = paginate(items, 1, 10);
      expect(result.data.length).toBe(10);
      expect(result.data[0]).toBe(1);
    });
    it('最后一页', () => {
      const result = paginate(items, 3, 10);
      expect(result.data.length).toBe(5);
      expect(result.hasNext).toBe(false);
    });
    it('总页数', () => {
      const result = paginate(items, 1, 10);
      expect(result.totalPages).toBe(3);
    });
    it('翻页标记', () => {
      const result = paginate(items, 2, 10);
      expect(result.hasPrev).toBe(true);
      expect(result.hasNext).toBe(true);
    });
    it('空数据', () => {
      const result = paginate([], 1, 10);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });
    it('超出页码', () => {
      const result = paginate(items, 100, 10);
      expect(result.data.length).toBe(0);
    });
  });

  // 排序
  const sortData = <T>(items: T[], key: keyof T, order: 'asc' | 'desc' = 'asc') => {
    return [...items].sort((a, b) => {
      const va = a[key], vb = b[key];
      if (typeof va === 'number' && typeof vb === 'number') return order === 'asc' ? va - vb : vb - va;
      if (typeof va === 'string' && typeof vb === 'string') return order === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return 0;
    });
  };

  describe('排序', () => {
    const data = [
      { name: 'B', score: 80 },
      { name: 'A', score: 95 },
      { name: 'C', score: 60 },
    ];

    it('升序数字', () => {
      const result = sortData(data, 'score', 'asc');
      expect(result[0].score).toBe(60);
    });
    it('降序数字', () => {
      const result = sortData(data, 'score', 'desc');
      expect(result[0].score).toBe(95);
    });
    it('升序字符串', () => {
      const result = sortData(data, 'name', 'asc');
      expect(result[0].name).toBe('A');
    });
    it('不修改原数组', () => {
      sortData(data, 'score', 'asc');
      expect(data[0].name).toBe('B');
    });
  });

  // 筛选
  const filterData = <T>(items: T[], predicates: Partial<Record<keyof T, (v: any) => boolean>>) => {
    return items.filter(item => {
      return Object.entries(predicates).every(([key, pred]) => (pred as any)(item[key]));
    });
  };

  describe('筛选', () => {
    const data = [
      { name: 'A', age: 25, active: true },
      { name: 'B', age: 30, active: false },
      { name: 'C', age: 35, active: true },
    ];

    it('单条件', () => {
      const result = filterData(data, { active: (v: boolean) => v });
      expect(result.length).toBe(2);
    });
    it('多条件', () => {
      const result = filterData(data, {
        active: (v: boolean) => v,
        age: (v: number) => v > 30,
      });
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('C');
    });
    it('无匹配', () => {
      const result = filterData(data, { age: (v: number) => v > 100 });
      expect(result.length).toBe(0);
    });
    it('空条件', () => {
      const result = filterData(data, {});
      expect(result.length).toBe(3);
    });
  });

  // 搜索高亮
  const highlightSearch = (text: string, query: string) => {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  };

  describe('搜索高亮', () => {
    it('基本高亮', () => {
      expect(highlightSearch('Hello World', 'World')).toBe('Hello <mark>World</mark>');
    });
    it('大小写不敏感', () => {
      expect(highlightSearch('Hello World', 'hello')).toBe('<mark>Hello</mark> World');
    });
    it('多处匹配', () => {
      expect(highlightSearch('abc abc abc', 'abc')).toBe('<mark>abc</mark> <mark>abc</mark> <mark>abc</mark>');
    });
    it('空查询', () => {
      expect(highlightSearch('Hello', '')).toBe('Hello');
    });
    it('无匹配', () => {
      expect(highlightSearch('Hello', 'xyz')).toBe('Hello');
    });
  });

  // 响应格式化
  const formatResponse = <T>(data: T, meta?: Record<string, any>) => {
    return {
      success: true,
      data,
      meta: { timestamp: Date.now(), ...meta },
    };
  };
  const formatError = (code: string, message: string, details?: any) => {
    return {
      success: false,
      error: { code, message, details },
      meta: { timestamp: Date.now() },
    };
  };

  describe('响应格式化', () => {
    it('成功响应', () => {
      const result = formatResponse({ id: 1 });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 1 });
    });
    it('带meta', () => {
      const result = formatResponse([], { page: 1, total: 100 });
      expect(result.meta.page).toBe(1);
    });
    it('错误响应', () => {
      const result = formatError('NOT_FOUND', 'Resource not found');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });
    it('带详情的错误', () => {
      const result = formatError('VALIDATION', 'Invalid', { field: 'email' });
      expect(result.error.details.field).toBe('email');
    });
  });

  // 限速键生成
  const rateLimitKey = (ip: string, endpoint: string, userId?: string) => {
    return userId ? `${userId}:${endpoint}` : `${ip}:${endpoint}`;
  };

  describe('限速键', () => {
    it('基于IP', () => {
      expect(rateLimitKey('1.2.3.4', '/api/stock')).toBe('1.2.3.4:/api/stock');
    });
    it('基于用户', () => {
      expect(rateLimitKey('1.2.3.4', '/api/stock', 'user1')).toBe('user1:/api/stock');
    });
    it('不同端点不同键', () => {
      const k1 = rateLimitKey('1.2.3.4', '/api/a');
      const k2 = rateLimitKey('1.2.3.4', '/api/b');
      expect(k1).not.toBe(k2);
    });
  });

  // 内容协商
  const contentNegotiation = (accept: string, available: string[]) => {
    const types = accept.split(',').map(t => t.trim().split(';')[0]);
    for (const type of types) {
      if (available.includes(type)) return type;
      if (type === '*/*') return available[0];
    }
    return available[0] || null;
  };

  describe('内容协商', () => {
    it('精确匹配', () => {
      expect(contentNegotiation('application/json', ['text/html', 'application/json'])).toBe('application/json');
    });
    it('优先级', () => {
      expect(contentNegotiation('text/html, application/json', ['application/json', 'text/html'])).toBe('text/html');
    });
    it('通配符', () => {
      expect(contentNegotiation('*/*', ['text/html'])).toBe('text/html');
    });
    it('无匹配', () => {
      expect(contentNegotiation('text/xml', ['text/html', 'application/json'])).toBe('text/html');
    });
  });
});
