/**
 * AI 智能分析 API 路由（真实数据版）
 *
 * 数据来源（全部真实、免 key、2026-11-03 逐条实测可达）：
 * - 候选池：库内 `daily_quotes` 最新真实交易日按**成交额** top N（排除指数行），
 *   即"全市场"派生，而非固定的 15 只观察名单；
 * - 个股实时行情（价格/涨跌幅/成交额/PE/PB/总市值）：**腾讯** qt.gtimg.cn（批量、GBK）；
 * - 个股日线（收盘 + 成交量，用于技术面 MA/RSI/MACD/BOLL）：库内 `daily_quotes`
 *   （不复权），缺历史时兜底 services/klineDataService（东财 fqt=0 / 腾讯 bfq，同为不复权）；
 * - 财务指标（ROE/营收增长/利润增长）：复用 services/financialsDataService.ts（东财数据中心）。
 *
 * ★ 为什么不用 push2：`push2.eastmoney.com` 在本机与生产均不可达（curl exit 52 /
 *   fetch failed）。原实现逐只打 push2 且只覆盖硬编码的 15 只，导致端点长期
 *   `dataSource:'unavailable'`，同时又名义上叫"全市场 AI 选股"——两处都不成立。
 *   现改为腾讯批量报价 + 库内全市场候选池。
 *
 * 遵守「诚实数据」红线：
 * - 移除全部随机数伪造数据；
 * - 真实源不可达 → 返回 dataSource:'unavailable' + 空 data，绝不 fallback 到伪造；
 * - 部分个股失败时跳过该股（不回填模拟），并在 universe 中如实披露覆盖数；
 * - 响应显式声明候选池来源（universe），调用方可据此判断"全市场"还是"兜底名单"。
 */

import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { validateQuery } from '../middleware/validation';
import { asyncHandler, sendNotFound } from '../utils/apiResponse';
import {
  analyzeStock,
  generateRecommendations,
  detectAbnormalEvents,
  analyzeSectorRotation,
  StockData,
} from '../utils/aiAnalysis';
import {
  getFinancialIndicators,
} from '../services/financialsDataService';
import { getKline } from '../services/klineDataService';
import { fetchTencentQuotes, toTencentCode } from '../services/tencentQuoteService';
import { isIndexSymbol } from '../utils/indexSymbol';
import { queryCache } from '../utils/queryCache';
import { db } from '../db/dbFactory';
import { normalizeSymbol, toBareCode } from '../utils/symbolUtils';
import type { Stock } from '../models/Stock';

import { aiTiming } from '../middleware/aiTiming';
import {
  loadKnowledgeBase,
  buildKnowledgeSearchPayload,
  retrieveKnowledge,
  deriveKnowledgeConfidence,
  KnowledgeCorpus,
  RetrievedChunk,
} from '../utils/knowledgeRetrieval';

const router = Router();

// F12/A-07: AI 接口耗时日志（端点/状态/耗时/首字节）
router.use(aiTiming);

// ==================== 真实数据源 ====================

/** 财务指标并发上限：东财数据中心实测 8 并发下 60 只耗时 1.1s 且全部 200，不触发限流 */
const FINANCIAL_CONCURRENCY = 8;
/** 单只个股技术面所需日线根数（MACD 需 ≥26，取 60 留平滑余量） */
const KLINE_BARS = 60;
/** 候选池默认 / 上限规模（全市场按成交额排序后的前 N 名） */
export const UNIVERSE_DEFAULT_SIZE = 60;
export const UNIVERSE_MAX_SIZE = 200;
/** 推荐榜对外返回条数。
 * generateRecommendations 历史上只截前 5 条，前端无法据此形成榜单；
 * 而候选池已扩到 60 只，只给 5 条等于把 55 只的评分结果丢掉。
 * 这里统一输出前 20 名（元素结构与 generateRecommendations 完全一致，同一套评分函数产出）。 */
const RECOMMENDATION_LIST_SIZE = 20;

/** AI 分析兜底观察名单（**仅在库内行情不可用时使用**）。
 *
 * 历史背景：本常量曾是**唯一**候选池 —— 端点名义上是"全市场 AI 选股"，
 * 实际只在 15 只里排序，属名不副实。现降级为 DB 不可用时的兜底，
 * 且在响应 universe.source 里显式标为 `builtinWatchlistFallback`，调用方一眼可辨。
 * 覆盖白酒/新能源/汽车/保险/银行/家电/安防/半导体/光伏/电子/医药/商业/证券/电力。 */
