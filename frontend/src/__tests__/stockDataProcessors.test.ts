/**
 * 股票数据处理与格式化测试
 */
import { describe, it, expect } from 'vitest';

interface RawStock {
  code: string;
  name: string;
  price: number;
  prev_close: number;
  volume: number;
  turnover: number;
  high: number;
  low: number;
  pe: number | null;
  pb: number | null;
  total_mv: number;
  circ_mv: number;
}

interface ProcessedStock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  turnover: number;
  high: number;
  low: number;
  pe: number | null;
  pb: number | null;
  marketCap: number;
  floatMarketCap: number;
  turnoverRate: number;
  amplitude: number;
}

function processStock(raw: RawStock, totalShares: number): ProcessedStock {
  const change = raw.price - raw.prev_close;
  const changePercent = raw.prev_close > 0 ? (change / raw.prev_close) * 100 : 0;
  const amplitude = raw.prev_close > 0 ? ((raw.high - raw.low) / raw.prev_close) * 100 : 0;
  const turnoverRate = totalShares > 0 ? (raw.volume / totalShares) * 100 : 0;

  return {
    symbol: raw.code,
    name: raw.name,
    price: raw.price,
    change,
    changePercent,
    volume: raw.volume,
    turnover: raw.turnover,
    high: raw.high,
    low: raw.low,
    pe: raw.pe,
    pb: raw.pb,
    marketCap: raw.total_mv,
    floatMarketCap: raw.circ_mv,
    turnoverRate,
    amplitude,
  };
}

function getMarketType(code: string): 'SH' | 'SZ' | 'BJ' | 'UNKNOWN' {
  if (code.startsWith('6') || code.startsWith('9')) return 'SH';
  if (code.startsWith('0') || code.startsWith('3') || code.startsWith('2')) return 'SZ';
  if (code.startsWith('4') || code.startsWith('8')) return 'BJ';
  return 'UNKNOWN';
}

function getBoardType(code: string): '主板' | '创业板' | '科创板' | '北交所' | '未知' {
  if (code.startsWith('688')) return '科创板';
  if (code.startsWith('300') || code.startsWith('301')) return '创业板';
  if (code.startsWith('8') || code.startsWith('4')) return '北交所';
  if (code.startsWith('6') || code.startsWith('0')) return '主板';
  return '未知';
}

function filterStocksByCriteria(stocks: ProcessedStock[], criteria: {
  minPrice?: number;
  maxPrice?: number;
  minChange?: number;
  maxChange?: number;
  minVolume?: number;
  markets?: string[];
}): ProcessedStock[] {
  return stocks.filter(s => {
    if (criteria.minPrice !== undefined && s.price < criteria.minPrice) return false;
    if (criteria.maxPrice !== undefined && s.price > criteria.maxPrice) return false;
    if (criteria.minChange !== undefined && s.changePercent < criteria.minChange) return false;
    if (criteria.maxChange !== undefined && s.changePercent > criteria.maxChange) return false;
    if (criteria.minVolume !== undefined && s.volume < criteria.minVolume) return false;
    if (criteria.markets && !criteria.markets.includes(getMarketType(s.symbol))) return false;
    return true;
  });
}

function sortStocks(stocks: ProcessedStock[], key: keyof ProcessedStock, order: 'asc' | 'desc' = 'desc'): ProcessedStock[] {
  return [...stocks].sort((a, b) => {
    const va = a[key] as number;
    const vb = b[key] as number;
    return order === 'desc' ? vb - va : va - vb;
  });
}

