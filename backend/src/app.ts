/**
 * A股行情分析网站 - 后端应用入口
 * 集成所有模块：API路由、WebSocket、数据同步
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

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const httpServer = createServer(app);

// 中间件
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 请求日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path !== '/health') {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// API 路由
app.use('/api', stockRouter);
app.use('/api', indicatorRouter);
app.use('/api', sectorRouter);
app.use('/api', fundFlowRouter);
app.use('/api', watchlistRouter);

// 健康检查
app.get('/health', async (_req, res) => {
  try {
    const isConnected = await db.testConnection();
    const wsStats = wsService.getSubscriptionStats();

    res.json({
      status: isConnected ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      database: isConnected ? 'connected' : 'disconnected',
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

// 数据同步API
app.post('/api/sync/realtime', async (_req, res) => {
  try {
    if (dataSyncService.isSyncing()) {
      return res.status(409).json({
        success: false,
        error: '同步任务正在运行中',
      });
    }

    // 异步执行同步
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

app.post('/api/sync/kline/:symbol', async (req, res) => {
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

// 根路径
app.get('/', (_req, res) => {
  res.json({
    service: 'A股行情分析网站 - 后端API',
    version: '1.0.0',
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

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: '接口未找到',
    path: req.path,
    method: req.method,
  });
});

// 全局错误处理
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    success: false,
    error: '服务器内部错误',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 初始化WebSocket
wsService.initialize(httpServer);

// 启动服务器
httpServer.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║   A股行情分析网站 - 后端服务已启动           ║
╠══════════════════════════════════════════════╣
║   HTTP服务:     http://localhost:${PORT}        ║
║   WebSocket:    ws://localhost:${PORT}          ║
║   健康检查:     http://localhost:${PORT}/health  ║
║   API文档:      http://localhost:${PORT}/        ║
╚══════════════════════════════════════════════╝
  `);
});

// 优雅退出
const gracefulShutdown = async (signal: string) => {
  console.log(`\n收到 ${signal} 信号，正在优雅关闭...`);
  wsService.shutdown();
  await db.close();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { app, httpServer };
