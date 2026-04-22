/**
 * A股行情分析网站 - 后端应用入口
 * 集成所有模块：API路由、WebSocket、数据同步
 * 已集成：限流、输入验证、安全头、压缩
 */

import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { corsMiddleware, corsStatusEndpoint } from './middleware/corsConfig.ts';
import { createServer } from 'http';
import { initDatabase, db, getDb } from './db/dbFactory.ts';
import { createLogger } from './utils/logger.ts';
// db is a lazy proxy, initialized via initDatabase()
const log = createLogger('App');
import stockRouter from './api/stock.ts';
import indicatorRouter from './api/indicators.ts';
import sectorRouter from './api/sectors.ts';
import fundFlowRouter from './api/fund-flow.ts';
import watchlistRouter from './api/watchlist.ts';
import alertRouter from './api/alerts.ts';
import screenerRouter from './api/screener.ts';
import advancedScreenerRouter from './api/advanced-screener.ts';
import backtestRouter from './api/backtest-routes.ts';
import portfolioRouter from './api/portfolio.ts';
import newsRouter from './api/news.ts';
import socialRouter from './api/social.ts';
import aiAnalysisRouter from './api/ai-analysis.ts';
import financialsRouter from './api/financials.ts';
import stockCompareRouter from './api/stock-compare.ts';
import sectorAnalysisRouter from './api/sector-analysis.ts';
import userRouter from './api/user.ts';
import performanceRouter from './api/performance.ts';
import orderBookRouter from './api/order-book.ts';
import marginRouter from './api/margin.ts';
import topTradersRouter from './api/top-traders.ts';
import blockTradesRouter from './api/block-trades.ts';
import shareholderChangesRouter from './api/shareholder-changes.ts';
import lockupSharesRouter from './api/lockup-shares.ts';
import aiStockSelectionRouter from './api/ai-stock-selection.ts';
import etfRouter from './api/etf.ts';
import apiDocsRouter from './api/api-docs.ts';
import { wsService } from './websocket/server.ts';
import { dataSyncService } from './data-sync/DataSyncService.ts';
import { apiRateLimit, syncRateLimit } from './middleware/rateLimit.ts';
import { csrfTokenEndpoint } from './middleware/csrf.ts';
import { enhancedSecurityHeaders } from './middleware/securityHeaders.ts';
import { performanceMonitor } from './middleware/performanceMonitor.ts';
import { sanitizeInput } from './middleware/validation.ts';
import { asyncHandler, sendSuccess, sendNotFound, sendConflict, sendInternalError } from './utils/apiResponse.ts';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const httpServer = createServer(app);

// ==================== 安全中间件 ====================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(enhancedSecurityHeaders());
app.use(corsMiddleware());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ==================== 限流 + 安全检查 + 性能监控 ====================
app.use(apiRateLimit);
app.use(sanitizeInput);
app.use(performanceMonitor.middleware());

// ==================== 请求日志 ====================
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path !== '/health') {
      const logLevel = duration > 1000 ? 'warn' : duration > 500 ? 'info' : 'debug';
      log[logLevel as 'warn' | 'info' | 'debug'](`${req.method} ${req.path}`, { status: res.statusCode, duration });
    }
  });
  next();
});

// ==================== API 路由 ====================
app.use('/api', stockRouter);
app.use('/api', indicatorRouter);
app.use('/api', sectorRouter);
app.use('/api', fundFlowRouter);
app.use('/api', watchlistRouter);
app.use('/api', alertRouter);
app.use('/api', screenerRouter);
app.use('/api', advancedScreenerRouter);
app.use('/api', backtestRouter);
app.use('/api', portfolioRouter);
app.use('/api', newsRouter);
app.use('/api', socialRouter);
app.use('/api', aiAnalysisRouter);
app.use('/api', financialsRouter);
app.use('/api', stockCompareRouter);
app.use('/api', sectorAnalysisRouter);
app.use('/api', userRouter);
app.use('/api', performanceRouter);
app.use('/api', orderBookRouter);
app.use('/api', marginRouter);
app.use('/api', topTradersRouter);
app.use('/api', blockTradesRouter);
app.use('/api', shareholderChangesRouter);
app.use('/api', lockupSharesRouter);
app.use('/api', aiStockSelectionRouter);
app.use('/api/etf', etfRouter);

// ==================== API 文档 ====================
app.use(apiDocsRouter);

// ==================== CSRF Token ====================
app.get('/api/csrf-token', csrfTokenEndpoint);

// ==================== CORS 状态端点 ====================
app.get('/api/security/cors', corsStatusEndpoint);

// ==================== 搜索API ====================
import { searchAndSort, addSearchHistory, getSearchHistory } from './utils/search.ts';
import { queryCache } from './utils/queryCache.ts';

