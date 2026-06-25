/**
 * 股票API接口
 * 提供股票查询、行情获取、市场指数等功能
 */

import { Router } from 'express';
import { db } from '../db/dbFactory';
import { StockSearchParams } from '../models/Stock';
import { validateQuery, validateBody, validateParams, schemas } from '../middleware/validation';
import {
  asyncHandler, sendSuccess, sendPaginated, sendNotFound, sendInternalError,
} from '../utils/apiResponse';
import { queryCache } from '../utils/queryCache';

const router = Router();

/** 标准化股票代码: 000001 → 000001.SZ, 600519 → 600519.SH */
function normalizeSymbol(symbol: string): string {
  if (!symbol) return symbol;
  if (/^\d{6}\.(SH|SZ|BJ)$/i.test(symbol)) return symbol.toUpperCase();
  if (/^\d{6}$/.test(symbol)) {
    if (symbol.startsWith('6')) return `${symbol}.SH`;
    if (symbol.startsWith('0') || symbol.startsWith('3')) return `${symbol}.SZ`;
    if (symbol.startsWith('8') || symbol.startsWith('4')) return `${symbol}.BJ`;
    return `${symbol}.SZ`;
  }
  return symbol;
}

// ==================== 股票查询 ====================

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

  const cacheKey = `stocks:${JSON.stringify(params)}`;
  const result = await queryCache.query(cacheKey, async () => {
    const [stocks, totalCount] = await Promise.all([
      db.getStocks(params),
      db.getStockCount(params),
    ]);

    return {
      stocks,
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / (params.pageSize ?? 20)),
      },
    };
  }, 30000); // 30秒缓存

  sendSuccess(res, result);
}));

// 注意：特定路径必须在通配符路径之前定义，否则 /stocks/:symbol 会匹配 /stocks/xxx/quotes
router.get('/stocks/:symbol/quotes', validateParams(schemas.stockSymbol), validateQuery(schemas.quoteQuery), asyncHandler(async (req, res) => {
  const rawSymbol = req.params.symbol;
  const symbol = normalizeSymbol(rawSymbol);
  let stock = await db.getStockBySymbol(symbol);
  if (!stock && symbol !== rawSymbol) stock = await db.getStockBySymbol(rawSymbol);
  if (!stock) return sendNotFound(res, '股票');
  const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
  const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 120;
  const quotes = await db.getDailyQuotes(stock.id, startDate, endDate, limit);
  sendSuccess(res, { stock: { symbol: stock.symbol, name: stock.name }, quotes });
}));

router.get('/stocks/:symbol/latest', validateParams(schemas.stockSymbol), asyncHandler(async (req, res) => {
  const rawSymbol = req.params.symbol;
  const symbol = normalizeSymbol(rawSymbol);
  const stockWithQuote = await db.getStockWithLatestQuote(symbol) || await db.getStockWithLatestQuote(rawSymbol);
  if (!stockWithQuote) return sendNotFound(res, '股票');
  sendSuccess(res, stockWithQuote);
}));

router.get('/stocks/:symbol', validateParams(schemas.stockSymbol), asyncHandler(async (req, res) => {
  const rawSymbol = req.params.symbol;
  const symbol = normalizeSymbol(rawSymbol);
  // 尝试标准化格式，如果找不到则尝试原始格式
  let stock = await db.getStockBySymbol(symbol);
  if (!stock && symbol !== rawSymbol) {
    stock = await db.getStockBySymbol(rawSymbol);
  }
  if (!stock) return sendNotFound(res, '股票');
  const latestQuote = await db.getLatestDailyQuote(stock.id);
  sendSuccess(res, { ...stock, latestQuote });
}));

