/**
 * 技术指标 API
 * 提供 MA、MACD、KDJ、RSI、布林带等技术指标计算和查询
 */

import { Request, Response, Router } from 'express';
import { db } from '../db/Database';
import { calculateAllIndicators, OHLCV } from '../indicators/technical';

const router = Router();

/**
 * 获取股票技术指标
 * GET /api/indicators/:symbol
 */
router.get('/indicators/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const limit = parseInt(req.query.limit as string) || 120;

    const stock = await db.getStockBySymbol(symbol);
    if (!stock) {
      return res.status(404).json({ success: false, error: '股票未找到' });
    }

    const quotes = await db.getDailyQuotes(stock.id, undefined, undefined, limit);
    if (quotes.length === 0) {
      return res.status(404).json({ success: false, error: '无行情数据' });
    }

    // 按日期正序排列
    const sorted = [...quotes].sort((a, b) =>
      new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime()
    );

    const ohlcvData: OHLCV[] = sorted.map(q => ({
      tradeDate: new Date(q.tradeDate).toISOString().split('T')[0],
      open: Number(q.openPrice),
      close: Number(q.closePrice),
      high: Number(q.highPrice),
      low: Number(q.lowPrice),
      volume: Number(q.volume),
    }));

    const indicators = calculateAllIndicators(ohlcvData);

    res.json({
      success: true,
      data: {
        stock: { symbol: stock.symbol, name: stock.name },
        indicators,
        count: indicators.length,
      },
    });
  } catch (error) {
    console.error('获取技术指标失败:', error);
    res.status(500).json({
      success: false,
      error: '获取技术指标失败',
      details: error instanceof Error ? error.message : '未知错误',
    });
  }
});

/**
 * 获取MA均线数据
 * GET /api/indicators/:symbol/ma
 */
router.get('/indicators/:symbol/ma', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const period = parseInt(req.query.period as string) || 5;
    const limit = parseInt(req.query.limit as string) || 120;

    const stock = await db.getStockBySymbol(symbol);
    if (!stock) {
      return res.status(404).json({ success: false, error: '股票未找到' });
    }

    const quotes = await db.getDailyQuotes(stock.id, undefined, undefined, limit);
    const sorted = [...quotes].sort((a, b) =>
      new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime()
    );

    const closePrices = sorted.map(q => Number(q.closePrice));
    const { calculateMA } = await import('../indicators/technical');
    const maValues = calculateMA(closePrices, period);

    const result = sorted.map((q, i) => ({
      tradeDate: new Date(q.tradeDate).toISOString().split('T')[0],
      close: Number(q.closePrice),
      ma: maValues[i],
    }));

    res.json({
      success: true,
      data: { symbol, period, values: result },
    });
  } catch (error) {
    console.error('获取MA失败:', error);
    res.status(500).json({ success: false, error: '获取MA失败' });
  }
});

/**
 * 获取MACD数据
 * GET /api/indicators/:symbol/macd
 */
router.get('/indicators/:symbol/macd', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const limit = parseInt(req.query.limit as string) || 120;

    const stock = await db.getStockBySymbol(symbol);
    if (!stock) {
      return res.status(404).json({ success: false, error: '股票未找到' });
    }

    const quotes = await db.getDailyQuotes(stock.id, undefined, undefined, limit);
    const sorted = [...quotes].sort((a, b) =>
      new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime()
    );

    const closePrices = sorted.map(q => Number(q.closePrice));
    const { calculateMACD } = await import('../indicators/technical');
    const macd = calculateMACD(closePrices);

    const result = sorted.map((q, i) => ({
      tradeDate: new Date(q.tradeDate).toISOString().split('T')[0],
      close: Number(q.closePrice),
      dif: macd.macd[i],
      dea: macd.signal[i],
      histogram: macd.histogram[i],
    }));

    res.json({
      success: true,
      data: { symbol, values: result },
    });
  } catch (error) {
    console.error('获取MACD失败:', error);
    res.status(500).json({ success: false, error: '获取MACD失败' });
  }
});

