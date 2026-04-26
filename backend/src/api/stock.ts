/**
 * 股票API接口
 * 提供股票查询、行情获取等功能
 * 已集成输入验证和限流，统一响应格式
 */

import { Router } from 'express';
import { db } from '../db/dbFactory';
import { StockSearchParams } from '../models/Stock';
import { validateQuery, validateBody, validateParams, schemas } from '../middleware/validation';
import {
  asyncHandler, sendSuccess, sendPaginated, sendNotFound, sendInternalError,
} from '../utils/apiResponse';

const router = Router();

/**
 * 获取股票列表
 * GET /api/stocks
 */
router.get('/stocks', validateQuery(schemas.stockSearch), asyncHandler(async (req, res) => {
  const params: StockSearchParams = {
    symbol: req.query.symbol as string,
    name: req.query.name as string,
    market: req.query.market as string,
    industry: req.query.industry as string,
    isActive: req.query.isActive !== 'false',
    page: parseInt(req.query.page as string) || 1,
    pageSize: parseInt(req.query.pageSize as string) || 20,
    sortBy: (req.query.sortBy as string) || 'symbol',
    sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'asc',
  };

  const [stocks, totalCount] = await Promise.all([
    db.getStocks(params),
    db.getStockCount(params),
  ]);

  sendSuccess(res, {
    stocks,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / (params.pageSize ?? 20)),
    },
  });
}));

/**
 * 获取单只股票详情
 * GET /api/stocks/:symbol
 */
router.get('/stocks/:symbol', validateParams(schemas.stockSymbol), asyncHandler(async (req, res) => {
  const { symbol } = req.params;
  const stock = await db.getStockBySymbol(symbol);

  if (!stock) return sendNotFound(res, '股票');

  const latestQuote = await db.getLatestDailyQuote(stock.id);
  sendSuccess(res, { ...stock, latestQuote });
}));

/**
 * 获取股票行情
 * GET /api/stocks/:symbol/quotes
 */
router.get(
  '/stocks/:symbol/quotes',
  validateParams(schemas.stockSymbol),
  validateQuery(schemas.quoteQuery),
  asyncHandler(async (req, res) => {
    const { symbol } = req.params;
    const stock = await db.getStockBySymbol(symbol);

    if (!stock) return sendNotFound(res, '股票');

    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 120;

    const quotes = await db.getDailyQuotes(stock.id, startDate, endDate, limit);
    sendSuccess(res, {
      stock: { symbol: stock.symbol, name: stock.name },
      quotes,
    });
  })
);

/**
 * 获取最新行情
 * GET /api/stocks/:symbol/latest
 */
router.get('/stocks/:symbol/latest', validateParams(schemas.stockSymbol), asyncHandler(async (req, res) => {
  const { symbol } = req.params;
  const stockWithQuote = await db.getStockWithLatestQuote(symbol);

  if (!stockWithQuote) return sendNotFound(res, '股票');

  sendSuccess(res, stockWithQuote);
}));

/**
 * 批量获取股票行情
 * POST /api/stocks/batch/quotes
 */
router.post('/stocks/batch/quotes', validateBody(schemas.batchQuotes), asyncHandler(async (req, res) => {
  const { symbols } = req.body;
  const stocks = await db.getStocksWithLatestQuotes(symbols);
  sendSuccess(res, { stocks, count: stocks.length });
}));

/**
 * 获取市场概况
 * GET /api/market/summary
 */
router.get('/market/summary', validateQuery(schemas.marketQuery), asyncHandler(async (req, res) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const summary = await db.getMarketSummary(date);

  if (!summary) return sendNotFound(res, '当日市场数据');

  sendSuccess(res, summary);
}));

/**
 * 获取行业表现
 * GET /api/market/industries
 */
router.get('/market/industries', validateQuery(schemas.marketQuery), asyncHandler(async (req, res) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const industries = await db.getIndustryPerformance(date);
  sendSuccess(res, { date, industries });
}));

/**
 * 获取涨幅榜
 * GET /api/market/top-gainers
 */
router.get('/market/top-gainers', validateQuery(schemas.marketQuery), asyncHandler(async (req, res) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const limit = parseInt(req.query.limit as string) || 10;
  const topGainers = await db.getTopGainers(date, limit);
  sendSuccess(res, { date, topGainers });
}));

/**
 * 获取跌幅榜
 * GET /api/market/top-losers
 */
router.get('/market/top-losers', validateQuery(schemas.marketQuery), asyncHandler(async (req, res) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const limit = parseInt(req.query.limit as string) || 10;
  const topLosers = await db.getTopLosers(date, limit);
  sendSuccess(res, { date, topLosers });
}));

/**
 * 获取成交额榜
 * GET /api/market/top-turnover
 */
router.get('/market/top-turnover', validateQuery(schemas.marketQuery), asyncHandler(async (req, res) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const limit = parseInt(req.query.limit as string) || 10;
  const topTurnover = await db.getTopTurnover(date, limit);
  sendSuccess(res, { date, topTurnover });
}));

export default router;
