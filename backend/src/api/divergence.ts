import { Router, Request, Response } from 'express';
import {
  analyzeMomentumDivergence,
  calculateRSI,
  calculateMACD,
  calculateStochastic,
  findPivots,
  detectDivergences,
  detectHiddenDivergences,
  TimeframeData
} from '../services/momentumDivergenceEngine';
import { asyncHandler, sendValidationError } from '../utils/apiResponse';

const router = Router();

/**
 * 诚实数据契约发送器（本文件统一出口）：顶层 dataSource 与 data 内同源。
 *
 * 本文件是**纯计算端点**：价格/指标序列由调用方在请求体里提供，
 * 后端不接触任何真实行情源，因此无法验证输入数据的真伪。
 *
 * 取舍说明（安全不对称）：把客户端传入的序列标成 'real' 会让前端
 * 可能把「未经核验的输入」当成「后端真实行情」；标成 'unavailable'
 * 最多多一个提示角标。故选后者，并把输入来源在 message 里写明。
 */
function sendHonest(
  res: Response,
  data: Record<string, unknown>
): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    success: true,
    dataSource: 'unavailable',
    data: { ...data, dataSource: 'unavailable' },
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/divergence/analyze
 * Analyze momentum divergences for a symbol across multiple timeframes
 */
router.post('/analyze', asyncHandler(async (req: Request, res: Response) => {
  const { symbol, timeframes } = req.body;

  if (!symbol || !timeframes || !Array.isArray(timeframes)) {
    return sendValidationError(res, 'Missing required fields: symbol, timeframes[]');
  }

  const tfData: TimeframeData[] = timeframes.map((tf: any) => ({
    timeframe: tf.timeframe,
    prices: tf.prices || [],
    volumes: tf.volumes || [],
    timestamps: tf.timestamps || []
  }));

  const result = analyzeMomentumDivergence(symbol, tfData);
  sendHonest(res, {
    ...(result as unknown as Record<string, unknown>),
    message: '输入的多周期价格序列由请求体提供，后端未接入真实行情源、无法核验其真伪',
  });
}));

/**
 * POST /api/divergence/rsi
 * Calculate RSI for price data
 */
router.post('/rsi', asyncHandler(async (req: Request, res: Response) => {
  const { prices, period } = req.body;
  if (!prices || !Array.isArray(prices)) {
    return sendValidationError(res, 'Missing prices array');
  }
  const rsi = calculateRSI(prices, period || 14);
  sendHonest(res, {
    rsi, period: period || 14,
    message: '输入的价格序列由请求体提供，后端未接入真实行情源、无法核验其真伪',
  });
}));

/**
 * POST /api/divergence/macd
 * Calculate MACD for price data
 */
router.post('/macd', asyncHandler(async (req: Request, res: Response) => {
  const { prices, fast, slow, signal } = req.body;
  if (!prices || !Array.isArray(prices)) {
    return sendValidationError(res, 'Missing prices array');
  }
  const macd = calculateMACD(prices, fast || 12, slow || 26, signal || 9);
  sendHonest(res, {
    ...(macd as unknown as Record<string, unknown>),
    message: '输入的价格序列由请求体提供，后端未接入真实行情源、无法核验其真伪',
  });
}));

/**
 * POST /api/divergence/detect
 * Detect divergences between price and indicator
 */
router.post('/detect', asyncHandler(async (req: Request, res: Response) => {
  const { prices, indicator, lookback, hidden } = req.body;
  if (!prices || !indicator) {
    return sendValidationError(res, 'Missing prices or indicator data');
  }
  const signals = hidden
    ? detectHiddenDivergences(prices, indicator, lookback || 5)
    : detectDivergences(prices, indicator, lookback || 5);
  sendHonest(res, {
    signals, count: signals.length,
    message: '输入的价格与指标序列由请求体提供，后端未接入真实行情源、无法核验其真伪',
  });
}));

export default router;
