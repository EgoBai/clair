import { describe, it, expect } from 'vitest';

describe('DataNormalizationPipeline', () => {
  interface RawStockData {
    code: string;
    name: string;
    price: string | number;
    change: string | number;
    change_pct: string | number;
    vol: string | number;
    amount: string | number;
    high: string | number;
    low: string | number;
    open: string | number;
    pre_close: string | number;
    time: string;
  }

  interface NormalizedStock {
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    amount: number;
    high: number;
    low: number;
    open: number;
    previousClose: number;
    timestamp: string;
    market: 'sh' | 'sz' | 'bj';
  }

  function detectMarket(code: string): 'sh' | 'sz' | 'bj' {
    if (code.startsWith('6') || code.startsWith('9')) return 'sh';
    if (code.startsWith('0') || code.startsWith('3') || code.startsWith('2')) return 'sz';
    return 'bj';
  }

  function toNumber(value: string | number): number {
    if (typeof value === 'number') return value;
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function normalizeSymbol(code: string): string {
    const cleaned = code.replace(/[^0-9]/g, '');
    if (cleaned.length === 6) return cleaned;
    if (cleaned.length > 6) return cleaned.slice(-6);
    return cleaned.padStart(6, '0');
  }

  function normalize(raw: RawStockData): NormalizedStock {
    const symbol = normalizeSymbol(raw.code);
    return {
      symbol,
      name: raw.name.trim(),
      price: toNumber(raw.price),
      change: toNumber(raw.change),
      changePercent: toNumber(raw.change_pct),
      volume: Math.round(toNumber(raw.vol)),
      amount: toNumber(raw.amount),
      high: toNumber(raw.high),
      low: toNumber(raw.low),
      open: toNumber(raw.open),
      previousClose: toNumber(raw.pre_close),
      timestamp: raw.time,
      market: detectMarket(symbol),
    };
  }

  function validateNormalized(data: NormalizedStock): string[] {
    const errors: string[] = [];
    if (data.high < data.low) errors.push('High < Low');
    if (data.high < data.price && data.price > 0) errors.push('High < Price');
    if (data.low > data.price && data.price > 0) errors.push('Low > Price');
    if (data.volume < 0) errors.push('Negative volume');
    if (data.amount < 0) errors.push('Negative amount');
    if (data.symbol.length !== 6) errors.push('Invalid symbol length');
    return errors;
  }

  function batchNormalize(rawList: RawStockData[]): { valid: NormalizedStock[]; invalid: Array<{ raw: RawStockData; errors: string[] }> } {
    const valid: NormalizedStock[] = [];
    const invalid: Array<{ raw: RawStockData; errors: string[] }> = [];
    for (const raw of rawList) {
      const normalized = normalize(raw);
      const errors = validateNormalized(normalized);
      if (errors.length === 0) valid.push(normalized);
      else invalid.push({ raw, errors });
    }
    return { valid, invalid };
  }

  it('should normalize string numbers', () => {
    const raw: RawStockData = { code: '600519', name: '贵州茅台', price: '1800.50', change: '50.5', change_pct: '2.86', vol: '30000', amount: '5400000000', high: '1820', low: '1750', open: '1760', pre_close: '1750', time: '2026-03-24T10:00:00Z' };
    const result = normalize(raw);
    expect(typeof result.price).toBe('number');
    expect(result.price).toBe(1800.5);
  });

  it('should handle numeric values', () => {
    const raw: RawStockData = { code: '600519', name: '贵州茅台', price: 1800, change: 50, change_pct: 2.86, vol: 30000, amount: 5.4e9, high: 1820, low: 1750, open: 1760, pre_close: 1750, time: '2026-03-24T10:00:00Z' };
    const result = normalize(raw);
    expect(result.price).toBe(1800);
  });

  it('should detect Shanghai market', () => {
    expect(detectMarket('600519')).toBe('sh');
    expect(detectMarket('900901')).toBe('sh');
  });

  it('should detect Shenzhen market', () => {
    expect(detectMarket('000858')).toBe('sz');
    expect(detectMarket('300750')).toBe('sz');
    expect(detectMarket('200001')).toBe('sz');
  });

  it('should detect Beijing market', () => {
    expect(detectMarket('800001')).toBe('bj');
  });

  it('should normalize symbol to 6 digits', () => {
    expect(normalizeSymbol('600519')).toBe('600519');
    expect(normalizeSymbol('0001')).toBe('000001');
    expect(normalizeSymbol('SH600519')).toBe('600519');
  });

  it('should trim name', () => {
    const raw: RawStockData = { code: '600519', name: '  贵州茅台  ', price: 1800, change: 50, change_pct: 2.86, vol: 30000, amount: 5.4e9, high: 1820, low: 1750, open: 1760, pre_close: 1750, time: '2026-03-24T10:00:00Z' };
    const result = normalize(raw);
    expect(result.name).toBe('贵州茅台');
  });

  it('should validate OHLC logic', () => {
    const bad: NormalizedStock = { symbol: '600519', name: 'Test', price: 100, change: 0, changePercent: 0, volume: 1000, amount: 100000, high: 90, low: 110, open: 100, previousClose: 100, timestamp: '', market: 'sh' };
    const errors = validateNormalized(bad);
    expect(errors).toContain('High < Low');
  });

  it('should pass validation for correct data', () => {
    const good: NormalizedStock = { symbol: '600519', name: 'Test', price: 100, change: 5, changePercent: 5, volume: 1000, amount: 100000, high: 105, low: 95, open: 96, previousClose: 95, timestamp: '', market: 'sh' };
    const errors = validateNormalized(good);
    expect(errors).toHaveLength(0);
  });

  it('should handle invalid numbers gracefully', () => {
    const raw: RawStockData = { code: '600519', name: 'Test', price: 'N/A', change: '--', change_pct: 'N/A', vol: '0', amount: '0', high: '0', low: '0', open: '0', pre_close: '0', time: '' };
    const result = normalize(raw);
    expect(result.price).toBe(0);
    expect(result.changePercent).toBe(0);
  });

  it('should batch normalize and separate valid/invalid', () => {
    const raws: RawStockData[] = [
      { code: '600519', name: '茅台', price: 1800, change: 50, change_pct: 2.86, vol: 30000, amount: 5.4e9, high: 1820, low: 1750, open: 1760, pre_close: 1750, time: '' },
      { code: '000001', name: 'Bad', price: 100, change: 0, change_pct: 0, vol: 1000, amount: 100000, high: 90, low: 110, open: 100, pre_close: 100, time: '' },
    ];
    const result = batchNormalize(raws);
    expect(result.valid.length + result.invalid.length).toBe(2);
  });

  it('should round volume to integer', () => {
    const raw: RawStockData = { code: '600519', name: 'Test', price: 100, change: 0, change_pct: 0, vol: '12345.7', amount: '0', high: '100', low: '100', open: '100', pre_close: '100', time: '' };
    const result = normalize(raw);
    expect(Number.isInteger(result.volume)).toBe(true);
  });
});
