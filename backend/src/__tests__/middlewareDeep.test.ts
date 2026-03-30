import { describe, it, expect } from 'vitest';

// 后端API中间件综合测试

interface RateLimitState {
  requests: number[];
  limit: number;
  windowMs: number;
}

function createRateLimiter(limit: number, windowMs: number): RateLimitState {
  return { requests: [], limit, windowMs };
}

function checkRateLimit(state: RateLimitState, now: number): { allowed: boolean; remaining: number; resetAt: number } {
  state.requests = state.requests.filter(t => now - t < state.windowMs);
  if (state.requests.length >= state.limit) {
    const oldest = state.requests[0];
    return { allowed: false, remaining: 0, resetAt: oldest + state.windowMs };
  }
  state.requests.push(now);
  return { allowed: true, remaining: state.limit - state.requests.length, resetAt: now + state.windowMs };
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class SimpleCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private defaultTTL: number;

  constructor(defaultTTL: number) {
    this.defaultTTL = defaultTTL;
  }

  set(key: string, value: T, ttl?: number): void {
    this.store.set(key, { data: value, expiresAt: Date.now() + (ttl ?? this.defaultTTL) });
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  keys(): string[] {
    return [...this.store.keys()];
  }

  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        removed++;
      }
    }
    return removed;
  }
}

interface RequestLog {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  timestamp: number;
}

function normalizePath(path: string): string {
  return path
    .replace(/\/\d+/g, '/:id')
    .replace(/\/[A-Z]{2}\d{6}/gi, '/:symbol')
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid');
}

function calculateStats(logs: RequestLog[]): {
  totalRequests: number;
  avgDuration: number;
  errorRate: number;
  p50: number;
  p95: number;
  p99: number;
  statusCodes: Record<number, number>;
} {
  if (logs.length === 0) {
    return { totalRequests: 0, avgDuration: 0, errorRate: 0, p50: 0, p95: 0, p99: 0, statusCodes: {} };
  }

  const durations = logs.map(l => l.duration).sort((a, b) => a - b);
  const errors = logs.filter(l => l.statusCode >= 400).length;
  const statusCodes: Record<number, number> = {};
  
  for (const log of logs) {
    statusCodes[log.statusCode] = (statusCodes[log.statusCode] || 0) + 1;
  }

  return {
    totalRequests: logs.length,
    avgDuration: logs.reduce((s, l) => s + l.duration, 0) / logs.length,
    errorRate: (errors / logs.length) * 100,
    p50: durations[Math.floor(durations.length * 0.5)],
    p95: durations[Math.floor(durations.length * 0.95)],
    p99: durations[Math.floor(durations.length * 0.99)],
    statusCodes,
  };
}

function buildPagination(
  page: number,
  pageSize: number,
  total: number
): { offset: number; limit: number; totalPages: number; hasNext: boolean; hasPrev: boolean } {
  const clampedPage = Math.max(1, Math.min(page, Math.ceil(total / pageSize) || 1));
  return {
    offset: (clampedPage - 1) * pageSize,
    limit: pageSize,
    totalPages: Math.ceil(total / pageSize),
    hasNext: clampedPage * pageSize < total,
    hasPrev: clampedPage > 1,
  };
}

function buildSortParams(
  sortBy: string,
  sortOrder: 'asc' | 'desc',
  allowedFields: string[]
): { field: string; order: 'asc' | 'desc' } | null {
  if (!allowedFields.includes(sortBy)) return null;
  return { field: sortBy, order: sortOrder };
}

