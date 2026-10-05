/**
 * 真实因子引擎（FAC-1 · D18-A 落地）
 *
 * 从本地 PostgreSQL `daily_quotes` 全量真实日线，计算经典因子的
 * 因子值 / IC / RankIC / ICIR / 五分位分层 / 因子衰减 / 相关性矩阵 / ICIR 加权合成。
 *
 * 设计要点：
 * - 纯函数（pearson / spearman / meanCrossSectionalIC / quintileReturns / correlationMatrix /
 *   synthesize / computeDecay）与 DB 取数解耦，可单测、零 RNG。
 * - DB 计算 `computeFactorUniverse()` 覆盖全部满足最少交易日历史（当前 ≥65）的真实个股，
 *   日频快照横截面（每期 ≥10 只个股）按前瞻 horizon 配对计算 IC，跨期取均值与 ICIR，
 *   符合标准因子研究方法。
 * - 遵守「诚实数据」红线：DB 不可达或覆盖不足（<${MIN_COVERAGE} 只个股）→ 返回 dataSource:'unavailable'，绝不回填/伪造；
 *   覆盖不足健康阈值（<${HEALTHY_COVERAGE} 只）但 ≥ 最低阈值时返回 dataSource:'real' 且 limitedSample=true，透明标注样本偏薄。
 * - 单因子粒度诚实降级（IP-19）：基础字段缺失或期数不足 → 该因子 available=false + reason，
 *   ic=0 明确为占位零；available=true 时 ic 一律为真实计算值，valid 仅反映 |IC| 是否超过阈值。
 * - 命中结果内存缓存 5 分钟（计算较重，避免每次请求全量重算）。
 */

import { getDb } from '../db/dbFactory';

export interface FactorObservation {
  date: string;
  ticker: string;
  factorValue: number;
  nextReturn: number;
}

interface RawSeries {
  date: string;
  close: number;
  pe: number | null;
  pb: number | null;
  cap: number | null;
  turn: number | null;
}

export interface FactorMetrics {
  key: string;
  cn: string;
  category: string;
  /** 主信息系数（5 日前瞻横截面 IC 跨期均值）；统计上显著的 |IC| 一般认为 > 0.02 */
  ic: number;
  rankIC: number;
  icir: number;
  positiveRate: number;
  quintiles: { quintile: number; avgReturn: number }[];
  longShort: number;
  monotonic: boolean;
  /**
   * 因子是否通过有效性阈值（|IC| > 0.02 且统计可算）。
   * 注意与 available 区分：available=false 表示「未算」（ic=0 为占位零，非真实值）；
   * available=true 且 valid=false 表示「真实算出但 IC 未达阈值」，此时 ic 为真实值。
   */
  valid: boolean;
  /** 统计可算标志：false 时 ic/rankIC/icir 为占位 0，reason 如实说明 */
  available: boolean;
  /** 未算原因（available=false 时必有） */
  reason?: string;
  coverage: number;
  /** 衰减曲线：lag 为前瞻交易日数；样本不足期的 ic 为 null（不伪造 0） */
  decay: { lag: number; ic: number | null }[];
}

export interface FactorCorrelationResult {
  keys: string[];
  matrix: number[][];
}

export interface SynthesisResult {
  factors: { name: string; weight: number }[];
  ic: number;
  icir: number;
}

export interface FactorOverviewResponse {
  dataSource: 'real' | 'unavailable';
  asOf: string | null;
  /** DB daily_quotes 实际数据截止日（与 asOf=最后快照日区分，快照日因前瞻窗口结构性滞后） */
  dataAsOf: string | null;
  coverage: number;
  observationCount: number;
  /** 主 IC 使用的前瞻 horizon（交易日） */
  primaryHorizon: number;
  factors: FactorMetrics[];
  correlation: FactorCorrelationResult;
  synthesis: SynthesisResult;
  /** 样本偏薄标志：覆盖个股数低于健康阈值但 ≥ 最低阈值时为真，提示 IC 统计显著性有限 */
  limitedSample?: boolean;
  /** 实际参与计算的个股数（= coverage，冗余字段便于前端直接读取） */
  sampleCoverage?: number;
  /** 单只个股所需的最少交易日历史（低于此值被剔除） */
  minRequiredHistory?: number;
  /** 因子有效性阈值（|IC| 超过此值 valid=true） */
  validIcThreshold?: number;
  /** 诚实说明：数据窗口 / 样本局限等 */
  note?: string;
  message?: string;
}

