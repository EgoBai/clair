/**
 * 技术指标 API
 * 提供 MA、MACD、KDJ、RSI、布林带等技术指标计算和查询
 */

import { Request, Response, Router, NextFunction } from 'express';
import { db } from '../db/dbFactory';
import { calculateAllIndicators, OHLCV } from '../indicators/technical';
import { validateQuery, validateParams, schemas } from '../middleware/validation';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler, sendSuccess, sendNotFound, sendInternalError } from '../utils/apiResponse';

// 诚实红线契约（datapath R0'-3 / 契约偏差修正）：
// 在「生产环境 + 内存库降级态」下，db 层读行情的方法（如 getDailyQuotes）会抛
// FabricatedDataRefusedError —— 它是 AppError 子类，自带 statusCode=503 与
// code='FABRICATED_DATA_REFUSED'，由统一错误中间件（middleware/errorHandler.ts）
// 渲染为机器可读的 { code, message, timestamp }。
// 本文件每个 handler 的本地 catch 若**无条件**吞掉它，就会把该契约降级成
// 「500 且响应体无 code」。故各 catch 一律先把它交还给 next()。
const FORWARD_APP_ERROR = (error: unknown, next: NextFunction): boolean => {
  if (error instanceof AppError) {
    next(error);
    return true;
  }
  return false;
};

const router = Router();

/**
 * 诚实数据契约发送器（本文件统一出口）：顶层 dataSource 与 data 内同源。
 *
 * 本文件的取数链是 db.getDailyQuotes → calculateAllIndicators，
 * 指标**完全由真实行情推导**，无任何随机/兜底成分，故成功路径一律 real。
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

/**
 * 获取股票技术指标
 * GET /api/indicators/:symbol
 */
router.get('/indicators/:symbol', validateParams(schemas.stockSymbol), validateQuery(schemas.indicatorQuery), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { symbol } = req.params;
    const limit = parseInt(req.query.limit as string) || 120;

    const stock = await db.getStockBySymbol(symbol);
    if (!stock) {
      return res.status(404).json({
        success: false,
        dataSource: 'unavailable',
        error: '股票未找到',
        message: '本地真实股票库无此代码，未计算任何技术指标',
      });
    }

    const quotes = await db.getDailyQuotes(stock.id, undefined, undefined, limit);
    if (quotes.length === 0) {
      return res.status(404).json({
        success: false,
        dataSource: 'unavailable',
        error: '无行情数据',
        message: '本地真实行情库无该股票的日线记录，未计算任何技术指标',
      });
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

    sendHonest(res, 'real', {
      stock: { symbol: stock.symbol, name: stock.name },
      indicators,
      count: indicators.length,
    });
  } catch (error) {
    if (FORWARD_APP_ERROR(error, next)) return;
    console.error('获取技术指标失败:', error);
    res.status(500).json({
      success: false,
      dataSource: 'unavailable',
      error: '获取技术指标失败',
      details: error instanceof Error ? error.message : '未知错误',
      message: '指标计算流程异常，未产出任何技术指标',
    });
  }
});

/**
 * 获取MA均线数据
 * GET /api/indicators/:symbol/ma
 */
router.get('/indicators/:symbol/ma', validateParams(schemas.stockSymbol), validateQuery(schemas.indicatorQuery), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { symbol } = req.params;
    const period = parseInt(req.query.period as string) || 5;
    const limit = parseInt(req.query.limit as string) || 120;

    const stock = await db.getStockBySymbol(symbol);
    if (!stock) {
      return res.status(404).json({
        success: false,
        dataSource: 'unavailable',
        error: '股票未找到',
        message: '本地真实股票库无此代码，未计算任何技术指标',
      });
    }

    const quotes = await db.getDailyQuotes(stock.id, undefined, undefined, limit);
    // 诚实空态（T-2604-06 / 任务#39）：无日线即无指标，置 unavailable，
    // 不用空 values 数组冒充「已计算但今日无数据」。
    if (quotes.length === 0) {
      sendHonest(res, 'unavailable', {
        symbol,
        values: [],
        message: '本地真实行情库无该股票的日线记录，未计算任何技术指标',
      });
      return;
    }
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

    sendHonest(res, 'real', { symbol, period, values: result });
  } catch (error) {
    if (FORWARD_APP_ERROR(error, next)) return;
    console.error('获取MA失败:', error);
    res.status(500).json({
      success: false,
      dataSource: 'unavailable',
      error: '获取MA失败',
      message: '指标计算流程异常，未产出任何技术指标',
    });
  }
});

/**
 * 获取MACD数据
 * GET /api/indicators/:symbol/macd
 */
