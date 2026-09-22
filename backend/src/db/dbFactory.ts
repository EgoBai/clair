/**
 * 数据库工厂 — 自动选择PostgreSQL或内存数据库
 * PostgreSQL可用时使用真实数据库，否则降级到内存Mock
 */

import { Database } from './Database';
import { InMemoryDatabase, getInMemoryDb } from './InMemoryDatabase';

export type DbType = 'postgres' | 'memory';

let currentType: DbType = 'memory';
let dbInstance: Database | InMemoryDatabase | null = null;

/**
 * 初始化数据库连接
 * 优先使用PostgreSQL，失败则降级到内存数据库
 *
 * ⚠️ 内存库中的行情/估值为 Math.random 伪造数据，降级态的暴露见 getDbStatus()。
 */
export async function initDatabase(): Promise<{ db: Database | InMemoryDatabase; type: DbType }> {
  const pgUrl = process.env.DATABASE_URL;
  // 记录 PG 不可用的原因，用于在降级后输出可观测的告警
  let pgUnavailableReason: string | null = null;

  if (pgUrl) {
    try {
      const config = {
        client: 'pg',
        connection: pgUrl,
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
      `🚨 生产环境已降级至伪造行情：PostgreSQL 不可用（${pgUnavailableReason}），` +
      '当前 API 返回的行情/估值全部由 Math.random 伪造，禁止作为真实数据对外使用',
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
 * - degraded: 仅当 type === 'memory' 时为 true —— 内存模式即降级态（行情为伪造数据）
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
  createDailyQuote(quote: Omit<import('../models/Stock').DailyQuote, 'id' | 'createdAt' | 'updatedAt'>): Promise<import('../models/Stock').DailyQuote>;
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
    if (typeof value === 'function') {
      return (value as CallableFunction).bind(instance);
    }
    return value;
  }
});
