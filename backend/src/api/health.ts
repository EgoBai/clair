/**
 * 健康检查 API 路由
 * GET /health          - 完整健康检查
 * GET /health/ready    - 就绪探针 (K8s readiness)
 * GET /health/live     - 存活探针 (K8s liveness)
 * GET /health/simple   - 简单状态
 */

import { Router } from 'express';
import { createDefaultHealthCheck } from '../services/healthCheck';
import { asyncHandler } from '../utils/apiResponse';

const router = Router();

// 创建健康检查服务实例
const healthService = createDefaultHealthCheck(process.env.APP_VERSION || '1.7.0');

/**
 * 完整健康检查
 */
router.get(
  '/',
  asyncHandler(async (req: any, res: any) => {
    const health = await healthService.checkAll();
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(health);
  })
);

/**
 * 就绪探针 - 检查应用是否准备好接收流量
 */
router.get(
  '/ready',
  asyncHandler(async (_req: any, res: any) => {
    const ready = await healthService.check('uptime');
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * 存活探针 - 检查应用是否还活着
 */
router.get(
  '/live',
  asyncHandler(async (_req: any, res: any) => {
    const alive = await healthService.check('memory');
    res.status(alive ? 200 : 503).json({
      status: alive ? 'alive' : 'dead',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * 简单状态 - 轻量级检查
 */
router.get(
  '/simple',
  asyncHandler(async (_req: any, res: any) => {
    res.status(200).json({
      status: 'ok',
      version: process.env.APP_VERSION || '1.7.0',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
