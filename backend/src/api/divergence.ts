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

const router = Router();

/**
 * POST /api/divergence/analyze
 * Analyze momentum divergences for a symbol across multiple timeframes
 */
router.post('/analyze', (req: Request, res: Response) => {
  try {
    const { symbol, timeframes } = req.body;

    if (!symbol || !timeframes || !Array.isArray(timeframes)) {
      return res.status(400).json({
        error: 'Missing required fields: symbol, timeframes[]'
      });
    }

    const tfData: TimeframeData[] = timeframes.map((tf: any) => ({
      timeframe: tf.timeframe,
      prices: tf.prices || [],
      volumes: tf.volumes || [],
      timestamps: tf.timestamps || []
    }));

    const result = analyzeMomentumDivergence(symbol, tfData);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: 'Divergence analysis failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/divergence/rsi
 * Calculate RSI for price data
 */
router.post('/rsi', (req: Request, res: Response) => {
  try {
    const { prices, period } = req.body;
    if (!prices || !Array.isArray(prices)) {
      return res.status(400).json({ error: 'Missing prices array' });
    }
    const rsi = calculateRSI(prices, period || 14);
    res.json({ rsi, period: period || 14 });
  } catch (error) {
    res.status(500).json({ error: 'RSI calculation failed' });
  }
});

/**
 * POST /api/divergence/macd
 * Calculate MACD for price data
 */
router.post('/macd', (req: Request, res: Response) => {
  try {
    const { prices, fast, slow, signal } = req.body;
    if (!prices || !Array.isArray(prices)) {
      return res.status(400).json({ error: 'Missing prices array' });
    }
    const macd = calculateMACD(prices, fast || 12, slow || 26, signal || 9);
    res.json(macd);
  } catch (error) {
    res.status(500).json({ error: 'MACD calculation failed' });
  }
});

/**
 * POST /api/divergence/detect
 * Detect divergences between price and indicator
 */
router.post('/detect', (req: Request, res: Response) => {
  try {
    const { prices, indicator, lookback, hidden } = req.body;
    if (!prices || !indicator) {
      return res.status(400).json({ error: 'Missing prices or indicator data' });
    }
    const signals = hidden
      ? detectHiddenDivergences(prices, indicator, lookback || 5)
      : detectDivergences(prices, indicator, lookback || 5);
    res.json({ signals, count: signals.length });
  } catch (error) {
    res.status(500).json({ error: 'Divergence detection failed' });
  }
});

export default router;
