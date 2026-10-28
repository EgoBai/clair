/**
 * 指数数据服务（技术分析 + 成分股 + 成分股涨跌榜）
 *
 * 数据源（全部真实、免 key）：
 *  - 指数 K 线：klineDataService（东财优先 + 腾讯 fqkline 兜底），用于技术指标计算；
 *  - 深证系列成分（399001/399006）：深证信 cnindex.com.cn
 *      GET https://www.cnindex.com.cn/sample-detail/detail?indexcode=399006&pageNum=1&rows=2000
 *      → { code:200, data:{ total:100, rows:[{ seccode:'300750', secname:'宁德时代', weight:'13.7', dateStr:'2026-10-27' }, ...] } }
 *  - 中证/上证系列成分（000300/000905/000688/000016）：东财数据中心
 *      GET https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_INDEX_TS_COMPONENT
 *          &filter=(TYPE="1")&pageSize=1000&pageNumber=1
 *      → TYPE 语义已实测鉴别（2026-10-28）：
 *        TYPE=1 沪深300(300只，茅台 WEIGHT=3.68) / TYPE=2 上证50(50只，茅台 9.55)
 *        TYPE=3 中证500(500只，茅台不在) / TYPE=4 科创50(50只，中芯国际 8.17)
 *        每行含 SECUCODE('600519.SH') / SECURITY_NAME_ABBR / WEIGHT
 *  - 上证综指（000001）：口径=沪市A股，由库内 stocks.market='SH' 推导（综指样本即全部沪市上市证券），
 *    scopeLabel 如实标注「沪市A股（上证综指口径）」。
 *
 * 诚实数据红线：任一指数的真实成分源不可得时，该指数的 constituents/movers
 * 一律 dataSource:'unavailable' + 中文 message，**绝不**用「代码前缀」冒充成分股。
 * 全文件禁止随机数与硬编码行情。
 */

import { db } from '../db/dbFactory';
import { getKline } from './klineDataService';
import { queryCache } from '../utils/queryCache';

const FETCH_TIMEOUT_MS = 10000;

export class IndexDataUnavailableError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'IndexDataUnavailableError';
  }
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

async function fetchJson(url: string): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

// ==================== 指数符号归一化与登记表 ====================

export interface IndexSymbol {
  /** 6 位指数代码，如 000001 */
  digits: string;
  exchange: 'SH' | 'SZ';
  /** 腾讯/库内常用形态：sh000001 */
  tencent: string;
  /** 唯一登记键：SH000001 */
  key: string;
}

/** 支持三种入参形态：sh000001 / SH000001 / 000001.SH / 000001.SZ（带前缀或后缀） */
export function normalizeIndexSymbol(input: string): IndexSymbol | null {
  const trimmed = (input || '').trim().toUpperCase();
  const m = trimmed.match(/^(SH|SZ)?(\d{6})(\.(SH|SZ))?$/);
  if (!m) return null;
  const digits = m[2];
  // 交易所归属：显式前缀/后缀优先；无标注时按指数惯例推断（399xxx 为深证系列，其余默认沪市）
  const exchange = (m[1] || m[4] || (digits.startsWith('399') ? 'SZ' : 'SH')) as 'SH' | 'SZ';
  const key = `${exchange}${digits}`;
  return { digits, exchange, tencent: `${exchange.toLowerCase()}${digits}`, key };
}

interface IndexMeta {
  name: string;
  /** 成分源类型：cnindex=深证信 / eastmoney=东财数据中心(带TYPE) / db-sh-a=库内沪市A股口径 */
  source: 'cnindex' | 'eastmoney' | 'db-sh-a';
  /** eastmoney 报表的 TYPE 过滤值 */
  emType?: string;
}

/** 已探明真实成分源的指数登记表（2026-10-28 实测；未登记指数一律诚实 unavailable） */
const INDEX_META: Record<string, IndexMeta> = {
  SH000001: { name: '上证指数', source: 'db-sh-a' },
  SH000016: { name: '上证50', source: 'eastmoney', emType: '2' },
  SH000300: { name: '沪深300', source: 'eastmoney', emType: '1' },
  SH000905: { name: '中证500', source: 'eastmoney', emType: '3' },
  SH000688: { name: '科创50', source: 'eastmoney', emType: '4' },
  SZ399001: { name: '深证成指', source: 'cnindex' },
  SZ399006: { name: '创业板指', source: 'cnindex' },
};

