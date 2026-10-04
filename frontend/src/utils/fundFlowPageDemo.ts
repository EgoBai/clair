/**
 * 资金流页面 · 类型定义模块。
 * 仅承载页面消费后端 /api/fund-flow/* 真实响应所需的类型契约；
 * 不含任何数据生成器——后端不可达/报错时，FundFlowPage 走诚实空态兜底（EmptyState），
 * 绝不回退伪数据（诚实数据红线，IP-20 收口）。
 */

export type FundFlowProviderName = 'tushare' | 'akshare' | 'alphavantage' | 'eastmoney' | 'demo' | 'unavailable';

export interface FundFlowData {
  symbol: string; name: string;
  mainNet: number; superLargeNet: number; largeNet: number; mediumNet: number; smallNet: number;
  tradeDate: string;
}
export interface IndustryFlowData {
  industry: string; mainNet: number; netInflow: number; stockCount: number;
  topStocks: { symbol: string; name: string; mainNet: number }[];
}
export interface GlobalIndicatorPoint { date: string; value: number; }
export interface GlobalIndicator { key: string; label: string; unit: string; latest: number; series: GlobalIndicatorPoint[]; }

export interface StockFundFlowResp { current: FundFlowData | null; history: FundFlowData[]; dataSource: FundFlowProviderName; }
export interface IndustryFlowResp { industries: IndustryFlowData[]; count: number; updateTime: string; }
export interface GlobalFlowResp { indicators: GlobalIndicator[]; dataSource: FundFlowProviderName; }
export interface FundFlowMeta { activeProviders: FundFlowProviderName[]; keysConfigured: Record<string, boolean>; }
export interface MarketOverview { mainNet: number; superLargeNet: number; largeNet: number; mediumNet: number; smallNet: number; }

/** 全市场资金流响应（/api/fund-flow/market） */
export interface MarketFundFlowResp {
  tiers: {
    main: number | null; superLarge: number | null; large: number | null;
    medium: number | null; small: number | null;
  };
  market: {
    tradeDate: string | null;
    totalTurnover: number | null;
    risingStocks: number; fallingStocks: number; unchangedStocks: number;
    limitUpCount: number; limitDownCount: number; totalStocks: number;
  } | null;
  updateTime: string;
  source: FundFlowProviderName | 'unavailable';
  note?: string;
}
