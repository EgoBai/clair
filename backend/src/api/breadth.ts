/**
 * 市场宽度 API 路由
 */

import { Router, Request, Response } from 'express';
import { marketBreadthService } from '../services/marketBreadth';
import { asyncHandler, sendSuccess } from '../utils/apiResponse';

const router = Router();

/**
 * GET /api/breadth/current
 * 获取当前市场宽度数据
 */
router.get('/current', asyncHandler(async (_req: Request, res: Response) => {
  const data = await marketBreadthService.calculateBreadth();
  sendSuccess(res, data);
}));

/**
 * GET /api/breadth/sectors
 * 获取板块宽度分析
 */
router.get('/sectors', asyncHandler(async (_req: Request, res: Response) => {
  const data = await marketBreadthService.getSectorBreadth();
  sendSuccess(res, data);
}));

/**
 * GET /api/breadth/history?period=5d
 * 获取历史宽度数据
 */
router.get('/history', asyncHandler(async (req: Request, res: Response) => {
  const period = (req.query.period as '1d' | '5d' | '1m' | '3m') || '5d';
  const data = await marketBreadthService.getBreadthHistory(period);
  sendSuccess(res, data);
}));

/**
 * GET /api/breadth/mcclellan
 * 获取McClellan振荡器
 */
router.get('/mcclellan', asyncHandler(async (_req: Request, res: Response) => {
  const data = await marketBreadthService.getMcClellanOscillator();
  sendSuccess(res, data);
}));

/**
 * GET /api/breadth/cache-stats
 * 获取缓存统计
 */
router.get('/cache-stats', asyncHandler(async (_req: Request, res: Response) => {
  const stats = marketBreadthService.getCacheStats();
  sendSuccess(res, stats);
}));

export default router;
