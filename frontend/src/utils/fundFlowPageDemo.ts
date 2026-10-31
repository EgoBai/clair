/**
 * 资金流页面 · 类型定义模块。
 * 仅承载页面消费后端 /api/fund-flow/* 真实响应所需的类型契约；
 * 不含任何数据生成器——后端不可达/报错时，FundFlowPage 走诚实空态兜底（EmptyState），
 * 绝不回退伪数据（诚实数据红线，IP-20 收口）。
 */

export type FundFlowProviderName = 'tushare' | 'akshare' | 'alphavantage' | 'eastmoney' | 'tencent' | 'demo' | 'unavailable';

export interface FundFlowData {
  symbol: string; name: string;
  mainNet: number; superLargeNet: number; largeNet: number; mediumNet: number; smallNet: number;
  tradeDate: string;
}
/**
 * 行业资金流单行（/api/fund-flow/industry）。
 *
 * 真值域与后端一致：三个业务量字段是 `number | null` ——
 * 后端把「上游没给该行业」表达为 null，真实的 0（真的零净流入）仍然是 0。
 * 前端把 null 渲染成 0 会把「数据缺失」说成「净流入 0 元」（诚实数据红线）。
 */
export interface IndustryFlowData {
  industry: string;
  /** 主力净额（元）：东财 f62 / 腾讯 zljlr。缺失 → null */
  mainNet: number | null;
  /** 板块全单净流入（元）：两个真实源都不提供 → 恒 null，不拿主力净额冒充 */
  netInflow: number | null;
  /** 成分股数：腾讯 zgb 分母；东财侧无直读字段 → null */
  stockCount: number | null;
  topStocks: { symbol: string; name: string; mainNet: number | null }[];
  dataSource?: 'eastmoney' | 'tencent' | 'unavailable';
}
export interface GlobalIndicatorPoint { date: string; value: number; }
export interface GlobalIndicator { key: string; label: string; unit: string; latest: number; series: GlobalIndicatorPoint[]; }

export interface StockFundFlowResp { current: FundFlowData | null; history: FundFlowData[]; dataSource: FundFlowProviderName; }
export interface IndustryFlowResp {
  industries: IndustryFlowData[];
  count: number;
  updateTime: string;
  /** 本块数据真实来源（后端顶层与 data 内同源） */
  dataSource?: 'eastmoney' | 'tencent' | 'unavailable';
  /** 数据所属交易日：上游不返回时如实为 null（不拿自然日冒充） */
  asOf?: string | null;
  /** 降级原因（中文）：空列表时必有 */
  note?: string | null;
}
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
    /**
     * 以下业务量字段的**真值域是 `number | null`**：后端把「取不到」表达为 null，
     * 真实的 0（例如全市场零涨停）仍然是 0。前端必须区分这两者——
     * 把 null 渲染成 0 会把「数据缺失」说成「全市场平盘」（诚实数据红线）。
     */
    totalTurnover: number | null;
    risingStocks: number | null; fallingStocks: number | null; unchangedStocks: number | null;
    limitUpCount: number | null; limitDownCount: number | null; totalStocks: number | null;
  } | null;
  updateTime: string;
  source: FundFlowProviderName | 'unavailable';
  note?: string;
  /** 数据所属交易日（后端经交易日历解析后如实透出，P0-CALWIRE / R3 交易日收口） */
  asOf?: string | null;
  /** 该交易日是否为「今天不是交易日、回退到最近交易日」的兜底结果 */
  asOfIsFallback?: boolean;
  /** 回退原因说明（仅在 asOfIsFallback 为真时有意义） */
  asOfNote?: string | null;
}
