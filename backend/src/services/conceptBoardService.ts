/**
 * 概念板块数据服务 (P0-1)
 *
 * 数据源: 腾讯财经板块排行接口（与项目「主数据: 腾讯财经API」规范一致）
 *   GET https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank
 *       ?board_type=gn(概念)|hy(行业)&sort_type=priceChange&direct=down&offset=0&count=200
 *
 * 评分模型与行业 momentum 保持同一标准 (changeScore 50 + volumeScore 30 + breadthScore 20)，
 * 保证「所有板块用统一标准描述、绘制、展现」。
 *
 * 设计:
 * - 内存缓存 TTL 5 分钟（与全站数据同步频率一致）
 * - PostgreSQL 可用时同步落盘 concepts 表（重启可恢复 / 供其他层 join）
 * - PG 不可用（内存库模式）时纯内存缓存，功能不降级
 *
 * 诚实数据红线:
 * - 数据源无"涨停家数"字段，limit_up_count 返回 0（不用上涨家数冒充）
 * - breadthScore 用真实的上涨家数占比 (up_count / stock_count, 取自 zgb "x/y")
 *
 * 网络层: 原生 fetch（index.ts 已设置 dns ipv4first 规避本机 IPv6 出口问题）。
 */

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
  stock_count: number;
  avg_change_percent: number;
  total_turnover: number;
  limit_up_count: number; // 数据源无此字段，诚实返回 0
  up_count: number;
  down_count: number;
  leader_name: string;
  leader_symbol: string;
}

const TENCENT_RANK =
  'https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank';
const PAGE_SIZE = 200;
const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

let cache: { boards: ConceptBoardRaw[]; fetchedAt: number } | null = null;
let inflight: Promise<ConceptBoardRaw[]> | null = null;

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 解析腾讯 zgb "up/total" → [up, total]，失败返回 [0,0] */
function parseBreadth(zgb: unknown): [number, number] {
  if (typeof zgb !== 'string' || !zgb.includes('/')) return [0, 0];
  const [up, total] = zgb.split('/').map((s) => toNum(s.trim()));
  return [up, total];
}

/** 拉取单页概念板块（腾讯排行接口） */
async function fetchPage(offset: number): Promise<ConceptBoardRaw[]> {
  const url = new URL(TENCENT_RANK);
  url.searchParams.set('board_type', 'gn');
  url.searchParams.set('sort_type', 'priceChange');
  url.searchParams.set('direct', 'down');
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('count', String(PAGE_SIZE));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) return [];
    const json = (await resp.json()) as {
      code?: number;
      data?: { rank_list?: unknown[] };
    };
    const list = json?.data?.rank_list;
    if (!Array.isArray(list)) return [];
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
  } catch (err) {
    console.warn('[conceptBoardService] fetchPage 失败:', (err as Error).message);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** 拉取全部概念板块（分页 200/页，直到不足一页），带并发去重 */
export async function fetchAllConceptBoards(): Promise<ConceptBoardRaw[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.boards;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const first = await fetchPage(0);
      const boards = [...first];
      // 若首页已满一页，继续翻页补齐（上限 ~1000，防止异常死循环）
      let offset = PAGE_SIZE;
      while (boards.length >= offset && offset < 1000) {
        const page = await fetchPage(offset);
        if (page.length === 0) break;
        boards.push(...page);
        offset += PAGE_SIZE;
      }
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
  const maxChange = Math.max(...boards.map((b) => Math.abs(b.changePercent)), 1);
  const maxTurnover = Math.max(...boards.map((b) => b.turnover), 1);

  return boards
    .map((b) => {
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
