/**
 * 数据库访问层
 * 提供数据库连接和基础CRUD操作
 */

import knex, { Knex } from 'knex';
import { Stock, DailyQuote, DailyQuoteInput, StockSearchParams, StockWithQuotes } from '../models/Stock';
import { classifyStock } from '@shared/industryClassification';
import { symbolCandidates } from '../utils/symbolUtils';

// ==================== 行映射（snake_case → camelCase） ====================
// ⚠️ P0-SYMBOL：映射必须**只有这一处**。历史上 getStocksWithLatestQuotes 读
// camelCase 的 `quote.stockId`、而 knex `.raw()` 返回的是 snake_case 的
// `stock_id`，两处各写各的字段名 ⟹ latestQuote 恒为 null。故集中到模块级函数，
// 任何读 PG 原始行的路径都必须走它。

/**
 * PostgreSQL DECIMAL/BIGINT 经 knex 返回的是**字符串**（如 "1262.95"），
 * 数值列需显式转 number；而**可空列的 null 必须原样保留为 null**，
 * 绝不能 `|| 0` 或 `?? 0`——那会把「口径不可算」谎报成「数值恰为 0」。
 */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** snake_case 行 → models/DailyQuote（camelCase），null 原样保留 */
function mapDailyQuoteRow(row: Record<string, unknown>): DailyQuote {
  return {
    id: Number(row.id),
    stockId: Number(row.stock_id ?? row.stockId),
    tradeDate: (row.trade_date ?? row.tradeDate) as unknown as Date,
    openPrice: num(row.open_price ?? row.openPrice) as number,
    closePrice: num(row.close_price ?? row.closePrice) as number,
    highPrice: num(row.high_price ?? row.highPrice) as number,
    lowPrice: num(row.low_price ?? row.lowPrice) as number,
    volume: num(row.volume) as number,
    turnover: num(row.turnover) as number,
    // 库列名为 change_amount，DailyQuote 字段名为 change
    change: num(row.change_amount ?? row.change) as number,
    changePercent: num(row.change_percent ?? row.changePercent) as number,
    amplitude: num(row.amplitude) as number,
    turnoverRate: num(row.turnover_rate ?? row.turnoverRate) as number,
    peRatio: num(row.pe_ratio ?? row.peRatio) as number | undefined,
    pbRatio: num(row.pb_ratio ?? row.pbRatio) as number | undefined,
    marketCap: num(row.market_cap ?? row.marketCap) as number | undefined,
    circulatingMarketCap: num(
      row.circulating_market_cap ?? row.circulatingMarketCap
    ) as number | undefined,
    createdAt: (row.created_at ?? row.createdAt) as unknown as Date,
    updatedAt: (row.updated_at ?? row.updatedAt) as unknown as Date,
  };
}

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
   *
   * P0-SYMBOL：规范化收口在**数据层**（而非各路由）。
   * 库里 symbol 写法不唯一（PG 全带后缀 / 内存库全裸码），而调用方
   * （前端既有契约、AI 选股、外部脚本）传什么格式都有。逐个路由补
   * normalizeSymbol 只能救「已知的 N 处」，新增路由必然重踩；
   * 收口到这里则一处生效、全路由受益。
   *
   * 复用 utils/symbolUtils 的 symbolCandidates（由既有 normalizeSymbol /
   * toBareCode 派生），不新建第三套规范化规则。
   */
  async getStockBySymbol(symbol: string): Promise<Stock | null> {
    const candidates = symbolCandidates(symbol);
    if (candidates.length === 0) return null;

    const stock = await this.knexInstance<Stock>('stocks')
      .whereIn('symbol', candidates)
      // 多个候选同时命中时（如库里同时存在 600519 与 600519.SH）取规范化形式优先，
      // 保证同一输入恒定解析到同一只股票，不随数据顺序抖动。
      .orderByRaw('CASE WHEN symbol = ? THEN 0 ELSE 1 END', [candidates[0]])
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
   *
   * P0-SYMBOL：此前直接返回 knex 原始行（snake_case），与本方法**声明的返回类型**
   * `DailyQuote[]`（camelCase）不符。所有调用方都按 camelCase 读字段，于是：
   *   - /api/indicators/* 里 `new Date(q.tradeDate).toISOString()` → Invalid time value → 500
   *   - /api/tech/batch 里 `quotes.map(q => Number(q.closePrice))` → 全 NaN 被 filter 掉
   *     → closes.length < 5 → 静默 unavailable
   * 映射在数据层做一处，所有行情类调用方同时恢复。
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

    const rows = await query;
    return rows.map(row => mapDailyQuoteRow(row as unknown as Record<string, unknown>));
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

    return mapDailyQuoteRow(quote as unknown as Record<string, unknown>);
  }

  /**
   * 创建日行情
   */
  async createDailyQuote(quote: DailyQuoteInput): Promise<DailyQuote> {
    const insertData: Record<string, unknown> = {
      stock_id: quote.stockId,
      trade_date: quote.tradeDate,
      open_price: quote.openPrice,
      close_price: quote.closePrice,
      high_price: quote.highPrice,
      low_price: quote.lowPrice,
      volume: quote.volume,
      turnover: quote.turnover,
      // 诚实红线：change/changePercent/amplitude 的 null 表示「首行无前收盘、口径不可算」，
      // 必须原样落 NULL。此前 `quote.change || 0` 会把 null 静默变成 0，
      // 使「不可算」被读成「涨跌恰为 0」——零值顶替空态，属比空数组更隐蔽的谎报。
      // schema 中三列均可空，故此处 ?? null：null 保持 null，仅 undefined 归一为 null。
      change_amount: quote.change ?? null,
      change_percent: quote.changePercent ?? null,
      amplitude: quote.amplitude ?? null,
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
   *
   * P0-SYMBOL：symbol 在数据层统一规范化（裸码/带后缀/`sh.600519` 都能命中），
   * 调用方无需各自处理后缀。
   */
  async getStocksWithLatestQuotes(symbols: string[]): Promise<StockWithQuotes[]> {
    // 逐个展开候选写法后去重：裸码 600519 → ['600519.SH','600519']，
    // 与带后缀输入 600519.SH 展开出同一组候选，故不会重复命中同一只股票。
    const candidates = Array.from(new Set((symbols ?? []).flatMap(symbolCandidates)));
    if (candidates.length === 0) return [];

    const stocks = await this.knexInstance<Stock>('stocks')
      .whereIn('symbol', candidates)
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
    latestQuotes.rows.forEach((row: Record<string, unknown>) => {
      // P0-SYMBOL：knex .raw() 返回的是**数据库原样**的 snake_case 行，
      // 此处曾读 camelCase 的 `quote.stockId`，恒为 undefined ⟹ quoteMap 键全为
      // undefined ⟹ latestQuote 永远取不到（页面靠 `s.latestQuote || s` 兜底没崩，
      // 但 K 线当日 OHLC 实际从未被用上）。必须复用同一套行映射，不可另写字段名。
      quoteMap.set(Number(row.stock_id), mapDailyQuoteRow(row));
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

    // 带符号涨跌评分：与 conceptBoardService.computeChangeScore 对齐口径
    // change 从 [-maxChange, +maxChange] 线性映射到 [0, 50]
    // （涨满→50，0→25，跌满→0），避免大跌行业被 abs() 误标为高景气
    const toChangeScore = (change: number): number => {
      const span = maxChange > 0 ? maxChange : 1;
      const ratio = Math.max(-1, Math.min(1, Number(change) / span));
      return ((ratio + 1) / 2) * 50;
    };

    return enhanced.map(s => {
      const changeScore = Math.min(100, toChangeScore(Number(s.avg_change_percent)));
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
   * 申万二级行业表现（模式无关，实时分类）
   * 取全部活跃股票 + 各股最新行情，用 classifyStock(行业, 名称) 反推二级行业：
   * - 行业为 '综合'/'未分类'/NULL 时强制按名称反推（补齐未分类股）
   * - daily_quotes.market_cap 以万元存储，归一到元供前端统一格式化
   */
  async getSubIndustryPerformance(): Promise<Array<{
    parent: string; name: string; stock_count: number;
    avg_change_percent: number; avg_turnover_percent: number; total_market_cap: number;
  }>> {
    const rows = await this.knexInstance.raw(`
      SELECT s.industry AS industry, s.name AS name,
             dq.change_percent AS change_percent,
             dq.turnover_rate AS turnover_rate,
             dq.market_cap AS market_cap_wan
      FROM stocks s
      LEFT JOIN (
        SELECT DISTINCT ON (stock_id) stock_id, change_percent, turnover_rate, market_cap
        FROM daily_quotes
        ORDER BY stock_id, trade_date DESC
      ) dq ON dq.stock_id = s.id
      WHERE s.is_active = true
    `);
    const toNum = (v: unknown): number => (v === null || v === undefined ? 0 : parseFloat(String(v)));
    const map = new Map<string, {
      parent: string; count: number; totalChange: number; totalTurnover: number; totalCap: number;
    }>();
    for (const r of rows.rows as Array<Record<string, unknown>>) {
      const rawL1 = (r.industry && r.industry !== '综合' && r.industry !== '未分类') ? String(r.industry) : undefined;
      const { industry, subIndustry } = classifyStock(rawL1, String(r.name));
      const key = subIndustry || '未分类';
      const parent = (subIndustry && subIndustry !== '未分类') ? (industry || '未分类') : '未分类';
      if (!map.has(key)) map.set(key, { parent, count: 0, totalChange: 0, totalTurnover: 0, totalCap: 0 });
      const e = map.get(key)!;
      e.count++;
      e.totalChange += toNum(r.change_percent);
      e.totalTurnover += toNum(r.turnover_rate);
      e.totalCap += toNum(r.market_cap_wan) * 10000; // 万元 → 元
    }
    return Array.from(map.entries()).map(([name, d]) => ({
      parent: d.parent,
      name,
      stock_count: d.count,
      avg_change_percent: Math.round((d.totalChange / d.count) * 100) / 100,
      avg_turnover_percent: Math.round((d.totalTurnover / d.count) * 100) / 100,
      total_market_cap: d.totalCap,
    })).sort((a, b) => b.avg_change_percent - a.avg_change_percent);
  }

  /** 按二级行业查股票（实时分类，返回带最新行情的列表） */
  async getStocksBySubIndustry(subName: string): Promise<Array<{
    symbol: string; name: string; l1: string; l2: string;
    price: number | null; changePercent: number | null; peRatio: number | null; turnoverRate: number | null; marketCap: number | null;
  }>> {
    const rows = await this.knexInstance.raw(`
      SELECT s.industry AS industry, s.symbol AS symbol, s.name AS name,
             dq.close_price AS close_price, dq.change_percent AS change_percent,
             dq.pe_ratio AS pe_ratio, dq.turnover_rate AS turnover_rate,
             dq.market_cap AS market_cap_wan
      FROM stocks s
      LEFT JOIN (
        SELECT DISTINCT ON (stock_id) stock_id, close_price, change_percent, pe_ratio, turnover_rate, market_cap
        FROM daily_quotes
        ORDER BY stock_id, trade_date DESC
      ) dq ON dq.stock_id = s.id
      WHERE s.is_active = true
    `);
    const toNum = (v: unknown): number => (v === null || v === undefined ? 0 : parseFloat(String(v)));
    const result: Array<{
      symbol: string; name: string; l1: string; l2: string;
      price: number | null; changePercent: number | null; peRatio: number | null; turnoverRate: number | null; marketCap: number | null;
    }> = [];
    for (const r of rows.rows as Array<Record<string, unknown>>) {
      const rawL1 = (r.industry && r.industry !== '综合' && r.industry !== '未分类') ? String(r.industry) : undefined;
      const { industry, subIndustry } = classifyStock(rawL1, String(r.name));
      if (subIndustry !== subName) continue;
      result.push({
        symbol: String(r.symbol),
        name: String(r.name),
        l1: industry,
        l2: subIndustry,
        price: toNum(r.close_price),
        changePercent: toNum(r.change_percent),
        peRatio: r.pe_ratio != null ? toNum(r.pe_ratio) : null,
        turnoverRate: toNum(r.turnover_rate),
        marketCap: toNum(r.market_cap_wan) * 10000, // 万元 → 元
      });
    }
    return result.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
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