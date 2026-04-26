import { describe, it, expect } from 'vitest';

// Stock model operations & validation utilities
interface StockRecord {
  code: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  turnover: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  pe: number;
  pb: number;
  marketCap: number;
  sector: string;
  industry: string;
  listingDate: string;
}

function validateStockCode(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  const trimmed = code.trim();
  if (trimmed.length !== 6 && trimmed.length !== 8) return false;
  return /^(60|00|30|68|83|43)\d{4,6}$/.test(trimmed);
}

function formatStockCode(raw: string): string {
  if (!raw) return '';
  const cleaned = raw.replace(/[^0-9]/g, '');
  if (cleaned.length >= 6) {
    const prefix = cleaned.substring(0, 2);
    if (['60', '68'].includes(prefix)) return 'sh' + cleaned.substring(0, 6);
    if (['00', '30'].includes(prefix)) return 'sz' + cleaned.substring(0, 6);
    if (['83', '43'].includes(prefix)) return 'bj' + cleaned.substring(0, 6);
  }
  return cleaned.substring(0, 6);
}

function normalizeStockData(raw: Partial<StockRecord>): StockRecord | null {
  if (!raw.code || !raw.name) return null;
  return {
    code: raw.code.trim(),
    name: raw.name.trim(),
    price: Number(raw.price) || 0,
    change: Number(raw.change) || 0,
    changePercent: Number(raw.changePercent) || 0,
    volume: Number(raw.volume) || 0,
    turnover: Number(raw.turnover) || 0,
    high: Number(raw.high) || 0,
    low: Number(raw.low) || 0,
    open: Number(raw.open) || 0,
    prevClose: Number(raw.prevClose) || 0,
    pe: Number(raw.pe) || 0,
    pb: Number(raw.pb) || 0,
    marketCap: Number(raw.marketCap) || 0,
    sector: raw.sector || 'unknown',
    industry: raw.industry || 'unknown',
    listingDate: raw.listingDate || new Date().toISOString().split('T')[0],
  };
}

function calculateMarketValue(price: number, totalShares: number): number {
  if (price < 0 || totalShares < 0) return 0;
  return Math.round(price * totalShares * 100) / 100;
}

function categorizeByMarketCap(cap: number): 'large' | 'mid' | 'small' | 'micro' {
  if (cap >= 1000e8) return 'large';
  if (cap >= 200e8) return 'mid';
  if (cap >= 50e8) return 'small';
  return 'micro';
}

function deduplicateStocks(stocks: StockRecord[]): StockRecord[] {
  const seen = new Map<string, StockRecord>();
  for (const stock of stocks) {
    const existing = seen.get(stock.code);
    if (!existing || stock.price > 0) {
      seen.set(stock.code, stock);
    }
  }
  return Array.from(seen.values());
}

function filterStocksByCriteria(
  stocks: StockRecord[],
  criteria: {
    minPrice?: number;
    maxPrice?: number;
    sector?: string;
    minVolume?: number;
    onlyPositive?: boolean;
  }
): StockRecord[] {
  return stocks.filter(s => {
    if (criteria.minPrice !== undefined && s.price < criteria.minPrice) return false;
    if (criteria.maxPrice !== undefined && s.price > criteria.maxPrice) return false;
    if (criteria.sector && s.sector !== criteria.sector) return false;
    if (criteria.minVolume !== undefined && s.volume < criteria.minVolume) return false;
    if (criteria.onlyPositive && s.changePercent <= 0) return false;
    return true;
  });
}

function sortStocks(stocks: StockRecord[], sortBy: keyof StockRecord, desc = true): StockRecord[] {
  return [...stocks].sort((a, b) => {
    const va = a[sortBy], vb = b[sortBy];
    if (typeof va === 'number' && typeof vb === 'number') {
      return desc ? vb - va : va - vb;
    }
    if (typeof va === 'string' && typeof vb === 'string') {
      return desc ? vb.localeCompare(va) : va.localeCompare(vb);
    }
    return 0;
  });
}

