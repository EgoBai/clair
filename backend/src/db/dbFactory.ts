/**
 * 数据库工厂 — 自动选择PostgreSQL或内存数据库
 * PostgreSQL可用时使用真实数据库，否则降级到内存Mock
 */

import { Database } from './Database';
import { InMemoryDatabase, getInMemoryDb } from './InMemoryDatabase';
import { isFabricatedQuoteRefusalActive } from './FabricatedDataRefusedError';

export type DbType = 'postgres' | 'memory';

/**
 * /health 对外暴露的数据库类型词表。
 *
 * ⚠️ 与内部 DbType（'postgres'）**故意不同**：内部沿用 'postgres' 是历史包袱
 *    （tradingCalendar.ts / 各历史测试按 'postgres' 字面量比较，改动会波及
 *    本工单文件域之外的文件）；对外契约统一用产品真名 'postgresql'，
 *    避免运维把 PG / MySQL / SQLite 混为一谈。
 *    两者之间**只经 deriveHealthContract() 单点映射**，杜绝同一语义出现两种拼写。
 */
export type HealthDbType = 'postgresql' | 'memory';

/** /health 对外暴露的数据来源语义（与 API 层 dataSource 契约同源）。 */
export type HealthDataSource = 'real' | 'unavailable';

/** /health 的诚实降级契约三字段。 */
export interface HealthContract {
  /** 真正在服务的数据库类型（postgresql = 真 PG；memory = 内存库降级） */
  dbType: HealthDbType;
  /** 是否处于降级态（true = 正在用内存库，不是真 PG） */
  degraded: boolean;
  /** 数据来源是否真实可得（unavailable = 行情类数据不可得） */
  dataSource: HealthDataSource;
}

/**
 * knex 3.x 对「unix-socket host 参数」连接串（如 postgresql://user@/db?host=/tmp）
 * 的 parse-connection 链路会丢失 database（parse 产物含 port:''，pg.Pool 据此回退到
 * user 同名库，报 database "user" does not exist），表现为 testConnection() 静默 false
 * → 降级内存库——本地开发/测试因此从未真正连上 PG（2026-10-12 探针实验定位）。
 * 仅对该形态预解析成对象配置（pg 直连与 knex 对象路径均已验证 OK）；
 * 常规 tcp 连接串保持原样传给 knex，生产路径行为不变。
 */
function toKnexConnection(pgUrl: string): string | Record<string, unknown> {
  // 注意：不能用 new URL() —— WHATWG URL 对非特殊协议（postgresql:）带
  // userinfo+空 host 的形态直接 throw Invalid URL（实测 2026-10-12）。
  const qIndex = pgUrl.indexOf('?');
  if (qIndex === -1) return pgUrl;
  const socketHost = new URLSearchParams(pgUrl.slice(qIndex + 1)).get('host');
  if (!socketHost) return pgUrl;
  // 形态：scheme://[user[:password]@][tcpHost]/database?host=/unixSocketDir
  const head = pgUrl.slice(0, qIndex);
  const m = head.match(/^[a-zA-Z][\w+.-]*:\/\/(?:([^:@/]*)(?::([^@/]*))?@)?[^/]*\/(.*)$/);
  if (!m || !m[3]) return pgUrl;
  const conn: Record<string, unknown> = {
    host: socketHost,
    database: decodeURIComponent(m[3]),
  };
  if (m[1]) conn.user = decodeURIComponent(m[1]);
  if (m[2]) conn.password = decodeURIComponent(m[2]);
  return conn;
}

let currentType: DbType = 'memory';
let dbInstance: Database | InMemoryDatabase | null = null;

/**
 * 初始化数据库连接
 * 优先使用PostgreSQL，失败则降级到内存数据库
 *
 * ⚠️ 内存库已**不再生成**任何行情/估值（R0′-9 已删除 Math.random 伪造生成器），
 *   真实数据只有股票清单；行情类读取一律返回诚实空态（省略键 / 空数组 / null）。
 * - 降级态的机器可观测入口见 getDbStatus()
 * - 生产环境（NODE_ENV==='production'）下行情类读取由 InMemoryDatabase 升级为显式失败，
 *   见 db/FabricatedDataRefusedError.ts
 */
