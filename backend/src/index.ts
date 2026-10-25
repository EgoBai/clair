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

/**
 * 监听地址。
 *
 * ⚠️ 为什么必须显式指定 0.0.0.0（而不是沿用 Node 默认）：
 *   `server.listen(port)` 不传 host 时，Node 绑到 ::（IPv6 any）或依平台而异；
 *   在容器网络命名空间下，这会让「宿主机/负载均衡 → 容器」的入站连接拿不到
 *   （表现为平台健康检查超时、容器被反复重启）。
 *   显式绑 0.0.0.0 = 监听所有网卡，是容器化托管的通行做法。
 *   本机开发若只想监听回环，可用 HOST=127.0.0.1 覆盖。
 */
const HOST = process.env.HOST || '0.0.0.0';

// ==================== 启动服务器 ====================
(async () => {
  const { db, type } = await initDatabase();
  console.log(`📊 数据库类型: ${type}`);

  // 启动定时行情同步 (每5分钟)
  dataSyncService.startScheduledSync(300);

  // 显式传 host：容器内必须监听 0.0.0.0，否则外部探针连不上
  httpServer.listen(PORT, HOST, () => {
    // 打印**实际**绑定地址（而非硬编码 localhost）：
    // 容器内日志若写 localhost，运维会误以为只能本机访问，
    // 也无法据此拼出对外可用的 URL（平台注入的 PORT/HOST 可能与默认值不同）。
    // address() 返回 { address, family, port }：port 在 PORT=0 时是内核实际分配的端口；
    // address 在 IPv6 any 时是 '::'，此时回显 HOST 更可读。
    const addr = httpServer.address();
    const boundPort = typeof addr === 'object' && addr ? addr.port : PORT;
    const rawAddr = typeof addr === 'object' && addr ? addr.address : '';
    const boundHost = rawAddr && rawAddr !== '::' && rawAddr !== '0.0.0.0' ? rawAddr : HOST;
    // 0.0.0.0 不是可点击的 URL，展示时用 localhost 代替，真实绑定地址另行列出
    const displayHost = boundHost === '0.0.0.0' ? 'localhost' : boundHost;
    const baseUrl = `http://${displayHost}:${boundPort}`;
    console.log(`
╔══════════════════════════════════════════════════╗
║   A股行情分析网站 - 后端服务已启动 (v1.7.0)      ║
╠══════════════════════════════════════════════════╣
║   监听地址:     ${HOST}:${boundPort}
║   HTTP服务:     ${baseUrl}
║   WebSocket:    ws://${displayHost}:${boundPort}
║   健康检查:     ${baseUrl}/health
║   Swagger UI:   ${baseUrl}/api-docs
║   ReDoc:        ${baseUrl}/api-docs/redoc
║   OpenAPI JSON: ${baseUrl}/api-docs/openapi.json ║
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