export function getIndexName(key: string): string | undefined {
  return INDEX_META[key]?.name;
}

// ==================== 指数技术分析 ====================

export interface IndexTechResult {
  indexSymbol: string;
  indexName: string;
  asOf: string;
  /** 实际提供 K 线的源（tencent=东财失败后兜底 / eastmoney=主源成功） */
  source: 'eastmoney' | 'tencent';
  ma: { ma5: number | null; ma10: number | null; ma20: number | null; ma60: number | null };
  rsi14: number | null;
  compositeScore: number;
  positionAdvice: string;
}

/** 简单移动平均：取 closes 末 n 项均值；不足 n 项返回 null（诚实缺省，不冒充 0） */
function smaLast(closes: number[], n: number): number | null {
  if (closes.length < n) return null;
  const slice = closes.slice(-n);
  return +(slice.reduce((s, c) => s + c, 0) / n).toFixed(2);
}

/**
 * Wilder RSI(14)：需要 closes.length ≥ 15；数据不足返回 null。
 * 标准算法：首段 14 日平均涨/跌幅做种子，此后 Wilder 平滑（avg = (prev*13 + cur) / 14）。
 */
function rsiWilder(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum -= diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(2);
}

/**
 * 综合评分（0-100，纯规则加权，权重见各分支注释）：
 *  - 趋势（0-40）：收盘>MA20 +15；MA5>MA10 +10；MA10>MA20 +10；MA20>MA60 +5
 *  - 动量（0-30，RSI14 区间打分，中间偏多、极端两端减分防追高杀跌）：
 *      [50,70)→30；[40,50)→20；[70,80)→15；[30,40)→10；≥80 或 <30 →5
 *  - 位置（0-30）：收盘>MA5 +10；收盘>MA60 +10；近20交易日涨跌幅>0 +10
 * 某项数据不足（如 MA60 缺失）时该项按 0 分计、不伪造数值。
 */
