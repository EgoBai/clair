/**
 * 股票API接口
 * 提供股票查询、行情获取、市场指数等功能
 */

import { Router, Response } from 'express';
import { db } from '../db/dbFactory';
import { StockSearchParams } from '../models/Stock';
import { validateQuery, validateBody, validateParams, schemas } from '../middleware/validation';
import {
  asyncHandler, sendPaginated, sendNotFound,
} from '../utils/apiResponse';
import { queryCache } from '../utils/queryCache';
import { dataSyncService } from '../data-sync/DataSyncService';
import { AppError } from '../middleware/errorHandler';

const router = Router();

/**
 * 诚实数据契约发送器（本文件统一出口）
 *
 * 与 api/market.ts 同构：顶层 dataSource 与 data 内 dataSource 由**同一个入参**派生，
 * 结构上杜绝 IP-20 那类「两级互相矛盾」。不用 sendSuccess 是因为它只输出
 * { success, data, timestamp }，dataSource 会被埋在 data 里，前端无法统一判定。
 */
function sendHonest(
  res: Response,
  dataSource: 'real' | 'unavailable',
  data: Record<string, unknown>,
): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    success: true,
    dataSource,
    data: { ...data, dataSource },
    timestamp: new Date().toISOString(),
  });
}

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

  // 诚实红线：DB 直读无「历史缓存」层，查不到行即如实置 unavailable，
  // 绝不让前端把「空列表」误当成「真实但今天没有股票」。
  const rowCount = Array.isArray(result.stocks) ? result.stocks.length : 0;
  if (rowCount === 0) {
    sendHonest(res, 'unavailable', {
      ...result,
      message: '本地真实股票库无匹配记录（数据库为空或筛选条件无命中），未返回任何股票数据',
    });
    return;
  }
  sendHonest(res, 'real', result);
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
  if (!quotes || quotes.length === 0) {
    sendHonest(res, 'unavailable', {
      stock: { symbol: stock.symbol, name: stock.name },
      quotes: [],
      message: '本地真实行情库无该股票的日线记录，未返回任何行情数据',
    });
    return;
  }
  sendHonest(res, 'real', { stock: { symbol: stock.symbol, name: stock.name }, quotes });
}));

router.get('/stocks/:symbol/latest', validateParams(schemas.stockSymbol), asyncHandler(async (req, res) => {
  const rawSymbol = req.params.symbol;
  const symbol = normalizeSymbol(rawSymbol);
  const stockWithQuote = await db.getStockWithLatestQuote(symbol) || await db.getStockWithLatestQuote(rawSymbol);
  if (!stockWithQuote) return sendNotFound(res, '股票');
  // 无最新行情时只回股票档案 + 显式空态，不用 0 冒充现价
  if (!stockWithQuote.latestQuote) {
    sendHonest(res, 'unavailable', {
      ...stockWithQuote,
      latestQuote: null,
      message: '本地真实行情库无该股票的最新行情记录，latestQuote 置 null（未用 0 顶替）',
    });
    return;
  }
  sendHonest(res, 'real', stockWithQuote as unknown as Record<string, unknown>);
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
  if (!latestQuote) {
    sendHonest(res, 'unavailable', {
      ...stock,
      latestQuote: null,
      message: '本地真实行情库无该股票的最新行情记录，latestQuote 置 null（未用 0 顶替）',
    });
    return;
  }
  sendHonest(res, 'real', { ...stock, latestQuote });
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
    // 诚实空态：真实库无 K 线时置 unavailable，绝不返回 count:0 冒充「真实但无行情」
    return sendHonest(res, 'unavailable', {
      data: [], symbol, period, count: 0,
      message: '本地真实行情库无该股票的 K 线记录，未返回任何行情数据',
    });
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

  sendHonest(res, 'real', { quotes: data, symbol, period, count: data.length });
}));

router.post('/stocks/batch/quotes', validateBody(schemas.batchQuotes), asyncHandler(async (req, res) => {
  const { symbols } = req.body;
  const stocks = await db.getStocksWithLatestQuotes(symbols);
  if (!stocks || stocks.length === 0) {
    sendHonest(res, 'unavailable', {
      stocks: [], count: 0,
      message: '本地真实行情库无匹配标的的行情记录，未返回任何行情数据',
    });
    return;
  }
  sendHonest(res, 'real', { stocks, count: stocks.length });
}));

// ==================== 市场数据 ====================

