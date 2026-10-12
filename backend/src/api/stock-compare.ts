/**
 * 股票对比分析 API
 * 多指标雷达图 + 横向对比
 *
 * 诚实红线（P0-FABRICATE）：
 *   本文件历史上用 `symbol.charCodeAt(0)+charCodeAt(1)` 当 seed 派生全部指标
 *   （PE/PB/ROE/毛利率/…/价格/涨跌幅/市值），并直接返回给「同业对比」页面。
 *   实测茅台 price=112 而库内真实 close=1288（差 11.5 倍）—— 属编造行情。
 *   现已整体删除 charCodeAt 生成逻辑，改为：
 *     - 行情/估值（price/changePercent/marketCap/volume/pe/pb）→ 本地真实行情库 daily_quotes
 *     - 财务指标（roe/grossMargin/netMargin/revenueGrowth/profitGrowth/dividendYield）
 *       → 东方财富 RPT_LICO_FN_CPD（复用 financialsDataService，真实披露值）
 *     - 偿债指标（debtRatio/currentRatio）→ 东方财富资产负债表（真实披露值）
 *     - 任何一项取不到 → 该字段为 null 并在 metricsDataSource 注明来源/缺失，
 *       **绝不用 0 或任何算术派生值顶替**。
 *   radarScores 不再凭空生成，而是由上述真实指标按公开锚点线性映射得到，
 *   映射锚点见 RADAR_ANCHORS，并在响应里原样回传 radarBasis 供审计。
 */

import { Request, Response, Router } from 'express';
import { validateQuery, schemas } from '../middleware/validation';
import { getDb } from '../db/dbFactory';
import {
  getFinancialIndicators,
  getBalanceSheet,
  FinancialsUnavailableError,
} from '../services/financialsDataService';

const router = Router();

interface CompareMetric {
  label: string;
  key: string;
  unit: string;
  higher: 'better' | 'worse' | 'neutral';
}

const COMPARE_METRICS: CompareMetric[] = [
  { label: '市盈率(PE)', key: 'pe', unit: '倍', higher: 'worse' },
  { label: '市净率(PB)', key: 'pb', unit: '倍', higher: 'worse' },
  { label: '净资产收益率(ROE)', key: 'roe', unit: '%', higher: 'better' },
  { label: '毛利率', key: 'grossMargin', unit: '%', higher: 'better' },
  { label: '净利率', key: 'netMargin', unit: '%', higher: 'better' },
  { label: '营收增长率', key: 'revenueGrowth', unit: '%', higher: 'better' },
  { label: '净利润增长率', key: 'profitGrowth', unit: '%', higher: 'better' },
  { label: '资产负债率', key: 'debtRatio', unit: '%', higher: 'worse' },
  { label: '流动比率', key: 'currentRatio', unit: '倍', higher: 'better' },
  { label: '股息率', key: 'dividendYield', unit: '%', higher: 'better' },
];

/**
 * 雷达维度锚点（公开、可审计的线性映射，非随机/非字符码）。
 * 每项声明参与的真实指标 key；所有 key 取不到 → 该维度为 null。
 * lowerIsBetter=true 时反向映射（PE/PB/资产负债率越低越好）。
 */
const RADAR_ANCHORS: Array<{
  key: string;
  label: string;
  /** 归一化输入：把不同量纲的真实指标压到同一 [0,1] 尺度 */
  inputs: Array<{ metric: keyof CompareMetrics; lo: number; hi: number; lowerIsBetter: boolean }>;
}> = [
  {
    key: 'profitability',
    label: '盈利能力',
    inputs: [
      { metric: 'roe', lo: 0, hi: 30, lowerIsBetter: false },
      { metric: 'grossMargin', lo: 10, hi: 60, lowerIsBetter: false },
      { metric: 'netMargin', lo: 0, hi: 30, lowerIsBetter: false },
    ],
  },
  {
    key: 'growth',
    label: '成长能力',
    inputs: [
      { metric: 'revenueGrowth', lo: -20, hi: 40, lowerIsBetter: false },
      { metric: 'profitGrowth', lo: -30, hi: 50, lowerIsBetter: false },
    ],
  },
  {
    key: 'valuation',
    label: '估值水平',
    inputs: [
      { metric: 'pe', lo: 8, hi: 60, lowerIsBetter: true },
      { metric: 'pb', lo: 0.5, hi: 8, lowerIsBetter: true },
    ],
  },
  {
    key: 'stability',
    label: '财务稳健',
    inputs: [
      { metric: 'debtRatio', lo: 20, hi: 80, lowerIsBetter: true },
      { metric: 'currentRatio', lo: 0.8, hi: 3, lowerIsBetter: false },
    ],
  },
  {
    // 现金流：每股经营现金流 / 收盘价 = 经营现金流收益率（真实披露值派生）
    key: 'cashflow',
    label: '现金流',
    inputs: [{ metric: 'cashflowYield', lo: 0, hi: 10, lowerIsBetter: false }],
  },
  {
    key: 'dividend',
    label: '分红能力',
    inputs: [{ metric: 'dividendYield', lo: 0, hi: 6, lowerIsBetter: false }],
  },
];

