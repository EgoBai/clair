import { describe, it, expect } from 'vitest';

/**
 * API响应格式化逻辑测试
 * API Response formatting/status codes/pagination
 */

type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    totalPages?: number;
    requestId?: string;
    timestamp: number;
  };
}

interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

function successResponse<T>(data: T, meta?: Partial<APIResponse['meta']>): APIResponse<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: Date.now(),
      ...meta,
    },
  };
}

function errorResponse(code: string, message: string, details?: any): APIResponse {
  return {
    success: false,
    error: { code, message, details },
    meta: { timestamp: Date.now() },
  };
}

function paginate<T>(
  items: T[],
  params: PaginationParams
): { data: T[]; meta: APIResponse['meta'] } {
  const { page, pageSize, sortBy, sortOrder } = params;
  let sorted = [...items];

  if (sortBy) {
    sorted.sort((a: any, b: any) => {
      const va = a[sortBy];
      const vb = b[sortBy];
      if (va < vb) return sortOrder === 'desc' ? 1 : -1;
      if (va > vb) return sortOrder === 'desc' ? -1 : 1;
      return 0;
    });
  }

  const total = sorted.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const data = sorted.slice(start, start + pageSize);

  return {
    data,
    meta: {
      page,
      pageSize,
      total,
      totalPages,
      timestamp: Date.now(),
    },
  };
}

function validatePagination(params: Partial<PaginationParams>): PaginationParams {
  const page = Math.max(1, Math.floor(params.page || 1));
  const ps = params.pageSize !== undefined && params.pageSize !== null ? params.pageSize : 20;
  const pageSize = Math.min(100, Math.max(1, Math.floor(ps)));
  return {
    page,
    pageSize,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder === 'desc' ? 'desc' : 'asc',
  };
}

function httpStatusFromCode(code: string): number {
  const map: Record<string, number> = {
    VALIDATION_ERROR: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    RATE_LIMITED: 429,
    INTERNAL_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
  };
  return map[code] ?? 500;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildCacheKey(method: HTTPMethod, path: string, params?: Record<string, any>): string {
  const paramStr = params ? JSON.stringify(params, Object.keys(params).sort()) : '';
  return `${method}:${path}:${paramStr}`;
}

function shouldCacheResponse(method: HTTPMethod, status: number): boolean {
  return method === 'GET' && status >= 200 && status < 300;
}

function calcCacheTTL(statusCode: number): number {
  if (statusCode === 200) return 60; // 1 minute
  if (statusCode === 301 || statusCode === 302) return 3600; // 1 hour
  if (statusCode === 404) return 300; // 5 minutes
  return 0;
}

function mergeQueryParams(
  defaults: Record<string, any>,
  overrides: Record<string, any>
): Record<string, any> {
  const result = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined && value !== null && value !== '') {
      result[key] = value;
    }
  }
  return result;
}

function sanitizeResponseData(data: any, allowedFields?: string[]): any {
  if (!allowedFields || !data || typeof data !== 'object') return data;
  const result: any = {};
  for (const field of allowedFields) {
    if (field in data) result[field] = data[field];
  }
  return result;
}

function formatErrorForClient(error: Error, includeStack = false): APIResponse['error'] {
  return {
    code: 'INTERNAL_ERROR',
    message: includeStack ? error.message : 'An internal error occurred',
    details: includeStack ? { stack: error.stack } : undefined,
  };
}

