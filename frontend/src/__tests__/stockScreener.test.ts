import { describe, it, expect, beforeEach } from 'vitest';

// Stock Screener Engine
interface ScreenerCriteria {
  id: string;
  field: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'between' | 'in' | 'not_in' | 'contains' | 'starts_with';
  value: unknown;
  value2?: unknown;
  weight: number;
  enabled: boolean;
}

interface ScreenerPreset {
  id: string;
  name: string;
  description: string;
  criteria: ScreenerCriteria[];
  sortField: string;
  sortOrder: 'asc' | 'desc';
  limit: number;
  category: string;
}

interface StockData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  pe: number;
  pb: number;
  dividend: number;
  roe: number;
  eps: number;
  sector: string;
  industry: string;
  high52w: number;
  low52w: number;
  ma20: number;
  ma50: number;
  ma200: number;
  rsi: number;
  macd: number;
  [key: string]: unknown;
}

interface ScreenerResult {
  stock: StockData;
  score: number;
  matchedCriteria: string[];
  rank: number;
}

class StockScreener {
  private presets: Map<string, ScreenerPreset> = new Map();
  private stockData: StockData[] = [];
  private customFields: Map<string, (stock: StockData) => number> = new Map();

  loadData(data: StockData[]): void {
    this.stockData = [...data];
  }

  addCustomField(name: string, calculator: (stock: StockData) => number): void {
    this.customFields.set(name, calculator);
  }

  private getFieldValue(stock: StockData, field: string): unknown {
    if (this.customFields.has(field)) {
      return this.customFields.get(field)!(stock);
    }
    return stock[field];
  }

  private matchesCriteria(stock: StockData, criteria: ScreenerCriteria): boolean {
    if (!criteria.enabled) return true;
    const value = this.getFieldValue(stock, criteria.field);
    const target = criteria.value;

    switch (criteria.operator) {
      case 'gt': return (value as number) > (target as number);
      case 'gte': return (value as number) >= (target as number);
      case 'lt': return (value as number) < (target as number);
      case 'lte': return (value as number) <= (target as number);
      case 'eq': return value === target;
      case 'neq': return value !== target;
      case 'between': return (value as number) >= (target as number) && (value as number) <= (criteria.value2 as number);
      case 'in': return (target as unknown[]).includes(value);
      case 'not_in': return !(target as unknown[]).includes(value);
      case 'contains': return String(value).toLowerCase().includes(String(target).toLowerCase());
      case 'starts_with': return String(value).toLowerCase().startsWith(String(target).toLowerCase());
      default: return true;
    }
  }

  screen(criteria: ScreenerCriteria[]): ScreenerResult[] {
    const results: ScreenerResult[] = [];

    for (const stock of this.stockData) {
      let score = 0;
      const matchedCriteria: string[] = [];
      let allMatched = true;

      for (const c of criteria) {
        if (!c.enabled) continue;
        if (this.matchesCriteria(stock, c)) {
          score += c.weight;
          matchedCriteria.push(c.field);
        } else {
          allMatched = false;
        }
      }

      if (allMatched && matchedCriteria.length > 0) {
        results.push({ stock, score, matchedCriteria, rank: 0 });
      }
    }

    results.sort((a, b) => b.score - a.score);
    results.forEach((r, i) => r.rank = i + 1);
    return results;
  }

  screenWithPreset(presetId: string): ScreenerResult[] {
    const preset = this.presets.get(presetId);
    if (!preset) throw new Error('Preset not found');
    let results = this.screen(preset.criteria);

    if (preset.sortField) {
      results.sort((a, b) => {
        const va = a.stock[preset.sortField] as number;
        const vb = b.stock[preset.sortField] as number;
        return preset.sortOrder === 'asc' ? va - vb : vb - va;
      });
    }

    if (preset.limit > 0) {
      results = results.slice(0, preset.limit);
    }

    return results;
  }

