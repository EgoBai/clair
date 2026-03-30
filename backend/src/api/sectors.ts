/**
 * 板块分析 API
 * 提供行业板块数据、涨跌排名等
 * 统一响应格式
 */

import { Router } from 'express';
import { db } from '../db/Database';
import { validateQuery, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendPaginated } from '../utils/apiResponse';

const router = Router();

/**
 * 获取行业板块列表
 * GET /api/sectors
 */
router.get('/sectors', validateQuery(schemas.sectorQuery), asyncHandler(async (req, res) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const sortBy = (req.query.sortBy as string) || 'avgChangePercent';
  const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

  const industries = await db.getIndustryPerformance(date);

  // 排序
  industries.sort((a: Record<string, number>, b: Record<string, number>) => {
    const aVal = a[sortBy] ?? 0;
    const bVal = b[sortBy] ?? 0;
    return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
  });

  sendSuccess(res, {
    date: date.toISOString().split('T')[0],
    sectors: industries,
    count: industries.length,
  });
}));

/**
 * 获取行业板块详情
 * GET /api/sectors/:industry/stocks
 */
router.get('/sectors/:industry/stocks', asyncHandler(async (req, res) => {
  const { industry } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;
  const decodedIndustry = decodeURIComponent(industry);

  const stocks = await db.getStocks({
    industry: decodedIndustry,
    page,
    pageSize,
    sortBy: 'symbol',
    sortOrder: 'asc',
  });
  const totalCount = await db.getStockCount({ industry: decodedIndustry });

  sendPaginated(res, stocks, page, pageSize, totalCount);
}));

/**
 * 获取行业涨跌排名
 * GET /api/sectors/ranking
 */
router.get('/sectors/ranking', validateQuery(schemas.sectorQuery), asyncHandler(async (req, res) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const type = (req.query.type as string) || 'gainers';
  const limit = parseInt(req.query.limit as string) || 10;

  const industries = await db.getIndustryPerformance(date);

  const sorted = [...industries].sort((a: Record<string, number>, b: Record<string, number>) =>
    type === 'gainers'
      ? (b.avg_change_percent ?? 0) - (a.avg_change_percent ?? 0)
      : (a.avg_change_percent ?? 0) - (b.avg_change_percent ?? 0)
  );

  sendSuccess(res, {
    date: date.toISOString().split('T')[0],
    type,
    ranking: sorted.slice(0, limit),
  });
}));

export default router;
