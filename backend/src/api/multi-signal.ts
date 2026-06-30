/**
 * 多信号融合 API 路由
 * GET /api/ai/multi-signal/:symbol
 */

import { Router, Request, Response } from 'express';
import { asyncHandler, sendSuccess } from '../utils/apiResponse';
import { getMultiSignals } from '../services/multiSignalEngine';
import { generateNarrative, generateTemplateNarrative } from '../services/narrativeEngine';

const router = Router();

/**
 * GET /api/ai/multi-signal/:symbol
 * 获取股票的多维度信号融合结果 + AI叙事报告
 * 
 * Query params:
 *   narrative=true  - 使用 LLM 生成叙事（15秒超时，失败则降级为模板）
 *   默认（不传）     - 仅返回模板叙事（快速，无 LLM 调用）
 */
router.get('/ai/multi-signal/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  
  if (!symbol || symbol.length < 6) {
    return sendSuccess(res, { error: 'Invalid symbol' }, 400);
  }
  
  const wantNarrative = req.query.narrative === 'true';
  const signalResult = await getMultiSignals(symbol);
  
  let narrative: string;
  if (wantNarrative) {
    // Try LLM with 15s timeout, fall back to template
    try {
      narrative = await Promise.race([
        generateNarrative(signalResult),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
      ]);
    } catch (e) {
      console.warn('[MultiSignal] LLM叙述生成失败，使用模板:', e);
      narrative = generateTemplateNarrative(signalResult);
    }
  } else {
    narrative = generateTemplateNarrative(signalResult);
  }
  
  sendSuccess(res, {
    ...signalResult,
    narrative,
  });
}));

/**
 * GET /api/ai/multi-signal
 * 获取全市场信号概览 + AI叙事
 * 
 * Query params:
 *   narrative=true  - 使用 LLM 生成叙事（15秒超时，失败则降级为模板）
 *   默认（不传）     - 仅返回模板叙事（快速，无 LLM 调用）
 */
router.get('/ai/multi-signal', asyncHandler(async (req: Request, res: Response) => {
  const wantNarrative = req.query.narrative === 'true';
  const signalResult = await getMultiSignals('market');
  
  let narrative: string;
  if (wantNarrative) {
    try {
      narrative = await Promise.race([
        generateNarrative(signalResult),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
      ]);
    } catch (e) {
      console.warn('[MultiSignal] LLM市场叙述生成失败，使用模板:', e);
      narrative = generateTemplateNarrative(signalResult);
    }
  } else {
    narrative = generateTemplateNarrative(signalResult);
  }
  
  sendSuccess(res, {
    ...signalResult,
    narrative,
  });
}));

export default router;
