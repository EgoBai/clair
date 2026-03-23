/**
 * A股行情分析网站 - 后端应用入口
 * 集成所有模块：API路由、WebSocket、数据同步
 * 已集成：限流、输入验证、安全头、压缩
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { db } from './db/Database';
import stockRouter from './api/stock';
import indicatorRouter from './api/indicators';
import sectorRouter from './api/sectors';
import fundFlowRouter from './api/fund-flow';
import watchlistRouter from './api/watchlist';
import { wsService } from './websocket/server';
import { dataSyncService } from './data-sync/DataSyncService';
import { apiRateLimit, syncRateLimit } from './middleware/rateLimit';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const httpServer = createServer(app);

// ==================== 安全中间件 ====================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ==================== 限流 ====================
app.use(apiRateLimit);

// ==================== 请求日志 ====================
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path !== '/health') {
      const logLevel = duration > 1000 ? '⚠️' : duration > 500 ? '🔸' : '🔹';
      console.log(`${logLevel} ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
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

// ==================== 搜索API ====================
import { searchAndSort, addSearchHistory, getSearchHistory } from './utils/search';
import { queryCache } from './utils/queryCache';

app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q as string || '').trim();
    const limit = parseInt(req.query.limit as string) || 20;

    if (!q) {
      return res.json({ success: true, data: { results: [], query: q } });
    }

    // 从缓存获取股票列表搜索
    const stocks = await queryCache.query(
      `search:${q}:${limit}`,
      async () => {
        const allStocks = await db.connection('stocks')
          .where('is_active', true)
          .select('id', 'symbol', 'name', 'market', 'industry')
          .limit(500);
        return allStocks;
      },
      60000 // 1分钟缓存
    );

    const results = searchAndSort(stocks as any[], q).slice(0, limit);

    // 记录搜索历史
    const userId = parseInt(req.query.userId as string) || 1;
    addSearchHistory(userId, { query: q });

    res.json({
      success: true,
      data: { results, query: q, total: results.length },
    });
  } catch (error) {
    console.error('搜索失败:', error);
    res.status(500).json({ success: false, error: '搜索失败' });
  }
});

// 搜索历史
app.get('/api/search/history', async (req, res) => {
  const userId = parseInt(req.query.userId as string) || 1;
  const history = getSearchHistory(userId);
  res.json({ success: true, data: { history } });
});

// ==================== 缓存统计API ====================
app.get('/api/stats/cache', async (_req, res) => {
  const stats = queryCache.getStats();
  const topCached = queryCache.getTopCached(5);
  res.json({ success: true, data: { ...stats, topCached } });
});

// ==================== 健康检查 ====================
app.get('/health', async (_req, res) => {
  try {
    const health = await db.healthCheck();
    const wsStats = wsService.getSubscriptionStats();
    const poolStats = db.getPoolStats();
    const cacheStats = queryCache.getStats();

    res.json({
      status: health.healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      version: '1.2.0',
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
app.post('/api/sync/realtime', syncRateLimit, async (_req, res) => {
  try {
    if (dataSyncService.isSyncing()) {
      return res.status(409).json({
        success: false,
        error: '同步任务正在运行中',
      });
    }

    const result = await dataSyncService.syncRealtimeQuotes();
    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '数据同步失败',
      details: error instanceof Error ? error.message : '未知错误',
    });
  }
});

app.post('/api/sync/kline/:symbol', syncRateLimit, async (req, res) => {
  try {
    const { symbol } = req.params;
    const days = parseInt(req.query.days as string) || 120;
    const result = await dataSyncService.syncKLineData(symbol, days);
    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'K线数据同步失败',
      details: error instanceof Error ? error.message : '未知错误',
    });
  }
});

// ==================== 根路径 ====================
app.get('/', (_req, res) => {
  res.json({
    service: 'A股行情分析网站 - 后端API',
    version: '1.1.0',
    status: 'running',
    endpoints: {
      health: '/health',
      stocks: '/api/stocks',
      indicators: '/api/indicators/:symbol',
      sectors: '/api/sectors',
      fundFlow: '/api/fund-flow/:symbol',
      watchlist: '/api/watchlist',
      market: '/api/market',
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
  console.error('❌ 服务器错误:', err);
  res.status(500).json({
    success: false,
    error: '服务器内部错误',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ==================== WebSocket 初始化 ====================
wsService.initialize(httpServer);

// ==================== 启动服务器 ====================
httpServer.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║   A股行情分析网站 - 后端服务已启动 (v1.1.0)  ║
╠══════════════════════════════════════════════╣
║   HTTP服务:     http://localhost:${PORT}        ║
║   WebSocket:    ws://localhost:${PORT}          ║
║   健康检查:     http://localhost:${PORT}/health  ║
║   API文档:      http://localhost:${PORT}/        ║
╚══════════════════════════════════════════════╝
  `);
});

// ==================== 优雅退出 ====================
const gracefulShutdown = async (signal: string) => {
  console.log(`\n收到 ${signal} 信号，正在优雅关闭...`);
  wsService.shutdown();
  await db.close();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { app, httpServer };