interface FactorMeta {
  key: string;
  cn: string;
  category: string;
  kind: 'ep' | 'bp' | 'size' | 'mom3m' | 'rev1m' | 'vol' | 'turn';
}

const FACTORS: FactorMeta[] = [
  { key: 'EP', cn: '估值-EP', category: '价值', kind: 'ep' },
  { key: 'BP', cn: '估值-BP', category: '价值', kind: 'bp' },
  { key: 'SIZE', cn: '规模-市值', category: '规模', kind: 'size' },
  { key: 'MOM3M', cn: '动量-3月', category: '动量', kind: 'mom3m' },
  { key: 'REV1M', cn: '反转-1月', category: '动量', kind: 'rev1m' },
  { key: 'VOL', cn: '波动率', category: '风险', kind: 'vol' },
  { key: 'TURN', cn: '换手率', category: '流动性', kind: 'turn' },
];

/**
 * 前瞻收益 horizons（交易日）。
 * 当前 PostgreSQL 实盘数据：5427+ 只个股持有 85~215 条对齐至 2026-10-06 的真实日线，
 * 横截面个股数充足但单股历史偏短，故采用日频快照（STEP=1）+ 短前瞻窗口 [1, 5, 10]，
 * 主 IC 用 5 日前瞻（85 条个股可贡献 ~17 个日度横截面，IC 时序稳健）；
 * 21 日及以上前瞻因单股历史不足会产生 <3 期的退化 IC，不再使用。
 */
const HORIZONS = [1, 5, 10];
/** 主 IC / 五分位 / 相关性使用的 horizon */
const PRIMARY_HORIZON = 5;
const MIN_PRIOR = 63; // MOM3M 需 63 个前期收盘
const STEP = 1; // 日频快照：每个交易日形成一个横截面
const MIN_SNAPSHOT_HISTORY = MIN_PRIOR + Math.min(...HORIZONS) + 1; // 63+1+1=65：至少 1 个 h=1 快照
const MIN_COVERAGE = 10; // 横截面最低个股数（低于此值无统计意义 → unavailable）
const HEALTHY_COVERAGE = 50; // 覆盖 ≥ 此值视为充分；低于此值但 ≥ MIN_COVERAGE 返回 real 但 limitedSample=true
const MIN_PERIODS = 3; // IC 时序列最少期数（低于此值视为不可算）
const VALID_IC_THRESHOLD = 0.02; // 日度 5 日前瞻 |IC| 有效性阈值

// ==================== 纯函数：统计工具 ====================

export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

export function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let s = 0;
  for (const v of arr) s += (v - m) ** 2;
  return Math.sqrt(s / arr.length);
}

export function pearson(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2) return 0;
  const ma = mean(a);
  const mb = mean(b);
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  if (va <= 0 || vb <= 0) return 0;
  return cov / Math.sqrt(va * vb);
}

function rankArray(arr: number[]): number[] {
  const indexed = arr.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v);
  const ranks = new Array(arr.length);
  indexed.forEach((item, rank) => {
    ranks[item.i] = rank + 1;
  });
  return ranks;
}

export function spearman(a: number[], b: number[]): number {
  return pearson(rankArray(a), rankArray(b));
}

// ==================== 纯函数：因子指标 ====================

export interface CrossSectionalIC {
  icMean: number;
  rankIcMean: number;
  icStd: number;
  /** ICIR = mean(IC) / std(IC)，跨期信息比率；std=0 时记为 0 */
  icir: number;
  positiveRate: number;
  periods: number;
}

/** 横截面 IC：按交易日分组，每期计算因子值 vs 前瞻收益的相关系数，跨期取均值/ICIR */
export function meanCrossSectionalIC(byDate: Map<string, FactorObservation[]>): CrossSectionalIC {
  const ics: number[] = [];
  const rics: number[] = [];
  byDate.forEach((obs) => {
    if (obs.length < 10) return;
    const f = obs.map((o) => o.factorValue);
    const r = obs.map((o) => o.nextReturn);
    const ic = pearson(f, r);
    if (!isFinite(ic)) return;
    ics.push(ic);
    const ric = spearman(f, r);
    rics.push(isFinite(ric) ? ric : ic);
  });
  if (ics.length < MIN_PERIODS) {
    return { icMean: 0, rankIcMean: 0, icStd: 0, icir: 0, positiveRate: 0, periods: ics.length };
  }
  const icMean = mean(ics);
  const icStd = std(ics);
  return {
    icMean,
    rankIcMean: mean(rics),
    icStd,
    icir: icStd > 0 ? icMean / icStd : 0,
    positiveRate: ics.filter((x) => x > 0).length / ics.length,
    periods: ics.length,
  };
}