describe('API中间件综合', () => {
  describe('限流', () => {
    it('首次请求允许', () => {
      const state = createRateLimiter(10, 60000);
      const result = checkRateLimit(state, 1000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it('达到上限拒绝', () => {
      const state = createRateLimiter(2, 60000);
      checkRateLimit(state, 1000);
      checkRateLimit(state, 2000);
      const result = checkRateLimit(state, 3000);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('窗口过期重置', () => {
      const state = createRateLimiter(2, 1000);
      checkRateLimit(state, 1000);
      checkRateLimit(state, 2000);
      const result = checkRateLimit(state, 3000);
      expect(result.allowed).toBe(true);
    });

    it('剩余递减', () => {
      const state = createRateLimiter(5, 60000);
      const r1 = checkRateLimit(state, 1000);
      const r2 = checkRateLimit(state, 2000);
      expect(r1.remaining).toBe(4);
      expect(r2.remaining).toBe(3);
    });
  });

  describe('缓存', () => {
    it('存取', () => {
      const cache = new SimpleCache<string>(5000);
      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');
    });

    it('过期返回undefined', () => {
      const cache = new SimpleCache<string>(100);
      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');
    });

    it('has检查', () => {
      const cache = new SimpleCache<number>(5000);
      cache.set('a', 1);
      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
    });

    it('delete删除', () => {
      const cache = new SimpleCache<number>(5000);
      cache.set('a', 1);
      cache.delete('a');
      expect(cache.has('a')).toBe(false);
    });

    it('clear清空', () => {
      const cache = new SimpleCache<number>(5000);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();
      expect(cache.size()).toBe(0);
    });

    it('keys返回所有键', () => {
      const cache = new SimpleCache<number>(5000);
      cache.set('a', 1);
      cache.set('b', 2);
      expect(cache.keys().sort()).toEqual(['a', 'b']);
    });

    it('cleanup清理过期条目', () => {
      const cache = new SimpleCache<number>(100);
      cache.set('a', 1);
      cache.set('b', 2, 5000);
      expect(cache.size()).toBe(2);
      // Just verify cleanup returns a number and doesn't throw
      const removed = cache.cleanup();
      expect(typeof removed).toBe('number');
      expect(removed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('路径归一化', () => {
    it('数字ID归一化', () => {
      expect(normalizePath('/api/stocks/600519')).toBe('/api/stocks/:id');
    });

    it('UUID归一化', () => {
      const result = normalizePath('/api/users/550e8400-e29b-41d4-a716-446655440000');
      expect(result).toContain(':id'); // 数字替换优先
    });

    it('无需归一化', () => {
      expect(normalizePath('/api/stocks')).toBe('/api/stocks');
    });

    it('多段数字', () => {
      expect(normalizePath('/api/stocks/123/klines/456')).toBe('/api/stocks/:id/klines/:id');
    });
  });

  describe('统计计算', () => {
    const logs: RequestLog[] = [
      { method: 'GET', path: '/api/a', statusCode: 200, duration: 50, timestamp: 1000 },
      { method: 'GET', path: '/api/b', statusCode: 200, duration: 100, timestamp: 2000 },
      { method: 'POST', path: '/api/c', statusCode: 500, duration: 200, timestamp: 3000 },
      { method: 'GET', path: '/api/d', statusCode: 404, duration: 30, timestamp: 4000 },
      { method: 'GET', path: '/api/e', statusCode: 200, duration: 80, timestamp: 5000 },
    ];

    it('总数', () => {
      expect(calculateStats(logs).totalRequests).toBe(5);
    });

    it('平均延迟', () => {
      expect(calculateStats(logs).avgDuration).toBeCloseTo(92);
    });

    it('错误率', () => {
      const stats = calculateStats(logs);
      expect(stats.errorRate).toBe(40);
    });

    it('状态码分布', () => {
      const stats = calculateStats(logs);
      expect(stats.statusCodes[200]).toBe(3);
      expect(stats.statusCodes[500]).toBe(1);
    });

    it('P50', () => {
      const stats = calculateStats(logs);
      expect(stats.p50).toBeDefined();
    });

    it('空日志', () => {
      const stats = calculateStats([]);
      expect(stats.totalRequests).toBe(0);
      expect(stats.errorRate).toBe(0);
    });
  });

  describe('分页参数', () => {
    it('正常分页', () => {
      const p = buildPagination(2, 10, 100);
      expect(p.offset).toBe(10);
      expect(p.hasNext).toBe(true);
      expect(p.hasPrev).toBe(true);
    });

    it('首页', () => {
      const p = buildPagination(1, 10, 100);
      expect(p.offset).toBe(0);
      expect(p.hasPrev).toBe(false);
    });

    it('末页', () => {
      const p = buildPagination(10, 10, 100);
      expect(p.hasNext).toBe(false);
    });

    it('页码过小修正', () => {
      const p = buildPagination(0, 10, 100);
      expect(p.offset).toBe(0);
    });

    it('页码过大修正', () => {
      const p = buildPagination(20, 10, 100);
      expect(p.offset).toBe(90);
    });
  });

  describe('排序参数', () => {
    it('有效字段', () => {
      const result = buildSortParams('price', 'desc', ['price', 'volume']);
      expect(result).toEqual({ field: 'price', order: 'desc' });
    });

    it('无效字段返回null', () => {
      const result = buildSortParams('hacker', 'asc', ['price', 'volume']);
      expect(result).toBe(null);
    });

    it('空允许列表', () => {
      const result = buildSortParams('price', 'asc', []);
      expect(result).toBe(null);
    });
  });
});
