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
import { asyncHandler, sendSuccess, sendError, sendValidationError } from '../utils/apiResponse';

const router = Router();

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
  sendSuccess(res, result);
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
  sendSuccess(res, { rsi, period: period || 14 });
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
  sendSuccess(res, macd);
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
  sendSuccess(res, { signals, count: signals.length });
}));

export default router;
