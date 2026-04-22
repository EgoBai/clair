/**
 * 共享类型定义
 * 前后端共用的核心数据类型
 */
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
export interface KLineData {
    tradeDate: string;
    open: number;
    close: number;
    high: number;
    low: number;
    volume: number;
    turnover: number;
}
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
}
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
    sentimentScore: number;
}
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
    equityCurve: {
        date: string;
        value: number;
    }[];
    drawdownCurve: {
        date: string;
        drawdown: number;
    }[];
}
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
    allocation: {
        name: string;
        value: number;
        weight: number;
    }[];
    createdAt: string;
}
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
export type SentimentType = 'bullish' | 'bearish' | 'neutral';
export interface MarketCommentary {
    id: string;
    date: string;
    type: 'daily_summary' | 'sector_analysis' | 'stock_comment' | 'market_outlook';
    title: string;
    summary: string;
    sections: {
        heading: string;
        content: string;
        dataPoints: {
            label: string;
            value: number | string;
            change?: number;
            unit?: string;
        }[];
    }[];
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
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
    totalBidVolume: number;
    totalAskVolume: number;
    bidAskRatio: number;
    amplitude: number;
}
export interface TimeShareData {
    time: string;
    price: number;
    volume: number;
    avgPrice: number;
    change: number;
}
export interface MarginTradingData {
    symbol: string;
    name: string;
    tradeDate: string;
    financingBalance: number;
    financingBuyAmount: number;
    financingRepayAmount: number;
    financingNetBuy: number;
    securitiesBalance: number;
    securitiesSellAmount: number;
    securitiesRepayAmount: number;
    securitiesNetSell: number;
    totalBalance: number;
    financingRatio: number;
}
export interface MarginOverview {
    totalFinancingBalance: number;
    totalSecuritiesBalance: number;
    financingStockCount: number;
    securitiesStockCount: number;
    topFinancingIncrease: Array<{
        symbol: string;
        name: string;
        change: number;
    }>;
    topSecuritiesIncrease: Array<{
        symbol: string;
        name: string;
        change: number;
    }>;
}
export interface TopTraderEntry {
    rank: number;
    seatName: string;
    buyAmount: number;
    sellAmount: number;
    netAmount: number;
    symbol?: string;
    name?: string;
    reason?: string;
    isOrganizational: boolean;
}
export interface TopTraderRecord {
    symbol: string;
    name: string;
    tradeDate: string;
    closePrice: number;
    changePercent: number;
    turnover: number;
    reason: string;
    buyTotal: number;
    sellTotal: number;
    netTotal: number;
    entries: TopTraderEntry[];
}
export interface TopTraderOverview {
    tradeDate: string;
    totalStocks: number;
    buyDominantCount: number;
    sellDominantCount: number;
    totalBuyAmount: number;
    totalSellAmount: number;
    totalNetAmount: number;
    topBuyStocks: Array<{
        symbol: string;
        name: string;
        netAmount: number;
        reason: string;
    }>;
    topSellStocks: Array<{
        symbol: string;
        name: string;
        netAmount: number;
        reason: string;
    }>;
    industryDistribution: Record<string, number>;
}
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
export interface BlockTrade {
    id: number;
    symbol: string;
    name: string;
    tradeDate: string;
    price: number;
    closePrice: number;
    volume: number;
    amount: number;
    discount: number;
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
export interface LockupExpiry {
    id: number;
    symbol: string;
    name: string;
    expiryDate: string;
    lockupType: '首发原股东限售' | '定向增发机构配售' | '股权激励限售' | '追加承诺限售';
    shareholder: string;
    totalShares: number;
    circulatingBefore: number;
    unlockRatio: number;
    marketValue: number;
    price: number;
    actualCirculating: number;
}
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
    dimensions: Array<{
        name: string;
        score: number;
        weight: number;
    }>;
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
