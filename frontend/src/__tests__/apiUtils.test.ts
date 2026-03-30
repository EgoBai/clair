import { describe, it, expect } from 'vitest';

// API request/response utilities
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  timestamp: number;
  requestId: string;
}

interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

function createSuccessResponse<T>(data: T, requestId?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    message: 'success',
    timestamp: Date.now(),
    requestId: requestId || generateRequestId(),
  };
}

function createErrorResponse(message: string, requestId?: string): ApiResponse<null> {
  return {
    success: false,
    data: null,
    message,
    timestamp: Date.now(),
    requestId: requestId || generateRequestId(),
  };
}

function createPaginatedResponse<T>(data: T[], total: number, page: number, pageSize: number): PaginatedResponse<T> {
  return {
    ...createSuccessResponse(data),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildQueryString(params: Record<string, unknown>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

function parseQueryString(query: string): Record<string, string> {
  if (!query || query === '?') return {};
  const clean = query.startsWith('?') ? query.slice(1) : query;
  const result: Record<string, string> = {};
  for (const pair of clean.split('&')) {
    const [key, value] = pair.split('=');
    if (key) result[decodeURIComponent(key)] = decodeURIComponent(value || '');
  }
  return result;
}

function retryRequest<T>(fn: () => Promise<T>, maxRetries: number, delay: number): Promise<T> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const attempt = async () => {
      try {
        const result = await fn();
        resolve(result);
      } catch (err) {
        attempts++;
        if (attempts >= maxRetries) {
          reject(err);
        } else {
          setTimeout(attempt, delay * Math.pow(2, attempts - 1));
        }
      }
    };
    attempt();
  });
}

function debounceRequest<T extends (...args: unknown[]) => unknown>(fn: T, delay: number): T {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return ((...args: unknown[]) => {
    if (timeout) clearTimeout(timeout);
    return new Promise(resolve => {
      timeout = setTimeout(() => {
        resolve(fn(...args));
      }, delay);
    });
  }) as T;
}

function cacheRequest<T>(key: string, fetcher: () => Promise<T>, cache: Map<string, { data: T; expiry: number }>, ttl: number): Promise<T> {
  const cached = cache.get(key);
  if (cached && cached.expiry > Date.now()) {
    return Promise.resolve(cached.data);
  }
  return fetcher().then(data => {
    cache.set(key, { data, expiry: Date.now() + ttl });
    return data;
  });
}

describe('API工具函数', () => {
  describe('响应构造', () => {
    it('应该创建成功响应', () => {
      const resp = createSuccessResponse({ id: 1 });
      expect(resp.success).toBe(true);
      expect(resp.data).toEqual({ id: 1 });
      expect(resp.message).toBe('success');
      expect(resp.requestId).toBeTruthy();
      expect(resp.timestamp).toBeGreaterThan(0);
    });

    it('应该创建错误响应', () => {
      const resp = createErrorResponse('Not found');
      expect(resp.success).toBe(false);
      expect(resp.data).toBeNull();
      expect(resp.message).toBe('Not found');
    });

    it('应该支持自定义requestId', () => {
      const resp = createSuccessResponse(null, 'custom_id');
      expect(resp.requestId).toBe('custom_id');
    });

    it('应该创建分页响应', () => {
      const resp = createPaginatedResponse([1, 2, 3], 100, 1, 10);
      expect(resp.success).toBe(true);
      expect(resp.data.length).toBe(3);
      expect(resp.pagination.total).toBe(100);
      expect(resp.pagination.totalPages).toBe(10);
      expect(resp.pagination.page).toBe(1);
    });

    it('分页响应应该正确计算总页数', () => {
      const resp = createPaginatedResponse([], 95, 1, 10);
      expect(resp.pagination.totalPages).toBe(10);
    });

    it('requestId应该唯一', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();
      expect(id1).not.toBe(id2);
    });

    it('requestId应该有正确格式', () => {
      const id = generateRequestId();
      expect(id.startsWith('req_')).toBe(true);
    });
  });

  describe('查询字符串', () => {
    it('应该构建查询字符串', () => {
      const qs = buildQueryString({ page: 1, size: 10, q: 'test' });
      expect(qs).toContain('page=1');
      expect(qs).toContain('size=10');
      expect(qs).toContain('q=test');
    });

    it('应该过滤空值', () => {
      const qs = buildQueryString({ a: 1, b: undefined, c: null, d: '' });
      expect(qs).toBe('a=1');
    });

    it('应该编码特殊字符', () => {
      const qs = buildQueryString({ q: 'hello world&test=1' });
      expect(qs).toContain('hello%20world%26test%3D1');
    });

    it('空对象应该返回空字符串', () => {
      expect(buildQueryString({})).toBe('');
    });

    it('应该解析查询字符串', () => {
      const parsed = parseQueryString('?page=1&size=10');
      expect(parsed.page).toBe('1');
      expect(parsed.size).toBe('10');
    });

    it('应该处理无问号前缀', () => {
      const parsed = parseQueryString('a=1&b=2');
      expect(parsed.a).toBe('1');
    });

    it('空查询应该返回空对象', () => {
      expect(parseQueryString('')).toEqual({});
      expect(parseQueryString('?')).toEqual({});
    });

    it('应该解码特殊字符', () => {
      const parsed = parseQueryString('q=hello%20world');
      expect(parsed.q).toBe('hello world');
    });
  });

  describe('缓存请求', () => {
    it('应该缓存结果', async () => {
      const cache = new Map();
      let callCount = 0;
      const fetcher = () => { callCount++; return Promise.resolve('data'); };
      await cacheRequest('key', fetcher, cache, 1000);
      await cacheRequest('key', fetcher, cache, 1000);
      expect(callCount).toBe(1);
    });

    it('过期应该重新获取', async () => {
      const cache = new Map();
      let callCount = 0;
      const fetcher = () => { callCount++; return Promise.resolve('data'); };
      await cacheRequest('key', fetcher, cache, 0);
      await cacheRequest('key', fetcher, cache, 0);
      expect(callCount).toBe(2);
    });

    it('不同key应该独立缓存', async () => {
      const cache = new Map();
      const fetcher1 = () => Promise.resolve('data1');
      const fetcher2 = () => Promise.resolve('data2');
      const r1 = await cacheRequest('key1', fetcher1, cache, 1000);
      const r2 = await cacheRequest('key2', fetcher2, cache, 1000);
      expect(r1).toBe('data1');
      expect(r2).toBe('data2');
    });
  });

  describe('重试机制', () => {
    it('应该在成功时立即返回', async () => {
      const result = await retryRequest(() => Promise.resolve('ok'), 3, 10);
      expect(result).toBe('ok');
    });

    it('应该重试失败的请求', async () => {
      let attempts = 0;
      const fn = () => {
        attempts++;
        if (attempts < 3) return Promise.reject(new Error('fail'));
        return Promise.resolve('success');
      };
      const result = await retryRequest(fn, 3, 10);
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('超过最大重试应该抛出', async () => {
      const fn = () => Promise.reject(new Error('always fail'));
      await expect(retryRequest(fn, 2, 10)).rejects.toThrow('always fail');
    });
  });
});
