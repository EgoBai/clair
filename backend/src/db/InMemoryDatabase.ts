/**
 * 内存数据库 — 无需PostgreSQL即可运行后端
 * 提供与Database.ts相同的接口，使用内存数据
 */

import { Stock, DailyQuote, StockWithQuotes } from '../models/Stock';

// ==================== Mock数据生成 ====================

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
      tradeDate: date.toISOString().split('T')[0],
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

  private initializeData(): void {
    STOCK_SYMBOLS.forEach((s, idx) => {
      const stock: Stock = {
        id: idx + 1,
        symbol: s.symbol,
        name: s.name,
        market: s.market,
        industry: s.industry,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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

  // 模拟Knex接口
  get connection() {
    const self = this;
    return {
      (tableName: string) {
        return {
          where(conditions: Record<string, any> | string, value?: any) {
            let filtered = self.stocks;
            if (typeof conditions === 'object') {
              filtered = self.stocks.filter(s => {
                return Object.entries(conditions).every(([k, v]) => (s as any)[k] === v);
              });
            }
            return {
              select(...fields: string[]) {
                if (fields.length === 0) return filtered;
                return filtered.map(s => {
                  const obj: any = {};
                  fields.forEach(f => { obj[f] = (s as any)[f]; });
                  return obj;
                });
              },
              first() { return filtered[0] || null; },
              limit(n: number) { return filtered.slice(0, n); },
              orderBy(field: string, dir: string = 'asc') {
                return [...filtered].sort((a: any, b: any) => 
                  dir === 'asc' ? a[field] - b[field] : b[field] - a[field]
                );
              },
            };
          },
          select(...fields: string[]) {
            if (fields.length === 0) return self.stocks;
            return self.stocks.map(s => {
              const obj: any = {};
              fields.forEach(f => { obj[f] = (s as any)[f]; });
              return obj;
            });
          },
          limit(n: number) { return self.stocks.slice(0, n); },
        };
      },
      raw(sql: string) { return Promise.resolve(); },
      destroy() { return Promise.resolve(); },
    };
  }

  async testConnection(): Promise<boolean> { return true; }
  async close(): Promise<void> { }
  getPoolStats() { return { used: 0, free: 0, pending: 0, min: 0, max: 0 }; }
  async healthCheck() { return { healthy: true, latency: 0 }; }

  getStocks(): Stock[] { return this.stocks; }
  getQuotes(symbol: string): DailyQuote[] { return this.quotes.get(symbol) || []; }
  
  getMarketSummary() {
    const latest = this.stocks.map(s => {
      const quotes = this.quotes.get(s.symbol);
      return quotes ? quotes[quotes.length - 1] : null;
    }).filter(Boolean);

    const rising = latest.filter(q => q!.changePercent > 0).length;
    const falling = latest.filter(q => q!.changePercent < 0).length;
    const totalMarketCap = latest.reduce((sum, q) => sum + (q!.marketCap || 0), 0);
    const totalTurnover = latest.reduce((sum, q) => sum + q!.turnover, 0);

    return {
      date: new Date().toISOString().split('T')[0],
      totalStocks: this.stocks.length,
      totalMarketCap,
      totalVolume: latest.reduce((sum, q) => sum + q!.volume, 0),
      totalTurnover,
      risingStocks: rising,
      fallingStocks: falling,
      unchangedStocks: this.stocks.length - rising - falling,
    };
  }

  getTopGainers(limit: number = 10) {
    return this.stocks.map(s => {
      const quotes = this.quotes.get(s.symbol);
      const latest = quotes ? quotes[quotes.length - 1] : undefined;
      return { ...s, latestQuote: latest };
    })
    .filter(s => s.latestQuote)
    .sort((a, b) => (b.latestQuote?.changePercent || 0) - (a.latestQuote?.changePercent || 0))
    .slice(0, limit);
  }

  getTopLosers(limit: number = 10) {
    return this.stocks.map(s => {
      const quotes = this.quotes.get(s.symbol);
      const latest = quotes ? quotes[quotes.length - 1] : undefined;
      return { ...s, latestQuote: latest };
    })
    .filter(s => s.latestQuote)
    .sort((a, b) => (a.latestQuote?.changePercent || 0) - (b.latestQuote?.changePercent || 0))
    .slice(0, limit);
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