const RADAR_INDICATORS = RADAR_ANCHORS.map((a) => ({
  key: a.key,
  label: a.label,
  fullMark: 100,
}));

interface CompareMetrics {
  pe: number | null;
  pb: number | null;
  roe: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  revenueGrowth: number | null;
  profitGrowth: number | null;
  debtRatio: number | null;
  currentRatio: number | null;
  dividendYield: number | null;
  /** 派生量：每股经营现金流 / 收盘价(%)，由真实披露值计算 */
  cashflowYield: number | null;
}

const ALL_METRIC_KEYS: Array<keyof CompareMetrics> = [
  'pe', 'pb', 'roe', 'grossMargin', 'netMargin',
  'revenueGrowth', 'profitGrowth', 'debtRatio', 'currentRatio',
  'dividendYield', 'cashflowYield',
];

/** 数值规范化：非有限值一律 null（禁止 0 冒充「取不到」） */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round(v: number | null, digits = 2): number | null {
  return v === null ? null : +v.toFixed(digits);
}

/**
 * tradeDate 归一为 YYYY-MM-DD。
 *
 * 两个坑（都实测踩过）：
 *  1. 不能直接 String(date)：Date 默认 toString 给 'Mon Oct 12 2026 ...'，
 *     截前 10 字符得到 'Mon Oct 12' 这种非日期串。
 *  2. 不能用 toISOString()：PostgreSQL 的 date 列经 pg 驱动解析为**本地午夜**，
 *     东八区下 toISOString() 会回退成前一天（2026-10-12 → '2026-10-11'），
 *     口径日期整整差一天。故按**本地**年月日取，不走 UTC。
 */
function isoDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

/** 统一股票代码 → 带市场后缀（daily_quotes/stocks 用 '600519.SH' 形态） */
function withMarketSuffix(raw: string): string {
  const digits = raw.trim().replace(/^(SH|SZ|BJ)/i, '').replace(/\.(SH|SZ|BJ)$/i, '');
  if (raw.startsWith('SH') || raw.endsWith('.SH')) return `${digits}.SH`;
  if (raw.startsWith('SZ') || raw.endsWith('.SZ')) return `${digits}.SZ`;
  if (raw.startsWith('BJ') || raw.endsWith('.BJ')) return `${digits}.BJ`;
  if (digits.startsWith('6')) return `${digits}.SH`;
  if (digits.startsWith('9')) return `${digits}.SH`;
  return `${digits}.SZ`;
}

/** 东财财务接口只需要裸 6 位代码 */
function bareDigits(raw: string): string {
  return raw.trim().replace(/^(SH|SZ|BJ)/i, '').replace(/\.(SH|SZ|BJ)$/i, '');
}

/**
 * 从行情 Map 里取该请求代码对应的行。
 * 库内 symbol 可能是裸码也可能是带后缀（symbolCandidates 两种都试），
 * 故按「带后缀 → 裸码」两种 key 依次查，避免因库内形态不同而误判为「无行情」。
 */
function pickQuote(
  quotes: Map<string, QuoteRow>,
  raw: string,
): QuoteRow | undefined {
  return quotes.get(withMarketSuffix(raw)) ?? quotes.get(bareDigits(raw));
}

interface QuoteRow {
  symbol: string;
  name: string;
  close_price: unknown;
  change_percent: unknown;
  market_cap: unknown;
  volume: unknown;
  pe_ratio: unknown;
  pb_ratio: unknown;
  trade_date: unknown;
}

/**
 * 取最新交易日行情。
 * 走 dbFactory 的抽象访问器（而非裸 knex）：
 *   - Database 实现：PostgreSQL DISTINCT ON 取每只股票最新行情
 *   - InMemoryDatabase 实现：诚实空态（无行情 → 返回空，路由层降级为 unavailable）
 * 符号归一（裸码 / 带后缀）由 symbolCandidates 统一处理，此处不重复实现。
 */
