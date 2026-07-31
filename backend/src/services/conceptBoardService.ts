/**
 * 概念板块数据服务 (P0-1)
 *
 * 数据源: 腾讯财经板块排行接口（与项目「主数据: 腾讯财经API」规范一致）
 *   GET https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank
 *       ?board_type=gn(概念)|hy(行业)&sort_type=priceChange&direct=down&offset=0&count=200
 *
 * 评分模型（F03 修复后）:
 *   score = changeScore(0~50) + volumeScore(0~30) + breadthScore(0~20)  → 0~100
 *   - changeScore **带符号**：把 changePercent 从 [-maxAbs, +maxAbs] 线性映射到 [0, 50]
 *     · 大涨 → 趋近 50；持平 → 25；大跌 → 趋近 0
 *     · 修复前用 Math.abs()，导致「大跌概念拿高分」被前端 (DiscoverPage scoreLabel: score>=70)
 *       误标为「高景气」，语义完全错误
 *   - volatilityScore 是**独立维度**（0~100，绝对值口径），不计入 score，
 *     需要"波动强度"的场景请单独消费该字段
 *
 * 上游可观测性（F01 修复后）:
 * - fetchPage 指数退避重试（最多 RETRY_MAX 次），结构化错误日志（url/status/attempt）
 * - 上游彻底失败时回退 DB 历史缓存（concepts 表）并标记 source='stale'
 * - persistConcepts 失败升级为 console.error + 失败计数器（可被健康检查读取）
 *
 * 设计:
 * - 内存缓存 TTL 5 分钟（与全站数据同步频率一致）
 * - PostgreSQL 可用时同步落盘 concepts 表（重启可恢复 / 供 stale 回退）
 * - PG 不可用（内存库模式）时纯内存缓存，功能不降级
 *
 * 诚实数据红线:
 * - 数据源无"涨停家数"字段，limit_up_count 返回 0（不用上涨家数冒充）
 * - breadthScore 用真实的上涨家数占比 (up_count / stock_count, 取自 zgb "x/y")
 * - 回退到 DB 缓存时必须标记 stale + updatedAt，绝不冒充实时数据
 *
 * 网络层: 原生 fetch（index.ts 已设置 dns ipv4first 规避本机 IPv6 出口问题）。
 */

import type { ResponseMeta } from '@shared/types';

export interface ConceptBoardRaw {
  code: string;          // 腾讯板块代码 pt02xxxx
  name: string;          // 概念名
  changePercent: number; // zdf 板块涨跌幅 %
  turnoverRate: number;  // hsl 换手率 %
  turnover: number;      // turnover 成交额(万元)
  stockCount: number;    // 成分股总数 (取自 zgb "up/total" 的 total)
  upCount: number;       // 上涨家数 (zgb 的 up)
  downCount: number;     // 下跌家数 = total - up
  leaderName: string;    // lzg.name 领涨股
  leaderSymbol: string;  // lzg.code 领涨股代码
}

export interface ConceptScore {
  industry: string; // 对齐前端 SectorScore.industry（概念名）
  code: string;
  score: number;
  changeScore: number;
  volumeScore: number;
  breadthScore: number;
  /** 独立维度：波动强度 0~100（|涨跌幅| 归一化），**不计入 score** */
  volatilityScore: number;
  stock_count: number;
  avg_change_percent: number;
  total_turnover: number;
  limit_up_count: number; // 数据源无此字段，诚实返回 0
  up_count: number;
  down_count: number;
  leader_name: string;
  leader_symbol: string;
}

/** 带 meta 的拉取结果（供 API 层组装对外契约） */
export interface ConceptFetchResult {
  boards: ConceptBoardRaw[];
  meta: ResponseMeta;
}

/** 只需要 raw() 的最小 knex 形态（便于单测注入） */
export interface KnexLike {
  raw: (sql: string, bindings?: unknown[]) => Promise<unknown>;
}

const TENCENT_RANK =
  'https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank';
const PAGE_SIZE = 200;
const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
/** 重试上限（含首次共 1 + RETRY_MAX 次尝试） */
const RETRY_MAX = 2;
/** 指数退避基数 ms：300 / 600 */
const RETRY_BASE_MS = 300;