const AI_WATCHLIST: Array<{ symbol: string; name: string; industry: string }> = [
  { symbol: '600519.SH', name: '贵州茅台', industry: '白酒' },
  { symbol: '000858.SZ', name: '五粮液', industry: '白酒' },
  { symbol: '300750.SZ', name: '宁德时代', industry: '新能源' },
  { symbol: '002594.SZ', name: '比亚迪', industry: '汽车' },
  { symbol: '601318.SH', name: '中国平安', industry: '保险' },
  { symbol: '600036.SH', name: '招商银行', industry: '银行' },
  { symbol: '000333.SZ', name: '美的集团', industry: '家电' },
  { symbol: '002415.SZ', name: '海康威视', industry: '安防' },
  { symbol: '688981.SH', name: '中芯国际', industry: '半导体' },
  { symbol: '601012.SH', name: '隆基绿能', industry: '光伏' },
  { symbol: '002475.SZ', name: '立讯精密', industry: '电子' },
  { symbol: '603259.SH', name: '药明康德', industry: '医药' },
  { symbol: '601888.SH', name: '中国中免', industry: '商业' },
  { symbol: '300059.SZ', name: '东方财富', industry: '证券' },
  { symbol: '600900.SH', name: '长江电力', industry: '电力' },
];

// ==================== 候选池（全市场派生） ====================

/** 并发受限的 allSettled：按 limit 分批，避免一次性打满上游（东财财务接口） */
async function settleInChunks<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const out: Array<PromiseSettledResult<R>> = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    out.push(...(await Promise.allSettled(chunk.map(fn))));
  }
  return out;
}

/** pg 的 DATE 会被驱动解析为本地时区 Date；按本地分量取 YYYY-MM-DD，避免 UTC 回退一天 */
function toDateStr(v: unknown): string {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v ?? '').slice(0, 10);
}

export interface UniverseMember {
  /** 库内符号形态：600519.SH / 000001.SZ */
  symbol: string;
  name: string;
  industry: string;
  /** 库内当日成交额（元），即候选池排序依据 */
  turnover: number | null;
  /** 库内 PE/PB：腾讯报价缺失时的真实备份，绝不用 0 顶替 */
  peDb: number | null;
  pbDb: number | null;
}

/** 候选池来源披露：调用方据此判断这是「全市场」还是「兜底名单」 */
export interface UniverseMeta {
  source: 'daily_quotes.topByTurnover' | 'builtinWatchlistFallback';
  /** 候选池规模（按成交额取前多少名） */
  size: number;
  /** 行情数据日（库内最新真实交易日） */
  asOf: string | null;
  rankedBy: 'turnover' | 'builtin';
  /** 实际完成评分并进入排名的只数 */
  scored: number;
  /** 因数据不可得被剔除的只数（分原因，均不回填伪造值） */
  dropped: { noQuote: number; noHistory: number; noFinancials: number; noValuation: number };
  note: string;
}