function computeStockStats(stocks: StockRecord[]): {
  avgPrice: number;
  totalVolume: number;
  avgChangePercent: number;
  upCount: number;
  downCount: number;
  flatCount: number;
  limitUp: number;
  limitDown: number;
} {
  if (stocks.length === 0) {
    return { avgPrice: 0, totalVolume: 0, avgChangePercent: 0, upCount: 0, downCount: 0, flatCount: 0, limitUp: 0, limitDown: 0 };
  }
  const sum = stocks.reduce((acc, s) => ({
    price: acc.price + s.price,
    volume: acc.volume + s.volume,
    change: acc.change + s.changePercent,
  }), { price: 0, volume: 0, change: 0 });

  return {
    avgPrice: Math.round(sum.price / stocks.length * 100) / 100,
    totalVolume: sum.volume,
    avgChangePercent: Math.round(sum.change / stocks.length * 100) / 100,
    upCount: stocks.filter(s => s.changePercent > 0).length,
    downCount: stocks.filter(s => s.changePercent < 0).length,
    flatCount: stocks.filter(s => s.changePercent === 0).length,
    limitUp: stocks.filter(s => s.changePercent >= 9.9).length,
    limitDown: stocks.filter(s => s.changePercent <= -9.9).length,
  };
}

function batchValidateStocks(records: Partial<StockRecord>[]): { valid: StockRecord[]; invalid: Partial<StockRecord>[] } {
  const valid: StockRecord[] = [];
  const invalid: Partial<StockRecord>[] = [];
  for (const rec of records) {
    const normalized = normalizeStockData(rec);
    if (normalized && validateStockCode(normalized.code)) {
      valid.push(normalized);
    } else {
      invalid.push(rec);
    }
  }
  return { valid, invalid };
}