let cache: { boards: ConceptBoardRaw[]; fetchedAt: number } | null = null;
let inflight: Promise<ConceptFetchResult> | null = null;

/** 上游/落盘失败计数（供 /health 或日志聚合读取，可观测性要求） */
const counters = {
  fetchPageFailures: 0,
  fetchAllFailures: 0,
  persistFailures: 0,
  persistRowFailures: 0,
  staleFallbacks: 0,
};

export function getConceptServiceCounters(): Readonly<typeof counters> {
  return { ...counters };
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 解析腾讯 zgb "up/total" → [up, total]，失败返回 [0,0] */
function parseBreadth(zgb: unknown): [number, number] {
  if (typeof zgb !== 'string' || !zgb.includes('/')) return [0, 0];
  const [up, total] = zgb.split('/').map((s) => toNum(s.trim()));
  return [up, total];
}

/** 结构化错误日志（可被日志采集按 JSON 解析） */
function logUpstreamError(payload: Record<string, unknown>): void {
  console.error(
    '[conceptBoardService][upstream_error]',
    JSON.stringify({ ts: new Date().toISOString(), ...payload })
  );
}

/** 上游单页拉取的判定结果：区分「可重试故障」与「结构性空数据」 */
type PageOutcome =
  | { ok: true; boards: ConceptBoardRaw[] }
  | { ok: false; retryable: boolean; reason: string; status?: number };

function mapRankList(list: unknown[]): ConceptBoardRaw[] {
  return list
    .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
    .map((d) => {
      const [up, total] = parseBreadth(d.zgb);
      const lzg = (d.lzg as Record<string, unknown>) || {};
      return {
        code: String(d.code ?? ''),
        name: String(d.name ?? ''),
        changePercent: toNum(d.zdf),
        turnoverRate: toNum(d.hsl),
        turnover: toNum(d.turnover),
        stockCount: total,
        upCount: up,
        downCount: total - up,
        leaderName: typeof lzg.name === 'string' ? lzg.name : '',
        leaderSymbol: typeof lzg.code === 'string' ? lzg.code : '',
      };
    })
    .filter((b) => b.name.length > 0);
}

/** 拉取单页（单次尝试，不含重试） */
async function fetchPageOnce(url: URL): Promise<PageOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) {
      // 5xx / 429 视为瞬时故障可重试；4xx（除 429）是契约问题，重试无意义
      const retryable = resp.status >= 500 || resp.status === 429;
      return { ok: false, retryable, reason: `HTTP ${resp.status}`, status: resp.status };
    }
    const json = (await resp.json()) as {
      code?: number;
      data?: { rank_list?: unknown[] };
    };
    const list = json?.data?.rank_list;
    // 结构不符 = 上游返回了确定性的坏/空载荷，重试同样结果，不重试
    if (!Array.isArray(list)) {
      return { ok: false, retryable: false, reason: 'malformed payload: data.rank_list 非数组' };
    }
    return { ok: true, boards: mapRankList(list) };
  } catch (err) {
    // 网络异常 / 超时 / abort → 可重试
    return { ok: false, retryable: true, reason: (err as Error).message || 'network error' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 拉取单页概念板块，带指数退避重试。
 * 失败时抛错（由 fetchAllConceptBoards 决定回退策略），不再静默 return []。
 */
async function fetchPage(offset: number): Promise<ConceptBoardRaw[]> {
  const url = new URL(TENCENT_RANK);
  url.searchParams.set('board_type', 'gn');
  url.searchParams.set('sort_type', 'priceChange');
  url.searchParams.set('direct', 'down');
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('count', String(PAGE_SIZE));

  let last: PageOutcome = { ok: false, retryable: false, reason: 'not attempted' };
  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    last = await fetchPageOnce(url);
    if (last.ok) return last.boards;
    counters.fetchPageFailures++;
    logUpstreamError({
      op: 'fetchPage',
      url: url.toString(),
      offset,
      attempt: attempt + 1,
      maxAttempts: RETRY_MAX + 1,
      status: last.status ?? null,
      retryable: last.retryable,
      reason: last.reason,
    });
    if (!last.retryable) break;
    if (attempt < RETRY_MAX) await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
  }
  throw new Error(
    `腾讯概念板块接口拉取失败 (offset=${offset}, 已尝试 ${RETRY_MAX + 1} 次): ${last.ok ? '' : last.reason}`
  );
}

/** 从 DB 历史缓存恢复概念板块（stale 回退） */
export async function loadConceptsFromDb(
  knexLike: KnexLike | null
): Promise<{ boards: ConceptBoardRaw[]; updatedAt: string | null }> {
  if (!knexLike) return { boards: [], updatedAt: null };
  try {
    await ensureConceptColumns(knexLike);
    const res = (await knexLike.raw(
      `SELECT name, code, stock_count, avg_change, turnover, turnover_rate,
              up_count, leader_name, leader_symbol, updated_at
         FROM concepts
        ORDER BY avg_change DESC NULLS LAST`
    )) as { rows?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
    const rows: Array<Record<string, unknown>> = Array.isArray(res)
      ? res
      : (res?.rows ?? []);
    let latest: number | null = null;
    const boards = rows.map((r) => {
      const total = toNum(r.stock_count);
      const up = toNum(r.up_count);
      const ts = r.updated_at ? new Date(String(r.updated_at)).getTime() : NaN;
      if (Number.isFinite(ts)) latest = latest === null ? ts : Math.max(latest, ts);
      return {
        code: String(r.code ?? ''),
        name: String(r.name ?? ''),
        changePercent: toNum(r.avg_change),
        turnoverRate: toNum(r.turnover_rate),
        turnover: toNum(r.turnover),
        stockCount: total,
        upCount: up,
        downCount: Math.max(0, total - up),
        leaderName: String(r.leader_name ?? ''),
        leaderSymbol: String(r.leader_symbol ?? ''),
      };
    }).filter((b) => b.name.length > 0);
    return {
      boards,
      updatedAt: latest !== null ? new Date(latest).toISOString() : null,
    };
  } catch (err) {
    logUpstreamError({ op: 'loadConceptsFromDb', reason: (err as Error).message });
    return { boards: [], updatedAt: null };
  }
}

/**
 * 拉取全部概念板块（分页 200/页，直到不足一页），带并发去重 + stale 回退。
 * 返回 meta 描述本次数据来源，API 层原样透出给前端。
 */
export async function fetchConceptBoardsWithMeta(
  knexLike: KnexLike | null = null
): Promise<ConceptFetchResult> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return {
      boards: cache.boards,
      meta: { source: 'live', updatedAt: new Date(cache.fetchedAt).toISOString() },
    };
  }
  if (inflight) return inflight;

  inflight = (async (): Promise<ConceptFetchResult> => {
    try {
      const boards: ConceptBoardRaw[] = [];
      let upstreamError: string | null = null;
      try {
        boards.push(...(await fetchPage(0)));
        // 若首页已满一页，继续翻页补齐（上限 ~1000，防止异常死循环）
        let offset = PAGE_SIZE;
        while (boards.length >= offset && offset < 1000) {
          const page = await fetchPage(offset);
          if (page.length === 0) break;
          boards.push(...page);
          offset += PAGE_SIZE;
        }
      } catch (err) {
        upstreamError = (err as Error).message;
        counters.fetchAllFailures++;
      }

      if (boards.length > 0) {
        const fetchedAt = Date.now();
        cache = { boards, fetchedAt };
        return {
          boards,
          meta: { source: 'live', updatedAt: new Date(fetchedAt).toISOString() },
        };
      }

      // 上游没拿到数据 → 优先回退 DB 历史缓存
      const fallback = await loadConceptsFromDb(knexLike);
      if (fallback.boards.length > 0) {
        counters.staleFallbacks++;
        console.error(
          '[conceptBoardService][stale_fallback]',
          JSON.stringify({
            ts: new Date().toISOString(),
            rows: fallback.boards.length,
            cacheUpdatedAt: fallback.updatedAt,
            upstreamError,
          })
        );
        return {
          boards: fallback.boards,
          meta: {
            source: 'stale',
            updatedAt: fallback.updatedAt,
            error: upstreamError ?? '上游返回空数据，已回退数据库历史缓存',
          },
        };
      }

      return {
        boards: [],
        meta: {
          source: 'unavailable',
          updatedAt: null,
          error:
            upstreamError ??
            '腾讯概念板块接口返回空数据，且数据库无历史缓存可回退',
        },
      };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * 向后兼容包装：仅返回 boards（老调用方 / 老测试用）。
 * 新代码请用 fetchConceptBoardsWithMeta 以获得 source/updatedAt。
 */
export async function fetchAllConceptBoards(): Promise<ConceptBoardRaw[]> {
  const { boards } = await fetchConceptBoardsWithMeta(null);
  return boards;
}

// ==================== 纯函数评分（可单测） ====================

/**
 * 带符号的涨跌评分：把 change 从 [-maxAbs, +maxAbs] 线性映射到 [0, MAX]。
 * - change = +maxAbs → MAX（满分）
 * - change = 0       → MAX/2（中性）
 * - change = -maxAbs → 0（垫底）
 * 保证与其他维度同为「越大越好」的正向分，且总分仍落在 0~100。
 */
export function computeChangeScore(
  change: number,
  maxAbs: number,
  max = 50
): number {
  const span = maxAbs > 0 ? maxAbs : 1;
  const ratio = Math.max(-1, Math.min(1, change / span));
  return ((ratio + 1) / 2) * max;
}

/**
 * 独立维度：波动强度 0~100（绝对值口径）。
 * 只描述"动得多剧烈"，与涨跌方向无关，**不参与 score**。
 */
export function computeVolatilityScore(change: number, maxAbs: number): number {
  const span = maxAbs > 0 ? maxAbs : 1;
  return Math.min(100, (Math.abs(change) / span) * 100);
}

/** 成交额评分 0~30 */
export function computeVolumeScore(turnover: number, maxTurnover: number, max = 30): number {
  const span = maxTurnover > 0 ? maxTurnover : 1;
  return Math.max(0, Math.min(max, (turnover / span) * max));
}

/** 广度评分 0~20（上涨家数占比） */
export function computeBreadthScore(upCount: number, stockCount: number, max = 20): number {
  if (stockCount <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, upCount / stockCount));
  return ratio * max;
}

/**
 * 概念板块评分 — 与行业 getSectorMomentumScore 同一区间口径:
 * changeScore(0~50) + volumeScore(0~30) + breadthScore(0~20) = 0~100
 * volatilityScore 独立返回，不计入 score。
 */
export function scoreConceptBoards(boards: ConceptBoardRaw[]): ConceptScore[] {
  if (boards.length === 0) return [];
  const maxAbsChange = Math.max(...boards.map((b) => Math.abs(b.changePercent)), 1);
  const maxTurnover = Math.max(...boards.map((b) => b.turnover), 1);

  return boards
    .map((b) => {
      const changeScore = computeChangeScore(b.changePercent, maxAbsChange);
      const volumeScore = computeVolumeScore(b.turnover, maxTurnover);
      const breadthScore = computeBreadthScore(b.upCount, b.stockCount);
      const volatilityScore = computeVolatilityScore(b.changePercent, maxAbsChange);
      return {
        industry: b.name,
        code: b.code,
        score: Math.round(changeScore + volumeScore + breadthScore),
        changeScore: Math.round(changeScore),
        volumeScore: Math.round(volumeScore),
        breadthScore: Math.round(breadthScore),
        volatilityScore: Math.round(volatilityScore),
        stock_count: b.stockCount,
        avg_change_percent: b.changePercent,
        total_turnover: b.turnover,
        limit_up_count: 0,
        up_count: b.upCount,
        down_count: b.downCount,
        leader_name: b.leaderName,
        leader_symbol: b.leaderSymbol,
      };
    })
    .sort((a, b) => b.score - a.score);
}

// ==================== 落盘 ====================

let columnsEnsured = false;

/**
 * 幂等补齐 concepts 表的缓存列（stale 回退需要完整字段）。
 * 原表仅有 name/stock_count/avg_change/updated_at，不足以还原评分所需输入。
 */
async function ensureConceptColumns(knexLike: KnexLike): Promise<void> {
  if (columnsEnsured) return;
  await knexLike.raw(
    `ALTER TABLE concepts
       ADD COLUMN IF NOT EXISTS code           VARCHAR(32),
       ADD COLUMN IF NOT EXISTS turnover       NUMERIC(24,2) DEFAULT 0,
       ADD COLUMN IF NOT EXISTS turnover_rate  NUMERIC(10,4) DEFAULT 0,
       ADD COLUMN IF NOT EXISTS up_count       INTEGER DEFAULT 0,
       ADD COLUMN IF NOT EXISTS leader_name    VARCHAR(64),
       ADD COLUMN IF NOT EXISTS leader_symbol  VARCHAR(32)`
  );
  columnsEnsured = true;
}

/**
 * PG 可用时落盘 concepts 表。
 * F01: 失败不再只 console.warn —— 升级为 error 级结构化日志 + 失败计数，
 * 但仍不抛出（不影响 API 返回），可观测性由 counters/日志承担。
 * 返回写入成功的行数，便于调用方/测试断言。
 */
export async function persistConcepts(
  knexLike: KnexLike | null,
  boards: ConceptBoardRaw[]
): Promise<{ attempted: number; succeeded: number; failed: number }> {
  const result = { attempted: boards.length, succeeded: 0, failed: 0 };
  if (!knexLike || boards.length === 0) return result;
  try {
    await ensureConceptColumns(knexLike);
  } catch (err) {
    counters.persistFailures++;
    console.error(
      '[conceptBoardService][persist_error]',
      JSON.stringify({
        ts: new Date().toISOString(),
        op: 'ensureConceptColumns',
        reason: (err as Error).message,
        totalFailures: counters.persistFailures,
      })
    );
    result.failed = boards.length;
    return result;
  }

  for (const b of boards) {
    try {
      await knexLike.raw(
        `INSERT INTO concepts (name, code, stock_count, avg_change, turnover,
                               turnover_rate, up_count, leader_name, leader_symbol, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON CONFLICT (name)
         DO UPDATE SET code = EXCLUDED.code,
                       stock_count = EXCLUDED.stock_count,
                       avg_change = EXCLUDED.avg_change,
                       turnover = EXCLUDED.turnover,
                       turnover_rate = EXCLUDED.turnover_rate,
                       up_count = EXCLUDED.up_count,
                       leader_name = EXCLUDED.leader_name,
                       leader_symbol = EXCLUDED.leader_symbol,
                       updated_at = NOW()`,
        [
          b.name, b.code, b.stockCount, b.changePercent, b.turnover,
          b.turnoverRate, b.upCount, b.leaderName, b.leaderSymbol,
        ]
      );
      result.succeeded++;
    } catch (err) {
      result.failed++;
      counters.persistRowFailures++;
      // 只对首条失败打详细日志，避免 400+ 条刷屏
      if (result.failed === 1) {
        console.error(
          '[conceptBoardService][persist_error]',
          JSON.stringify({
            ts: new Date().toISOString(),
            op: 'upsertConcept',
            concept: b.name,
            reason: (err as Error).message,
          })
        );
      }
    }
  }

  if (result.failed > 0) {
    counters.persistFailures++;
    console.error(
      '[conceptBoardService][persist_summary]',
      JSON.stringify({
        ts: new Date().toISOString(),
        attempted: result.attempted,
        succeeded: result.succeeded,
        failed: result.failed,
        totalFailures: counters.persistFailures,
      })
    );
  }
  return result;
}

/** 供测试用：重置缓存与计数 */
export function __resetConceptCache(): void {
  cache = null;
  inflight = null;
  columnsEnsured = false;
  counters.fetchPageFailures = 0;
  counters.fetchAllFailures = 0;
  counters.persistFailures = 0;
  counters.persistRowFailures = 0;
  counters.staleFallbacks = 0;
}
