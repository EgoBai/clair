/**
 * A股行情分析网站 - 服务启动入口
 * 导入 app 和 httpServer，初始化数据库，启动 HTTP 监听
 */

import 'dotenv/config';
// 环境修复：本机 IPv6 出口到东财/腾讯等 CDN 不通，统一优先 IPv4
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import { app, httpServer } from './app';
import { initDatabase, getDb } from './db/dbFactory';
import { wsService } from './websocket/server';
import { dataSyncService } from './data-sync/DataSyncService';

const PORT = parseInt(process.env.PORT || '3001', 10);

// ==================== 启动服务器 ====================
(async () => {
  const { db, type } = await initDatabase();
  console.log(`📊 数据库类型: ${type}`);

  // 启动定时行情同步 (每5分钟)
  dataSyncService.startScheduledSync(300);

  httpServer.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║   A股行情分析网站 - 后端服务已启动 (v1.7.0)      ║
╠══════════════════════════════════════════════════╣
║   HTTP服务:     http://localhost:${PORT}          ║
║   WebSocket:    ws://localhost:${PORT}            ║
║   健康检查:     http://localhost:${PORT}/health    ║
║   Swagger UI:   http://localhost:${PORT}/api-docs ║
║   ReDoc:        http://localhost:${PORT}/api-docs/redoc ║
║   OpenAPI JSON: http://localhost:${PORT}/api-docs/openapi.json ║
╚══════════════════════════════════════════════════╝
    `);
  });
})();

// ==================== 优雅退出 ====================
const gracefulShutdown = async (signal: string) => {
  console.log(`\n收到 ${signal} 信号，正在优雅关闭...`);
  dataSyncService.stopScheduledSync();
  wsService.shutdown();
  await getDb().close();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
