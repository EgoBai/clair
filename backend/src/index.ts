/**
 * A股行情分析网站 - 服务启动入口
 * 导入 app 和 httpServer，初始化数据库，启动 HTTP 监听
 */

import { app, httpServer } from './app';
import { initDatabase, getDb } from './db/dbFactory';
import { wsService } from './websocket/server';

const PORT = parseInt(process.env.PORT || '3001', 10);

// ==================== 启动服务器 ====================
(async () => {
  const { db, type } = await initDatabase();
  console.log(`📊 数据库类型: ${type}`);

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
  wsService.shutdown();
  await getDb().close();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
