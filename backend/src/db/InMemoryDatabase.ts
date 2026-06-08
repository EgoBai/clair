/**
 * 内存数据库 — 无需PostgreSQL即可运行后端
 * 提供与Database.ts相同的接口，使用内存数据
 *
 * @note 类型安全版本: 所有 `: any` 已替换为具体类型
 * @see Stock, DailyQuote, MarketSummary 来自 ../models/Stock
 */

import {
  Stock,
  DailyQuote,
  StockWithQuotes,
  MarketSummary,
  IndustryPerformance,
  StockSearchParams,
} from '../models/Stock';

import * as fs from 'fs';
import * as path from 'path';

// ==================== 内部类型定义 ====================

/** Where 子句过滤谓词 */
type RowPredicate = (row: Record<string, unknown>) => boolean;

/** 行业汇总统计 */
interface IndustryStats {
  count: number;
  totalChange: number;
  totalCap: number;
}

/** 行业性能行（返回格式） */
interface IndustryPerformanceRow {
  industry: string;
  stock_count: number;
  avg_change_percent: number;
  total_market_cap: number;
}

/** 股票 + 最新报价（内部排序用） */
interface StockWithLatestQuote extends Stock {
  latestQuote?: DailyQuote;
}

/** MockQueryBuilder 可接受的数据行类型 */
type QueryRow = Record<string, unknown>;

// ==================== Mock数据生成 ====================

/** 轻量MockQueryBuilder，模拟Knex查询链 */
class MockQueryBuilder {
  private _data: QueryRow[];
  private _filters: RowPredicate[] = [];
  private _sortField?: string;
  private _sortDir: 'asc' | 'desc' = 'asc';
  private _limitN?: number;
  private _offsetN?: number;
  private _selectFields?: string[];
  private _joins: string[] = [];
  private _groupBy?: string;
  private _countMode = false;

  /** 蛇形 → 驼峰映射 (InMemoryDatabase 用驼峰属性) */
  private static SNAKE_TO_CAMEL: Record<string, string> = {
    is_active: 'isActive', close_price: 'closePrice', change_percent: 'changePercent',
    open_price: 'openPrice', high_price: 'highPrice', low_price: 'lowPrice',
    turnover_rate: 'turnoverRate', pe_ratio: 'peRatio', pb_ratio: 'pbRatio',
    market_cap: 'marketCap', circulating_market_cap: 'circulatingMarketCap',
    trade_date: 'tradeDate', sort_index: 'sortIndex', stock_id: 'stockId',
  };
  private static resolveField(name: string): string {
    return MockQueryBuilder.SNAKE_TO_CAMEL[name] || name;
  }

  constructor(data: QueryRow[], private _tableName: string) {
    this._data = data;
  }

  where(fieldOrObj: string | Record<string, unknown>, opOrVal?: unknown, val?: unknown): this {
    const resolve = MockQueryBuilder.resolveField;
    if (typeof fieldOrObj === 'object' && fieldOrObj !== null) {
      Object.entries(fieldOrObj).forEach(([k, v]) => {
        this._filters.push((row) => row[resolve(k)] === v);
      });
    } else if (opOrVal === 'like') {
      const pattern = String(val || '').replace(/%/g, '');
      this._filters.push((row) => String(row[resolve(fieldOrObj)] || '').includes(pattern));
    } else if (typeof opOrVal === 'string' && ['>=', '<=', '<', '>'].includes(opOrVal)) {
      const f = resolve(fieldOrObj);
      if (opOrVal === '>=') this._filters.push(r => (r[f] as number) >= (val as number));
      else if (opOrVal === '<=') this._filters.push(r => (r[f] as number) <= (val as number));
      else if (opOrVal === '<') this._filters.push(r => (r[f] as number) < (val as number));
      else this._filters.push(r => (r[f] as number) > (val as number));
    } else {
      this._filters.push((row) => row[resolve(fieldOrObj)] === opOrVal);
    }
    return this;
  }

  whereIn(field: string, values: unknown[]): this {
    const f = MockQueryBuilder.resolveField(field);
    this._filters.push((row) => values.includes(row[f]));
    return this;
  }

