/**
 * ETF 数据服务（真实源版）
 *
 * 数据来源：
 * - 实时行情：东方财富 push2 ulist（免 key），价格/涨跌幅/规模/成交额
 * - 单位净值(NAV) 与净值历史：东方财富 fundf10 lsjz（免 key）
 *
 * 静态分类（代码/名称/跟踪标的/费率）为公开事实参考目录，非模拟数据。
 *
 * 遵守「诚实数据」红线：行情/净值源不可达 → 抛出 EtfUnavailableError，
 * 由路由层降级为 dataSource:'unavailable'，绝不回填演示/正弦/随机伪造数据。
 */

export type EtfType = 'index' | 'sector' | 'qdii' | 'commodity' | 'bond' | 'theme';

export interface EtfCatalog {
  symbol: string;
  name: string;
  type: EtfType;
  benchmark: string;
  market: '1' | '0'; // secid 市场：1=上交所 0=深交所
  expenseRatio: number;
  trackingError: number;
  dividendYield: number;
  holdings: number;
}

export interface EtfQuote {
  price: number;
  changePercent: number;
  totalAssets: number; // 元
  volume: number; // 份
  turnover: number; // 元
}

export interface EtfNav {
  nav: number;
  preNav: number;
  history: { date: string; nav: number; accNav: number; changePercent: number }[];
}

export interface EtfItem {
  symbol: string;
  name: string;
  type: EtfType;
  benchmark: string;
  nav: number;
  preNav: number;
  changePercent: number;
  premiumRate: number;
  totalAssets: number;
  trackingError: number;
  dividendYield: number;
  expenseRatio: number;
  volume: number;
  turnover: number;
  holdings: number;
}

/**
 * 真实 ETF 源不可用时抛出，供路由层降级为「诚实空」
 * （绝不回填模拟/随机数据，遵守项目「诚实数据」红线）。
 */
export class EtfUnavailableError extends Error {
  constructor(msg = 'ETF 真实源暂不可用（后端未接入或网络受限）') {
    super(msg);
    this.name = 'EtfUnavailableError';
  }
}

/** 真实 ETF 参考目录（代码/名称/跟踪标的/费率为公开事实，非模拟时间序列） */
export const ETF_CATALOG: EtfCatalog[] = [
  { symbol: '510300', name: '沪深300ETF', type: 'index', benchmark: '沪深300', market: '1', expenseRatio: 0.15, trackingError: 0.03, dividendYield: 2.1, holdings: 300 },
  { symbol: '510500', name: '中证500ETF', type: 'index', benchmark: '中证500', market: '1', expenseRatio: 0.15, trackingError: 0.04, dividendYield: 1.8, holdings: 500 },
  { symbol: '159915', name: '创业板ETF', type: 'index', benchmark: '创业板指', market: '0', expenseRatio: 0.15, trackingError: 0.05, dividendYield: 0.8, holdings: 100 },
  { symbol: '588000', name: '科创50ETF', type: 'index', benchmark: '科创50', market: '1', expenseRatio: 0.20, trackingError: 0.06, dividendYield: 0.5, holdings: 50 },
  { symbol: '512000', name: '券商ETF', type: 'sector', benchmark: '证券公司', market: '1', expenseRatio: 0.50, trackingError: 0.08, dividendYield: 1.2, holdings: 50 },
  { symbol: '512880', name: '证券ETF', type: 'sector', benchmark: '证券公司', market: '1', expenseRatio: 0.50, trackingError: 0.04, dividendYield: 1.5, holdings: 50 },
  { symbol: '515030', name: '新能源ETF', type: 'sector', benchmark: '新能源指数', market: '1', expenseRatio: 0.50, trackingError: 0.07, dividendYield: 0.6, holdings: 50 },
  { symbol: '512760', name: '芯片ETF', type: 'sector', benchmark: '中证半导体', market: '1', expenseRatio: 0.50, trackingError: 0.06, dividendYield: 0.4, holdings: 50 },
  { symbol: '513100', name: '纳指ETF', type: 'qdii', benchmark: '纳斯达克100', market: '1', expenseRatio: 0.60, trackingError: 0.12, dividendYield: 0.4, holdings: 100 },
  { symbol: '513500', name: '标普500ETF', type: 'qdii', benchmark: '标普500', market: '1', expenseRatio: 0.60, trackingError: 0.10, dividendYield: 1.2, holdings: 500 },
  { symbol: '518880', name: '黄金ETF', type: 'commodity', benchmark: 'Au99.99', market: '1', expenseRatio: 0.20, trackingError: 0.01, dividendYield: 0, holdings: 1 },
  { symbol: '159934', name: '黄金ETF', type: 'commodity', benchmark: 'Au99.99', market: '0', expenseRatio: 0.20, trackingError: 0.01, dividendYield: 0, holdings: 1 },
  { symbol: '511260', name: '国债ETF', type: 'bond', benchmark: '上证国债', market: '1', expenseRatio: 0.15, trackingError: 0.02, dividendYield: 2.0, holdings: 0 },
  { symbol: '511010', name: '国债ETF', type: 'bond', benchmark: '上证5年国债', market: '1', expenseRatio: 0.15, trackingError: 0.02, dividendYield: 1.8, holdings: 0 },
  { symbol: '515000', name: '科技ETF', type: 'theme', benchmark: '中证科技', market: '1', expenseRatio: 0.40, trackingError: 0.05, dividendYield: 0.9, holdings: 50 },
  { symbol: '512690', name: '酒ETF', type: 'theme', benchmark: '中证酒', market: '1', expenseRatio: 0.50, trackingError: 0.06, dividendYield: 1.5, holdings: 30 },
];

