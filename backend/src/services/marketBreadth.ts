/**
 * 市场宽度分析服务
 * 提供涨跌家数比、涨跌停家数、市场情绪指标
 *
 * 真实源（2026-10-06 起）：
 * - 涨跌家数/涨跌停家数/成交额：腾讯财经 qt.gtimg.cn 逐标的实时行情，
 *   标的清单来自 PostgreSQL `stocks` 表的真实股票清单（is_active=true）。
 *   东财 push2 ulist 在本机网络不可达（HTTP 000），已不再作为 breadth 的数据源。
 * - 新高/新低：腾讯行情源**不提供**，诚实置 null（见 UNAVAILABLE_FIELDS 注释）。
 *
 * 诚实红线：
 * - 绝不用 0/随机数/估算值冒充真实统计；覆盖不足时直接抛 BreadthUnavailableError。
 * - 涨跌停判定使用腾讯返回的真实涨跌停价字段（[47]/[48]），非涨跌幅阈值近似，
 *   因此包含科创板/创业板 ±20%、ST ±5%、B 股 ±5% 等全部真实涨跌停制度。
 */

import { EventEmitter } from 'events';
import { getDb } from '../db/dbFactory';

const TENCENT_QUOTE_ENDPOINT = 'https://qt.gtimg.cn/q=';
const FETCH_TIMEOUT_MS = 8000;
/** 腾讯单请求 ≤300 标的稳定（实测 5544 只 / 19 批 / 8 并发 ≈ 0.5s） */
const BATCH_SIZE = 300;
const BATCH_CONCURRENCY = 8;
/** 覆盖率低于此阈值视为源不可信 → 抛 BreadthUnavailableError，不输出「半个市场」 */
const MIN_COVERAGE_RATIO = 0.5;

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 真实涨跌分布源不可用时抛出，供路由层降级为「诚实空」（绝不回填模拟数据）。
 */
export class BreadthUnavailableError extends Error {
  constructor(msg = '涨跌分布真实源暂不可用（后端未接入或网络受限）') {
    super(msg);
    this.name = 'BreadthUnavailableError';
  }
}

/**
 * 无真实源的字段。对这些字段置 null 是「诚实不可用」，
 * **不得**改成 0 —— 0 会被读成「今日无新高/新低」这一市场结论。
 */
const UNAVAILABLE_FIELDS = ['newHighs', 'newLows'] as const;

export interface BreadthData {
  timestamp: number;
  advancing: number;
  declining: number;
  unchanged: number;
  totalStocks: number;
  advanceDeclineRatio: number;
  /** 无真实源：恒为 null（非「0 = 今日无新高」） */
  newHighs: number | null;
  /** 无真实源：恒为 null（非「0 = 今日无新低」） */
  newLows: number | null;
  upVolume: number;
  downVolume: number;
  volumeRatio: number;
  /** 真实涨跌停家数（按交易所涨跌停价判定，见 buildBreadth 注释） */
  limitUp: number;
  limitDown: number;
  /** 全市场成交额（元，真实） */
  turnover: number;
  marketSentiment: 'bullish' | 'bearish' | 'neutral';
  sentimentScore: number; // -100 to 100
  /** 行情源标识（真实源名，非 'real'/'live' 这类泛化标签） */
  dataSource: string;
  /** 统计口径说明，供前端/用户核对，避免误读 */
  caliber: string;
  /** 标的清单总数（来自 stocks 表） */
  requestedSymbols: number;
  /** 腾讯实际返回报价的标的数 */
  quotedSymbols: number;
  /** 请求了但源侧无报价（退市/长期停牌/代码不在腾讯行情库）的标的数 */
  uncoveredSymbols: number;
  /** 无真实源的字段名清单 */
  unavailableFields: string[];
  message?: string;
}

export interface SectorBreadth {
  sector: string;
  advancing: number;
  declining: number;
  avgChangePercent: number;
  strength: number; // 0-100
}

export interface BreadthHistory {
  data: BreadthData[];
  period: string;
}

/** 腾讯行情原始返回（已按 GBK 解码）中的下标常量，避免魔法数字散落 */
const F = {
  NAME: 1,
  CODE: 2,
  PRICE: 3,
  PREV_CLOSE: 4,
  CHANGE_PERCENT: 32,
  /** 成交额，单位：万元 */
  AMOUNT_WAN: 37,
  /** 涨停价（交易所口径，含 ±20%/±5% 等全部制度） */
  LIMIT_UP: 47,
  /** 跌停价（交易所口径） */
  LIMIT_DOWN: 48,
} as const;