router.get('/market/summary', validateQuery(schemas.marketQuery), asyncHandler(async (req, res) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const summary = await db.getMarketSummary(date);
  if (!summary) {
    sendHonest(res, 'unavailable', {
      date: date.toISOString().split('T')[0],
      message: '本地真实行情库无当日市场聚合数据（未同步或非交易日），未返回任何涨跌家数',
    });
    return;
  }
  let indicesAvailable = true;
  try {
    const indices = await fetchMarketIndices();
    (summary as Record<string, unknown>).indices = indices;
    indicesAvailable = indices.length > 0;
  } catch (e) { /* 指数获取失败不影响主流程 */ }
  // indices 来自腾讯实时源，失败时主数据仍为真实 → 整体仍是 real，但显式告知 indices 缺失
  sendHonest(res, 'real', {
    ...summary,
    ...(indicesAvailable ? {} : { message: '市场聚合数据为真实值；实时指数源不可达，indices 为空' }),
  });
}));

router.get('/market/indices', asyncHandler(async (_req, res) => {
  const indices = await fetchMarketIndices();
  if (!indices || indices.length === 0) {
    sendHonest(res, 'unavailable', {
      indices: [],
      message: '腾讯实时指数源不可达或未返回数据，未返回任何指数数值',
    });
    return;
  }
  sendHonest(res, 'real', { indices });
}));

router.get('/market/industries', validateQuery(schemas.marketQuery), asyncHandler(async (req, res) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const industries = await db.getIndustryPerformance(date);
  sendHonest(res, industries.length > 0 ? 'real' : 'unavailable', {
    date,
    industries,
    ...(industries.length > 0
      ? {}
      : { message: '本地真实行情库无该交易日的行业聚合数据（未同步或非交易日）' }),
  });
}));

router.get('/market/top-gainers', validateQuery(schemas.marketQuery), asyncHandler(async (req, res) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const limit = parseInt(req.query.limit as string) || 10;
  const topGainers = await db.getTopGainers(date, limit);
  sendHonest(res, topGainers.length > 0 ? 'real' : 'unavailable', {
    date, topGainers,
    ...(topGainers.length > 0 ? {} : { message: '本地真实行情库无该交易日的涨幅榜数据' }),
  });
}));

router.get('/market/top-losers', validateQuery(schemas.marketQuery), asyncHandler(async (req, res) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const limit = parseInt(req.query.limit as string) || 10;
  const topLosers = await db.getTopLosers(date, limit);
  sendHonest(res, topLosers.length > 0 ? 'real' : 'unavailable', {
    date, topLosers,
    ...(topLosers.length > 0 ? {} : { message: '本地真实行情库无该交易日的跌幅榜数据' }),
  });
}));