interface Universe {
  members: UniverseMember[];
  meta: Omit<UniverseMeta, 'scored'>;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 从库内 `daily_quotes` 取最新真实交易日成交额 top N 作为候选池（排除指数行）。
 *
 * 为什么不用常量名单：原实现固定 15 只却对外称"全市场 AI 选股"，
 * 属名不副实。指数行（000xxx.SH / 399xxx.SZ / 899050）的"成交额"是成份股合计，
 * 计入候选池会与个股口径混淆，故按 utils/indexSymbol 单一真源剔除。
 *
 * 库不可用 / 无行情 → 返回 null，由调用方降级为内置名单（并在 meta 中标注）。
 */
async function loadTurnoverUniverse(size: number): Promise<{ members: UniverseMember[]; asOf: string } | null> {
  const maxRow = await db.connection('daily_quotes')
    .max({ d: db.connection.raw('trade_date::text') })
    .first();
  const asOf = maxRow?.d ? String(maxRow.d).slice(0, 10) : null;
  if (!asOf) return null;

  const rows: any[] = await db.connection('daily_quotes')
    .join('stocks', 'daily_quotes.stock_id', 'stocks.id')
    .where('daily_quotes.trade_date', asOf)
    .where('stocks.is_active', true)
    .whereNotNull('daily_quotes.close_price')
    // SQL 层先按代码段剔除指数（与 utils/indexSymbol 的 INDEX_SYMBOL_SQL_PATTERNS 一致），
    // 下面再用 isIndexSymbol 做第二道校验，防止模式漂移。
    // 注：knex 3.2.4 只有 whereLike，没有 whereNotLike，故用 where(col, 'not like', v) 形式。
    .where('stocks.symbol', 'not like', '000%.SH')
    .where('stocks.symbol', 'not like', '399%.SZ')
    .select(
      'stocks.symbol as symbol',
      'stocks.name as name',
      'stocks.industry as industry',
      'stocks.pe_ratio as pe_ratio',
      'stocks.pb_ratio as pb_ratio',
      'daily_quotes.turnover as turnover',
    )
    .orderBy('daily_quotes.turnover', 'desc')
    .limit(size);

  const members = rows
    .filter((r) => !isIndexSymbol(String(r.symbol)))
    .map<UniverseMember>((r) => ({
      symbol: String(r.symbol),
      name: String(r.name ?? r.symbol),
      industry: r.industry ? String(r.industry) : '未知',
      turnover: numOrNull(r.turnover),
      peDb: numOrNull(r.pe_ratio),
      pbDb: numOrNull(r.pb_ratio),
    }));
  return members.length > 0 ? { members, asOf } : null;
}

/**
 * 批量读取库内近 KLINE_BARS 个交易日的收盘价 / 成交量（不复权），
 * 一次查询覆盖整个候选池 —— 避免为每只股票各发一次 K 线网络请求。
 */
async function loadPriceHistory(
  symbols: string[],
): Promise<Map<string, { prices: number[]; volumes: number[] }>> {
  const out = new Map<string, { prices: number[]; volumes: number[] }>();
  if (symbols.length === 0) return out;

  // 最近 KLINE_BARS 个交易日（groupBy 在 PG / 内存实现下均可用）
  const dateRows: any[] = await db.connection('daily_quotes')
    .select('trade_date')
    .groupBy('trade_date')
    .orderBy('trade_date', 'desc')
    .limit(KLINE_BARS);
  const dates = dateRows.map((r) => toDateStr(r.trade_date)).filter(Boolean);
  if (dates.length === 0) return out;

  const rows: any[] = await db.connection('daily_quotes')
    .join('stocks', 'daily_quotes.stock_id', 'stocks.id')
    .whereIn('stocks.symbol', symbols)
    .whereIn('daily_quotes.trade_date', dates)
    .select(
      'stocks.symbol as symbol',
      'daily_quotes.trade_date as trade_date',
      'daily_quotes.close_price as close_price',
      'daily_quotes.volume as volume',
    )
    .orderBy('daily_quotes.trade_date', 'asc');

  for (const r of rows) {
    const symbol = String(r.symbol);
    const close = numOrNull(r.close_price);
    if (close === null || close <= 0) continue; // 缺价不补 0，直接跳过该根
    const bucket = out.get(symbol) ?? { prices: [], volumes: [] };
    bucket.prices.push(close);
    bucket.volumes.push(numOrNull(r.volume) ?? 0);
    out.set(symbol, bucket);
  }
  return out;
}

// ==================== 单只股票的真实数据装配 ====================

/** 真实个股财务指标（最新年报）：复用 financialsDataService
 * 提供 ROE / 营收增长 / 利润增长。
 */
async function fetchStockFundamentals(symbol: string): Promise<{
  roe: number;
  revenueGrowth: number;
  profitGrowth: number;
}> {
  const indicators = await getFinancialIndicators(symbol, 1, 'annual');
  const ind = indicators[0];
  if (!ind) throw new Error(`个股 ${symbol} 财务指标缺失`);
  return {
    roe: ind.roe,
    revenueGrowth: ind.revenueGrowth,
    profitGrowth: ind.profitGrowth,
  };
}

/** 真实个股日线（不复权）：库内优先，缺失时兜底 klineDataService（东财 fqt=0 / 腾讯 bfq） */
async function fetchStockKline(symbol: string, limit = KLINE_BARS): Promise<{ prices: number[]; volumes: number[] }> {
  const kline = await getKline(symbol, limit);
  if (kline.prices.length === 0) throw new Error(`个股 ${symbol} K 线数据缺失`);
  return { prices: kline.prices, volumes: kline.volumes };
}

/**
 * 拉取一只股票的完整真实数据（腾讯报价 + 真实日线 + 财务），供 analyzeStock 使用。
 * 单股端点 /ai/analyze/:symbol 与知识检索的行情探活都走这里。
 */
async function fetchRealStock(symbol: string, name: string, industry: string): Promise<StockData> {
  const code = toTencentCode(symbol);
  if (!code) throw new Error(`无法归一化为腾讯代码: ${symbol}`);
  const quotes = await fetchTencentQuotes([code]);
  const q = quotes.get(code);
  if (!q || q.price === null || q.price <= 0) throw new Error(`个股 ${symbol} 行情数据缺失`);

  const [kline, fund] = await Promise.all([
    fetchStockKline(symbol, KLINE_BARS),
    fetchStockFundamentals(symbol),
  ]);
  // 估值缺失一律 null → 抛错让调用方诚实降级，绝不写死 0（0 会命中「PE<15 估值偏低」加分）
  if (q.pe === null || q.pb === null) throw new Error(`个股 ${symbol} 估值字段（PE/PB）缺失`);
  return {
    symbol,
    name: q.name || name,
    industry,
    prices: kline.prices,
    volumes: kline.volumes,
    pe: q.pe,
    pb: q.pb,
    roe: fund.roe,
    revenueGrowth: fund.revenueGrowth,
    profitGrowth: fund.profitGrowth,
    marketCap: q.marketCap ?? 0,
    changePercent: q.changePercent ?? 0,
  };
}

// ==================== 批量装配（全市场候选池） ====================

interface AssembledBatch {
  stocks: StockData[];
  meta: UniverseMeta;
}

/**
 * 把候选池装配成 StockData[]：
 *   1) 腾讯 qt.gtimg.cn 批量取现价 / PE / PB / 市值 / 涨跌幅（一次请求最多 50 个代码）；
 *   2) 库内批量取近 60 日不复权收盘序列（一次查询）；
 *   3) 东财数据中心按 8 并发补 ROE / 营收增长 / 利润增长。
 * 任一环节对某只股票不可得 → 该股剔除并计入 meta.dropped，绝不用 0 或随机值补位。
 */
async function assembleFromUniverse(universe: Universe, historyFromDb: boolean): Promise<AssembledBatch> {
  const members = universe.members;
  const codeOf = new Map<string, string>();
  for (const m of members) {
    const code = toTencentCode(m.symbol);
    if (code) codeOf.set(m.symbol, code);
  }

  const quotes = await fetchTencentQuotes(Array.from(codeOf.values()));
  const history = historyFromDb
    ? await loadPriceHistory(members.map((m) => m.symbol))
    : new Map<string, { prices: number[]; volumes: number[] }>();

  const dropped = { noQuote: 0, noHistory: 0, noFinancials: 0, noValuation: 0 };
  const candidates: Array<{ member: UniverseMember; prices: number[]; volumes: number[]; pe: number; pb: number; marketCap: number; changePercent: number; name: string }> = [];

  for (const m of members) {
    const code = codeOf.get(m.symbol);
    const q = code ? quotes.get(code) : undefined;
    if (!q || q.price === null || q.price <= 0) {
      dropped.noQuote++;
      continue;
    }
    // 库内序列优先；库不可用（兜底名单路径）时才逐只走真实 K 线源
    let series = history.get(m.symbol);
    if ((!series || series.prices.length === 0) && !historyFromDb) {
      try {
        series = await fetchStockKline(m.symbol, KLINE_BARS);
      } catch {
        series = undefined;
      }
    }
    // MACD 需 ≥26 根；不足则无法真实计算技术面 → 剔除
    if (!series || series.prices.length < 26) {
      dropped.noHistory++;
      continue;
    }
    const pe = q.pe ?? m.peDb;
    const pb = q.pb ?? m.pbDb;
    if (pe === null || pb === null) {
      dropped.noValuation++;
      continue;
    }
    candidates.push({
      member: m,
      prices: series.prices,
      volumes: series.volumes,
      pe,
      pb,
      marketCap: q.marketCap ?? 0,
      changePercent: q.changePercent ?? 0,
      name: q.name || m.name,
    });
  }

  // 财务指标：并发受限，失败即剔除（ROE 缺失若补 0 会命中「ROE<10 盈利偏弱」扣分，属伪造结论）
  const fundResults = await settleInChunks(candidates, FINANCIAL_CONCURRENCY, (c) =>
    fetchStockFundamentals(c.member.symbol),
  );

  const stocks: StockData[] = [];
  candidates.forEach((c, i) => {
    const r = fundResults[i];
    if (r.status !== 'fulfilled') {
      dropped.noFinancials++;
      return;
    }
    stocks.push({
      symbol: c.member.symbol,
      name: c.name,
      industry: c.member.industry,
      prices: c.prices,
      volumes: c.volumes,
      pe: c.pe,
      pb: c.pb,
      roe: r.value.roe,
      revenueGrowth: r.value.revenueGrowth,
      profitGrowth: r.value.profitGrowth,
      marketCap: c.marketCap,
      changePercent: c.changePercent,
    });
  });

  return {
    stocks,
    meta: {
      ...universe.meta,
      scored: stocks.length,
      dropped,
    },
  };
}

/** 候选池装配入口：库内全市场优先，DB 不可用时降级为内置名单并如实标注 */
async function buildUniverseStocks(size: number): Promise<AssembledBatch> {
  let dbUniverse: { members: UniverseMember[]; asOf: string } | null = null;
  try {
    dbUniverse = await loadTurnoverUniverse(size);
  } catch (e) {
    console.warn(
      '[ai-analysis] 库内候选池不可用，降级为内置名单：',
      e instanceof Error ? e.message : String(e),
    );
  }

  if (dbUniverse) {
    const batch = await assembleFromUniverse(
      {
        members: dbUniverse.members,
        meta: {
          source: 'daily_quotes.topByTurnover',
          size: size,
          asOf: dbUniverse.asOf,
          rankedBy: 'turnover',
          dropped: { noQuote: 0, noHistory: 0, noFinancials: 0, noValuation: 0 },
          note:
            `候选池取自库内 daily_quotes 最近真实交易日（${dbUniverse.asOf}）成交额前 ${size} 名，` +
            '已剔除指数行；行情来自腾讯 qt.gtimg.cn，日线与库内同为不复权口径',
        },
      },
      true,
    );
    if (batch.stocks.length > 0) return batch;
    console.warn('[ai-analysis] 库内候选池装配后为空，降级为内置名单');
  }

  // 兜底：内置名单（仅在库内候选池完全不可用时使用，meta 会显式标注）
  return assembleFromUniverse(
    {
      members: AI_WATCHLIST.map((s) => ({
        symbol: s.symbol,
        name: s.name,
        industry: s.industry,
        turnover: null,
        peDb: null,
        pbDb: null,
      })),
      meta: {
        source: 'builtinWatchlistFallback',
        size: AI_WATCHLIST.length,
        asOf: null,
        rankedBy: 'builtin',
        dropped: { noQuote: 0, noHistory: 0, noFinancials: 0, noValuation: 0 },
        note:
          '库内 daily_quotes 不可用，候选池降级为内置代表性龙头名单（非全市场），' +
          '覆盖 15 个行业各 1 只，仅作兜底，不代表市场排名',
      },
    },
    false,
  );
}

/** 解析 universe 规模入参（默认 60，上限 200，非法值回落默认） */
export function resolveUniverseSize(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return UNIVERSE_DEFAULT_SIZE;
  return Math.min(Math.floor(n), UNIVERSE_MAX_SIZE);
}

/**
 * 候选池装配 + 2 分钟进程内缓存。
 *
 * 为什么要缓存：/ai/recommendations、/alerts、/sector-rotation、/market-sentiment
 * 四个端点共用同一候选池，每次装配要对东财财务接口发 N 次请求（N 默认 60）。
 * 前端一屏可能同时打其中多个端点，不缓存会把上游打出数倍冗余流量（参见限流工单的教训）。
 * 缓存 key 含 N，失败不写缓存（queryCache.query 在抛错时直接 rethrow）。
 */
async function fetchUniverseStocks(size: number): Promise<AssembledBatch> {
  return queryCache.query(
    `ai-universe:stocks:${size}`,
    () => buildUniverseStocks(size),
    2 * 60 * 1000,
  );
}

/** 诚实空降级：源不可达时统一返回 dataSource:'unavailable' + 空 data */
function unavailable(e: unknown) {
  const message = e instanceof Error ? e.message : 'unknown';
  return { dataSource: 'unavailable' as const, message, data: null };
}

/**
 * 诚实数据契约发送器（本文件统一出口）
 *
 * 本文件原已用 sendSuccess 在 data 内输出 dataSource，但**顶层缺失**，
 * 前端无法与 { code, data } 形态的端点统一判定。
 * 这里由**同一个 dataSource 入参**同时写出顶层与 data 内两处，
 * 结构上杜绝 IP-20 那类「顶层 real / 行级 unavailable」的矛盾。
 */
function sendHonest(res: Response, dataSource: 'real' | 'unavailable', data: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    success: true,
    dataSource,
    data: { ...data, dataSource },
    timestamp: new Date().toISOString(),
  });
}

