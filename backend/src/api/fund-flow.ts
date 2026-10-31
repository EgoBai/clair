/**
 * 资金流向 API (增强版)
 * 个股资金流向、行业资金流向排行、历史资金流向
 * 参考东方财富资金流向功能
 */

import { Request, Response, Router } from 'express';
import axios from 'axios';
import { db, getDb } from '../db/dbFactory';
import { validateQuery, validateBody, validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendNotFound, sendInternalError } from '../utils/apiResponse';
import { getFundFlowMeta, getGlobalIndicators } from '../services/fundFlowProviders';
import { resolveMarketQueryDate } from '../utils/tradingCalendar';

const router = Router();

export interface FundFlowData {
  symbol: string;
  name: string;
  mainNet: number;          // 主力净额
  superLargeNet: number;    // 超大单净额
  largeNet: number;         // 大单净额
  mediumNet: number;        // 中单净额
  smallNet: number;         // 小单净额
  tradeDate: string;
  /** 本行数据的真实来源；与响应顶层 dataSource 保持一致（诚实红线：绝不两级矛盾） */
  dataSource?: 'eastmoney' | 'sina' | 'unavailable';
}

/**
 * 行业资金流单行。
 *
 * 诚实红线（2026-11-01 工单）：三个业务量字段的真值域是 `number | null`。
 * 历史实现用 `item.f62 || 0` 把「上游没给该行业资金流」改写成「净流入 0 元」，
 * 前端随即渲染「主力净流入 0」——与 /fund-flow/market 修复前是同一个错。
 * 现在：缺失 → null，真实 0 → 0。
 */
export interface IndustryFlowData {
  industry: string;
  /** 主力净额（元）：东财 f62（超大单+大单）/ 腾讯 zljlr（大单+特大单）。缺失 → null */
  mainNet: number | null;
  /**
   * 板块全单资金净流入（元）：两个真实源都只提供「主力」口径净额，
   * 全单（含中/小单）净额不可得 → 恒为 null，绝不拿主力净额冒充。
   */
  netInflow: number | null;
  /** 成分股数：腾讯 zgb 的「上涨家数/成分股数」分母；东财行业板块无直读字段 → null */
  stockCount: number | null;
  topStocks: Array<{ symbol: string; name: string; mainNet: number | null }>;
  /** 本行数值的真实来源；与响应顶层 dataSource 保持一致（诚实红线：绝不两级矛盾） */
  dataSource: 'eastmoney' | 'tencent' | 'unavailable';
}

// ==================== 符号规范化 ====================
// 兼容 600519 / 600519.SH / sh600519 三种写法，统一为 600519.SH

function inferMarket(code: string): string {
  if (code.startsWith('6')) return 'SH';
  if (code.startsWith('4') || code.startsWith('8')) return 'BJ';
  return 'SZ';
}

export function normalizeSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  const m = s.match(/^(?:(SH|SZ|BJ))?(\d{6})(?:\.(SH|SZ|BJ))?$/);
  if (!m) return s;
  const market = m[1] || m[3] || inferMarket(m[2]);
  return `${m[2]}.${market}`;
}

// ==================== 诚实数值转换（fund-flow 专用） ====================
/**
 * 把「可能缺失的原始值」转成「业务量或 null」，**绝不把缺失改写成 0**。
 *
 * 诚实数据红线：`Number(x) || 0` 会把
 *   ① null / undefined / '' / NaN（= 压根没取到）兜成 0，
 * 前端随即渲染「0 家上涨」——用户以为全市场平盘，这是"半诚实"红线。
 *
 * 真值域判定：
 *   - null / undefined / 空串 / 非有限数 → null（未取到，不知道）
 *   - 0 / '0' / -3.2 / '1.2e12'        → 原样数字（**0 是有效业务值**：真的零涨停就是 0，
 *     把它改成 null 是另一种谎报——把"确实为 0"说成"不知道"）
 */
function honestNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ==================== 带超时的 JSON 抓取（复用 etfDataService 的 fetchJson 模式） ====================

const FETCH_TIMEOUT_MS = 8000;

