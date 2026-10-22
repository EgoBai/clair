/**
 * 多信号融合 API 路由
 * GET /api/ai/multi-signal/:symbol
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/apiResponse';
import { getMultiSignals } from '../services/multiSignalEngine';
import { generateNarrative, generateTemplateNarrative } from '../services/narrativeEngine';

const router = Router();

/**
 * 诚实数据契约发送器：顶层 dataSource 与 data 内同源。
 * signals 为空意味着三个真实信号源（外部/技术面/板块）全部未取到数据，
 * 此时 summary 的 bullish/bearish/neutral 全为 0 —— 若照常返回即等于
 * 「零值顶替空态」，必须显式置 unavailable。
 */
function sendHonest(
  res: Response,
  dataSource: 'real' | 'unavailable',
  data: Record<string, unknown>
): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    success: true,
    dataSource,
    data: { ...data, dataSource },
    timestamp: new Date().toISOString(),
  });
}

/** 由真实信号条数推导 dataSource：0 条信号 → 无任何真实依据 */
function signalDataSource(signals: unknown[]): 'real' | 'unavailable' {
  return Array.isArray(signals) && signals.length > 0 ? 'real' : 'unavailable';
}

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
    res.status(400).json({
      success: false,
      dataSource: 'unavailable',
      error: 'Invalid symbol',
      message: '股票代码格式不合法（长度不足6位），未查询任何信号',
    });
    return;
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

  sendHonest(res, signalDataSource(signalResult.signals), {
    ...signalResult,
    narrative,
    ...(signalResult.signals.length === 0
      ? { message: `外部/技术面/板块三个真实信号源均未取到 ${symbol} 的数据，未生成任何多空信号，summary 的 0 值不代表市场真实结论` }
      : {}),
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

  sendHonest(res, signalDataSource(signalResult.signals), {
    ...signalResult,
    narrative,
    ...(signalResult.signals.length === 0
      ? { message: '外部/技术面/板块三个真实信号源均未取到数据，未生成任何多空信号，summary 的 0 值不代表市场真实结论' }
      : {}),
  });
}));

export default router;