function computeCompositeScore(
  close: number,
  ma: { ma5: number | null; ma10: number | null; ma20: number | null; ma60: number | null },
  rsi14: number | null,
  chg20d: number | null,
): number {
  let score = 0;
  // 趋势 40
  if (ma.ma20 !== null && close > ma.ma20) score += 15;
  if (ma.ma5 !== null && ma.ma10 !== null && ma.ma5 > ma.ma10) score += 10;
  if (ma.ma10 !== null && ma.ma20 !== null && ma.ma10 > ma.ma20) score += 10;
  if (ma.ma20 !== null && ma.ma60 !== null && ma.ma20 > ma.ma60) score += 5;
  // 动量 30
  if (rsi14 !== null) {
    if (rsi14 >= 80) score += 5;
    else if (rsi14 >= 70) score += 15;
    else if (rsi14 >= 50) score += 30;
    else if (rsi14 >= 40) score += 20;
    else if (rsi14 >= 30) score += 10;
    else score += 5;
  }
  // 位置 30
  if (ma.ma5 !== null && close > ma.ma5) score += 10;
  if (ma.ma60 !== null && close > ma.ma60) score += 10;
  if (chg20d !== null && chg20d > 0) score += 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** 规则化仓位建议（中文，按综合评分分档 + RSI 极端提示；尾部固定免责声明） */
function buildPositionAdvice(score: number, rsi14: number | null): string {
  let base: string;
  if (score >= 70) base = '短线趋势偏强，可维持 6-8 成仓位，注意沿 5 日线持股';
  else if (score >= 55) base = '震荡偏多，可维持 5-7 成仓位，回调至 20 日线附近可低吸';
  else if (score >= 45) base = '多空均衡，建议 4-6 成仓位观望，等待方向选择';
  else if (score >= 30) base = '走势偏弱，建议降至 2-4 成仓位，反弹减仓为主';
  else base = '趋势弱势，建议 ≤3 成仓位或观望，勿急于抄底';
  let rsiNote = '';
  if (rsi14 !== null) {
    if (rsi14 >= 80) rsiNote = '；RSI 已进入超买区，注意短线回撤风险';
    else if (rsi14 < 30) rsiNote = '；RSI 处于超卖区，或有技术性反弹';
  }
  return `${base}${rsiNote}。以上为规则化计算结果，仅供参考，不构成投资建议`;
}

/**
 * 获取指数技术分析（基于真实指数 K 线计算，无任何随机/硬编码数值）。
 * K 线源不可得 / 数据不足（如 <61 根无法算 MA60）→ 抛 IndexDataUnavailableError。
 */
export async function getIndexTech(symbol: string): Promise<IndexTechResult> {
  const idx = normalizeIndexSymbol(symbol);
  if (!idx) throw new IndexDataUnavailableError(`无效的指数代码: ${symbol}`);
  const meta = INDEX_META[idx.key];
  if (!meta) {
    throw new IndexDataUnavailableError(`暂无指数「${idx.key}」的真实K线技术分析支持`);
  }

  // 120 根足够 MA60 + RSI14 种子 + 20 日动量
  let kline;
  try {
    kline = await getKline(idx.tencent, 120);
  } catch (e) {
    throw new IndexDataUnavailableError(
      `指数K线真实源不可用（${e instanceof Error ? e.message : 'unknown'}）`,
    );
  }
  const closes = kline.prices.filter((c) => Number.isFinite(c));
  if (closes.length < 61) {
    throw new IndexDataUnavailableError(`指数K线样本不足（${closes.length} 根，无法计算 MA60/RSI14）`);
  }
  const close = closes[closes.length - 1];
  const ma = {
    ma5: smaLast(closes, 5),
    ma10: smaLast(closes, 10),
    ma20: smaLast(closes, 20),
    ma60: smaLast(closes, 60),
  };
  const rsi14 = rsiWilder(closes);
  // 近 20 交易日涨跌幅（收盘/20日前收盘 - 1），样本不足为 null
  const chg20d =
    closes.length >= 21
      ? +((close / closes[closes.length - 21] - 1) * 100).toFixed(2)
      : null;
  const compositeScore = computeCompositeScore(close, ma, rsi14, chg20d);

  return {
    indexSymbol: idx.tencent,
    indexName: meta.name,
    asOf: kline.dates[kline.dates.length - 1],
    // 判源依据：腾讯兜底路径无逐日成交额 → amounts 为空数组（见 klineDataService 注释），
    // 东财主源恒有 amounts。据此如实标注实际来源，不写死。
    source: kline.amounts.length === 0 ? 'tencent' : 'eastmoney',
    ma,
    rsi14,
    compositeScore,
    positionAdvice: buildPositionAdvice(compositeScore, rsi14),
  };
}

// ==================== 指数成分股 ====================

export interface ConstituentRow {
  /** 统一带交易所后缀：300750.SZ / 600519.SH */
  symbol: string;
  name: string;
  /** 权重（%，源提供才有；库内推导口径无权重 → undefined） */
  weight?: number;
}

export interface ConstituentsResult {
  indexSymbol: string;
  indexName: string;
  scopeLabel: string;
  count: number;
  constituents: ConstituentRow[];
  source: string;
  /** 成分清单的数据日期（源标注）；库内推导口径为抓取当日 */
  asOf: string;
}

const CONSTITUENTS_CACHE_TTL = 6 * 60 * 60 * 1000; // 成分清单变动极低频，缓存 6 小时

/** 东财数据中心 RPT_INDEX_TS_COMPONENT：按 TYPE 分页拉全（pageSize=1000） */
async function fetchEastmoneyConstituents(emType: string): Promise<ConstituentRow[]> {
  const out: ConstituentRow[] = [];
  const pageSize = 1000;
  for (let page = 1; page <= 10; page++) {
    const url =
      'https://datacenter-web.eastmoney.com/api/data/v1/get' +
      `?reportName=RPT_INDEX_TS_COMPONENT` +
      `&columns=SECUCODE,SECURITY_NAME_ABBR,WEIGHT` +
      `&filter=(TYPE%3D%22${emType}%22)` +
      `&pageSize=${pageSize}&pageNumber=${page}&source=WEB&client=WEB`;
    const j = await fetchJson(url);
    const rows = j?.result?.data;
    if (!Array.isArray(rows)) {
      throw new IndexDataUnavailableError(
        `东财成分源返回异常（${j?.message ?? 'result 为空'}）`,
      );
    }
    for (const r of rows) {
      const symbol = String(r.SECUCODE ?? '');
      if (!/^\d{6}\.(SH|SZ)$/.test(symbol)) continue;
      const weight = toNum(r.WEIGHT);
      out.push({
        symbol,
        name: String(r.SECURITY_NAME_ABBR ?? ''),
        ...(Number.isFinite(weight) ? { weight } : {}),
      });
    }
    if (rows.length < pageSize) break;
  }
  if (out.length === 0) {
    throw new IndexDataUnavailableError('东财成分源返回空清单');
  }
  return out;
}

/** 深证信 cnindex：单页 rows=2000 拉全（实测 399001=500、399006=100） */
async function fetchCnindexConstituents(digits: string): Promise<{
  rows: ConstituentRow[];
  dateStr: string;
}> {
  const url =
    `https://www.cnindex.com.cn/sample-detail/detail` +
    `?indexcode=${digits}&pageNum=1&rows=2000`;
  const j = await fetchJson(url);
  const rows = j?.data?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new IndexDataUnavailableError('深证信成分源返回空清单');
  }
  const out: ConstituentRow[] = [];
  let dateStr = '';
  for (const r of rows) {
    const code = String(r.seccode ?? '');
    if (!/^\d{6}$/.test(code)) continue;
    const weight = toNum(r.weight);
    out.push({
      symbol: `${code}.SZ`,
      name: String(r.secname ?? ''),
      ...(Number.isFinite(weight) ? { weight } : {}),
    });
    if (!dateStr && typeof r.dateStr === 'string') dateStr = r.dateStr;
  }
  if (out.length === 0) {
    throw new IndexDataUnavailableError('深证信成分源无可解析行');
  }
  return { rows: out, dateStr };
}