/**
 * 归一为腾讯行情代码：`sh600000` / `sz000001` / `bj430047`。
 *
 * 不依赖 symbol 是否带 `.SH` 后缀 —— PostgreSQL 的 stocks 表是 `600000.SH`，
 * 内存库清单是裸 `600000`，两者的市场信息都在 `market` 列，故以 market 为准。
 */
export function toTencentQuoteSymbol(symbol: string, market?: string | null): string | null {
  const bare = (symbol || '').toUpperCase().replace(/^(SH|SZ|BJ)\.?/, '').replace(/\.(SH|SZ|BJ)$/, '');
  if (!/^\d{6}$/.test(bare)) return null;
  const mkt =
    (market || '').toUpperCase() ||
    (bare.startsWith('6') || bare.startsWith('9') ? 'SH'
      : bare.startsWith('0') || bare.startsWith('3') ? 'SZ'
      : bare.startsWith('4') || bare.startsWith('8') ? 'BJ'
      : '');
  if (mkt !== 'SH' && mkt !== 'SZ' && mkt !== 'BJ') return null;
  return mkt.toLowerCase() + bare;
}

interface TencentQuoteRow {
  price: number;
  prevClose: number;
  changePercent: number;
  amountYuan: number;
  limitUpPrice: number;
  limitDownPrice: number;
}

/**
 * 读取真实股票清单（PostgreSQL `stocks` 表 / 内存库同一接口）。
 * 内存库仅保留真实股票清单（无行情），因此本函数在两种库下行为一致。
 */
async function loadListedSymbols(): Promise<{ tencentSymbols: string[]; total: number }> {
  const db = getDb();
  const rows = (await db.getStocks({ page: 1, pageSize: 6000 })) as Array<{
    symbol: string;
    market?: string;
  }>;
  const tencentSymbols: string[] = [];
  for (const r of rows) {
    const s = toTencentQuoteSymbol(r.symbol, r.market);
    if (s) tencentSymbols.push(s);
  }
  return { tencentSymbols, total: rows.length };
}

