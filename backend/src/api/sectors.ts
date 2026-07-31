/**
 * 板块分析 API
 * 提供行业板块数据、涨跌排名等
 * 统一响应格式
 *
 * F01: 所有响应 data 上新增兄弟字段 meta: { source, updatedAt, error? }
 *      现有字段结构完全不变，前端可渐进接入。
 */

import { Router } from 'express';
import { db } from '../db/dbFactory';
import { validateQuery, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendPaginated } from '../utils/apiResponse';
import {
  fetchConceptBoardsWithMeta,
  scoreConceptBoards,
  persistConcepts,
  type KnexLike,
} from '../services/conceptBoardService';
import type { ResponseMeta } from '@shared/types';

const router = Router();

/** 数据库直读类接口的 meta：有数据=live，无数据=unavailable（DB 无"历史缓存"层） */
function dbMeta(rowCount: number, emptyReason: string): ResponseMeta {
  return rowCount > 0
    ? { source: 'live', updatedAt: new Date().toISOString() }
    : { source: 'unavailable', updatedAt: null, error: emptyReason };
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
  sendSuccess(res, {
    date: date.toISOString().split('T')[0],
    sectors: industries,
    count: industries.length,
    meta: dbMeta(industries.length, '该交易日无行业聚合数据（可能未同步或非交易日）'),
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
  const stocks = paged.map((s: any) => ({
    symbol: s.symbol,
    name: s.name,
    market: s.market,
    industry: s.industry,
    latestQuote: s.latestQuote || {
      closePrice: s.latestQuote?.closePrice || 0,
      changePercent: s.latestQuote?.changePercent || 0,
      turnoverRate: s.latestQuote?.turnoverRate || 0,
      peRatio: s.latestQuote?.peRatio || 0,
    },
  }));
  sendPaginated(res, stocks, page, pageSize, totalCount);
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
  sendSuccess(res, {
    date: date.toISOString().split('T')[0],
    type,
    ranking: sorted.slice(0, limit),
    meta: dbMeta(sorted.length, '该交易日无行业聚合数据（可能未同步或非交易日）'),
  });
}));

// 板块增强数据（含涨停家数）
router.get('/sectors/performance/enhanced', asyncHandler(async (_req, res) => {
  const sectors = await db.getSectorPerformanceEnhanced();
  sendSuccess(res, {
    sectors,
    meta: dbMeta(sectors.length, '无板块增强数据（stocks/daily_quotes 为空或未同步）'),
  });
}));

// 板块景气度综合评分
router.get('/sectors/momentum', asyncHandler(async (_req, res) => {
  // 首次访问时重分类所有股票
  try { await db.reclassifyAll(); } catch { /* ignore: reclassify is best-effort */ }
  const scores = await db.getSectorMomentumScore();
  sendSuccess(res, {
    sectors: scores,
    meta: dbMeta(scores.length, '无板块景气度数据（stocks/daily_quotes 为空或未同步）'),
  });
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
  sendSuccess(res, {
    sectors: scores,
    count: scores.length,
    source: 'tencent', // 保留原字段（数据源标识），不要与 meta.source 混淆
    meta,
  });
}));

export default router;