  savePreset(preset: Omit<ScreenerPreset, 'id'>): ScreenerPreset {
    const id = `preset_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const full: ScreenerPreset = { ...preset, id };
    this.presets.set(id, full);
    return full;
  }

  deletePreset(id: string): boolean {
    return this.presets.delete(id);
  }

  getPreset(id: string): ScreenerPreset | undefined {
    return this.presets.get(id);
  }

  getPresets(): ScreenerPreset[] {
    return Array.from(this.presets.values());
  }

  getSectorDistribution(results: ScreenerResult[]): Record<string, number> {
    const dist: Record<string, number> = {};
    for (const r of results) {
      dist[r.stock.sector] = (dist[r.stock.sector] ?? 0) + 1;
    }
    return dist;
  }

  getIndustryDistribution(results: ScreenerResult[]): Record<string, number> {
    const dist: Record<string, number> = {};
    for (const r of results) {
      dist[r.stock.industry] = (dist[r.stock.industry] ?? 0) + 1;
    }
    return dist;
  }

  getStatistics(results: ScreenerResult[]): {
    count: number;
    avgPrice: number;
    avgPE: number;
    avgVolume: number;
    avgMarketCap: number;
    topGainers: ScreenerResult[];
    topLosers: ScreenerResult[];
  } {
    const stocks = results.map(r => r.stock);
    return {
      count: stocks.length,
      avgPrice: stocks.reduce((s, st) => s + st.price, 0) / (stocks.length || 1),
      avgPE: stocks.reduce((s, st) => s + st.pe, 0) / (stocks.length || 1),
      avgVolume: stocks.reduce((s, st) => s + st.volume, 0) / (stocks.length || 1),
      avgMarketCap: stocks.reduce((s, st) => s + st.marketCap, 0) / (stocks.length || 1),
      topGainers: [...results].sort((a, b) => b.stock.changePercent - a.stock.changePercent).slice(0, 5),
      topLosers: [...results].sort((a, b) => a.stock.changePercent - b.stock.changePercent).slice(0, 5),
    };
  }

  exportResults(results: ScreenerResult[], format: 'csv' | 'json'): string {
    if (format === 'json') return JSON.stringify(results, null, 2);
    const headers = ['Rank', 'Symbol', 'Name', 'Price', 'Change%', 'Volume', 'Score'];
    const rows = results.map(r => [
      r.rank, r.stock.symbol, r.stock.name, r.stock.price,
      r.stock.changePercent, r.stock.volume, r.score.toFixed(2),
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
}

describe('Stock Screener', () => {
  let screener: StockScreener;
  const sampleStocks: StockData[] = [
    { symbol: 'AAPL', name: 'Apple Inc', price: 175, change: 3.5, changePercent: 2.0, volume: 50000000, marketCap: 2800000000000, pe: 28, pb: 45, dividend: 0.6, roe: 1.5, eps: 6.25, sector: 'Technology', industry: 'Consumer Electronics', high52w: 198, low52w: 124, ma20: 172, ma50: 168, ma200: 155, rsi: 62, macd: 1.5 },
    { symbol: 'GOOGL', name: 'Alphabet', price: 140, change: -1.2, changePercent: -0.85, volume: 25000000, marketCap: 1750000000000, pe: 25, pb: 6, dividend: 0, roe: 0.3, eps: 5.6, sector: 'Technology', industry: 'Internet', high52w: 152, low52w: 102, ma20: 138, ma50: 135, ma200: 128, rsi: 55, macd: 0.3 },
    { symbol: 'JPM', name: 'JP Morgan', price: 195, change: 2.1, changePercent: 1.09, volume: 10000000, marketCap: 560000000000, pe: 11, pb: 1.8, dividend: 2.8, roe: 0.17, eps: 17.7, sector: 'Finance', industry: 'Banking', high52w: 200, low52w: 135, ma20: 192, ma50: 188, ma200: 175, rsi: 68, macd: 2.1 },
    { symbol: 'XOM', name: 'Exxon Mobil', price: 105, change: -0.5, changePercent: -0.47, volume: 15000000, marketCap: 420000000000, pe: 10, pb: 2.0, dividend: 3.3, roe: 0.25, eps: 10.5, sector: 'Energy', industry: 'Oil & Gas', high52w: 120, low52w: 95, ma20: 104, ma50: 102, ma200: 100, rsi: 48, macd: -0.2 },
    { symbol: 'PFE', name: 'Pfizer', price: 28, change: 0.3, changePercent: 1.08, volume: 30000000, marketCap: 158000000000, pe: 12, pb: 1.5, dividend: 5.5, roe: 0.05, eps: 2.3, sector: 'Healthcare', industry: 'Pharma', high52w: 45, low52w: 25, ma20: 27, ma50: 29, ma200: 33, rsi: 35, macd: -1.0 },
  ];

  beforeEach(() => {
    screener = new StockScreener();
    screener.loadData(sampleStocks);
  });

  it('should screen by single criterion', () => {
    const results = screener.screen([
      { id: 'c1', field: 'pe', operator: 'lt', value: 15, weight: 1, enabled: true },
    ]);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r => r.stock.pe < 15)).toBe(true);
  });

  it('should screen by multiple criteria', () => {
    const results = screener.screen([
      { id: 'c1', field: 'pe', operator: 'lt', value: 20, weight: 1, enabled: true },
      { id: 'c2', field: 'dividend', operator: 'gt', value: 2, weight: 2, enabled: true },
    ]);
    expect(results.every(r => r.stock.pe < 20 && r.stock.dividend > 2)).toBe(true);
  });

  it('should handle between operator', () => {
    const results = screener.screen([
      { id: 'c1', field: 'rsi', operator: 'between', value: 30, value2: 70, weight: 1, enabled: true },
    ]);
    expect(results.every(r => r.stock.rsi >= 30 && r.stock.rsi <= 70)).toBe(true);
  });

  it('should handle in operator', () => {
    const results = screener.screen([
      { id: 'c1', field: 'sector', operator: 'in', value: ['Technology', 'Finance'], weight: 1, enabled: true },
    ]);
    expect(results.every(r => ['Technology', 'Finance'].includes(r.stock.sector))).toBe(true);
  });

  it('should handle contains operator', () => {
    const results = screener.screen([
      { id: 'c1', field: 'name', operator: 'contains', value: 'apple', weight: 1, enabled: true },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].stock.symbol).toBe('AAPL');
  });

  it('should sort by score', () => {
    const results = screener.screen([
      { id: 'c1', field: 'pe', operator: 'lt', value: 30, weight: 1, enabled: true },
      { id: 'c2', field: 'dividend', operator: 'gt', value: 0, weight: 3, enabled: true },
    ]);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  it('should assign ranks', () => {
    const results = screener.screen([
      { id: 'c1', field: 'price', operator: 'gt', value: 0, weight: 1, enabled: true },
    ]);
    results.forEach((r, i) => expect(r.rank).toBe(i + 1));
  });

  it('should skip disabled criteria', () => {
    const results = screener.screen([
      { id: 'c1', field: 'pe', operator: 'lt', value: 30, weight: 1, enabled: true },
      { id: 'c2', field: 'pe', operator: 'lt', value: 1, weight: 1, enabled: false },
    ]);
    expect(results.length).toBeGreaterThan(0);
  });

  it('should save and use preset', () => {
    const preset = screener.savePreset({
      name: 'Low PE',
      description: 'Low P/E stocks',
      criteria: [{ id: 'c1', field: 'pe', operator: 'lt', value: 15, weight: 1, enabled: true }],
      sortField: 'pe', sortOrder: 'asc', limit: 10, category: 'value',
    });
    const results = screener.screenWithPreset(preset.id);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].stock.pe).toBeLessThanOrEqual(results[results.length - 1].stock.pe);
  });

  it('should delete preset', () => {
    const preset = screener.savePreset({
      name: 'T', description: '', criteria: [],
      sortField: '', sortOrder: 'asc', limit: 0, category: '',
    });
    expect(screener.deletePreset(preset.id)).toBe(true);
  });

  it('should get sector distribution', () => {
    const results = screener.screen([
      { id: 'c1', field: 'price', operator: 'gt', value: 0, weight: 1, enabled: true },
    ]);
    const dist = screener.getSectorDistribution(results);
    expect(dist['Technology']).toBe(2);
    expect(dist['Finance']).toBe(1);
  });

  it('should get statistics', () => {
    const results = screener.screen([
      { id: 'c1', field: 'price', operator: 'gt', value: 0, weight: 1, enabled: true },
    ]);
    const stats = screener.getStatistics(results);
    expect(stats.count).toBe(5);
    expect(stats.avgPrice).toBeGreaterThan(0);
    expect(stats.topGainers).toHaveLength(5);
  });

  it('should add custom field', () => {
    screener.addCustomField('priceToBook', (s) => s.price / s.pb);
    const results = screener.screen([
      { id: 'c1', field: 'priceToBook', operator: 'lt', value: 50, weight: 1, enabled: true },
    ]);
    expect(results.length).toBeGreaterThan(0);
  });

  it('should export CSV', () => {
    const results = screener.screen([
      { id: 'c1', field: 'price', operator: 'gt', value: 0, weight: 1, enabled: true },
    ]);
    const csv = screener.exportResults(results, 'csv');
    expect(csv).toContain('Rank');
    expect(csv).toContain('AAPL');
  });

  it('should export JSON', () => {
    const results = screener.screen([
      { id: 'c1', field: 'price', operator: 'gt', value: 0, weight: 1, enabled: true },
    ]);
    const json = screener.exportResults(results, 'json');
    expect(JSON.parse(json)).toHaveLength(5);
  });

  it('should handle starts_with operator', () => {
    const results = screener.screen([
      { id: 'c1', field: 'symbol', operator: 'starts_with', value: 'A', weight: 1, enabled: true },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].stock.symbol).toBe('AAPL');
  });

  it('should limit results in preset', () => {
    const preset = screener.savePreset({
      name: 'Top 2', description: '',
      criteria: [{ id: 'c1', field: 'price', operator: 'gt', value: 0, weight: 1, enabled: true }],
      sortField: 'price', sortOrder: 'desc', limit: 2, category: '',
    });
    const results = screener.screenWithPreset(preset.id);
    expect(results).toHaveLength(2);
  });
});
