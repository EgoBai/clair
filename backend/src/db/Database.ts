/**
 * 数据库访问层
 * 提供数据库连接和基础CRUD操作
 */

import knex, { Knex } from 'knex';
import { Stock, DailyQuote, StockSearchParams, StockWithQuotes } from '../models/Stock';

export class Database {
  private knexInstance: Knex;

  constructor(config: Knex.Config) {
    this.knexInstance = knex(config);
  }

  /**
   * 获取数据库连接实例
   */
  get connection(): Knex {
    return this.knexInstance;
  }

  /**
   * 测试数据库连接
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.knexInstance.raw('SELECT 1');
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    await this.knexInstance.destroy();
  }

  /**
   * 获取连接池状态
   */
  getPoolStats(): { used: number; free: number; pending: number; min: number; max: number } {
    const pool = (this.knexInstance as any).client?.pool;
    if (!pool) return { used: 0, free: 0, pending: 0, min: 0, max: 0 };
    return {
      used: pool.numUsed?.() ?? 0,
      free: pool.numFree?.() ?? 0,
      pending: pool.numPendingAcquires?.() ?? 0,
      min: pool.min ?? 0,
      max: pool.max ?? 0,
    };
  }

  /**
   * 连接池健康检查
   */
  async healthCheck(): Promise<{ healthy: boolean; latency: number; poolSize: number }> {
    const start = Date.now();
    try {
      await this.knexInstance.raw('SELECT 1');
      const latency = Date.now() - start;
      const poolStats = this.getPoolStats();
      return {
        healthy: true,
        latency,
        poolSize: poolStats.used + poolStats.free,
      };
    } catch (error) {
      return { healthy: false, latency: Date.now() - start, poolSize: 0 };
    }
  }

  // ==================== 股票相关操作 ====================

  /**
   * 获取股票列表
   */
  async getStocks(params: StockSearchParams): Promise<Stock[]> {
    const {
      symbol,
      name,
      market,
      industry,
      isActive = true,
      page = 1,
      pageSize = 20,
      sortBy = 'symbol',
      sortOrder = 'asc'
    } = params;

    const query = this.knexInstance<Stock>('stocks')
      .where('is_active', isActive);

    // 应用过滤条件
    if (symbol) {
      query.where('symbol', 'like', `%${symbol}%`);
    }
    if (name) {
      query.where('name', 'like', `%${name}%`);
    }
    if (market) {
      query.where('market', market);
    }
    if (industry) {
      query.where('industry', industry);
    }

    // 应用排序
    query.orderBy(sortBy, sortOrder);

    // 应用分页
    const offset = (page - 1) * pageSize;
    query.offset(offset).limit(pageSize);

    return query;
  }

  /**
   * 获取股票总数
   */
  async getStockCount(params: Omit<StockSearchParams, 'page' | 'pageSize' | 'sortBy' | 'sortOrder'>): Promise<number> {
    const { symbol, name, market, industry, isActive = true } = params;

    const query = this.knexInstance<Stock>('stocks')
      .where('is_active', isActive);

    if (symbol) {
      query.where('symbol', 'like', `%${symbol}%`);
    }
    if (name) {
      query.where('name', 'like', `%${name}%`);
    }
    if (market) {
      query.where('market', market);
    }
    if (industry) {
      query.where('industry', industry);
    }

    const result = await query.count('id as count').first();
    return result ? Number(result.count) : 0;
  }

  /**
   * 根据ID获取股票
   */
  async getStockById(id: number): Promise<Stock | null> {
    return this.knexInstance<Stock>('stocks')
      .where('id', id)
      .first();
  }

  /**
   * 根据代码获取股票
   */
  async getStockBySymbol(symbol: string): Promise<Stock | null> {
    return this.knexInstance<Stock>('stocks')
      .where('symbol', symbol)
      .first();
  }

