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

/**
 * 诚实数据契约发送器：顶层 dataSource 与 data 内同源。
 *
 * 健康探针是**基础设施端点**，不供任何行情/业务数据（honesty-scan 规则 B
 * 自己也注明「健康检查端点本就不供数」属误报）。但其 status 是真实测量值
 * （含内存库降级态的诚实暴露），故标 'real' 并在 message 里说明性质，
 * 避免前端把它当成行情数据端点。
 */
function sendHonest(res: any, data: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    success: true,
    dataSource: 'real',
    data: {
      ...data,
      dataSource: 'real',
      message: '基础设施健康探针：返回的是真实测量的系统状态，不含任何行情/业务数据',
    },
    timestamp: new Date().toISOString(),
  });
}

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
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(statusCode).json({
      ...health,
      dataSource: 'real',
      message: '基础设施健康探针：返回的是真实测量的系统状态，不含任何行情/业务数据',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * 就绪探针 - 检查应用是否准备好接收流量
 */
router.get(
  '/ready',
  asyncHandler(async (_req: any, res: any) => {
    const ready = await healthService.check('uptime');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      dataSource: 'real',
      message: '就绪探针：基础设施端点，不含任何行情/业务数据',
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
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(alive ? 200 : 503).json({
      status: alive ? 'alive' : 'dead',
      dataSource: 'real',
      message: '存活探针：基础设施端点，不含任何行情/业务数据',
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
    sendHonest(res, {
      status: 'ok',
      version: process.env.APP_VERSION || '1.7.0',
      uptime: Math.round(process.uptime()),
    });
  })
);

export default router;
