import { describe, it, expect } from 'vitest';

// 股票筛选器引擎
describe('股票筛选器引擎', () => {
  interface Stock { symbol: string; name: string; price: number; change: number; pe: number; marketCap: number; volume: number; industry: string }

  function filterByPriceRange(stocks: Stock[], min: number, max: number): Stock[] {
    return stocks.filter(s => s.price >= min && s.price <= max);
  }

  function filterByChange(stocks: Stock[], minChange: number): Stock[] {
    return stocks.filter(s => s.change >= minChange);
  }

  function filterByPE(stocks: Stock[], maxPE: number): Stock[] {
    return stocks.filter(s => s.pe > 0 && s.pe <= maxPE);
  }

  function filterByMarketCap(stocks: Stock[], minCap: number): Stock[] {
    return stocks.filter(s => s.marketCap >= minCap);
  }

  function filterByIndustry(stocks: Stock[], industry: string): Stock[] {
    return stocks.filter(s => s.industry === industry);
  }

  function sortByField(stocks: Stock[], field: keyof Stock, asc: boolean = true): Stock[] {
    return [...stocks].sort((a, b) => {
      const va = a[field], vb = b[field];
      if (typeof va === 'number' && typeof vb === 'number') {
        return asc ? va - vb : vb - va;
      }
      return asc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }

  function compositeFilter(stocks: Stock[], criteria: { minPrice?: number; maxPE?: number; minChange?: number; industry?: string }): Stock[] {
    return stocks.filter(s => {
      if (criteria.minPrice !== undefined && s.price < criteria.minPrice) return false;
      if (criteria.maxPE !== undefined && (s.pe <= 0 || s.pe > criteria.maxPE)) return false;
      if (criteria.minChange !== undefined && s.change < criteria.minChange) return false;
      if (criteria.industry !== undefined && s.industry !== criteria.industry) return false;
      return true;
    });
  }

  function paginated<T>(items: T[], page: number, pageSize: number): T[] {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }

  const sample: Stock[] = [
    { symbol: '001', name: 'A', price: 10, change: 5, pe: 15, marketCap: 1000, volume: 5000, industry: '科技' },
    { symbol: '002', name: 'B', price: 50, change: -2, pe: 25, marketCap: 5000, volume: 3000, industry: '银行' },
    { symbol: '003', name: 'C', price: 100, change: 8, pe: 10, marketCap: 2000, volume: 8000, industry: '科技' },
    { symbol: '004', name: 'D', price: 5, change: 0, pe: -5, marketCap: 500, volume: 1000, industry: '医药' },
  ];

  it('应按价格区间筛选', () => {
    expect(filterByPriceRange(sample, 10, 50)).toHaveLength(2);
  });

  it('应按涨跌幅筛选', () => {
    expect(filterByChange(sample, 5)).toHaveLength(2);
  });

  it('应按PE筛选', () => {
    expect(filterByPE(sample, 20)).toHaveLength(2);
  });

  it('负PE应被排除', () => {
    const result = filterByPE(sample, 100);
    expect(result.find(s => s.pe < 0)).toBeUndefined();
  });

  it('应按市值筛选', () => {
    expect(filterByMarketCap(sample, 1000)).toHaveLength(3);
  });

  it('应按行业筛选', () => {
    expect(filterByIndustry(sample, '科技')).toHaveLength(2);
  });

  it('应按字段排序', () => {
    const sorted = sortByField(sample, 'price', true);
    expect(sorted[0]!.price).toBeLessThanOrEqual(sorted[1]!.price);
  });

  it('降序排序应正确', () => {
    const sorted = sortByField(sample, 'price', false);
    expect(sorted[0]!.price).toBeGreaterThanOrEqual(sorted[1]!.price);
  });

  it('应支持复合筛选', () => {
    const result = compositeFilter(sample, { minPrice: 10, maxPE: 20, minChange: 0 });
    expect(result).toHaveLength(2);
    expect(result.map(s => s.symbol)).toEqual(expect.arrayContaining(['001', '003']));
  });

  it('无条件复合筛选应返回全部', () => {
    expect(compositeFilter(sample, {})).toHaveLength(4);
  });

  it('应支持分页', () => {
    expect(paginated(sample, 1, 2)).toHaveLength(2);
    expect(paginated(sample, 2, 2)).toHaveLength(2);
  });

  it('超出页码应返回空', () => {
    expect(paginated(sample, 10, 2)).toHaveLength(0);
  });

  it('空数据筛选应返回空', () => {
    expect(filterByPriceRange([], 0, 100)).toHaveLength(0);
  });

  it('大量数据筛选应正确', () => {
    const big: Stock[] = Array.from({ length: 1000 }, (_, i) => ({
      symbol: `${i}`, name: `S${i}`, price: i, change: (i % 20) - 10,
      pe: i % 30, marketCap: i * 100, volume: i * 10, industry: i % 2 === 0 ? 'A' : 'B',
    }));
    expect(filterByChange(big, 5)).toHaveLength(250);
    expect(filterByIndustry(big, 'A')).toHaveLength(500);
  });

  it('单条数据应正确筛选', () => {
    const one = [sample[0]!];
    expect(filterByPriceRange(one, 0, 100)).toHaveLength(1);
    expect(filterByChange(one, 10)).toHaveLength(0);
  });
});

// 数据聚合引擎
describe('数据聚合引擎', () => {
  interface Trade { price: number; quantity: number; timestamp: number; side: 'buy' | 'sell' }

  function vwap(trades: Trade[]): number {
    if (trades.length === 0) return 0;
    const totalValue = trades.reduce((s, t) => s + t.price * t.quantity, 0);
    const totalQty = trades.reduce((s, t) => s + t.quantity, 0);
    return totalQty > 0 ? totalValue / totalQty : 0;
  }

  function twap(trades: Trade[]): number {
    if (trades.length === 0) return 0;
    return trades.reduce((s, t) => s + t.price, 0) / trades.length;
  }

  function ohlc(trades: Trade[]): { open: number; high: number; low: number; close: number } | null {
    if (trades.length === 0) return null;
    const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);
    return {
      open: sorted[0]!.price,
      high: Math.max(...trades.map(t => t.price)),
      low: Math.min(...trades.map(t => t.price)),
      close: sorted[sorted.length - 1]!.price,
    };
  }

  function buySellRatio(trades: Trade[]): number {
    const buys = trades.filter(t => t.side === 'buy').reduce((s, t) => s + t.quantity, 0);
    const sells = trades.filter(t => t.side === 'sell').reduce((s, t) => s + t.quantity, 0);
    return sells > 0 ? buys / sells : buys > 0 ? Infinity : 1;
  }

  function tradeVelocity(trades: Trade[], windowMs: number): number {
    if (trades.length < 2) return 0;
    const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);
    const duration = sorted[sorted.length - 1]!.timestamp - sorted[0]!.timestamp;
    return duration > 0 ? (trades.length / duration) * windowMs : 0;
  }

  function priceRange(trades: Trade[]): { min: number; max: number; range: number } {
    const prices = trades.map(t => t.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return { min, max, range: max - min };
  }

  it('应计算VWAP', () => {
    const trades: Trade[] = [
      { price: 10, quantity: 100, timestamp: 1, side: 'buy' },
      { price: 12, quantity: 200, timestamp: 2, side: 'sell' },
    ];
    expect(vwap(trades)).toBeCloseTo((10 * 100 + 12 * 200) / 300);
  });

  it('应计算TWAP', () => {
    const trades: Trade[] = [
      { price: 10, quantity: 100, timestamp: 1, side: 'buy' },
      { price: 14, quantity: 200, timestamp: 2, side: 'sell' },
    ];
    expect(twap(trades)).toBe(12);
  });

  it('空交易VWAP应为0', () => {
    expect(vwap([])).toBe(0);
  });

  it('空交易TWAP应为0', () => {
    expect(twap([])).toBe(0);
  });

  it('应计算OHLC', () => {
    const trades: Trade[] = [
      { price: 10, quantity: 100, timestamp: 1, side: 'buy' },
      { price: 12, quantity: 50, timestamp: 3, side: 'buy' },
      { price: 9, quantity: 80, timestamp: 2, side: 'sell' },
    ];
    const result = ohlc(trades);
    expect(result).toEqual({ open: 10, high: 12, low: 9, close: 12 });
  });

  it('空交易OHLC应为null', () => {
    expect(ohlc([])).toBeNull();
  });

  it('应计算买卖比', () => {
    const trades: Trade[] = [
      { price: 10, quantity: 300, timestamp: 1, side: 'buy' },
      { price: 10, quantity: 100, timestamp: 2, side: 'sell' },
    ];
    expect(buySellRatio(trades)).toBe(3);
  });

  it('全部买入买卖比应为Infinity', () => {
    const trades: Trade[] = [{ price: 10, quantity: 100, timestamp: 1, side: 'buy' }];
    expect(buySellRatio(trades)).toBe(Infinity);
  });

  it('应计算交易速度', () => {
    const trades: Trade[] = [
      { price: 10, quantity: 1, timestamp: 0, side: 'buy' },
      { price: 10, quantity: 1, timestamp: 1000, side: 'buy' },
      { price: 10, quantity: 1, timestamp: 2000, side: 'buy' },
    ];
    expect(tradeVelocity(trades, 1000)).toBeCloseTo(1.5);
  });

  it('应计算价格区间', () => {
    const trades: Trade[] = [
      { price: 10, quantity: 1, timestamp: 1, side: 'buy' },
      { price: 15, quantity: 1, timestamp: 2, side: 'buy' },
      { price: 8, quantity: 1, timestamp: 3, side: 'sell' },
    ];
    const range = priceRange(trades);
    expect(range.min).toBe(8);
    expect(range.max).toBe(15);
    expect(range.range).toBe(7);
  });

  it('单笔交易速度应为0', () => {
    const trades: Trade[] = [{ price: 10, quantity: 1, timestamp: 1, side: 'buy' }];
    expect(tradeVelocity(trades, 1000)).toBe(0);
  });

  it('等价交易VWAP应等于价格', () => {
    const trades: Trade[] = [
      { price: 10, quantity: 100, timestamp: 1, side: 'buy' },
      { price: 10, quantity: 200, timestamp: 2, side: 'sell' },
    ];
    expect(vwap(trades)).toBe(10);
  });
});

// 价格预测模型评估
describe('模型评估引擎', () => {
  function mse(actual: number[], predicted: number[]): number {
    if (actual.length === 0 || actual.length !== predicted.length) return 0;
    return actual.reduce((s, a, i) => s + (a - predicted[i]!) ** 2, 0) / actual.length;
  }

  function mae(actual: number[], predicted: number[]): number {
    if (actual.length === 0 || actual.length !== predicted.length) return 0;
    return actual.reduce((s, a, i) => s + Math.abs(a - predicted[i]!), 0) / actual.length;
  }

  function rmse(actual: number[], predicted: number[]): number {
    return Math.sqrt(mse(actual, predicted));
  }

  function r2(actual: number[], predicted: number[]): number {
    if (actual.length === 0) return 0;
    const mean = actual.reduce((s, v) => s + v, 0) / actual.length;
    const ssRes = actual.reduce((s, a, i) => s + (a - predicted[i]!) ** 2, 0);
    const ssTot = actual.reduce((s, a) => s + (a - mean) ** 2, 0);
    return ssTot > 0 ? 1 - ssRes / ssTot : 0;
  }

  function mape(actual: number[], predicted: number[]): number {
    if (actual.length === 0) return 0;
    return actual.reduce((s, a, i) => s + Math.abs(a > 0 ? (a - predicted[i]!) / a : 0), 0) / actual.length * 100;
  }

  function accuracy(predictions: boolean[], actuals: boolean[]): number {
    if (predictions.length === 0) return 0;
    const correct = predictions.filter((p, i) => p === actuals[i]).length;
    return correct / predictions.length;
  }

  it('完美预测MSE应为0', () => {
    expect(mse([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it('应计算MSE', () => {
    expect(mse([1, 2, 3], [1.1, 2.1, 3.1])).toBeCloseTo(0.01);
  });

  it('应计算MAE', () => {
    expect(mae([10, 20, 30], [12, 18, 33])).toBeCloseTo(2.333, 2);
  });

  it('完美预测MAE应为0', () => {
    expect(mae([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it('应计算RMSE', () => {
    expect(rmse([1, 2, 3], [1.1, 2.1, 3.1])).toBeCloseTo(0.1);
  });

  it('应计算R²', () => {
    const actual = [1, 2, 3, 4, 5];
    const predicted = [1.1, 1.9, 3.1, 3.9, 5.1];
    expect(r2(actual, predicted)).toBeGreaterThan(0.95);
  });

  it('完美预测R²应为1', () => {
    expect(r2([1, 2, 3], [1, 2, 3])).toBe(1);
  });

  it('应计算MAPE', () => {
    expect(mape([100, 200], [110, 180])).toBeCloseTo(10);
  });

  it('应计算准确率', () => {
    expect(accuracy([true, true, false, false], [true, false, false, true])).toBe(0.5);
  });

  it('完美准确率应为1', () => {
    expect(accuracy([true, false], [true, false])).toBe(1);
  });

  it('空数据MSE应为0', () => {
    expect(mse([], [])).toBe(0);
  });

  it('空数据准确率应为0', () => {
    expect(accuracy([], [])).toBe(0);
  });

  it('大量数据应正确计算', () => {
    const actual = Array.from({ length: 1000 }, (_, i) => i);
    const predicted = Array.from({ length: 1000 }, (_, i) => i + 0.5);
    expect(mse(actual, predicted)).toBe(0.25);
    expect(mae(actual, predicted)).toBe(0.5);
  });
});
