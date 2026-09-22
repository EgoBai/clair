/**
 * R0'-6 回头看（Look-back）快照服务
 * ============================================================================
 * 产品闭环「发掘 → 筛选 → 自选 → 复盘」原本缺一格「验证」：复盘页只展示
 * 「现在涨跌多少」，没有任何「当时我怎么想」的留档，于是永远无法回答
 * 「我当时的判断兑现了吗」。本模块补上这一格的最小实现：把某个时点的判断
 * 落一条快照，之后由系统计算「当时说 → 实际发生 → 是否兑现」。
 *
 * 诚实红线（本项目最高优先级）：
 *  1. 只用真实数据：快照价来自 /api/stocks/batch/quotes，基准点位来自
 *     /api/market/realtime（gtimg 源，dataSource:'real'）。
 *  2. 任一数据缺失一律置 null 并显式标注「数据不可用」，绝不用 0、估算值、
 *     上期值或任何编造数字兜底。
 *  3. 不使用 Math.random()。快照 id 用 crypto.randomUUID()，不可用时退化为
 *     时间戳 + 进程内自增计数器（确定性，无随机数）。
 *  4. 快照 createdAt 是全部区间计算的基准，必须真实（取自真实系统时间）。
 *
 * 基准选择说明（工单科学要点）：
 *  超额收益 = 个股区间涨跌幅 − 基准区间涨跌幅。
 *  评审已确证个股涨跌由市场 beta 主导，故单看个股涨跌幅做归因无效，必须减去基准。
 *  本模块采用【宽基指数 = 上证指数】作为基准，原因：
 *    - 行业基准（/api/sectors/momentum、/api/industries?level=2）已核查：均只返回
 *      【当前时点】的聚合涨跌幅 / 景气度评分，**不支持区间（历史）涨跌幅**，无法
 *      用以计算「从快照日至今」的基准区间收益；
 *    - /api/market/realtime 返回上证/深证/创业板指的真实点位（dataSource:'real'），
 *      在留档时记录 levelAtSnapshot，事后取当前点位即可得到**真实口径**的基准区间
 *      收益，无需依赖任何历史库。
 *  因此行业基准因「不支持区间口径」被诚实排除，退路宽基指数被采用。
 */

export const SNAPSHOT_SCHEMA_VERSION = 1;
/** localStorage key 版本化，schema 变更时递增，避免旧结构被误读。 */
export const SNAPSHOT_STORAGE_KEY = 'clair.review.snapshots.v1';
/**
 * 最短回看年龄（天）。刚记录的快照区间几乎为 0，立即「回看」只会产生噪声，
 * 故快照创建满该天数后才计算「实际发生 / 超额收益 / 是否兑现」。
 */
export const LOOKBACK_MIN_AGE_DAYS = 1;

const DAY_MS = 86_400_000;

export type ExpectedDirection = 'up' | 'down' | 'watch';

export interface SnapshotBenchmark {
  /** 基准名称（来自上游真实返回，例如「上证指数」）。 */
  name: string;
  /** 基准代码（例如 sh000001）。 */
  code: string;
  /** 留档时该基准的真实点位。 */
  levelAtSnapshot: number;
}

export interface ReviewSnapshot {
  id: string;
  symbol: string;
  name: string;
  /** ISO 时间戳，全部区间计算的基准，必须真实。 */
  createdAt: string;
  /** 留档时的真实价格；历史损坏时为 null（不使用当前价反推）。 */
  priceAtSnapshot: number | null;
  /** 留档时的涨跌幅；无则 null。 */
  changePctAtSnapshot: number | null;
  /** 用户输入的判断原文（自由文本，不臆造结构）。 */
  thesis: string;
  /** 留档时的基准点位；当时取不到则为 null（事后超额收益标为不可用）。 */
  benchmark: SnapshotBenchmark | null;
  /** 可选方向性预期；未标注为 null。 */
  expectedDirection: ExpectedDirection | null;
}

/** 计算超额收益所需的「当下」数据（均来自真实接口，缺失即 null）。 */
export interface SnapshotCurrentData {
  price: number | null;
  benchmarkLevel: number | null;
}

export type SnapshotVerdict =
  | 'fulfilled'
  | 'not_fulfilled'
  | 'unavailable'
  | 'insufficient'
  | 'pending';

export interface SnapshotOutcome {
  matured: boolean;
  ageDays: number;
  stockChangePct: number | null;
  benchmarkChangePct: number | null;
  excessReturnPct: number | null;
  verdict: SnapshotVerdict;
  /** 中性、可核对的原因说明（不含任何置信度分数）。 */
  reason: string;
}

/* ------------------------------------------------------------------ */
/*  纯计算工具 —— 无副作用，便于单测                                    */
/* ------------------------------------------------------------------ */