app.get('/api/search', asyncHandler(async (req, res) => {
  const q = (req.query.q as string || '').trim();
  const limit = parseInt(req.query.limit as string) || 20;

  if (!q) {
    return sendSuccess(res, { results: [], query: q });
  }

  const stocks = await queryCache.query(
    `search:${q}:${limit}`,
    async () => {
      const allStocks = await getDb().connection('stocks')
        .where('is_active', true)
        .select('id', 'symbol', 'name', 'market', 'industry')
        .limit(500);
      return allStocks;
    },
    60000
  );

  const results = searchAndSort(stocks, q).slice(0, limit);
  const userId = parseInt(req.query.userId as string) || 1;
  addSearchHistory(userId, { query: q });

  sendSuccess(res, { results, query: q, total: results.length });
}));

// 搜索历史
app.get('/api/search/history', asyncHandler(async (req, res) => {
  const userId = parseInt(req.query.userId as string) || 1;
  const history = getSearchHistory(userId);
  sendSuccess(res, { history });
}));

// ==================== 缓存统计API ====================
app.get('/api/stats/cache', asyncHandler(async (_req, res) => {
  const stats = queryCache.getStats();
  const topCached = queryCache.getTopCached(5);
  sendSuccess(res, { ...stats, topCached });
}));

// ==================== 健康检查 ====================
app.get('/health', async (_req, res) => {
  try {
    const db = getDb();
    const health = await db.healthCheck();
    const wsStats = wsService.getSubscriptionStats();
    const poolStats = db.getPoolStats();
    const cacheStats = queryCache.getStats();

    res.json({
      status: health.healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      version: '1.4.0',
      database: {
        connected: health.healthy,
        latency: health.latency,
        pool: poolStats,
      },
      cache: {
        size: cacheStats.cacheSize,
        hitRate: (cacheStats.hitRate * 100).toFixed(1) + '%',
        slowQueries: cacheStats.slowQueries,
      },
      websocket: {
        connectedClients: wsStats.totalClients,
        activeSubscriptions: wsStats.totalSubscriptions,
      },
      dataSync: {
        isRunning: dataSyncService.isSyncing(),
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

// ==================== 数据同步API（严格限流）====================
app.post('/api/sync/realtime', syncRateLimit, asyncHandler(async (_req, res) => {
  if (dataSyncService.isSyncing()) {
    return sendConflict(res, '同步任务正在运行中');
  }
  const result = await dataSyncService.syncRealtimeQuotes();
  sendSuccess(res, result);
}));

app.post('/api/sync/kline/:symbol', syncRateLimit, asyncHandler(async (req, res) => {
  const { symbol } = req.params;
  const days = parseInt(req.query.days as string) || 120;
  const result = await dataSyncService.syncKLineData(symbol, days);
  sendSuccess(res, result);
}));

// ==================== 根路径 ====================
app.get('/', (_req, res) => {
  res.json({
    service: 'A股行情分析网站 - 后端API',
    version: '1.7.0',
    status: 'running',
    docs: {
      swaggerUI: '/api-docs',
      redoc: '/api-docs/redoc',
      openapiJson: '/api-docs/openapi.json',
      openapiYaml: '/api-docs/openapi.yaml',
      endpoints: '/api-docs/endpoints',
      info: '/api-docs/info',
    },
    endpoints: {
      health: '/health',
      stocks: '/api/stocks',
      indicators: '/api/indicators/:symbol',
      sectors: '/api/sectors',
      sectorAnalysis: '/api/sectors/analysis',
      fundFlow: '/api/fund-flow/:symbol',
      watchlist: '/api/watchlist',
      alerts: '/api/alerts',
      screener: '/api/screener/filter',
      advancedScreener: '/api/screener/advanced-filter',
      market: '/api/market',
      search: '/api/search',
      news: '/api/news',
      social: '/api/social/comments',
      aiAnalysis: '/api/ai/recommendations',
      aiStockSelection: '/api/ai/selection/recommendations',
      financials: '/api/financials/summary?symbol=',
      stockCompare: '/api/compare?symbols=',
      etf: '/api/etf/list',
      user: '/api/user/register | /api/user/login',
      performance: '/api/performance/overview',
      blockTrades: '/api/block-trades',
      shareholderChanges: '/api/shareholder-changes',
      lockupCalendar: '/api/lockup/calendar',
      aiDiagnose: '/api/ai/diagnose/:symbol',
      aiSectorRotation: '/api/ai/sector-rotation',
      aiAlertSuggestions: '/api/ai/alert-suggestions',
      sync: {
        realtime: 'POST /api/sync/realtime',
        kline: 'POST /api/sync/kline/:symbol',
      },
    },
    websocket: `ws://localhost:${PORT}`,
  });
});

// ==================== 404 & 错误处理 ====================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: '接口未找到',
    path: req.path,
    method: req.method,
  });
});

app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log.error('服务器错误', err);
  res.status(500).json({
    success: false,
    error: '服务器内部错误',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ==================== WebSocket 初始化 ====================
wsService.initialize(httpServer);

// ==================== 导出供 index.ts 使用 ====================
export { app, httpServer };