/**
 * 获取KDJ数据
 * GET /api/indicators/:symbol/kdj
 */
router.get('/indicators/:symbol/kdj', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const limit = parseInt(req.query.limit as string) || 120;

    const stock = await db.getStockBySymbol(symbol);
    if (!stock) {
      return res.status(404).json({ success: false, error: '股票未找到' });
    }

    const quotes = await db.getDailyQuotes(stock.id, undefined, undefined, limit);
    const sorted = [...quotes].sort((a, b) =>
      new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime()
    );

    const highPrices = sorted.map(q => Number(q.highPrice));
    const lowPrices = sorted.map(q => Number(q.lowPrice));
    const closePrices = sorted.map(q => Number(q.closePrice));
    const { calculateKDJ } = await import('../indicators/technical');
    const kdj = calculateKDJ(highPrices, lowPrices, closePrices);

    const result = sorted.map((q, i) => ({
      tradeDate: new Date(q.tradeDate).toISOString().split('T')[0],
      close: Number(q.closePrice),
      k: kdj.k[i],
      d: kdj.d[i],
      j: kdj.j[i],
    }));

    res.json({
      success: true,
      data: { symbol, values: result },
    });
  } catch (error) {
    console.error('获取KDJ失败:', error);
    res.status(500).json({ success: false, error: '获取KDJ失败' });
  }
});

/**
 * 获取RSI数据
 * GET /api/indicators/:symbol/rsi
 */
router.get('/indicators/:symbol/rsi', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const period = parseInt(req.query.period as string) || 14;
    const limit = parseInt(req.query.limit as string) || 120;

    const stock = await db.getStockBySymbol(symbol);
    if (!stock) {
      return res.status(404).json({ success: false, error: '股票未找到' });
    }

    const quotes = await db.getDailyQuotes(stock.id, undefined, undefined, limit);
    const sorted = [...quotes].sort((a, b) =>
      new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime()
    );

    const closePrices = sorted.map(q => Number(q.closePrice));
    const { calculateRSI } = await import('../indicators/technical');
    const rsiValues = calculateRSI(closePrices, period);

    const result = sorted.map((q, i) => ({
      tradeDate: new Date(q.tradeDate).toISOString().split('T')[0],
      close: Number(q.closePrice),
      rsi: rsiValues[i],
    }));

    res.json({
      success: true,
      data: { symbol, period, values: result },
    });
  } catch (error) {
    console.error('获取RSI失败:', error);
    res.status(500).json({ success: false, error: '获取RSI失败' });
  }
});

/**
 * 获取布林带数据
 * GET /api/indicators/:symbol/boll
 */
router.get('/indicators/:symbol/boll', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const period = parseInt(req.query.period as string) || 20;
    const limit = parseInt(req.query.limit as string) || 120;

    const stock = await db.getStockBySymbol(symbol);
    if (!stock) {
      return res.status(404).json({ success: false, error: '股票未找到' });
    }

    const quotes = await db.getDailyQuotes(stock.id, undefined, undefined, limit);
    const sorted = [...quotes].sort((a, b) =>
      new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime()
    );

    const closePrices = sorted.map(q => Number(q.closePrice));
    const { calculateBollingerBands } = await import('../indicators/technical');
    const boll = calculateBollingerBands(closePrices, period);

    const result = sorted.map((q, i) => ({
      tradeDate: new Date(q.tradeDate).toISOString().split('T')[0],
      close: Number(q.closePrice),
      upper: boll.upper[i],
      middle: boll.middle[i],
      lower: boll.lower[i],
    }));

    res.json({
      success: true,
      data: { symbol, period, values: result },
    });
  } catch (error) {
    console.error('获取布林带失败:', error);
    res.status(500).json({ success: false, error: '获取布林带失败' });
  }
});

export default router;
