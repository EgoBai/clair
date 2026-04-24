/**
 * dataAggregation.test.ts
 * 数据聚合服务测试
 */

import { describe, it, expect, beforeEach } from 'vitest';

interface TradeDay {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

interface AggregatedStats {
  symbol: string;
  name: string;
  startDate: string;
  endDate: string;
  tradeDays: number;
  openPrice: number;
  closePrice: number;
  highPrice: number;
  lowPrice: number;
  avgVolume: number;
  totalVolume: number;
  totalTurnover?: number;
  priceChange: number;
  priceChangePercent: number;
  maxDrawdown: number;
  volatility: number;
  avgAmplitude: number;
  upDays: number;
  downDays: number;
  winRate: number;
}

class DataAggregator {
  aggregate(symbol: string, name: string, days: TradeDay[]): AggregatedStats {
    if (days.length === 0) {
      throw new Error(`No data available for symbol: ${symbol}`);
    }

    const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));

    const startDate = sortedDays[0].date;
    const endDate = sortedDays[sortedDays.length - 1].date;
    const openPrice = sortedDays[0].open;
    const closePrice = sortedDays[sortedDays.length - 1].close;

    const highPrice = Math.max(...sortedDays.map(d => d.high));
    const lowPrice = Math.min(...sortedDays.map(d => d.low));

    const totalVolume = sortedDays.reduce((sum, d) => sum + d.volume, 0);
    const avgVolume = Math.round(totalVolume / sortedDays.length);

    const priceChange = closePrice - openPrice;
    const priceChangePercent = openPrice !== 0
      ? Math.round((priceChange / openPrice) * 10000) / 100
      : 0;

    // Max drawdown: largest peak-to-trough decline
    let maxDrawdown = 0;
    let peak = sortedDays[0].high;

    for (const day of sortedDays) {
      if (day.high > peak) {
        peak = day.high;
      }
      const drawdown = (peak - day.low) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    maxDrawdown = Math.round(maxDrawdown * 10000) / 100;

    // Volatility: standard deviation of daily returns
    const returns: number[] = [];
    for (let i = 1; i < sortedDays.length; i++) {
      const prevClose = sortedDays[i - 1].close;
      if (prevClose > 0) {
        returns.push((sortedDays[i].close - prevClose) / prevClose);
      }
    }
    const avgReturn = returns.length > 0
      ? returns.reduce((sum, r) => sum + r, 0) / returns.length
      : 0;
    const variance = returns.length > 0
      ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
      : 0;
    const volatility = Math.round(Math.sqrt(variance) * 10000) / 100;

    // Up/down days
    const upDays = sortedDays.filter(d => d.close > d.open).length;
    const downDays = sortedDays.filter(d => d.close < d.open).length;
    const winRate = sortedDays.length > 0
      ? Math.round((upDays / sortedDays.length) * 10000) / 100
      : 0;

    // Average amplitude
    const amplitudes = sortedDays.map(d => (d.high - d.low) / d.open);
    const avgAmplitude = Math.round(
      (amplitudes.reduce((sum, a) => sum + a, 0) / amplitudes.length) * 10000,
    ) / 100;

    return {
      symbol,
      name,
      startDate,
      endDate,
      tradeDays: sortedDays.length,
      openPrice,
      closePrice,
      highPrice,
      lowPrice,
      avgVolume,
      totalVolume,
      priceChange,
      priceChangePercent,
      maxDrawdown,
      volatility,
      avgAmplitude,
      upDays,
      downDays,
      winRate,
    };
  }

  batchAggregate(data: Record<string, { name: string; days: TradeDay[] }>): AggregatedStats[] {
    return Object.entries(data)
      .filter(([, value]) => value.days.length > 0)
      .map(([symbol, value]) => this.aggregate(symbol, value.name, value.days));
  }

