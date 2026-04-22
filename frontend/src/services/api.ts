/**
 * API 调用封装
 * 统一管理所有后端API请求，支持缓存、重试、错误处理
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import logger from '../utils/logger';
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
  private maxSize = 200; // 最大缓存条目数，防止内存泄漏

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
    // 超过最大容量时，淘汰最旧的条目
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
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

  /** 定期清理过期条目 */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  getStats() {
    return { size: this.cache.size, maxSize: this.maxSize };
  }
}

const cache = new ApiCache();

// ==================== API 配置 ====================

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const REQUEST_TIMEOUT = 15000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY = 1000; // 1秒基础延迟

/** 判断错误是否可重试（网络错误或5xx服务器错误） */
function isRetryableError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    if (!error.response) return true; // 网络错误（无响应）
    const status = error.response.status;
    return status >= 500 || status === 429;
  }
  return false;
}

/** 指数退避延迟 */
function retryDelay(attempt: number): number {
  return RETRY_BASE_DELAY * Math.pow(2, attempt);
}

class ApiService {
  private client: AxiosInstance;
  private retryCount = new Map<string, number>(); // 跟踪每个URL的重试次数

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: REQUEST_TIMEOUT,
      headers: { 'Content-Type': 'application/json' },
    });

    // 请求拦截器 - 添加请求ID、时间戳
    this.client.interceptors.request.use(
      (config) => {
        (config as AxiosRequestConfig & { __startTime?: number }).__startTime = Date.now();
        return config;
      },
      (error) => Promise.reject(error)
    );

    // 响应拦截器 - 统一错误处理 + 性能日志
    this.client.interceptors.response.use(
      (response: AxiosResponse<ApiResponse>) => {
        const cfg = response.config as AxiosRequestConfig & { __startTime?: number };
        const duration = Date.now() - (cfg.__startTime || 0);
        if (duration > 2000) {
          logger.warn(`[API] 慢请求: ${response.config.url} (${duration}ms)`);
        }

        if (!response.data.success) {
          const errorMsg = response.data.error || '请求失败';
          logger.error(`[API] 业务错误: ${errorMsg}`);
          return Promise.reject(new Error(errorMsg));
        }
        return response;
      },
      (error) => {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        const url = axios.isAxiosError(error) ? error.config?.url : undefined;

        if (status === 429) {
          logger.warn(`[API] 限流: ${url}`);
        } else if (status != null && status >= 500) {
          logger.error(`[API] 服务器错误: ${status} ${url}`);
        } else if (axios.isAxiosError(error) && !error.response) {
          logger.error(`[API] 网络错误: ${url}`);
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * 带指数退避的重试请求
   */
  private async retryRequest<T>(
    requestFn: () => Promise<T>,
    url: string,
    maxRetries: number = MAX_RETRIES
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error: unknown) {
        lastError = error;
        if (attempt < maxRetries && isRetryableError(error)) {
          const delay = retryDelay(attempt);
          logger.warn(
            `[API] 请求失败，${delay}ms后重试 (${attempt + 1}/${maxRetries}): ${url}`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          break;
        }
      }
    }
    throw lastError;
  }

  /**
   * 带缓存的GET请求（自动重试网络错误和5xx）
   */
  private async cachedGet<T>(
    url: string,
    params?: object,
    ttl?: number
  ): Promise<ApiResponse<T>> {
    const cacheKey = `${url}?${JSON.stringify(params || {})}`;
    const cached = cache.get<ApiResponse<T>>(cacheKey);
    if (cached) return cached;

    const response = await this.retryRequest(
      () => this.client.get<ApiResponse<T>>(url, { params }),
      url
    );
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

  async getStockQuotes(symbol: string, params: QuoteParams = {}): Promise<ApiResponse<{ stock: StockWithQuote; quotes: DailyQuote[] }>> {
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

  async getTopGainers(date?: string, limit: number = 10): Promise<ApiResponse<{ date: string; topGainers: StockWithQuote[] }>> {
    const params: Record<string, unknown> = { limit };
    if (date) params.date = date;
    return this.cachedGet('/market/top-gainers', params, 30000);
  }

  async getTopLosers(date?: string, limit: number = 10): Promise<ApiResponse<{ date: string; topLosers: StockWithQuote[] }>> {
    const params: Record<string, unknown> = { limit };
    if (date) params.date = date;
    return this.cachedGet('/market/top-losers', params, 30000);
  }

  async getTopTurnover(date?: string, limit: number = 10): Promise<ApiResponse<{ date: string; topTurnover: StockWithQuote[] }>> {
    const params: Record<string, unknown> = { limit };
    if (date) params.date = date;
    return this.cachedGet('/market/top-turnover', params, 30000);
  }

  // ==================== 通用请求（带重试） ====================

  async get<T = unknown>(path: string, params?: object): Promise<ApiResponse<T>> {
    const response = await this.retryRequest(
      () => this.client.get<ApiResponse<T>>(path, { params }),
      path
    );
    return response.data;
  }

  async post<T = unknown>(path: string, data?: Record<string, unknown>): Promise<ApiResponse<T>> {
    cache.invalidate(path.split('/')[1]); // 相关缓存失效
    const response = await this.retryRequest(
      () => this.client.post<ApiResponse<T>>(path, data),
      path
    );
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

  // ==================== 回测系统 ====================

  async runBacktest(symbol: string, strategy: string, params: Record<string, unknown> = {}): Promise<ApiResponse<unknown>> {
    const response = await this.client.post('/backtest/run', { symbol, strategy, params });
    return response.data;
  }

  async getBacktestPresets(): Promise<ApiResponse<unknown>> {
    return this.cachedGet('/backtest/presets', undefined, 300000);
  }

  async compareBacktests(symbol: string, strategies: string[]): Promise<ApiResponse<unknown>> {
    const response = await this.client.post('/backtest/compare', { symbol, strategies });
    return response.data;
  }

  // ==================== 投资组合 ====================

  async getPortfolios(): Promise<ApiResponse<unknown>> {
    return this.cachedGet('/portfolio', undefined, 10000);
  }

  async getPortfolio(id: number): Promise<ApiResponse<unknown>> {
    return this.cachedGet(`/portfolio/${id}`, undefined, 5000);
  }

  async createPortfolio(name: string, description?: string, cashBalance?: number): Promise<ApiResponse<unknown>> {
    const response = await this.client.post('/portfolio', { name, description, cashBalance });
    cache.invalidate('portfolio');
    return response.data;
  }

  async addPosition(portfolioId: number, position: Record<string, unknown>): Promise<ApiResponse<unknown>> {
    const response = await this.client.post(`/portfolio/${portfolioId}/positions`, position);
    cache.invalidate('portfolio');
    return response.data;
  }

  async updatePosition(portfolioId: number, symbol: string, data: Record<string, unknown>): Promise<ApiResponse<unknown>> {
    const response = await this.client.put(`/portfolio/${portfolioId}/positions/${symbol}`, data);
    cache.invalidate('portfolio');
    return response.data;
  }

  async deletePosition(portfolioId: number, symbol: string): Promise<ApiResponse<unknown>> {
    const response = await this.client.delete(`/portfolio/${portfolioId}/positions/${symbol}`);
    cache.invalidate('portfolio');
    return response.data;
  }

  async deletePortfolio(id: number): Promise<ApiResponse<unknown>> {
    const response = await this.client.delete(`/portfolio/${id}`);
    cache.invalidate('portfolio');
    return response.data;
  }

  // ==================== 新闻资讯 ====================

  async getNews(params: Record<string, unknown> = {}): Promise<ApiResponse<unknown>> {
    return this.cachedGet('/news', params, 30000);
  }

  async getStockNews(symbol: string, limit: number = 10): Promise<ApiResponse<unknown>> {
    return this.cachedGet(`/news/stock/${symbol}`, { limit }, 60000);
  }

  async getNewsDetail(id: number): Promise<ApiResponse<unknown>> {
    return this.cachedGet(`/news/${id}`, undefined, 300000);
  }

  async getNewsStats(): Promise<ApiResponse<unknown>> {
    return this.cachedGet('/news/stats/overview', undefined, 60000);
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

// ==================== 盘口数据 ====================
// 使用独立的 axios 实例（不经过 apiService 的 baseURL 和响应拦截器）
const rawClient = axios.create({ timeout: 15000 });

export async function fetchOrderBook(symbol: string, name?: string) {
  const params = name ? `?name=${encodeURIComponent(name)}` : '';
  const res = await rawClient.get(`/api/order-book/${symbol}${params}`);
  return res.data.data;
}

export async function fetchTimeShare(symbol: string) {
  const res = await rawClient.get(`/api/time-share/${symbol}`);
  return res.data.data;
}

// ==================== 融资融券 ====================

export async function fetchMarginOverview() {
  const res = await rawClient.get('/api/margin/overview');
  return res.data.data;
}

export async function fetchMarginData(symbol: string, days = 30) {
  const res = await rawClient.get(`/api/margin/${symbol}?days=${days}`);
  return res.data.data;
}

export async function fetchMarginRank(type: string, count = 20) {
  const res = await rawClient.get(`/api/margin/rank/${type}?count=${count}`);
  return res.data.data.rank;
}

// ==================== 龙虎榜 ====================

export async function fetchTopTraderOverview(date?: string) {
  const params = date ? `?date=${date}` : '';
  const res = await rawClient.get(`/api/top-traders/overview${params}`);
  return res.data.data;
}

export async function fetchTopTraderDetail(symbol: string, name?: string) {
  const params = name ? `?name=${encodeURIComponent(name)}` : '';
  const res = await rawClient.get(`/api/top-traders/${symbol}${params}`);
  return res.data.data;
}

export async function fetchTopTraderHistory(symbol: string, days = 10) {
  const res = await rawClient.get(`/api/top-traders/history/${symbol}?days=${days}`);
  return res.data.data;
}

export async function fetchTopTraderSeatRank(count = 20) {
  const res = await rawClient.get(`/api/top-traders/seat/rank?count=${count}`);
  return res.data.data.rank;
}

// ==================== 大宗交易 ====================

export async function fetchBlockTrades(params: { date?: string; symbol?: string; page?: number; pageSize?: number } = {}) {
  const query = new URLSearchParams();
  if (params.date) query.set('date', params.date);
  if (params.symbol) query.set('symbol', params.symbol);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  const res = await rawClient.get(`/api/block-trades?${query}`);
  return res.data.data;
}

export async function fetchBlockTradeOverview() {
  const res = await rawClient.get('/api/block-trades/overview');
  return res.data.data;
}

export async function fetchBlockTradeHistory(symbol: string, days = 30) {
  const res = await rawClient.get(`/api/block-trades/${symbol}?days=${days}`);
  return res.data.data;
}

// ==================== 股东增减持 ====================

export async function fetchShareholderChanges(params: { symbol?: string; type?: string; page?: number; pageSize?: number } = {}) {
  const query = new URLSearchParams();
  if (params.symbol) query.set('symbol', params.symbol);
  if (params.type) query.set('type', params.type);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  const res = await rawClient.get(`/api/shareholder-changes?${query}`);
  return res.data.data;
}

export async function fetchShareholderChangeOverview() {
  const res = await rawClient.get('/api/shareholder-changes/overview');
  return res.data.data;
}

export async function fetchShareholderChangeHistory(symbol: string, days = 90) {
  const res = await rawClient.get(`/api/shareholder-changes/${symbol}?days=${days}`);
  return res.data.data;
}

// ==================== 限售股解禁 ====================

export async function fetchLockupCalendar(year?: number, month?: number) {
  const now = new Date();
  const params = new URLSearchParams({
    year: String(year || now.getFullYear()),
    month: String(month || now.getMonth() + 1),
  });
  const res = await rawClient.get(`/api/lockup/calendar?${params}`);
  return res.data.data;
}

export async function fetchLockupRank(year?: number, month?: number) {
  const now = new Date();
  const params = new URLSearchParams({
    year: String(year || now.getFullYear()),
    month: String(month || now.getMonth() + 1),
  });
  const res = await rawClient.get(`/api/lockup/rank?${params}`);
  return res.data.data;
}

export async function fetchLockupHistory(symbol: string, months = 12) {
  const res = await rawClient.get(`/api/lockup/${symbol}?months=${months}`);
  return res.data.data;
}

// ==================== AI 智能选股 ====================

export async function fetchAIRecommendations(strategy?: string) {
  const params = strategy ? `?strategy=${strategy}` : '';
  const res = await rawClient.get(`/api/ai/recommendations${params}`);
  return res.data.data;
}

export async function fetchAIDiagnosis(symbol: string) {
  const res = await rawClient.get(`/api/ai/diagnose/${symbol}`);
  return res.data.data;
}

export async function fetchAISectorRotation() {
  const res = await rawClient.get('/api/ai/sector-rotation');
  return res.data.data;
}

export async function fetchAIAlertSuggestions() {
  const res = await rawClient.get('/api/ai/alert-suggestions');
  return res.data.data;
}
