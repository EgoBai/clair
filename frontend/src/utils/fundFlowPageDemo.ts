/**
 * 资金流页面 · 前端确定性演示兜底（LCG 种子 20260728，与后端 demo 风格一致）。
 * 后端不可达/报错时提供确定性数据，不联网、不空转、不报错；页面据此标注「演示数据」gold Tag。
 */

export type FundFlowProviderName = 'tushare' | 'akshare' | 'alphavantage' | 'eastmoney' | 'demo';

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

export interface StockFundFlowResp { current: FundFlowData; history: FundFlowData[]; dataSource: FundFlowProviderName; }
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

// ==================== 确定性随机（FNV-1a + LCG，禁用 Math.random） ====================
function fnv1a(str: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function makeLcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 0x100000000; };
}
function seedOf(symbol: string, salt = 0): number { return (fnv1a(symbol) ^ 20260728 ^ salt) >>> 0; }
function todayISO(): string { return new Date().toISOString().split('T')[0]; }
const SCALE = 20000;

/** 由 symbol+日期 派生确定性 5 档资金流单行 */
function mkRow(symbol: string, ds: string, salt: number): FundFlowData {
  const r = makeLcg(seedOf(symbol + ds, salt));
  return {
    symbol, name: symbol,
    mainNet: (r() - 0.5) * SCALE,
    superLargeNet: (r() - 0.5) * SCALE * 0.3,
    largeNet: (r() - 0.5) * SCALE * 0.4,
    mediumNet: (r() - 0.5) * SCALE * 0.2,
    smallNet: (r() - 0.5) * SCALE * 0.1,
    tradeDate: ds,
  };
}

// ==================== 个股资金流 + 历史 ====================
export function genStockFundFlow(symbol: string, days = 10): StockFundFlowResp {
  const base = new Date();
  const history: FundFlowData[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base); d.setDate(d.getDate() - i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // 跳过周末，贴近交易日
    history.push(mkRow(symbol, d.toISOString().split('T')[0], 0));
  }
  return { current: mkRow(symbol, todayISO(), 1), history, dataSource: 'demo' };
}

// ==================== 行业资金流排行 ====================
const INDUSTRY_NAMES = [
  '半导体', '电池', '光伏设备', '白酒', '医疗器械', '软件开发', '证券', '银行',
  '保险', '房地产', '汽车整车', '汽车零部件', '消费电子', '通信服务', '电力',
  '钢铁', '煤炭', '化工', '食品饮料', '家电', '军工', '医药商业', '养殖', '航运港口',
];
export function genIndustryFlow(limit = 20): IndustryFlowResp {
  const industries = INDUSTRY_NAMES.map((name) => {
    const r = makeLcg(seedOf(`industry:${name}`));
    return {
      industry: name,
      mainNet: (r() - 0.5) * SCALE * 2.5,        // 缩放至 ±25000，与后端兜底一致
      netInflow: (r() - 0.5) * SCALE * 3.75,
      stockCount: 8 + Math.floor(r() * 60),
      topStocks: [],
    };
  }).sort((a, b) => b.mainNet - a.mainNet).slice(0, limit);
  return { industries, count: industries.length, updateTime: new Date().toISOString() };
}

// ==================== 外资 / 全球视角 ====================
const GLOBAL_DEFS = [
  { key: 'northbound_proxied', label: '北向资金(代理)', unit: '亿元' },
  { key: 'usd_index', label: '美元指数关联', unit: 'pt' },
  { key: 'risk_appetite', label: '全球风险偏好', unit: 'index' },
  { key: 'offshore_rmb', label: '离岸人民币 USD/CNH', unit: 'USD/CNH' },
];
export function genGlobalIndicators(): GlobalFlowResp {
  const base = new Date();
  const indicators: GlobalIndicator[] = GLOBAL_DEFS.map((d, idx) => {
    const r = makeLcg(seedOf(d.key, idx + 1));
    const series: GlobalIndicatorPoint[] = [];
    let v = (r() - 0.5) * 100;
    for (let i = 29; i >= 0; i--) {
      const dt = new Date(base); dt.setDate(dt.getDate() - i);
      const dow = dt.getDay();
      if (dow === 0 || dow === 6) continue;
      v += (r() - 0.5) * 20;
      series.push({ date: dt.toISOString().split('T')[0], value: Number(v.toFixed(2)) });
    }
    return { key: d.key, label: d.label, unit: d.unit, latest: series.length ? series[series.length - 1].value : 0, series };
  });
  return { indicators, dataSource: 'demo' };
}

// ==================== 市场资金概览（5 档结构，演示估算） ====================
export function genMarketOverview(): MarketOverview {
  const r = makeLcg(seedOf('market-overview'));
  return {
    mainNet: (r() - 0.5) * SCALE,
    superLargeNet: (r() - 0.5) * SCALE * 0.3,
    largeNet: (r() - 0.5) * SCALE * 0.4,
    mediumNet: (r() - 0.5) * SCALE * 0.2,
    smallNet: (r() - 0.5) * SCALE * 0.1,
  };
}

// ==================== provider 链诊断兜底 ====================
export function genMeta(): FundFlowMeta {
  return {
    activeProviders: ['demo'],
    keysConfigured: { tushare: false, akshare: false, alphavantage: false, eastmoney: true, demo: true },
  };
}