export async function initDatabase(): Promise<{ db: Database | InMemoryDatabase; type: DbType }> {
  const pgUrl = process.env.DATABASE_URL;
  // 记录 PG 不可用的原因，用于在降级后输出可观测的告警
  let pgUnavailableReason: string | null = null;

  if (pgUrl) {
    try {
      const config = {
        client: 'pg',
        connection: toKnexConnection(pgUrl),
        pool: {
          min: 2, 
          max: 20,
          acquireTimeoutMillis: 30000,
          createTimeoutMillis: 30000,
          destroyTimeoutMillis: 5000,
          idleTimeoutMillis: 30000,
          reapIntervalMillis: 1000,
          createRetryIntervalMillis: 200,
        },
        acquireConnectionTimeout: 5000,
        debug: process.env.NODE_ENV === 'development',
      };
      const pgDb = new Database(config);
      const connected = await pgDb.testConnection();

      if (connected) {
        console.log('✅ 使用 PostgreSQL 数据库');
        currentType = 'postgres';
        dbInstance = pgDb;
        return { db: pgDb, type: 'postgres' };
      }
      pgUnavailableReason = 'testConnection() 返回 false';
      console.warn('⚠️ PostgreSQL testConnection() 返回 false，降级到内存数据库');
    } catch (error) {
      pgUnavailableReason = (error as Error).message;
      console.warn('⚠️ PostgreSQL 连接失败，降级到内存数据库:', pgUnavailableReason);
    }
  } else {
    pgUnavailableReason = '未配置 DATABASE_URL';
    console.log('ℹ️ 未配置 DATABASE_URL，使用内存数据库');
  }

  // 降级到内存数据库
  currentType = 'memory';
  dbInstance = getInMemoryDb();
  const stockCount = getMemoryStockCount(dbInstance);
  // 诚实红线：不要把股票数量硬编码进日志（曾错误写死为 "20只股票"，实际为数千只）
  console.log(`✅ 使用内存数据库 (Mock数据, ${stockCount >= 0 ? `${stockCount} 只股票` : '股票数未知'})`);

  if (process.env.NODE_ENV === 'production') {
    // 生产环境降级必须在日志中显式暴露，且不得与常规 warn 混淆
    console.error(
      isFabricatedQuoteRefusalActive()
        ? `🚨 生产环境数据库降级：PostgreSQL 不可用（${pgUnavailableReason}）。` +
          '内存库已不生成任何行情/估值（R0′-9 已移除伪造生成器），生产环境将该静默空态升级为显式失败：' +
          '行情类端点返回 503/unavailable，不会返回任何行情数值；仅真实股票清单（symbol/name/industry）仍可用。'
        : `⚠️ 生产环境数据库降级且已设置 ALLOW_FABRICATED_MARKET_DATA=true：PostgreSQL 不可用（${pgUnavailableReason}）。` +
          '注意：内存库已无伪造行情可放行，该开关当前**只**让行情类读取返回诚实空态（而非抛错），' +
          '不改变数据内容；降级态应尽快恢复 PostgreSQL',
    );
  }

  return { db: dbInstance, type: 'memory' };
}

/**
 * 读取内存库实际股票数（不新建实例）。
 * 通过可选方法探测，兼容测试中注入的 mock 实例。
 */
function getMemoryStockCount(instance: Database | InMemoryDatabase | null): number {
  if (!instance) return -1;
  const probe = instance as unknown as { getStockCountSync?: () => number };
  return typeof probe.getStockCountSync === 'function' ? probe.getStockCountSync() : -1;
}

/**
 * 获取当前数据库状态（供健康检查/路由层暴露降级态）
 * - degraded: 仅当 type === 'memory' 时为 true —— 内存模式即降级态（无真实行情来源）。
 *   生产环境下 degraded 还意味着行情类读取已被 InMemoryDatabase 升级为显式失败
 *   （除非显式设置 ALLOW_FABRICATED_MARKET_DATA=true，此时改回返回诚实空态）。
 * - stockCount: 内存模式下返回内存库实际股票数；
 *   PostgreSQL 模式下不缓存计数，返回 -1（如需真实计数请调用 db.getStockCount()）；
 *   数据库尚未初始化时同样返回 -1。
 */
export function getDbStatus(): { type: DbType; degraded: boolean; stockCount: number } {
  const type = currentType;
  const degraded = type === 'memory';
  const stockCount = degraded ? getMemoryStockCount(dbInstance) : -1;
  return { type, degraded, stockCount };
}

/**
 * 推导 /health 的诚实降级契约三字段（**唯一真源**）。
 *
 * 为什么单独一个函数而不是让每个调用方自己拼：
 *   这三个字段是运维判断「这台实例现在到底在服务真数据还是在降级兜底」的唯一依据。
 *   之前 dbType 只在 app.ts 内联 handler 里出现（且用的是内部词表 'postgres'），
 *   导致「同一语义两种拼写」+「契约无处可测」。这里收口后：
 *     - app.ts 的 /health、api/health.ts 的 /health、services/healthCheck.ts 的
 *       database 检查项，三处共用同一份推导，物理上不可能漂移。
 *
 * 语义：
 *   - dbType: 'postgresql' 表示真 PG；'memory' 表示走了内存库降级。
 *   - degraded: 与 getDbStatus().degraded 同源（内存库即降级）。
 *   - dataSource: 降级态 → 'unavailable'（无真实行情/估值来源，前端据此拒绝把
 *     降级数据当真实数据消费）；非降级态 → 'real'。
 *     ⚠️ 注意：内存库本身**只**持有真实股票清单（R0'-9 起不再生成任何伪行情），
 *     故此处的 'unavailable' 指「行情/估值类数据不可得」，不是「所有数据都不可得」。
 *
 * @param status 可选：显式传入状态（便于测试与纯函数式断言）；缺省读当前进程状态。
 */
export function deriveHealthContract(
  status?: { type: DbType; degraded: boolean },
): HealthContract {
  const s = status ?? getDbStatus();
  const degraded = s.degraded;
  return {
    dbType: s.type === 'postgres' ? 'postgresql' : 'memory',
    degraded,
    dataSource: degraded ? 'unavailable' : 'real',
  };
}