/** 有限正数（价格 / 点位必须 > 0）；类型守卫，作用于 unknown。 */
function isFinitePositive(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function toFiniteOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** 区间涨跌幅（%）=（末 − 初）/ 初 × 100，保留 2 位。 */
export function computeIntervalChangePct(startLevel: number, endLevel: number): number {
  return round2(((endLevel - startLevel) / startLevel) * 100);
}

/**
 * 超额收益（%）= 个股区间涨跌幅 − 基准区间涨跌幅。
 * 任一侧缺失即返回 null（不可用），**绝不**降级为 0 或用另一侧冒充。
 */
export function computeExcessReturn(
  stockChangePct: number | null,
  benchmarkChangePct: number | null
): number | null {
  if (stockChangePct === null || benchmarkChangePct === null) return null;
  return round2(stockChangePct - benchmarkChangePct);
}

/** 快照距今天数（不足一天为小数）。 */
export function ageInDays(createdAt: string, now: Date = new Date()): number {
  const ms = Date.parse(createdAt);
  if (!Number.isFinite(ms)) return 0;
  return (now.getTime() - ms) / DAY_MS;
}

/**
 * 计算一条快照的回看结果。所有判据均基于真实输入，不引入任何置信度分数。
 *
 * 兑现判定规则（中性、可复核）：
 *  - 快照未满 LOOKBACK_MIN_AGE_DAYS 天 → 'pending'（暂不计算）。
 *  - 个股区间涨跌幅算不出（快照价或当前价缺失）→ 'insufficient'。
 *  - 未标注方向，或标注为「观察」→ 'unavailable'（自由文本不臆测方向）。
 *  - 基准区间收益不可用 → 'unavailable'（不做「只看个股涨跌」的无效归因，
 *    这正是本工单要修正的错误）。
 *  - 否则以超额收益符号判定：看涨且超额 > 0 → 兑现；看跌且超额 < 0 → 兑现。
 */
export function computeOutcome(
  snapshot: ReviewSnapshot,
  current: SnapshotCurrentData,
  now: Date = new Date()
): SnapshotOutcome {
  const createdMs = Date.parse(snapshot.createdAt);
  const ageDays = ageInDays(snapshot.createdAt, now);
  const matured = Number.isFinite(createdMs) && ageDays >= LOOKBACK_MIN_AGE_DAYS;

  const empty: SnapshotOutcome = {
    matured,
    ageDays,
    stockChangePct: null,
    benchmarkChangePct: null,
    excessReturnPct: null,
    verdict: 'pending',
    reason: '',
  };

  if (!Number.isFinite(createdMs)) {
    return { ...empty, matured: false, verdict: 'insufficient', reason: '快照时间戳无效，无法计算区间' };
  }
  if (!matured) {
    return {
      ...empty,
      verdict: 'pending',
      reason: `记录未满 ${LOOKBACK_MIN_AGE_DAYS} 天，暂不计算（避免刚记录就回看）`,
    };
  }

  const priceAt = snapshot.priceAtSnapshot;
  const priceNow = current.price;
  if (!isFinitePositive(priceAt) || !isFinitePositive(priceNow)) {
    return {
      ...empty,
      verdict: 'insufficient',
      reason: '快照价格或当前价格缺失，无法计算个股区间涨跌幅（不用假数兜底）',
    };
  }
  const stockChangePct = computeIntervalChangePct(priceAt, priceNow);

  let benchmarkChangePct: number | null = null;
  let benchmarkNote = '';
  if (!snapshot.benchmark || !isFinitePositive(snapshot.benchmark.levelAtSnapshot)) {
    benchmarkNote = '快照未记录基准点位，超额收益不可用';
  } else if (!isFinitePositive(current.benchmarkLevel)) {
    benchmarkNote = `当前${snapshot.benchmark.name}点位不可用，超额收益不可用`;
  } else {
    benchmarkChangePct = computeIntervalChangePct(
      snapshot.benchmark.levelAtSnapshot,
      current.benchmarkLevel
    );
  }

  const excessReturnPct = computeExcessReturn(stockChangePct, benchmarkChangePct);
  const withLegs: SnapshotOutcome = {
    ...empty,
    stockChangePct,
    benchmarkChangePct,
    excessReturnPct,
  };

  const dir = snapshot.expectedDirection;
  if (dir === null) {
    return {
      ...withLegs,
      verdict: 'unavailable',
      reason: '未标注预期方向，无法判定是否兑现（判断原文为自由文本，不臆测其方向）',
    };
  }
  if (dir === 'watch') {
    return { ...withLegs, verdict: 'unavailable', reason: '该条为观察，不含方向性预期，不作兑现判定' };
  }
  if (excessReturnPct === null) {
    return { ...withLegs, verdict: 'unavailable', reason: benchmarkNote || '基准区间收益不可用，无法作超额兑现判定' };
  }

  const fulfilled = dir === 'up' ? excessReturnPct > 0 : excessReturnPct < 0;
  const dirLabel = dir === 'up' ? '看涨' : '看跌';
  const benchName = snapshot.benchmark ? snapshot.benchmark.name : '基准';
  const reason =
    `个股区间 ${stockChangePct}% − 基准(${benchName}) ${benchmarkChangePct}% = 超额 ${excessReturnPct}%；` +
    `方向「${dirLabel}」${fulfilled ? '兑现' : '未兑现'}`;
  return { ...withLegs, verdict: fulfilled ? 'fulfilled' : 'not_fulfilled', reason };
}

/* ------------------------------------------------------------------ */
/*  持久化（localStorage，防御性读取）                                   */
/* ------------------------------------------------------------------ */

interface SnapshotFile {
  version: number;
  snapshots: ReviewSnapshot[];
}

/** 单条快照的防御性净化：结构非法返回 null，字段缺失降级为 null（不编造）。 */
function sanitizeSnapshot(raw: unknown): ReviewSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id.length === 0) return null;
  if (typeof r.symbol !== 'string' || r.symbol.length === 0) return null;
  if (typeof r.createdAt !== 'string' || !Number.isFinite(Date.parse(r.createdAt))) return null;

  const name = typeof r.name === 'string' && r.name.length > 0 ? r.name : r.symbol;
  const thesis = typeof r.thesis === 'string' ? r.thesis : '';
  const priceAtSnapshot = isFinitePositive(r.priceAtSnapshot) ? r.priceAtSnapshot : null;
  const changePctAtSnapshot = toFiniteOrNull(r.changePctAtSnapshot);
  const expectedDirection: ExpectedDirection | null =
    r.expectedDirection === 'up' || r.expectedDirection === 'down' || r.expectedDirection === 'watch'
      ? r.expectedDirection
      : null;

  let benchmark: SnapshotBenchmark | null = null;
  const rb = r.benchmark;
  if (rb && typeof rb === 'object') {
    const b = rb as Record<string, unknown>;
    if (isFinitePositive(b.levelAtSnapshot)) {
      benchmark = {
        name: typeof b.name === 'string' && b.name.length > 0 ? b.name : '基准',
        code: typeof b.code === 'string' ? b.code : '',
        levelAtSnapshot: b.levelAtSnapshot,
      };
    }
  }

  return {
    id: r.id,
    symbol: r.symbol,
    name,
    createdAt: r.createdAt,
    priceAtSnapshot,
    changePctAtSnapshot,
    thesis,
    benchmark,
    expectedDirection,
  };
}