export interface QuintileResult {
  quintiles: { quintile: number; avgReturn: number }[];
  longShort: number;
  monotonic: boolean;
}

/** 五分位分层：全部观测按因子值排序分 5 组，组均前瞻收益；多空=Q5-Q1 */
export function quintileReturns(obs: FactorObservation[]): QuintileResult {
  if (obs.length < 20) return { quintiles: [], longShort: 0, monotonic: false };
  const sorted = [...obs].sort((a, b) => a.factorValue - b.factorValue);
  const g = Math.floor(sorted.length / 5);
  const quintiles: { quintile: number; avgReturn: number }[] = [];
  for (let q = 0; q < 5; q++) {
    const start = q * g;
    const end = q === 4 ? sorted.length : (q + 1) * g;
    const grp = sorted.slice(start, end);
    quintiles.push({ quintile: q + 1, avgReturn: mean(grp.map((d) => d.nextReturn)) });
  }
  const longShort = quintiles[4].avgReturn - quintiles[0].avgReturn;
  const monotonic = quintiles.every((qq, i) => i === 0 || qq.avgReturn >= quintiles[i - 1].avgReturn);
  return { quintiles, longShort, monotonic };
}

/** 因子衰减：不同前瞻 horizon 的横截面 IC 序列；lag 为前瞻交易日数；期数不足时 ic=null（不伪造 0） */
export function computeDecay(byHorizon: Map<number, FactorObservation[]>): { lag: number; ic: number | null }[] {
  return [...byHorizon.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([horizon, obs]) => {
      const byDate = new Map<string, FactorObservation[]>();
      for (const o of obs) {
        const a = byDate.get(o.date) ?? [];
        a.push(o);
        byDate.set(o.date, a);
      }
      const r = meanCrossSectionalIC(byDate);
      return { lag: horizon, ic: r.periods >= MIN_PERIODS ? r.icMean : null };
    });
}

/** 因子相关性矩阵：每个因子取各股因子值时序均值，跨股 Pearson 相关 */
export function correlationMatrix(
  avgByTicker: Record<string, Map<string, number>>,
  keys: string[],
): FactorCorrelationResult {
  const matrix = keys.map((a) =>
    keys.map((b) => {
      if (a === b) return 1;
      const ma = avgByTicker[a];
      const mb = avgByTicker[b];
      const common = [...ma.keys()].filter((t) => mb.has(t));
      if (common.length < 10) return 0;
      const va = common.map((t) => ma.get(t)!);
      const vb = common.map((t) => mb.get(t)!);
      return pearson(va, vb);
    }),
  );
  return { keys, matrix };
}

/** ICIR 加权合成：权重=各因子 |ICIR| 归一化 */
export function synthesize(factors: { key: string; cn: string; ic: number; icir: number }[]): SynthesisResult {
  const totalIcir = factors.reduce((s, f) => s + Math.abs(f.icir), 0) || 1;
  const weights = factors.map((f) => Math.abs(f.icir) / totalIcir);
  const ic = factors.reduce((s, f, i) => s + f.ic * weights[i], 0);
  const icir = factors.reduce((s, f, i) => s + f.icir * weights[i], 0);
  return {
    factors: factors.map((f, i) => ({ name: f.cn, weight: weights[i] })),
    ic,
    icir,
  };
}

// ==================== 工具 ====================

function flatten(m: Map<string, FactorObservation[]>): FactorObservation[] {
  const out: FactorObservation[] = [];
  m.forEach((a) => out.push(...a));
  return out;
}

function countObs(m: Map<string, FactorObservation[]>): number {
  let c = 0;
  m.forEach((a) => (c += a.length));
  return c;
}

function toDateStr(d: unknown): string {
  // pg 将 DATE 列以 UTC 零点 Date 返回（本机东八区会渲染为前一日 16:00），
  // 必须用本地时间取值，避免日期早一天
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return String(d).slice(0, 10);
}

function unavailable(message?: string): FactorOverviewResponse {
  return {
    dataSource: 'unavailable',
    asOf: null,
    dataAsOf: null,
    coverage: 0,
    observationCount: 0,
    primaryHorizon: PRIMARY_HORIZON,
    factors: [],
    correlation: { keys: [], matrix: [] },
    synthesis: { factors: [], ic: 0, icir: 0 },
    message,
  };
}

// ==================== DB 计算 ====================