// K线数据接口 - 支持日K/周K/月K
router.get('/stocks/:symbol/kline', validateParams(schemas.stockSymbol), asyncHandler(async (req, res) => {
  const rawSymbol = req.params.symbol;
  const symbol = normalizeSymbol(rawSymbol);
  const period = (req.query.period as string) || 'daily'; // daily/weekly/monthly
  const limit = Math.min(parseInt(req.query.limit as string) || 250, 1000);

  // 查找股票
  let stock = await db.getStockBySymbol(symbol);
  if (!stock && symbol !== rawSymbol) {
    stock = await db.getStockBySymbol(rawSymbol);
  }
  if (!stock) return sendNotFound(res, '股票');

  // 查询日K数据
  const klineRows = await db.connection('daily_quotes')
    .where('stock_id', stock.id)
    .select(
      'trade_date as tradeDate',
      'open_price as open',
      'close_price as close',
      'high_price as high',
      'low_price as low',
      'volume',
      'turnover'
    )
    .orderBy('trade_date', 'asc')
    .limit(limit);

  if (klineRows.length === 0) {
    return sendSuccess(res, { data: [], symbol, period, count: 0 });
  }

  // 转换为数值类型 + 日期格式化
  const fmtDate = (d: unknown): string => {
    if (!d) return '';
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    const dt = new Date(d as string | number | Date);
    return isNaN(dt.getTime()) ? String(d) : dt.toISOString().slice(0, 10);
  };
  let data = klineRows.map((r: Record<string, string | number>) => ({
    tradeDate: fmtDate(r.tradeDate),
    open: Number(r.open),
    close: Number(r.close),
    high: Number(r.high),
    low: Number(r.low),
    volume: Number(r.volume),
    turnover: Number(r.turnover),
  }));

  // 周K/月K聚合
  if (period === 'weekly' || period === 'monthly') {
    const grouped = new Map<string, typeof data>();
    for (const bar of data) {
      const d = new Date(bar.tradeDate);
      let key: string;
      if (period === 'weekly') {
        // ISO周: YYYY-Www
        const jan1 = new Date(d.getFullYear(), 0, 1);
        const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
        key = `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
      } else {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(bar);
    }
    data = Array.from(grouped.entries()).map(([, bars]) => ({
      tradeDate: bars[bars.length - 1].tradeDate,
      open: bars[0].open,
      close: bars[bars.length - 1].close,
      high: Math.max(...bars.map(b => b.high)),
      low: Math.min(...bars.map(b => b.low)),
      volume: bars.reduce((s, b) => s + b.volume, 0),
      turnover: bars.reduce((s, b) => s + b.turnover, 0),
    }));
  }

  sendSuccess(res, { quotes: data, symbol, period, count: data.length });
}));

router.post('/stocks/batch/quotes', validateBody(schemas.batchQuotes), asyncHandler(async (req, res) => {
  const { symbols } = req.body;
  const stocks = await db.getStocksWithLatestQuotes(symbols);
  sendSuccess(res, { stocks, count: stocks.length });
}));

// ==================== 市场数据 ====================

router.get('/market/summary', validateQuery(schemas.marketQuery), asyncHandler(async (req, res) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const summary = await db.getMarketSummary(date);
  if (!summary) return sendNotFound(res, '当日市场数据');
  try {
    const indices = await fetchMarketIndices();
    (summary as Record<string, unknown>).indices = indices;
  } catch (e) { /* 指数获取失败不影响主流程 */ }
  sendSuccess(res, summary);
}));

router.get('/market/indices', asyncHandler(async (_req, res) => {
  const indices = await fetchMarketIndices();
  sendSuccess(res, { indices });
}));

router.get('/market/industries', validateQuery(schemas.marketQuery), asyncHandler(async (req, res) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const industries = await db.getIndustryPerformance(date);
  sendSuccess(res, { date, industries });
}));

router.get('/market/top-gainers', validateQuery(schemas.marketQuery), asyncHandler(async (req, res) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const limit = parseInt(req.query.limit as string) || 10;
  const topGainers = await db.getTopGainers(date, limit);
  sendSuccess(res, { date, topGainers });
}));

router.get('/market/top-losers', validateQuery(schemas.marketQuery), asyncHandler(async (req, res) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const limit = parseInt(req.query.limit as string) || 10;
  const topLosers = await db.getTopLosers(date, limit);
  sendSuccess(res, { date, topLosers });
}));

router.get('/market/top-turnover', validateQuery(schemas.marketQuery), asyncHandler(async (req, res) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const limit = parseInt(req.query.limit as string) || 10;
  const topTurnover = await db.getTopTurnover(date, limit);
  sendSuccess(res, { date, topTurnover });
}));

// ==================== 三大指数实时行情 ====================

async function fetchMarketIndices() {
  // 腾讯API符号格式
  const indexConfig: { tencentSymbol: string; name: string; displaySymbol: string; category: string }[] = [
    { tencentSymbol: 'sh000001', name: '上证指数', displaySymbol: '000001.SH', category: '综合' },
    { tencentSymbol: 'sz399001', name: '深证成指', displaySymbol: '399001.SZ', category: '综合' },
    { tencentSymbol: 'sz399006', name: '创业板指', displaySymbol: '399006.SZ', category: '综合' },
    { tencentSymbol: 'sh000016', name: '上证50', displaySymbol: '000016.SH', category: '大盘' },
    { tencentSymbol: 'sh000300', name: '沪深300', displaySymbol: '000300.SH', category: '大盘' },
    { tencentSymbol: 'sh000905', name: '中证500', displaySymbol: '000905.SH', category: '中盘' },
    { tencentSymbol: 'sh000852', name: '中证1000', displaySymbol: '000852.SH', category: '小盘' },
    { tencentSymbol: 'sh000688', name: '科创50', displaySymbol: '000688.SH', category: '科创' },
    { tencentSymbol: 'sz399005', name: '中小100', displaySymbol: '399005.SZ', category: '中盘' },
  ];
  const symbols = indexConfig.map(c => c.tencentSymbol).join(',');
  const resp = await fetch(`https://qt.gtimg.cn/q=${symbols}`, {
    headers: { 'Referer': 'https://finance.qq.com' },
  });
  const text = await resp.text();
  const indices: Record<string, unknown>[] = [];
  for (const cfg of indexConfig) {
    const pattern = new RegExp(`v_${cfg.tencentSymbol}="([^"]+)"`);
    const match = text.match(pattern);
    if (!match) continue;
    const parts = match[1].split('~');
    if (parts.length < 40) continue;
    indices.push({
      name: cfg.name,
      symbol: cfg.displaySymbol,
      closePrice: parseFloat(parts[3]) || 0,
      openPrice: parseFloat(parts[5]) || 0,
      highPrice: parseFloat(parts[33]) || 0,
      lowPrice: parseFloat(parts[34]) || 0,
      changePercent: parseFloat(parts[32]) || 0,
      volume: parseInt(parts[6]) || 0,
      turnover: parseInt(parts[37]) || 0,
      category: cfg.category,
    });
  }
  return indices;
}

export default router;
