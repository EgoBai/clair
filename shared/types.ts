/**
 * 共享类型定义
 * 前后端共用的核心数据类型
 */

// ==================== 股票基础类型 ====================

export interface Stock {
  id: number;
  symbol: string;
  name: string;
  fullName?: string;
  market: 'SH' | 'SZ' | 'BJ';
  industry?: string;
  subIndustry?: string;
  area?: string;
  listingDate?: string;
  totalShares?: number;
  circulatingShares?: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
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
  createdAt?: string;
  updatedAt?: string;
}

export interface StockWithQuote extends Stock {
  latestQuote?: DailyQuote;
}

// ==================== 技术指标 ====================

export interface TechnicalIndicator {
  tradeDate: string;
  ma5?: number;
  ma10?: number;
  ma20?: number;
  ma60?: number;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHistogram?: number;
  kdjK?: number;
  kdjD?: number;
  kdjJ?: number;
  bollUpper?: number;
  bollMiddle?: number;
  bollLower?: number;
}

// ==================== 市场数据 ====================

export interface MarketSummary {
  date: string;
  totalStocks: number;
  totalMarketCap: number;
  totalVolume: number;
  totalTurnover: number;
  risingStocks: number;
  fallingStocks: number;
  unchangedStocks: number;
  industryPerformance: IndustryPerformance[];
}

export interface IndustryPerformance {
  industry: string;
  avgChangePercent: number;
  totalMarketCap: number;
  stockCount: number;
  totalVolume?: number;
  totalTurnover?: number;
}

export interface MarketIndex {
  symbol: string;
  name: string;
  close: number;
  change: number;
  changePercent: number;
}

// ==================== K线数据 ====================

export interface KLineData {
  tradeDate: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  turnover: number;
}

// ==================== API 响应类型 ====================

export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  error?: string;
  details?: string;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface PaginatedData<T> {
  stocks: T[];
  pagination: PaginationInfo;
}

// ==================== 搜索参数 ====================

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

// ==================== 财务指标 ====================

export interface FinancialIndicator {
  stockId: number;
  reportDate: string;
  reportType: 'Q1' | 'Q2' | 'Q3' | 'Annual';
  totalRevenue?: number;
  netProfit?: number;
  eps?: number;
  roe?: number;
  grossMargin?: number;
  netMargin?: number;
  totalAssets?: number;
  totalLiabilities?: number;
  equity?: number;
  operatingCashFlow?: number;
}

// ==================== 用户相关 ====================

export interface User {
  id: number;
  username: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
  isActive: boolean;
  isAdmin: boolean;
  lastLogin?: string;
}

export interface WatchlistItem {
  stock: StockWithQuote;
  addedAt: string;
  notes?: string;
}

// ==================== 预警规则 ====================

export interface AlertRule {
  id: number;
  userId: number;
  stockId: number;
  ruleType: 'price' | 'volume' | 'change' | 'technical';
  conditionType: 'above' | 'below' | 'cross';
  threshold: number;
  isActive: boolean;
}