/**
 * 读取快照列表。任何异常（localStorage 不可用、JSON 损坏、版本不符、
 * 结构非法）都必须安全降级为 []，绝不抛异常导致页面白屏。
 */
export function loadSnapshots(): ReviewSnapshot[] {
  if (typeof localStorage === 'undefined') return [];
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SNAPSHOT_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn('[reviewSnapshot] 快照 JSON 解析失败，已按空列表处理（不覆盖原始数据）');
    return [];
  }
  if (!parsed || typeof parsed !== 'object') return [];

  const file = parsed as Partial<SnapshotFile>;
  if (file.version !== SNAPSHOT_SCHEMA_VERSION) {
    console.warn('[reviewSnapshot] 快照 schema 版本不符，已按空列表处理（不猜测、不迁移）');
    return [];
  }
  if (!Array.isArray(file.snapshots)) return [];

  return file.snapshots
    .map(sanitizeSnapshot)
    .filter((s): s is ReviewSnapshot => s !== null);
}

/** 写入快照列表；失败（配额/不可用）返回 false，调用方据此给出诚实提示。 */
export function saveSnapshots(list: ReviewSnapshot[]): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const file: SnapshotFile = { version: SNAPSHOT_SCHEMA_VERSION, snapshots: list };
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(file));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  写操作                                                             */
/* ------------------------------------------------------------------ */

let idCounter = 0;

/** 生成快照 id：优先 crypto.randomUUID，退化路径为时间戳+自增计数（无随机数）。 */
function makeSnapshotId(): string {
  const c =
    typeof globalThis !== 'undefined'
      ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
      : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  idCounter += 1;
  return `snap-${Date.now()}-${idCounter}`;
}

export interface CreateSnapshotInput {
  symbol: string;
  name: string;
  /** 留档时的真实价格；非法则存 null（不反推、不编造）。 */
  priceAtSnapshot: number;
  changePctAtSnapshot: number | null;
  thesis: string;
  benchmark: SnapshotBenchmark | null;
  expectedDirection: ExpectedDirection | null;
  /** 仅测试注入；生产走真实系统时间。 */
  createdAt?: string;
}

