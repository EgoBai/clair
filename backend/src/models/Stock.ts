/**
 * 股票数据模型
 * 定义股票相关的数据结构和业务逻辑
 */

export interface Stock {
  id: number;
  symbol: string;           // 股票代码 (如: 000001.SZ)
  name: string;            // 股票名称
  fullName?: string;       // 全称
  market: string;          // 市场 (SZ/SH/BJ)
  industry?: string;       // 行业
  subIndustry?: string;    // 子行业
  area?: string;          // 地区
  listingDate?: Date;     // 上市日期
  totalShares?: number;   // 总股本
  circulatingShares?: number; // 流通股本
  isActive: boolean;      // 是否活跃
  createdAt: Date;
  updatedAt: Date;
}

export interface DailyQuote {
  id: number;
  stockId: number;
  tradeDate: Date;        // 交易日期
  openPrice: number;      // 开盘价
  closePrice: number;     // 收盘价
  highPrice: number;      // 最高价
  lowPrice: number;       // 最低价
  volume: number;         // 成交量 (股)
  turnover: number;       // 成交额 (元)
  change: number;         // 涨跌额
  changePercent: number;  // 涨跌幅 (%)
  amplitude: number;      // 振幅 (%)
  turnoverRate: number;   // 换手率 (%)
  peRatio?: number;       // 市盈率
  pbRatio?: number;       // 市净率
  marketCap?: number;     // 总市值
  circulatingMarketCap?: number; // 流通市值
  createdAt: Date;
  updatedAt: Date;
}

export interface MinuteQuote {
  id: number;
  stockId: number;
  quoteTime: Date;        // 行情时间
  price: number;          // 当前价
  volume: number;         // 成交量
  turnover: number;       // 成交额
  avgPrice: number;       // 均价
  bidPrice1?: number;     // 买一价
  bidVolume1?: number;    // 买一量
  askPrice1?: number;     // 卖一价
  askVolume1?: number;    // 卖一量
  createdAt: Date;
}

export interface FinancialIndicator {
  id: number;
  stockId: number;
  reportDate: Date;       // 报告期
  reportType: string;     // 报告类型 (Q1/Q2/Q3/Annual)
  totalRevenue?: number;  // 营业收入
  netProfit?: number;     // 净利润
  eps?: number;           // 每股收益
  roe?: number;           // 净资产收益率
  grossMargin?: number;   // 毛利率
  netMargin?: number;     // 净利率
  totalAssets?: number;   // 总资产
  totalLiabilities?: number; // 总负债
  equity?: number;        // 净资产
  operatingCashFlow?: number; // 经营现金流
  createdAt: Date;
  updatedAt: Date;
}

export interface TechnicalIndicator {
  id: number;
  stockId: number;
  calcDate: Date;         // 计算日期
  ma5?: number;           // 5日均线
  ma10?: number;          // 10日均线
  ma20?: number;          // 20日均线
  ma60?: number;          // 60日均线
  rsi?: number;           // RSI指标
  macd?: number;          // MACD
  macdSignal?: number;    // MACD信号线
  macdHistogram?: number; // MACD柱状图
  kdjK?: number;          // KDJ K值
  kdjD?: number;          // KDJ D值
  kdjJ?: number;          // KDJ J值
  bollUpper?: number;     // 布林上轨
  bollMiddle?: number;    // 布林中轨
  bollLower?: number;     // 布林下轨
  createdAt: Date;
}

export interface StockWithQuotes extends Stock {
  latestQuote?: DailyQuote;
  technicalIndicators?: TechnicalIndicator[];
  financialIndicators?: FinancialIndicator[];
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

export interface StockQuoteParams {
  symbol: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export interface MarketSummary {
  date: Date;
  totalStocks: number;
  totalMarketCap: number;
  avgPeRatio: number;
  avgPbRatio: number;
  risingStocks: number;
  fallingStocks: number;
  unchangedStocks: number;
  totalVolume: number;
  totalTurnover: number;
  shanghaiIndex?: MarketIndex;
  shenzhenIndex?: MarketIndex;
 创业板指数?: MarketIndex;
 科创板指数?: MarketIndex;
}

export interface MarketIndex {
  symbol: string;
  name: string;
  close: number;
  change: number;
  changePercent: number;
  volume: number;
  turnover: number;
}

export interface IndustryPerformance {
  industry: string;
  avgChangePercent: number;
  totalMarketCap: number;
  stockCount: number;
  topPerformers: StockPerformance[];
}

export interface StockPerformance {
  symbol: string;
  name: string;
  changePercent: number;
  volume: number;
  turnover: number;
}

// 数据验证函数
export function validateStockSymbol(symbol: string): boolean {
  const pattern = /^(\d{6})\.(SZ|SH|BJ)$/;
  return pattern.test(symbol);
}

export function validateMarket(market: string): boolean {
  return ['SZ', 'SH', 'BJ'].includes(market);
}

export function formatStockSymbol(symbol: string): string {
  if (!validateStockSymbol(symbol)) {
    throw new Error(`Invalid stock symbol: ${symbol}`);
  }
  return symbol;
}

export function parseStockSymbol(symbol: string): { code: string; market: string } {
  const match = symbol.match(/^(\d{6})\.(SZ|SH|BJ)$/);
  if (!match) {
    throw new Error(`Invalid stock symbol format: ${symbol}`);
  }
  return {
    code: match[1],
    market: match[2]
  };
}

// 工具函数
export function calculateChange(close: number, prevClose: number): { change: number; changePercent: number } {
  const change = close - prevClose;
  const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;
  return { change, changePercent };
}

export function calculateAmplitude(high: number, low: number, prevClose: number): number {
  if (prevClose === 0) return 0;
  return ((high - low) / prevClose) * 100;
}

export function calculateTurnoverRate(volume: number, circulatingShares: number): number {
  if (circulatingShares === 0) return 0;
  return (volume / circulatingShares) * 100;
}

// 默认值
export const DEFAULT_STOCK: Partial<Stock> = {
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

export const DEFAULT_DAILY_QUOTE: Partial<DailyQuote> = {
  createdAt: new Date(),
  updatedAt: new Date()
};

// 导出类型集合
export type {
  Stock,
  DailyQuote,
  MinuteQuote,
  FinancialIndicator,
  TechnicalIndicator,
  StockWithQuotes,
  StockSearchParams,
  StockQuoteParams,
  MarketSummary,
  MarketIndex,
  IndustryPerformance,
  StockPerformance
};