/**
 * 共享类型定义
 * 前后端共用的核心数据类型
 */

// ==================== 数据新鲜度契约 (F01) ====================

/**
 * 数据来源状态
 * - live        本次实时拉取上游成功
 * - stale       上游失败，用了数据库历史缓存（updatedAt 为缓存时间）
 * - unavailable 彻底没数据（error 给可读原因）
 */
export type DataSourceStatus = 'live' | 'stale' | 'unavailable';

/**
 * 统一附加在 sectors / industries 系列 API 响应 data 上的兄弟字段。
 * 现有字段原样保留，meta 为**新增**字段，前端可安全按需读取。
 */
export interface ResponseMeta {
  source: DataSourceStatus;
  /** ISO8601；unavailable 时为 null */
  updatedAt: string | null;
  /** 仅 stale / unavailable 时出现，人类可读原因 */
  error?: string;
}

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
  // Additional fields used by dashboard components
  rising?: number;
  falling?: number;
  flat?: number;
  limitUp?: number;
  limitDown?: number;
  totalAmount?: number;
  northboundFlow?: number;
  avgChange?: number;
  indices?: Array<{ symbol: string; name: string; close_price: number; change_percent: number }>;
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

// ==================== 数据新鲜度与缓存策略 ====================

/**
 * 数据类别 — 决定缓存 TTL 的语义标签
 *
 * - quote:   实时行情（价格、指数、涨跌幅） → TTL 5s
 * - quote:     行情数据、实时报价            → TTL 5s
 * - market:    市场总览、板块表现、新闻统计   → TTL 60s
 * - financial: 财务数据、研报、基本面分析    → TTL 300s
 * - default:   其他通用数据                  → TTL 30s
 */
export type DataCategory = 'quote' | 'market' | 'financial' | 'default';

/** 缓存策略 TTL 常量（毫秒） */
export const CACHE_TTL: Record<DataCategory, number> = {
  quote: 5_000,        // 5秒：行情数据
  market: 60_000,      // 60秒：市场总览/板块/新闻统计
  financial: 300_000,  // 5分钟：财务/研报
  default: 30_000,     // 30秒：通用数据
} as const;

/**
 * 数据新鲜度元信息 — 附加在 ApiResponse 上
 * 所有数据卡片应展示 `updatedAt` 时间戳
 */
export interface DataFreshness {
  /** ISO 8601 UTC 时间戳 — 数据获取/缓存时间 */
  updatedAt: string;
  /** 数据类别（决定 TTL） */
  category: DataCategory;
  /** 剩余有效时间（毫秒）— 消费方可据此判断是否即将过期 */
  remainingTTL: number;
  /** 数据是否来自缓存 */
  fromCache: boolean;
}

// ==================== API 响应类型 ====================

export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  error?: string;
  details?: string;
  /** 缓存元信息 — 由前端缓存层注入，后端不返回此字段 */
  _cacheMeta?: DataFreshness;
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

export type AlertType = 'price_above' | 'price_below' | 'change_above' | 'change_below' | 'volume_surge';

