/**
 * 因子分析 API（真实源版 · FAC-1 / D18-A）
 * - GET /api/factors/overview：全市场真实因子 IC / ICIR / 五分位 / 衰减 / 相关性 / 合成
 *   数据来自本地 PostgreSQL daily_quotes（覆盖全部真实个股），dataSource:'real'。
 * - 遵守「诚实数据」红线：DB 不可达或覆盖不足 → dataSource:'unavailable'，绝不伪造。
 */

import { Router, Request, Response } from 'express';
import { asyncHandler, sendSuccess } from '../utils/apiResponse';
import { computeFactorUniverse } from '../services/factorEngine';

const router = Router();

/**
 * 因子总览（真实计算）
 * GET /api/factors/overview
 */
router.get(
  '/factors/overview',
  asyncHandler(async (_req: Request, res: Response) => {
    const data = await computeFactorUniverse();
    sendSuccess(res, data);
  }),
);

export default router;
