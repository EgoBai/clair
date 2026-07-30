/**
 * 板块分析 API
 * 提供行业板块数据、涨跌排名等
 * 统一响应格式
 */

import { Router } from 'express';
import { db } from '../db/dbFactory';
import { validateQuery, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendPaginated } from '../utils/apiResponse';
import { fetchAllConceptBoards, scoreConceptBoards, persistConcepts } from '../services/conceptBoardService';

const router = Router();

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
  sendSuccess(res, { date: date.toISOString().split('T')[0], sectors: industries, count: industries.length });
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
  sendSuccess(res, { date: date.toISOString().split('T')[0], type, ranking: sorted.slice(0, limit) });
}));

// 板块增强数据（含涨停家数）
router.get('/sectors/performance/enhanced', asyncHandler(async (_req, res) => {
  const sectors = await db.getSectorPerformanceEnhanced();
  sendSuccess(res, { sectors });
}));

// 板块景气度综合评分
router.get('/sectors/momentum', asyncHandler(async (_req, res) => {
  // 首次访问时重分类所有股票
  try { await db.reclassifyAll(); } catch { /* ignore: reclassify is best-effort */ }
  const scores = await db.getSectorMomentumScore();
  sendSuccess(res, { sectors: scores });
}));

// 概念板块景气度评分 (P0-1) — 数据源: 东方财富概念板块行情
// 评分模型与 /sectors/momentum 同一标准 (change 50 + volume 30 + breadth 20)
router.get('/sectors/concept', asyncHandler(async (_req, res) => {
  const boards = await fetchAllConceptBoards();
  const scores = scoreConceptBoards(boards);
  // PG 可用时落盘（尽力而为，不阻塞响应）
  const knexLike = (db as { connection?: { raw: (sql: string, bindings?: unknown[]) => Promise<unknown> } }).connection ?? null;
  void persistConcepts(knexLike, boards);
  sendSuccess(res, { sectors: scores, count: scores.length, source: 'tencent' });
}));

export default router;
