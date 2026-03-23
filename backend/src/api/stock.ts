/**
 * 股票API接口
 * 提供股票查询、行情获取等功能
 */

import { Request, Response, Router } from 'express';
import { db } from '../db/Database';
import { StockSearchParams } from '../models/Stock';

const router = Router();

/**
 * 获取股票列表
 * GET /api/stocks
 */
router.get('/stocks', async (req: Request, res: Response) => {
  try {
    const params: StockSearchParams = {
      symbol: req.query.symbol as string,
      name: req.query.name as string,
      market: req.query.market as string,
      industry: req.query.industry as string,
      isActive: req.query.isActive !== 'false',
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt(req.query.pageSize as string) || 20,
      sortBy: (req.query.sortBy as string) || 'symbol',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'asc'
    };

    const [stocks, totalCount] = await Promise.all([
      db.getStocks(params),
      db.getStockCount(params)
    ]);

    res.json({
      success: true,
      data: {
        stocks,
        pagination: {
          page: params.page,
          pageSize: params.pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / params.pageSize)
        }
      }
    });
  } catch (error) {
    console.error('获取股票列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取股票列表失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * 获取单只股票详情
 * GET /api/stocks/:symbol
 */
router.get('/stocks/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const stock = await db.getStockBySymbol(symbol);

    if (!stock) {
      return res.status(404).json({
        success: false,
        error: '股票未找到'
      });
    }

    res.json({
      success: true,
      data: stock
    });
  } catch (error) {
    console.error('获取股票详情失败:', error);
    res.status(500).json({
      success: false,
      error: '获取股票详情失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * 获取股票行情
 * GET /api/stocks/:symbol/quotes
 */
router.get('/stocks/:symbol/quotes', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const stock = await db.getStockBySymbol(symbol);

    if (!stock) {
      return res.status(404).json({
        success: false,
        error: '股票未找到'
      });
    }

    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

    const quotes = await db.getDailyQuotes(stock.id, startDate, endDate, limit);

    res.json({
      success: true,
      data: {
        stock: {
          symbol: stock.symbol,
          name: stock.name
        },
        quotes
      }
    });
  } catch (error) {
    console.error('获取股票行情失败:', error);
    res.status(500).json({
      success: false,
      error: '获取股票行情失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * 获取最新行情
 * GET /api/stocks/:symbol/latest
 */
router.get('/stocks/:symbol/latest', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const stockWithQuote = await db.getStockWithLatestQuote(symbol);

    if (!stockWithQuote) {
      return res.status(404).json({
        success: false,
        error: '股票未找到'
      });
    }

    res.json({
      success: true,
      data: stockWithQuote
    });
  } catch (error) {
    console.error('获取最新行情失败:', error);
    res.status(500).json({
      success: false,
      error: '获取最新行情失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * 批量获取股票行情
 * POST /api/stocks/batch/quotes
 */
router.post('/stocks/batch/quotes', async (req: Request, res: Response) => {
  try {
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({
        success: false,
        error: '需要提供股票代码数组'
      });
    }

    if (symbols.length > 100) {
      return res.status(400).json({
        success: false,
        error: '批量查询最多支持100只股票'
      });
    }

    const stocks = await db.getStocksWithLatestQuotes(symbols);

    res.json({
      success: true,
      data: {
        stocks,
        count: stocks.length
      }
    });
  } catch (error) {
    console.error('批量获取股票行情失败:', error);
    res.status(500).json({
      success: false,
      error: '批量获取股票行情失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * 获取市场概况
 * GET /api/market/summary
 */
router.get('/market/summary', async (req: Request, res: Response) => {
  try {
    const date = req.query.date ? new Date(req.query.date as string) : new Date();
    const summary = await db.getMarketSummary(date);

    if (!summary) {
      return res.status(404).json({
        success: false,
        error: '当日市场数据未找到'
      });
    }

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('获取市场概况失败:', error);
    res.status(500).json({
      success: false,
      error: '获取市场概况失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * 获取行业表现
 * GET /api/market/industries
 */
router.get('/market/industries', async (req: Request, res: Response) => {
  try {
    const date = req.query.date ? new Date(req.query.date as string) : new Date();
    const industries = await db.getIndustryPerformance(date);

    res.json({
      success: true,
      data: {
        date,
        industries
      }
    });
  } catch (error) {
    console.error('获取行业表现失败:', error);
    res.status(500).json({
      success: false,
      error: '获取行业表现失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * 获取涨幅榜
 * GET /api/market/top-gainers
 */
router.get('/market/top-gainers', async (req: Request, res: Response) => {
  try {
    const date = req.query.date ? new Date(req.query.date as string) : new Date();
    const limit = parseInt(req.query.limit as string) || 10;
    const topGainers = await db.getTopGainers(date, limit);

    res.json({
      success: true,
      data: {
        date,
        topGainers
      }
    });
  } catch (error) {
    console.error('获取涨幅榜失败:', error);
    res.status(500).json({
      success: false,
      error: '获取涨幅榜失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * 获取跌幅榜
 * GET /api/market/top-losers
 */
router.get('/market/top-losers', async (req: Request, res: Response) => {
  try {
    const date = req.query.date ? new Date(req.query.date as string) : new Date();
    const limit = parseInt(req.query.limit as string) || 10;
    const topLosers = await db.getTopLosers(date, limit);

    res.json({
      success: true,
      data: {
        date,
        topLosers
      }
    });
  } catch (error) {
    console.error('获取跌幅榜失败:', error);
    res.status(500).json({
      success: false,
      error: '获取跌幅榜失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
});

/**
 * 获取成交额榜
 * GET /api/market/top-turnover
 */
router.get('/market/top-turnover', async (req: Request, res: Response) => {
  try {
    const date = req.query.date ? new Date(req.query.date as string) : new Date();
    const limit = parseInt(req.query.limit as string) || 10;
    const topTurnover = await db.getTopTurnover(date, limit);

    res.json({
      success: true,
      data: {
        date,
        topTurnover
      }
    });
  } catch (error) {
    console.error('获取成交额榜失败:', error);
    res.status(500).json({
      success: false,
      error: '获取成交额榜失败',
      details: error instanceof Error ? error.message : '未知错误'
    });
  }
});

export default router;