async function loadLatestQuotes(rawSymbols: string[]): Promise<Map<string, QuoteRow>> {
  const out = new Map<string, QuoteRow>();
  const rows = await getDb().getStocksWithLatestQuotes(rawSymbols);
  for (const r of rows) {
    const q: any = r.latestQuote ?? null;
    const stock: any = r;
    out.set(stock.symbol, {
      symbol: stock.symbol,
      name: stock.name,
      close_price: q?.closePrice ?? null,
      change_percent: q?.changePercent ?? null,
      market_cap: q?.marketCap ?? stock.marketCap ?? null,
      volume: q?.volume ?? null,
      pe_ratio: q?.peRatio ?? stock.peRatio ?? null,
      pb_ratio: q?.pbRatio ?? stock.pbRatio ?? null,
      trade_date: q?.tradeDate ?? null,    });
  }
  return out;
}

/** 取真实财务指标；源不可达返回全 null（不抛，交由上层诚实降级） */
async function loadFinancialMetrics(digits: string): Promise<Partial<CompareMetrics>> {
  const out: Partial<CompareMetrics> = {};
  // 主要财务指标：roe / grossMargin / netMargin / revenueGrowth / profitGrowth / dividendYield
  try {
    const inds = await getFinancialIndicators(digits, 1, 'annual');
    const latest = inds[0];
    if (latest) {
      out.roe = num(latest.roe);
      out.grossMargin = num(latest.grossMargin);
      out.netMargin = num(latest.netMargin);
      out.revenueGrowth = num(latest.revenueGrowth);
      out.profitGrowth = num(latest.profitGrowth);
      out.dividendYield = num(latest.dividendYield);
      // 每股经营现金流用于派生现金流收益率（与收盘价一起才算得出）
      if (num(latest.ocfPerShare) !== null) {
        (out as any).ocfPerShare = num(latest.ocfPerShare);
      }
    }
  } catch (e) {
    if (!(e instanceof FinancialsUnavailableError)) {
      console.warn(`[compare] 财务指标获取失败 ${digits}:`, e instanceof Error ? e.message : e);
    }
  }
  // 资产负债表：debtRatio / currentRatio
  try {
    const bs = await getBalanceSheet(digits, 1);
    const latest = bs[0];
    if (latest) {
      out.debtRatio = num(latest.debtToAssetRatio);
      out.currentRatio = num(latest.currentRatio);
    }
  } catch (e) {
    if (!(e instanceof FinancialsUnavailableError)) {
      console.warn(`[compare] 资产负债表获取失败 ${digits}:`, e instanceof Error ? e.message : e);
    }
  }
  return out;
}

/** 线性映射到 [0,100]；值缺失返回 null（不返回 0 冒充「最差」） */
function normalizeScore(value: number | null, lo: number, hi: number, lowerIsBetter: boolean): number | null {
  if (value === null) return null;
  const span = hi - lo;
  const raw = span === 0 ? 0 : (value - lo) / span;
  const clamped = Math.max(0, Math.min(1, raw));
  const scaled = lowerIsBetter ? 1 - clamped : clamped;
  return Math.round(scaled * 1000) / 10;
}

/** 由真实指标派生雷达分；任一参与指标缺失 → 该维度 null */
function buildRadarScores(metrics: CompareMetrics): Record<string, number | null> {
  const scores: Record<string, number | null> = {};
  for (const anchor of RADAR_ANCHORS) {
    const parts: number[] = [];
    for (const inp of anchor.inputs) {
      const s = normalizeScore(metrics[inp.metric] as number | null, inp.lo, inp.hi, inp.lowerIsBetter);
      if (s === null) break; // 该维度所需指标不全 → 整维不可用
      parts.push(s);
    }
    if (parts.length === 0 || parts.length < anchor.inputs.length) {
      scores[anchor.key] = null;
    } else {
      scores[anchor.key] = Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 10) / 10;
    }
  }
  return scores;
}

/**
 * 归一化 symbols 查询参数：兼容逗号分隔字符串与 qs 解析出的数组两种形态，
 * 过滤空值，避免对数组调用 .split 触发 500（IP-17 修复根因）
 */