describe('股票数据处理', () => {
  const rawStock: RawStock = {
    code: '600519',
    name: '贵州茅台',
    price: 1800,
    prev_close: 1750,
    volume: 50000,
    turnover: 90000000,
    high: 1820,
    low: 1740,
    pe: 35.5,
    pb: 12.3,
    total_mv: 2260000000000,
    circ_mv: 2260000000000,
  };

  describe('股票数据处理', () => {
    it('涨跌幅计算', () => {
      const processed = processStock(rawStock, 1256000000);
      expect(processed.changePercent).toBeCloseTo(2.857, 1);
    });

    it('涨跌额计算', () => {
      const processed = processStock(rawStock, 1256000000);
      expect(processed.change).toBe(50);
    });

    it('振幅计算', () => {
      const processed = processStock(rawStock, 1256000000);
      expect(processed.amplitude).toBeCloseTo(4.57, 1);
    });

    it('换手率计算', () => {
      const processed = processStock(rawStock, 1256000000);
      expect(processed.turnoverRate).toBeCloseTo(0.00398, 3);
    });

    it('零昨收处理', () => {
      const zeroPrev = { ...rawStock, prev_close: 0 };
      const processed = processStock(zeroPrev, 1000);
      expect(processed.changePercent).toBe(0);
      expect(processed.amplitude).toBe(0);
    });

    it('PE/PB保留null', () => {
      const noPE = { ...rawStock, pe: null, pb: null };
      const processed = processStock(noPE, 1000);
      expect(processed.pe).toBeNull();
      expect(processed.pb).toBeNull();
    });
  });

  describe('市场类型判断', () => {
    it('沪市', () => {
      expect(getMarketType('600519')).toBe('SH');
      expect(getMarketType('900901')).toBe('SH');
    });

    it('深市', () => {
      expect(getMarketType('000858')).toBe('SZ');
      expect(getMarketType('300750')).toBe('SZ');
      expect(getMarketType('200001')).toBe('SZ');
    });

    it('北交所', () => {
      expect(getMarketType('830001')).toBe('BJ');
      expect(getMarketType('430001')).toBe('BJ');
    });

    it('未知', () => {
      expect(getMarketType('500001')).toBe('UNKNOWN');
    });
  });

  describe('板块类型判断', () => {
    it('科创板', () => {
      expect(getBoardType('688001')).toBe('科创板');
    });

    it('创业板', () => {
      expect(getBoardType('300750')).toBe('创业板');
      expect(getBoardType('301001')).toBe('创业板');
    });

    it('北交所', () => {
      expect(getBoardType('830001')).toBe('北交所');
    });

    it('主板', () => {
      expect(getBoardType('600519')).toBe('主板');
      expect(getBoardType('000858')).toBe('主板');
    });
  });

  describe('筛选', () => {
    const processed = processStock(rawStock, 1256000000);
    const stocks = [processed];

    it('价格筛选', () => {
      expect(filterStocksByCriteria(stocks, { minPrice: 1700 })).toHaveLength(1);
      expect(filterStocksByCriteria(stocks, { minPrice: 1900 })).toHaveLength(0);
    });

    it('涨跌幅筛选', () => {
      expect(filterStocksByCriteria(stocks, { minChange: 2 })).toHaveLength(1);
      expect(filterStocksByCriteria(stocks, { minChange: 5 })).toHaveLength(0);
    });

    it('市场筛选', () => {
      expect(filterStocksByCriteria(stocks, { markets: ['SH'] })).toHaveLength(1);
      expect(filterStocksByCriteria(stocks, { markets: ['SZ'] })).toHaveLength(0);
    });

    it('空条件全选', () => {
      expect(filterStocksByCriteria(stocks, {})).toHaveLength(1);
    });
  });

  describe('排序', () => {
    const stocks = [
      processStock({ ...rawStock, code: '600519', price: 1800 }, 1e9),
      processStock({ ...rawStock, code: '000858', name: '五粮液', price: 168 }, 1e9),
    ];

    it('降序排序', () => {
      const sorted = sortStocks(stocks, 'price', 'desc');
      expect(sorted[0].symbol).toBe('600519');
    });

    it('升序排序', () => {
      const sorted = sortStocks(stocks, 'price', 'asc');
      expect(sorted[0].symbol).toBe('000858');
    });

    it('不修改原数组', () => {
      const original = [...stocks];
      sortStocks(stocks, 'price', 'asc');
      expect(stocks[0].symbol).toBe(original[0].symbol);
    });
  });
});