router.get('/market/top-turnover', validateQuery(schemas.marketQuery), asyncHandler(async (req, res) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const limit = parseInt(req.query.limit as string) || 10;
  const topTurnover = await db.getTopTurnover(date, limit);
  sendHonest(res, topTurnover.length > 0 ? 'real' : 'unavailable', {
    date, topTurnover,
    ...(topTurnover.length > 0 ? {} : { message: '本地真实行情库无该交易日的换手率榜数据' }),
  });
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

// ==================== 技术指标批量查询 ====================

router.post('/tech/batch', asyncHandler(async (req, res) => {
  const { symbols, days: rawDays } = req.body;
  const days = Math.min(rawDays || 30, 120);
  const symbolList = ((symbols as string[]) || []).slice(0, 40);
  
  if (!symbolList.length) {
    throw new AppError(400, 'VALIDATION_ERROR', '未提供 symbols：无法查询任何技术指标', 'symbols 不能为空数组');
  }

  const results: Record<string, any> = {};

  // Parallel: resolve all symbols to stock_ids
  const stockInfos = await Promise.all(
    symbolList.map(async (sym) => {
      const stock = await db.getStockBySymbol(sym);
      return { symbol: sym, stockId: stock?.id ?? null };
    })
  );

  // Fetch quotes and compute in parallel batches of 10
  const batchSize = 10;
  for (let i = 0; i < stockInfos.length; i += batchSize) {
    const batch = stockInfos.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async ({ symbol, stockId }) => {
        if (!stockId) return { symbol };
        try {
          const quotes = await db.getDailyQuotes(stockId, undefined, undefined, days + 20);
          if (!quotes || quotes.length < 5) return { symbol };

          // Sort ascending by trade_date (oldest first)
          quotes.sort((a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime());
          const closes = quotes.map(q => Number(q.closePrice)).filter(c => c > 0);
          if (closes.length < 5) return { symbol };

          const latest = closes[closes.length - 1];

          const change5d = closes.length >= 6
            ? Math.round(((latest - closes[closes.length - 6]) / closes[closes.length - 6] * 100) * 100) / 100
            : null;
          const change20d = closes.length >= 21
            ? Math.round(((latest - closes[closes.length - 21]) / closes[closes.length - 21] * 100) * 100) / 100
            : null;
          const changeRange = closes.length >= days + 1
            ? Math.round(((latest - closes[closes.length - 1 - days]) / closes[closes.length - 1 - days] * 100) * 100) / 100
            : null;

          const lookback20 = closes.slice(-20);
          const ma20 = Math.round((lookback20.reduce((a, b) => a + b, 0) / lookback20.length) * 100) / 100;
          const maDeviation = Math.round(((latest - ma20) / ma20 * 100) * 100) / 100;

          let rsi14: number | null = null;
          if (closes.length >= 15) {
            const rsiCloses = closes.slice(-15);
            let gains = 0, losses = 0;
            for (let j = 1; j < rsiCloses.length; j++) {
              const diff = rsiCloses[j] - rsiCloses[j - 1];
              if (diff > 0) gains += diff;
              else losses += Math.abs(diff);
            }
            if (gains + losses === 0) {
              rsi14 = 50;
            } else {
              rsi14 = Math.round(100 - (100 / (1 + (gains / 14) / (losses / 14))));
            }
          }

          // Volatility 20d
          let vol20d: number | null = null;
          if (lookback20.length >= 2) {
            const rets: number[] = [];
            for (let j = 1; j < lookback20.length; j++) {
              rets.push(Math.log(lookback20[j] / lookback20[j - 1]));
            }
            const m = rets.reduce((a, b) => a + b, 0) / rets.length;
            const v = rets.reduce((a, b) => a + (b - m) ** 2, 0) / rets.length;
            vol20d = Math.round(Math.sqrt(v) * Math.sqrt(250) * 100 * 100) / 100;
          }

          return {
            symbol,
            change5d,
            change20d,
            changeRange,
            ma20,
            maDeviation,
            rsi14,
            volatility20d: vol20d,
          };
        } catch (e) {
          if (e instanceof AppError) throw e;
          return { symbol };
        }
      })
    );

    for (const r of batchResults) {
      if (r.change5d != null) {
        results[r.symbol] = r;
      }
    }
  }

  if (Object.keys(results).length === 0) {
    // 顶层与 data 内共用同一 dataSource 变量（诚实红线：绝不返回 0 值或空对象冒充真实）
    return sendHonest(res, 'unavailable', {
      message: '未获得任何标的的技术指标：数据源不可用或历史行情样本不足',
      data: {},
    });
  }

  sendHonest(res, 'real', { data: results });
}));


// ==================== 数据新鲜度 ====================

router.get('/data/freshness', asyncHandler(async (_req, res) => {
  const cacheKey = 'data:freshness';
  const result = await queryCache.query(cacheKey, async () => {
    // 查询最新交易日
    const latestDateRow = await db.connection('daily_quotes')
      .max('trade_date as latest_date')
      .first();
    const latestTradeDate: string | null = latestDateRow?.latest_date
      ? new Date(latestDateRow.latest_date).toISOString().slice(0, 10)
      : null;

    // 查询今日行情数量
    const today = new Date().toISOString().slice(0, 10);
    const todayRow = await db.connection('daily_quotes')
      .where('trade_date', '>=', today)
      .count('* as cnt')
      .first();
    const quotesToday = Number(todayRow?.cnt || 0);

    // 查询活跃股票数量
    const stockRow = await db.connection('stocks')
      .where('is_active', true)
      .count('* as cnt')
      .first();
    const stockCount = Number(stockRow?.cnt || 0);

    // 同步状态
    const syncState = dataSyncService.getSyncState();

    return {
      latestTradeDate,
      stockCount,
      quotesToday,
      syncInterval: syncState.intervalSeconds,
      lastSyncAt: syncState.lastSyncAt,
      totalSyncs: syncState.totalSyncs,
      isSyncing: syncState.running,
      degraded: syncState.degraded || false,
    };
  }, 60000); // 60秒缓存

  // 数据新鲜度本身即「真实库有无数据」的如实反映：无任何真实行时置 unavailable
  const hasRealRows = latestTradeDate !== null || stockCount > 0;
  sendHonest(res, hasRealRows ? 'real' : 'unavailable', {
    ...result,
    ...(hasRealRows
      ? {}
      : { message: '本地真实行情库为空（无最新交易日、无活跃股票），以下计数均为 0 而非行情数据' }),
  });
}));

export default router;
