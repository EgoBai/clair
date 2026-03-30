/**
 * 市场宽度 API 路由
 */

import { Router, Request, Response } from 'express';
import { marketBreadthService } from '../services/marketBreadth';

const router = Router();

/**
 * GET /api/breadth/current
 * 获取当前市场宽度数据
 */
router.get('/current', async (_req: Request, res: Response) => {
  try {
    const data = await marketBreadthService.calculateBreadth();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取市场宽度数据失败' });
  }
});

/**
 * GET /api/breadth/sectors
 * 获取板块宽度分析
 */
router.get('/sectors', async (_req: Request, res: Response) => {
  try {
    const data = await marketBreadthService.getSectorBreadth();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取板块宽度数据失败' });
  }
});

/**
 * GET /api/breadth/history?period=5d
 * 获取历史宽度数据
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as '1d' | '5d' | '1m' | '3m') || '5d';
    const data = await marketBreadthService.getBreadthHistory(period);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取历史宽度数据失败' });
  }
});

/**
 * GET /api/breadth/mcclellan
 * 获取McClellan振荡器
 */
router.get('/mcclellan', async (_req: Request, res: Response) => {
  try {
    const data = await marketBreadthService.getMcClellanOscillator();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取McClellan指标失败' });
  }
});

/**
 * GET /api/breadth/cache-stats
 * 获取缓存统计
 */
router.get('/cache-stats', async (_req: Request, res: Response) => {
  try {
    const stats = marketBreadthService.getCacheStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取缓存统计失败' });
  }
});

export default router;