describe('API响应格式化逻辑', () => {
  describe('successResponse', () => {
    it('should format success response', () => {
      const res = successResponse({ id: 1 });
      expect(res.success).toBe(true);
      expect(res.data).toEqual({ id: 1 });
      expect(res.meta?.timestamp).toBeDefined();
    });

    it('should include meta', () => {
      const res = successResponse([], { page: 1, total: 0 });
      expect(res.meta?.page).toBe(1);
    });
  });

  describe('errorResponse', () => {
    it('should format error response', () => {
      const res = errorResponse('NOT_FOUND', 'Resource not found');
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('NOT_FOUND');
    });

    it('should include details', () => {
      const res = errorResponse('VALIDATION', 'Invalid', { field: 'email' });
      expect(res.error?.details).toEqual({ field: 'email' });
    });
  });

  describe('paginate', () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));

    it('should return first page', () => {
      const { data, meta } = paginate(items, { page: 1, pageSize: 10 });
      expect(data).toHaveLength(10);
      expect(meta?.page).toBe(1);
      expect(meta?.total).toBe(25);
      expect(meta?.totalPages).toBe(3);
    });

    it('should return last page', () => {
      const { data, meta } = paginate(items, { page: 3, pageSize: 10 });
      expect(data).toHaveLength(5);
      expect(meta?.page).toBe(3);
    });

    it('should sort items', () => {
      const { data } = paginate(items, { page: 1, pageSize: 5, sortBy: 'id', sortOrder: 'desc' });
      expect(data[0].id).toBe(25);
    });

    it('should handle empty array', () => {
      const { data, meta } = paginate([], { page: 1, pageSize: 10 });
      expect(data).toHaveLength(0);
      expect(meta?.total).toBe(0);
    });
  });

  describe('validatePagination', () => {
    it('should use defaults', () => {
      const result = validatePagination({});
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.sortOrder).toBe('asc');
    });

    it('should clamp page to >= 1', () => {
      expect(validatePagination({ page: -1 }).page).toBe(1);
      expect(validatePagination({ page: 0 }).page).toBe(1);
    });

    it('should clamp pageSize to 1-100', () => {
      expect(validatePagination({ pageSize: 0 }).pageSize).toBe(1);
      expect(validatePagination({ pageSize: 999 }).pageSize).toBe(100);
    });
  });

  describe('httpStatusFromCode', () => {
    it('should map error codes to status', () => {
      expect(httpStatusFromCode('NOT_FOUND')).toBe(404);
      expect(httpStatusFromCode('UNAUTHORIZED')).toBe(401);
      expect(httpStatusFromCode('RATE_LIMITED')).toBe(429);
    });

    it('should default to 500', () => {
      expect(httpStatusFromCode('UNKNOWN')).toBe(500);
    });
  });

  describe('isRetryableStatus', () => {
    it('should identify retryable statuses', () => {
      expect(isRetryableStatus(429)).toBe(true);
      expect(isRetryableStatus(500)).toBe(true);
      expect(isRetryableStatus(503)).toBe(true);
    });

    it('should not retry client errors', () => {
      expect(isRetryableStatus(400)).toBe(false);
      expect(isRetryableStatus(404)).toBe(false);
    });
  });

  describe('buildCacheKey', () => {
    it('should build key from method and path', () => {
      expect(buildCacheKey('GET', '/api/stocks')).toBe('GET:/api/stocks:');
    });

    it('should include sorted params', () => {
      const key = buildCacheKey('GET', '/api/stocks', { b: 2, a: 1 });
      expect(key).toContain('{"a":1,"b":2}');
    });
  });

  describe('shouldCacheResponse', () => {
    it('should cache GET 2xx', () => {
      expect(shouldCacheResponse('GET', 200)).toBe(true);
    });

    it('should not cache POST', () => {
      expect(shouldCacheResponse('POST', 200)).toBe(false);
    });

    it('should not cache errors', () => {
      expect(shouldCacheResponse('GET', 500)).toBe(false);
    });
  });

  describe('calcCacheTTL', () => {
    it('should return appropriate TTLs', () => {
      expect(calcCacheTTL(200)).toBe(60);
      expect(calcCacheTTL(301)).toBe(3600);
      expect(calcCacheTTL(404)).toBe(300);
      expect(calcCacheTTL(500)).toBe(0);
    });
  });

  describe('mergeQueryParams', () => {
    it('should override defaults', () => {
      const result = mergeQueryDefaults({ page: 1, limit: 20 }, { page: 2 });
      expect(result.page).toBe(2);
      expect(result.limit).toBe(20);
    });

    it('should ignore empty overrides', () => {
      const result = mergeQueryDefaults({ page: 1 }, { page: '', limit: null });
      expect(result.page).toBe(1);
    });
  });

  describe('sanitizeResponseData', () => {
    it('should filter to allowed fields', () => {
      const data = { id: 1, name: 'test', password: 'secret' };
      const result = sanitizeResponseData(data, ['id', 'name']);
      expect(result).toEqual({ id: 1, name: 'test' });
      expect(result.password).toBeUndefined();
    });

    it('should return data unchanged without allowlist', () => {
      const data = { id: 1 };
      expect(sanitizeResponseData(data)).toEqual({ id: 1 });
    });
  });

  describe('formatErrorForClient', () => {
    it('should hide details in production', () => {
      const res = formatErrorForClient(new Error('secret'), false);
      expect(res?.message).toBe('An internal error occurred');
    });

    it('should show details in development', () => {
      const res = formatErrorForClient(new Error('debug info'), true);
      expect(res?.message).toBe('debug info');
      expect(res?.details?.stack).toBeDefined();
    });
  });
});

function mergeQueryDefaults(defaults: Record<string, any>, overrides: Record<string, any>): Record<string, any> {
  const result = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined && value !== null && value !== '') {
      result[key] = value;
    }
  }
  return result;
}
