/**
 * 多信号融合 API 路由
 * GET /api/ai/multi-signal/:symbol
 */

import { Router, Request, Response } from 'express';
import { asyncHandler, sendSuccess } from '../utils/apiResponse';
import { getMultiSignals } from '../services/multiSignalEngine';
import { generateNarrative } from '../services/narrativeEngine';

const router = Router();

/**
 * GET /api/ai/multi-signal/:symbol
 * 获取股票的多维度信号融合结果 + AI叙事报告
 */
router.get('/ai/multi-signal/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  
  if (!symbol || symbol.length < 6) {
    return sendSuccess(res, { error: 'Invalid symbol' }, 400);
  }
  
  // 并行获取信号和生成叙事
  const signalResult = await getMultiSignals(symbol);
  const narrative = await generateNarrative(signalResult);
  
  sendSuccess(res, {
    ...signalResult,
    narrative,
  });
}));

/**
 * GET /api/ai/multi-signal
 * 获取全市场信号概览 + AI叙事
 */
router.get('/ai/multi-signal', asyncHandler(async (_req: Request, res: Response) => {
  const signalResult = await getMultiSignals('market');
  const narrative = await generateNarrative(signalResult);
  
  sendSuccess(res, {
    ...signalResult,
    narrative,
  });
}));

export default router;