async function fetchJson(url: string, headers?: Record<string, string>): Promise<unknown> {
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

const numOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

// ==================== 真实源 1：东方财富 push2（实时，本机间歇不可达） ====================
// 字段语义（元）：f62=主力净额 f66=超大单净额 f72=大单净额 f78=中单净额 f84=小单净额 f124=时间戳
// 历史 bug：曾把 f184（主力净占比 %）当作 mainNet 净额返回，属数据失真，已修正。

async function fetchFundFlowEastmoney(symbol: string): Promise<FundFlowData | null> {
  const norm = normalizeSymbol(symbol);
  const code = norm.slice(0, 6);
  const market = norm.endsWith('.SH') ? '1' : '0';
  const url =
    `https://push2.eastmoney.com/api/qt/stock/get?secid=${market}.${code}` +
    `&fields=f62,f66,f72,f78,f84,f124&_=${Date.now()}`;
  try {
    const json = await fetchJson(url, {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://quote.eastmoney.com',
    });
    const d = (json as { data?: Record<string, unknown> })?.data;
    if (!d) return null;

    const main = numOrNull(d.f62);
    const superLarge = numOrNull(d.f66);
    const large = numOrNull(d.f72);
    const medium = numOrNull(d.f78);
    const small = numOrNull(d.f84);
    // 实测该 CDN 间歇返回缺档（f66/f72 缺失）：任一档位缺失即判该源本次不可用，交由下一真实源。
    if (main === null || superLarge === null || large === null || medium === null || small === null) {
      return null;
    }

    const ts = numOrNull(d.f124);
    const tradeDate = ts
      ? new Date(ts * 1000).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    return { symbol: norm, name: '', mainNet: main, superLargeNet: superLarge, largeNet: large, mediumNet: medium, smallNet: small, tradeDate, dataSource: 'eastmoney' };
  } catch (error) {
    console.error(`[fund-flow] 东财个股资金流不可达: ${norm}`, error);
    return null;
  }
}

// ==================== 真实源 2：新浪财经 MoneyFlow（最近交易日，5 档完整） ====================
// ssl_qsfx_lscjfb 返回最近交易日列表：r0/r1/r2/r3_net 分别为超大单/大单/中单/小单净额（元）。
// 实测本机稳定可达（2026-10-06）；主力净额 = 超大单 + 大单（与东财口径一致）。

interface SinaFlowRow {
  opendate?: string;
  r0_net?: string | number;
  r1_net?: string | number;
  r2_net?: string | number;
  r3_net?: string | number;
}

function mapSinaRow(symbol: string, row: SinaFlowRow): FundFlowData | null {
  const toAmount = (v: unknown): number | null => {
    const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const superLarge = toAmount(row.r0_net);
  const large = toAmount(row.r1_net);
  const medium = toAmount(row.r2_net);
  const small = toAmount(row.r3_net);
  if (superLarge === null || large === null || medium === null || small === null) return null;
  return {
    symbol,
    name: '',
    mainNet: superLarge + large,
    superLargeNet: superLarge,
    largeNet: large,
    mediumNet: medium,
    smallNet: small,
    tradeDate: typeof row.opendate === 'string' ? row.opendate : new Date().toISOString().split('T')[0],
    dataSource: 'sina',
  };
}

async function fetchFundFlowSina(symbol: string, days: number): Promise<{ current: FundFlowData; history: FundFlowData[] } | null> {
  const norm = normalizeSymbol(symbol);
  const dot = norm.lastIndexOf('.');
  const sinaCode = `${norm.slice(dot + 1).toLowerCase()}${norm.slice(0, dot)}`; // sh600519 / sz300750 / bj430047
  const url =
    'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/MoneyFlow.ssl_qsfx_lscjfb' +
    `?page=1&num=${days}&sort=opendate&asc=0&daima=${sinaCode}`;
  try {
    const json = await fetchJson(url, {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://finance.sina.com.cn',
    });
    if (!Array.isArray(json) || json.length === 0) return null;
    const history = (json as SinaFlowRow[])
      .map((r) => mapSinaRow(norm, r))
      .filter((x): x is FundFlowData => x !== null);
    if (history.length === 0) return null;
    return { current: history[0], history };
  } catch (error) {
    console.error(`[fund-flow] 新浪个股资金流不可达: ${norm}`, error);
    return null;
  }
}

/**
 * 个股资金流真实源解析链：东财实时 → 新浪最近交易日 → null（由路由层统一诚实降级）。
 * 诚实红线：链中绝不包含任何生成/演示数据。
 */
export async function resolveStockFlow(symbol: string, historyDays = 20): Promise<{
  current: FundFlowData | null;
  history: FundFlowData[];
  dataSource: 'eastmoney' | 'sina' | 'unavailable';
}> {
  const norm = normalizeSymbol(symbol);
  const em = await fetchFundFlowEastmoney(norm);
  if (em) {
    // 东财实时成功：历史序列 best-effort 补新浪真实数据（拿不到不拖垮主响应）
    const sina = await fetchFundFlowSina(norm, historyDays).catch(() => null);
    return { current: em, history: sina?.history ?? [], dataSource: 'eastmoney' };
  }
  const sina = await fetchFundFlowSina(norm, historyDays);
  if (sina) {
    return { current: sina.current, history: sina.history, dataSource: 'sina' };
  }
  return { current: null, history: [], dataSource: 'unavailable' };
}

// ==================== 行业资金流真实源链 ====================
/**
 * 行业资金流解析结果。`industries` 为空 ⇔ `dataSource === 'unavailable'`：
 * 空列表**必须**自带 dataSource 与中文原因（本次工单：旧实现裸空数组 + 无 dataSource）。
 */
interface IndustryFlowResult {
  industries: IndustryFlowData[];
  dataSource: 'eastmoney' | 'tencent' | 'unavailable';
  /** 数据所属交易日（上游给了才给，取不到 → null，不拿自然日/响应时间冒充） */
  asOf: string | null;
  note?: string;
}

/** 腾讯板块排行（proxy.finance.qq.com）：真实主力资金流，实测本机可达（2026-11-01） */
const TENCENT_INDUSTRY_RANK_URL =
  'https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank' +
  '?board_type=hy&sort_type=price&direct=down&offset=0&count=100';

interface TencentBoardRow {
  name?: string;
  code?: string;
  /** 一级行业板块标记（BK-HY-1）；二级为 BK-HY-2 */
  stock_type?: string;
  /** 主力净流入（**万元**）：实测 zllr - zllc 恒等于该值 */
  zljlr?: string | number;
  /** 主力流入 / 主力流出（万元） */
  zllr?: string | number;
  zllc?: string | number;
  /** 涨跌幅（%） */
  zdf?: string | number;
  /** 「上涨家数/成分股数」，实测 31 个一级行业合计分母 5,221 ≈ 全 A 数量、分子 852 ≈ 当日上涨家数 */
  zgb?: string;
}

/**
 * 解析腾讯 zgb 字段：「71/122」→ 122（分母为成分股数，分子为当日上涨家数）。
 * 口径未经解析成功一律 null —— 不猜。
 */
function parseBoardConstituentCount(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return null;
  const total = Number(m[2]);
  return Number.isFinite(total) && total > 0 ? total : null;
}

/**
 * 真实源 1：东方财富 push2 行业板块排行（clist）。
 *
 * 历史缺陷（本次修复）：
 *   ① `fs: 'b:BK0475'` 只圈定**单只**板块，接口永远返回不到行业列表 → 前端恒空；
 *   ② `mainNet: f184` 把「主力净**占比**(%)」当「主力净**额**(元)」返回，单位错位；
 *   ③ `item.f62 || 0` / `item.f22 || 0` 把缺失兜成 0。
 * 现口径：f62 = 主力净额（元，与 /fund-flow/market 同一字段语义），缺失 → null。
 */
async function fetchIndustryFlowEastmoney(): Promise<IndustryFlowResult | null> {
  try {
    const response = await axios.get('https://push2.eastmoney.com/api/qt/clist/get', {
      params: {
        fid: 'f62',
        po: 1,
        pz: 100,
        pn: 1,
        np: 1,
        fltt: 2,
        invt: 2,
        fs: 'm:90+t:2', // 全部行业板块（旧值 b:BK0475 只能返回单只板块）
        fields: 'f12,f14,f62,f184,f124',
        _: Date.now(),
      },
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://data.eastmoney.com',
      },
    });

    const items: unknown = response.data?.data?.diff;
    if (!Array.isArray(items) || items.length === 0) return null;

    let asOf: string | null = null;
    const industries: IndustryFlowData[] = [];
    for (const raw of items as Record<string, unknown>[]) {
      const industry = typeof raw?.f14 === 'string' ? raw.f14.trim() : '';
      if (!industry) continue;
      const ts = honestNumber(raw?.f124);
      if (asOf === null && ts !== null && ts > 0) {
        asOf = new Date(ts * 1000).toISOString().slice(0, 10);
      }
      industries.push({
        industry,
        // f62 = 主力净流入净额（元）；缺失 → null（绝不 `|| 0`）
        mainNet: honestNumber(raw?.f62),
        // 东财该接口不给全单净额（f184 是主力净占比%，不是净额）→ null
        netInflow: null,
        // 东财 clist 行业板块无成分股数直读字段（历史上的 f22 是「涨速」，非成分股数）→ null
        stockCount: null,
        topStocks: [],
        dataSource: 'eastmoney',
      });
    }
    if (industries.length === 0) return null;
    // 全部主力净额都缺失 → 该源本次无有效数值，交下一真实源
    if (industries.every((r) => r.mainNet === null)) return null;

    return { industries, dataSource: 'eastmoney', asOf };
  } catch (error) {
    console.error('[fund-flow] 东财行业资金流不可达:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * 真实源 2：腾讯板块排行（proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank）。
 *
 * 为什么需要它：push2.eastmoney.com 在本机与 Cloudflare Worker 两侧均不可达
 * （实测 2026-11-01 三方域名全 000），导致行业资金流长期是空壳。
 * 腾讯该接口稳定可达，且**真实提供**主力净流入（万元）、成分股数、领涨股、板块涨跌幅。
 *
 * 口径差异如实披露：腾讯「主力」= 大单+特大单（与东财 f62 口径相近但不完全等同）；
 * 该接口不提供全单净额 → netInflow 恒 null；不返回数据日期 → asOf 恒 null。
 */
async function fetchIndustryFlowTencent(): Promise<IndustryFlowResult | null> {
  try {
    const json = await fetchJson(TENCENT_INDUSTRY_RANK_URL, {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://gu.qq.com/',
    });
    const list = (json as { data?: { rank_list?: TencentBoardRow[] } })?.data?.rank_list;
    if (!Array.isArray(list) || list.length === 0) return null;

    const industries: IndustryFlowData[] = [];
    for (const row of list) {
      const industry = typeof row?.name === 'string' ? row.name.trim() : '';
      if (!industry) continue;
      // 只取一级行业（BK-HY-1）；字段缺失时按一级处理（上游当前只返回该层）
      if (row.stock_type && !String(row.stock_type).startsWith('BK-HY-1')) continue;

      const wan = honestNumber(row.zljlr); // 万元
      industries.push({
        industry,
        // 万元 → 元（取整，避免浮点尾数）；缺失 → null（不乘、不兜 0）
        mainNet: wan === null ? null : Math.round(wan * 10000),
        netInflow: null,
        stockCount: parseBoardConstituentCount(row.zgb),
        topStocks: [],
        dataSource: 'tencent',
      });
    }
    if (industries.length === 0) return null;
    if (industries.every((r) => r.mainNet === null)) return null;

    // 上游仅支持 price / turnover / speed 排序，主力净额需本地降序
    industries.sort((a, b) => {
      if (a.mainNet === null && b.mainNet === null) return 0;
      if (a.mainNet === null) return 1;
      if (b.mainNet === null) return -1;
      return b.mainNet - a.mainNet;
    });

    return { industries, dataSource: 'tencent', asOf: null };
  } catch (error) {
    console.error('[fund-flow] 腾讯行业资金流不可达:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * 行业资金流解析链：东财 push2 → 腾讯板块排行 → 统一诚实降级。
 * 诚实红线：链中无任何演示/生成数据；两源皆不可达时 industries=[] + dataSource='unavailable'
 * + 中文 note（空数组必须自带因由，不留裸空）。
 */
async function fetchIndustryFlow(): Promise<IndustryFlowResult> {
  const em = await fetchIndustryFlowEastmoney();
  if (em) return em;
  const tx = await fetchIndustryFlowTencent();
  if (tx) {
    return {
      ...tx,
      note: '东财 push2 不可达，以下行业资金流为腾讯板块排行真实数据（主力=大单+特大单，单位已换算为元）',
    };
  }
  return {
    industries: [],
    dataSource: 'unavailable',
    asOf: null,
    note: '行业资金流：东方财富 push2 与腾讯板块排行两个真实源均不可达，industries 为空表示「未取到」，不含任何兜底或生成数据',
  };
}

// ==================== API 路由 ====================
// ⚠️ 路由顺序约定：所有"静态路径"路由（/meta、/global、/industry、/batch）
// 必须注册在 /fund-flow/:symbol 之前，否则会被 Express 的参数路由 `:symbol`
// 吞掉（例如 GET /fund-flow/meta 会被当作 symbol="meta" 处理）。
// 历史既有 bug：原 /industry 注册在 /:symbol 之后，现已一并前置修正。

/**
 * 资金流适配器诊断元信息
 * GET /api/fund-flow/meta
 * 返回当前生效的 provider 链与各 env key 配置状态，供前端/运维排查。
 *
 * 诚实契约：这是**基础设施诊断信息**，反映本服务真实配置状态
 * （哪些 provider 在链上、哪些 key 已配置），**不是**行情/资金流数据。
 * 故顶层标 'real'（状态是真实测量的）并在 message 说明性质，避免前端
 * 把它当成资金流数值消费（qa 蜂群 P2-⑨：此前顶层无 dataSource）。
 */
router.get('/fund-flow/meta', (_req: Request, res: Response) => {
  try {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      success: true,
      dataSource: 'real',
      data: {
        ...getFundFlowMeta(),
        dataSource: 'real' as const,
        message: '资金流 provider 链诊断信息：反映本服务真实配置状态，不含任何行情/资金流数值',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('获取资金流元信息失败:', error);
    res.status(500).json({ success: false, error: '获取资金流元信息失败' });
  }
});

/**
 * 国际资金视角（外资 / 全球维度）
 * GET /api/fund-flow/global
 *
 * 诚实红线（2026-10-29，工单 R4）：只返回真实可核验的指标 ——
 *   - 沪深股通成交额（RPT_MUTUAL_DEAL_HISTORY.DEAL_AMT，与 /api/north-bound/overview 同源）；
 *   - 离岸人民币 USD/CNH（需 ALPHAVANTAGE_KEY，配置了才有）。
 * 「北向资金净买入」自 2024-08-19 起交易所停止披露，已如实下线，绝不倒算/冒充。
 * 无任何真实指标时 dataSource='unavailable'，indicators=[]（不编造 demo）。
 */
router.get('/fund-flow/global', async (_req: Request, res: Response) => {
  try {
    const { dataSource, indicators } = await getGlobalIndicators();
    // 顶层与 data 内 dataSource 必须同源：这里直接复用同一个返回值，杜绝两级漂移/各算一套。
    res.json({
      success: true,
      data: { indicators, dataSource },
      dataSource,
    });
  } catch (error) {
    console.error('获取国际资金视角失败:', error);
    res.status(500).json({ success: false, error: '获取国际资金视角失败' });
  }
});

/**
 * 全市场 5 档资金流结构 + 市场广度/成交额
 * GET /api/fund-flow/market
 *
 * 诚实红线：
 *   - 5 档主力/超大单/大单/中单/小单净流入：真实源为东方财富 push2 全市场聚合
 *     （沙箱下不可达，请求失败则 tiers 置 null，标注 unavailable，绝不编造数值）。
 *   - 市场广度（上涨/下跌/平盘家数、涨跌停、全市场成交额）：来自本地真实行情库
 *     （db.getMarketSummary）。**空值语义**：字段缺失一律 null（未取到），
 *     真实 0 仍是 0（例如全市场零涨停）；库里有行但字段全空时不算"广度真实"。
 *
 * 【R3 交易日收口】不再按自然日裸查「今天」：先经交易日历解析最近真实交易日
 * （今天是交易日用今天；节假日回退最近交易日；该日库中无数据继续回退到最近
 * 「有数据」的交易日），再查库 —— 与 /api/breadth/current 同口径，消除
 * 「同一天 breadth/current 有真实数据、本端点按自然日查空」的分叉。
 * 所用交易日以 asOf 如实透出（P0-CALWIRE）。
 */
router.get('/fund-flow/market', asyncHandler(async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const q = await resolveMarketQueryDate();
    const summary = await db.getMarketSummary(q.date);

    // 空值语义：字段缺失 → null（未取到）；真实 0 → 0（例如全市场零涨停）。
    // 严禁 `|| 0`：那会把"没取到"污染成"业务上是 0"，前端渲染「0 家上涨」。
    const marketRaw = summary
      ? {
          tradeDate: summary.date ? new Date(summary.date).toISOString().slice(0, 10) : null,
          totalTurnover: honestNumber(summary.totalTurnover),
          risingStocks: honestNumber(summary.risingStocks),
          fallingStocks: honestNumber(summary.fallingStocks),
          unchangedStocks: honestNumber(summary.unchangedStocks),
          limitUpCount: honestNumber(summary.limitUpCount),
          limitDownCount: honestNumber(summary.limitDownCount),
          totalStocks: honestNumber(summary.totalStocks),
        }
      : null;

    // 「行存在」≠「拿到了数值」：库里有当日聚合行、但 7 个业务量字段全空时，
    // 整行等价于空 → 按契约返回 market: null（前端据此走 unavailable 降级），
    // 绝不用 0 填一行假数据，也不用 null 分散成 7 个假"未知"。
    const marketHasValues =
      !!marketRaw &&
      [marketRaw.totalTurnover, marketRaw.risingStocks, marketRaw.fallingStocks,
        marketRaw.unchangedStocks, marketRaw.limitUpCount, marketRaw.limitDownCount,
        marketRaw.totalStocks].some((v) => v !== null);
    const market = marketHasValues ? marketRaw : null;

    // 尝试真实 5 档聚合（沙箱下通常不可达）
    const tiers = await fetchMarketTiers();
    const tierAvailable = !!tiers;
    const dataSource = tierAvailable ? 'eastmoney' : marketHasValues ? 'partial' : 'unavailable';

    // ── note 按场景拆分（旧文案一句话服务两种降级场景，market:null 时仍断言
    //    「市场广度/成交额来自本地真实行情」，与事实冲突）──
    const tierNote = tierAvailable
      ? null
      : '全市场 5 档资金流：东方财富 push2 聚合不可达，未返回任何档位净流入数值';
    const marketNote = marketHasValues
      ? `市场广度与成交额：本地真实行情库 ${market?.tradeDate ?? q.asOf} 交易日聚合`
      : summary
        ? `市场广度与成交额：本地行情库${q.asOf}的聚合行存在，但涨跌家数/涨跌停/成交额字段为空，均按 null 返回`
        : `市场广度与成交额：本地行情库未取到 ${q.asOf} 的市场聚合数据，涨跌家数/成交额均为 null`;
    // 两者都可用时不给 note（保持既有契约：note 只在降级时出现）；
    // 降级时两段文案各自只描述自己那一维的真实状态，不互相背书。
    const degraded = !tierAvailable || !marketHasValues;
    const note = degraded ? [tierNote, marketNote].filter(Boolean).join('；') : undefined;

    res.json({
      success: true,
      data: {
        tiers: tiers ?? { main: null, superLarge: null, large: null, medium: null, small: null },
        market,
        // 数据所属交易日如实披露（R3 交易日收口）
        asOf: q.asOf,
        asOfIsFallback: q.isFallback,
        ...(q.note ? { asOfNote: q.note } : {}),
        updateTime: new Date().toISOString(),
        source: tierAvailable ? 'eastmoney' : 'unavailable',
        note,
      },
      dataSource,
      notes: {
        tiers: tierAvailable ? undefined : '5 档主力/超大单/大单/中单/小单净流入：数据源未接入',
        market: marketNote,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('获取全市场资金流失败:', error);
    res.json({
      success: false,
      data: {
        tiers: { main: null, superLarge: null, large: null, medium: null, small: null },
        market: null,
        updateTime: new Date().toISOString(),
        source: 'unavailable',
      },
      dataSource: 'unavailable',
      error: error instanceof Error ? error.message : 'unknown',
      timestamp: new Date().toISOString(),
    });
  }
}));

/**
 * 从东方财富 push2 聚合全市场 5 档资金流（实时）。
 * 沙箱网络下不可达时返回 null，由调用方诚实降级。
 *
 * 诚实红线：逐字段累计**实际取到的**数值并计数；某档位一个数值都没取到 →
 * 该档位为 null（未取到），不返回 0（0 会被前端当作"全市场主力净流入为 0"）。
 */
async function fetchMarketTiers(): Promise<{
  main: number | null; superLarge: number | null; large: number | null;
  medium: number | null; small: number | null;
} | null> {
  try {
    const url = 'https://push2.eastmoney.com/api/qt/clist/get';
    const response = await axios.get(url, {
      params: {
        pn: 1,
        pz: 6000,
        fs: 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23',
        fields: 'f62,f184,f66,f72,f78,f84',
        _: Date.now(),
      },
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://data.eastmoney.com' },
    });

    const items = response.data?.data?.diff || [];
    if (!items.length) return null;

    const acc = { main: 0, superLarge: 0, large: 0, medium: 0, small: 0 };
    const seen = { main: 0, superLarge: 0, large: 0, medium: 0, small: 0 };
    for (const it of items) {
      const fields = [
        ['main', it?.f184],
        ['superLarge', it?.f66],
        ['large', it?.f72],
        ['medium', it?.f78],
        ['small', it?.f84],
      ] as const;
      for (const [key, raw] of fields) {
        const n = honestNumber(raw);
        // 缺失（'-' / null / 非数）不计入分子也不计数，避免把缺失当 0 摊进总额
        if (n === null) continue;
        acc[key] += n;
        seen[key] += 1;
      }
    }
    const build = (key: keyof typeof acc): number | null => (seen[key] > 0 ? acc[key] : null);
    const result = {
      main: build('main'),
      superLarge: build('superLarge'),
      large: build('large'),
      medium: build('medium'),
      small: build('small'),
    };
    // 五个档位一个数值都没拿到 → 整体不可用，交给调用方降级（不是"净流入 0"）
    return Object.values(result).some((v) => v !== null) ? result : null;
  } catch {
    return null;
  }
}

/**
 * 获取行业资金流向排行
 * GET /api/fund-flow/industry
 *
 * 诚实契约（2026-11-01）：
 *   - 三个业务量字段缺失一律 null（`|| 0` 已清除），真实 0 仍是 0；
 *   - 顶层 dataSource 与 data.dataSource 同源（旧实现只有 data.source，顶层缺 dataSource）；
 *   - 空列表必带 dataSource:'unavailable' + 中文 note，绝不返回无因由的空壳。
 */
router.get('/fund-flow/industry', validateQuery(schemas.industryFlowQuery), async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await fetchIndustryFlow();
    const industries = result.industries.slice(0, limit);

    res.json({
      success: true,
      data: {
        industries,
        count: industries.length,
        dataSource: result.dataSource,
        // 数据所属交易日：上游给了才有（东财 f124），取不到如实 null
        asOf: result.asOf,
        // 兼容既有消费点：data.source 保留，语义与 dataSource 一致
        source: result.dataSource,
        updateTime: new Date().toISOString(),
        note: result.note,
      },
      dataSource: result.dataSource,
      notes: { industry: result.note },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('获取行业资金流向失败:', error);
    // 失败也要如实标注来源，不能只给 500 一句话（前端据此走 unavailable 降级）
    res.status(500).json({
      success: false,
      dataSource: 'unavailable',
      error: '获取行业资金流向失败',
      notes: { industry: '行业资金流：后端处理异常，未返回任何数值' },
    });
  }
});

/**
 * 批量获取资金流向
 * POST /api/fund-flow/batch
 */
router.post('/fund-flow/batch', validateBody(schemas.fundFlowBatch), async (req: Request, res: Response) => {
  try {
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({ success: false, error: '需要提供股票代码数组' });
    }

    if (symbols.length > 30) {
      return res.status(400).json({ success: false, error: '批量查询最多支持30只股票' });
    }

    const results: FundFlowData[] = [];
    const sources = new Set<string>();

    for (const symbol of symbols) {
      const norm = normalizeSymbol(symbol);
      const flow = await resolveStockFlow(norm);
      if (flow.current) {
        const stock = await db.getStockBySymbol(norm);
        if (stock) {
          results.push({ ...flow.current, name: stock.name });
          sources.add(flow.dataSource);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // 顶层 dataSource 与各条目共识：全部同源则取该源，混合/全空如实标注
    const batchSource =
      sources.size === 0 ? 'unavailable' : sources.size === 1 ? [...sources][0] : 'mixed';

    res.json({
      success: true,
      data: { flows: results, count: results.length },
      dataSource: batchSource,
      notes:
        batchSource === 'unavailable'
          ? { flows: '批量资金流：东财/新浪真实源均不可达，未返回任何生成数据' }
          : undefined,
    });
  } catch (error) {
    console.error('批量获取资金流向失败:', error);
    res.status(500).json({ success: false, error: '批量获取资金流向失败' });
  }
});

/**
 * 获取个股资金流向
 * GET /api/fund-flow/:symbol
 * ⚠️ 必须注册在所有静态路径路由之后（见顶部路由顺序约定）。
 *
 * 符号兼容：600519 / 600519.SH / sh600519（内部统一规范为 600519.SH 后查库）。
 *
 * 诚实红线（验收点）：
 *   - 真实源解析链：东财实时 → 新浪最近交易日 → 统一降级；
 *   - 响应顶层 dataSource、data.dataSource、current/history 各层 dataSource 完全一致，
 *     杜绝历史版本"顶层 eastmoney / current 层无标注或 demo"的两级矛盾；
 *   - 链中无任何生成/演示数据，两源均不可达时 current=null、history=[]、全层 unavailable + 诚实 notes。
 */
router.get('/fund-flow/:symbol', validateParams(schemas.stockSymbol), validateQuery(schemas.fundFlowQuery), async (req: Request, res: Response) => {
  try {
    const norm = normalizeSymbol(req.params.symbol);
    // 不同库后端 symbol 存法不同：Postgres 为 600519.SH，内存库 JSON 清单为裸代码 600519。
    // 依次尝试：规范化全码 → 裸代码 → 原始入参，三种格式（600519 / 600519.SH / sh600519）都要兼容。
    const bare = norm.includes('.') ? norm.slice(0, norm.indexOf('.')) : norm;
    const stock =
      (await db.getStockBySymbol(norm)) ||
      (bare !== norm ? await db.getStockBySymbol(bare) : null) ||
      (await db.getStockBySymbol(req.params.symbol));

    if (!stock) {
      return res.status(404).json({ success: false, error: '股票未找到' });
    }

    const flow = await resolveStockFlow(norm);
    const now = new Date().toISOString();

    if (!flow.current) {
      // 东财/新浪真实源均不可达：如实空态 + 全层一致的 unavailable
      return res.json({
        success: true,
        data: {
          current: null,
          history: [],
          dataSource: 'unavailable' as const,
          note: '个股资金流：东财（实时）与新浪（最近交易日）真实源均暂不可达，后端未接入兜底数据',
        },
        dataSource: 'unavailable' as const,
        notes: {
          current: '当前资金流：真实源不可达',
          history: '历史资金流：真实源不可达',
        },
        timestamp: now,
      });
    }

    const current = { ...flow.current, name: stock.name, dataSource: flow.dataSource };
    const history = flow.history.map((h) => ({ ...h, name: stock.name, dataSource: flow.dataSource }));

    res.json({
      success: true,
      data: {
        current,
        history,
        dataSource: flow.dataSource,
        note:
          flow.dataSource === 'sina'
            ? '东财实时源不可达，current/history 为新浪财经最近交易日真实资金流（非当日实时）'
            : undefined,
      },
      dataSource: flow.dataSource,
      notes: {
        current:
          flow.dataSource === 'eastmoney'
            ? '当前资金流：东方财富实时（沙箱间歇不可达，失败自动降级新浪）'
            : '当前资金流：新浪财经最近交易日',
        history: history.length > 0 ? `历史资金流：${history.length} 个交易日` : '历史资金流：真实源不可达',
      },
      timestamp: now,
    });
  } catch (error) {
    console.error('获取资金流向失败:', error);
    res.status(500).json({ success: false, error: '获取资金流向失败' });
  }
});

export default router;
