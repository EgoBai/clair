/**
 * ETF 数据服务（真实源版）
 *
 * 数据来源：
 * - 实时行情：腾讯财经 qt.gtimg.cn（免key，GBK），价格/涨跌幅/成交额/总市值
 *   （原为东方财富 push2 ulist；该host 从本机网络不可达 —— HTTP 000，故已换源）
 * - 单位净值(NAV) 与净值历史：东方财富 fundf10 lsjz（免 key，本机可达，保持不变）
 *
 * 静态分类（代码/名称/跟踪标的/费率）为公开事实参考目录，非模拟数据。
 *
 * 遵守「诚实数据」红线：行情/净值源不可达 → 抛出 EtfUnavailableError，
 * 由路由层降级为 dataSource:'unavailable'，绝不回填演示/正弦/随机伪造数据。
 */

import { toBareCode } from '../utils/symbolUtils';

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
  /** 二级市场真实成交价（元，腾讯行情）。无报价时为 0 —— 请配合 dataSource/quoteCoverage 判读 */
  price: number;
  nav: number;
  preNav: number;
  changePercent: number;
  /** 折溢价率 %；缺真实行情或真实净值时为 null（诚实不可用，非 0） */
  premiumRate: number | null;
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
  // 空历史不缓存，避免源侧暂时无数据时被 60s 缓存放大为「持续无数据」
  if (history.length > 0) navCache.set(symbol, { ts: Date.now(), entry });
  return entry;
}

/**
 * 腾讯行情原始返回中我们使用的字段下标（GBK 解码后按 `~` 切分）。
 * 换源依据见文件头注释；净值段仍走 api.fund.eastmoney.com（未改动）。
 */
const TX = {
  NAME: 1,
  /** 纯 6 位代码（回包 key 是带市场前缀的，故以本字段为业务主键） */
  CODE: 2,
  PRICE: 3,
  /** 涨跌幅 % */
  CHANGE_PERCENT: 32,
  /** 成交量（手） */
  VOLUME_LOT: 6,
  /** 成交额（万元） */
  AMOUNT_WAN: 37,
  /** 总市值（亿元） */
  TOTAL_MARKET_CAP_YI: 45,
} as const;

interface TencentEtfQuote {
  /** 源侧真实名称（如「沪深300ETF华泰柏瑞」），优于静态目录简称 */
  name: string;
  price: number;
  changePercent: number;
  /** 成交量（份）= 手 × 100 */
  volume: number;
  /** 成交额（元）= 万元 × 10000 */
  turnover: number;
  /** 总市值（元）= 亿元 × 1e8 */
  totalAssets: number;
}

/** 目录里的 eastmoney secid 市场（'1'=上交所 '0'=深交所）→ 腾讯行情前缀 */
function toTencentPrefix(market: '1' | '0'): 'sh' | 'sz' {
  return market === '1' ? 'sh' : 'sz';
}

/**
 * 批量抓取实时报价（腾讯 qt.gtimg.cn，免 key）。
 * GBK 必须显式解码，否则中文名乱码。
 * 目录仅十几只，单请求即可，无需分批。
 */
async function fetchQuotesBatch(): Promise<Record<string, TencentEtfQuote>> {
  const symbols = ETF_CATALOG.map((c) => `${toTencentPrefix(c.market)}${c.symbol}`);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let text: string;
  try {
    const resp = await fetch(`https://qt.gtimg.cn/q=${symbols.join(',')}`, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer: 'https://finance.qq.com',
      },
    });
    if (!resp.ok) throw new Error(`腾讯行情 HTTP ${resp.status}`);
    text = new TextDecoder('gbk').decode(await resp.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }

  const map: Record<string, TencentEtfQuote> = {};
  for (const m of text.matchAll(/v_(\w+)="([^"]*)"/g)) {
    const f = m[2].split('~');
    if (f.length <= TX.TOTAL_MARKET_CAP_YI) continue;
    const code = f[TX.CODE] ?? '';
    const price = Number(f[TX.PRICE]);
    // 源侧无报价时不写入 map —— 让buildEtf 走「无行情」分支，绝不用 0 冒充价格
    if (!/^\d{6}$/.test(code) || !(price > 0)) continue;
    const lot = Number(f[TX.VOLUME_LOT]);
    map[code] = {
      name: f[TX.NAME] ?? '',
      price,
      changePercent: Number(f[TX.CHANGE_PERCENT]) || 0,
      volume: Number.isFinite(lot) ? lot * 100 : 0,
      turnover: (Number(f[TX.AMOUNT_WAN]) || 0) * 10_000,
      totalAssets: (Number(f[TX.TOTAL_MARKET_CAP_YI]) || 0) * 1e8,
    };
  }
  return map;
}

