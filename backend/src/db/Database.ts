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
    const pool = this.knexInstance.client?.pool;
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
  async getStocks(params: StockSearchParams): Promise<any[]> {
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

    // 使用子查询获取每只股票的最新行情日期
    const latestQuoteSubquery = this.knexInstance('daily_quotes')
      .select('stock_id')
      .max('trade_date as latest_date')
      .groupBy('stock_id');

    const query = this.knexInstance('stocks as s')
      .leftJoin(latestQuoteSubquery.as('lq'), 's.id', 'lq.stock_id')
      .leftJoin('daily_quotes as dq', function(this: any) {
        this.on('s.id', '=', 'dq.stock_id')
          .andOn('dq.trade_date', '=', 'lq.latest_date');
      })
      .where('s.is_active', isActive)
      .select(
        's.id', 's.symbol', 's.code', 's.name', 's.market', 's.industry',
        's.is_active', 's.created_at', 's.updated_at',
        // 优先用 daily_quotes 的最新数据，回退到 stocks 表的冗余列
        this.knexInstance.raw('COALESCE(dq.close_price, s.current_price) as current_price'),
        this.knexInstance.raw('COALESCE(dq.open_price, s.open_price) as open_price'),
        this.knexInstance.raw('COALESCE(dq.high_price, s.high_price) as high_price'),
        this.knexInstance.raw('COALESCE(dq.low_price, s.low_price) as low_price'),
        this.knexInstance.raw('COALESCE(dq.change_amount, s.change_amount) as change_amount'),
        this.knexInstance.raw('COALESCE(dq.change_percent, s.change_percent) as change_percent'),
        this.knexInstance.raw('COALESCE(dq.volume, s.volume) as volume'),
        this.knexInstance.raw('COALESCE(dq.turnover, s.turnover) as turnover'),
        this.knexInstance.raw('COALESCE(dq.amplitude, s.amplitude) as amplitude'),
        this.knexInstance.raw('COALESCE(dq.turnover_rate, s.turnover_rate) as turnover_rate'),
        this.knexInstance.raw('COALESCE(dq.market_cap, s.market_cap) as market_cap'),
        this.knexInstance.raw('s.circulating_market_cap'),
        // PE/PB 优先用 daily_quotes 实时数据，回退到 stocks 表
        this.knexInstance.raw('COALESCE(dq.pe_ratio, s.pe_ratio) as pe_ratio'),
        this.knexInstance.raw('COALESCE(dq.pb_ratio, s.pb_ratio) as pb_ratio'),
      );

    // 应用过滤条件
    if (symbol) {
      query.where('s.symbol', 'like', `%${symbol}%`);
    }
    if (name) {
      query.where('s.name', 'like', `%${name}%`);
    }
    if (market) {
      query.where('s.market', market);
    }
    if (industry) {
      query.where('s.industry', industry);
    }

    // 排序映射（前端字段名 → 数据库列名）
    const sortColumnMap: Record<string, string> = {
      symbol: 's.symbol',
      name: 's.name',
      market: 's.market',
      industry: 's.industry',
      current_price: 'dq.close_price',
      change_percent: 'dq.change_percent',
      turnover_rate: 'dq.turnover_rate',
      market_cap: 'dq.market_cap',
      pe_ratio: 'dq.pe_ratio',
      volume: 'dq.volume',
    };
    const sortCol = sortColumnMap[sortBy] || 's.symbol';

    // 应用排序
    query.orderByRaw(`${sortCol} ${sortOrder === 'asc' ? 'ASC NULLS LAST' : 'DESC NULLS LAST'}`);

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

    const knexInstance = this.knexInstance;
    let query = knexInstance<Stock>('stocks')
      .where('is_active', isActive);

    if (symbol) {
      query = query.where('symbol', 'like', `%${symbol}%`);
    }
    if (name) {
      query = query.where('name', 'like', `%${name}%`);
    }
    if (market) {
      query = query.where('market', market);
    }
    if (industry) {
      query = query.where('industry', industry);
    }

    const result = await query.count({ count: 'id' }).first();
    return result ? Number(result.count) : 0;
  }

  /**
   * 根据ID获取股票
   */
  async getStockById(id: number): Promise<Stock | null> {
    const stock = await this.knexInstance<Stock>('stocks')
      .where('id', id)
      .first();
    return stock ?? null;
  }

  /**
   * 根据代码获取股票
   */
  async getStockBySymbol(symbol: string): Promise<Stock | null> {
    const stock = await this.knexInstance<Stock>('stocks')
      .where('symbol', symbol)
      .first();
    return stock ?? null;
  }

  /**
   * 创建股票
   */
  async createStock(stock: Omit<Stock, 'id' | 'createdAt' | 'updatedAt'>): Promise<Stock> {
    const insertData: Record<string, unknown> = {
      symbol: stock.symbol,
      code: stock.symbol.split('.')[0], // 提取纯代码部分
      name: stock.name,
      market: stock.market,
      industry: stock.industry,
      is_active: stock.isActive !== undefined ? stock.isActive : true,
      created_at: new Date(),
      updated_at: new Date()
    };
    const [created] = await this.knexInstance<Stock>('stocks')
      .insert(insertData)
      .returning('*');

    return created;
  }

  /**
   * 更新股票
   */
  async updateStock(id: number, updates: Partial<Omit<Stock, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Stock | null> {
    const updateData: Record<string, unknown> = {
      ...updates,
      updated_at: new Date()
    };
    const [updated] = await this.knexInstance<Stock>('stocks')
      .where('id', id)
      .update(updateData)
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
    const stocksWithTimestamps: Record<string, unknown>[] = stocks.map(stock => ({
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
    const quote = await this.knexInstance<DailyQuote>('daily_quotes')
      .where('stock_id', stockId)
      .orderBy('trade_date', 'desc')
      .first();
    
    if (!quote) return null;
    
    // PostgreSQL 返回 snake_case，DailyQuote 类型为 camelCase，需安全转换
     
    const q = quote as any;
    return {
      id: q.id,
      stockId: q.stock_id || q.stockId,
      tradeDate: q.trade_date || q.tradeDate,
      openPrice: q.open_price || q.openPrice,
      closePrice: q.close_price || q.closePrice,
      highPrice: q.high_price || q.highPrice,
      lowPrice: q.low_price || q.lowPrice,
      volume: q.volume,
      turnover: q.turnover,
      change: q.change_amount || q.change,
      changePercent: q.change_percent || q.changePercent,
      amplitude: q.amplitude,
      turnoverRate: q.turnover_rate || q.turnoverRate,
      marketCap: q.market_cap || q.marketCap,
      createdAt: q.created_at || q.createdAt,
      updatedAt: q.updated_at || q.updatedAt,
    };
  }

  /**
   * 创建日行情
   */
  async createDailyQuote(quote: Omit<DailyQuote, 'id' | 'createdAt' | 'updatedAt'>): Promise<DailyQuote> {
    const insertData: Record<string, unknown> = {
      stock_id: quote.stockId,
      trade_date: quote.tradeDate,
      open_price: quote.openPrice,
      close_price: quote.closePrice,
      high_price: quote.highPrice,
      low_price: quote.lowPrice,
      volume: quote.volume,
      turnover: quote.turnover,
      change_amount: quote.change || 0,
      change_percent: quote.changePercent || 0,
      amplitude: quote.amplitude || 0,
      turnover_rate: quote.turnoverRate || 0,
      market_cap: quote.marketCap,
      pe_ratio: quote.peRatio ?? null,
      pb_ratio: quote.pbRatio ?? null,
      created_at: new Date(),
    };
    const [created] = await this.knexInstance<DailyQuote>('daily_quotes')
      .insert(insertData)
      .onConflict(['stock_id', 'trade_date'])
      .merge()
      .returning('*');

    return created;
  }

  /**
   * 批量创建日行情
   */
  async batchCreateDailyQuotes(quotes: Array<Omit<DailyQuote, 'id' | 'createdAt' | 'updatedAt'>>): Promise<DailyQuote[]> {
    const now = new Date();
    const quotesWithTimestamps: Record<string, unknown>[] = quotes.map(quote => ({
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
    const updateData: Record<string, unknown> = {
      ...updates,
      updated_at: new Date()
    };
    const [updated] = await this.knexInstance<DailyQuote>('daily_quotes')
      .where('id', id)
      .update(updateData)
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
      quoteMap.set(quote.stockId as unknown as number, quote);
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

    // 计算市场概况 (PostgreSQL numeric 列返回 string，必须用 Number() 转换)
    const totalStocks = dailyQuotes.length;
    const totalMarketCap = dailyQuotes.reduce((sum, quote) => sum + (Number(quote.market_cap) || 0), 0);
    const totalVolume = dailyQuotes.reduce((sum, quote) => sum + (Number(quote.volume) || 0), 0);
    // turnover 已由DataSyncService转为元存储，无需再乘10000
    const totalTurnover = dailyQuotes.reduce((sum, quote) => sum + (Number(quote.turnover) || 0), 0);
    
    const risingStocks = dailyQuotes.filter(quote => Number(quote.change_percent) > 0).length;
    const fallingStocks = dailyQuotes.filter(quote => Number(quote.change_percent) < 0).length;
    const unchangedStocks = dailyQuotes.filter(quote => Number(quote.change_percent) === 0).length;

    // 涨跌停统计 (A股 ±10% 为基准, 科创板/创业板 ±20%, ST ±5%)
    // 简化: change_percent >= 9.5% 算涨停, <= -9.5% 算跌停
    const limitUpCount = dailyQuotes.filter(quote => Number(quote.change_percent) >= 9.5).length;
    const limitDownCount = dailyQuotes.filter(quote => Number(quote.change_percent) <= -9.5).length;

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
      limitUpCount,
      limitDownCount,
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

  /** 板块增强数据：含涨停家数、总成交额 */
  async getSectorPerformanceEnhanced(): Promise<Array<{
    industry: string;
    stock_count: number;
    avg_change_percent: number;
    total_turnover: number;
    total_market_cap: number;
    limit_up_count: number;
  }>> {
    const result = await this.knexInstance.raw(`
      SELECT 
        s.industry,
        COUNT(*) as stock_count,
        ROUND(AVG(dq.change_percent)::numeric, 2) as avg_change_percent,
        SUM(dq.turnover) as total_turnover,
        SUM(dq.market_cap) as total_market_cap,
        SUM(CASE WHEN dq.change_percent >= 9.9 THEN 1 ELSE 0 END) as limit_up_count
      FROM daily_quotes dq
      JOIN stocks s ON dq.stock_id = s.id
      WHERE dq.trade_date = (SELECT MAX(trade_date) FROM daily_quotes)
        AND s.industry IS NOT NULL
        AND s.is_active = true
      GROUP BY s.industry
      ORDER BY avg_change_percent DESC
    `);
    return result.rows;
  }

  /** 板块景气度综合评分 (0-100) */
  async getSectorMomentumScore(): Promise<Array<{
    industry: string;
    score: number;
    changeScore: number;
    volumeScore: number;
    breadthScore: number;
    stock_count: number;
    avg_change_percent: number;
    total_turnover: number;
    limit_up_count: number;
  }>> {
    const enhanced = await this.getSectorPerformanceEnhanced();
    if (enhanced.length === 0) return [];

    const maxChange = Math.max(...enhanced.map(s => Math.abs(Number(s.avg_change_percent))), 1);
    const maxTurnover = Math.max(...enhanced.map(s => Number(s.total_turnover)), 1);
    const maxLimitUp = Math.max(...enhanced.map(s => Number(s.limit_up_count)), 1);

    return enhanced.map(s => {
      const changeScore = Math.min(100, (Math.abs(Number(s.avg_change_percent)) / maxChange) * 50);
      const volumeScore = Math.min(100, (Number(s.total_turnover) / maxTurnover) * 30);
      const breadthScore = Math.min(100, (Number(s.limit_up_count) / maxLimitUp) * 20);
      return {
        industry: s.industry,
        score: Math.round(changeScore + volumeScore + breadthScore),
        changeScore: Math.round(changeScore),
        volumeScore: Math.round(volumeScore),
        breadthScore: Math.round(breadthScore),
        stock_count: Number(s.stock_count),
        avg_change_percent: Number(s.avg_change_percent),
        total_turnover: Number(s.total_turnover),
        limit_up_count: Number(s.limit_up_count),
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * 板块内个股列表（含最新行情，按涨跌幅降序）
   * 语义与 InMemoryDatabase.getSectorStocks 对齐：
   *   - 按 industry 筛选活跃股票；industry==='其他' 时归集无行业归类的股票
   *   - 仅保留有最新行情的个股
   *   - 按 changePercent 降序排序
   * 陷阱(MULTI-AGENT.md): PostgreSQL numeric 列返回字符串，算术/排序前需 parseFloat。
   */
  async getSectorStocks(industry: string): Promise<StockWithQuotes[]> {
    // 1. 按行业筛选活跃股票
    const stockQuery = this.knexInstance<Stock>('stocks')
      .where('is_active', true);
    if (industry === '其他') {
      // '其他' 归集 industry 为空/NULL 的股票
      stockQuery.where((qb) => {
        qb.whereNull('industry').orWhere('industry', '');
      });
    } else {
      stockQuery.where('industry', industry);
    }
    const stocks = await stockQuery;
    if (stocks.length === 0) {
      return [];
    }

    // 2. 批量取每只股票的最新行情（单次查询，避免 N+1）
    const stockIds = stocks.map((s) => s.id);
    const latestQuotes = await this.knexInstance.raw(`
      SELECT DISTINCT ON (stock_id) *
      FROM daily_quotes
      WHERE stock_id IN (${stockIds.join(',')})
      ORDER BY stock_id, trade_date DESC
    `);

    // PostgreSQL numeric → 字符串，安全转数字
    const toNum = (v: unknown): number => (v === null || v === undefined ? 0 : parseFloat(String(v)));

    // 3. snake_case → camelCase 映射（与 getLatestDailyQuote 字段集一致）
    const quoteMap = new Map<number, DailyQuote>();
     
    latestQuotes.rows.forEach((q: any) => {
      const stockId: number = q.stock_id ?? q.stockId;
      quoteMap.set(stockId, {
        id: q.id,
        stockId,
        tradeDate: q.trade_date ?? q.tradeDate,
        openPrice: toNum(q.open_price ?? q.openPrice),
        closePrice: toNum(q.close_price ?? q.closePrice),
        highPrice: toNum(q.high_price ?? q.highPrice),
        lowPrice: toNum(q.low_price ?? q.lowPrice),
        volume: toNum(q.volume),
        turnover: toNum(q.turnover),
        change: toNum(q.change_amount ?? q.change),
        changePercent: toNum(q.change_percent ?? q.changePercent),
        amplitude: toNum(q.amplitude),
        turnoverRate: toNum(q.turnover_rate ?? q.turnoverRate),
        marketCap: q.market_cap !== null && q.market_cap !== undefined ? toNum(q.market_cap) : undefined,
        createdAt: q.created_at ?? q.createdAt,
        updatedAt: q.updated_at ?? q.updatedAt,
      });
    });

    // 4. 组装 → 仅保留有行情者 → 按涨跌幅降序
    return stocks
      .map((s): StockWithQuotes => ({ ...s, latestQuote: quoteMap.get(s.id) }))
      .filter((s) => s.latestQuote !== undefined)
      .sort((a, b) => (b.latestQuote?.changePercent || 0) - (a.latestQuote?.changePercent || 0));
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