// ==================== RAG 二期：本地知识库语料缓存 ====================
// 懒加载一次，避免每次请求重复读盘；后续可借 reloadKnowledgeBase 做增量重载，
// 无需全量重启（对应二期「知识库增量更新机制」项，此处先留钩子）。

let knowledgeCorpusCache: KnowledgeCorpus | null = null;

function getKnowledgeCorpus(): KnowledgeCorpus {
  if (!knowledgeCorpusCache) {
    knowledgeCorpusCache = loadKnowledgeBase();
    console.log(
      `[ai-analysis] 知识库已加载：available=${knowledgeCorpusCache.available}, chunks=${knowledgeCorpusCache.chunks.length}`,
    );
  }
  return knowledgeCorpusCache;
}

/** 知识库增量重载钩子（文件变更后调用，局部刷新，无需重启进程） */
export function reloadKnowledgeBase(): KnowledgeCorpus {
  knowledgeCorpusCache = loadKnowledgeBase();
  return knowledgeCorpusCache;
}

/** 对单只股票附加知识溯源引用（诚实：语料不可用时返回空数组） */
function knowledgeReferencesFor(industry: string, name: string, limit = 3): RetrievedChunk[] {
  const corpus = getKnowledgeCorpus();
  if (!corpus.available) return [];
  return retrieveKnowledge(`${industry} ${name}`, corpus, { limit });
}

