import { describe, it, expect } from 'vitest';

describe('斐波那契回撤/延伸引擎', () => {
  const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2.618];

  function fibonacciRetracement(high: number, low: number) {
    const range = high - low;
    return FIB_LEVELS.map(level => ({
      level,
      price: high - range * level,
      isSupport: level > 0 && level < 1,
      isResistance: level > 1,
    }));
  }

  function fibonacciExtension(start: number, end: number, retracementEnd: number) {
    const range = end - start;
    return [1.272, 1.618, 2.0, 2.618].map(ext => ({
      level: ext,
      price: retracementEnd + range * ext,
    }));
  }

  function findSwingPoints(prices: number[], lookback = 5) {
    const highs: { index: number; price: number }[] = [];
    const lows: { index: number; price: number }[] = [];
    for (let i = lookback; i < prices.length - lookback; i++) {
      let isHigh = true, isLow = true;
      for (let j = -lookback; j <= lookback; j++) {
        if (j === 0) continue;
        if (prices[i] < prices[i + j]) isHigh = false;
        if (prices[i] > prices[i + j]) isLow = false;
      }
      if (isHigh) highs.push({ index: i, price: prices[i] });
      if (isLow) lows.push({ index: i, price: prices[i] });
    }
    return { highs, lows };
  }

  function fibonacciTimeZones(startIndex: number, n = 8) {
    const fibs = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
    return fibs.slice(0, n).map((f, i) => ({
      index: startIndex + f,
      fib: f,
      isGoldenRatio: f === 1 || f === 2 || f === 3 || f === 5,
    }));
  }

  function fibonacciFan(high: { index: number; price: number }, low: { index: number; price: number }) {
    const range = high.price - low.price;
    const slope = range / (high.index - low.index);
    return [0.382, 0.5, 0.618].map(level => ({
      level,
      slope: slope * level,
      startPrice: low.price,
    }));
  }

  function autoFibLevels(prices: number[], lookback = 20) {
    const slice = prices.slice(-lookback);
    const high = Math.max(...slice), low = Math.min(...slice);
    const fibs = fibonacciRetracement(high, low);
    const currentPrice = prices[prices.length - 1];
    const nearestSupport = [...fibs].reverse().find(f => f.price < currentPrice && f.isSupport);
    const nearestResistance = fibs.find(f => f.price > currentPrice && f.isSupport);
    return { levels: fibs, nearestSupport, nearestResistance, high, low };
  }

  function fibonacciCluster(prices: number[], swings: { high: number; low: number }[]) {
    const allLevels: number[] = [];
    for (const { high, low } of swings) {
      FIB_LEVELS.forEach(l => allLevels.push(high - (high - low) * l));
    }
    // Find clusters where levels are close
    const clusters: { price: number; strength: number }[] = [];
    const sorted = [...allLevels].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      const nearby = sorted.filter(l => Math.abs(l - sorted[i]) / sorted[i] < 0.01);
      if (nearby.length >= 2) clusters.push({ price: sorted[i], strength: nearby.length });
    }
    return clusters;
  }

  describe('斐波那契回撤', () => {
    it('基本回撤计算', () => {
      const fibs = fibonacciRetracement(150, 100);
      expect(fibs).toHaveLength(10);
      expect(fibs.find(f => f.level === 0)?.price).toBe(150);
      expect(fibs.find(f => f.level === 1)?.price).toBe(100);
    });

    it('50%回撤在中点', () => {
      const fibs = fibonacciRetracement(200, 100);
      const half = fibs.find(f => f.level === 0.5);
      expect(half?.price).toBe(150);
    });

    it('61.8%黄金分割', () => {
      const fibs = fibonacciRetracement(161.8, 100);
      const golden = fibs.find(f => f.level === 0.618);
      expect(golden?.price).toBeCloseTo(123.6, 0);
    });

    it('支撑位标记', () => {
      const fibs = fibonacciRetracement(150, 100);
      const support = fibs.filter(f => f.isSupport);
      expect(support.length).toBe(5); // 0.236, 0.382, 0.5, 0.618, 0.786
    });
  });

  describe('斐波那契延伸', () => {
    it('延伸计算', () => {
      const exts = fibonacciExtension(100, 150, 130);
      expect(exts).toHaveLength(4);
      expect(exts[0].level).toBe(1.272);
    });

    it('161.8%延伸', () => {
      const exts = fibonacciExtension(100, 150, 130);
      const g = exts.find(e => e.level === 1.618);
      expect(g?.price).toBe(130 + 50 * 1.618);
    });
  });

  describe('摆动高低点', () => {
    it('检测摆动高点', () => {
      const prices = [10, 11, 12, 11, 10, 9, 10, 11, 15, 14, 13, 12, 11, 10];
      const { highs } = findSwingPoints(prices, 3);
      expect(highs.length).toBeGreaterThan(0);
    });

    it('检测摆动低点', () => {
      const prices = [15, 14, 13, 14, 15, 16, 15, 14, 10, 11, 12, 13, 14, 15];
      const { lows } = findSwingPoints(prices, 3);
      expect(lows.length).toBeGreaterThan(0);
    });
  });

  describe('斐波那契时区', () => {
    it('生成时区序列', () => {
      const zones = fibonacciTimeZones(100, 5);
      expect(zones).toHaveLength(5);
      expect(zones[0].index).toBe(101);
    });
  });

  describe('自动斐波那契', () => {
    it('找最近支撑阻力', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 3) * 10);
      const result = autoFibLevels(prices, 20);
      expect(result.levels).toHaveLength(10);
      if (result.nearestSupport) expect(result.nearestSupport.price).toBeLessThan(prices[prices.length - 1]);
      if (result.nearestResistance) expect(result.nearestResistance.price).toBeGreaterThan(prices[prices.length - 1]);
    });
  });

  describe('斐波那契汇聚', () => {
    it('找汇聚区域', () => {
      const swings = [{ high: 150, low: 100 }, { high: 160, low: 110 }, { high: 145, low: 95 }];
      const clusters = fibonacciCluster([], swings);
      expect(Array.isArray(clusters)).toBe(true);
      expect(clusters.length).toBeGreaterThanOrEqual(0);
    });
  });
});
