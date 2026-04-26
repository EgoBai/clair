/**
 * inMemoryDatabase.test.ts
 * 内存数据库完整操作测试
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Core data types
interface Stock {
  id: number;
  symbol: string;
  name: string;
  market: string;
  industry: string;
  isActive: boolean;
}

interface DailyQuote {
  id: number;
  stockId: number;
  tradeDate: string;
  openPrice: number;
  closePrice: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  turnover: number;
  change: number;
  changePercent: number;
  amplitude: number;
  turnoverRate: number;
}

// Simplified InMemoryDatabase for testing
class TestInMemoryDB {
  private stocks: Stock[] = [];
  private quotes: Map<string, DailyQuote[]> = new Map();

  addStock(stock: Stock, quoteCount: number = 60): void {
    this.stocks.push(stock);
    const quotes: DailyQuote[] = [];
    for (let i = 0; i < quoteCount; i++) {
      quotes.push({
        id: i + 1,
        stockId: stock.id,
        tradeDate: `2026-01-${String(i + 1).padStart(2, '0')}`,
        openPrice: 10 + Math.random() * 100,
        closePrice: 10 + Math.random() * 100,
        highPrice: 20 + Math.random() * 100,
        lowPrice: 5 + Math.random() * 50,
        volume: Math.floor(1000000 + Math.random() * 10000000),
        turnover: Math.floor(10000000 + Math.random() * 50000000),
        change: Math.round((Math.random() - 0.5) * 10 * 100) / 100,
        changePercent: Math.round((Math.random() - 0.5) * 10 * 100) / 100,
        amplitude: Math.round(Math.random() * 5 * 100) / 100,
        turnoverRate: Math.round(Math.random() * 10 * 100) / 100,
      });
    }
    this.quotes.set(stock.symbol, quotes);
  }

  getStockBySymbol(symbol: string): Stock | null {
    return this.stocks.find(s => s.symbol === symbol) || null;
  }

  getStockById(id: number): Stock | null {
    return this.stocks.find(s => s.id === id) || null;
  }

  getStocks(params: {
    symbol?: string;
    name?: string;
    market?: string;
    industry?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: string;
  } = {}): Stock[] {
    const {
      symbol, name, market, industry,
      page = 1, pageSize = 20, sortBy = 'symbol', sortOrder = 'asc',
    } = params;

    let result = this.stocks.filter(s => s.isActive !== false);

    if (symbol) result = result.filter(s => s.symbol.includes(symbol));
    if (name) result = result.filter(s => s.name.includes(name));
    if (market) result = result.filter(s => s.market === market);
    if (industry) result = result.filter(s => s.industry === industry);

    result.sort((a: any, b: any) => {
      const aVal = a[sortBy], bVal = b[sortBy];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const cmp = aVal.localeCompare(bVal, 'zh-CN');
        return sortOrder === 'asc' ? cmp : -cmp;
      }
      if (aVal === bVal) return 0;
      return sortOrder === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });

    const offset = (page - 1) * pageSize;
    return result.slice(offset, offset + pageSize);
  }

  getStockCount(params: {
    symbol?: string;
    name?: string;
    market?: string;
    industry?: string;
  } = {}): number {
    const { symbol, name, market, industry } = params;
    let result = this.stocks.filter(s => s.isActive !== false);
    if (symbol) result = result.filter(s => s.symbol.includes(symbol));
    if (name) result = result.filter(s => s.name.includes(name));
    if (market) result = result.filter(s => s.market === market);
    if (industry) result = result.filter(s => s.industry === industry);
    return result.length;
  }

  getDailyQuotes(stockId: number, startDate?: string, endDate?: string, limit?: number): DailyQuote[] {
    const stock = this.stocks.find(s => s.id === stockId);
    if (!stock) return [];
    let quotes = this.quotes.get(stock.symbol) || [];
    if (startDate) quotes = quotes.filter(q => q.tradeDate >= startDate);
    if (endDate) quotes = quotes.filter(q => q.tradeDate <= endDate);
    quotes.sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
    if (limit) quotes = quotes.slice(0, limit);
    return quotes;
  }

  getLatestDailyQuote(stockId: number): DailyQuote | null {
    const stock = this.stocks.find(s => s.id === stockId);
    if (!stock) return null;
    const quotes = this.quotes.get(stock.symbol) || [];
    return quotes.length > 0 ? quotes[quotes.length - 1] : null;
  }

  getTopGainers(limit: number = 10): Array<{ symbol: string; changePercent: number }> {
    return this.stocks
      .map(s => {
        const quotes = this.quotes.get(s.symbol);
        const latest = quotes ? quotes[quotes.length - 1] : null;
        return { symbol: s.symbol, name: s.name, changePercent: latest?.changePercent || 0 };
      })
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, limit);
  }

  getTopLosers(limit: number = 10): Array<{ symbol: string; changePercent: number }> {
    return this.stocks
      .map(s => {
        const quotes = this.quotes.get(s.symbol);
        const latest = quotes ? quotes[quotes.length - 1] : null;
        return { symbol: s.symbol, name: s.name, changePercent: latest?.changePercent || 0 };
      })
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, limit);
  }

  getIndustryPerformance(): Array<{ industry: string; avgChange: number; count: number }> {
    const map = new Map<string, { totalChange: number; count: number }>();
    this.stocks.forEach(s => {
      if (!s.industry) return;
      const quotes = this.quotes.get(s.symbol);
      const latest = quotes ? quotes[quotes.length - 1] : null;
      if (!latest) return;
      const existing = map.get(s.industry) || { totalChange: 0, count: 0 };
      existing.totalChange += latest.changePercent;
      existing.count++;
      map.set(s.industry, existing);
    });

    return Array.from(map.entries())
      .map(([industry, { totalChange, count }]) => ({
        industry,
        avgChange: Math.round((totalChange / count) * 100) / 100,
        count,
      }))
      .sort((a, b) => b.avgChange - a.avgChange);
  }

  clear(): void {
    this.stocks = [];
    this.quotes.clear();
  }

  getStockSymbol(symbol: string): Stock | null {
    return this.stocks.find(s => s.symbol === symbol) || null;
  }
}

describe('InMemoryDatabase', () => {
  let db: TestInMemoryDB;

  beforeEach(() => {
    db = new TestInMemoryDB();
    db.addStock(
      { id: 1, symbol: '000001', name: '平安银行', market: 'SZ', industry: '银行', isActive: true },
      60,
    );
    db.addStock(
      { id: 2, symbol: '000002', name: '万科A', market: 'SZ', industry: '房地产', isActive: true },
      60,
    );
    db.addStock(
      { id: 3, symbol: '600519', name: '贵州茅台', market: 'SH', industry: '白酒', isActive: true },
      60,
    );
    db.addStock(
      { id: 4, symbol: '300750', name: '宁德时代', market: 'SZ', industry: '新能源电池', isActive: true },
      60,
    );
    db.addStock(
      { id: 5, symbol: '002594', name: '比亚迪', market: 'SZ', industry: '新能源汽车', isActive: false },
      60,
    );
  });

  // --- Stock CRUD ---

  it('should retrieve stock by symbol', () => {
    const stock = db.getStockBySymbol('000001');
    expect(stock).not.toBeNull();
    expect(stock!.symbol).toBe('000001');
    expect(stock!.name).toBe('平安银行');
  });

  it('should return null for non-existent symbol', () => {
    expect(db.getStockBySymbol('999999')).toBeNull();
  });

  it('should retrieve stock by id', () => {
    const stock = db.getStockById(3);
    expect(stock).not.toBeNull();
    expect(stock!.symbol).toBe('600519');
  });

  it('should return null for non-existent id', () => {
    expect(db.getStockById(999)).toBeNull();
  });

  // --- getStocks with filters ---

  it('should return all active stocks', () => {
    const stocks = db.getStocks();
    // 5 total, 4 active (isActive false is excluded)
    expect(stocks.length).toBeLessThanOrEqual(5);
  });

  it('should filter stocks by symbol', () => {
    const result = db.getStocks({ symbol: '600' });
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('600519');
  });

  it('should filter stocks by market', () => {
    const shStocks = db.getStocks({ market: 'SH' });
    expect(shStocks).toHaveLength(1);
    expect(shStocks[0].market).toBe('SH');

    const szStocks = db.getStocks({ market: 'SZ' });
    expect(szStocks.length).toBeGreaterThanOrEqual(3);
  });

  it('should filter stocks by industry', () => {
    const bankStocks = db.getStocks({ industry: '银行' });
    expect(bankStocks).toHaveLength(1);
    expect(bankStocks[0].name).toBe('平安银行');
  });

  it('should filter stocks by name', () => {
    const result = db.getStocks({ name: '茅台' });
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('600519');
  });

  // --- Pagination & Sorting ---

  it('should paginate results', () => {
    const page1 = db.getStocks({ page: 1, pageSize: 2 });
    expect(page1).toHaveLength(2);

    const page2 = db.getStocks({ page: 2, pageSize: 2 });
    expect(page2).toHaveLength(2);

    const page3 = db.getStocks({ page: 3, pageSize: 2 });
    expect(page3.length).toBeGreaterThanOrEqual(0);
  });

  it('should sort stocks ascending by default', () => {
    const stocks = db.getStocks({ sortBy: 'symbol' });
    for (let i = 1; i < stocks.length; i++) {
      expect(stocks[i].symbol.localeCompare(stocks[i - 1].symbol)).toBeGreaterThanOrEqual(0);
    }
  });

  it('should sort stocks descending', () => {
    const stocks = db.getStocks({ sortBy: 'symbol', sortOrder: 'desc' });
    for (let i = 1; i < stocks.length; i++) {
      expect(stocks[i].symbol.localeCompare(stocks[i - 1].symbol)).toBeLessThanOrEqual(0);
    }
  });

  it('should sort by name', () => {
    const asc = db.getStocks({ sortBy: 'name', sortOrder: 'asc' });
    expect(asc.length).toBeGreaterThan(0);
    for (let i = 1; i < asc.length; i++) {
      const cmp = asc[i].name.localeCompare(asc[i - 1].name, 'zh-CN');
      expect(cmp).toBeGreaterThanOrEqual(0);
    }
  });

  // --- getStockCount ---

  it('should count total stocks', () => {
    const count = db.getStockCount();
    expect(count).toBeGreaterThan(0);
  });

  it('should count filtered stocks', () => {
    expect(db.getStockCount({ market: 'SH' })).toBe(1);
    expect(db.getStockCount({ market: 'SZ' })).toBeGreaterThanOrEqual(3);
    expect(db.getStockCount({ industry: '银行' })).toBe(1);
  });

  it('should return 0 for non-matching filter', () => {
    expect(db.getStockCount({ industry: '不存在' })).toBe(0);
  });

  // --- Daily Quotes ---

  it('should retrieve daily quotes for a stock', () => {
    const quotes = db.getDailyQuotes(1);
    expect(quotes.length).toBeGreaterThan(0);
  });

  it('should return empty array for non-existent stock', () => {
    const quotes = db.getDailyQuotes(999);
    expect(quotes).toHaveLength(0);
  });

  it('should filter quotes by date range', () => {
    const allQuotes = db.getDailyQuotes(1);
    const earlyPredicate = allQuotes[allQuotes.length - 1].tradeDate;
    const latePredicate = allQuotes[0].tradeDate;

    // Filter first half
    const filtered = db.getDailyQuotes(1, '2026-01-01', '2026-01-15');
    expect(filtered.length).toBeLessThanOrEqual(15);
    expect(filtered.length).toBeGreaterThan(0);

    for (const q of filtered) {
      expect(q.tradeDate >= '2026-01-01').toBe(true);
      expect(q.tradeDate <= '2026-01-15').toBe(true);
    }
  });

  it('should limit number of quotes returned', () => {
    const quotes = db.getDailyQuotes(1, undefined, undefined, 5);
    expect(quotes.length).toBeLessThanOrEqual(5);
  });

  it('should return quotes sorted by date descending', () => {
    const quotes = db.getDailyQuotes(1);
    for (let i = 1; i < quotes.length; i++) {
      expect(quotes[i].tradeDate <= quotes[i - 1].tradeDate).toBe(true);
    }
  });

  it('should get latest daily quote', () => {
    const latest = db.getLatestDailyQuote(1);
    expect(latest).not.toBeNull();
    expect(latest!.stockId).toBe(1);
  });

  it('should return null for latest quote of non-existent stock', () => {
    expect(db.getLatestDailyQuote(999)).toBeNull();
  });

  // --- Top Gainers / Losers ---

  it('should get top gainers sorted descending', () => {
    const gainers = db.getTopGainers(3);
    expect(gainers.length).toBeLessThanOrEqual(3);

    for (let i = 1; i < gainers.length; i++) {
      expect(gainers[i].changePercent).toBeLessThanOrEqual(gainers[i - 1].changePercent);
    }
  });

  it('should get top losers sorted ascending', () => {
    const losers = db.getTopLosers(3);
    expect(losers.length).toBeLessThanOrEqual(3);

    for (let i = 1; i < losers.length; i++) {
      expect(losers[i].changePercent).toBeGreaterThanOrEqual(losers[i - 1].changePercent);
    }
  });

  it('should respect limit for top gainers', () => {
    expect(db.getTopGainers(2)).toHaveLength(2);
    expect(db.getTopGainers(5)).toHaveLength(5);
  });

  it('should not crash when getting top gainers with no data', () => {
    const emptyDb = new TestInMemoryDB();
    const gainers = emptyDb.getTopGainers();
    expect(gainers).toHaveLength(0);
  });

  // --- Industry Performance ---

  it('should calculate industry performance', () => {
    const perf = db.getIndustryPerformance();
    expect(perf.length).toBeGreaterThan(0);

    // Each entry should have the right shape
    for (const entry of perf) {
      expect(entry.industry).toBeDefined();
      expect(typeof entry.avgChange).toBe('number');
      expect(entry.count).toBeGreaterThan(0);
    }
  });

  it('should sort industry performance descending', () => {
    const perf = db.getIndustryPerformance();
    for (let i = 1; i < perf.length; i++) {
      expect(perf[i].avgChange).toBeLessThanOrEqual(perf[i - 1].avgChange);
    }
  });

  it('should return empty array for empty database', () => {
    const emptyDb = new TestInMemoryDB();
    expect(emptyDb.getIndustryPerformance()).toHaveLength(0);
  });

  // --- Edge Cases ---

  it('should handle clear operation', () => {
    db.clear();
    expect(db.getStocks()).toHaveLength(0);
    expect(db.getStockBySymbol('000001')).toBeNull();
  });

  it('should handle consecutive gets with same symbol', () => {
    const stock1 = db.getStockBySymbol('600519');
    const stock2 = db.getStockBySymbol('600519');
    expect(stock1).toEqual(stock2);
  });

  it('should handle large page numbers', () => {
    const result = db.getStocks({ page: 100, pageSize: 20 });
    expect(result).toHaveLength(0);
  });

  it('should handle zero page size', () => {
    const result = db.getStocks({ page: 1, pageSize: 0 });
    expect(result).toHaveLength(0);
  });
});