/** 库内沪市A股推导（仅上证综指口径）：stocks.market='SH' 且 6 开头（沪市A股代码段）。
 *  实测库内 stocks 混有指数实体（如 000300.SH「沪深300」）与其它段位代码，
 *  按 A 股代码段过滤，避免把指数/非股票行冒充成分股。 */
async function fetchDbShAConstituents(): Promise<{ rows: ConstituentRow[]; asOf: string }> {
  const rows = await db.connection('stocks')
    .where('market', 'SH')
    .where('is_active', true)
    .whereLike('code', '6%')
    .select('symbol', 'name')
    .orderBy('symbol');
  if (rows.length === 0) {
    throw new IndexDataUnavailableError('库内 stocks 表无沪市A股记录，无法推导上证综指口径成分');
  }
  return {
    rows: rows.map((r: any) => ({ symbol: String(r.symbol), name: String(r.name) })),
    asOf: new Date().toISOString().slice(0, 10),
  };
}

/** 获取指数真实成分清单（6h 内存缓存；源失败抛 IndexDataUnavailableError） */
export async function getIndexConstituents(symbol: string): Promise<ConstituentsResult> {
  const idx = normalizeIndexSymbol(symbol);
  if (!idx) throw new IndexDataUnavailableError(`无效的指数代码: ${symbol}`);
  const meta = INDEX_META[idx.key];
  if (!meta) {
    throw new IndexDataUnavailableError(
      `暂无指数「${idx.key}」的已验证真实成分源，不提供前缀推测成分`,
    );
  }

  const cached = await queryCache.query(`index-const:${idx.key}`, async () => {
    if (meta.source === 'cnindex') {
      const { rows, dateStr } = await fetchCnindexConstituents(idx.digits);
      return { rows, asOf: dateStr || new Date().toISOString().slice(0, 10) };
    }
    if (meta.source === 'eastmoney') {
      const rows = await fetchEastmoneyConstituents(meta.emType!);
      return { rows, asOf: new Date().toISOString().slice(0, 10) };
    }
    // db-sh-a：上证综指口径=沪市A股
    return fetchDbShAConstituents();
  }, CONSTITUENTS_CACHE_TTL);

  const scopeNoun = meta.source === 'db-sh-a' ? '沪市A股（上证综指口径）' : `${meta.name}成分股`;
  return {
    indexSymbol: idx.tencent,
    indexName: meta.name,
    scopeLabel: `${scopeNoun}（${cached.rows.length}只）`,
    count: cached.rows.length,
    constituents: cached.rows,
    source:
      meta.source === 'cnindex'
        ? 'cnindex(深证信)'
        : meta.source === 'eastmoney'
          ? 'eastmoney(数据中心 RPT_INDEX_TS_COMPONENT)'
          : 'db(库内 stocks 沪市A股)',
    asOf: cached.asOf,
  };
}

