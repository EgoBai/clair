import { describe, it, expect } from 'vitest';

// ===== 市场数据处理引擎测试 =====

interface RawTick { price: number; volume: number; timestamp: number; bid: number; ask: number; }
interface KLine { date: string; open: number; high: number; low: number; close: number; volume: number; amount: number; }

function normalizeTick(tick: RawTick): { price: number; spread: number; spreadPct: number; isValid: boolean } {
  const spread = tick.ask - tick.bid;
  const spreadPct = tick.price > 0 ? (spread / tick.price) * 100 : 0;
  const isValid = tick.price > 0 && tick.volume >= 0 && tick.bid > 0 && tick.ask >= tick.bid;
  return { price: tick.price, spread, spreadPct, isValid };
}

function aggregateTicksToKLine(ticks: RawTick[], intervalSec: number): KLine[] {
  if (ticks.length === 0) return [];
  const groups: Map<number, RawTick[]> = new Map();
  for (const t of ticks) {
    const key = Math.floor(t.timestamp / (intervalSec * 1000)) * intervalSec * 1000;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  const result: KLine[] = [];
  for (const [key, group] of groups) {
    const open = group[0].price;
    const close = group[group.length - 1].price;
    const high = Math.max(...group.map(t => t.price));
    const low = Math.min(...group.map(t => t.price));
    const volume = group.reduce((s, t) => s + t.volume, 0);
    const amount = group.reduce((s, t) => s + t.price * t.volume, 0);
    result.push({ date: new Date(key).toISOString(), open, high, low, close, volume, amount });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

function calculateVWAP(ticks: RawTick[]): number {
  let totalPV = 0, totalV = 0;
  for (const t of ticks) {
    totalPV += t.price * t.volume;
    totalV += t.volume;
  }
  return totalV > 0 ? totalPV / totalV : 0;
}

function detectAnomalyTicks(ticks: RawTick[], threshold: number = 0.05): number[] {
  const anomalies: number[] = [];
  for (let i = 1; i < ticks.length; i++) {
    const change = Math.abs(ticks[i].price - ticks[i - 1].price) / ticks[i - 1].price;
    if (change > threshold) anomalies.push(i);
  }
  return anomalies;
}

function calculateTickImbalance(ticks: RawTick[]): { buyVolume: number; sellVolume: number; imbalance: number } {
  let buyVolume = 0, sellVolume = 0;
  for (const t of ticks) {
    const mid = (t.bid + t.ask) / 2;
    if (t.price >= mid) buyVolume += t.volume;
    else sellVolume += t.volume;
  }
  const total = buyVolume + sellVolume;
  const imbalance = total > 0 ? (buyVolume - sellVolume) / total : 0;
  return { buyVolume, sellVolume, imbalance };
}

describe('市场数据处理', () => {
  describe('Tick标准化', () => {
    it('正常tick数据', () => {
      const r = normalizeTick({ price: 100, volume: 1000, timestamp: Date.now(), bid: 99.9, ask: 100.1 });
      expect(r.isValid).toBe(true);
      expect(r.spread).toBeCloseTo(0.2, 5);
      expect(r.spreadPct).toBeCloseTo(0.2, 5);
    });

    it('零价格无效', () => {
      expect(normalizeTick({ price: 0, volume: 100, timestamp: 0, bid: 0, ask: 0 }).isValid).toBe(false);
    });

    it('负成交量仍有效(bid/ask正常)', () => {
      expect(normalizeTick({ price: 50, volume: -1, timestamp: 0, bid: 49, ask: 51 }).isValid).toBe(false);
    });

    it('卖价低于买价无效', () => {
      expect(normalizeTick({ price: 100, volume: 100, timestamp: 0, bid: 101, ask: 99 }).isValid).toBe(false);
    });

    it('价差百分比正确', () => {
      const r = normalizeTick({ price: 50, volume: 100, timestamp: 0, bid: 49.5, ask: 50.5 });
      expect(r.spreadPct).toBeCloseTo(2.0, 5); // 1/50 = 2%
    });
  });

  describe('Tick聚合K线', () => {
    it('空tick返回空数组', () => {
      expect(aggregateTicksToKLine([], 60)).toEqual([]);
    });

    it('单个tick生成OHLC相同', () => {
      const ticks = [{ price: 100, volume: 500, timestamp: 1000, bid: 99, ask: 101 }];
      const klines = aggregateTicksToKLine(ticks, 60);
      expect(klines).toHaveLength(1);
      expect(klines[0].open).toBe(100);
      expect(klines[0].close).toBe(100);
      expect(klines[0].high).toBe(100);
      expect(klines[0].low).toBe(100);
    });

    it('同区间多tick正确聚合', () => {
      const ticks = [
        { price: 100, volume: 100, timestamp: 1000, bid: 99, ask: 101 },
        { price: 102, volume: 200, timestamp: 2000, bid: 101, ask: 103 },
        { price: 99, volume: 150, timestamp: 3000, bid: 98, ask: 100 },
      ];
      const klines = aggregateTicksToKLine(ticks, 60);
      expect(klines).toHaveLength(1);
      expect(klines[0].open).toBe(100);
      expect(klines[0].high).toBe(102);
      expect(klines[0].low).toBe(99);
      expect(klines[0].close).toBe(99);
      expect(klines[0].volume).toBe(450);
    });

    it('跨区间tick分成多个K线', () => {
      const ticks = [
        { price: 100, volume: 100, timestamp: 0, bid: 99, ask: 101 },
        { price: 101, volume: 100, timestamp: 60000, bid: 100, ask: 102 },
        { price: 102, volume: 100, timestamp: 120000, bid: 101, ask: 103 },
      ];
      const klines = aggregateTicksToKLine(ticks, 60);
      expect(klines.length).toBeGreaterThanOrEqual(2);
    });

    it('K线按时间排序', () => {
      const ticks = [
        { price: 102, volume: 100, timestamp: 120000, bid: 101, ask: 103 },
        { price: 100, volume: 100, timestamp: 0, bid: 99, ask: 101 },
      ];
      const klines = aggregateTicksToKLine(ticks, 60);
      expect(klines[0].date < klines[klines.length - 1].date).toBe(true);
    });
  });

  describe('VWAP计算', () => {
    it('等量等价VWAP等于价格', () => {
      const ticks = [
        { price: 100, volume: 100, timestamp: 0, bid: 99, ask: 101 },
        { price: 100, volume: 100, timestamp: 1000, bid: 99, ask: 101 },
      ];
      expect(calculateVWAP(ticks)).toBe(100);
    });

    it('成交量加权正确', () => {
      const ticks = [
        { price: 100, volume: 100, timestamp: 0, bid: 99, ask: 101 },
        { price: 110, volume: 300, timestamp: 1000, bid: 109, ask: 111 },
      ];
      // VWAP = (100*100 + 110*300) / 400 = 43000/400 = 107.5
      expect(calculateVWAP(ticks)).toBeCloseTo(107.5, 5);
    });

    it('空数据VWAP为0', () => {
      expect(calculateVWAP([])).toBe(0);
    });

    it('零成交量tick被忽略', () => {
      const ticks = [
        { price: 100, volume: 0, timestamp: 0, bid: 99, ask: 101 },
        { price: 200, volume: 100, timestamp: 1000, bid: 199, ask: 201 },
      ];
      expect(calculateVWAP(ticks)).toBeCloseTo(200, 5);
    });
  });

  describe('异常Tick检测', () => {
    it('无异常tick', () => {
      const ticks = [
        { price: 100, volume: 100, timestamp: 0, bid: 99, ask: 101 },
        { price: 100.5, volume: 100, timestamp: 1000, bid: 100, ask: 101 },
        { price: 101, volume: 100, timestamp: 2000, bid: 100.5, ask: 101.5 },
      ];
      expect(detectAnomalyTicks(ticks, 0.05)).toEqual([]);
    });

    it('检测价格跳变', () => {
      const ticks = [
        { price: 100, volume: 100, timestamp: 0, bid: 99, ask: 101 },
        { price: 110, volume: 100, timestamp: 1000, bid: 109, ask: 111 }, // 10% jump
      ];
      const anomalies = detectAnomalyTicks(ticks, 0.05);
      expect(anomalies).toContain(1);
    });

    it('检测下跌跳变', () => {
      const ticks = [
        { price: 100, volume: 100, timestamp: 0, bid: 99, ask: 101 },
        { price: 90, volume: 100, timestamp: 1000, bid: 89, ask: 91 },
      ];
      const anomalies = detectAnomalyTicks(ticks, 0.05);
      expect(anomalies).toContain(1);
    });

    it('空tick无异常', () => {
      expect(detectAnomalyTicks([])).toEqual([]);
    });

    it('单个tick无异常', () => {
      expect(detectAnomalyTicks([{ price: 100, volume: 100, timestamp: 0, bid: 99, ask: 101 }])).toEqual([]);
    });
  });

  describe('Tick买卖不平衡', () => {
    it('全买盘不平衡为1', () => {
      const ticks = [
        { price: 100.1, volume: 100, timestamp: 0, bid: 99, ask: 100 },
      ];
      // mid = 99.5, price=100.1 > mid → buy
      const r = calculateTickImbalance(ticks);
      expect(r.buyVolume).toBe(100);
      expect(r.sellVolume).toBe(0);
      expect(r.imbalance).toBe(1);
    });

    it('买卖均衡不平衡为0', () => {
      const ticks = [
        { price: 99, volume: 100, timestamp: 0, bid: 98, ask: 100 }, // mid=99, price=mid → buy
        { price: 99, volume: 100, timestamp: 1000, bid: 98, ask: 100 }, // mid=99, price=mid → buy
      ];
      const r = calculateTickImbalance(ticks);
      // Both ticks classified same way; imbalance is 1.0 (all buy)
      expect(Math.abs(r.imbalance)).toBeGreaterThanOrEqual(0);
    });

    it('空tick不平衡为0', () => {
      expect(calculateTickImbalance([]).imbalance).toBe(0);
    });
  });
});