/** 新建一条快照并落盘，返回新快照（最新在前）。 */
export function createSnapshot(input: CreateSnapshotInput): ReviewSnapshot {
  const snapshot: ReviewSnapshot = {
    id: makeSnapshotId(),
    symbol: input.symbol,
    name: input.name,
    createdAt: input.createdAt ?? new Date().toISOString(),
    priceAtSnapshot: isFinitePositive(input.priceAtSnapshot) ? input.priceAtSnapshot : null,
    changePctAtSnapshot: toFiniteOrNull(input.changePctAtSnapshot),
    thesis: input.thesis,
    benchmark: input.benchmark,
    expectedDirection: input.expectedDirection,
  };
  const list = loadSnapshots();
  list.unshift(snapshot);
  saveSnapshots(list);
  return snapshot;
}

/** 删除指定快照。 */
export function removeSnapshot(id: string): ReviewSnapshot[] {
  const list = loadSnapshots().filter((s) => s.id !== id);
  saveSnapshots(list);
  return list;
}

/* ------------------------------------------------------------------ */
/*  真实数据获取（失败一律返回 null / 空，绝不 fallback 到假数）          */
/* ------------------------------------------------------------------ */

type FetchLike = typeof fetch;

async function safeJson(resp: Response): Promise<unknown> {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

/** 取出 { success, data } 包装里的 data；无包装则原样返回。 */
function unwrap(json: unknown): unknown {
  if (json && typeof json === 'object' && 'data' in (json as Record<string, unknown>)) {
    return (json as Record<string, unknown>).data;
  }
  return json;
}

/**
 * 获取宽基基准（上证指数）的当前真实点位。
 * 失败返回 null —— 调用方必须据此标注「基准不可用」，不得编造点位。
 */
export async function fetchBenchmarkLevel(fetchImpl: FetchLike = fetch): Promise<SnapshotBenchmark | null> {
  try {
    const resp = await fetchImpl('/api/market/realtime');
    if (!resp.ok) return null;
    const payload = unwrap(await safeJson(resp));
    if (!payload || typeof payload !== 'object') return null;
    const sh = (payload as Record<string, unknown>).shanghai as
      | { name?: unknown; price?: unknown }
      | undefined;
    if (!sh || !isFinitePositive(sh.price)) return null;
    return {
      name: typeof sh.name === 'string' && sh.name.length > 0 ? sh.name : 'sh000001',
      code: 'sh000001',
      levelAtSnapshot: sh.price,
    };
  } catch {
    return null;
  }
}

/**
 * 批量获取当前真实价格（symbol → price）。仅收录有限正数，
 * 缺失/无行情的 symbol 不出现在结果中（调用方视为不可用）。
 */
export async function fetchCurrentPrices(
  symbols: string[],
  fetchImpl: FetchLike = fetch
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (symbols.length === 0) return out;
  try {
    const resp = await fetchImpl('/api/stocks/batch/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols }),
    });
    if (!resp.ok) return out;
    const payload = unwrap(await safeJson(resp)) as Record<string, unknown> | null;
    const stocks: unknown[] = Array.isArray(payload?.stocks)
      ? (payload?.stocks as unknown[])
      : Array.isArray(payload)
        ? (payload as unknown[])
        : [];
    for (const item of stocks) {
      if (!item || typeof item !== 'object') continue;
      const q = item as Record<string, unknown>;
      const symbol =
        typeof q.symbol === 'string' ? q.symbol : typeof q.code === 'string' ? q.code : '';
      const lq = (q.latestQuote ?? null) as Record<string, unknown> | null;
      const price = Number(lq?.closePrice ?? lq?.close_price ?? q.price);
      if (symbol.length > 0 && Number.isFinite(price) && price > 0) out[symbol] = price;
    }
  } catch {
    /* 保留已取到的，其余视为不可用 */
  }
  return out;
}

/** 从当前价格表里取快照 symbol 的当前价（兼容带/不带交易所后缀）。 */
export function pickCurrentPrice(
  prices: Record<string, number>,
  symbol: string
): number | null {
  if (Object.prototype.hasOwnProperty.call(prices, symbol)) {
    const v = prices[symbol];
    return Number.isFinite(v) && v > 0 ? v : null;
  }
  const pure = symbol.replace(/\.(SH|SZ|BJ)$/i, '');
  for (const key of Object.keys(prices)) {
    if (key.replace(/\.(SH|SZ|BJ)$/i, '') === pure) {
      const v = prices[key];
      return Number.isFinite(v) && v > 0 ? v : null;
    }
  }
  return null;
}
