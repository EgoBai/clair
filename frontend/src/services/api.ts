/**
 * API 调用封装
 * 统一管理所有后端API请求
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { message } from 'antd';

// API 响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  error?: string;
  details?: string;
}

export interface PaginatedResponse<T> {
  stocks: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface StockInfo {
  id: number;
  symbol: string;
  name: string;
  market: string;
  industry?: string;
  isActive: boolean;
}

export interface DailyQuote {
  id: number;
  stockId: number;
  tradeDate: string;
  openPrice: number;
  closePrice: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  turnover: number;
  change: number;
  changePercent: number;
  amplitude: number;
  turnoverRate: number;
  peRatio?: number;
  pbRatio?: number;
  marketCap?: number;
  circulatingMarketCap?: number;
}

export interface StockWithQuote extends StockInfo {
  latestQuote?: DailyQuote;
}

export interface MarketSummary {
  date: string;
  totalStocks: number;
  totalMarketCap: number;
  totalVolume: number;
  totalTurnover: number;
  risingStocks: number;
  fallingStocks: number;
  unchangedStocks: number;
  industryPerformance: any[];
}

export interface IndustryPerformance {
  industry: string;
  avgChangePercent: number;
  totalMarketCap: number;
  stockCount: number;
}

export interface StockSearchParams {
  symbol?: string;
  name?: string;
  market?: string;
  industry?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface QuoteParams {
  startDate?: string;
  endDate?: string;
  limit?: number;
}

// API 配置
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const REQUEST_TIMEOUT = 15000;

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: REQUEST_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // 请求拦截器
    this.client.interceptors.request.use(
      (config) => {
        // 可在此添加认证token等
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // 响应拦截器
    this.client.interceptors.response.use(
      (response: AxiosResponse<ApiResponse>) => {
        if (!response.data.success) {
          const errorMsg = response.data.error || '请求失败';
          message.error(errorMsg);
          return Promise.reject(new Error(errorMsg));
        }
        return response;
      },
      (error) => {
        const errorMsg = error.response?.data?.error || error.message || '网络请求失败';
        message.error(errorMsg);
        return Promise.reject(error);
      }
    );
  }

  /**
   * 获取股票列表
   */
  async getStocks(params: StockSearchParams = {}): Promise<ApiResponse<PaginatedResponse<StockWithQuote>>> {
    const response = await this.client.get('/stocks', { params });
    return response.data;
  }

  /**
   * 获取单只股票详情
   */
  async getStock(symbol: string): Promise<ApiResponse<StockWithQuote>> {
    const response = await this.client.get(`/stocks/${symbol}`);
    return response.data;
  }

  /**
   * 获取股票日行情
   */
  async getStockQuotes(symbol: string, params: QuoteParams = {}): Promise<ApiResponse<{ stock: { symbol: string; name: string }; quotes: DailyQuote[] }>> {
    const response = await this.client.get(`/stocks/${symbol}/quotes`, { params });
    return response.data;
  }

  /**
   * 获取最新行情
   */
  async getLatestQuote(symbol: string): Promise<ApiResponse<StockWithQuote>> {
    const response = await this.client.get(`/stocks/${symbol}/latest`);
    return response.data;
  }

  /**
   * 批量获取股票行情
   */
  async batchGetQuotes(symbols: string[]): Promise<ApiResponse<{ stocks: StockWithQuote[]; count: number }>> {
    const response = await this.client.post('/stocks/batch/quotes', { symbols });
    return response.data;
  }

  /**
   * 获取市场概况
   */
  async getMarketSummary(date?: string): Promise<ApiResponse<MarketSummary>> {
    const params = date ? { date } : {};
    const response = await this.client.get('/market/summary', { params });
    return response.data;
  }

  /**
   * 获取行业表现
   */
  async getIndustryPerformance(date?: string): Promise<ApiResponse<{ date: string; industries: IndustryPerformance[] }>> {
    const params = date ? { date } : {};
    const response = await this.client.get('/market/industries', { params });
    return response.data;
  }

  /**
   * 获取涨幅榜
   */
  async getTopGainers(date?: string, limit: number = 10): Promise<ApiResponse<{ date: string; topGainers: any[] }>> {
    const params: any = { limit };
    if (date) params.date = date;
    const response = await this.client.get('/market/top-gainers', { params });
    return response.data;
  }

  /**
   * 获取跌幅榜
   */
  async getTopLosers(date?: string, limit: number = 10): Promise<ApiResponse<{ date: string; topLosers: any[] }>> {
    const params: any = { limit };
    if (date) params.date = date;
    const response = await this.client.get('/market/top-losers', { params });
    return response.data;
  }

  /**
   * 获取成交额榜
   */
  async getTopTurnover(date?: string, limit: number = 10): Promise<ApiResponse<{ date: string; topTurnover: any[] }>> {
    const params: any = { limit };
    if (date) params.date = date;
    const response = await this.client.get('/market/top-turnover', { params });
    return response.data;
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', { baseURL: '' });
      return response.data.status === 'healthy';
    } catch {
      return false;
    }
  }
}

// 单例导出
export const apiService = new ApiService();

// 导出便捷方法
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