// ==================== API 路由 ====================

/**
 * GET /api/ai/recommendations?universe=N
 * AI 选股推荐（真实源：库内 daily_quotes 全市场成交额 top N + 腾讯批量行情 + 真实财务）
 *
 * 候选池与覆盖度在 data.universe 中显式声明，调用方据此区分「全市场」与「兜底名单」。
 */
router.get('/ai/recommendations', asyncHandler(async (req: Request, res: Response) => {
  const size = resolveUniverseSize(req.query.universe);
  try {
    const { stocks, meta } = await fetchUniverseStocks(size);
    if (stocks.length === 0) {
      throw new Error(
        `候选池装配后无可用标的（${JSON.stringify(meta.dropped)}），不回填任何模拟评分`,
      );
    }
    const recommendation = generateRecommendations(stocks);
    // generateRecommendations 只返回前 5 条（历史契约），这里用**同一套 analyzeStock**
    // 把完整排名前十/二十名补出来给调用方；marketOutlook / confidence 仍取自上面那次调用，
    // 避免两处口径分叉。
    const ranked = stocks
      .map((s) => analyzeStock(s))
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, RECOMMENDATION_LIST_SIZE);
    sendHonest(res, 'real', { ...recommendation, stocks: ranked, universe: meta });
  } catch (e) {
    sendHonest(res, 'unavailable', {
      date: new Date().toISOString().split('T')[0],
      strategy: 'AI综合评分选股',
      stocks: [],
      marketOutlook: '数据源暂不可用',
      riskLevel: 'high',
      // 诚实红线（P0-HONESTY2）：confidence 是 0-100 的**业务量**（置信度），
      // 降级态标对了unavailable，但 0 会被读成「置信度 0%」这个真实结论。
      // 「拿不到」≠「置信度为零」→ null。
      confidence: null,
      // 失败态也声明候选池意图，避免前端把「无候选」误读成「全市场无机会」
      universe: null,
      ...unavailable(e),
    });
  }
}));

