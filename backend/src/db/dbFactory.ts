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
 */
export async function initDatabase(): Promise<{ db: Database | InMemoryDatabase; type: DbType }> {
  const pgUrl = process.env.DATABASE_URL;

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
    } catch (error) {
      console.warn('⚠️ PostgreSQL 连接失败，降级到内存数据库:', (error as Error).message);
    }
  } else {
    console.log('ℹ️ 未配置 DATABASE_URL，使用内存数据库');
  }

  // 降级到内存数据库
  currentType = 'memory';
  dbInstance = getInMemoryDb();
  console.log('✅ 使用内存数据库 (Mock数据, 20只股票)');
  return { db: dbInstance, type: 'memory' };
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
