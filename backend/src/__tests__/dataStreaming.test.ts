/**
 * 数据流处理引擎测试
 */
import { describe, it, expect } from 'vitest';

interface TickData {
  symbol: string;
  price: number;
  volume: number;
  timestamp: number;
}

function filterTicks(ticks: TickData[], predicate: (t: TickData) => boolean): TickData[] {
  return ticks.filter(predicate);
}

function dedupTicks(ticks: TickData[]): TickData[] {
  const seen = new Set<string>();
  return ticks.filter(t => {
    const key = `${t.symbol}-${t.timestamp}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resampleTicks(ticks: TickData[], intervalMs: number): { timestamp: number; open: number; high: number; low: number; close: number; volume: number }[] {
  if (ticks.length === 0) return [];
  const buckets: Map<number, TickData[]> = new Map();
  for (const t of ticks) {
    const bucketKey = Math.floor(t.timestamp / intervalMs) * intervalMs;
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey)!.push(t);
  }
  const result = [];
  for (const [ts, bucketTicks] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    result.push({
      timestamp: ts,
      open: bucketTicks[0].price,
      high: Math.max(...bucketTicks.map(t => t.price)),
      low: Math.min(...bucketTicks.map(t => t.price)),
      close: bucketTicks[bucketTicks.length - 1].price,
      volume: bucketTicks.reduce((s, t) => s + t.volume, 0),
    });
  }
  return result;
}

function detectAnomalies(ticks: TickData[], thresholdStd = 3): TickData[] {
  if (ticks.length < 3) return [];
  const prices = ticks.map(t => t.price);
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const std = Math.sqrt(prices.reduce((s, p) => s + (p - mean) ** 2, 0) / prices.length);
  if (std === 0) return [];
  return ticks.filter(t => Math.abs(t.price - mean) > thresholdStd * std);
}

function slidingWindowAggregate(ticks: TickData[], windowMs: number, step: number): { timestamp: number; avgPrice: number; totalVolume: number }[] {
  if (ticks.length === 0) return [];
  const minTs = Math.min(...ticks.map(t => t.timestamp));
  const maxTs = Math.max(...ticks.map(t => t.timestamp));
  const result = [];
  for (let start = minTs; start <= maxTs; start += step) {
    const end = start + windowMs;
    const windowTicks = ticks.filter(t => t.timestamp >= start && t.timestamp < end);
    if (windowTicks.length > 0) {
      result.push({
        timestamp: start,
        avgPrice: windowTicks.reduce((s, t) => s + t.price, 0) / windowTicks.length,
        totalVolume: windowTicks.reduce((s, t) => s + t.volume, 0),
      });
    }
  }
  return result;
}

describe('数据流处理', () => {
  const sampleTicks: TickData[] = [
    { symbol: '600519', price: 1800, volume: 100, timestamp: 1000 },
    { symbol: '600519', price: 1805, volume: 200, timestamp: 2000 },
    { symbol: '600519', price: 1790, volume: 150, timestamp: 3000 },
    { symbol: '600519', price: 1810, volume: 300, timestamp: 4000 },
    { symbol: '600519', price: 1808, volume: 250, timestamp: 5000 },
  ];

  describe('数据过滤', () => {
    it('按价格过滤', () => {
      const filtered = filterTicks(sampleTicks, t => t.price > 1800);
      expect(filtered).toHaveLength(3);
    });

    it('按成交量过滤', () => {
      const filtered = filterTicks(sampleTicks, t => t.volume >= 200);
      expect(filtered).toHaveLength(3);
    });

    it('空结果', () => {
      expect(filterTicks(sampleTicks, t => t.price > 9999)).toHaveLength(0);
    });

    it('空输入', () => {
      expect(filterTicks([], t => true)).toEqual([]);
    });

    it('全选', () => {
      expect(filterTicks(sampleTicks, () => true)).toHaveLength(5);
    });
  });

  describe('去重', () => {
    it('去除重复Tick', () => {
      const ticks = [
        { symbol: 'A', price: 100, volume: 10, timestamp: 1 },
        { symbol: 'A', price: 100, volume: 10, timestamp: 1 },
        { symbol: 'A', price: 101, volume: 10, timestamp: 2 },
      ];
      expect(dedupTicks(ticks)).toHaveLength(2);
    });

    it('无重复不变', () => {
      expect(dedupTicks(sampleTicks)).toHaveLength(5);
    });

    it('空数组', () => {
      expect(dedupTicks([])).toEqual([]);
    });

    it('不同symbol不互相去重', () => {
      const ticks = [
        { symbol: 'A', price: 100, volume: 10, timestamp: 1 },
        { symbol: 'B', price: 100, volume: 10, timestamp: 1 },
      ];
      expect(dedupTicks(ticks)).toHaveLength(2);
    });
  });

  describe('重采样', () => {
    it('合并为K线', () => {
      const klines = resampleTicks(sampleTicks, 2000);
      expect(klines.length).toBeGreaterThan(0);
      expect(klines[0]).toHaveProperty('open');
      expect(klines[0]).toHaveProperty('high');
      expect(klines[0]).toHaveProperty('low');
      expect(klines[0]).toHaveProperty('close');
      expect(klines[0]).toHaveProperty('volume');
    });

    it('OHLC逻辑正确', () => {
      const klines = resampleTicks(sampleTicks, 2000);
      for (const k of klines) {
        expect(k.high).toBeGreaterThanOrEqual(k.open);
        expect(k.high).toBeGreaterThanOrEqual(k.close);
        expect(k.low).toBeLessThanOrEqual(k.open);
        expect(k.low).toBeLessThanOrEqual(k.close);
      }
    });

    it('空数据', () => {
      expect(resampleTicks([], 1000)).toEqual([]);
    });

    it('成交量求和', () => {
      const ticks = [
        { symbol: 'A', price: 100, volume: 100, timestamp: 500 },
        { symbol: 'A', price: 101, volume: 200, timestamp: 1500 },
      ];
      const klines = resampleTicks(ticks, 2000);
      expect(klines[0].volume).toBe(300);
    });
  });

  describe('异常检测', () => {
    it('检测价格跳变', () => {
      const ticks = [
        { symbol: 'A', price: 100, volume: 10, timestamp: 1 },
        { symbol: 'A', price: 100, volume: 10, timestamp: 2 },
        { symbol: 'A', price: 100, volume: 10, timestamp: 3 },
        { symbol: 'A', price: 100, volume: 10, timestamp: 4 },
        { symbol: 'A', price: 1000, volume: 10, timestamp: 5 },
      ];
      const anomalies = detectAnomalies(ticks, 1.5);
      expect(anomalies.length).toBeGreaterThan(0);
    });

    it('正常数据无异常', () => {
      const anomalies = detectAnomalies(sampleTicks, 3);
      expect(anomalies).toHaveLength(0);
    });

    it('数据不足返回空', () => {
      expect(detectAnomalies([{ symbol: 'A', price: 100, volume: 10, timestamp: 1 }])).toEqual([]);
    });

    it('常数数据无异常', () => {
      const ticks = Array.from({ length: 10 }, (_, i) => ({ symbol: 'A', price: 100, volume: 10, timestamp: i }));
      expect(detectAnomalies(ticks)).toEqual([]);
    });
  });

  describe('滑动窗口聚合', () => {
    it('窗口聚合结果', () => {
      const result = slidingWindowAggregate(sampleTicks, 2000, 2000);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('avgPrice');
      expect(result[0]).toHaveProperty('totalVolume');
    });

    it('空数据', () => {
      expect(slidingWindowAggregate([], 1000, 500)).toEqual([]);
    });

    it('平均价格合理', () => {
      const result = slidingWindowAggregate(sampleTicks, 10000, 10000);
      expect(result).toHaveLength(1);
      expect(result[0].avgPrice).toBeCloseTo(1802.6, 0);
    });
  });
});