/**
 * GET /api/ai/analyze/:symbol
 * 单股 AI 分析（真实源：动态拉取该 symbol 的行情/K线/财务）
 */
router.get('/ai/analyze/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;

  // 诚实红线：只有真实存在的股票才允许进入分析流程，未知代码一律 404，
  // 绝不回落到任何占位/伪造分析。存在性以真实股票清单（DB stocks）为真源，
  // 同时兼容内存库裸码（600519）与 PG 带后缀（600519.SH）两种存储格式。
  const bare = toBareCode(symbol);
  const candidates = Array.from(new Set([bare, normalizeSymbol(bare)]));
  let known: Stock | null = null;
  let existenceChecked = false;
  try {
    for (const c of candidates) {
      const s = await db.getStockBySymbol(c);
      if (s) { known = s; break; }
    }
    existenceChecked = true;
  } catch {
    // DB 未初始化（如单测直接挂载 router 而未 initDatabase）：无法校验存在性，
    // 交由后续真实源流程判断，不臆造 404——但绝不因此伪造任何分析数据。
    existenceChecked = false;
  }
  if (existenceChecked && !known) {
    sendNotFound(res, `股票 ${symbol}`);
    return;
  }

  const watch = AI_WATCHLIST.find((s) => s.symbol === symbol);
  const industry = watch?.industry ?? known?.industry ?? '未知';
  const name = watch?.name ?? known?.name ?? symbol;

  try {
    const stock = await fetchRealStock(symbol, name, industry);
    const analysis = analyzeStock(stock);
    // 二期 RAG：融合知识库溯源（行情可得 → 置信度上限更高）
    const knowledgeReferences = knowledgeReferencesFor(stock.industry, stock.name, 3);
    const knowledgeConfidence = deriveKnowledgeConfidence(knowledgeReferences, true);
    sendHonest(res, 'real', { ...analysis, knowledgeReferences, knowledgeConfidence });
  } catch (e) {
    // 行情缺失仍尝试返回知识溯源（市场不可得 → 置信度上限下调，绝不编造）
    const knowledgeReferences = knowledgeReferencesFor(industry, name, 3);
    const knowledgeConfidence = deriveKnowledgeConfidence(knowledgeReferences, false);
    sendHonest(res, 'unavailable', { symbol, knowledgeReferences, knowledgeConfidence, ...unavailable(e) });
  }
}));

