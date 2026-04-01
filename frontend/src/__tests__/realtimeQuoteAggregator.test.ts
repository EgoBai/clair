import { describe, it, expect } from 'vitest';

// 实时行情聚合引擎
interface TickData {
  symbol: string;
  price: number;
  volume: number;
  timestamp: number;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
}

interface AggregatedQuote {
  symbol: string;
  lastPrice: number;
  vwap: number;
  twap: number;
  high: number;
  low: number;
  open: number;
  close: number;
  volume: number;
  turnover: number;
  avgSpread: number;
  priceRange: number;
}

interface OHLCVBar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
  timestamp: number;
}

function calcVWAP(ticks: TickData[]): number {
  let totalPV = 0;
  let totalV = 0;
  ticks.forEach(t => {
    totalPV += t.price * t.volume;
    totalV += t.volume;
  });
  return totalV > 0 ? totalPV / totalV : 0;
}

function calcTWAP(ticks: TickData[]): number {
  if (ticks.length === 0) return 0;
  return ticks.reduce((s, t) => s + t.price, 0) / ticks.length;
}

function aggregateTicks(ticks: TickData[]): AggregatedQuote | null {
  if (ticks.length === 0) return null;
  const sorted = [...ticks].sort((a, b) => a.timestamp - b.timestamp);
  const prices = ticks.map(t => t.price);
  return {
    symbol: ticks[0].symbol,
    lastPrice: sorted[sorted.length - 1].price,
    vwap: calcVWAP(ticks),
    twap: calcTWAP(ticks),
    high: Math.max(...prices),
    low: Math.min(...prices),
    open: sorted[0].price,
    close: sorted[sorted.length - 1].price,
    volume: ticks.reduce((s, t) => s + t.volume, 0),
    turnover: ticks.reduce((s, t) => s + t.price * t.volume, 0),
    avgSpread: ticks.reduce((s, t) => s + (t.ask - t.bid), 0) / ticks.length,
    priceRange: Math.max(...prices) - Math.min(...prices),
  };
}

function ticksToBars(ticks: TickData[], intervalMs: number): OHLCVBar[] {
  if (ticks.length === 0) return [];
  const sorted = [...ticks].sort((a, b) => a.timestamp - b.timestamp);
  const bars: OHLCVBar[] = [];
  let barStart = sorted[0].timestamp;
  let barTicks: TickData[] = [];

  sorted.forEach(t => {
    if (t.timestamp >= barStart + intervalMs) {
      if (barTicks.length > 0) bars.push(makeBar(barTicks, barStart));
      barStart = t.timestamp;
      barTicks = [];
    }
    barTicks.push(t);
  });
  if (barTicks.length > 0) bars.push(makeBar(barTicks, barStart));
  return bars;
}

function makeBar(ticks: TickData[], timestamp: number): OHLCVBar {
  const prices = ticks.map(t => t.price);
  return {
    open: ticks[0].price,
    high: Math.max(...prices),
    low: Math.min(...prices),
    close: ticks[ticks.length - 1].price,
    volume: ticks.reduce((s, t) => s + t.volume, 0),
    turnover: ticks.reduce((s, t) => s + t.price * t.volume, 0),
    timestamp,
  };
}

function detectPriceAnomaly(ticks: TickData[], threshold: number = 0.05): TickData[] {
  if (ticks.length < 2) return [];
  const sorted = [...ticks].sort((a, b) => a.timestamp - b.timestamp);
  const anomalies: TickData[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const change = Math.abs(sorted[i].price - sorted[i - 1].price) / sorted[i - 1].price;
    if (change > threshold) anomalies.push(sorted[i]);
  }
  return anomalies;
}

describe('实时行情聚合引擎', () => {
  const ticks: TickData[] = [
    { symbol: '600519', price: 1800, volume: 100, timestamp: 1000, bid: 1799, ask: 1801, bidSize: 10, askSize: 15 },
    { symbol: '600519', price: 1802, volume: 200, timestamp: 2000, bid: 1801, ask: 1803, bidSize: 20, askSize: 12 },
    { symbol: '600519', price: 1798, volume: 150, timestamp: 3000, bid: 1797, ask: 1799, bidSize: 8, askSize: 20 },
    { symbol: '600519', price: 1805, volume: 300, timestamp: 4000, bid: 1804, ask: 1806, bidSize: 25, askSize: 18 },
    { symbol: '600519', price: 1810, volume: 250, timestamp: 5000, bid: 1809, ask: 1811, bidSize: 30, askSize: 22 },
  ];

  it('应计算VWAP', () => {
    const vwap = calcVWAP(ticks);
    expect(vwap).toBeGreaterThan(1798);
    expect(vwap).toBeLessThan(1811);
  });

  it('应计算TWAP', () => {
    const twap = calcTWAP(ticks);
    expect(twap).toBeCloseTo(1803, 0);
  });

  it('空数据VWAP应为0', () => {
    expect(calcVWAP([])).toBe(0);
  });

  it('空数据TWAP应为0', () => {
    expect(calcTWAP([])).toBe(0);
  });

  it('应聚合行情数据', () => {
    const agg = aggregateTicks(ticks);
    expect(agg).not.toBeNull();
    expect(agg!.symbol).toBe('600519');
    expect(agg!.high).toBe(1810);
    expect(agg!.low).toBe(1798);
    expect(agg!.open).toBe(1800);
    expect(agg!.close).toBe(1810);
    expect(agg!.volume).toBe(1000);
  });

  it('空数据聚合应返回null', () => {
    expect(aggregateTicks([])).toBeNull();
  });

  it('应计算价差', () => {
    const agg = aggregateTicks(ticks);
    expect(agg!.avgSpread).toBe(2);
  });

  it('应转换为K线', () => {
    const bars = ticksToBars(ticks, 2000);
    expect(bars.length).toBeGreaterThan(0);
    bars.forEach(b => {
      expect(b.high).toBeGreaterThanOrEqual(b.open);
      expect(b.high).toBeGreaterThanOrEqual(b.close);
      expect(b.low).toBeLessThanOrEqual(b.open);
      expect(b.low).toBeLessThanOrEqual(b.close);
      expect(b.volume).toBeGreaterThan(0);
    });
  });

  it('空tick不应生成K线', () => {
    expect(ticksToBars([], 1000)).toEqual([]);
  });

  it('应检测价格异常', () => {
    const anomalyTicks: TickData[] = [
      ...ticks,
      { symbol: '600519', price: 1900, volume: 50, timestamp: 6000, bid: 1899, ask: 1901, bidSize: 5, askSize: 5 },
    ];
    const anomalies = detectPriceAnomaly(anomalyTicks, 0.03);
    expect(anomalies.length).toBeGreaterThan(0);
  });

  it('正常波动不应触发异常', () => {
    const anomalies = detectPriceAnomaly(ticks, 0.05);
    expect(anomalies.length).toBe(0);
  });
});
