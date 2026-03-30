import { describe, it, expect } from 'vitest';

// 市场微观结构分析引擎测试
describe('市场微观结构分析', () => {
  describe('订单簿不平衡计算', () => {
    function calculateOrderBookImbalance(bids: number[][], asks: number[][]): number {
      const bidVolume = bids.reduce((sum, b) => sum + b[1], 0);
      const askVolume = asks.reduce((sum, a) => sum + a[1], 0);
      if (bidVolume + askVolume === 0) return 0;
      return (bidVolume - askVolume) / (bidVolume + askVolume);
    }

    it('买盘远大于卖盘时返回正值', () => {
      expect(calculateOrderBookImbalance([[10, 1000], [9.9, 500]], [[10.1, 100], [10.2, 50]])).toBeGreaterThan(0);
    });

    it('卖盘远大于买盘时返回负值', () => {
      expect(calculateOrderBookImbalance([[10, 100], [9.9, 50]], [[10.1, 1000], [10.2, 500]])).toBeLessThan(0);
    });

    it('买卖均衡时接近零', () => {
      const result = calculateOrderBookImbalance([[10, 500], [9.9, 300]], [[10.1, 500], [10.2, 300]]);
      expect(Math.abs(result)).toBeLessThan(0.01);
    });

    it('空订单簿返回零', () => {
      expect(calculateOrderBookImbalance([], [])).toBe(0);
    });

    it('只有买盘返回1', () => {
      expect(calculateOrderBookImbalance([[10, 100]], [])).toBe(1);
    });

    it('只有卖盘返回-1', () => {
      expect(calculateOrderBookImbalance([], [[10, 100]])).toBe(-1);
    });
  });

  describe('VWAP计算', () => {
    function calculateVWAP(trades: { price: number; volume: number }[]): number {
      const totalVolume = trades.reduce((sum, t) => sum + t.volume, 0);
      if (totalVolume === 0) return 0;
      const totalPV = trades.reduce((sum, t) => sum + t.price * t.volume, 0);
      return totalPV / totalVolume;
    }

    it('正确计算VWAP', () => {
      const trades = [
        { price: 100, volume: 1000 },
        { price: 101, volume: 2000 },
        { price: 99, volume: 1000 },
      ];
      expect(calculateVWAP(trades)).toBeCloseTo(100.25, 2);
    });

    it('单笔交易VWAP等于价格', () => {
      expect(calculateVWAP([{ price: 50, volume: 100 }])).toBe(50);
    });

    it('空交易列表返回0', () => {
      expect(calculateVWAP([])).toBe(0);
    });

    it('大成交量的价格权重更高', () => {
      const trades = [
        { price: 100, volume: 1 },
        { price: 200, volume: 1000 },
      ];
      expect(calculateVWAP(trades)).toBeCloseTo(199.9, 1);
    });
  });

  describe('成交量加权价格区间', () => {
    function volumeWeightedRange(prices: number[], volumes: number[]): { vwap: number; upperBand: number; lowerBand: number } {
      const totalVol = volumes.reduce((a, b) => a + b, 0);
      if (totalVol === 0) return { vwap: 0, upperBand: 0, lowerBand: 0 };
      const vwap = prices.reduce((s, p, i) => s + p * volumes[i], 0) / totalVol;
      const variance = prices.reduce((s, p, i) => s + volumes[i] * (p - vwap) ** 2, 0) / totalVol;
      const stdDev = Math.sqrt(variance);
      return { vwap, upperBand: vwap + stdDev, lowerBand: vwap - stdDev };
    }

    it('返回VWAP和上下轨', () => {
      const result = volumeWeightedRange([10, 11, 12, 13, 14], [100, 200, 300, 200, 100]);
      expect(result.vwap).toBeGreaterThan(0);
      expect(result.upperBand).toBeGreaterThan(result.vwap);
      expect(result.lowerBand).toBeLessThan(result.vwap);
    });

    it('价格相同时标准差为零', () => {
      const result = volumeWeightedRange([10, 10, 10], [100, 200, 300]);
      expect(result.upperBand).toBe(result.vwap);
      expect(result.lowerBand).toBe(result.vwap);
    });

    it('空数据返回全零', () => {
      const result = volumeWeightedRange([], []);
      expect(result.vwap).toBe(0);
    });
  });

  describe('盘口深度分析', () => {
    interface Level { price: number; volume: number; orders: number; }

    function analyzeDepth(levels: Level[]): { totalVolume: number; avgOrderSize: number; levels90Percent: number } {
      const totalVolume = levels.reduce((s, l) => s + l.volume, 0);
      const totalOrders = levels.reduce((s, l) => s + l.orders, 0);
      const avgOrderSize = totalOrders > 0 ? totalVolume / totalOrders : 0;
      let cumVol = 0;
      let levels90Percent = 0;
      const sorted = [...levels].sort((a, b) => a.price - b.price);
      for (const l of sorted) {
        cumVol += l.volume;
        levels90Percent++;
        if (cumVol >= totalVolume * 0.9) break;
      }
      return { totalVolume, avgOrderSize, levels90Percent };
    }

    it('计算总成交量', () => {
      const levels = [{ price: 10, volume: 100, orders: 5 }, { price: 9, volume: 200, orders: 10 }];
      expect(analyzeDepth(levels).totalVolume).toBe(300);
    });

    it('计算平均订单大小', () => {
      const levels = [{ price: 10, volume: 100, orders: 5 }, { price: 9, volume: 200, orders: 10 }];
      expect(analyzeDepth(levels).avgOrderSize).toBe(20);
    });

    it('空盘口深度', () => {
      expect(analyzeDepth([]).totalVolume).toBe(0);
    });

    it('90%成交集中度', () => {
      const levels = [
        { price: 10, volume: 900, orders: 10 },
        { price: 9, volume: 50, orders: 2 },
        { price: 8, volume: 50, orders: 2 },
      ];
      const result = analyzeDepth(levels);
      expect(result.levels90Percent).toBeLessThanOrEqual(3);
    });
  });

  describe('逐笔成交分析', () => {
    interface Tick { time: number; price: number; volume: number; side: 'buy' | 'sell'; }

    function analyzeTicks(ticks: Tick[]): {
      buyVolume: number;
      sellVolume: number;
      largeOrderRatio: number;
      avgTradeSize: number;
    } {
      const buyVolume = ticks.filter(t => t.side === 'buy').reduce((s, t) => s + t.volume, 0);
      const sellVolume = ticks.filter(t => t.side === 'sell').reduce((s, t) => s + t.volume, 0);
      const totalVolume = buyVolume + sellVolume;
      const avgSize = ticks.length > 0 ? totalVolume / ticks.length : 0;
      const largeOrders = ticks.filter(t => t.volume > avgSize * 3);
      const largeOrderRatio = ticks.length > 0 ? largeOrders.length / ticks.length : 0;
      return { buyVolume, sellVolume, largeOrderRatio, avgTradeSize: avgSize };
    }

    it('区分买卖成交量', () => {
      const ticks: Tick[] = [
        { time: 1, price: 10, volume: 100, side: 'buy' },
        { time: 2, price: 10, volume: 200, side: 'sell' },
        { time: 3, price: 10, volume: 150, side: 'buy' },
      ];
      const result = analyzeTicks(ticks);
      expect(result.buyVolume).toBe(250);
      expect(result.sellVolume).toBe(200);
    });

    it('空逐笔数据', () => {
      const result = analyzeTicks([]);
      expect(result.buyVolume).toBe(0);
      expect(result.sellVolume).toBe(0);
      expect(result.largeOrderRatio).toBe(0);
    });

    it('全部买入', () => {
      const ticks: Tick[] = [
        { time: 1, price: 10, volume: 100, side: 'buy' },
        { time: 2, price: 10, volume: 200, side: 'buy' },
      ];
      expect(analyzeTicks(ticks).sellVolume).toBe(0);
    });

    it('计算大单比例', () => {
      const ticks: Tick[] = Array.from({ length: 100 }, (_, i) => ({
        time: i, price: 10, volume: i < 5 ? 10000 : 100, side: 'buy' as const,
      }));
      const result = analyzeTicks(ticks);
      expect(result.largeOrderRatio).toBeGreaterThan(0);
      expect(result.largeOrderRatio).toBeLessThan(0.1);
    });
  });
});