/**
 * GET /api/ai/alerts
 * 智能预警列表（真实源：全市场候选池的异动检测）
 */
const alertQuerySchema = Joi.object({
  severity: Joi.string().valid('high', 'medium', 'low').optional(),
  type: Joi.string().valid(
    'abnormal_volume', 'limit_up', 'limit_down',
    'breakout', 'breakdown', 'macd_cross', 'rsi_extreme', 'sector_rotation'
  ).optional(),
  limit: Joi.number().integer().min(1).max(50).default(20),
  universe: Joi.number().integer().min(1).max(UNIVERSE_MAX_SIZE).optional(),
});

router.get('/ai/alerts', validateQuery(alertQuerySchema), asyncHandler(async (req: Request, res: Response) => {
  const { severity, type, limit } = req.query as Record<string, string | undefined>;
  const size = resolveUniverseSize(req.query.universe);

  try {
    const { stocks, meta } = await fetchUniverseStocks(size);
    if (stocks.length === 0) {
      throw new Error(`候选池装配后无可用标的（${JSON.stringify(meta.dropped)}）`);
    }
    let alerts = detectAbnormalEvents(stocks);

    if (severity) {
      alerts = alerts.filter(a => a.severity === severity);
    }
    if (type) {
      alerts = alerts.filter(a => a.type === type);
    }

    alerts = alerts.slice(0, Number(limit));

    sendHonest(res, 'real', {
      alerts,
      total: alerts.length,
      generatedAt: new Date().toISOString(),
      universe: meta,
    });
  } catch (e) {
    sendHonest(res, 'unavailable', {
      alerts: [],
      // 诚实红线（P0-HONESTY2）：alerts:[] 在这里是**降级产物**而非真实空集
      // （源不可达 → 根本没检测过）。此时 total:0 会让用户读成
      // 「今天真的零条异动」，与真实空集无法区分→ null。
      // 注意这与 etf.ts / hkConnect.ts 的 `count: data.length` 不同：
      // 那两处 data:[] 是**真实**取到的空集，count:0 语义正确，不改。
      total: null,
      generatedAt: new Date().toISOString(),
      universe: null,
      ...unavailable(e),
    });
  }
}));

/**
 * GET /api/ai/sector-rotation
 * 行业轮动分析（真实源：基于全市场候选池的真实涨跌与动量）
 */
router.get('/ai/sector-rotation', asyncHandler(async (req: Request, res: Response) => {
  const size = resolveUniverseSize(req.query.universe);
  try {
    const { stocks, meta } = await fetchUniverseStocks(size);
    if (stocks.length === 0) {
      throw new Error(`候选池装配后无可用标的（${JSON.stringify(meta.dropped)}）`);
    }
    const rotation = analyzeSectorRotation(stocks);

    sendHonest(res, 'real', {
      sectors: rotation,
      leading: rotation.filter(s => s.currentPhase === 'leading'),
      lagging: rotation.filter(s => s.currentPhase === 'lagging'),
      analyzedAt: new Date().toISOString(),
      universe: meta,
    });
  } catch (e) {
    sendHonest(res, 'unavailable', {
      sectors: [],
      leading: [],
      lagging: [],
      analyzedAt: new Date().toISOString(),
      universe: null,
      ...unavailable(e),
    });
  }
}));

/**
 * GET /api/ai/market-sentiment
 * 市场情绪综合分析（真实源：基于全市场候选池的真实综合评分）
 */