function parseSymbols(raw: unknown): string[] {
  let str: string;
  if (Array.isArray(raw)) {
    str = raw.map(String).join(',');
  } else if (typeof raw === 'string') {
    str = raw;
  } else {
    return [];
  }
  return str
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

const UNAVAILABLE_STOCKS_MSG = '该对比标的在本地真实行情库中无任何行情记录，未返回任何编造数值';

/** 诚实数据契约发送器：顶层 dataSource 与 data.dataSource 由同一入参派生 */
function sendHonest(res: Response, dataSource: 'real' | 'partial' | 'unavailable', data: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    success: true,
    dataSource,
    data: { ...data, dataSource },
    timestamp: new Date().toISOString(),
  });
}

/**
 * 获取股票对比数据
 * GET /api/compare?symbols=600519,000858,000001
 */
router.get('/compare', validateQuery(schemas.compareSymbols), async (req: Request, res: Response) => {
  try {
    const symbols = parseSymbols(req.query.symbols).slice(0, 5); // 最多5只

    // 缺数据分支：未提供有效代码时返回空结果，不再抛错 500（IP-17）
    if (symbols.length === 0) {
      sendHonest(res, 'unavailable', {
        stocks: [],
        metrics: COMPARE_METRICS,
        count: 0,
        message: '未提供有效的股票代码',
      });
      return;
    }

    let quotes = new Map<string, QuoteRow>();
    try {
      quotes = await loadLatestQuotes(symbols);
    } catch (e) {
      console.error('[compare] 行情库查询失败:', e instanceof Error ? e.message : e);
      sendHonest(res, 'unavailable', {
        stocks: [],
        metrics: COMPARE_METRICS,
        count: 0,
        message: '本地真实行情库查询失败，未返回任何编造数值',
      });
      return;
    }

    const stocks = await Promise.all(
      symbols.map(async (symbol) => {
        const q = pickQuote(quotes, symbol);
        const price = q ? num(q.close_price) : null;

        const fin = await loadFinancialMetrics(bareDigits(symbol));
        const metrics: CompareMetrics = {
          pe: q ? num(q.pe_ratio) : null,
          pb: q ? num(q.pb_ratio) : null,
          roe: fin.roe ?? null,
          grossMargin: fin.grossMargin ?? null,
          netMargin: fin.netMargin ?? null,
          revenueGrowth: fin.revenueGrowth ?? null,
          profitGrowth: fin.profitGrowth ?? null,
          debtRatio: fin.debtRatio ?? null,
          currentRatio: fin.currentRatio ?? null,
          dividendYield: fin.dividendYield ?? null,
          cashflowYield: (() => {
            const ocf = (fin as any).ocfPerShare as number | undefined;
            if (ocf === undefined || price === null || price === 0) return null;
            return Math.round((ocf / price) * 100 * 100) / 100;
          })(),
        };

        return {
          symbol,
          name: q?.name?.trim() || null,
          quoteDate: q ? isoDate(q.trade_date) : null,
          metrics: Object.fromEntries(ALL_METRIC_KEYS.map((k) => [k, round(metrics[k])])),
          // 逐指标来源披露：真实命中的标来源，取不到的标 unavailable
          metricsDataSource: Object.fromEntries(
            ALL_METRIC_KEYS.map((k) => [
              k,
              metrics[k] !== null ? metricSource(k) : 'unavailable',
            ]),
          ),
          radarScores: buildRadarScores(metrics),
          price: round(price),
          changePercent: round(q ? num(q.change_percent) : null),
          marketCap: round(q ? num(q.market_cap) : null, 0),
          volume: round(q ? num(q.volume) : null, 0),
          hasQuote: q !== undefined && price !== null,
        };
      }),
    );

    const withQuote = stocks.filter((s) => s.hasQuote);
    // 行情是横向对比的前提：一只都取不到 → 整体 unavailable，绝不返回编造数字
    const dataSource: 'real' | 'partial' | 'unavailable' =
      withQuote.length === stocks.length ? 'real' : withQuote.length > 0 ? 'partial' : 'unavailable';

    sendHonest(res, dataSource, {
      stocks,
      metrics: COMPARE_METRICS,
      count: stocks.length,
      message:
        dataSource === 'unavailable'
          ? UNAVAILABLE_STOCKS_MSG
          : '行情/估值来自本地真实行情库 daily_quotes，财务指标来自东方财富真实披露报表；缺失项为 null',
    });
  } catch (error) {
    console.error('获取对比数据失败:', error);
    res.status(500).json({ success: false, message: '获取对比数据失败' });
  }
});

