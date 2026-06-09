/**
 * 查询优化工具
 * 提供高效的数据库查询方法，避免N+1查询
 */

import { db } from '../db/dbFactory';
import { createLogger } from './logger';

const log = createLogger('QueryOptimizer');

// ==================== 内存缓存 ====================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private maxSize = 1000;

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number = 60000): void {
    // 清理过期缓存
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

export const queryCache = new MemoryCache();

// ==================== 优化的查询函数 ====================

/**
 * 获取最新行情数据（带缓存）
 * 避免每次都执行子查询
 */
export async function getLatestQuotes(stockIds?: number[]) {
  const cacheKey = `latest_quotes_${stockIds?.join(',') || 'all'}`;
  const cached = queryCache.get<any[]>(cacheKey);
  if (cached) return cached;

  const query = db.connection
    .from('daily_quotes as dq')
    .join('stocks as s', 's.id', 'dq.stock_id')
    .where('s.is_active', true)
    .whereIn('dq.id', function(this: any) {
      this.select(db.connection.raw('MAX(id)'))
        .from('daily_quotes')
        .groupBy('stock_id');
    })
    .select(
      's.id as stock_id',
      's.symbol',
      's.name',
      's.market',
      's.industry',
      'dq.close_price as price',
      'dq.change_percent',
      'dq.volume',
      'dq.turnover',
      'dq.turnover_rate',
      'dq.amplitude',
      'dq.pe_ratio',
      'dq.pb_ratio',
      'dq.market_cap',
      'dq.circulating_market_cap'
    );

  const results = await query;
  queryCache.set(cacheKey, results, 30000); // 缓存30秒
  return results;
}

/**
 * 批量获取股票行情（避免N+1查询）
 */
export async function getBatchQuotes(symbols: string[]) {
  if (symbols.length === 0) return {};

  const cacheKey = `batch_quotes_${symbols.sort().join(',')}`;
  const cached = queryCache.get<Record<string, any>>(cacheKey);
  if (cached) return cached;

  const results = await db.connection
    .from('daily_quotes as dq')
    .join('stocks as s', 's.id', 'dq.stock_id')
    .whereIn('s.symbol', symbols)
    .whereIn('dq.id', function(this: any) {
      this.select(db.connection.raw('MAX(id)'))
        .from('daily_quotes')
        .groupBy('stock_id');
    })
    .select(
      's.symbol',
      'dq.close_price as price',
      'dq.change_percent',
      'dq.volume',
      'dq.turnover',
      'dq.turnover_rate',
      'dq.pe_ratio',
      'dq.pb_ratio',
      'dq.market_cap'
    );

  // 转换为symbol -> quote的映射
  const quoteMap: Record<string, any> = {};
  for (const row of results) {
    quoteMap[row.symbol] = row;
  }

  queryCache.set(cacheKey, quoteMap, 30000);
  return quoteMap;
}

/**
 * 获取市场统计（使用物化视图）
 */
export async function getMarketStats(date?: string) {
  const targetDate = date || await getLatestTradeDate();
  const cacheKey = `market_stats_${targetDate}`;
  const cached = queryCache.get<any>(cacheKey);
  if (cached) return cached;

  // 尝试从物化视图获取
  try {
    const [stats] = await db.connection('mv_market_stats')
      .where('trade_date', targetDate)
      .select('*');
    
    if (stats) {
      queryCache.set(cacheKey, stats, 300000); // 缓存5分钟
      return stats;
    }
  } catch (e) {
    // 物化视图不存在，回退到实时查询
    log.warn('物化视图不存在，使用实时查询');
  }

  // 回退到实时查询
  const [stats] = await db.connection('daily_quotes')
    .where('trade_date', targetDate)
    .select(
      db.connection.raw('COUNT(*) as total_stocks'),
      db.connection.raw('SUM(CASE WHEN change_percent > 0 THEN 1 ELSE 0 END) as up_count'),
      db.connection.raw('SUM(CASE WHEN change_percent < 0 THEN 1 ELSE 0 END) as down_count'),
      db.connection.raw('AVG(change_percent) as avg_change'),
      db.connection.raw('SUM(turnover) as total_turnover')
    );

  queryCache.set(cacheKey, stats, 60000);
  return stats;
}

/**
 * 获取行业统计
 */
export async function getIndustryStats(date?: string) {
  const targetDate = date || await getLatestTradeDate();
  const cacheKey = `industry_stats_${targetDate}`;
  const cached = queryCache.get<any[]>(cacheKey);
  if (cached) return cached;

  // 尝试从物化视图获取
  try {
    const stats = await db.connection('mv_industry_stats')
      .where('trade_date', targetDate)
      .orderBy('avg_change', 'desc')
      .select('*');
    
    if (stats.length > 0) {
      queryCache.set(cacheKey, stats, 300000);
      return stats;
    }
  } catch (e) {
    log.warn('行业统计物化视图不存在');
  }

  // 回退查询
  const stats = await db.connection('daily_quotes as dq')
    .join('stocks as s', 's.id', 'dq.stock_id')
    .where('dq.trade_date', targetDate)
    .whereNotNull('s.industry')
    .groupBy('s.industry')
    .select(
      's.industry',
      db.connection.raw('COUNT(*) as stock_count'),
      db.connection.raw('AVG(dq.change_percent) as avg_change'),
      db.connection.raw('SUM(dq.turnover) as total_turnover')
    )
    .orderBy('avg_change', 'desc');

  queryCache.set(cacheKey, stats, 60000);
  return stats;
}

/**
 * 获取最新交易日期
 */
export async function getLatestTradeDate(): Promise<string> {
  const cacheKey = 'latest_trade_date';
  const cached = queryCache.get<string>(cacheKey);
  if (cached) return cached;

  const [result] = await db.connection('daily_quotes')
    .max('trade_date as date')
    .select();

  const date = result?.date || new Date().toISOString().slice(0, 10);
  queryCache.set(cacheKey, date, 300000);
  return date;
}

/**
 * 高效分页查询
 */
export async function getPaginatedStocks(
  page: number = 1,
  pageSize: number = 20,
  sortBy: string = 'change_percent',
  sortOrder: 'asc' | 'desc' = 'desc',
  filters?: Record<string, any>
) {
  const offset = (page - 1) * pageSize;

  let query = db.connection
    .from('daily_quotes as dq')
    .join('stocks as s', 's.id', 'dq.stock_id')
    .where('s.is_active', true)
    .whereIn('dq.id', function(this: any) {
      this.select(db.connection.raw('MAX(id)'))
        .from('daily_quotes')
        .groupBy('stock_id');
    });

  // 应用过滤条件
  if (filters) {
    if (filters.industry) {
      query = query.where('s.industry', filters.industry);
    }
    if (filters.market) {
      query = query.where('s.market', filters.market);
    }
    if (filters.minPrice) {
      query = query.where('dq.close_price', '>=', filters.minPrice);
    }
    if (filters.maxPrice) {
      query = query.where('dq.close_price', '<=', filters.maxPrice);
    }
  }

  // 获取总数
  const countQuery = query.clone().count('* as total').first();
  
  // 获取数据
  const dataQuery = query
    .orderBy(`dq.${sortBy}`, sortOrder)
    .offset(offset)
    .limit(pageSize)
    .select(
      's.id',
      's.symbol',
      's.name',
      's.industry',
      'dq.close_price as price',
      'dq.change_percent',
      'dq.volume',
      'dq.turnover',
      'dq.turnover_rate',
      'dq.pe_ratio',
      'dq.pb_ratio',
      'dq.market_cap'
    );

  const [countResult, data] = await Promise.all([countQuery, dataQuery]);

  return {
    data,
    pagination: {
      page,
      pageSize,
      total: parseInt(countResult?.total as string) || 0,
      totalPages: Math.ceil((parseInt(countResult?.total as string) || 0) / pageSize)
    }
  };
}

// ==================== 缓存管理 ====================

/**
 * 清除所有缓存
 */
export function clearAllCache(): void {
  queryCache.clear();
  log.info('所有缓存已清除');
}

/**
 * 清除特定缓存
 */
export function clearCache(pattern: string): void {
  // 简单实现：清除所有匹配前缀的缓存
  const keysToDelete: string[] = [];
  for (const key of queryCache['cache'].keys()) {
    if (key.startsWith(pattern)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(key => queryCache.delete(key));
  log.info(`已清除 ${keysToDelete.length} 个缓存项`);
}
