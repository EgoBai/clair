/**
 * 板块分析 API
 * 提供行业板块数据、涨跌排名等
 */

import { Request, Response, Router } from 'express';
import { db } from '../db/Database';

const router = Router();

/**
 * 获取行业板块列表
 * GET /api/sectors
 */
router.get('/sectors', async (req: Request, res: Response) => {
  try {
    const date = req.query.date ? new Date(req.query.date as string) : new Date();
    const sortBy = (req.query.sortBy as string) || 'avgChangePercent';
    const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

    const industries = await db.getIndustryPerformance(date);

    // 排序
    industries.sort((a: any, b: any) => {
      const aVal = a[sortBy] ?? 0;
      const bVal = b[sortBy] ?? 0;
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });

    res.json({
      success: true,
      data: {
        date: date.toISOString().split('T')[0],
        sectors: industries,
        count: industries.length,
      },
    });
  } catch (error) {
    console.error('获取行业板块失败:', error);
    res.status(500).json({
      success: false,
      error: '获取行业板块失败',
      details: error instanceof Error ? error.message : '未知错误',
    });
  }
});

/**
 * 获取行业板块详情
 * GET /api/sectors/:industry/stocks
 */
router.get('/sectors/:industry/stocks', async (req: Request, res: Response) => {
  try {
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

    res.json({
      success: true,
      data: {
        industry: decodedIndustry,
        stocks,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize),
        },
      },
    });
  } catch (error) {
    console.error('获取行业股票失败:', error);
    res.status(500).json({
      success: false,
      error: '获取行业股票失败',
      details: error instanceof Error ? error.message : '未知错误',
    });
  }
});

/**
 * 获取行业涨跌排名
 * GET /api/sectors/ranking
 */
router.get('/sectors/ranking', async (req: Request, res: Response) => {
  try {
    const date = req.query.date ? new Date(req.query.date as string) : new Date();
    const type = (req.query.type as string) || 'gainers'; // gainers | losers
    const limit = parseInt(req.query.limit as string) || 10;

    const industries = await db.getIndustryPerformance(date);

    const sorted = [...industries].sort((a: any, b: any) =>
      type === 'gainers'
        ? (b.avg_change_percent ?? 0) - (a.avg_change_percent ?? 0)
        : (a.avg_change_percent ?? 0) - (b.avg_change_percent ?? 0)
    );

    res.json({
      success: true,
      data: {
        date: date.toISOString().split('T')[0],
        type,
        ranking: sorted.slice(0, limit),
      },
    });
  } catch (error) {
    console.error('获取行业排名失败:', error);
    res.status(500).json({
      success: false,
      error: '获取行业排名失败',
      details: error instanceof Error ? error.message : '未知错误',
    });
  }
});

export default router;