export interface AlertRule {
  id: number;
  userId: number;
  symbol: string;
  alertType: AlertType;
  threshold: number;
  isActive: boolean;
  isTriggered: boolean;
  triggeredAt?: string;
  triggeredValue?: number;
  message?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlertHistoryEntry {
  id: number;
  alertId: number;
  symbol: string;
  alertType: string;
  threshold: number;
  actualValue: number;
  triggeredAt: string;
  message: string;
}

export interface AlertStats {
  total: number;
  active: number;
  triggered: number;
  byType: Record<string, number>;
  historyCount: number;
}

// ==================== 选股器 ====================

export interface ScreenerCondition {
  field: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'between' | 'in';
  value: number | string | [number, number] | string[];
}

export interface ScreenerTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  conditions: ScreenerCondition[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export interface ScreenerResult {
  stocks: ScreenerStock[];
  pagination: PaginationInfo;
}

export interface ScreenerStock {
  id: number;
  symbol: string;
  name: string;
  market: string;
  industry?: string;
  price: number;
  changePercent: number;
  volume: number;
  turnover: number;
  turnoverRate: number;
  peRatio?: number | null;
  pbRatio?: number | null;
  marketCap?: number | null;
  circulatingMarketCap?: number | null;
  amplitude?: number | null;     // 振幅
}

// ==================== 市场情绪 ====================

export interface MarketSentiment {
  date: string;
  riseCount: number;
  fallCount: number;
  flatCount: number;
  limitUp: number;
  limitDown: number;
  avgChangePercent: number;
  totalTurnover: number;
  turnoverRate: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  sentimentScore: number; // -100 ~ 100
}

// ==================== 回测系统 ====================

export type StrategyType = 'ma_cross' | 'rsi' | 'macd' | 'boll' | 'custom';

export interface BacktestTrade {
  date: string;
  type: 'buy' | 'sell';
  price: number;
  quantity: number;
  amount: number;
  commission: number;
  reason: string;
  signal: string;
}

export interface BacktestResult {
  strategy: StrategyType;
  params: Record<string, any>;
  symbol: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  initialCapital: number;
  finalValue: number;
  totalReturn: number;
  annualizedReturn: number;
  benchmarkReturn: number;
  maxDrawdown: number;
  maxDrawdownDate: string;
  sharpeRatio: number;
  sortinoRatio: number;
  volatility: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  trades: BacktestTrade[];
  equityCurve: { date: string; value: number }[];
  drawdownCurve: { date: string; drawdown: number }[];
}

// ==================== 投资组合 ====================

export interface PortfolioPosition {
  id: number;
  portfolioId: number;
  symbol: string;
  name: string;
  quantity: number;
  costPrice: number;
  currentPrice: number;
  marketValue: number;
  costTotal: number;
  profit: number;
  profitPercent: number;
  weight: number;
  buyDate: string;
  notes: string;
  updatedAt: string;
}

export interface Portfolio {
  id: number;
  name: string;
  description: string;
  totalCost: number;
  totalMarketValue: number;
  totalProfit: number;
  totalProfitPercent: number;
  cashBalance: number;
  totalValue: number;
  positionCount: number;
  positions: PortfolioPosition[];
  allocation: { name: string; value: number; weight: number }[];
  createdAt: string;
}

// ==================== 新闻资讯 ====================

export type NewsCategory = 'market' | 'company' | 'policy' | 'global' | 'analysis';
export type NewsSentiment = 'positive' | 'negative' | 'neutral';

export interface NewsItem {
  id: number;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishTime: string;
  category: NewsCategory;
  sentiment: NewsSentiment;
  sentimentScore: number;
  relatedSymbols: string[];
  tags: string[];
  viewCount: number;
}

// ==================== 除权除息 ====================

export type DividendType = 'cash' | 'bonus' | 'capital_reserve' | 'mixed' | 'rights_issue' | 'split';

export interface ExRightsEvent {
  id: string;
  symbol: string;
  announceDate: string;
  exRightsDate: string;
  type: DividendType;
  cashDividendPerShare: number;
  bonusSharesPerShare: number;
  capitalReservePerShare: number;
  taxRate: number;
  description: string;
}

export interface AdjustedKLine extends KLineData {
  originalOpen: number;
  originalClose: number;
  originalHigh: number;
  originalLow: number;
  adjustmentFactor: number;
  adjustmentType: 'forward' | 'backward' | 'none';
}

// ==================== AI 分析 ====================

export type SentimentType = 'bullish' | 'bearish' | 'neutral';

export interface MarketCommentary {
  id: string;
  date: string;
  type: 'daily_summary' | 'sector_analysis' | 'stock_comment' | 'market_outlook';
  title: string;
  summary: string;
  sections: { heading: string; content: string; dataPoints: { label: string; value: number | string; change?: number; unit?: string }[] }[];
  keywords: string[];
  sentiment: SentimentType;
  confidence: number;
  generatedAt: string;
}

export interface StopLossRecommendation {
  symbol: string;
  currentPrice: number;
  suggestedStopLoss: number;
  suggestedTakeProfit: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  riskRewardRatio: number;
  method: 'atr' | 'support_resistance' | 'moving_average' | 'percent';
  reasoning: string;
  confidence: number;
}

export interface SectorRotationPrediction {
  sector: string;
  currentPhase: 'accumulation' | 'markup' | 'distribution' | 'decline';
  predictedDirection: 'rotate_in' | 'rotate_out' | 'hold';
  strength: number;
  timeframe: string;
  catalysts: string[];
  risks: string[];
  analysis: string;
}

// ==================== 离线模式 ====================

export type NetworkStatus = 'online' | 'offline' | 'reconnecting';

export interface OfflineAction {
  id: string;
  type: 'add_watchlist' | 'remove_watchlist' | 'set_alert' | 'update_portfolio';
  payload: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

export interface CacheEntry<T = unknown> {
  key: string;
  data: T;
  timestamp: number;
  ttl: number;
  version: number;
}

// ==================== 盘口数据 ====================

export interface OrderBookLevel {
  price: number;
  volume: number;
  amount: number;
  orderCount?: number;
}

export interface OrderBook {
  symbol: string;
  name: string;
  timestamp: string;
  lastPrice: number;
  change: number;
  changePercent: number;
  bids: OrderBookLevel[];   // 买一~买五
  asks: OrderBookLevel[];   // 卖一~卖五
  totalBidVolume: number;
  totalAskVolume: number;
  bidAskRatio: number;      // 委比
  amplitude: number;        // 振幅
}

export interface TimeShareData {
  time: string;
  price: number;
  volume: number;
  avgPrice: number;
  change: number;
}

// ==================== 融资融券 ====================

export interface MarginTradingData {
  symbol: string;
  name: string;
  tradeDate: string;
  financingBalance: number;       // 融资余额
  financingBuyAmount: number;     // 融资买入额
  financingRepayAmount: number;   // 融资偿还额
  financingNetBuy: number;        // 融资净买入
  securitiesBalance: number;      // 融券余量(股)
  securitiesSellAmount: number;   // 融券卖出量
  securitiesRepayAmount: number;  // 融券偿还量
  securitiesNetSell: number;      // 融券净卖出
  totalBalance: number;           // 融资融券余额
  financingRatio: number;         // 融资余额占流通市值比
}

export interface MarginOverview {
  totalFinancingBalance: number;
  totalSecuritiesBalance: number;
  financingStockCount: number;
  securitiesStockCount: number;
  topFinancingIncrease: Array<{ symbol: string; name: string; change: number }>;
  topSecuritiesIncrease: Array<{ symbol: string; name: string; change: number }>;
}

// ==================== 龙虎榜 ====================

export interface TopTraderEntry {
  rank: number;
  seatName: string;           // 营业部/机构名称
  buyAmount: number;          // 买入金额
  sellAmount: number;         // 卖出金额
  netAmount: number;          // 净买入
  symbol?: string;            // 个股龙虎榜时有值
  name?: string;
  reason?: string;            // 上榜原因
  isOrganizational: boolean;  // 是否机构席位
}

export interface TopTraderRecord {
  symbol: string;
  name: string;
  tradeDate: string;
  closePrice: number;
  changePercent: number;
  turnover: number;
  reason: string;             // 上榜原因
  buyTotal: number;           // 买入总额
  sellTotal: number;          // 卖出总额
  netTotal: number;           // 净买入总额
  entries: TopTraderEntry[];  // 前五买入/卖出席位
}

export interface TopTraderOverview {
  tradeDate: string;
  totalStocks: number;
  buyDominantCount: number;   // 买入席位占优数量
  sellDominantCount: number;  // 卖出席位占优数量
  totalBuyAmount: number;
  totalSellAmount: number;
  totalNetAmount: number;
  topBuyStocks: Array<{ symbol: string; name: string; netAmount: number; reason: string }>;
  topSellStocks: Array<{ symbol: string; name: string; netAmount: number; reason: string }>;
  industryDistribution: Record<string, number>;
}

export interface SeatRankEntry {
  rank: number;
  seatName: string;
  totalBuyAmount: number;
  totalSellAmount: number;
  netAmount: number;
  appearCount: number;
  isOrganizational: boolean;
}

export interface MarginRankEntry {
  rank: number;
  symbol: string;
  name: string;
  financingBalance: number;
  financingChange: number;
  securitiesBalance: number;
  securitiesChange: number;
}

// ==================== 股东持股 ====================

export interface ShareholderInfo {
  rank: number;
  name: string;
  shares: number;
  percent: number;
  changeType?: 'increase' | 'decrease' | 'unchanged' | 'new';
  changeShares?: number;
  isOrganizational: boolean;
}

export interface TopShareholders {
  symbol: string;
  name: string;
  reportDate: string;
  totalShares: number;
  circulatingShares: number;
  topTenTotalPercent: number;
  shareholders: ShareholderInfo[];
  changeFromLast?: {
    totalHolders: number;
    avgSharesPerHolder: number;
    concentrationChange: number;
  };
}

// ==================== 大宗交易 ====================

export interface BlockTrade {
  id: number;
  symbol: string;
  name: string;
  tradeDate: string;
  price: number;
  closePrice: number;
  volume: number;
  amount: number;
  discount: number; // 折溢价率 正=溢价 负=折价
  buyer: string;
  seller: string;
  buyerSeat?: string;
  sellerSeat?: string;
}

export interface BlockTradeSummary {
  totalAmount: number;
  totalVolume: number;
  avgDiscount: number;
  premiumCount: number;
  discountCount: number;
  tradeCount: number;
}

// ==================== 股东增减持 ====================

export interface ShareholderChange {
  id: number;
  symbol: string;
  name: string;
  shareholderName: string;
  shareholderType: 'institution' | 'individual';
  changeType: 'increase' | 'decrease' | 'new' | 'exit';
  heldShares: number;
  changeShares: number;
  heldPercent: number;
  changePercent: number;
  announceDate: string;
  source: string;
}

// ==================== 限售股解禁 ====================

export interface LockupExpiry {
  id: number;
  symbol: string;
  name: string;
  expiryDate: string;
  lockupType: '首发原股东限售' | '定向增发机构配售' | '股权激励限售' | '追加承诺限售';
  shareholder: string;
  totalShares: number;
  circulatingBefore: number;
  unlockRatio: number; // 占流通股比例 %
  marketValue: number;
  price: number;
  actualCirculating: number;
}

// ==================== AI 智能选股 ====================

export interface AIStockRecommendation {
  symbol: string;
  name: string;
  score: number;
  reason: string;
  price: number;
  changePercent: number;
}

export interface AIStrategyRecommendation {
  strategy: 'value' | 'growth' | 'technical' | 'momentum' | 'contrarian';
  name: string;
  description: string;
  stocks: AIStockRecommendation[];
  updatedAt: string;
}

export interface AIDiagnosis {
  symbol: string;
  totalScore: number;
  rating: '强烈推荐' | '推荐' | '中性' | '谨慎';
  dimensions: Array<{ name: string; score: number; weight: number }>;
  strengths: string[];
  risks: string[];
  suggestion: string;
}

export interface SectorRotationItem {
  name: string;
  code: string;
  phase: '吸筹' | '主升' | '派发' | '下跌';
  momentum: number;
  trend: '流入' | '流出' | '持有';
}

export interface AlertSuggestion {
  type: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  stocks: string[];
  condition: string;
}

// ==================== API 数据解析工具 ====================

/**
 * 将API返回的snake_case数据转为camelCase
 * 兼容两种格式：{ close_price: "77.50" } 和 { closePrice: 77.50 }
 */
export function parseStockData(raw: any): ScreenerStock {
  // 兼容两种格式: 本地后端(flat snake_case) 和 Cloudflare Worker(latestQuote camelCase)
  const q = raw.latestQuote || raw.latest_quote || {};
  return {
    id: raw.id,
    symbol: raw.symbol || '',
    name: (raw.name || '').trim(),
    market: raw.market || '',
    industry: raw.industry || '',
    price: Number(raw.close_price ?? raw.closePrice ?? q.closePrice ?? q.close_price ?? raw.price ?? raw.current_price ?? 0),
    changePercent: Number(raw.change_percent ?? raw.changePercent ?? q.changePercent ?? q.change_percent ?? 0),
    volume: Number(raw.volume ?? q.volume ?? 0),
    turnover: Number(raw.turnover ?? q.turnover ?? 0),
    turnoverRate: Number(raw.turnover_rate ?? raw.turnoverRate ?? q.turnoverRate ?? q.turnover_rate ?? 0),
    amplitude: Number(raw.amplitude ?? q.amplitude ?? 0),
    peRatio: Number(raw.pe_ratio ?? raw.pe ?? raw.peRatio ?? q.peRatio ?? q.pe_ratio ?? 0) || null,
    pbRatio: Number(raw.pb_ratio ?? raw.pb ?? raw.pbRatio ?? q.pbRatio ?? q.pb_ratio ?? 0) || null,
    marketCap: Number(raw.market_cap ?? raw.marketCap ?? q.marketCap ?? q.market_cap ?? 0) || null,
    circulatingMarketCap: Number(raw.circulating_market_cap ?? raw.circulatingMarketCap ?? q.circulatingMarketCap ?? q.circulating_market_cap ?? 0) || null,
  };
}

export function parseStockList(rawList: any[]): ScreenerStock[] {
  return rawList.map(parseStockData);
}

