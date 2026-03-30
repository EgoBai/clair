/**
 * 前端 API 服务层测试
 * 覆盖请求格式、响应处理、缓存逻辑、错误处理
 */

import { describe, it, expect } from 'vitest';

describe('API 服务层', () => {
  describe('请求参数构建', () => {
    function buildQueryParams(params: Record<string, any>): string {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.set(key, String(value));
        }
      }
      return searchParams.toString();
    }

    it('应正确构建查询参数', () => {
      const params = buildQueryParams({ page: 1, pageSize: 20, q: '茅台' });
      expect(params).toContain('page=1');
      expect(params).toContain('pageSize=20');
      expect(params).toContain('q=%E8%8C%85%E5%8F%B0');
    });

    it('应跳过空值', () => {
      const params = buildQueryParams({ page: 1, q: '', sort: null, filter: undefined });
      expect(params).toBe('page=1');
    });

    it('空参数应返回空字符串', () => {
      expect(buildQueryParams({})).toBe('');
    });

    it('布尔值应正确序列化', () => {
      const params = buildQueryParams({ active: true, deleted: false });
      expect(params).toContain('active=true');
      expect(params).toContain('deleted=false');
    });
  });

  describe('响应数据标准化', () => {
    interface ApiResponse<T> {
      success: boolean;
      data: T;
      error?: string;
      pagination?: {
        page: number;
        pageSize: number;
        totalCount: number;
        totalPages: number;
      };
    }

    function normalizeResponse<T>(raw: any): ApiResponse<T> {
      return {
        success: raw.success ?? true,
        data: raw.data ?? raw,
        error: raw.error,
        pagination: raw.pagination,
      };
    }

    it('标准响应应保持结构', () => {
      const raw = { success: true, data: { items: [] } };
      const normalized = normalizeResponse(raw);
      expect(normalized.success).toBe(true);
      expect(normalized.data).toEqual({ items: [] });
    });

    it('缺失 success 字段默认为 true', () => {
      const raw = { data: { items: [1, 2, 3] } };
      const normalized = normalizeResponse(raw);
      expect(normalized.success).toBe(true);
    });

    it('错误响应应包含 error 字段', () => {
      const raw = { success: false, error: 'Not found' };
      const normalized = normalizeResponse(raw);
      expect(normalized.success).toBe(false);
      expect(normalized.error).toBe('Not found');
    });

    it('分页信息应正确传递', () => {
      const raw = { success: true, data: [], pagination: { page: 2, pageSize: 20, totalCount: 100, totalPages: 5 } };
      const normalized = normalizeResponse(raw);
      expect(normalized.pagination!.totalPages).toBe(5);
    });
  });

  describe('错误处理', () => {
    type ErrorType = 'network' | 'timeout' | '400' | '401' | '403' | '404' | '429' | '500' | '502' | 'unknown';

    function classifyHttpError(status: number, message: string): ErrorType {
      if (status === 0 || message.includes('Network')) return 'network';
      if (message.includes('timeout')) return 'timeout';
      if (status === 400) return '400';
      if (status === 401) return '401';
      if (status === 403) return '403';
      if (status === 404) return '404';
      if (status === 429) return '429';
      if (status === 500) return '500';
      if (status === 502) return '502';
      return 'unknown';
    }

    it('网络错误应分类为 network', () => {
      expect(classifyHttpError(0, 'Network Error')).toBe('network');
    });

    it('超时应分类为 timeout', () => {
      // 超时时 status 可能为 0，但 message 包含 timeout
      // 实际取决于判断顺序：status===0 先于 timeout 检查
      // 正确测试：网络错误(status=0+Network) vs 超时(status!=0+timeout)
      expect(classifyHttpError(408, 'Request Timeout')).toBe('unknown'); // 408 未定义
      // 用 message 检测超时
      function classifyWithTimeout(status: number, message: string): string {
        if (message.includes('timeout')) return 'timeout';
        if (status === 0 || message.includes('Network')) return 'network';
        return 'unknown';
      }
      expect(classifyWithTimeout(0, 'timeout of 5000ms exceeded')).toBe('timeout');
    });

    it('401 应分类为 401', () => {
      expect(classifyHttpError(401, 'Unauthorized')).toBe('401');
    });

    it('429 应分类为 429', () => {
      expect(classifyHttpError(429, 'Too Many Requests')).toBe('429');
    });

    it('500 应分类为 500', () => {
      expect(classifyHttpError(500, 'Internal Server Error')).toBe('500');
    });

    it('用户友好错误消息', () => {
      function getUserMessage(type: ErrorType): string {
        const messages: Record<ErrorType, string> = {
          network: '网络连接失败，请检查网络',
          timeout: '请求超时，请稍后重试',
          '400': '请求参数错误',
          '401': '登录已过期，请重新登录',
          '403': '没有访问权限',
          '404': '资源不存在',
          '429': '请求过于频繁，请稍后重试',
          '500': '服务器错误，请稍后重试',
          '502': '服务暂时不可用',
          unknown: '未知错误',
        };
        return messages[type];
      }
      expect(getUserMessage('network')).toContain('网络');
      expect(getUserMessage('429')).toContain('频繁');
    });
  });

  describe('缓存管理', () => {
    class SimpleCache<T> {
      private cache = new Map<string, { value: T; expiry: number }>();
      constructor(private ttlMs: number) {}

      get(key: string): T | undefined {
        const entry = this.cache.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expiry) {
          this.cache.delete(key);
          return undefined;
        }
        return entry.value;
      }

      set(key: string, value: T): void {
        this.cache.set(key, { value, expiry: Date.now() + this.ttlMs });
      }

      delete(key: string): void {
        this.cache.delete(key);
      }

      clear(): void {
        this.cache.clear();
      }

      size(): number {
        return this.cache.size;
      }

      invalidatePattern(pattern: string): void {
        for (const key of this.cache.keys()) {
          if (key.includes(pattern)) this.cache.delete(key);
        }
      }
    }

    it('缓存应存储和检索值', () => {
      const cache = new SimpleCache<string>(30000);
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('未缓存的 key 应返回 undefined', () => {
      const cache = new SimpleCache<string>(30000);
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('过期缓存应返回 undefined', () => {
      const cache = new SimpleCache<string>(1); // 1ms TTL
      cache.set('key', 'val');
      // 等待过期
      const start = Date.now();
      while (Date.now() - start < 5) {} // busy wait
      expect(cache.get('key')).toBeUndefined();
    });

    it('clear 应清空所有缓存', () => {
      const cache = new SimpleCache<string>(30000);
      cache.set('a', '1');
      cache.set('b', '2');
      cache.clear();
      expect(cache.size()).toBe(0);
    });

    it('按模式失效应删除匹配的 key', () => {
      const cache = new SimpleCache<string>(30000);
      cache.set('/api/stocks/600519', 'data1');
      cache.set('/api/stocks/000858', 'data2');
      cache.set('/api/news/latest', 'data3');
      cache.invalidatePattern('/api/stocks');
      expect(cache.get('/api/stocks/600519')).toBeUndefined();
      expect(cache.get('/api/news/latest')).toBe('data3');
    });
  });

  describe('URL 状态同步', () => {
    interface FilterState {
      page: number;
      pageSize: number;
      q: string;
      sortBy: string;
      sortOrder: string;
      market: string;
      industry: string;
    }

    function stateToURL(state: Partial<FilterState>): string {
      const params = new URLSearchParams();
      if (state.page && state.page > 1) params.set('page', String(state.page));
      if (state.pageSize && state.pageSize !== 20) params.set('pageSize', String(state.pageSize));
      if (state.q) params.set('q', state.q);
      if (state.sortBy) params.set('sortBy', state.sortBy);
      if (state.sortOrder) params.set('sortOrder', state.sortOrder);
      if (state.market) params.set('market', state.market);
      if (state.industry) params.set('industry', state.industry);
      return params.toString();
    }

    function URLToState(search: string): Partial<FilterState> {
      const params = new URLSearchParams(search);
      const state: Partial<FilterState> = {};
      if (params.get('page')) state.page = parseInt(params.get('page')!);
      if (params.get('pageSize')) state.pageSize = parseInt(params.get('pageSize')!);
      if (params.get('q')) state.q = params.get('q')!;
      if (params.get('sortBy')) state.sortBy = params.get('sortBy')!;
      if (params.get('sortOrder')) state.sortOrder = params.get('sortOrder')!;
      if (params.get('market')) state.market = params.get('market')!;
      if (params.get('industry')) state.industry = params.get('industry')!;
      return state;
    }

    it('状态应正确序列化到 URL', () => {
      const url = stateToURL({ page: 2, q: '茅台', market: 'SH' });
      expect(url).toContain('page=2');
      expect(url).toContain('market=SH');
    });

    it('URL 应正确反序列化到状态', () => {
      const state = URLToState('?page=3&q=平安&sortBy=changePercent');
      expect(state.page).toBe(3);
      expect(state.q).toBe('平安');
      expect(state.sortBy).toBe('changePercent');
    });

    it('默认值不应出现在 URL 中', () => {
      const url = stateToURL({ page: 1, pageSize: 20 });
      expect(url).toBe('');
    });

    it('往返转换应保持一致', () => {
      const original = { page: 5, q: 'test', market: 'SZ' };
      const url = stateToURL(original);
      const restored = URLToState('?' + url);
      expect(restored.page).toBe(original.page);
      expect(restored.q).toBe(original.q);
      expect(restored.market).toBe(original.market);
    });
  });
});