describe('Stock Model Operations', () => {
  describe('Stock Code Validation', () => {
    it('should validate Shanghai 60xxxx codes', () => {
      expect(validateStockCode('600000')).toBe(true);
      expect(validateStockCode('601398')).toBe(true);
      expect(validateStockCode('688001')).toBe(true);
    });

    it('should validate Shenzhen 00xxxx codes', () => {
      expect(validateStockCode('000001')).toBe(true);
      expect(validateStockCode('002415')).toBe(true);
    });

    it('should validate ChiNext 30xxxx codes', () => {
      expect(validateStockCode('300001')).toBe(true);
      expect(validateStockCode('300750')).toBe(true);
    });

    it('should validate Beijing 83xxxx/43xxxx codes', () => {
      expect(validateStockCode('830001')).toBe(true);
      expect(validateStockCode('430001')).toBe(true);
    });

    it('should reject invalid codes', () => {
      expect(validateStockCode('')).toBe(false);
      expect(validateStockCode('12345')).toBe(false);
      expect(validateStockCode('999999')).toBe(false);
      expect(validateStockCode('abcdef')).toBe(false);
      expect(validateStockCode('  ')).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(validateStockCode(null as any)).toBe(false);
      expect(validateStockCode(undefined as any)).toBe(false);
    });

    it('should handle trimmed codes', () => {
      expect(validateStockCode('  600000  ')).toBe(true);
    });
  });

  describe('Stock Code Formatting', () => {
    it('should prefix Shanghai codes with sh', () => {
      expect(formatStockCode('600000')).toBe('sh600000');
      expect(formatStockCode('688001')).toBe('sh688001');
    });

    it('should prefix Shenzhen codes with sz', () => {
      expect(formatStockCode('000001')).toBe('sz000001');
      expect(formatStockCode('300001')).toBe('sz300001');
    });

    it('should prefix Beijing codes with bj', () => {
      expect(formatStockCode('830001')).toBe('bj830001');
    });

    it('should strip non-numeric chars', () => {
      expect(formatStockCode('sh.600.000')).toBe('sh600000');
    });

    it('should handle empty input', () => {
      expect(formatStockCode('')).toBe('');
    });

    it('should truncate long codes', () => {
      expect(formatStockCode('600000123')).toBe('sh600000');
    });
  });

  describe('Data Normalization', () => {
    it('should normalize valid raw data', () => {
      const raw = { code: '600000', name: '浦发银行', price: 10.5 };
      const result = normalizeStockData(raw);
      expect(result).not.toBeNull();
      expect(result!.code).toBe('600000');
      expect(result!.price).toBe(10.5);
    });

    it('should return null for missing required fields', () => {
      expect(normalizeStockData({ code: '600000' })).toBeNull();
      expect(normalizeStockData({ name: 'test' })).toBeNull();
      expect(normalizeStockData({})).toBeNull();
    });

    it('should default numeric fields to 0', () => {
      const result = normalizeStockData({ code: '000001', name: '平安银行' });
      expect(result!.volume).toBe(0);
      expect(result!.turnover).toBe(0);
      expect(result!.pe).toBe(0);
    });

    it('should default sector/industry to unknown', () => {
      const result = normalizeStockData({ code: '000001', name: 'test' });
      expect(result!.sector).toBe('unknown');
      expect(result!.industry).toBe('unknown');
    });

    it('should handle NaN numeric fields', () => {
      const result = normalizeStockData({ code: '000001', name: 'test', price: NaN });
      expect(result!.price).toBe(0);
    });

    it('should trim code and name', () => {
      const result = normalizeStockData({ code: '  600000  ', name: '  test  ' });
      expect(result!.code).toBe('600000');
      expect(result!.name).toBe('test');
    });
  });

  describe('Market Value Calculation', () => {
    it('should calculate market value correctly', () => {
      expect(calculateMarketValue(10, 1e9)).toBe(10e9);
    });

    it('should handle zero values', () => {
      expect(calculateMarketValue(0, 1e9)).toBe(0);
      expect(calculateMarketValue(10, 0)).toBe(0);
    });

    it('should reject negative values', () => {
      expect(calculateMarketValue(-1, 1e9)).toBe(0);
      expect(calculateMarketValue(10, -1)).toBe(0);
    });

    it('should round to 2 decimal places', () => {
      expect(calculateMarketValue(10.123, 100)).toBe(1012.3);
    });
  });

  describe('Market Cap Categorization', () => {
    it('should categorize large cap', () => {
      expect(categorizeByMarketCap(2000e8)).toBe('large');
      expect(categorizeByMarketCap(1000e8)).toBe('large');
    });

    it('should categorize mid cap', () => {
      expect(categorizeByMarketCap(500e8)).toBe('mid');
      expect(categorizeByMarketCap(200e8)).toBe('mid');
    });

    it('should categorize small cap', () => {
      expect(categorizeByMarketCap(100e8)).toBe('small');
      expect(categorizeByMarketCap(50e8)).toBe('small');
    });

    it('should categorize micro cap', () => {
      expect(categorizeByMarketCap(10e8)).toBe('micro');
      expect(categorizeByMarketCap(0)).toBe('micro');
    });
  });

  describe('Stock Deduplication', () => {
    const stocks: StockRecord[] = [
      { code: '600000', name: '浦发银行', price: 10, change: 0.5, changePercent: 5, volume: 1e8, turnover: 1e9, high: 10.5, low: 9.5, open: 9.8, prevClose: 9.5, pe: 5, pb: 0.8, marketCap: 200e8, sector: '金融', industry: '银行', listingDate: '2000-01-01' },
      { code: '600000', name: '浦发银行', price: 0, change: 0, changePercent: 0, volume: 0, turnover: 0, high: 0, low: 0, open: 0, prevClose: 9.5, pe: 0, pb: 0, marketCap: 0, sector: '金融', industry: '银行', listingDate: '2000-01-01' },
      { code: '000001', name: '平安银行', price: 15, change: 0.3, changePercent: 2, volume: 5e7, turnover: 7.5e8, high: 15.5, low: 14.5, open: 14.8, prevClose: 14.7, pe: 8, pb: 1.2, marketCap: 300e8, sector: '金融', industry: '银行', listingDate: '1991-01-01' },
    ];

    it('should remove duplicates keeping price>0', () => {
      const result = deduplicateStocks(stocks);
      expect(result).toHaveLength(2);
      const pufa = result.find(s => s.code === '600000');
      expect(pufa!.price).toBe(10);
    });

    it('should handle empty array', () => {
      expect(deduplicateStocks([])).toHaveLength(0);
    });

    it('should keep unique stocks', () => {
      const result = deduplicateStocks(stocks);
      expect(result.map(s => s.code).sort()).toEqual(['000001', '600000']);
    });
  });

  describe('Stock Filtering', () => {
    const stocks: StockRecord[] = [
      { code: '600000', name: '浦发银行', price: 10, change: 0.5, changePercent: 5, volume: 1e8, turnover: 1e9, high: 10.5, low: 9.5, open: 9.8, prevClose: 9.5, pe: 5, pb: 0.8, marketCap: 200e8, sector: '金融', industry: '银行', listingDate: '2000-01-01' },
      { code: '000001', name: '平安银行', price: 15, change: -0.3, changePercent: -2, volume: 5e7, turnover: 7.5e8, high: 15.5, low: 14.5, open: 14.8, prevClose: 15.3, pe: 8, pb: 1.2, marketCap: 300e8, sector: '金融', industry: '银行', listingDate: '1991-01-01' },
      { code: '300750', name: '宁德时代', price: 200, change: 10, changePercent: 5, volume: 3e7, turnover: 6e9, high: 210, low: 190, open: 195, prevClose: 190, pe: 30, pb: 5, marketCap: 5000e8, sector: '新能源', industry: '电池', listingDate: '2018-06-11' },
    ];

    it('should filter by price range', () => {
      const result = filterStocksByCriteria(stocks, { minPrice: 10, maxPrice: 100 });
      expect(result).toHaveLength(2);
    });

    it('should filter by sector', () => {
      const result = filterStocksByCriteria(stocks, { sector: '金融' });
      expect(result).toHaveLength(2);
    });

    it('should filter positive only', () => {
      const result = filterStocksByCriteria(stocks, { onlyPositive: true });
      expect(result).toHaveLength(2);
      expect(result.every(s => s.changePercent > 0)).toBe(true);
    });

    it('should filter by min volume', () => {
      const result = filterStocksByCriteria(stocks, { minVolume: 8e7 });
      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('600000');
    });

    it('should combine multiple filters', () => {
      const result = filterStocksByCriteria(stocks, { minPrice: 5, sector: '金融', onlyPositive: true });
      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('600000');
    });

    it('should return all with no criteria', () => {
      expect(filterStocksByCriteria(stocks, {})).toHaveLength(3);
    });
  });

  describe('Stock Sorting', () => {
    const stocks: StockRecord[] = [
      { code: '600000', name: '浦发银行', price: 10, change: 0.5, changePercent: 5, volume: 1e8, turnover: 1e9, high: 10.5, low: 9.5, open: 9.8, prevClose: 9.5, pe: 5, pb: 0.8, marketCap: 200e8, sector: '金融', industry: '银行', listingDate: '2000-01-01' },
      { code: '000001', name: '平安银行', price: 15, change: 0.3, changePercent: 2, volume: 5e7, turnover: 7.5e8, high: 15.5, low: 14.5, open: 14.8, prevClose: 14.7, pe: 8, pb: 1.2, marketCap: 300e8, sector: '金融', industry: '银行', listingDate: '1991-01-01' },
      { code: '300750', name: '宁德时代', price: 200, change: 10, changePercent: 5, volume: 3e7, turnover: 6e9, high: 210, low: 190, open: 195, prevClose: 190, pe: 30, pb: 5, marketCap: 5000e8, sector: '新能源', industry: '电池', listingDate: '2018-06-11' },
    ];

    it('should sort by price descending', () => {
      const result = sortStocks(stocks, 'price', true);
      expect(result[0].price).toBe(200);
      expect(result[2].price).toBe(10);
    });

    it('should sort by price ascending', () => {
      const result = sortStocks(stocks, 'price', false);
      expect(result[0].price).toBe(10);
      expect(result[2].price).toBe(200);
    });

    it('should sort by code string', () => {
      const result = sortStocks(stocks, 'code', false);
      expect(result[0].code).toBe('000001');
    });

    it('should sort by volume', () => {
      const result = sortStocks(stocks, 'volume', true);
      expect(result[0].volume).toBe(1e8);
    });

    it('should not mutate original array', () => {
      const original = [...stocks];
      sortStocks(stocks, 'price', true);
      expect(stocks[0].code).toBe(original[0].code);
    });
  });

  describe('Stock Statistics', () => {
    it('should compute stats for a stock list', () => {
      const stocks: StockRecord[] = [
        { code: '600000', name: 'A', price: 10, change: 0.5, changePercent: 5, volume: 1e8, turnover: 1e9, high: 10.5, low: 9.5, open: 9.8, prevClose: 9.5, pe: 5, pb: 0.8, marketCap: 200e8, sector: '金融', industry: '银行', listingDate: '2000-01-01' },
        { code: '000001', name: 'B', price: 20, change: -1, changePercent: -5, volume: 5e7, turnover: 1e9, high: 21, low: 19, open: 20.5, prevClose: 21, pe: 8, pb: 1.2, marketCap: 300e8, sector: '金融', industry: '银行', listingDate: '1991-01-01' },
        { code: '300750', name: 'C', price: 30, change: 3, changePercent: 10, volume: 3e7, turnover: 9e8, high: 31, low: 28, open: 28, prevClose: 27, pe: 30, pb: 5, marketCap: 500e8, sector: '新能源', industry: '电池', listingDate: '2018-06-11' },
      ];
      const stats = computeStockStats(stocks);
      expect(stats.avgPrice).toBe(20);
      expect(stats.upCount).toBe(2);
      expect(stats.downCount).toBe(1);
      expect(stats.flatCount).toBe(0);
      expect(stats.limitUp).toBe(1);
      expect(stats.limitDown).toBe(0);
      expect(stats.totalVolume).toBe(1.8e8);
    });

    it('should handle empty array', () => {
      const stats = computeStockStats([]);
      expect(stats.avgPrice).toBe(0);
      expect(stats.upCount).toBe(0);
    });

    it('should count limit-up correctly', () => {
      const stocks: StockRecord[] = [
        { code: '600000', name: 'A', price: 10, change: 0.99, changePercent: 9.9, volume: 1e8, turnover: 1e9, high: 10.99, low: 9, open: 9, prevClose: 9.01, pe: 5, pb: 0.8, marketCap: 200e8, sector: '金融', industry: '银行', listingDate: '2000-01-01' },
        { code: '000001', name: 'B', price: 20, change: 2.5, changePercent: 14.3, volume: 5e7, turnover: 1e9, high: 22.5, low: 17.5, open: 17.5, prevClose: 17.5, pe: 8, pb: 1.2, marketCap: 300e8, sector: '金融', industry: '银行', listingDate: '1991-01-01' },
      ];
      const stats = computeStockStats(stocks);
      expect(stats.limitUp).toBe(2);
    });
  });

  describe('Batch Validation', () => {
    it('should separate valid and invalid records', () => {
      const records = [
        { code: '600000', name: '浦发银行', price: 10 },
        { code: 'invalid', name: 'test' },
        { code: '000001', name: '平安银行', price: 15 },
        { code: '12345', name: 'bad' },
      ];
      const { valid, invalid } = batchValidateStocks(records);
      expect(valid).toHaveLength(2);
      expect(invalid).toHaveLength(2);
    });

    it('should handle empty input', () => {
      const { valid, invalid } = batchValidateStocks([]);
      expect(valid).toHaveLength(0);
      expect(invalid).toHaveLength(0);
    });

    it('should reject records with missing name', () => {
      const { valid, invalid } = batchValidateStocks([
        { code: '600000' },
        { code: '600000', name: '' },
      ]);
      expect(valid).toHaveLength(0);
      expect(invalid).toHaveLength(2);
    });
  });
});
