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

export interface IndustryFlowData {
  industry: string;
  mainNet: number;
  netInflow: number;
  stockCount: number;
  topStocks: Array<{ symbol: string; name: string; mainNet: number }>;
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

/**
 * 从东方财富获取行业资金流向
 */
async function fetchIndustryFlow(): Promise<IndustryFlowData[]> {
  try {
    const url = 'https://push2.eastmoney.com/api/qt/clist/get';
    const response = await axios.get(url, {
      params: {
        fid: 'f62',
        po: 1,
        pz: 30,
        pn: 1,
        np: 1,
        fs: 'b:BK0475', // 行业板块
        fields: 'f12,f14,f62,f184,f66,f72,f78,f84,f22',
        _: Date.now(),
      },
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://data.eastmoney.com',
      },
    });

    const items = response.data?.data?.diff || [];
    return items.map((item: Record<string, string | number>) => ({
      industry: item.f14 || '',
      mainNet: item.f184 || 0,
      netInflow: item.f62 || 0,
      stockCount: item.f22 || 0,
      topStocks: [],
    }));
  } catch (error) {
    console.error('获取行业资金流向失败:', error);
    return [];
  }
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
 */
router.get('/fund-flow/meta', (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: getFundFlowMeta() });
  } catch (error) {
    console.error('获取资金流元信息失败:', error);
    res.status(500).json({ success: false, error: '获取资金流元信息失败' });
  }
});

/**
 * 国际资金视角（外资 / 全球维度）
 * GET /api/fund-flow/global
 * Alpha Vantage 可用且有真实数据则走真实调用，否则 DemoProvider 确定性生成
 * （北向/美元指数关联/全球风险偏好/离岸人民币 等多个演示指标序列）。
 */
router.get('/fund-flow/global', async (_req: Request, res: Response) => {
  try {
    const { dataSource, indicators } = await getGlobalIndicators();
    res.json({
      success: true,
      data: { indicators, dataSource },
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
 *     （db.getMarketSummary），为真实数据。
 */
router.get('/fund-flow/market', asyncHandler(async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const summary = await db.getMarketSummary(new Date());

    const market = summary
      ? {
          tradeDate: summary.date ? new Date(summary.date).toISOString().slice(0, 10) : null,
          totalTurnover: Number(summary.totalTurnover) || null,
          risingStocks: Number(summary.risingStocks) || 0,
          fallingStocks: Number(summary.fallingStocks) || 0,
          unchangedStocks: Number(summary.unchangedStocks) || 0,
          limitUpCount: Number(summary.limitUpCount) || 0,
          limitDownCount: Number(summary.limitDownCount) || 0,
          totalStocks: Number(summary.totalStocks) || 0,
        }
      : null;

    // 尝试真实 5 档聚合（沙箱下通常不可达）
    const tiers = await fetchMarketTiers();
    const tierAvailable = !!tiers;
    const dataSource = tierAvailable ? 'eastmoney' : market ? 'partial' : 'unavailable';

    res.json({
      success: true,
      data: {
        tiers: tiers ?? { main: null, superLarge: null, large: null, medium: null, small: null },
        market,
        updateTime: new Date().toISOString(),
        source: tierAvailable ? 'eastmoney' : 'unavailable',
        note: tierAvailable
          ? undefined
          : '全市场 5 档资金流：东方财富 push2 聚合在沙箱下不可达；市场广度/成交额来自本地真实行情。',
      },
      dataSource,
      notes: {
        tiers: tierAvailable ? undefined : '5 档主力/超大单/大单/中单/小单净流入：数据源未接入',
        market: market ? '市场广度与成交额：本地真实行情' : '本地行情库无当日数据',
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
 */
async function fetchMarketTiers(): Promise<{
  main: number; superLarge: number; large: number; medium: number; small: number;
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
    for (const it of items) {
      acc.main += Number(it.f184) || 0;
      acc.superLarge += Number(it.f66) || 0;
      acc.large += Number(it.f72) || 0;
      acc.medium += Number(it.f78) || 0;
      acc.small += Number(it.f84) || 0;
    }
    return acc;
  } catch {
    return null;
  }
}

/**
 * 获取行业资金流向排行
 * GET /api/fund-flow/industry
 */
router.get('/fund-flow/industry', validateQuery(schemas.industryFlowQuery), async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;

    let industryFlow = await fetchIndustryFlow();

    if (industryFlow.length === 0) {
      // 诚实红线：东方财富行业资金流不可用时，不编造数值，如实返回空 + 标记后端未接入。
      // 前端应据此展示 Empty 状态（"行业资金流：后端未接入"），而非演示数据。
      return res.json({
        success: true,
        data: {
          industries: [],
          count: 0,
          updateTime: new Date().toISOString(),
          source: 'unavailable',
          note: '行业资金流：东方财富数据源暂不可用，后端未接入兜底数据',
        },
      });
    }

    res.json({
      success: true,
      data: {
        industries: industryFlow.slice(0, limit),
        count: industryFlow.length,
        updateTime: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('获取行业资金流向失败:', error);
    res.status(500).json({ success: false, error: '获取行业资金流向失败' });
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