interface CacheEntry {
  data: FactorOverviewResponse;
  ts: number;
}
let cache: CacheEntry | null = null;
const TTL_MS = 5 * 60 * 1000;

/**
 * 计算全市场真实因子分析（覆盖全部有 ≥65 交易日历史的真实个股）。
 * 结果内存缓存 5 分钟。
 */
export async function computeFactorUniverse(force = false): Promise<FactorOverviewResponse> {
  if (!force && cache && Date.now() - cache.ts < TTL_MS) return cache.data;

  try {
    const dbInstance: any = getDb();
    const knex = dbInstance.connection || dbInstance.knexInstance;
    if (!knex || typeof knex.raw !== 'function') return unavailable('数据库未初始化');

    const res: any = await knex.raw(`
      SELECT s.symbol, dq.trade_date, dq.close_price, dq.pe_ratio, dq.pb_ratio, dq.market_cap, dq.turnover_rate
      FROM daily_quotes dq
      JOIN stocks s ON dq.stock_id = s.id
      WHERE s.is_active = true
      ORDER BY s.symbol, dq.trade_date ASC
    `);
    const raw: any[] = Array.isArray(res) ? res : res.rows ?? [];
    if (!Array.isArray(raw) || raw.length === 0) return unavailable('无日线数据');

    // 按个股分组为时间序列
    const bySymbol = new Map<string, RawSeries[]>();
    let dataAsOf: string | null = null;
    for (const r of raw) {
      const sym = String(r.symbol);
      const d = toDateStr(r.trade_date);
      const arr = bySymbol.get(sym) ?? [];
      arr.push({
        date: d,
        close: Number(r.close_price),
        pe: r.pe_ratio != null ? Number(r.pe_ratio) : null,
        pb: r.pb_ratio != null ? Number(r.pb_ratio) : null,
        cap: r.market_cap != null ? Number(r.market_cap) : null,
        turn: r.turnover_rate != null ? Number(r.turnover_rate) : null,
      });
      if (!dataAsOf || d > dataAsOf) dataAsOf = d;
      bySymbol.set(sym, arr);
    }

    const byDate: Record<string, Map<string, FactorObservation[]>> = {};
    const byHorizon: Record<string, Map<number, FactorObservation[]>> = {};
    const avgByTicker: Record<string, Map<string, number[]>> = {};
    for (const f of FACTORS) {
      byDate[f.key] = new Map();
      byHorizon[f.key] = new Map();
      avgByTicker[f.key] = new Map();
    }

    let coverage = 0;
    let asOf: string | null = null;

    bySymbol.forEach((series, symbol) => {
      const n = series.length;
      if (n < MIN_SNAPSHOT_HISTORY) return;

      const ret: number[] = new Array(n).fill(0);
      for (let i = 1; i < n; i++) ret[i] = series[i].close / series[i - 1].close - 1;

      let contributed = false;
      // 日频快照：每个交易日为一个横截面；horizon 与快照一一配对，
      // 每个 horizon 只在「前瞻收益可得」（i + h < n）时取样，避免长 horizon 截断可用期数。
      for (const h of HORIZONS) {
        for (let i = MIN_PRIOR; i + h < n; i += STEP) {
          const t = series[i];
          const closeT = t.close;
          const vals: Record<string, number> = {};
          vals.MOM3M = closeT / series[i - 63].close - 1;
          vals.REV1M = -(closeT / series[i - 21].close - 1);

          const vr: number[] = [];
          for (let k = i - 20; k <= i; k++) vr.push(ret[k]);
          vals.VOL = std(vr);

          let ts = 0;
          for (let k = i - 20; k <= i; k++) ts += series[k].turn || 0;
          vals.TURN = ts / 21;

          if (t.pe && t.pe > 0) vals.EP = 1 / t.pe;
          if (t.pb && t.pb > 0) vals.BP = 1 / t.pb;
          if (t.cap && t.cap > 0) vals.SIZE = Math.log(t.cap);

          const fwd = series[i + h].close / closeT - 1;
          for (const f of FACTORS) {
            const fv = vals[f.key];
            if (fv === undefined || !isFinite(fv)) continue;
            const obs: FactorObservation = { date: t.date, ticker: symbol, factorValue: fv, nextReturn: fwd };
            let bh = byHorizon[f.key].get(h);
            if (!bh) {
              bh = [];
              byHorizon[f.key].set(h, bh);
            }
            bh.push(obs);
            // 主指标（IC/五分位）只用主 horizon，避免混合不同前瞻期的收益
            if (h !== PRIMARY_HORIZON) continue;
            let bd = byDate[f.key].get(t.date);
            if (!bd) {
              bd = [];
              byDate[f.key].set(t.date, bd);
            }
            bd.push(obs);
            let arr = avgByTicker[f.key].get(symbol);
            if (!arr) {
              arr = [];
              avgByTicker[f.key].set(symbol, arr);
            }
            arr.push(fv);
          }
          if (!asOf || t.date > asOf) asOf = t.date;
        }
        contributed = true;
      }
      if (contributed) coverage++;
    });

    if (coverage < MIN_COVERAGE) {
      return unavailable(
        `覆盖个股不足（${coverage} < ${MIN_COVERAGE}）：当前 daily_quotes 单股历史普遍较短，需单股 ≥${MIN_SNAPSHOT_HISTORY} 交易日才有有效快照`,
      );
    }

    const factors: FactorMetrics[] = FACTORS.map((f) => {
      const obsCount = countObs(byDate[f.key]);
      const icr = meanCrossSectionalIC(byDate[f.key]);
      const q = quintileReturns(flatten(byDate[f.key]));
      const decay = computeDecay(byHorizon[f.key]);
      // 诚实降级（IP-19）：区分「未算」（available=false，ic=0 为占位零）与「真实算出但未达阈值」
      let available = true;
      let reason: string | undefined;
      if (obsCount === 0) {
        available = false;
        reason = '该因子的基础字段（如 PE/PB/市值）在数据窗口内全空，无法计算';
      } else if (icr.periods < MIN_PERIODS) {
        available = false;
        reason = `有效横截面期数不足（${icr.periods} < ${MIN_PERIODS}），IC 未计算`;
      } else if (Math.abs(icr.icMean) <= VALID_IC_THRESHOLD) {
        // 真实算出但 |IC| 未达有效性阈值：ic 为真实值，reason 如实说明弱有效性
        reason = `|IC|=${Math.abs(icr.icMean).toFixed(4)} 未达有效性阈值 ${VALID_IC_THRESHOLD}（该窗口内因子预测力弱）`;
      }
      return {
        key: f.key,
        cn: f.cn,
        category: f.category,
        ic: icr.icMean,
        rankIC: icr.rankIcMean,
        icir: icr.icir,
        positiveRate: icr.positiveRate,
        quintiles: q.quintiles,
        longShort: q.longShort,
        monotonic: q.monotonic,
        valid: available && Math.abs(icr.icMean) > VALID_IC_THRESHOLD,
        available,
        reason,
        coverage: obsCount,
        decay,
      };
    });

    // avgByTicker 累积的是「每只个股的因子值时序数组」，相关性矩阵需要「个股均值标量」，
    // 先聚合成 Map<ticker, number> 再传入，避免把数组当标量计算（会产出 NaN/0）。
    const avgByTickerScalar: Record<string, Map<string, number>> = {};
    for (const f of FACTORS) {
      const m = new Map<string, number>();
      avgByTicker[f.key].forEach((arr, sym) => m.set(sym, mean(arr)));
      avgByTickerScalar[f.key] = m;
    }
    const correlation = correlationMatrix(avgByTickerScalar, FACTORS.map((f) => f.key));
    const synth = synthesize(factors.map((f) => ({ key: f.key, cn: f.cn, ic: f.ic, icir: f.icir })));
    const observationCount = FACTORS.reduce((s, f) => s + countObs(byDate[f.key]), 0);

    const limited = coverage < HEALTHY_COVERAGE;
    const data: FactorOverviewResponse = {
      dataSource: 'real',
      asOf,
      dataAsOf,
      coverage,
      observationCount,
      primaryHorizon: PRIMARY_HORIZON,
      factors,
      correlation,
      synthesis: synth,
      limitedSample: limited,
      sampleCoverage: coverage,
      minRequiredHistory: MIN_SNAPSHOT_HISTORY,
      validIcThreshold: VALID_IC_THRESHOLD,
      note: `数据窗口截至 ${dataAsOf}；主 IC 为 ${PRIMARY_HORIZON} 个交易日前瞻的日度横截面 IC（单股历史 65~215 交易日，1 个月以上前瞻窗口期数不足，未采用）。available=false 的因子为基础字段缺失未计算（ic=0 为占位，非真实值），仅供参考，不构成投资建议。`,
    };
    cache = { data, ts: Date.now() };
    return data;
  } catch (e) {
    console.error('[factorEngine] computeFactorUniverse failed', e);
    return unavailable(e instanceof Error ? e.message : 'unknown');
  }
}
