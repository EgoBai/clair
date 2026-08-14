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
  MarginOverview,
  TopTraderOverview,
  SeatRankEntry,
  MarginRankEntry,
  MarginTradingData,
  DataCategory,
  DataFreshness,
} from '../../../shared/types';
import { CACHE_TTL } from '../../../shared/types';

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
  DataCategory,
  DataFreshness,
} from '../../../shared/types';
export { CACHE_TTL } from '../../../shared/types';

// ==================== 缓存层 ====================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  category: DataCategory;
}

class ApiCache {
  private cache = new Map<string, CacheEntry<any>>();
  private defaultTTL = CACHE_TTL.default;
  private maxSize = 200;

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  /** 带元信息的缓存获取 — 供 freshness indicator 使用 */
  getWithMeta<T>(key: string): { data: T; meta: DataFreshness } | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    const age = Date.now() - entry.timestamp;
    if (age > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    return {
      data: entry.data,
      meta: {
        updatedAt: new Date(entry.timestamp).toISOString(),
        category: entry.category,
        remainingTTL: entry.ttl - age,
        fromCache: true,
      },
    };
  }

  set<T>(key: string, data: T, ttl?: number, category: DataCategory = 'default'): void {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTTL,
      category,
    });
  }

  /** 获取指定 key 的缓存时间戳（毫秒） */
  getTimestamp(key: string): number | null {
    const entry = this.cache.get(key);
    return entry ? entry.timestamp : null;
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
  private authToken: string | null = null;

  /** 设置认证token，供authService在登录/刷新后调用 */
  setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: REQUEST_TIMEOUT,
      headers: { 'Content-Type': 'application/json' },
    });

    // 请求拦截器 - 添加请求ID、时间戳 + 自动注入认证token
    this.client.interceptors.request.use(
      (config) => {
        (config as AxiosRequestConfig & { __startTime?: number }).__startTime = Date.now();
        if (this.authToken) {
          config.headers.Authorization = `Bearer ${this.authToken}`;
        }
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
   * @param url - 请求路径
   * @param params - 查询参数
   * @param category - 数据类别（决定 TTL 和 freshness label）
   */
  private async cachedGet<T>(
    url: string,
    params: object | undefined,
    category: DataCategory = 'default',
  ): Promise<ApiResponse<T>> {
    const ttl = CACHE_TTL[category];
    const cacheKey = `${url}?${JSON.stringify(params || {})}`;

    // 检查缓存
    const cached = cache.getWithMeta<ApiResponse<T>>(cacheKey);
    if (cached) return cached.data;

    // 发起请求
    const response = await this.retryRequest(
      () => this.client.get<ApiResponse<T>>(url, { params }),
      url
    );
    const result = response.data;

    // 写入缓存 + 注入元信息
    cache.set(cacheKey, result, ttl, category);
    result._cacheMeta = {
      updatedAt: new Date().toISOString(),
      category,
      remainingTTL: ttl,
      fromCache: false,
    };

    return result;
  }

  // ==================== 股票相关 ====================

  async getStocks(params: StockSearchParams = {}): Promise<ApiResponse<PaginatedData<StockWithQuote>>> {
    return this.cachedGet('/stocks', params, 'default');
  }

  async getStock(symbol: string): Promise<ApiResponse<StockWithQuote>> {
    return this.cachedGet(`/stocks/${symbol}`, undefined, 'quote');
  }

  async getStockQuotes(symbol: string, params: QuoteParams = {}): Promise<ApiResponse<{ stock: StockWithQuote; quotes: DailyQuote[] }>> {
    return this.cachedGet(`/stocks/${symbol}/quotes`, params, 'quote');
  }

  async getLatestQuote(symbol: string): Promise<ApiResponse<StockWithQuote>> {
    return this.cachedGet(`/stocks/${symbol}/latest`, undefined, 'quote');
  }

  async batchGetQuotes(symbols: string[]): Promise<ApiResponse<{ stocks: StockWithQuote[]; count: number }>> {
    const response = await this.client.post('/stocks/batch/quotes', { symbols });
    return response.data;
  }

  // ==================== 市场数据 ====================

  async getMarketSummary(date?: string): Promise<ApiResponse<MarketSummary>> {
    return this.cachedGet('/market/summary', date ? { date } : undefined, 'market');
  }

  async getIndustryPerformance(date?: string): Promise<ApiResponse<{ date: string; industries: IndustryPerformance[] }>> {
    return this.cachedGet('/market/industries', date ? { date } : undefined, 'market');
  }

  async getTopGainers(date?: string, limit: number = 10): Promise<ApiResponse<{ date: string; topGainers: StockWithQuote[] }>> {
    const params: Record<string, unknown> = { limit };
    if (date) params.date = date;
    return this.cachedGet('/market/top-gainers', params, 'default');
  }

  async getTopLosers(date?: string, limit: number = 10): Promise<ApiResponse<{ date: string; topLosers: StockWithQuote[] }>> {
    const params: Record<string, unknown> = { limit };
    if (date) params.date = date;
    return this.cachedGet('/market/top-losers', params, 'default');
  }

  async getTopTurnover(date?: string, limit: number = 10): Promise<ApiResponse<{ date: string; topTurnover: StockWithQuote[] }>> {
    const params: Record<string, unknown> = { limit };
    if (date) params.date = date;
    return this.cachedGet('/market/top-turnover', params, 'default');
  }

  // ==================== 通用请求（带重试） ====================

  async get<T = unknown>(path: string, params?: object): Promise<ApiResponse<T>> {
    const response = await this.retryRequest(
      () => this.client.get<ApiResponse<T>>(path, { params }),
      path
    );
    return response.data;
  }

  async put<T = unknown>(path: string, data?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const response = await this.retryRequest(
      () => this.client.put<ApiResponse<T>>(path, data),
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
    return this.cachedGet('/backtest/presets', undefined, 'financial');
  }

  async compareBacktests(symbol: string, strategies: string[]): Promise<ApiResponse<unknown>> {
    const response = await this.client.post('/backtest/compare', { symbol, strategies });
    return response.data;
  }

  // ==================== 投资组合 ====================

  async getPortfolios(): Promise<ApiResponse<unknown>> {
    return this.cachedGet('/portfolio', undefined, 'quote');
  }

  async getPortfolio(id: number): Promise<ApiResponse<unknown>> {
    return this.cachedGet(`/portfolio/${id}`, undefined, 'quote');
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
    return this.cachedGet('/news', params, 'default');
  }

  async getStockNews(symbol: string, limit: number = 10): Promise<ApiResponse<unknown>> {
    return this.cachedGet(`/news/stock/${symbol}`, { limit }, 'market');
  }

  async getNewsDetail(id: number): Promise<ApiResponse<unknown>> {
    return this.cachedGet(`/news/${id}`, undefined, 'financial');
  }

  async getNewsStats(): Promise<ApiResponse<unknown>> {
    return this.cachedGet('/news/stats/overview', undefined, 'market');
  }

  // ==================== 选股器 ====================

  async getScreenerTemplates(): Promise<ApiResponse<{ presets: unknown[]; customs: unknown[] }>> {
    return this.cachedGet('/screener/templates', undefined, 'market');
  }

  async runScreener(data: unknown): Promise<ApiResponse<unknown>> {
    const response = await this.retryRequest(
      () => this.client.post<ApiResponse<unknown>>('/screener/filter', data),
      '/screener/filter'
    );
    return response.data;
  }

  async saveScreenerTemplate(data: unknown): Promise<ApiResponse<unknown>> {
    const response = await this.retryRequest(
      () => this.client.post<ApiResponse<unknown>>('/screener/templates', data),
      '/screener/templates'
    );
    return response.data;
  }

  async deleteScreenerTemplate(id: string): Promise<ApiResponse<unknown>> {
    const response = await this.retryRequest(
      () => this.client.delete<ApiResponse<unknown>>(`/screener/templates/${id}`),
      `/screener/templates/${id}`
    );
    return response.data;
  }

  // ==================== 个股对比 ====================

  async compareStocks(symbols: string[]): Promise<ApiResponse<unknown>> {
    return this.cachedGet('/compare', { symbols: symbols.join(',') }, 'default');
  }

  async compareRadar(symbols: string[]): Promise<ApiResponse<unknown>> {
    return this.cachedGet('/compare/radar', { symbols: symbols.join(',') }, 'default');
  }

  // ==================== 财务数据 ====================

  async getFinancialSummary(symbol: string): Promise<ApiResponse<unknown>> {
    return this.cachedGet('/financials/summary', { symbol }, 'default');
  }

  async getBalanceSheet(symbol: string, periods = 4): Promise<ApiResponse<unknown>> {
    return this.cachedGet('/financials/balance-sheet', { symbol, periods }, 'market');
  }

  async getIncomeStatement(symbol: string, periods = 4): Promise<ApiResponse<unknown>> {
    return this.cachedGet('/financials/income-statement', { symbol, periods }, 'market');
  }

  async getCashFlow(symbol: string, periods = 4): Promise<ApiResponse<unknown>> {
    return this.cachedGet('/financials/cash-flow', { symbol, periods }, 'market');
  }

  // ==================== 社会/社区 ====================

  async getSocialComments(params: Record<string, unknown> = {}): Promise<ApiResponse<unknown>> {
    return this.cachedGet('/social/comments', params, 'default');
  }

  async getSocialUsers(params: Record<string, unknown> = {}): Promise<ApiResponse<unknown>> {
    return this.cachedGet('/social/users', params, 'default');
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
// 经过 apiService 拦截器的请求（自动重试 + 日志 + 缓存 + 响应拦截器）

async function rawGet<T = unknown>(url: string): Promise<T> {
  const response = await apiService.get<T>(url);
  return (response as any).data ?? response;
}

export async function fetchOrderBook(symbol: string, name?: string) {
  const params = name ? `?name=${encodeURIComponent(name)}` : '';
  return rawGet(`/api/order-book/${symbol}${params}`);
}

export async function fetchTimeShare(symbol: string) {
  return rawGet(`/api/time-share/${symbol}`);
}

// ==================== 融资融券 ====================

export async function fetchMarginOverview() {
  return rawGet('/api/margin/overview');
}

export async function fetchMarginData(symbol: string, days = 30) {
  return rawGet(`/api/margin/${symbol}?days=${days}`);
}

export async function fetchMarginRank(type: string, count = 20): Promise<MarginRankEntry[]> {
  const result = await rawGet<{ rank: MarginRankEntry[] }>(`/api/margin/rank/${type}?count=${count}`);
  return result.rank;
}

export async function fetchMarginOverviewTyped(): Promise<MarginOverview & { dataSource?: string; notes?: string }> {
  return rawGet<MarginOverview & { dataSource?: string; notes?: string }>('/api/margin/overview');
}

export interface MarginTrendResp {
  records: MarginTradingData[];
  dataSource: string;
  notes?: string;
}
export async function fetchMarginTrend(days = 30): Promise<MarginTrendResp> {
  return rawGet<MarginTrendResp>(`/api/margin/trend?days=${days}`);
}

export async function fetchTopTraderOverviewTyped(date?: string): Promise<TopTraderOverview> {
  const params = date ? `?date=${date}` : '';
  return rawGet<TopTraderOverview>(`/api/top-traders/overview${params}`);
}

// ==================== 龙虎榜 ====================

export async function fetchTopTraderOverview(date?: string) {
  const params = date ? `?date=${date}` : '';
  return rawGet(`/api/top-traders/overview${params}`);
}

export async function fetchTopTraderDetail(symbol: string, name?: string) {
  const params = name ? `?name=${encodeURIComponent(name)}` : '';
  return rawGet(`/api/top-traders/${symbol}${params}`);
}

export async function fetchTopTraderHistory(symbol: string, days = 10) {
  return rawGet(`/api/top-traders/history/${symbol}?days=${days}`);
}

export async function fetchTopTraderSeatRank(count = 20): Promise<SeatRankEntry[] | undefined> {
  const result = await rawGet<{ rank: SeatRankEntry[] }>(`/api/top-traders/seat/rank?count=${count}`);
  if (!Array.isArray(result?.rank)) return undefined;
  return result.rank;
}

// ==================== 大宗交易 ====================

export async function fetchBlockTrades(params: { date?: string; symbol?: string; page?: number; pageSize?: number } = {}) {
  const query = new URLSearchParams();
  if (params.date) query.set('date', params.date);
  if (params.symbol) query.set('symbol', params.symbol);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  return rawGet(`/api/block-trades?${query}`);
}

export async function fetchBlockTradeOverview() {
  return rawGet('/api/block-trades/overview');
}

export async function fetchBlockTradeHistory(symbol: string, days = 30) {
  return rawGet(`/api/block-trades/${symbol}?days=${days}`);
}

// ==================== 股东增减持 ====================

export async function fetchShareholderChanges(params: { symbol?: string; type?: string; page?: number; pageSize?: number } = {}) {
  const query = new URLSearchParams();
  if (params.symbol) query.set('symbol', params.symbol);
  if (params.type) query.set('type', params.type);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  return rawGet(`/api/shareholder-changes?${query}`);
}

export async function fetchShareholderChangeOverview() {
  return rawGet('/api/shareholder-changes/overview');
}

export async function fetchShareholderChangeHistory(symbol: string, days = 90) {
  return rawGet(`/api/shareholder-changes/${symbol}?days=${days}`);
}

// ==================== 限售股解禁 ====================

export async function fetchLockupCalendar(year?: number, month?: number) {
  const now = new Date();
  const params = new URLSearchParams({
    year: String(year || now.getFullYear()),
    month: String(month || now.getMonth() + 1),
  });
  return rawGet(`/api/lockup/calendar?${params}`);
}

export async function fetchLockupRank(year?: number, month?: number) {
  const now = new Date();
  const params = new URLSearchParams({
    year: String(year || now.getFullYear()),
    month: String(month || now.getMonth() + 1),
  });
  return rawGet(`/api/lockup/rank?${params}`);
}

export async function fetchLockupHistory(symbol: string, months = 12) {
  return rawGet(`/api/lockup/${symbol}?months=${months}`);
}

// ==================== AI 智能选股 ====================

export async function fetchAIRecommendations(strategy?: string) {
  const params = strategy ? `?strategy=${strategy}` : '';
  return rawGet(`/api/ai/recommendations${params}`);
}

export async function fetchAIDiagnosis(symbol: string) {
  return rawGet(`/api/ai/diagnose/${symbol}`);
}

export async function fetchAISectorRotation() {
  return rawGet('/api/ai/sector-rotation');
}

export async function fetchAIAlertSuggestions() {
  return rawGet('/api/ai/alert-suggestions');
}