router.get('/indicators/:symbol/macd', validateParams(schemas.stockSymbol), validateQuery(schemas.indicatorQuery), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { symbol } = req.params;
    const limit = parseInt(req.query.limit as string) || 120;

    const stock = await db.getStockBySymbol(symbol);
    if (!stock) {
      return res.status(404).json({
        success: false,
        dataSource: 'unavailable',
        error: '股票未找到',
        message: '本地真实股票库无此代码，未计算任何技术指标',
      });
    }

    const quotes = await db.getDailyQuotes(stock.id, undefined, undefined, limit);
    // 诚实空态（T-2604-06 / 任务#39）：无日线即无指标，置 unavailable，
    // 不用空 values 数组冒充「已计算但今日无数据」。
    if (quotes.length === 0) {
      sendHonest(res, 'unavailable', {
        symbol,
        values: [],
        message: '本地真实行情库无该股票的日线记录，未计算任何技术指标',
      });
      return;
    }
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

    sendHonest(res, 'real', { symbol, values: result });
  } catch (error) {
    if (FORWARD_APP_ERROR(error, next)) return;
    console.error('获取MACD失败:', error);
    res.status(500).json({
      success: false,
      dataSource: 'unavailable',
      error: '获取MACD失败',
      message: '指标计算流程异常，未产出任何技术指标',
    });
  }
});

/**
 * 获取KDJ数据
 * GET /api/indicators/:symbol/kdj
 */
router.get('/indicators/:symbol/kdj', validateParams(schemas.stockSymbol), validateQuery(schemas.indicatorQuery), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { symbol } = req.params;
    const limit = parseInt(req.query.limit as string) || 120;

    const stock = await db.getStockBySymbol(symbol);
    if (!stock) {
      return res.status(404).json({
        success: false,
        dataSource: 'unavailable',
        error: '股票未找到',
        message: '本地真实股票库无此代码，未计算任何技术指标',
      });
    }

    const quotes = await db.getDailyQuotes(stock.id, undefined, undefined, limit);
    // 诚实空态（T-2604-06 / 任务#39）：无日线即无指标，置 unavailable，
    // 不用空 values 数组冒充「已计算但今日无数据」。
    if (quotes.length === 0) {
      sendHonest(res, 'unavailable', {
        symbol,
        values: [],
        message: '本地真实行情库无该股票的日线记录，未计算任何技术指标',
      });
      return;
    }
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

    sendHonest(res, 'real', { symbol, values: result });
  } catch (error) {
    if (FORWARD_APP_ERROR(error, next)) return;
    console.error('获取KDJ失败:', error);
    res.status(500).json({
      success: false,
      dataSource: 'unavailable',
      error: '获取KDJ失败',
      message: '指标计算流程异常，未产出任何技术指标',
    });
  }
});

/**
 * 获取RSI数据
 * GET /api/indicators/:symbol/rsi
 */
router.get('/indicators/:symbol/rsi', validateParams(schemas.stockSymbol), validateQuery(schemas.indicatorQuery), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { symbol } = req.params;
    const period = parseInt(req.query.period as string) || 14;
    const limit = parseInt(req.query.limit as string) || 120;

    const stock = await db.getStockBySymbol(symbol);
    if (!stock) {
      return res.status(404).json({
        success: false,
        dataSource: 'unavailable',
        error: '股票未找到',
        message: '本地真实股票库无此代码，未计算任何技术指标',
      });
    }

    const quotes = await db.getDailyQuotes(stock.id, undefined, undefined, limit);
    // 诚实空态（T-2604-06 / 任务#39）：无日线即无指标，置 unavailable，
    // 不用空 values 数组冒充「已计算但今日无数据」。
    if (quotes.length === 0) {
      sendHonest(res, 'unavailable', {
        symbol,
        values: [],
        message: '本地真实行情库无该股票的日线记录，未计算任何技术指标',
      });
      return;
    }
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

    sendHonest(res, 'real', { symbol, period, values: result });
  } catch (error) {
    if (FORWARD_APP_ERROR(error, next)) return;
    console.error('获取RSI失败:', error);
    res.status(500).json({
      success: false,
      dataSource: 'unavailable',
      error: '获取RSI失败',
      message: '指标计算流程异常，未产出任何技术指标',
    });
  }
});

/**
 * 获取布林带数据
 * GET /api/indicators/:symbol/boll
 */
router.get('/indicators/:symbol/boll', validateParams(schemas.stockSymbol), validateQuery(schemas.indicatorQuery), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { symbol } = req.params;
    const period = parseInt(req.query.period as string) || 20;
    const limit = parseInt(req.query.limit as string) || 120;

    const stock = await db.getStockBySymbol(symbol);
    if (!stock) {
      return res.status(404).json({
        success: false,
        dataSource: 'unavailable',
        error: '股票未找到',
        message: '本地真实股票库无此代码，未计算任何技术指标',
      });
    }

    const quotes = await db.getDailyQuotes(stock.id, undefined, undefined, limit);
    // 诚实空态（T-2604-06 / 任务#39）：无日线即无指标，置 unavailable，
    // 不用空 values 数组冒充「已计算但今日无数据」。
    if (quotes.length === 0) {
      sendHonest(res, 'unavailable', {
        symbol,
        values: [],
        message: '本地真实行情库无该股票的日线记录，未计算任何技术指标',
      });
      return;
    }
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

    sendHonest(res, 'real', { symbol, period, values: result });
  } catch (error) {
    if (FORWARD_APP_ERROR(error, next)) return;
    console.error('获取布林带失败:', error);
    res.status(500).json({
      success: false,
      dataSource: 'unavailable',
      error: '获取布林带失败',
      message: '指标计算流程异常，未产出任何技术指标',
    });
  }
});

export default router;