  /**
   * 创建股票
   */
  async createStock(stock: Omit<Stock, 'id' | 'createdAt' | 'updatedAt'>): Promise<Stock> {
    const [created] = await this.knexInstance<Stock>('stocks')
      .insert({
        ...stock,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('*');

    return created;
  }

  /**
   * 更新股票
   */
  async updateStock(id: number, updates: Partial<Omit<Stock, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Stock | null> {
    const [updated] = await this.knexInstance<Stock>('stocks')
      .where('id', id)
      .update({
        ...updates,
        updated_at: new Date()
      })
      .returning('*');

    return updated || null;
  }

  /**
   * 删除股票
   */
  async deleteStock(id: number): Promise<boolean> {
    const deleted = await this.knexInstance<Stock>('stocks')
      .where('id', id)
      .delete();

    return deleted > 0;
  }

  /**
   * 批量创建股票
   */
  async batchCreateStocks(stocks: Array<Omit<Stock, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Stock[]> {
    const now = new Date();
    const stocksWithTimestamps = stocks.map(stock => ({
      ...stock,
      created_at: now,
      updated_at: now
    }));

    return this.knexInstance<Stock>('stocks')
      .insert(stocksWithTimestamps)
      .returning('*');
  }

  // ==================== 日行情相关操作 ====================

  /**
   * 获取股票日行情
   */
  async getDailyQuotes(stockId: number, startDate?: Date, endDate?: Date, limit?: number): Promise<DailyQuote[]> {
    const query = this.knexInstance<DailyQuote>('daily_quotes')
      .where('stock_id', stockId);

    if (startDate) {
      query.where('trade_date', '>=', startDate);
    }
    if (endDate) {
      query.where('trade_date', '<=', endDate);
    }

    query.orderBy('trade_date', 'desc');

    if (limit) {
      query.limit(limit);
    }

    return query;
  }

  /**
   * 获取最新日行情
   */
  async getLatestDailyQuote(stockId: number): Promise<DailyQuote | null> {
    return this.knexInstance<DailyQuote>('daily_quotes')
      .where('stock_id', stockId)
      .orderBy('trade_date', 'desc')
      .first();
  }

  /**
   * 创建日行情
   */
  async createDailyQuote(quote: Omit<DailyQuote, 'id' | 'createdAt' | 'updatedAt'>): Promise<DailyQuote> {
    const [created] = await this.knexInstance<DailyQuote>('daily_quotes')
      .insert({
        ...quote,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('*');

    return created;
  }

  /**
   * 批量创建日行情
   */
  async batchCreateDailyQuotes(quotes: Array<Omit<DailyQuote, 'id' | 'createdAt' | 'updatedAt'>>): Promise<DailyQuote[]> {
    const now = new Date();
    const quotesWithTimestamps = quotes.map(quote => ({
      ...quote,
      created_at: now,
      updated_at: now
    }));

    return this.knexInstance<DailyQuote>('daily_quotes')
      .insert(quotesWithTimestamps)
      .returning('*');
  }

  /**
   * 更新日行情
   */
  async updateDailyQuote(id: number, updates: Partial<Omit<DailyQuote, 'id' | 'createdAt' | 'updatedAt'>>): Promise<DailyQuote | null> {
    const [updated] = await this.knexInstance<DailyQuote>('daily_quotes')
      .where('id', id)
      .update({
        ...updates,
        updated_at: new Date()
      })
      .returning('*');

    return updated || null;
  }

  /**
   * 删除日行情
   */
  async deleteDailyQuote(id: number): Promise<boolean> {
    const deleted = await this.knexInstance<DailyQuote>('daily_quotes')
      .where('id', id)
      .delete();

    return deleted > 0;
  }

  // ==================== 复合查询操作 ====================

  /**
   * 获取股票及其最新行情
   */
  async getStockWithLatestQuote(symbol: string): Promise<StockWithQuotes | null> {
    const stock = await this.getStockBySymbol(symbol);
    if (!stock) {
      return null;
    }

    const latestQuote = await this.getLatestDailyQuote(stock.id);

    return {
      ...stock,
      latestQuote: latestQuote || undefined
    };
  }

  /**
   * 获取多个股票的最新行情
   */
  async getStocksWithLatestQuotes(symbols: string[]): Promise<StockWithQuotes[]> {
    const stocks = await this.knexInstance<Stock>('stocks')
      .whereIn('symbol', symbols)
      .where('is_active', true);

    if (stocks.length === 0) {
      return [];
    }

    const stockIds = stocks.map(stock => stock.id);
    
    // 获取每个股票的最新行情
    const latestQuotes = await this.knexInstance.raw(`
      SELECT DISTINCT ON (stock_id) *
      FROM daily_quotes
      WHERE stock_id IN (${stockIds.join(',')})
      ORDER BY stock_id, trade_date DESC
    `);

    const quoteMap = new Map<number, DailyQuote>();
    latestQuotes.rows.forEach((quote: DailyQuote) => {
      quoteMap.set(quote.stockId, quote);
    });

    return stocks.map(stock => ({
      ...stock,
      latestQuote: quoteMap.get(stock.id)
    }));
  }

  /**
   * 获取市场概况
   */
  async getMarketSummary(date: Date): Promise<any> {
    // 获取当日所有股票的行情
    const dailyQuotes = await this.knexInstance<DailyQuote>('daily_quotes')
      .where('trade_date', date)
      .join('stocks', 'daily_quotes.stock_id', 'stocks.id')
      .select(
        'stocks.symbol',
        'stocks.name',
        'daily_quotes.close_price',
        'daily_quotes.change_percent',
        'daily_quotes.volume',
        'daily_quotes.turnover',
        'daily_quotes.market_cap'
      );

    if (dailyQuotes.length === 0) {
      return null;
    }

    // 计算市场概况
    const totalStocks = dailyQuotes.length;
    const totalMarketCap = dailyQuotes.reduce((sum, quote) => sum + (quote.market_cap || 0), 0);
    const totalVolume = dailyQuotes.reduce((sum, quote) => sum + (quote.volume || 0), 0);
    const totalTurnover = dailyQuotes.reduce((sum, quote) => sum + (quote.turnover || 0), 0);
    
    const risingStocks = dailyQuotes.filter(quote => quote.change_percent > 0).length;
    const fallingStocks = dailyQuotes.filter(quote => quote.change_percent < 0).length;
    const unchangedStocks = dailyQuotes.filter(quote => quote.change_percent === 0).length;

    // 按行业分组
    const industryStats = await this.knexInstance.raw(`
      SELECT 
        stocks.industry,
        COUNT(*) as stock_count,
        AVG(daily_quotes.change_percent) as avg_change_percent,
        SUM(daily_quotes.market_cap) as total_market_cap
      FROM daily_quotes
      JOIN stocks ON daily_quotes.stock_id = stocks.id
      WHERE daily_quotes.trade_date = ?
        AND stocks.industry IS NOT NULL
      GROUP BY stocks.industry
      ORDER BY avg_change_percent DESC
    `, [date]);

    return {
      date,
      totalStocks,
      totalMarketCap,
      totalVolume,
      totalTurnover,
      risingStocks,
      fallingStocks,
      unchangedStocks,
      industryPerformance: industryStats.rows
    };
  }

  /**
   * 获取行业表现
   */
  async getIndustryPerformance(date: Date): Promise<any[]> {
    const result = await this.knexInstance.raw(`
      SELECT 
        stocks.industry,
        COUNT(*) as stock_count,
        AVG(daily_quotes.change_percent) as avg_change_percent,
        SUM(daily_quotes.market_cap) as total_market_cap,
        SUM(daily_quotes.volume) as total_volume,
        SUM(daily_quotes.turnover) as total_turnover
      FROM daily_quotes
      JOIN stocks ON daily_quotes.stock_id = stocks.id
      WHERE daily_quotes.trade_date = ?
        AND stocks.industry IS NOT NULL
      GROUP BY stocks.industry
      ORDER BY avg_change_percent DESC
    `, [date]);

    return result.rows;
  }

  /**
   * 获取涨幅榜
   */
  async getTopGainers(date: Date, limit: number = 10): Promise<any[]> {
    return this.knexInstance<DailyQuote>('daily_quotes')
      .where('trade_date', date)
      .join('stocks', 'daily_quotes.stock_id', 'stocks.id')
      .select(
        'stocks.symbol',
        'stocks.name',
        'daily_quotes.close_price',
        'daily_quotes.change_percent',
        'daily_quotes.volume',
        'daily_quotes.turnover'
      )
      .orderBy('daily_quotes.change_percent', 'desc')
      .limit(limit);
  }

  /**
   * 获取跌幅榜
   */
  async getTopLosers(date: Date, limit: number = 10): Promise<any[]> {
    return this.knexInstance<DailyQuote>('daily_quotes')
      .where('trade_date', date)
      .join('stocks', 'daily_quotes.stock_id', 'stocks.id')
      .select(
        'stocks.symbol',
        'stocks.name',
        'daily_quotes.close_price',
        'daily_quotes.change_percent',
        'daily_quotes.volume',
        'daily_quotes.turnover'
      )
      .orderBy('daily_quotes.change_percent', 'asc')
      .limit(limit);
  }

  /**
   * 获取成交额榜
   */
  async getTopTurnover(date: Date, limit: number = 10): Promise<any[]> {
    return this.knexInstance<DailyQuote>('daily_quotes')
      .where('trade_date', date)
      .join('stocks', 'daily_quotes.stock_id', 'stocks.id')
      .select(
        'stocks.symbol',
        'stocks.name',
        'daily_quotes.close_price',
        'daily_quotes.change_percent',
        'daily_quotes.volume',
        'daily_quotes.turnover'
      )
      .orderBy('daily_quotes.turnover', 'desc')
      .limit(limit);
  }

  // ==================== 数据维护操作 ====================

  /**
   * 清理旧数据
   */
  async cleanupOldData(retentionDays: number): Promise<{ dailyQuotes: number; minuteQuotes: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // 删除旧的日行情数据
    const dailyQuotesDeleted = await this.knexInstance<DailyQuote>('daily_quotes')
      .where('trade_date', '<', cutoffDate)
      .delete();

    // 删除旧的分钟行情数据（保留30天）
    const minuteCutoffDate = new Date();
    minuteCutoffDate.setDate(minuteCutoffDate.getDate() - 30);
    
    const minuteQuotesDeleted = await this.knexInstance('minute_quotes')
      .where('quote_time', '<', minuteCutoffDate)
      .delete();

    return {
      dailyQuotes: dailyQuotesDeleted,
      minuteQuotes: minuteQuotesDeleted
    };
  }

  /**
   * 重建索引
   */
  async rebuildIndexes(): Promise<void> {
    // 重建股票表索引
    await this.knexInstance.raw('REINDEX TABLE stocks');
    await this.knexInstance.raw('REINDEX TABLE daily_quotes');
    await this.knexInstance.raw('REINDEX TABLE minute_quotes');
  }

  /**
   * 获取数据库统计信息
   */
  async getDatabaseStats(): Promise<any> {
    const stats = await this.knexInstance.raw(`
      SELECT 
        (SELECT COUNT(*) FROM stocks) as total_stocks,
        (SELECT COUNT(*) FROM daily_quotes) as total_daily_quotes,
        (SELECT COUNT(*) FROM minute_quotes) as total_minute_quotes,
        (SELECT MAX(trade_date) FROM daily_quotes) as latest_trade_date,
        (SELECT MIN(trade_date) FROM daily_quotes) as earliest_trade_date,
        pg_database_size(current_database()) as database_size_bytes
    `);

    return stats.rows[0];
  }
}

// 默认数据库配置
export const defaultConfig: Knex.Config = {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'a_stock'
  },
  pool: {
    min: parseInt(process.env.DB_POOL_MIN || '2'),
    max: parseInt(process.env.DB_POOL_MAX || '20'),
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createTimeoutMillis: 30000,
    createRetryIntervalMillis: 200,
    propagateCreateError: false,
  },
  acquireConnectionTimeout: 30000,
  migrations: {
    tableName: 'knex_migrations',
    directory: './migrations'
  },
  seeds: {
    directory: './seeds'
  },
  // 慢查询日志 (开发环境)
  ...(process.env.NODE_ENV !== 'production' ? {
    log: {
      warn(msg: string) { console.warn('[Knex]', msg); },
      error(msg: string) { console.error('[Knex]', msg); },
      debug(msg: string) { console.debug('[Knex]', msg); },
    }
  } : {}),
};

// 创建默认数据库实例
export const db = new Database(defaultConfig);