/** 拉取单批腾讯行情并解析（GBK → UTF-8，否则中文名乱码） */
async function fetchTencentBatch(tencentSymbols: string[]): Promise<TencentQuoteRow[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let text: string;
  try {
    const resp = await fetch(TENCENT_QUOTE_ENDPOINT + tencentSymbols.join(','), {
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

  const out: TencentQuoteRow[] = [];
  for (const m of text.matchAll(/v_(\w+)="([^"]*)"/g)) {
    const f = m[2].split('~');
    if (f.length <= F.LIMIT_DOWN) continue;
    const price = toNum(f[F.PRICE]);
    const prevClose = toNum(f[F.PREV_CLOSE]);
    // 无报价（退市/长期停牌）时腾讯返回 0，直接跳过 —— 不计入涨跌/平盘
    if (!(price > 0) || !(prevClose > 0)) continue;
    const changePercent = toNum(f[F.CHANGE_PERCENT]);
    out.push({
      price,
      prevClose,
      // 涨跌幅优先取源字段；缺失时用现价/昨收派生（仍为真实值，非估算）
      changePercent: Number.isFinite(changePercent) && f[F.CHANGE_PERCENT] !== ''
        ? changePercent
        : +(((price - prevClose) / prevClose) * 100).toFixed(2),
      amountYuan: toNum(f[F.AMOUNT_WAN]) * 10_000, // 万元 → 元
      limitUpPrice: toNum(f[F.LIMIT_UP]),
      limitDownPrice: toNum(f[F.LIMIT_DOWN]),
    });
  }
  return out;
}

/** 并发批量拉取全市场真实行情 */
async function fetchAllQuotes(tencentSymbols: string[]): Promise<TencentQuoteRow[]> {
  const batches: string[][] = [];
  for (let i = 0; i < tencentSymbols.length; i += BATCH_SIZE) {
    batches.push(tencentSymbols.slice(i, i + BATCH_SIZE));
  }
  const collected: TencentQuoteRow[] = [];
  const failures: string[] = [];
  for (let i = 0; i < batches.length; i += BATCH_CONCURRENCY) {
    const slice = batches.slice(i, i + BATCH_CONCURRENCY);
    const settled = await Promise.allSettled(slice.map((b) => fetchTencentBatch(b)));
    settled.forEach((r, idx) => {
      if (r.status === 'fulfilled') collected.push(...r.value);
      else failures.push(`batch#${i + idx}: ${(r.reason as Error)?.message ?? 'unknown'}`);
    });
  }
  if (failures.length && failures.length === batches.length) {
    throw new Error(`腾讯行情全部批次失败（${failures.length}/${batches.length}）：${failures[0]}`);
  }
  if (failures.length) {
    console.warn(`[marketBreadth] 腾讯行情部分批次失败（${failures.length}/${batches.length}），已按覆盖率如实计入 uncovered：`, failures.slice(0, 3));
  }
  return collected;
}

/**
 * 涨跌停判定：现价与腾讯返回的**交易所涨跌停价**比较（非涨跌幅阈值近似）。
 * 容差 0.005 元用于吸收最小报价单位（0.001）与浮点误差。
 */
function isLimitUp(q: TencentQuoteRow): boolean {
  return q.limitUpPrice > 0 && q.price >= q.limitUpPrice - 0.005;
}
function isLimitDown(q: TencentQuoteRow): boolean {
  return q.limitDownPrice > 0 && q.price <= q.limitDownPrice + 0.005;
}

class MarketBreadthService extends EventEmitter {
  private cache: Map<string, { data: BreadthData; expiry: number }> = new Map();
  private sectorCache: Map<string, { data: SectorBreadth[]; expiry: number }> = new Map();
  private historyCache: Map<string, { data: BreadthHistory; expiry: number }> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds

  /**
   * 计算市场宽度数据（真实源：腾讯 qt.gtimg.cn 全市场逐标的行情）
   * 源不可用/覆盖不足时抛 BreadthUnavailableError，由路由层降级为诚实空。
   */
  async calculateBreadth(): Promise<BreadthData> {
    const cacheKey = 'breadth:current';
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    const { tencentSymbols, total } = await loadListedSymbols();
    if (tencentSymbols.length === 0) {
      throw new BreadthUnavailableError('真实股票清单为空（stocks 表无可用 symbol），无法计算涨跌家数');
    }

    const quotes = await fetchAllQuotes(tencentSymbols);
    const quotedSymbols = quotes.length;
    const coverage = quotedSymbols / tencentSymbols.length;
    if (coverage < MIN_COVERAGE_RATIO) {
      throw new BreadthUnavailableError(
        `腾讯行情覆盖率过低（${quotedSymbols}/${tencentSymbols.length}=${(coverage * 100).toFixed(1)}%），` +
        '拒绝输出不完整市场的涨跌家数',
      );
    }

    const data = buildBreadth(quotes, { total, requested: tencentSymbols.length, quoted: quotedSymbols });

    this.cache.set(cacheKey, { data, expiry: Date.now() + this.CACHE_TTL });
    this.emit('breadth:update', data);
    return data;
  }

  /**
   * 获取板块宽度分析
   */
  async getSectorBreadth(): Promise<SectorBreadth[]> {
    const cacheKey = 'sector:breadth';
    const cached = this.sectorCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    // 诚实数据：板块宽度需要“申万/东财行业板块实时涨跌家数”真实源，目前尚未接入。
    // 返回空数组（前端按“未接入”处理），绝不回填随机板块数据。
    const data: SectorBreadth[] = [];
    this.sectorCache.set(cacheKey, { data, expiry: Date.now() + this.CACHE_TTL });
    return data;
  }

  /**
   * 获取历史宽度数据
   */
  async getBreadthHistory(period: '1d' | '5d' | '1m' | '3m' = '5d'): Promise<BreadthHistory> {
    const cacheKey = `history:${period}`;
    const cached = this.historyCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    // 诚实数据：历史宽度时序需要持久化的盘中快照，目前后端未落库，无法回填真实序列。
    // 返回空序列（前端按“未接入”处理），绝不生成随机历史曲线。
    const result: BreadthHistory = { data: [], period };
    this.historyCache.set(cacheKey, { data: result, expiry: Date.now() + this.CACHE_TTL * 2 });
    return result;
  }

  /**
   * 获取McClellan振荡器 (市场广度动量指标)
   */
  async getMcClellanOscillator(): Promise<{ value: number; signal: 'overbought' | 'oversold' | 'neutral'; trend: string }> {
    const history = await this.getBreadthHistory('1m');
    const adValues = history.data.map(d => d.advancing - d.declining);

    // EMA19 - EMA39 简化计算
    const ema19 = this.calculateEMA(adValues, 19);
    const ema39 = this.calculateEMA(adValues, 39);
    const value = Math.round((ema19 - ema39) * 100) / 100;

    let signal: 'overbought' | 'oversold' | 'neutral';
    if (value > 100) signal = 'overbought';
    else if (value < -100) signal = 'oversold';
    else signal = 'neutral';

    const trend = value > 0 ? '上升趋势' : '下降趋势';
    return { value, signal, trend };
  }

  private calculateEMA(data: number[], period: number): number {
    if (data.length === 0) return 0;
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
    this.sectorCache.clear();
    this.historyCache.clear();
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { breadth: number; sectors: number; history: number } {
    return {
      breadth: this.cache.size,
      sectors: this.sectorCache.size,
      history: this.historyCache.size,
    };
  }
}

/**
 * 由真实行情行聚合出市场宽度。口径全部来自腾讯返回的真实字段，无估算/模拟。
 */
function buildBreadth(
  quotes: TencentQuoteRow[],
  meta: { total: number; requested: number; quoted: number },
): BreadthData {
  let advancing = 0;
  let declining = 0;
  let unchanged = 0;
  let limitUp = 0;
  let limitDown = 0;
  let upVolume = 0;
  let downVolume = 0;
  let turnover = 0;

  for (const q of quotes) {
    if (q.changePercent > 0) {
      advancing++;
      upVolume += q.amountYuan;
    } else if (q.changePercent < 0) {
      declining++;
      downVolume += q.amountYuan;
    } else {
      unchanged++;
    }
    if (isLimitUp(q)) limitUp++;
    if (isLimitDown(q)) limitDown++;
    turnover += q.amountYuan;
  }

  const totalStocks = advancing + declining + unchanged;
  const advanceDeclineRatio = declining > 0 ? +(advancing / declining).toFixed(2) : advancing > 0 ? 999 : 0;
  const volumeRatio = downVolume > 0 ? +(upVolume / downVolume).toFixed(3) : upVolume > 0 ? 999 : 0;

  // 情绪评分：仅基于真实可推导的涨跌比 + 量能比（不依赖缺失字段）
  const ratioScore = Math.min(Math.max((advanceDeclineRatio - 1) * 30, -50), 50);
  const volumeScore = volumeRatio ? Math.min(Math.max((volumeRatio - 1) * 20, -30), 30) : 0;
  const rawScore = Math.round(ratioScore + volumeScore);
  const sentimentScore = Math.max(-100, Math.min(100, rawScore));

  let marketSentiment: 'bullish' | 'bearish' | 'neutral';
  if (sentimentScore > 20) marketSentiment = 'bullish';
  else if (sentimentScore < -20) marketSentiment = 'bearish';
  else marketSentiment = 'neutral';

  const uncovered = Math.max(meta.requested - meta.quoted, 0);

  return {
    timestamp: Date.now(),
    advancing,
    declining,
    unchanged,
    totalStocks,
    advanceDeclineRatio,
    // 腾讯行情源不提供历史新高/新低统计 → 诚实置 null。
    // 置 0 会被读成「今日无新高/新低」这一市场结论，属伪造，故不可用 0。
    newHighs: null,
    newLows: null,
    upVolume,
    downVolume,
    volumeRatio,
    limitUp,
    limitDown,
    turnover,
    marketSentiment,
    sentimentScore,
    dataSource: 'tencent',
    caliber:
      '涨跌家数/成交额/涨跌停家数：腾讯 qt.gtimg.cn 逐标的真实行情本地聚合；' +
      `标的清单=stocks 表真实清单（共 ${meta.total} 只，本次请求 ${meta.requested} 只、源侧返回报价 ${meta.quoted} 只）；` +
      '涨跌停判定=现价与交易所涨跌停价比较（含 ±20%/±5% 全部制度，非涨跌幅阈值近似）；' +
      '涨跌停家数不计入 advancing/declining/unchanged 之外的其他字段。',
    requestedSymbols: meta.requested,
    quotedSymbols: meta.quoted,
    uncoveredSymbols: uncovered,
    unavailableFields: [...UNAVAILABLE_FIELDS],
    message:
      `newHighs/newLows 为 null：腾讯行情源不提供历史新高/新低统计（诚实不可用，非「0 = 今日无新高」）。` +
      (uncovered > 0
        ? `另有 ${uncovered} 只清单内标的源侧无报价（退市/长期停牌/不在腾讯行情库），未计入涨跌家数。`
        : ''),
  };
}

export const marketBreadthService = new MarketBreadthService();
export default marketBreadthService;