// ==================== 成分股涨跌榜（库内真实行情 × 成分清单 join） ====================

export interface MoverRow {
  symbol: string;
  name: string;
  close_price: string | number | null;
  change_percent: string | number | null;
}

export interface IndexTopMoversResult {
  scopeLabel: string;
  asOf: string;
  tradeDate: string | null;
  topGainers: MoverRow[];
  topLosers: MoverRow[];
}

/**
 * 指数成分股涨跌榜：成分清单 × 库内 daily_quotes 最新真实交易日行情 join。
 * 成分源不可得 / 库内无对应行情 → 抛 IndexDataUnavailableError（诚实降级，不伪造榜单）。
 */
export async function getIndexTopMovers(
  symbol: string,
  limit: number = 10,
): Promise<IndexTopMoversResult> {
  const cons = await getIndexConstituents(symbol);
  const symbols = cons.constituents.map((c) => c.symbol);

  // 库内最新真实交易日（不依赖挂钟时间，以行情库为准）。
  // 用 ::text 转字符串取 'YYYY-MM-DD'：pg 驱动会把 DATE 解析成本地时区 Date，
  // 再 toISOString 可能在 UTC+ 以西环境回退一天，直接取文本最稳。
  const maxRow = await db.connection('daily_quotes')
    .max({ d: db.connection.raw('trade_date::text') })
    .first();
  const tradeDate: string | null = maxRow?.d ? String(maxRow.d).slice(0, 10) : null;
  if (!tradeDate) {
    throw new IndexDataUnavailableError('库内 daily_quotes 无任何行情记录');
  }

  const pick = (rows: any[]): MoverRow[] =>
    rows.map((r) => ({
      symbol: String(r.symbol),
      name: String(r.name),
      close_price: r.close_price ?? null,
      change_percent: r.change_percent ?? null,
    }));

  // DECIMAL 行情为字符串，orderBy 在 SQL 内做，不受字符串序影响
  const queryMovers = (dir: 'desc' | 'asc') =>
    db.connection('daily_quotes')
      .join('stocks', 'daily_quotes.stock_id', 'stocks.id')
      .whereIn('stocks.symbol', symbols)
      .where('trade_date', tradeDate)
      .select(
        'stocks.symbol',
        'stocks.name',
        'daily_quotes.close_price',
        'daily_quotes.change_percent',
      )
      .orderBy('daily_quotes.change_percent', dir)
      .limit(limit);

  const gainers = pick(await queryMovers('desc'));
  const losers = pick(await queryMovers('asc'));

  if (gainers.length === 0) {
    throw new IndexDataUnavailableError(
      `库内 ${tradeDate} 行情与「${cons.indexName}」成分无交集记录`,
    );
  }

  return {
    scopeLabel: cons.scopeLabel,
    asOf: new Date().toISOString().slice(0, 10),
    tradeDate,
    topGainers: gainers,
    topLosers: losers,
  };
}
