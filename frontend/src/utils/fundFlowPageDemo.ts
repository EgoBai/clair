/**
 * 资金流页面 · 类型定义模块。
 * 仅承载页面消费后端 /api/fund-flow/* 真实响应所需的类型契约；
 * 不含任何数据生成器——后端不可达/报错时，FundFlowPage 走诚实空态兜底（EmptyState），
 * 绝不回退伪数据（诚实数据红线，IP-20 收口）。
 */

/**
 * 数据源标识。`partial` = 来源可达但部分字段缺失（Worker 对东财缺档返回 null + missing[]），
 * 与「拿到全量」的 provider 名、与「完全不可得」的 `unavailable` 是三种不同事实。
 */
export type FundFlowProviderName = 'tushare' | 'akshare' | 'alphavantage' | 'eastmoney' | 'tencent' | 'sina' | 'demo' | 'partial' | 'unavailable';

/**
 * 个股五档净额（/api/fund-flow/:symbol 的 current）。
 *
 * 真值域是 `number | null`：上游对停牌/新股/无成交的档位返回 `'-'` 或 null，
 * Worker 统一归一为 null（真实的 0 仍是 0）。写成 `number` 会让消费端以为
 * 「一定有值」而随手 `?? 0`，把缺失变回「净流入 0 元」。
 */
export interface FundFlowData {
  symbol: string; name: string;
  mainNet: number | null; superLargeNet: number | null; largeNet: number | null;
  mediumNet: number | null; smallNet: number | null;
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
  /** 本次返回条数（可能被 limit 截断） */
  count: number;
  /** 上游本次可取的行业总数：与 count 不等说明被截断（旧实现没有此字段，count 会被误读成"全市场行业数"） */
  total?: number;
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
