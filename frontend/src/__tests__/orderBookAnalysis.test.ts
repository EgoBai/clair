import { describe, it, expect } from 'vitest';

// 盘口分析引擎
describe('盘口分析引擎', () => {
  describe('五档行情分析', () => {
    interface OrderLevel { price: number; volume: number; }
    interface OrderBook { bids: OrderLevel[]; asks: OrderLevel[]; }

    function orderBookImbalance(book: OrderBook): number {
      const bidVol = book.bids.reduce((s, b) => s + b.volume, 0);
      const askVol = book.asks.reduce((s, a) => s + a.volume, 0);
      const total = bidVol + askVol;
      return total === 0 ? 0 : (bidVol - askVol) / total;
    }

    function bidAskSpread(book: OrderBook): number {
      if (book.bids.length === 0 || book.asks.length === 0) return 0;
      return book.asks[0].price - book.bids[0].price;
    }

    function spreadPercent(book: OrderBook): number {
      const spread = bidAskSpread(book);
      const mid = (book.bids[0]?.price + book.asks[0]?.price) / 2;
      return mid === 0 ? 0 : (spread / mid) * 100;
    }

    function volumeWeightedMid(book: OrderBook): number {
      const bidVol = book.bids.reduce((s, b) => s + b.volume, 0);
      const askVol = book.asks.reduce((s, a) => s + a.volume, 0);
      const total = bidVol + askVol;
      if (total === 0) return 0;
      return (book.bids[0].price * askVol + book.asks[0].price * bidVol) / total;
    }

    it('买盘量大偏向正值', () => {
      const book: OrderBook = {
        bids: [{ price: 10, volume: 1000 }, { price: 9.99, volume: 500 }],
        asks: [{ price: 10.01, volume: 300 }, { price: 10.02, volume: 200 }],
      };
      expect(orderBookImbalance(book)).toBeGreaterThan(0);
    });

    it('卖盘量大偏向负值', () => {
      const book: OrderBook = {
        bids: [{ price: 10, volume: 100 }],
        asks: [{ price: 10.01, volume: 900 }],
      };
      expect(orderBookImbalance(book)).toBeLessThan(0);
    });

    it('买卖均衡为零', () => {
      const book: OrderBook = {
        bids: [{ price: 10, volume: 500 }],
        asks: [{ price: 10.01, volume: 500 }],
      };
      expect(orderBookImbalance(book)).toBe(0);
    });

    it('空盘口返回0', () => {
      const book: OrderBook = { bids: [], asks: [] };
      expect(orderBookImbalance(book)).toBe(0);
    });

    it('计算买卖价差', () => {
      const book: OrderBook = {
        bids: [{ price: 10, volume: 100 }],
        asks: [{ price: 10.05, volume: 200 }],
      };
      expect(bidAskSpread(book)).toBeCloseTo(0.05, 10);
    });

    it('计算价差百分比', () => {
      const book: OrderBook = {
        bids: [{ price: 10, volume: 100 }],
        asks: [{ price: 10.02, volume: 200 }],
      };
      expect(spreadPercent(book)).toBeCloseTo(0.2, 1);
    });

    it('量加权中间价', () => {
      const book: OrderBook = {
        bids: [{ price: 10, volume: 100 }],
        asks: [{ price: 10.02, volume: 100 }],
      };
      expect(volumeWeightedMid(book)).toBeCloseTo(10.01, 2);
    });

    it('大卖盘量加权中间价偏向卖价', () => {
      const book: OrderBook = {
        bids: [{ price: 10, volume: 100 }],
        asks: [{ price: 10.02, volume: 9000 }],
      };
      expect(volumeWeightedMid(book)).toBeLessThan(10.01);
    });
  });

  describe('盘口深度分析', () => {
    function depthPressure(levels: { price: number; volume: number }[], side: 'bid' | 'ask', currentPrice: number): number {
      return levels.reduce((sum, level) => {
        const distance = Math.abs(level.price - currentPrice) / currentPrice;
        const weight = Math.exp(-distance * 100);
        return sum + level.volume * weight;
      }, 0);
    }

    it('近价委托权重更高', () => {
      const levels = [
        { price: 10, volume: 100 },
        { price: 9.5, volume: 100 },
      ];
      const near = depthPressure([levels[0]], 'bid', 10);
      const far = depthPressure([levels[1]], 'bid', 10);
      expect(near).toBeGreaterThan(far);
    });

    it('空深度返回0', () => {
      expect(depthPressure([], 'bid', 10)).toBe(0);
    });

    it('相同距离相同价格权重', () => {
      const l1 = depthPressure([{ price: 10.1, volume: 100 }], 'ask', 10);
      const l2 = depthPressure([{ price: 9.9, volume: 100 }], 'bid', 10);
      expect(l1).toBeCloseTo(l2, 2);
    });

    it('大量级贡献更大压力', () => {
      const small = depthPressure([{ price: 10, volume: 100 }], 'bid', 10);
      const large = depthPressure([{ price: 10, volume: 1000 }], 'bid', 10);
      expect(large).toBeGreaterThan(small);
    });

    it('五档深度分析', () => {
      const bids = [
        { price: 10, volume: 500 },
        { price: 9.99, volume: 300 },
        { price: 9.98, volume: 200 },
        { price: 9.97, volume: 150 },
        { price: 9.96, volume: 100 },
      ];
      const pressure = depthPressure(bids, 'bid', 10);
      expect(pressure).toBeGreaterThan(0);
    });
  });

  describe('逐笔成交分析', () => {
    interface Trade { price: number; volume: number; side: 'buy' | 'sell'; time: number; }

    function tradeFlowAnalysis(trades: Trade[]): { buyVolume: number; sellVolume: number; avgTradeSize: number; largeOrderRatio: number } {
      const buyVolume = trades.filter(t => t.side === 'buy').reduce((s, t) => s + t.volume, 0);
      const sellVolume = trades.filter(t => t.side === 'sell').reduce((s, t) => s + t.volume, 0);
      const avgTradeSize = trades.length === 0 ? 0 : trades.reduce((s, t) => s + t.volume, 0) / trades.length;
      const largeOrders = trades.filter(t => t.volume > avgTradeSize * 3);
      const largeOrderRatio = trades.length === 0 ? 0 : largeOrders.length / trades.length;
      return { buyVolume, sellVolume, avgTradeSize, largeOrderRatio };
    }

    it('统计买入成交量', () => {
      const trades: Trade[] = [
        { price: 10, volume: 100, side: 'buy', time: 1 },
        { price: 10, volume: 200, side: 'sell', time: 2 },
        { price: 10, volume: 150, side: 'buy', time: 3 },
      ];
      const result = tradeFlowAnalysis(trades);
      expect(result.buyVolume).toBe(250);
    });

    it('统计卖出成交量', () => {
      const trades: Trade[] = [
        { price: 10, volume: 100, side: 'buy', time: 1 },
        { price: 10, volume: 200, side: 'sell', time: 2 },
      ];
      const result = tradeFlowAnalysis(trades);
      expect(result.sellVolume).toBe(200);
    });

    it('计算平均成交规模', () => {
      const trades: Trade[] = [
        { price: 10, volume: 100, side: 'buy', time: 1 },
        { price: 10, volume: 200, side: 'sell', time: 2 },
        { price: 10, volume: 300, side: 'buy', time: 3 },
      ];
      const result = tradeFlowAnalysis(trades);
      expect(result.avgTradeSize).toBe(200);
    });

    it('空成交列表', () => {
      const result = tradeFlowAnalysis([]);
      expect(result.buyVolume).toBe(0);
      expect(result.sellVolume).toBe(0);
      expect(result.avgTradeSize).toBe(0);
    });

    it('识别大单比例', () => {
      const trades: Trade[] = [
        { price: 10, volume: 100, side: 'buy', time: 1 },
        { price: 10, volume: 100, side: 'buy', time: 2 },
        { price: 10, volume: 100, side: 'buy', time: 3 },
        { price: 10, volume: 1000, side: 'buy', time: 4 },
      ];
      const result = tradeFlowAnalysis(trades);
      expect(result.largeOrderRatio).toBeGreaterThan(0);
    });

    it('全小单无大单', () => {
      const trades: Trade[] = [
        { price: 10, volume: 100, side: 'buy', time: 1 },
        { price: 10, volume: 100, side: 'buy', time: 2 },
      ];
      const result = tradeFlowAnalysis(trades);
      expect(result.largeOrderRatio).toBe(0);
    });
  });

  describe('Level2数据处理', () => {
    function aggregateOrders(orders: { price: number; volume: number }[]): Map<number, number> {
      const map = new Map<number, number>();
      for (const o of orders) {
        map.set(o.price, (map.get(o.price) || 0) + o.volume);
      }
      return map;
    }

    it('合并同价委托', () => {
      const orders = [
        { price: 10, volume: 100 },
        { price: 10, volume: 200 },
        { price: 10.01, volume: 50 },
      ];
      const result = aggregateOrders(orders);
      expect(result.get(10)).toBe(300);
      expect(result.get(10.01)).toBe(50);
    });

    it('空委托列表', () => {
      const result = aggregateOrders([]);
      expect(result.size).toBe(0);
    });

    it('所有不同价格', () => {
      const orders = [
        { price: 10, volume: 100 },
        { price: 10.01, volume: 200 },
        { price: 10.02, volume: 300 },
      ];
      const result = aggregateOrders(orders);
      expect(result.size).toBe(3);
    });

    it('保持价格精度', () => {
      const orders = [{ price: 10.123, volume: 100 }];
      const result = aggregateOrders(orders);
      expect(result.has(10.123)).toBe(true);
    });
  });
});
