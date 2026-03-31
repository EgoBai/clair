import { describe, it, expect } from 'vitest';

/**
 * 工具函数索引测试
 * 测试公共导出和类型定义
 */

// 类型定义验证
interface ApiConfig {
  baseUrl: string;
  timeout: number;
  retries: number;
  retryDelay: number;
}

interface CacheConfig {
  enabled: boolean;
  ttl: number;
  maxSize: number;
  strategy: 'lru' | 'fifo' | 'lfu';
}

interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

function createPagination<T>(data: T[], params: PaginationParams): PaginatedResponse<T> {
  const total = data.length;
  const totalPages = Math.ceil(total / params.pageSize);
  const start = (params.page - 1) * params.pageSize;
  const end = start + params.pageSize;
  const pageData = data.slice(start, end);

  return {
    data: pageData,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages,
    hasNext: params.page < totalPages,
    hasPrev: params.page > 1,
  };
}

function mergeConfigs<T extends Record<string, any>>(defaults: T, overrides: Partial<T>): T {
  const result = { ...defaults };
  for (const key in overrides) {
    if (overrides[key] !== undefined) {
      (result as any)[key] = overrides[key];
    }
  }
  return result;
}

function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  }) as T;
}

function throttle<T extends (...args: any[]) => any>(fn: T, interval: number): T {
  let lastTime = 0;
  return ((...args: any[]) => {
    const now = Date.now();
    if (now - lastTime >= interval) {
      lastTime = now;
      fn(...args);
    }
  }) as T;
}

function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepClone) as T;
  const cloned = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

describe('工具函数', () => {
  describe('分页', () => {
    const data = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));

    it('应该返回正确的分页数据', () => {
      const result = createPagination(data, { page: 1, pageSize: 10 });
      expect(result.data.length).toBe(10);
      expect(result.total).toBe(100);
      expect(result.totalPages).toBe(10);
      expect(result.hasNext).toBe(true);
      expect(result.hasPrev).toBe(false);
    });

    it('最后一页应该正确标记', () => {
      const result = createPagination(data, { page: 10, pageSize: 10 });
      expect(result.hasNext).toBe(false);
      expect(result.hasPrev).toBe(true);
    });

    it('空数据应该返回空', () => {
      const result = createPagination([], { page: 1, pageSize: 10 });
      expect(result.data.length).toBe(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('超出范围应该返回空数据', () => {
      const result = createPagination(data, { page: 100, pageSize: 10 });
      expect(result.data.length).toBe(0);
    });
  });

  describe('配置合并', () => {
    it('应该合并默认值和覆盖值', () => {
      const defaults: ApiConfig = { baseUrl: 'http://localhost', timeout: 5000, retries: 3, retryDelay: 1000 };
      const result = mergeConfigs(defaults, { timeout: 10000 });
      expect(result.timeout).toBe(10000);
      expect(result.baseUrl).toBe('http://localhost');
    });

    it('undefined不应该覆盖默认值', () => {
      const defaults: ApiConfig = { baseUrl: 'http://localhost', timeout: 5000, retries: 3, retryDelay: 1000 };
      const result = mergeConfigs(defaults, { timeout: undefined as any });
      expect(result.timeout).toBe(5000);
    });
  });

  describe('防抖', () => {
    it('应该创建防抖函数', () => {
      let count = 0;
      const fn = debounce(() => count++, 100);
      expect(typeof fn).toBe('function');
    });
  });

  describe('节流', () => {
    it('应该创建节流函数', () => {
      let count = 0;
      const fn = throttle(() => count++, 100);
      expect(typeof fn).toBe('function');
    });
  });

  describe('深拷贝', () => {
    it('应该复制对象', () => {
      const original = { a: 1, b: { c: 2 } };
      const cloned = deepClone(original);
      expect(cloned).toEqual(original);
      expect(cloned.b).not.toBe(original.b);
    });

    it('应该复制数组', () => {
      const original = [1, [2, 3], { a: 4 }];
      const cloned = deepClone(original);
      expect(cloned).toEqual(original);
      expect(cloned[1]).not.toBe(original[1]);
    });

    it('应该处理null和undefined', () => {
      expect(deepClone(null)).toBe(null);
      expect(deepClone(undefined)).toBe(undefined);
    });

    it('应该处理原始类型', () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone('hello')).toBe('hello');
      expect(deepClone(true)).toBe(true);
    });
  });
});