async function fetchAllQuotes(): Promise<Record<string, TencentEtfQuote>> {
  return fetchQuotesBatch();
}

function buildEtf(cat: EtfCatalog, quote: TencentEtfQuote | undefined, navEntry: EtfNav): EtfItem {
  const price = quote?.price ?? 0;
  const changePercent = quote?.changePercent ?? 0;
  const nav = navEntry?.nav ?? 0;
  const preNav = navEntry?.preNav ?? nav;
  //折溢价：仅在「有真实行情 且 有真实净值」时才计算；任一缺失 → null（诚实不可用）
  const premiumRate = quote && nav > 0 ? +(((price - nav) / nav) * 100).toFixed(2) : null;
  return {
    symbol: cat.symbol,
    // 名称优先用源侧真实全称，退化到静态目录简称
    name: quote?.name || cat.name,
    type: cat.type,
    benchmark: cat.benchmark,
    price,
    nav: +nav.toFixed(4),
    preNav: +preNav.toFixed(4),
    changePercent: +changePercent.toFixed(2),
    premiumRate,
    totalAssets: quote?.totalAssets ?? 0,
    trackingError: cat.trackingError,
    dividendYield: cat.dividendYield,
    expenseRatio: cat.expenseRatio,
    volume: quote?.volume ?? 0,
    turnover: quote?.turnover ?? 0,
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
    // 诚实红线：一只都取不到报价 → 整列表视为不可用（而非返回一串 0 价格条目）
    if (Object.keys(quotes).length === 0) {
      throw new EtfUnavailableError('腾讯行情源未返回任何 ETF 报价');
    }
    return await Promise.all(
      ETF_CATALOG.map(async (cat) => {
        let navEntry: EtfNav = { nav: 0, preNav: 0, history: [] };
        try {
          navEntry = await fetchFundNav(cat.symbol, 2);
        } catch {
          /* 净值缺失不影响行情展示；premiumRate 由 buildEtf 置 null（诚实不可用） */
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
  const bare = toBareCode(symbol);
  const cat = ETF_CATALOG.find((c) => c.symbol === bare);
  if (!cat) return null;
  let quote: TencentEtfQuote | undefined;
  try {
    quote = (await fetchQuotesBatch())[cat.symbol];
    if (!quote) throw new EtfUnavailableError(`腾讯行情源无 ${bare} 的报价`);
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
 *
 * 符号归一：裸码 510300 与带后缀 510300.SH 行为一致（统一 toBareCode）。
 * 目录外代码（如个股 600519）也尝试真实净值源；源侧无该代码净值数据时
 * 同样抛 EtfUnavailableError → 路由层诚实降级，保证两格式响应一致。
 */
export async function getEtfNavHistory(
  symbol: string,
  days: number,
): Promise<{ symbol: string; name: string; history: EtfNav['history'] } | null> {
  const bare = toBareCode(symbol);
  if (!/^\d{6}$/.test(bare)) return null;
  const cat = ETF_CATALOG.find((c) => c.symbol === bare);
  try {
    const navEntry = await fetchFundNav(bare, days);
    if (navEntry.history.length === 0) {
      throw new EtfUnavailableError(`净值源无 ${bare} 的净值数据（非基金代码或源侧无记录）`);
    }
    return { symbol: bare, name: cat?.name ?? '', history: navEntry.history };
  } catch (e) {
    if (e instanceof EtfUnavailableError) throw e;
    throw new EtfUnavailableError(e instanceof Error ? e.message : 'ETF 净值源不可用');
  }
}

/** 清除净值缓存（测试用） */
export function clearEtfCache(): void {
  navCache.clear();
}