/**
 * 获取当前数据库实例
 */
export function getDb(): Database | InMemoryDatabase {
  if (!dbInstance) {
    throw new Error('数据库未初始化，请先调用 initDatabase()');
  }
  return dbInstance;
}

/**
 * 获取当前数据库类型
 */
export function getDbType(): DbType {
  return currentType;
}

/**
 * 检查是否为内存模式
 */
export function isMemoryMode(): boolean {
  return currentType === 'memory';
}

/**
 * 懒加载代理类型 — 暴露 Database 和 InMemoryDatabase 的公共方法签名
 * 实际调用时会委托给 getDb()
 */
interface DatabaseProxy {
  connection: import('knex').Knex;
  testConnection(): Promise<boolean>;
  close(): Promise<void>;
  healthCheck(): Promise<{ healthy: boolean; latency: number; poolSize: number }>;
  getStockBySymbol(symbol: string): Promise<import('../models/Stock').Stock | null>;
  getDailyQuotes(stockId: number, startDate?: Date, endDate?: Date, limit?: number): Promise<import('../models/Stock').DailyQuote[]>;
  getLatestDailyQuote(stockId: number): Promise<import('../models/Stock').DailyQuote | null>;
  getStockWithLatestQuote(symbol: string): Promise<import('../models/Stock').StockWithQuotes | null>;
  getStocksWithLatestQuotes(symbols: string[]): Promise<import('../models/Stock').StockWithQuotes[]>;
  getStocks(params: import('../models/Stock').StockSearchParams): Promise<import('../models/Stock').Stock[]>;
  getStockCount(params: Omit<import('../models/Stock').StockSearchParams, 'page' | 'pageSize' | 'sortBy' | 'sortOrder'>): Promise<number>;
  getStockById(id: number): Promise<import('../models/Stock').Stock | null>;
  createStock(stock: Omit<import('../models/Stock').Stock, 'id' | 'createdAt' | 'updatedAt'>): Promise<import('../models/Stock').Stock>;
  updateStock(id: number, updates: Partial<Omit<import('../models/Stock').Stock, 'id' | 'createdAt' | 'updatedAt'>>): Promise<import('../models/Stock').Stock | null>;
  createDailyQuote(quote: import('../models/Stock').DailyQuoteInput): Promise<import('../models/Stock').DailyQuote>;
  getMarketSummary(date: Date): Promise<Record<string, unknown>>;
  getIndustryPerformance(date: Date): Promise<Record<string, unknown>[]>;
  getTopGainers(date: Date, limit?: number): Promise<Record<string, unknown>[]>;
  getTopLosers(date: Date, limit?: number): Promise<Record<string, unknown>[]>;
  getTopTurnover(date: Date, limit?: number): Promise<Record<string, unknown>[]>;
  getSectorStocks(industry: string): Promise<import('../models/Stock').StockWithQuotes[]>;
  getSectorPerformanceEnhanced(): Promise<Array<{
    industry: string; stock_count: number; avg_change_percent: number;
    total_turnover: number; total_market_cap: number; limit_up_count: number;
  }>>;
  reclassifyAll(): number | Promise<number>;
  getSectorMomentumScore(): Promise<Array<{
    industry: string; score: number; changeScore: number; volumeScore: number;
    breadthScore: number; stock_count: number; avg_change_percent: number;
    total_turnover: number; limit_up_count: number;
  }>>;
  getSubIndustryPerformance(): Promise<Array<{
    parent: string; name: string; stock_count: number;
    avg_change_percent: number; avg_turnover_percent: number; total_market_cap: number;
  }>>;
  getStocksBySubIndustry(subName: string): Promise<Array<{
    symbol: string; name: string; l1: string; l2: string;
    price: number; changePercent: number; peRatio: number | null; turnoverRate: number; marketCap: number;
  }>>;
  cleanupOldData(retentionDays: number): Promise<{ dailyQuotes: number; minuteQuotes: number }>;
  rebuildIndexes(): Promise<void>;
  getDatabaseStats(): Promise<Record<string, unknown>>;
  [key: string]: unknown;
}

/**
 * 懒加载代理 — API文件可以直接 import { db } 然后 db.getStockBySymbol(...)
 * 实际调用时会委托给 getDb()
 */
export const db = new Proxy<DatabaseProxy>({} as DatabaseProxy, {
  get(_target, prop: string) {
    const instance = getDb();
    const value = (instance as unknown as Record<string, unknown>)[prop];
    // connection 是 knex / MockKnexConnection 实例——它们本身是「可调用函数」，
    // 但 bind 会剥离其全部属性（.from/.raw/...），导致 db.connection.from 等用法在
    // PostgreSQL 模式下抛 "not a function"（曾使 /api/screener/filter 恒伪降级）。
    // 因此 connection 必须原样返回；类方法才需要 bind 到实例上。
    if (prop === 'connection') return value;
    if (typeof value === 'function') {
      return (value as CallableFunction).bind(instance);
    }
    return value;
  }
});
