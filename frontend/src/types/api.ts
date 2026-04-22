// API响应类型定义

// 基础响应结构
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
}

// 股票基础信息
export interface Stock {
  id: number;
  symbol: string;
  name: string;
  market: string;
  industry?: string;
  is_active: boolean;
}

// 股票报价 (snake_case for API)
export interface StockQuote {
  id: number;
  stock_id: number;
  trade_date: string;
  open_price: number;
  close_price: number;
  high_price: number;
  low_price: number;
  change_percent: number;
  volume: number;
  turnover: number;
  market_cap: number;
}

// 股票报价 (camelCase for component)
export interface StockQuoteCamel {
  id: number;
  stockId: number;
  tradeDate: string;
  openPrice: number;
  closePrice: number;
  highPrice: number;
  lowPrice: number;
  changePercent: number;
  volume: number;
  turnover: number;
  marketCap: number;
}

// 带报价的股票 (snake_case for API)
export interface StockWithQuote extends Stock {
  latest_quote?: StockQuote;
}

// 带报价的股票 (camelCase for component)
export interface StockWithQuoteCamel extends Stock {
  latestQuote?: StockQuoteCamel;
}

// 转换工具函数
export function toCamelCase<T>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T;
  if (Array.isArray(obj)) {
    return obj.map(item => toCamelCase(item)) as T;
  }
  if (typeof obj !== 'object') return obj as T;
  
  const result: Record<string, unknown> = {};
  for (const key in obj as Record<string, unknown>) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
      result[camelKey] = toCamelCase((obj as Record<string, unknown>)[key]);
    }
  }
  return result as T;
}

export function toSnakeCase<T>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T;
  if (Array.isArray(obj)) {
    return obj.map(item => toSnakeCase(item)) as T;
  }
  if (typeof obj !== 'object') return obj as T;
  
  const result: Record<string, unknown> = {};
  for (const key in obj as Record<string, unknown>) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const snakeKey = key.replace(/[A-Z]/g, (letter: string) => `_${letter.toLowerCase()}`);
      result[snakeKey] = toSnakeCase((obj as Record<string, unknown>)[key]);
    }
  }
  return result as T;
}

// 市场摘要 (snake_case for API)
export interface MarketSummary {
  date: string;
  total_stocks: number;
  total_market_cap: number;
  total_volume: number;
  total_turnover: number;
  rising_stocks: number;
  falling_stocks: number;
  unchanged_stocks: number;
  // camelCase aliases (used by some components)
  rising?: number;
  falling?: number;
  flat?: number;
  limitUp?: number;
  limitDown?: number;
  totalAmount?: number;
  northboundFlow?: number;
  avgChange?: number;
}

// 市场摘要 (camelCase for component)
export interface MarketSummaryCamel {
  date: string;
  totalStocks: number;
  totalMarketCap: number;
  totalVolume: number;
  totalTurnover: number;
  risingStocks: number;
  fallingStocks: number;
  unchangedStocks: number;
}

// 搜索响应
export interface SearchResponse {
  results: Stock[];
  query: string;
  total: number;
}

// 股票详情响应
export interface StockDetailResponse {
  stock: Stock;
  quotes: StockQuote[];
  statistics?: {
    avg_volume: number;
    avg_turnover: number;
    volatility: number;
  };
}

// 市场排行榜
export interface MarketRankResponse {
  gainers: StockWithQuote[];
  losers: StockWithQuote[];
  active: StockWithQuote[];
}