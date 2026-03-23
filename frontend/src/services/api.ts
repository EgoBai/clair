/**
 * API 调用封装
 * 统一管理所有后端API请求，支持缓存、重试、错误处理
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import type {
  ApiResponse,
  StockWithQuote,
  MarketSummary,
  DailyQuote,
  IndustryPerformance,
  StockSearchParams,
  QuoteParams,
  PaginatedData,
} from '../../../shared/types';

// Re-export shared types for consumers
export type {
  ApiResponse,
  StockWithQuote,
  MarketSummary,
  DailyQuote,
  IndustryPerformance,
  StockSearchParams,
  QuoteParams,
  PaginatedData,
} from '../../../shared/types';

// ==================== 缓存层 ====================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class ApiCache {
  private cache = new Map<string, CacheEntry<any>>();
  private defaultTTL = 30000; // 30秒

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  getStats() {
    return { size: this.cache.size };
  }
}

const cache = new ApiCache();

// ==================== API 配置 ====================

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const REQUEST_TIMEOUT = 15000;
const MAX_RETRIES = 2;

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: REQUEST_TIMEOUT,
      headers: { 'Content-Type': 'application/json' },
    });

    // 请求拦截器 - 添加请求ID、时间戳
    this.client.interceptors.request.use(
      (config) => {
        (config as any).__startTime = Date.now();
        return config;
      },
      (error) => Promise.reject(error)
    );

    // 响应拦截器 - 统一错误处理 + 性能日志
    this.client.interceptors.response.use(
      (response: AxiosResponse<ApiResponse>) => {
        const duration = Date.now() - ((response.config as any).__startTime || 0);
        if (duration > 2000) {
          console.warn(`[API] 慢请求: ${response.config.url} (${duration}ms)`);
        }

        if (!response.data.success) {
          const errorMsg = response.data.error || '请求失败';
          console.error(`[API] 业务错误: ${errorMsg}`);
          return Promise.reject(new Error(errorMsg));
        }
        return response;
      },
      (error) => {
        const status = error.response?.status;
        const url = error.config?.url;

        if (status === 429) {
          console.warn(`[API] 限流: ${url}`);
        } else if (status >= 500) {
          console.error(`[API] 服务器错误: ${status} ${url}`);
        } else if (!error.response) {
          console.error(`[API] 网络错误: ${url}`);
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * 带缓存的GET请求
   */
  private async cachedGet<T>(
    url: string,
    params?: any,
    ttl?: number
  ): Promise<ApiResponse<T>> {
    const cacheKey = `${url}?${JSON.stringify(params || {})}`;
    const cached = cache.get<ApiResponse<T>>(cacheKey);
    if (cached) return cached;

    const response = await this.client.get<ApiResponse<T>>(url, { params });
    cache.set(cacheKey, response.data, ttl);
    return response.data;
  }

  // ==================== 股票相关 ====================

  async getStocks(params: StockSearchParams = {}): Promise<ApiResponse<PaginatedData<StockWithQuote>>> {
    return this.cachedGet('/stocks', params, 30000);
  }

  async getStock(symbol: string): Promise<ApiResponse<StockWithQuote>> {
    return this.cachedGet(`/stocks/${symbol}`, undefined, 15000);
  }

  async getStockQuotes(symbol: string, params: QuoteParams = {}): Promise<ApiResponse<{ stock: any; quotes: DailyQuote[] }>> {
    return this.cachedGet(`/stocks/${symbol}/quotes`, params, 60000);
  }

  async getLatestQuote(symbol: string): Promise<ApiResponse<StockWithQuote>> {
    return this.cachedGet(`/stocks/${symbol}/latest`, undefined, 5000);
  }

  async batchGetQuotes(symbols: string[]): Promise<ApiResponse<{ stocks: StockWithQuote[]; count: number }>> {
    const response = await this.client.post('/stocks/batch/quotes', { symbols });
    return response.data;
  }

  // ==================== 市场数据 ====================

  async getMarketSummary(date?: string): Promise<ApiResponse<MarketSummary>> {
    return this.cachedGet('/market/summary', date ? { date } : undefined, 60000);
  }

  async getIndustryPerformance(date?: string): Promise<ApiResponse<{ date: string; industries: IndustryPerformance[] }>> {
    return this.cachedGet('/market/industries', date ? { date } : undefined, 60000);
  }

  async getTopGainers(date?: string, limit: number = 10): Promise<ApiResponse<{ date: string; topGainers: any[] }>> {
    const params: any = { limit };
    if (date) params.date = date;
    return this.cachedGet('/market/top-gainers', params, 30000);
  }

  async getTopLosers(date?: string, limit: number = 10): Promise<ApiResponse<{ date: string; topLosers: any[] }>> {
    const params: any = { limit };
    if (date) params.date = date;
    return this.cachedGet('/market/top-losers', params, 30000);
  }

  async getTopTurnover(date?: string, limit: number = 10): Promise<ApiResponse<{ date: string; topTurnover: any[] }>> {
    const params: any = { limit };
    if (date) params.date = date;
    return this.cachedGet('/market/top-turnover', params, 30000);
  }

  // ==================== 通用请求 ====================

  async get(path: string, params?: any): Promise<ApiResponse<any>> {
    const response = await this.client.get(path, { params });
    return response.data;
  }

  async post(path: string, data?: any): Promise<ApiResponse<any>> {
    cache.invalidate(path.split('/')[1]); // 相关缓存失效
    const response = await this.client.post(path, data);
    return response.data;
  }

  // ==================== 健康检查 ====================

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', { baseURL: '' });
      return response.data.status === 'healthy';
    } catch {
      return false;
    }
  }

  // ==================== 缓存管理 ====================

  clearCache(pattern?: string): void {
    cache.invalidate(pattern);
  }

  getCacheStats() {
    return cache.getStats();
  }
}

// 单例导出
export const apiService = new ApiService();

// 向后兼容的导出
export const {
  getStocks,
  getStock,
  getStockQuotes,
  getLatestQuote,
  batchGetQuotes,
  getMarketSummary,
  getIndustryPerformance,
  getTopGainers,
  getTopLosers,
  getTopTurnover,
  healthCheck,
} = apiService;