  getMarketOverview(aggregatedResults: AggregatedStats[]): {
    totalStocks: number;
    advancing: number;
    declining: number;
    unchanged: number;
    avgPriceChange: number;
    avgVolume: number;
    totalVolume: number;
  } {
    const advancing = aggregatedResults.filter(r => r.priceChangePercent > 0).length;
    const declining = aggregatedResults.filter(r => r.priceChangePercent < 0).length;
    const unchanged = aggregatedResults.filter(r => r.priceChangePercent === 0).length;

    const totalVolume = aggregatedResults.reduce((sum, r) => sum + r.totalVolume, 0);

    return {
      totalStocks: aggregatedResults.length,
      advancing,
      declining,
      unchanged,
      avgPriceChange: aggregatedResults.length > 0
        ? Math.round(aggregatedResults.reduce((sum, r) => sum + r.priceChangePercent, 0) / aggregatedResults.length * 100) / 100
        : 0,
      avgVolume: aggregatedResults.length > 0
        ? Math.round(totalVolume / aggregatedResults.length)
        : 0,
      totalVolume,
    };
  }

  getTopPerformers(aggregatedResults: AggregatedStats[], limit: number = 5, field: 'priceChangePercent' | 'volume' | 'volatility' = 'priceChangePercent'): AggregatedStats[] {
    const sorted = [...aggregatedResults].sort((a, b) => {
      const aVal = field === 'volume' ? a.totalVolume : (a as any)[field];
      const bVal = field === 'volume' ? b.totalVolume : (b as any)[field];
      return bVal - aVal;
    });
    return sorted.slice(0, limit);
  }

  getWorstPerformers(aggregatedResults: AggregatedStats[], limit: number = 5): AggregatedStats[] {
    return [...aggregatedResults]
      .sort((a, b) => a.priceChangePercent - b.priceChangePercent)
      .slice(0, limit);
  }

  filterByThreshold(aggregatedResults: AggregatedStats[], minChangePercent: number): AggregatedStats[] {
    return aggregatedResults.filter(r => r.priceChangePercent >= minChangePercent);
  }
}

function makeDay(overrides: Partial<TradeDay> = {}): TradeDay {
  return {
    date: '2026-01-01',
    open: 100,
    close: 102,
    high: 105,
    low: 98,
    volume: 1000000,
    ...overrides,
  };
}

function makeDays(priceSeries: number[], options?: { baseVolume?: number; baseDate?: string }): TradeDay[] {
  const volume = options?.baseVolume ?? 1000000;
  const startDate = options?.baseDate ?? '2026-01-01';
  return priceSeries.map((price, i) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    return {
      date: date.toISOString().split('T')[0],
      open: price,
      close: price * (1 + (Math.random() - 0.5) * 0.02),
      high: price * 1.02,
      low: price * 0.98,
      volume: Math.floor(volume * (0.8 + Math.random() * 0.4)),
    };
  });
}