/** 指标来源标签（响应里原样回传，便于审计「这个数从哪来」） */function metricSource(key: keyof CompareMetrics): string {
  switch (key) {
    case 'pe':
    case 'pb':
      return 'db:daily_quotes';
    case 'cashflowYield':
      return 'derived:eastmoney.ocfPerShare/daily_quotes.close_price';
    default:
      return 'eastmoney:financials';
  }
}

/**
 * 获取雷达图数据（归一化 0-100）
 * GET /api/compare/radar?symbols=600519,000858
 */
router.get('/compare/radar', validateQuery(schemas.compareSymbols), async (req: Request, res: Response) => {
  try {
    const symbols = parseSymbols(req.query.symbols).slice(0, 5);

    // 缺数据分支：未提供有效代码时返回空结果，不再抛错 500（IP-17）
    if (symbols.length === 0) {
      sendHonest(res, 'unavailable', { indicators: RADAR_INDICATORS, stocks: [], message: '未提供有效的股票代码' });
      return;
    }

    let quotes: Map<string, QuoteRow>;
    try {
      quotes = await loadLatestQuotes(symbols);
    } catch (e) {
      console.error('[compare/radar] 行情库查询失败:', e instanceof Error ? e.message : e);
      sendHonest(res, 'unavailable', {
        indicators: RADAR_INDICATORS,
        stocks: [],
        message: '本地真实行情库查询失败，雷达维度未接入任何编造评分',
      });
      return;
    }

    const radarData = await Promise.all(
      symbols.map(async (symbol) => {
        const q = pickQuote(quotes, symbol);
        const price = q ? num(q.close_price) : null;
        const fin = await loadFinancialMetrics(bareDigits(symbol));
        const metrics: CompareMetrics = {
          pe: q ? num(q.pe_ratio) : null,
          pb: q ? num(q.pb_ratio) : null,
          roe: fin.roe ?? null,
          grossMargin: fin.grossMargin ?? null,
          netMargin: fin.netMargin ?? null,
          revenueGrowth: fin.revenueGrowth ?? null,
          profitGrowth: fin.profitGrowth ?? null,
          debtRatio: fin.debtRatio ?? null,
          currentRatio: fin.currentRatio ?? null,
          dividendYield: fin.dividendYield ?? null,
          cashflowYield: (() => {
            const ocf = (fin as any).ocfPerShare as number | undefined;
            if (ocf === undefined || price === null || price === 0) return null;
            return Math.round((ocf / price) * 100 * 100) / 100;
          })(),
        };
        const scores = buildRadarScores(metrics);
        const dimensionCount = RADAR_ANCHORS.length;
        const scored = RADAR_ANCHORS.filter((a) => scores[a.key] !== null).length;
        return {
          symbol,
          name: q?.name?.trim() || null,
          scores,
          // 维度覆盖度：0/6 表示该股无任何真实指标可评分，前端应展示空态而非补 0
          scoredDimensions: scored,
          totalDimensions: dimensionCount,
          hasQuote: q !== undefined && price !== null,
        };
      }),
    );

    const usable = radarData.filter((s) => s.hasQuote);
    const anyScored = radarData.some((s) => s.scoredDimensions > 0);
    const dataSource: 'real' | 'partial' | 'unavailable' =
      !anyScored ? 'unavailable' : usable.length === radarData.length ? 'real' : 'partial';

    sendHonest(res, dataSource, {
      indicators: RADAR_INDICATORS,
      stocks: radarData,
      // 公开映射锚点 + 数据来源，供审计「这个分怎么来的」
      radarBasis: {
        method: 'linear-anchor-from-real-metrics',
        description: '各维度分 = 参与的真实指标按下列锚点线性映射到 0-100 后取算术平均；参与指标缺失则该维度为 null',
        dataSources: {
          pe: 'db:daily_quotes',
          pb: 'db:daily_quotes',
          rest: 'eastmoney:financials',
          cashflowYield: 'derived:eastmoney.ocfPerShare/daily_quotes.close_price',
        },
        anchors: RADAR_ANCHORS,
      },
      message:
        dataSource === 'unavailable'
          ? '雷达评分所需的真实指标全部不可得，未返回任何编造评分'
          : '雷达分由真实指标按公开锚点线性映射得到，缺失维度为 null',
    });
  } catch (error) {
    console.error('获取雷达图数据失败:', error);
    res.status(500).json({ success: false, message: '获取雷达图数据失败' });
  }
});

export { RADAR_ANCHORS, buildRadarScores };
export default router;
