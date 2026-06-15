/**
 * A股行情分析网站 - 后端应用入口
 * 集成所有模块：API路由、WebSocket、数据同步
 * 已集成：限流、输入验证、安全头、压缩
 */

import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { corsMiddleware, corsStatusEndpoint } from './middleware/corsConfig';
import { createServer } from 'http';
import { initDatabase, db, getDb, isMemoryMode } from './db/dbFactory';
import { InMemoryDatabase } from './db/InMemoryDatabase';
import { createLogger } from './utils/logger';
// db is a lazy proxy, initialized via initDatabase()
const log = createLogger('App');
import stockRouter from './api/stock';
import indicatorRouter from './api/indicators';
import sectorRouter from './api/sectors';
import fundFlowRouter from './api/fund-flow';
import watchlistRouter from './api/watchlist';
import alertRouter from './api/alerts';
import screenerRouter from './api/screener';
import advancedScreenerRouter from './api/advanced-screener';
import backtestRouter from './api/backtest-routes';
import portfolioRouter from './api/portfolio';
import newsRouter from './api/news';
import socialRouter from './api/social';
import aiAnalysisRouter from './api/ai-analysis';
import financialsRouter from './api/financials';
import stockCompareRouter from './api/stock-compare';
import sectorAnalysisRouter from './api/sector-analysis';
import userRouter from './api/user';
import performanceRouter from './api/performance';
import marginRouter from './api/margin';
import blockTradesRouter from './api/block-trades';
import lockupSharesRouter from './api/lockup-shares';
import aiStockSelectionRouter from './api/ai-stock-selection';
import multiSignalRouter from './api/multi-signal';
import dailyBriefingRouter from './api/daily-briefing';
import aiChatRouter from './api/ai-chat';
import aiStrategyRouter from './api/ai-strategy';
import etfRouter from './api/etf';
import apiDocsRouter from './api/api-docs';
import breadthRouter from './api/breadth';
import divergenceRouter from './api/divergence';
import notificationsRouter from './api/notifications';
import historyRouter from './api/history';
import strategyTemplatesRouter from './api/strategy-templates';
import analyticsRouter from './api/analytics';
import aiFilterRouter from './api/ai-filter';
import aiGemsRouter from './api/ai-gems';
import industryChainRouter from './api/industryChain';
import { wsService } from './websocket/server';
import { dataSyncService } from './data-sync/DataSyncService';
import { apiRateLimit, syncRateLimit } from './middleware/rateLimit';
import { csrfTokenEndpoint } from './middleware/csrf';
import { enhancedSecurityHeaders } from './middleware/securityHeaders';
import { performanceMonitor } from './middleware/performanceMonitor';
import { sanitizeInput } from './middleware/validation';
import { requestLogger } from './middleware/requestLogger';
import { asyncHandler, sendSuccess, sendConflict } from './utils/apiResponse';
import { AppError, ErrorCodes, globalErrorHandler, notFoundHandler } from './middleware/errorHandler';
import { handleTokenRefresh, authMiddleware } from './middleware/auth';
import { apiCache } from './services/apiCache';

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

// ==================== 结构化请求日志 ====================
app.use(requestLogger({
  skipPaths: ['/health', '/api/stats/cache'],
  slowThreshold: 1000,
  mediumThreshold: 500,
}));

