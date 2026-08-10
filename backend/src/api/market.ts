/**
 * 市场实时总览（公开端点）
 * - 真实指数（上证/深证/创业）+ 涨跌分布，源自 services/realMarketData（腾讯财经 + 东方财富，免 key）
 * - 遵守「诚实数据」红线：指数源不可用直接返回 dataSource:'unavailable'，绝不回填演示/硬编码
 */
import { Router } from 'express';
import { getRealMarketData } from '../services/realMarketData';
import { asyncHandler, sendSuccess } from '../utils/apiResponse';

const router = Router();

router.get(
  '/realtime',
  asyncHandler(async (_req, res) => {
    try {
      const data = await getRealMarketData();
      sendSuccess(res, { ...data, dataSource: 'real' });
    } catch (e) {
      // 诚实降级：指数源失败时如实标注不可达，不编造数据
      sendSuccess(res, {
        dataSource: 'unavailable',
        error: e instanceof Error ? e.message : 'unknown',
      });
    }
  }),
);

export default router;