router.get('/ai/market-sentiment', asyncHandler(async (req: Request, res: Response) => {
  const size = resolveUniverseSize(req.query.universe);
  try {
    const { stocks, meta } = await fetchUniverseStocks(size);
    if (stocks.length === 0) {
      throw new Error(`候选池装配后无可用标的（${JSON.stringify(meta.dropped)}）`);
    }
    const analyses = stocks.map(s => analyzeStock(s));

    const avgScore = analyses.reduce((a, s) => a + s.totalScore, 0) / analyses.length;
    const bullishCount = analyses.filter(s => s.recommendation === 'strong_buy' || s.recommendation === 'buy').length;
    const bearishCount = analyses.filter(s => s.recommendation === 'sell' || s.recommendation === 'strong_sell').length;

    let sentiment: string;
    let sentimentScore: number;

    if (avgScore > 65) {
      sentiment = '极度乐观';
      sentimentScore = 80;
    } else if (avgScore > 55) {
      sentiment = '偏乐观';
      sentimentScore = 60;
    } else if (avgScore > 45) {
      sentiment = '中性';
      sentimentScore = 50;
    } else if (avgScore > 35) {
      sentiment = '偏悲观';
      sentimentScore = 40;
    } else {
      sentiment = '极度悲观';
      sentimentScore = 20;
    }

    sendHonest(res, 'real', {
      sentiment,
      sentimentScore,
      avgScore: Math.round(avgScore),
      bullishCount,
      bearishCount,
      neutralCount: analyses.length - bullishCount - bearishCount,
      topBullish: analyses
        .filter(s => s.recommendation === 'strong_buy' || s.recommendation === 'buy')
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, 3)
        .map(s => ({ symbol: s.symbol, name: s.name, score: s.totalScore, recommendation: s.recommendation })),
      topBearish: analyses
        .filter(s => s.recommendation === 'sell' || s.recommendation === 'strong_sell')
        .sort((a, b) => a.totalScore - b.totalScore)
        .slice(0, 3)
        .map(s => ({ symbol: s.symbol, name: s.name, score: s.totalScore, recommendation: s.recommendation })),
      analyzedAt: new Date().toISOString(),
      universe: meta,
    });
  } catch (e) {
    sendHonest(res, 'unavailable', {
      sentiment: '数据源暂不可用',
      // 诚实红线（P0-HONESTY2）：以下全部是**业务量**（评分 / 家数），
      // 源不可达时它们是「未知」，不是「真的是 0」。
      // 旧实现把 sentimentScore/avgScore 填 0、bullish/bearish/neutralCount 填 0，
      // 前端会把这屏渲染成「情绪极度悲观(20/100)、看涨 0 家」的**真实结论**——
      // 比返回空数组隐蔽得多。→ 全部 null。
      sentimentScore: null,
      avgScore: null,
      bullishCount: null,
      bearishCount: null,
      neutralCount: null,
      topBullish: [],
      topBearish: [],
      analyzedAt: new Date().toISOString(),
      universe: null,
      ...unavailable(e),
    });
  }
}));

/**
 * GET /api/ai/knowledge-search
 * 二期 RAG：本地知识库检索 + 答案溯源 + 置信度标注
 * - 必填 ?q= 检索词；可选 ?symbol= 联动真实行情（提升置信度上限）、?limit= 截断条数。
 * - 知识库缺失/为空 → dataSource:'unavailable' + 空结果，绝不回填伪造片段。
 * - 行情缺失不阻断知识检索，仅降低置信度上限（诚实红线）。
 */
const knowledgeSearchQuerySchema = Joi.object({
  q: Joi.string().min(1).max(200).required(),
  symbol: Joi.string().optional(),
  limit: Joi.number().integer().min(1).max(20).default(5),
});

router.get('/ai/knowledge-search', validateQuery(knowledgeSearchQuerySchema), asyncHandler(async (req: Request, res: Response) => {
  const { q, symbol, limit } = req.query as Record<string, string | undefined>;
  const corpus = getKnowledgeCorpus();

  try {
    let marketContext: { available: boolean } | undefined;
    if (symbol) {
      try {
        const watch = AI_WATCHLIST.find((s) => s.symbol === symbol);
        const industry = watch?.industry ?? '未知';
        const name = watch?.name ?? symbol;
        await fetchRealStock(symbol, name, industry);
        marketContext = { available: true };
      } catch {
        marketContext = { available: false }; // 行情缺失不阻断知识检索
      }
    }

    const payload = buildKnowledgeSearchPayload(q as string, {
      corpus,
      limit: Number(limit),
      marketContext,
    });

    if (!payload.knowledgeBaseAvailable) {
      sendHonest(res, 'unavailable', { ...payload, message: '知识库暂不可用' });
      return;
    }
    sendHonest(res, 'real', { ...payload });
  } catch (e) {
    sendHonest(res, 'unavailable', {
      query: q,
      results: [],
      // 诚实红线（P0-HONESTY2）：confidence 是置信度业务量，
      // 「检索失败」≠「置信度 0%」→ null。
      confidence: null,
      knowledgeBaseAvailable: false,
      marketData: 'not_requested',
      ...unavailable(e),
    });
  }
}));

export default router;