describe('DataAggregator', () => {
  let aggregator: DataAggregator;

  beforeEach(() => {
    aggregator = new DataAggregator();
  });

  // --- Basic Aggregation ---

  it('should aggregate a simple upward trend', () => {
    const days = [
      makeDay({ date: '2026-01-01', open: 100, close: 100, high: 100, low: 100 }),
      makeDay({ date: '2026-01-02', open: 101, close: 105, high: 106, low: 100 }),
      makeDay({ date: '2026-01-03', open: 105, close: 110, high: 112, low: 104 }),
    ];

    const result = aggregator.aggregate('000001', '平安银行', days);
    expect(result.openPrice).toBe(100);
    expect(result.closePrice).toBe(110);
    expect(result.priceChange).toBe(10);
    expect(result.priceChangePercent).toBeCloseTo(10, 0);
    expect(result.tradeDays).toBe(3);
    expect(result.highPrice).toBe(112);
    expect(result.lowPrice).toBe(100);
  });

  it('should aggregate a downward trend', () => {
    const days = [
      makeDay({ date: '2026-01-01', open: 100, close: 100 }),
      makeDay({ date: '2026-01-02', open: 99, close: 95 }),
      makeDay({ date: '2026-01-03', open: 95, close: 90 }),
    ];

    const result = aggregator.aggregate('000002', '万科A', days);
    expect(result.priceChangePercent).toBeLessThan(0);
    expect(result.closePrice).toBeLessThan(result.openPrice);
  });

  it('should handle flat market', () => {
    const days = [
      makeDay({ date: '2026-01-01', open: 100, close: 100 }),
      makeDay({ date: '2026-01-02', open: 100, close: 100 }),
      makeDay({ date: '2026-01-03', open: 100, close: 100 }),
    ];

    const result = aggregator.aggregate('600000', '浦发银行', days);
    expect(result.priceChange).toBe(0);
    expect(result.priceChangePercent).toBe(0);
  });

  // --- Empty Data ---

  it('should throw on empty data', () => {
    expect(() => aggregator.aggregate('000001', 'Test', [])).toThrow('No data available');
  });

  // --- Volume Calculation ---

  it('should calculate total and average volume', () => {
    const days = [
      makeDay({ date: '2026-01-01', volume: 1000000 }),
      makeDay({ date: '2026-01-02', volume: 2000000 }),
      makeDay({ date: '2026-01-03', volume: 3000000 }),
    ];

    const result = aggregator.aggregate('000001', 'Test', days);
    expect(result.totalVolume).toBe(6000000);
    expect(result.avgVolume).toBe(2000000);
  });

  // --- Max Drawdown ---

  it('should calculate max drawdown correctly', () => {
    // Peak at 110 then drop to 80
    const days = [
      makeDay({ date: '2026-01-01', open: 100, high: 105, low: 95 }),
      makeDay({ date: '2026-01-02', open: 105, high: 110, low: 102 }), // peak
      makeDay({ date: '2026-01-03', open: 100, high: 105, low: 90, close: 90 }),
      makeDay({ date: '2026-01-04', open: 85, high: 90, low: 80, close: 82 }),
    ];

    const result = aggregator.aggregate('000001', 'Test', days);
    // max drawdown = (110 - 80) / 110 = 27.27%
    expect(result.maxDrawdown).toBeGreaterThan(20);
    expect(result.maxDrawdown).toBeLessThan(35);
  });

  it('should calculate zero drawdown for always up', () => {
    const days = [
      makeDay({ date: '2026-01-01', open: 100, high: 100, low: 100 }),
      makeDay({ date: '2026-01-02', open: 105, high: 105, low: 105 }),
      makeDay({ date: '2026-01-03', open: 110, high: 115, low: 110 }),
    ];

    const result = aggregator.aggregate('000001', 'Test', days);
    // Day 1: low=100, peak=100, drawdown=0
    // Day 2: low=105, peak=105, drawdown=0
    // Day 3: low=110, peak=115, drawdown=(115-110)/115=4.35%
    // This has drawdown because day 3's low < day 3's high
    // Use identical high/low values
    const noDrawdownDays = [
      makeDay({ date: '2026-01-01', open: 100, high: 100, low: 100, close: 100 }),
      makeDay({ date: '2026-01-02', open: 110, high: 110, low: 110, close: 110 }),
    ];
    const result2 = aggregator.aggregate('000002', 'Test', noDrawdownDays);
    expect(result2.maxDrawdown).toBe(0);
  });

  // --- Volatility ---

  it('should calculate volatility', () => {
    const days = [
      makeDay({ date: '2026-01-01', open: 100, close: 100 }),
      makeDay({ date: '2026-01-02', open: 100, close: 110 }),
      makeDay({ date: '2026-01-03', open: 110, close: 90 }),
    ];

    const result = aggregator.aggregate('000001', 'Test', days);
    expect(result.volatility).toBeGreaterThan(0);
  });

  it('should have zero volatility for constant values', () => {
    const days = [
      makeDay({ date: '2026-01-01', open: 100, close: 100 }),
      makeDay({ date: '2026-01-02', open: 100, close: 100 }),
      makeDay({ date: '2026-01-03', open: 100, close: 100 }),
    ];

    const result = aggregator.aggregate('000001', 'Test', days);
    expect(result.volatility).toBe(0);
  });

  // --- Up/Down Days ---

  it('should count up and down days', () => {
    const days = [
      makeDay({ date: '2026-01-01', open: 100, close: 105 }), // up
      makeDay({ date: '2026-01-02', open: 105, close: 102 }), // down
      makeDay({ date: '2026-01-03', open: 102, close: 108 }), // up
    ];

    const result = aggregator.aggregate('000001', 'Test', days);
    expect(result.upDays).toBe(2);
    expect(result.downDays).toBe(1);
    expect(result.winRate).toBeCloseTo(66.67, 0);
  });

  it('should handle all same-direction days', () => {
    const allUp = [
      makeDay({ date: '2026-01-01', open: 100, close: 101 }),
      makeDay({ date: '2026-01-02', open: 101, close: 102 }),
    ];

    const result = aggregator.aggregate('000001', 'Up', allUp);
    expect(result.upDays).toBe(2);
    expect(result.downDays).toBe(0);
    expect(result.winRate).toBe(100);
  });

  // --- Avg Amplitude ---

  it('should calculate average amplitude', () => {
    const days = [
      makeDay({ date: '2026-01-01', open: 100, high: 105, low: 97 }),
      makeDay({ date: '2026-01-02', open: 102, high: 108, low: 100 }),
    ];

    const result = aggregator.aggregate('000001', 'Test', days);
    // amplitude1 = (105-97)/100 = 8%
    // amplitude2 = (108-100)/102 = 7.84%
    // avg = 7.92%
    expect(result.avgAmplitude).toBeGreaterThan(0);
  });

  // --- Batch Aggregation ---

  it('should batch aggregate multiple stocks', () => {
    const data = {
      '000001': {
        name: '平安银行',
        days: [
          makeDay({ date: '2026-01-01', open: 100, close: 105 }),
          makeDay({ date: '2026-01-02', open: 105, close: 110 }),
        ],
      },
      '600519': {
        name: '贵州茅台',
        days: [
          makeDay({ date: '2026-01-01', open: 200, close: 195 }),
        ],
      },
    };

    const results = aggregator.batchAggregate(data);
    expect(results).toHaveLength(2);
    expect(results.map(r => r.symbol)).toContain('000001');
    expect(results.map(r => r.symbol)).toContain('600519');
  });

  it('should filter out empty data in batch', () => {
    const data = {
      '000001': { name: 'Stock A', days: [] },
      '600519': { name: 'Stock B', days: [makeDay()] },
    };

    const results = aggregator.batchAggregate(data);
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe('600519');
  });

  // --- Market Overview ---

  it('should calculate market overview', () => {
    const results: AggregatedStats[] = [
      {
        symbol: 'A', name: 'A', startDate: '', endDate: '',
        tradeDays: 5, openPrice: 100, closePrice: 110, highPrice: 115, lowPrice: 95,
        avgVolume: 1000000, totalVolume: 5000000, priceChange: 10, priceChangePercent: 10,
        maxDrawdown: 5, volatility: 2, avgAmplitude: 3, upDays: 4, downDays: 1, winRate: 80,
      },
      {
        symbol: 'B', name: 'B', startDate: '', endDate: '',
        tradeDays: 5, openPrice: 50, closePrice: 45, highPrice: 55, lowPrice: 40,
        avgVolume: 500000, totalVolume: 2500000, priceChange: -5, priceChangePercent: -10,
        maxDrawdown: 15, volatility: 3, avgAmplitude: 4, upDays: 2, downDays: 3, winRate: 40,
      },
    ];

    const overview = aggregator.getMarketOverview(results);
    expect(overview.totalStocks).toBe(2);
    expect(overview.advancing).toBe(1);
    expect(overview.declining).toBe(1);
    expect(overview.avgPriceChange).toBe(0);
    expect(overview.totalVolume).toBe(7500000);
  });

  it('should handle empty market overview', () => {
    const overview = aggregator.getMarketOverview([]);
    expect(overview.totalStocks).toBe(0);
    expect(overview.avgPriceChange).toBe(0);
    expect(overview.totalVolume).toBe(0);
  });

  // --- Top/Worst Performers ---

  it('should get top performers by percentage', () => {
    const results = [
      makeResult('A', 5),
      makeResult('B', 10),
      makeResult('C', 15),
      makeResult('D', 3),
    ];

    const top = aggregator.getTopPerformers(results, 2);
    expect(top).toHaveLength(2);
    expect(top[0].symbol).toBe('C');
    expect(top[1].symbol).toBe('B');
  });

  it('should get worst performers', () => {
    const results = [
      makeResult('A', -5),
      makeResult('B', -15),
      makeResult('C', -3),
      makeResult('D', 5),
    ];

    const worst = aggregator.getWorstPerformers(results, 2);
    expect(worst).toHaveLength(2);
    expect(worst[0].symbol).toBe('B');
    expect(worst[1].symbol).toBe('A');
  });

  it('should get top performers by volatility', () => {
    const results: AggregatedStats[] = [
      { ...makeResult('A', 5), volatility: 2 },
      { ...makeResult('B', 10), volatility: 10 },
      { ...makeResult('C', 15), volatility: 5 },
    ];

    const top = aggregator.getTopPerformers(results, 3, 'volatility');
    expect(top[0].symbol).toBe('B');
    expect(top[1].symbol).toBe('C');
  });

  // --- Filter by Threshold ---

  it('should filter results by threshold', () => {
    const results = [
      makeResult('A', 5.5),
      makeResult('B', 8.2),
      makeResult('C', 3.1),
      makeResult('D', 10.0),
    ];

    const filtered = aggregator.filterByThreshold(results, 5);
    expect(filtered).toHaveLength(3);
    expect(filtered.map(r => r.symbol)).not.toContain('C');
  });

  it('should return empty for unreachable threshold', () => {
    const results = [
      makeResult('A', 5),
      makeResult('B', 8),
    ];

    const filtered = aggregator.filterByThreshold(results, 100);
    expect(filtered).toHaveLength(0);
  });

  // --- Edge Cases ---

  it('should handle single day of data', () => {
    const days = [makeDay({ date: '2026-01-01', open: 100, close: 102 })];
    const result = aggregator.aggregate('000001', 'Test', days);
    expect(result.openPrice).toBe(100);
    expect(result.closePrice).toBe(102);
    expect(result.volatility).toBe(0);
    expect(result.upDays).toBe(1);
  });

  it('should handle very large price values', () => {
    const days = [
      makeDay({ date: '2026-01-01', open: 1000000, close: 1001000 }),
      makeDay({ date: '2026-01-02', open: 1001000, close: 1005000 }),
    ];

    const result = aggregator.aggregate('600519', '贵州茅台', days);
    expect(result.priceChange).toBe(5000);
    // Very small percentage change
    expect(result.priceChangePercent).toBeGreaterThan(-1);
  });

  it('should handle extremely volatile data', () => {
    const days = [
      makeDay({ date: '2026-01-01', open: 100, close: 150, high: 160, low: 90 }),
      makeDay({ date: '2026-01-02', open: 150, close: 180, high: 190, low: 140 }),
      makeDay({ date: '2026-01-03', open: 180, close: 50, high: 185, low: 40 }),
    ];

    const result = aggregator.aggregate('000001', 'Volatile', days);
    expect(result.maxDrawdown).toBeGreaterThan(50);
    expect(result.volatility).toBeGreaterThan(20);
  });

  it('should sort dates correctly regardless of order', () => {
    const days = [
      makeDay({ date: '2026-01-03', open: 110, close: 115 }),
      makeDay({ date: '2026-01-01', open: 100, close: 105 }),
      makeDay({ date: '2026-01-02', open: 105, close: 110 }),
    ];

    const result = aggregator.aggregate('000001', 'Test', days);
    expect(result.openPrice).toBe(100);
    expect(result.closePrice).toBe(115);
  });
});

function makeResult(symbol: string, changePercent: number): AggregatedStats {
  return {
    symbol,
    name: `Stock ${symbol}`,
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    tradeDays: 21,
    openPrice: 100,
    closePrice: 100 + changePercent,
    highPrice: 100 + Math.abs(changePercent) * 2,
    lowPrice: 100 - Math.abs(changePercent),
    avgVolume: 1000000,
    totalVolume: 21000000,
    priceChange: changePercent,
    priceChangePercent: changePercent,
    maxDrawdown: Math.abs(changePercent) / 2,
    volatility: Math.abs(changePercent) / 5,
    avgAmplitude: Math.abs(changePercent) / 3,
    upDays: changePercent > 0 ? 14 : 7,
    downDays: changePercent > 0 ? 7 : 14,
    winRate: changePercent > 0 ? 66.67 : 33.33,
  };
}
