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
        pool: { min: 2, max: 10 },
        acquireConnectionTimeout: 5000,
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
