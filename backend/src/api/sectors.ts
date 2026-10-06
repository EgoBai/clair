/**
 * 板块分析 API
 * 提供行业板块数据、涨跌排名等
 * 统一响应格式
 *
 * F01: 所有响应 data 上新增兄弟字段 meta: { source, updatedAt, error? }
 *      现有字段结构完全不变，前端可渐进接入。
 */

import { Router, Response } from 'express';
import { db } from '../db/dbFactory';
import { validateQuery, schemas } from '../middleware/validation';
import { asyncHandler } from '../utils/apiResponse';
import {
  fetchConceptBoardsWithMeta,
  scoreConceptBoards,
  persistConcepts,
  type KnexLike,
} from '../services/conceptBoardService';
import type { ResponseMeta } from '@shared/types';

const router = Router();

/**
 * 数据库直读类接口的 meta：有数据=live，无数据=unavailable（DB 无"历史缓存"层）
 * 同时派生**顶层 dataSource**，由同一入参决定 —— 结构上保证顶层与行级不矛盾（IP-20 教训）。
 */
function dbMeta(rowCount: number, emptyReason: string): { meta: ResponseMeta; dataSource: 'real' | 'unavailable' } {
  return rowCount > 0
    ? { meta: { source: 'live', updatedAt: new Date().toISOString() }, dataSource: 'real' }
    : { meta: { source: 'unavailable', updatedAt: null, error: emptyReason }, dataSource: 'unavailable' };
}

/**
 * 诚实数据契约发送器：顶层 dataSource 与 data.meta.source 由同一处派生，
 * 前端可从顶层直接判定，不必先钻进 data 里找 meta。
 * meta.source 的三态映射：live→real、stale→stale、unavailable→unavailable。
 */
function sendHonest(res: Response, dataSource: 'real' | 'unavailable' | 'stale', data: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    success: true,
    dataSource,
    data: { ...data, dataSource },
    timestamp: new Date().toISOString(),
  });
}

/** 概念板块 meta（含上游 stale 回退）→ 顶层 dataSource */
function conceptDataSource(meta: ResponseMeta): 'real' | 'unavailable' | 'stale' {
  return meta.source === 'live' ? 'real' : meta.source;
}

/** 从 dbFactory 代理上取出 knex（内存库模式为 undefined） */
function getKnexLike(): KnexLike | null {
  return (
    (db as unknown as { connection?: KnexLike }).connection ?? null
  );
}

router.get('/sectors', validateQuery(schemas.sectorQuery), asyncHandler(async (req, res) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const sortBy = (req.query.sortBy as string) || 'avgChangePercent';
  const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';
  const industries = await db.getIndustryPerformance(date);
  industries.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
    const aVal = (a[sortBy] as number) ?? 0;
    const bVal = (b[sortBy] as number) ?? 0;
    return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
  });
  const { meta, dataSource } = dbMeta(industries.length, '该交易日无行业聚合数据（可能未同步或非交易日）');
  sendHonest(res, dataSource, {
    date: date.toISOString().split('T')[0],
    sectors: industries,
    count: industries.length,
    meta,
  });
}));

router.get('/sectors/:industry/stocks', asyncHandler(async (req, res) => {
  const { industry } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;
  const decodedIndustry = decodeURIComponent(industry);
  // 使用板块聚合方法获取个股（自动按行业分组）
  const sectorStocks = await db.getSectorStocks(decodedIndustry);
  const totalCount = sectorStocks.length;
  const offset = (page - 1) * pageSize;
  const paged = sectorStocks.slice(offset, offset + pageSize);
  // 格式化为前端期望的结构
  // 诚实红线：缺行情时不捏造零值对象（避免用户看到「今日涨跌 0%」），
  // 以 null 表达「无行情」，由前端降级显示「—」。
  const stocks = paged.map((s: any) => ({
    symbol: s.symbol,
    name: s.name,
    market: s.market,
    industry: s.industry,
    latestQuote: s.latestQuote ?? null,
  }));
  // 诚实红线：db 直读无历史缓存层，取不到行即 unavailable，
  // 不用「空分页 + totalCount 0」冒充「真实但该板块无成分股」。
  if (totalCount === 0) {
    sendHonest(res, 'unavailable', {
      items: [],
      pagination: { page, pageSize, totalCount: 0, totalPages: 0 },
      industry: decodedIndustry,
      message: `本地真实股票库无「${decodedIndustry}」板块的成分股，未返回任何个股数据`,
    });
    return;
  }
  sendHonest(res, 'real', {
    items: stocks,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
    },
  });
}));

router.get('/sectors/ranking', validateQuery(schemas.sectorQuery), asyncHandler(async (req, res) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const type = (req.query.type as string) || 'gainers';
  const limit = parseInt(req.query.limit as string) || 10;
  const industries = await db.getIndustryPerformance(date);
  const sorted = [...industries].sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
    type === 'gainers'
      ? ((b.avg_change_percent as number) ?? 0) - ((a.avg_change_percent as number) ?? 0)
      : ((a.avg_change_percent as number) ?? 0) - ((b.avg_change_percent as number) ?? 0)
  );
  const { meta, dataSource } = dbMeta(sorted.length, '该交易日无行业聚合数据（可能未同步或非交易日）');
  sendHonest(res, dataSource, {
    date: date.toISOString().split('T')[0],
    type,
    ranking: sorted.slice(0, limit),
    meta,
  });
}));

// 板块增强数据（含涨停家数）
router.get('/sectors/performance/enhanced', asyncHandler(async (_req, res) => {
  const sectors = await db.getSectorPerformanceEnhanced();
  const { meta, dataSource } = dbMeta(sectors.length, '无板块增强数据（stocks/daily_quotes 为空或未同步）');
  sendHonest(res, dataSource, { sectors, meta });
}));

// 板块景气度综合评分
router.get('/sectors/momentum', asyncHandler(async (_req, res) => {
  // 首次访问时重分类所有股票
  try { await db.reclassifyAll(); } catch { /* ignore: reclassify is best-effort */ }
  const scores = await db.getSectorMomentumScore();
  const { meta, dataSource } = dbMeta(scores.length, '无板块景气度数据（stocks/daily_quotes 为空或未同步）');
  sendHonest(res, dataSource, { sectors: scores, meta });
}));

// 概念板块景气度评分 (P0-1) — 数据源: 腾讯财经概念板块排行
// 评分模型: change 50 + volume 30 + breadth 20（changeScore 带符号，大跌不再拿高分）
// F01: 上游失败自动回退 DB 历史缓存并标记 meta.source='stale'
router.get('/sectors/concept', asyncHandler(async (_req, res) => {
  const knexLike = getKnexLike();
  const { boards, meta } = await fetchConceptBoardsWithMeta(knexLike);
  const scores = scoreConceptBoards(boards);
  // 仅在实时拉取成功时落盘（stale 数据回写会污染 updated_at）
  if (meta.source === 'live') {
    void persistConcepts(knexLike, boards);
  }
  // 顶层 dataSource 与 data.meta.source 严格对应（live→real / stale→stale / unavailable→unavailable）
  sendHonest(res, conceptDataSource(meta), {
    sectors: scores,
    count: scores.length,
    source: 'tencent', // 保留原字段（数据源标识），不要与 meta.source 混淆
    meta,
  });
}));

export default router;