  whereNot(field: string, value: unknown): this {
    const f = MockQueryBuilder.resolveField(field);
    this._filters.push((row) => row[f] !== value);
    return this;
  }

  orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): this {
    this._sortField = MockQueryBuilder.resolveField(field);
    this._sortDir = dir;
    return this;
  }

  select(...fields: string[]): this {
    this._selectFields = fields.map(f => MockQueryBuilder.resolveField(f));
    return this;
  }

  limit(n: number): this { this._limitN = n; return this; }
  offset(n: number): this { this._offsetN = n; return this; }

  join(_table: string, _on1: string, _on2: string): this { this._joins.push(_table); return this; }
  groupBy(field: string): this { this._groupBy = field; return this; }

  count(field?: string): this {
    this._countMode = true;
    if (field) this._selectFields = [field];
    return this;
  }

  insert(_data: unknown): this { return this; }
  update(_data: unknown): this { return this; }
  delete(): this { return this; }
  returning(..._fields: string[]): this { return this; }

  /** Execute and return results (async thenable) */
  private _exec(): QueryRow[] {
    let result = this._data.filter((row) => this._filters.every((f) => f(row)));
    if (this._sortField) {
      const sf = this._sortField;
      const sd = this._sortDir;
      result = [...result].sort((a, b) => {
        const av = a[sf], bv = b[sf];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return sd === 'asc' ? ((av as number) > (bv as number) ? 1 : (av as number) < (bv as number) ? -1 : 0) : ((av as number) < (bv as number) ? 1 : (av as number) > (bv as number) ? -1 : 0);
      });
    }
    if (this._offsetN) result = result.slice(this._offsetN);
    if (this._limitN) result = result.slice(0, this._limitN);
    if (this._selectFields && this._selectFields.length > 0 && !this._countMode) {
      result = result.map((r) => {
        const obj: Record<string, unknown> = {};
        this._selectFields!.forEach((f) => { obj[f] = r[f]; });
        return obj;
      });
    }
    if (this._countMode) {
      return [{ count: result.length }];
    }
    return result;
  }

  // Make it thenable so `await db.connection('stocks').where(...)` works
  then<TResult1 = QueryRow[], TResult2 = never>(
    onfulfilled?: ((value: QueryRow[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this._exec()).then(onfulfilled, onrejected);
  }

  first(): QueryRow | null {
    const results = this._exec();
    return results[0] || null;
  }
}

/** MockKnex 连接函数类型 */
interface MockKnexConnection {
  (tableName: string): MockQueryBuilder;
  _table: (tableName: string) => MockQueryBuilder;
  raw: (sql: string) => Promise<{ rows: unknown[] }>;
  destroy: () => Promise<void>;
}

const STOCK_SYMBOLS = [
  { symbol: '000001', name: '平安银行', market: 'SZ', industry: '银行' },
  { symbol: '000002', name: '万科A', market: 'SZ', industry: '房地产' },
  { symbol: '000858', name: '五粮液', market: 'SZ', industry: '白酒' },
  { symbol: '002594', name: '比亚迪', market: 'SZ', industry: '新能源汽车' },
  { symbol: '600036', name: '招商银行', market: 'SH', industry: '银行' },
  { symbol: '600519', name: '贵州茅台', market: 'SH', industry: '白酒' },
  { symbol: '601318', name: '中国平安', market: 'SH', industry: '保险' },
  { symbol: '601012', name: '隆基绿能', market: 'SH', industry: '光伏' },
  { symbol: '300750', name: '宁德时代', market: 'SZ', industry: '新能源电池' },
  { symbol: '300059', name: '东方财富', market: 'SZ', industry: '证券' },
  { symbol: '002475', name: '立讯精密', market: 'SZ', industry: '消费电子' },
  { symbol: '600900', name: '长江电力', market: 'SH', industry: '电力' },
  { symbol: '601888', name: '中国中免', market: 'SH', industry: '零售' },
  { symbol: '000333', name: '美的集团', market: 'SZ', industry: '家电' },
  { symbol: '600276', name: '恒瑞医药', market: 'SH', industry: '医药' },
  { symbol: '002415', name: '海康威视', market: 'SZ', industry: '安防' },
  { symbol: '601166', name: '兴业银行', market: 'SH', industry: '银行' },
  { symbol: '002714', name: '牧原股份', market: 'SZ', industry: '养殖' },
  { symbol: '600309', name: '万华化学', market: 'SH', industry: '化工' },
  { symbol: '002352', name: '顺丰控股', market: 'SZ', industry: '物流' },
];

function generatePrice(basePrice: number, volatility: number = 0.03): number {
  const change = (Math.random() - 0.5) * 2 * volatility;
  return Math.round(basePrice * (1 + change) * 100) / 100;
}

function generateQuotes(symbol: string, days: number = 120): DailyQuote[] {
  const quotes: DailyQuote[] = [];
  const basePrice = 10 + Math.random() * 200;
  let currentPrice = basePrice;
  const now = new Date();

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    // 跳过周末
    const day = date.getDay();
    if (day === 0 || day === 6) continue;

    const open = generatePrice(currentPrice, 0.02);
    const close = generatePrice(open, 0.03);
    const high = Math.max(open, close) * (1 + Math.random() * 0.02);
    const low = Math.min(open, close) * (1 - Math.random() * 0.02);
    const prevClose = currentPrice;
    const change = close - prevClose;
    const changePercent = (change / prevClose) * 100;
    const volume = Math.floor(5000000 + Math.random() * 50000000);
    const turnover = volume * close;

    quotes.push({
      id: quotes.length + 1,
      stockId: 0,
      tradeDate: new Date(date.toISOString().split('T')[0]),
      openPrice: Math.round(open * 100) / 100,
      closePrice: Math.round(close * 100) / 100,
      highPrice: Math.round(high * 100) / 100,
      lowPrice: Math.round(low * 100) / 100,
      volume,
      turnover: Math.round(turnover),
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      amplitude: Math.round(((high - low) / prevClose) * 10000) / 100,
      turnoverRate: Math.round(Math.random() * 10 * 100) / 100,
      peRatio: Math.round((10 + Math.random() * 50) * 100) / 100,
      pbRatio: Math.round((1 + Math.random() * 10) * 100) / 100,
      marketCap: Math.floor(close * (1e8 + Math.random() * 1e10)),
      circulatingMarketCap: Math.floor(close * (5e7 + Math.random() * 5e9)),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    currentPrice = close;
  }

  return quotes;
}

// ==================== 内存数据库 ====================

class InMemoryDatabase {
  private stocks: Stock[] = [];
  private quotes: Map<string, DailyQuote[]> = new Map();

  constructor() {
    this.initializeData();
  }

  /** 重新分类所有股票行业 */
  reclassifyAll(): number {
    let changed = 0;
    for (const stock of this.stocks) {
      const newIndustry = this.guessIndustry(stock.symbol, stock.name);
      if (stock.industry !== newIndustry) { stock.industry = newIndustry; changed++; }
    }
    if (changed > 0) console.log(`📊 行业重分类: ${changed} 只`);
    return changed;
  }

  private initializeData(): void {
    // 尝试从JSON文件加载完整股票列表
    let stockList = STOCK_SYMBOLS;
    try {
      const jsonPath = path.resolve(__dirname, '../../../clair-worker/all_stocks_compact.json');
      if (fs.existsSync(jsonPath)) {
        const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        stockList = rawData.map((item: [string, string, string, string]) => ({
          symbol: item[0],
          name: item[1],
          market: item[2],
          industry: item[3] || '未分类',
        }));
        console.log(`📂 从JSON文件加载股票列表: ${stockList.length} 只`);
      }
    } catch (error) {
      console.warn('⚠️ 无法加载JSON文件，使用默认股票列表:', (error as Error).message);
    }

    stockList.forEach((s, idx) => {
      const stock: Stock = {
        id: idx + 1,
        symbol: s.symbol,
        name: s.name,
        market: s.market,
        industry: s.industry,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.stocks.push(stock);
      this.quotes.set(s.symbol, generateQuotes(s.symbol));
    });

    // 给每个quote设置stockId
    this.stocks.forEach(stock => {
      const stockQuotes = this.quotes.get(stock.symbol);
      if (stockQuotes) {
        stockQuotes.forEach(q => { q.stockId = stock.id; });
      }
    });

    console.log(`📊 内存数据库初始化完成: ${this.stocks.length} 只股票`);
  }

  // 模拟Knex接口 — connection is a callable function like Knex
  get connection(): MockKnexConnection {
    const self = this;
    const conn: MockKnexConnection = function(tableName: string) {
      return conn._table(tableName);
    } as MockKnexConnection;
    conn._table = function(tableName: string) {
      // Return data based on table name
      let data: QueryRow[];
      if (tableName === 'stocks') {
        data = self.stocks as unknown as QueryRow[];
      } else if (tableName.startsWith('daily_quotes')) {
        // Flatten all quotes
        data = [];
        self.quotes.forEach((quotes) => { data.push(...(quotes as unknown as QueryRow[])); });
      } else if (tableName === 'user_watchlist' || tableName === 'watchlist_groups') {
        data = [];
      } else {
        data = [];
      }
      return new MockQueryBuilder(data, tableName);
    };
    conn.raw = function(_sql: string) { return Promise.resolve({ rows: [] }); };
    conn.destroy = function() { return Promise.resolve(); };
    return conn;
  }

  async testConnection(): Promise<boolean> { return true; }
  async close(): Promise<void> { }
  getPoolStats() { return { used: 0, free: 0, pending: 0, min: 0, max: 0 }; }
  async healthCheck() { return { healthy: true, latency: 0 }; }

  getQuotes(symbol: string): DailyQuote[] { return this.quotes.get(symbol) || []; }
  
  async getMarketSummary(_date?: unknown): Promise<MarketSummary> {
    return this.getMarketSummaryInternal();
  }

  getTopGainers(limit: number = 10) {
    return this.stocks.map((s): StockWithLatestQuote => {
      const quotes = this.quotes.get(s.symbol);
      const latest = quotes ? quotes[quotes.length - 1] : undefined;
      return { ...s, latestQuote: latest };
    })
    .filter((s): s is StockWithLatestQuote => s.latestQuote !== undefined)
    .sort((a, b) => (b.latestQuote?.changePercent || 0) - (a.latestQuote?.changePercent || 0))
    .slice(0, limit);
  }

  getTopLosers(limit: number = 10) {
    return this.stocks.map((s): StockWithLatestQuote => {
      const quotes = this.quotes.get(s.symbol);
      const latest = quotes ? quotes[quotes.length - 1] : undefined;
      return { ...s, latestQuote: latest };
    })
    .filter((s): s is StockWithLatestQuote => s.latestQuote !== undefined)
    .sort((a, b) => (a.latestQuote?.changePercent || 0) - (b.latestQuote?.changePercent || 0))
    .slice(0, limit);
  }

  // ==================== Database兼容方法 ====================

  async getStockBySymbol(symbol: string): Promise<Stock | null> {
    return this.stocks.find(s => s.symbol === symbol) || null;
  }

  async getStockById(id: number): Promise<Stock | null> {
    return this.stocks.find(s => s.id === id) || null;
  }

  async getStocks(params: Partial<StockSearchParams> = {}): Promise<Stock[]> {
    const { symbol, name, market, industry, page = 1, pageSize = 20, sortBy = 'symbol', sortOrder = 'asc' } = params;
    let result = this.stocks.filter(s => s.isActive !== false);
    if (symbol) result = result.filter(s => s.symbol.includes(symbol));
    if (name) result = result.filter(s => s.name.includes(name));
    if (market) result = result.filter(s => s.market === market);
    if (industry) result = result.filter(s => s.industry === industry);
    result.sort((a, b) => {
      const aVal = a[sortBy as keyof Stock];
      const bVal = b[sortBy as keyof Stock];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const cmp = aVal.localeCompare(bVal, 'zh-CN');
        return sortOrder === 'asc' ? cmp : -cmp;
      }
      const aStr = String(aVal), bStr = String(bVal);
      return sortOrder === 'asc' ? (aStr > bStr ? 1 : aStr < bStr ? -1 : 0) : (aStr < bStr ? 1 : aStr > bStr ? -1 : 0);
    });
    const offset = (page - 1) * pageSize;
    return result.slice(offset, offset + pageSize);
  }

  async getStockCount(params: Partial<StockSearchParams> = {}): Promise<number> {
    const { symbol, name, market, industry } = params;
    let result = this.stocks.filter(s => s.isActive !== false);
    if (symbol) result = result.filter(s => s.symbol.includes(symbol));
    if (name) result = result.filter(s => s.name.includes(name));
    if (market) result = result.filter(s => s.market === market);
    if (industry) result = result.filter(s => s.industry === industry);
    return result.length;
  }

  async getDailyQuotes(stockId: number, startDate?: Date | string, endDate?: Date | string, limit?: number): Promise<DailyQuote[]> {
    const stock = this.stocks.find(s => s.id === stockId);
    if (!stock) return [];
    let quotes = this.quotes.get(stock.symbol) || [];
    if (startDate) {
      const startStr = typeof startDate === 'string' ? startDate : startDate.toISOString().split('T')[0];
      quotes = quotes.filter(q => q.tradeDate >= new Date(startStr));
    }
    if (endDate) {
      const endStr = typeof endDate === 'string' ? endDate : endDate.toISOString().split('T')[0];
      quotes = quotes.filter(q => q.tradeDate <= new Date(endStr));
    }
    quotes.sort((a, b) => b.tradeDate.getTime() - a.tradeDate.getTime());
    if (limit) quotes = quotes.slice(0, limit);
    return quotes;
  }

  async getLatestDailyQuote(stockId: number): Promise<DailyQuote | null> {
    const stock = this.stocks.find(s => s.id === stockId);
    if (!stock) return null;
    const quotes = this.quotes.get(stock.symbol) || [];
    return quotes.length > 0 ? quotes[quotes.length - 1] : null;
  }

  async getStockWithLatestQuote(symbol: string): Promise<StockWithQuotes | null> {
    const stock = this.stocks.find(s => s.symbol === symbol);
    if (!stock) return null;
    const quotes = this.quotes.get(symbol) || [];
    const latestQuote = quotes.length > 0 ? quotes[quotes.length - 1] : undefined;
    return { ...stock, latestQuote };
  }

  async getStocksWithLatestQuotes(symbols: string[]): Promise<StockWithQuotes[]> {
    return symbols
      .map(symbol => {
        const stock = this.stocks.find(s => s.symbol === symbol);
        if (!stock) return null;
        const quotes = this.quotes.get(symbol) || [];
        return { ...stock, latestQuote: quotes.length > 0 ? quotes[quotes.length - 1] : undefined } as StockWithQuotes;
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
  }

  /** 智能搜索 —— 代码/名称模糊匹配，按相关性排序 */
  searchStocks(query: string, limit: number = 20): Array<{ id: number; symbol: string; name: string; market: string; industry: string }> {
    if (!query?.trim()) return [];
    const q = query.trim().toLowerCase();
    const results: Array<{ item: Stock; score: number }> = [];
    for (const s of this.stocks) {
      if (!s.isActive) continue;
      let score = 0;
      const symLower = s.symbol.toLowerCase();
      const nameLower = s.name.toLowerCase();
      // 精确匹配符号
      if (symLower === q) score = 100;
      else if (symLower.includes(q)) score = 80 + (symLower.indexOf(q) === 0 ? 10 : 0);
      // 名称匹配
      else if (nameLower === q) score = 70;
      else if (nameLower.includes(q)) score = 60 + (nameLower.indexOf(q) === 0 ? 10 : 0);
      else continue;
      // 去后缀匹配加权 (如搜 '600519' 优先匹配 600519.SH 而非 1600519)
      if (q.match(/^\d{6}$/) && symLower.startsWith(q)) score += 15;
      results.push({ item: s, score });
    }
    results.sort((a, b) => b.score - a.score);
    // 去重：同名股票优先保留带后缀(.SH/.SZ)的
    const seen = new Map<string, typeof results[0]>();
    for (const r of results) {
      const existing = seen.get(r.item.name);
      if (!existing || r.item.symbol.length > existing.item.symbol.length) {
        seen.set(r.item.name, r);
      }
    }
    const deduped = Array.from(seen.values());
    deduped.sort((a, b) => b.score - a.score);
    return deduped.slice(0, limit).map(r => ({
      id: r.item.id,
      symbol: r.item.symbol,
      name: r.item.name,
      market: r.item.market,
      industry: r.item.industry || '',
    }));
  }

  async getIndustryPerformance(_date?: unknown): Promise<IndustryPerformanceRow[]> {
    const industryMap = new Map<string, IndustryStats>();
    this.stocks.forEach(s => {
      const quotes = this.quotes.get(s.symbol);
      const latest = quotes ? quotes[quotes.length - 1] : null;
      if (!latest || !s.industry) return;
      const existing = industryMap.get(s.industry) || { count: 0, totalChange: 0, totalCap: 0 };
      existing.count++;
      existing.totalChange += latest.changePercent;
      existing.totalCap += latest.marketCap || 0;
      industryMap.set(s.industry, existing);
    });
    return Array.from(industryMap.entries())
      .map(([industry, stats]) => ({
        industry,
        stock_count: stats.count,
        avg_change_percent: Math.round((stats.totalChange / stats.count) * 100) / 100,
        total_market_cap: stats.totalCap,
      }))
      .sort((a, b) => b.avg_change_percent - a.avg_change_percent);
  }

  async getTopTurnover(_date?: unknown, limit: number = 10): Promise<StockWithLatestQuote[]> {
    return this.stocks
      .map((s): StockWithLatestQuote => {
        const quotes = this.quotes.get(s.symbol);
        const latest = quotes ? quotes[quotes.length - 1] : undefined;
        return { ...s, latestQuote: latest };
      })
      .filter((s): s is StockWithLatestQuote => s.latestQuote !== undefined)
      .sort((a, b) => (b.latestQuote?.turnover || 0) - (a.latestQuote?.turnover || 0))
      .slice(0, limit);
  }

  // ==================== 写入方法（供 DataSyncService 使用） ====================

  async createStock(stock: Omit<Stock, 'id' | 'createdAt' | 'updatedAt'>): Promise<Stock> {
    // 自动分配行业（如果未提供）
    if (!stock.industry) {
      const ind = this.guessIndustry(stock.symbol, stock.name);
      stock = { ...stock, industry: ind };
    }
    const newId = Math.max(0, ...this.stocks.map(s => s.id)) + 1;
    const newStock: Stock = {
      ...stock,
      id: newId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.stocks.push(newStock);
    return newStock;
  }

  private guessIndustry(symbol: string, name: string): string {
    // 先精确匹配关键行业词（同花顺/富途标准分类）
    const rules: [string[], string][] = [
      [['银行', '招商银行', '浦发银行', '兴业银行', '民生银行', '中信银行', '光大银行', '华夏银行', '北京银行', '南京银行', '宁波银行'], '银行'],
      [['保险', '中国平安', '中国人寿', '新华保险', '中国太保'], '保险'],
      [['证券', '券商', '中信证券', '华泰证券', '国泰君安', '海通证券', '广发证券', '招商证券', '申万宏源', '东方财富'], '证券'],
      [['白酒', '茅台', '五粮液', '泸州老窖', '洋河', '汾酒', '古井贡', '酒鬼', '水井坊'], '白酒'],
      [['医药', '药', '医', '恒瑞', '迈瑞', '片仔癀', '云南白药', '同仁堂', '长春高新', '智飞生物', '华兰', '沃森'], '医药'],
      [['新能源', '电池', '宁德', '比亚迪', '隆基', '通威', '阳光电源', '天齐', '赣锋', '华友', '亿纬'], '新能源'],
      [['半导体', '芯片', '集成电路', '中芯', '韦尔', '兆易', '卓胜微', '北方华创'], '半导体'],
      [['电子', '立讯', '歌尔', '蓝思', '京东方', 'TCL', '海康', '大华'], '电子'],
      [['家电', '美的', '格力', '海尔', '三花', '老板'], '家电'],
      [['房地产', '地产', '万科', '保利', '招商蛇口', '新城', '绿地', '华夏幸福'], '房地产'],
      [['汽车', '长城', '上汽', '广汽', '长安', '吉利', '小康'], '汽车'],
      [['食品饮料', '食品', '饮料', '乳', '伊利', '海天', '双汇', '牧原', '温氏', '新希望'], '食品饮料'],
      [['电力', '长江电力', '华能', '国电', '三峡', '华电'], '电力'],
      [['煤炭', '煤', '神华', '兖矿', '中煤', '陕西煤业'], '煤炭'],
      [['钢铁', '钢铁', '宝钢', '鞍钢', '河钢', '华菱'], '钢铁'],
      [['有色金属', '有色', '黄金', '紫金', '洛阳钼业', '山东黄金', '中金黄金', '铜陵', '云铝'], '有色金属'],
      [['化工', '化工', '化学', '万华', '恒力', '荣盛', '鲁西'], '化工'],
      [['建筑', '建筑', '中国建筑', '中铁', '铁建', '交建', '电建', '中冶'], '建筑'],
      [['交通运输', '航空', '机场', '港口', '铁路', '高速', '物流', '顺丰', '圆通', '韵达', '中通'], '交通运输'],
      [['信息技术', '软件', '网络', '信息', '计算机', '科大讯飞', '恒生电子', '用友', '广联达', '金山'], '信息技术'],
      [['传媒', '传媒', '广告', '游戏', '影视', '分众', '三七', '完美'], '传媒'],
      [['农林牧渔', '农业', '养殖', '种业', '饲料', '北大荒'], '农林牧渔'],
    ];
    for (const [keywords, industry] of rules) {
      if (keywords.some(kw => name.includes(kw))) return industry;
    }
    // 按板块前缀兜底
    const prefix = symbol.replace(/\.(SH|SZ)$/, '');
    if (prefix.startsWith('688')) return '科创板';
    if (prefix.startsWith('300') || prefix.startsWith('301')) return '创业板';
    if (prefix.startsWith('600') || prefix.startsWith('601') || prefix.startsWith('603') || prefix.startsWith('605')) return '沪市主板';
    return '深市主板';
  }

  async createDailyQuote(quote: Omit<DailyQuote, 'id' | 'createdAt' | 'updatedAt'>): Promise<DailyQuote> {
    // 通过 stockId 找到对应的 symbol
    const stock = this.stocks.find(s => s.id === quote.stockId);
    const symbol = stock?.symbol || `unknown_${quote.stockId}`;
    const existing = this.quotes.get(symbol) || [];
    const newId = existing.length + 1;
    const newQuote: DailyQuote = {
      ...quote,
      id: newId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    existing.push(newQuote);
    this.quotes.set(symbol, existing);
    return newQuote;
  }

  async updateStock(id: number, updates: Partial<Omit<Stock, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Stock | null> {
    const idx = this.stocks.findIndex(s => s.id === id);
    if (idx === -1) return null;
    this.stocks[idx] = { ...this.stocks[idx], ...updates, updatedAt: new Date() };
    return this.stocks[idx];
  }

  async cleanupOldData(_retentionDays: number): Promise<{ dailyQuotes: number; minuteQuotes: number }> {
    return { dailyQuotes: 0, minuteQuotes: 0 };
  }

  async rebuildIndexes(): Promise<void> {}

  async getDatabaseStats(): Promise<Record<string, unknown>> {
    return {
      stockCount: this.stocks.length,
      quoteCount: Array.from(this.quotes.values()).reduce((sum, q) => sum + q.length, 0),
    };
  }

  getMarketSummaryInternal(): MarketSummary {
    const latest = this.stocks
      .map(s => {
        const quotes = this.quotes.get(s.symbol);
        return quotes ? quotes[quotes.length - 1] : null;
      })
      .filter((q): q is DailyQuote => q !== null);

    const rising = latest.filter(q => q.changePercent > 0).length;
    const falling = latest.filter(q => q.changePercent < 0).length;

    return {
      date: new Date(),
      totalStocks: this.stocks.length,
      totalMarketCap: latest.reduce((sum, q) => sum + (q.marketCap || 0), 0),
      totalVolume: latest.reduce((sum, q) => sum + q.volume, 0),
      totalTurnover: latest.reduce((sum, q) => sum + q.turnover, 0),
      avgPeRatio: 0,
      avgPbRatio: 0,
      risingStocks: rising,
      fallingStocks: falling,
      unchangedStocks: this.stocks.length - rising - falling,
    };
  }

  /** 板块内个股列表 */
  async getSectorStocks(industry: string): Promise<StockWithLatestQuote[]> {
    return this.stocks
      .filter(s => s.industry === industry || (industry === '其他' && !s.industry))
      .map(s => {
        const quotes = this.quotes.get(s.symbol);
        const latest = quotes ? quotes[quotes.length - 1] : undefined;
        return { ...s, latestQuote: latest } as StockWithLatestQuote;
      })
      .filter(s => s.latestQuote !== undefined)
      .sort((a, b) => (b.latestQuote?.changePercent || 0) - (a.latestQuote?.changePercent || 0));
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
    const map = new Map<string, {
      count: number; totalChange: number; totalTurnover: number;
      totalCap: number; limitUp: number;
    }>();
    this.stocks.forEach(s => {
      const quotes = this.quotes.get(s.symbol);
      const latest = quotes ? quotes[quotes.length - 1] : null;
      if (!latest) return;
      const ind = s.industry || '其他';
      if (!map.has(ind)) map.set(ind, { count: 0, totalChange: 0, totalTurnover: 0, totalCap: 0, limitUp: 0 });
      const e = map.get(ind)!;
      e.count++;
      e.totalChange += latest.changePercent;
      e.totalTurnover += latest.turnover || 0;
      e.totalCap += latest.marketCap || 0;
      if (latest.changePercent >= 9.9) e.limitUp++;
    });
    return Array.from(map.entries())
      .map(([industry, d]) => ({
        industry,
        stock_count: d.count,
        avg_change_percent: Math.round((d.totalChange / d.count) * 100) / 100,
        total_turnover: d.totalTurnover,
        total_market_cap: d.totalCap,
        limit_up_count: d.limitUp,
      }))
      .sort((a, b) => b.avg_change_percent - a.avg_change_percent);
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

    const maxChange = Math.max(...enhanced.map(s => Math.abs(s.avg_change_percent)), 1);
    const maxTurnover = Math.max(...enhanced.map(s => s.total_turnover), 1);
    const maxLimitUp = Math.max(...enhanced.map(s => s.limit_up_count), 1);

    return enhanced.map(s => {
      const changeScore = Math.min(100, (Math.abs(s.avg_change_percent) / maxChange) * 50);
      const volumeScore = Math.min(100, (s.total_turnover / maxTurnover) * 25);
      const breadthScore = Math.min(100, (s.limit_up_count / maxLimitUp) * 25);
      const score = Math.round(changeScore + volumeScore + breadthScore);

      return {
        industry: s.industry,
        score,
        changeScore: Math.round(changeScore),
        volumeScore: Math.round(volumeScore),
        breadthScore: Math.round(breadthScore),
        stock_count: s.stock_count,
        avg_change_percent: s.avg_change_percent,
        total_turnover: s.total_turnover,
        limit_up_count: s.limit_up_count,
      };
    }).sort((a, b) => b.score - a.score);
  }
}

// 单例
let instance: InMemoryDatabase | null = null;

export function getInMemoryDb(): InMemoryDatabase {
  if (!instance) {
    instance = new InMemoryDatabase();
  }
  return instance;
}

export { InMemoryDatabase };