// ==================== API 路由 ====================
// 首页核心路由 — 添加响应缓存 (市场数据 30s, 新闻 60s)
app.use('/api/market', apiCache.middleware({ ttl: 30 }) as import('express').RequestHandler);
app.use('/api/news', apiCache.middleware({ ttl: 60, key: 'cache:news' }) as import('express').RequestHandler);

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
app.use('/api', marginRouter);
app.use('/api', blockTradesRouter);
app.use('/api', lockupSharesRouter);
app.use('/api', aiStockSelectionRouter);
app.use('/api', multiSignalRouter);
app.use('/api', dailyBriefingRouter);
app.use('/api', aiChatRouter);
app.use('/api', aiStrategyRouter);
app.use('/api/etf', etfRouter);
app.use('/api', breadthRouter);
app.use('/api', divergenceRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api', historyRouter);
app.use('/api', strategyTemplatesRouter);
app.use('/api', analyticsRouter);
app.use('/api', aiFilterRouter);
app.use('/api', aiGemsRouter);
app.use('/api/industry-chains', industryChainRouter);

// ==================== API 文档 ====================
app.use(apiDocsRouter);

// ==================== CSRF Token ====================
app.get('/api/csrf-token', csrfTokenEndpoint);

// ==================== Token 刷新端点 ====================
app.post('/api/auth/refresh', asyncHandler(async (req, res) => handleTokenRefresh(req, res)));
app.post('/api/auth/logout', authMiddleware, asyncHandler(async (req, res) => {
  const { handleLogout } = await import('./middleware/auth');
  handleLogout(req, res);
}));

// ==================== CORS 状态端点 ====================
app.get('/api/security/cors', corsStatusEndpoint);

// ==================== 搜索API ====================
import { searchAndSort, addSearchHistory, getSearchHistory } from './utils/search';
import { queryCache } from './utils/queryCache';

app.get('/api/search', asyncHandler(async (req, res) => {
  const q = (req.query.q as string || '').trim();
  const limit = parseInt(req.query.limit as string) || 20;

  if (!q) {
    return sendSuccess(res, { results: [], query: q });
  }

  let results: Array<{ id: number; symbol: string; name: string; market: string; industry?: string }> = [];

  if (isMemoryMode()) {
    const inMemDb = getDb() as unknown as InMemoryDatabase;
    results = inMemDb.searchStocks(q, limit);
  } else {
    try {
      const qLower = q.toLowerCase();
      // 先尝试精确匹配
      results = await getDb().connection('stocks')
        .where('is_active', true)
        .andWhere(function() {
          this.whereILike('symbol', `%${q}%`)
            .orWhereILike('code', `%${q}%`)
            .orWhereILike('name', `%${q}%`)
            .orWhereILike('industry', `%${q}%`);
        })
        .select('id', 'symbol', 'name', 'market', 'industry')
        .orderByRaw(`
          CASE
            WHEN LOWER(symbol) = ? THEN 0
            WHEN LOWER(symbol) LIKE ? THEN 1
            WHEN LOWER(name) = ? THEN 2
            WHEN LOWER(name) LIKE ? THEN 3
            ELSE 4
          END
        `, [qLower, `${qLower}%`, qLower, `${qLower}%`])
        .limit(limit);

      // 如果精确匹配无结果，尝试逐字模糊匹配
      if (results.length === 0 && q.length >= 2) {
        const chars = q.split('');
        const likeConditions = chars.map(c => `name ILIKE '%${c}%'`).join(' AND ');
        results = await getDb().connection('stocks')
          .where('is_active', true)
          .andWhereRaw(likeConditions)
          .select('id', 'symbol', 'name', 'market', 'industry')
          .orderByRaw(`
            CASE
              WHEN LOWER(name) LIKE ? THEN 0
              ELSE 1
            END
          `, [`${qLower}%`])
          .limit(limit);
      }
    } catch (e) {
      log.warn('PG 搜索失败，降级 InMemoryDB:', { error: (e as Error).message });
      const inMemDb = getDb() as unknown as InMemoryDatabase;
      results = inMemDb.searchStocks(q, limit);
    }
  }

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

// 同步状态查询
app.get('/api/sync/state', asyncHandler(async (_req, res) => {
  sendSuccess(res, dataSyncService.getSyncState());
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
      breadth: '/api/breadth/current | /api/breadth/sectors | /api/breadth/history | /api/breadth/mcclellan',
      divergence: '/api/divergence/analyze | /api/divergence/rsi | /api/divergence/macd | /api/divergence/detect',
      notifications: '/api/notifications/user/:userId | POST /api/notifications',
      sync: {
        realtime: 'POST /api/sync/realtime',
        kline: 'POST /api/sync/kline/:symbol',
      },
    },
    websocket: `ws://localhost:${PORT}`,
  });
});

// ==================== 404 & 错误处理 ====================
app.use(notFoundHandler);
app.use(globalErrorHandler);

// ==================== WebSocket 初始化 ====================
wsService.initialize(httpServer);

// ==================== 导出供 index.ts 使用 ====================

// ==================== 导出供 index.ts 使用 ====================
export { app, httpServer };
