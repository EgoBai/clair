/**
 * 性能监控 API
 * 前端性能 + API 响应时间 + 错误率监控
 */

import { Request, Response, Router } from 'express';
import { performanceMonitor } from '../middleware/performanceMonitor';
import { dataSourceManager, dataUpdateScheduler } from '../data-sync/dataSourceAdapter';
import { validateQuery, validateBody, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendNotFound, sendInternalError } from '../utils/apiResponse';

const router = Router();

/**
 * 性能概览
 * GET /api/performance/overview?range=3600000
 */
router.get('/performance/overview', (req: Request, res: Response) => {
  const range = parseInt(req.query.range as string) || 3600000;
  const overview = performanceMonitor.getOverview(range);
  const health = performanceMonitor.getHealthScore(range);

  res.json({
    success: true,
    data: { ...overview, health },
  });
});

/**
 * 端点统计排行
 * GET /api/performance/endpoints
 */
router.get('/performance/endpoints', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: performanceMonitor.getEndpointStats(),
  });
});

/**
 * 慢请求列表
 * GET /api/performance/slow?limit=20
 */
router.get('/performance/slow', (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  res.json({
    success: true,
    data: performanceMonitor.getSlowRequests(limit),
  });
});

/**
 * 错误请求列表
 * GET /api/performance/errors?limit=20
 */
router.get('/performance/errors', (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  res.json({
    success: true,
    data: performanceMonitor.getErrorRequests(limit),
  });
});

/**
 * 健康评分
 * GET /api/performance/health
 */
router.get('/performance/health', (req: Request, res: Response) => {
  const range = parseInt(req.query.range as string) || 3600000;
  const health = performanceMonitor.getHealthScore(range);
  res.json({ success: true, data: health });
});

/**
 * 数据源状态
 * GET /api/performance/data-sources
 */
router.get('/performance/data-sources', (_req: Request, res: Response) => {
  const status = dataSourceManager.getSourceStatus();
  const schedulerStatus = dataUpdateScheduler.getTaskStatus();

  res.json({
    success: true,
    data: {
      sources: status,
      scheduler: schedulerStatus,
    },
  });
});

/**
 * 前端性能指标上报
 * POST /api/performance/frontend
 */
router.post('/performance/frontend', validateBody(schemas.performanceReport), (req: Request, res: Response) => {
  const { metrics, url, userAgent, timestamp } = req.body;

  if (!metrics || !Array.isArray(metrics)) {
    return res.status(400).json({ success: false, message: '无效的性能指标' });
  }

  // 存储前端指标（实际应写入数据库或时序数据库）
  console.log(`[前端性能] ${url} - ${metrics.length} 指标`);

  res.json({ success: true, message: '性能数据已记录' });
});

export default router;
