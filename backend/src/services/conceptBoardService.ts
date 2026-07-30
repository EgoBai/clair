/**
 * 概念板块数据服务 (P0-1)
 *
 * 数据源优先原则：概念板块数据在上游（东方财富公开行情接口）解决，
 * 而不是在前端做兜底展示。评分模型与行业 momentum 保持同一标准
 * (changeScore 50 + volumeScore 30 + breadthScore 20)，
 * 保证「所有板块用统一标准描述、绘制、展现」。
 *
 * 设计:
 * - 内存缓存 TTL 5 分钟（与全站数据同步频率一致）
 * - PostgreSQL 可用时同步落盘 concepts 表（重启可恢复 / 供其他层 join）
 * - PG 不可用（内存库模式）时纯内存缓存，功能不降级
 *
 * 诚实数据红线:
 * - 东财接口无"涨停家数"字段，limit_up_count 返回 0（不用上涨家数冒充）
 * - breadthScore 改用真实的上涨家数占比 (up_count / stock_count)
 */

import axios from 'axios';

export interface ConceptBoardRaw {
  code: string;          // BKxxxx
  name: string;
  changePercent: number; // f3 涨跌幅 %
  turnoverRate: number;  // f8 换手率 %
  turnover: number;      // f6 成交额(元)
  stockCount: number;    // 成分股数 = up + down + flat 近似 (f104+f105)
  upCount: number;       // f104 上涨家数
  downCount: number;     // f105 下跌家数
  leaderName: string;    // f128 领涨股
  leaderSymbol: string;  // f140 领涨股代码
}

export interface ConceptScore {
  industry: string; // 对齐前端 SectorScore.industry（概念名）
  code: string;
  score: number;
  changeScore: number;
  volumeScore: number;
  breadthScore: number;
  stock_count: number;
  avg_change_percent: number;
  total_turnover: number;
  limit_up_count: number; // 数据源无此字段，诚实返回 0
  up_count: number;
  down_count: number;
  leader_name: string;
  leader_symbol: string;
}

const EM_BASE = 'https://push2.eastmoney.com/api/qt/clist/get';
const PAGE_SIZE = 100;
const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

let cache: { boards: ConceptBoardRaw[]; fetchedAt: number } | null = null;
let inflight: Promise<ConceptBoardRaw[]> | null = null;

/** 拉取单页概念板块 */
async function fetchPage(page: number): Promise<{ total: number; boards: ConceptBoardRaw[] }> {
  const resp = await axios.get(EM_BASE, {
    timeout: FETCH_TIMEOUT_MS,
    params: {
      pn: page,
      pz: PAGE_SIZE,
      po: 1,
      np: 1,
      fltt: 2,
      invt: 2,
      fid: 'f3',
      fs: 'm:90 t:3', // 概念板块
      fields: 'f3,f6,f8,f12,f14,f104,f105,f128,f140',
    },
    headers: { Referer: 'https://quote.eastmoney.com/' },
  });
  const data = resp.data?.data;
  if (!data || !Array.isArray(data.diff)) return { total: 0, boards: [] };
  const boards: ConceptBoardRaw[] = data.diff
    .filter((d: Record<string, unknown>) => d && typeof d.f12 === 'string' && typeof d.f14 === 'string')
    .map((d: Record<string, unknown>) => {
      const up = toNum(d.f104);
      const down = toNum(d.f105);
      return {
        code: String(d.f12),
        name: String(d.f14),
        changePercent: toNum(d.f3),
        turnover: toNum(d.f6),
        turnoverRate: toNum(d.f8),
        stockCount: up + down, // 东财无停牌/平盘计数，用涨+跌近似
        upCount: up,
        downCount: down,
        leaderName: typeof d.f128 === 'string' ? d.f128 : '',
        leaderSymbol: typeof d.f140 === 'string' ? d.f140 : '',
      };
    });
  return { total: Number(data.total) || boards.length, boards };
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0; // 东财空值返回 '-'
}

/** 拉取全部概念板块（分页），带并发去重 */
export async function fetchAllConceptBoards(): Promise<ConceptBoardRaw[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.boards;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const first = await fetchPage(1);
      const pages = Math.ceil(first.total / PAGE_SIZE);
      const rest = await Promise.all(
        Array.from({ length: Math.max(0, pages - 1) }, (_, i) => fetchPage(i + 2))
      );
      const boards = [first, ...rest].flatMap(p => p.boards);
      if (boards.length > 0) {
        cache = { boards, fetchedAt: Date.now() };
      }
      return boards;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * 概念板块评分 — 与行业 getSectorMomentumScore 同一模型:
 * changeScore(≤50) + volumeScore(≤30) + breadthScore(≤20)
 */
export function scoreConceptBoards(boards: ConceptBoardRaw[]): ConceptScore[] {
  if (boards.length === 0) return [];
  const maxChange = Math.max(...boards.map(b => Math.abs(b.changePercent)), 1);
  const maxTurnover = Math.max(...boards.map(b => b.turnover), 1);

  return boards
    .map(b => {
      const changeScore = Math.min(100, (Math.abs(b.changePercent) / maxChange) * 50);
      const volumeScore = Math.min(100, (b.turnover / maxTurnover) * 30);
      const upRatio = b.stockCount > 0 ? b.upCount / b.stockCount : 0;
      const breadthScore = Math.min(100, upRatio * 20);
      return {
        industry: b.name,
        code: b.code,
        score: Math.round(changeScore + volumeScore + breadthScore),
        changeScore: Math.round(changeScore),
        volumeScore: Math.round(volumeScore),
        breadthScore: Math.round(breadthScore),
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

/** PG 可用时落盘 concepts 表（尽力而为，失败不影响 API 返回） */
export async function persistConcepts(
  knexLike: { raw: (sql: string, bindings?: unknown[]) => Promise<unknown> } | null,
  boards: ConceptBoardRaw[]
): Promise<void> {
  if (!knexLike || boards.length === 0) return;
  try {
    for (const b of boards) {
      await knexLike.raw(
        `INSERT INTO concepts (name, stock_count, avg_change, updated_at)
         VALUES (?, ?, ?, NOW())
         ON CONFLICT (name)
         DO UPDATE SET stock_count = EXCLUDED.stock_count,
                       avg_change = EXCLUDED.avg_change,
                       updated_at = NOW()`,
        [b.name, b.stockCount, b.changePercent]
      );
    }
  } catch (err) {
    console.warn('[conceptBoardService] persist失败(不影响API):', (err as Error).message);
  }
}

/** 供测试用：重置缓存 */
export function __resetConceptCache(): void {
  cache = null;
  inflight = null;
}