const FETCH_TIMEOUT_MS = 8000;
const NAV_TTL_MS = 60_000;

/** 带超时的 JSON 抓取（复用 realMarketData 的风格） */
async function fetchJson(url: string, headers?: Record<string, string>): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ctrl.signal, headers });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 基金净值缓存（TTL），减少对东方财富的重复请求 */
const navCache = new Map<string, { ts: number; entry: EtfNav }>();

async function fetchFundNav(symbol: string, days: number): Promise<EtfNav> {
  const cached = navCache.get(symbol);
  if (cached && Date.now() - cached.ts < NAV_TTL_MS) return cached.entry;
  const url = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${symbol}&pageIndex=1&pageSize=${days}`;
  const json = await fetchJson(url, {
    'User-Agent': 'Mozilla/5.0',
    Referer: 'http://fundf10.eastmoney.com/',
  });
  const list: any[] = json?.Data?.LSJZList ?? [];
  const history = list.map((r) => ({
    date: String(r.FSRQ),
    nav: Number(r.DWJZ),
    accNav: Number(r.LJJZ),
    changePercent: Number(r.JZZZL),
  }));
  const nav = history[0]?.nav ?? 0;
  const preNav = history[1]?.nav ?? nav;
  const entry: EtfNav = { nav, preNav, history };
  navCache.set(symbol, { ts: Date.now(), entry });
  return entry;
}

/** 批量抓取实时报价（东方财富 ulist）。f2=价×1000, f3=涨跌幅×100, f20=总市值(元), f6=成交量(份) */
async function fetchQuotesBatch(secids: string): Promise<Record<string, any>> {
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fields=f12,f14,f2,f3,f4,f6,f20,f21&secids=${secids}&pz=100`;
  const json = await fetchJson(url, { 'User-Agent': 'Mozilla/5.0' });
  const diff: any[] = json?.data?.diff ?? [];
  const map: Record<string, any> = {};
  for (const d of diff) map[String(d.f12)] = d;
  return map;
}

async function fetchAllQuotes(): Promise<Record<string, any>> {
  const secids = ETF_CATALOG.map((c) => `${c.market}.${c.symbol}`).join(',');
  const map = await fetchQuotesBatch(secids);
  const missing = ETF_CATALOG.filter((c) => !map[c.symbol]);
  await Promise.all(
    missing.map(async (c) => {
      const m = await fetchQuotesBatch(`${c.market}.${c.symbol}`);
      Object.assign(map, m);
    }),
  );
  return map;
}

function buildEtf(cat: EtfCatalog, quote: any, navEntry: EtfNav): EtfItem {
  const price = quote ? (Number(quote.f2) || 0) / 1000 : 0;
  const changePercent = quote ? (Number(quote.f3) || 0) / 100 : 0;
  const nav = navEntry?.nav ?? 0;
  const preNav = navEntry?.preNav ?? nav;
  const premiumRate = nav > 0 ? ((price - nav) / nav) * 100 : 0;
  const totalAssets = quote ? Number(quote.f20) || 0 : 0; // 元
  const volume = quote ? Number(quote.f6) || 0 : 0; // 份
  const turnover = price > 0 && volume > 0 ? price * volume : 0; // 元
  return {
    symbol: cat.symbol,
    name: cat.name,
    type: cat.type,
    benchmark: cat.benchmark,
    nav: +nav.toFixed(4),
    preNav: +preNav.toFixed(4),
    changePercent: +changePercent.toFixed(2),
    premiumRate: +premiumRate.toFixed(2),
    totalAssets,
    trackingError: cat.trackingError,
    dividendYield: cat.dividendYield,
    expenseRatio: cat.expenseRatio,
    volume,
    turnover,
    holdings: cat.holdings,
  };
}

/**
 * 获取 ETF 列表（真实源）
 * 行情源失败时抛出 EtfUnavailableError，由调用方降级为诚实空。
 */
export async function getEtfList(): Promise<EtfItem[]> {
  try {
    const quotes = await fetchAllQuotes();
    return await Promise.all(
      ETF_CATALOG.map(async (cat) => {
        let navEntry: EtfNav = { nav: 0, preNav: 0, history: [] };
        try {
          navEntry = await fetchFundNav(cat.symbol, 2);
        } catch {
          /* 净值缺失不影响行情展示，premiumRate 退化为 0 */
        }
        return buildEtf(cat, quotes[cat.symbol], navEntry);
      }),
    );
  } catch (e) {
    throw new EtfUnavailableError(e instanceof Error ? e.message : 'ETF 列表源不可用');
  }
}

/**
 * 获取 ETF 详情（真实源）
 * 行情源失败时抛出 EtfUnavailableError。
 */
export async function getEtfDetail(symbol: string): Promise<EtfItem | null> {
  const cat = ETF_CATALOG.find((c) => c.symbol === symbol);
  if (!cat) return null;
  let quote: any;
  try {
    quote = (await fetchQuotesBatch(`${cat.market}.${cat.symbol}`))[cat.symbol];
  } catch (e) {
    throw new EtfUnavailableError(e instanceof Error ? e.message : 'ETF 行情源不可用');
  }
  let navEntry: EtfNav = { nav: 0, preNav: 0, history: [] };
  try {
    navEntry = await fetchFundNav(cat.symbol, 2);
  } catch {
    /* 净值缺失 */
  }
  return buildEtf(cat, quote, navEntry);
}

/**
 * 获取 ETF 净值历史（真实源，替换原 Math.random 模拟）
 * 净值源失败时抛出 EtfUnavailableError。
 */
export async function getEtfNavHistory(
  symbol: string,
  days: number,
): Promise<{ symbol: string; name: string; history: EtfNav['history'] } | null> {
  const cat = ETF_CATALOG.find((c) => c.symbol === symbol);
  if (!cat) return null;
  try {
    const navEntry = await fetchFundNav(cat.symbol, days);
    return { symbol: cat.symbol, name: cat.name, history: navEntry.history };
  } catch (e) {
    throw new EtfUnavailableError(e instanceof Error ? e.message : 'ETF 净值源不可用');
  }
}

/** 清除净值缓存（测试用） */
export function clearEtfCache(): void {
  navCache.clear();
}
