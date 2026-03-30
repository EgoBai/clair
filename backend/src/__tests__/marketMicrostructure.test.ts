import { describe, it, expect } from 'vitest';

// 市场微观结构测试
describe('市场微观结构', () => {
  describe('订单簿模拟', () => {
    type Order = { price: number; quantity: number; side: 'buy' | 'sell' };

    const createOrderBook = () => {
      let bids: Order[] = [];
      let asks: Order[] = [];

      const sortBids = () => bids.sort((a, b) => b.price - a.price);
      const sortAsks = () => asks.sort((a, b) => a.price - b.price);

      return {
        addOrder(order: Order) {
          if (order.side === 'buy') {
            bids.push(order);
            sortBids();
          } else {
            asks.push(order);
            sortAsks();
          }
        },
        getBestBid: () => bids[0]?.price ?? null,
        getBestAsk: () => asks[0]?.price ?? null,
        getSpread: () => {
          const bid = bids[0]?.price;
          const ask = asks[0]?.price;
          return bid && ask ? ask - bid : null;
        },
        getMidPrice: () => {
          const bid = bids[0]?.price;
          const ask = asks[0]?.price;
          return bid && ask ? (bid + ask) / 2 : null;
        },
        getDepth: (side: 'buy' | 'sell', levels: number) => {
          const orders = side === 'buy' ? bids : asks;
          const priceMap = new Map<number, number>();
          for (const o of orders) {
            priceMap.set(o.price, (priceMap.get(o.price) || 0) + o.quantity);
          }
          return [...priceMap.entries()].slice(0, levels);
        },
        bidCount: () => bids.length,
        askCount: () => asks.length,
      };
    };

    it('添加买单', () => {
      const ob = createOrderBook();
      ob.addOrder({ price: 10, quantity: 100, side: 'buy' });
      expect(ob.bidCount()).toBe(1);
      expect(ob.getBestBid()).toBe(10);
    });

    it('添加卖单', () => {
      const ob = createOrderBook();
      ob.addOrder({ price: 11, quantity: 50, side: 'sell' });
      expect(ob.askCount()).toBe(1);
      expect(ob.getBestAsk()).toBe(11);
    });

    it('买卖价差', () => {
      const ob = createOrderBook();
      ob.addOrder({ price: 10, quantity: 100, side: 'buy' });
      ob.addOrder({ price: 11, quantity: 100, side: 'sell' });
      expect(ob.getSpread()).toBe(1);
    });

    it('中间价计算', () => {
      const ob = createOrderBook();
      ob.addOrder({ price: 10, quantity: 100, side: 'buy' });
      ob.addOrder({ price: 12, quantity: 100, side: 'sell' });
      expect(ob.getMidPrice()).toBe(11);
    });

    it('最优价格', () => {
      const ob = createOrderBook();
      ob.addOrder({ price: 9, quantity: 100, side: 'buy' });
      ob.addOrder({ price: 10, quantity: 200, side: 'buy' });
      ob.addOrder({ price: 8, quantity: 150, side: 'buy' });
      expect(ob.getBestBid()).toBe(10);
    });

    it('买单按价格降序排列', () => {
      const ob = createOrderBook();
      ob.addOrder({ price: 9, quantity: 100, side: 'buy' });
      ob.addOrder({ price: 11, quantity: 100, side: 'buy' });
      ob.addOrder({ price: 10, quantity: 100, side: 'buy' });
      const depth = ob.getDepth('buy', 3);
      expect(depth[0][0]).toBe(11);
      expect(depth[1][0]).toBe(10);
      expect(depth[2][0]).toBe(9);
    });

    it('同价位合并数量', () => {
      const ob = createOrderBook();
      ob.addOrder({ price: 10, quantity: 100, side: 'buy' });
      ob.addOrder({ price: 10, quantity: 200, side: 'buy' });
      const depth = ob.getDepth('buy', 1);
      expect(depth[0][1]).toBe(300);
    });

    it('空订单簿价差为null', () => {
      const ob = createOrderBook();
      expect(ob.getSpread()).toBeNull();
      expect(ob.getMidPrice()).toBeNull();
    });
  });

  describe('市场冲击模型', () => {
    const priceImpact = (
      orderSize: number,
      adv: number, // average daily volume
      volatility: number,
      spread: number
    ): number => {
      const participation = orderSize / adv;
      const temporaryImpact = 0.1 * volatility * Math.sqrt(participation);
      const permanentImpact = 0.01 * participation * volatility;
      return spread / 2 + temporaryImpact + permanentImpact;
    };

    it('小订单冲击小', () => {
      const small = priceImpact(100, 1000000, 0.02, 0.01);
      expect(small).toBeLessThan(0.01);
    });

    it('大订单冲击大', () => {
      const small = priceImpact(100, 1000000, 0.02, 0.01);
      const large = priceImpact(100000, 1000000, 0.02, 0.01);
      expect(large).toBeGreaterThan(small);
    });

    it('高波动率增加冲击', () => {
      const low = priceImpact(10000, 1000000, 0.01, 0.01);
      const high = priceImpact(10000, 1000000, 0.05, 0.01);
      expect(high).toBeGreaterThan(low);
    });

    it('冲击包含价差一半', () => {
      const impact = priceImpact(0, 1000000, 0.02, 0.02);
      expect(impact).toBe(0.01); // spread/2 + 0
    });

    it('冲击值为正', () => {
      const impact = priceImpact(50000, 1000000, 0.03, 0.01);
      expect(impact).toBeGreaterThan(0);
    });
  });

  describe('VWAP计算', () => {
    const calcVWAP = (trades: { price: number; volume: number }[]): number => {
      const totalValue = trades.reduce((s, t) => s + t.price * t.volume, 0);
      const totalVolume = trades.reduce((s, t) => s + t.volume, 0);
      return totalVolume > 0 ? totalValue / totalVolume : 0;
    };

    it('简单VWAP', () => {
      const trades = [
        { price: 10, volume: 100 },
        { price: 11, volume: 200 },
      ];
      const vwap = calcVWAP(trades);
      expect(vwap).toBeCloseTo((10 * 100 + 11 * 200) / 300);
    });

    it('空交易返回0', () => {
      expect(calcVWAP([])).toBe(0);
    });

    it('权重偏向大成交量', () => {
      const trades = [
        { price: 10, volume: 1 },
        { price: 20, volume: 1000 },
      ];
      expect(calcVWAP(trades)).toBeCloseTo(20, 0);
    });

    it('等量交易等于算术平均', () => {
      const trades = [
        { price: 10, volume: 100 },
        { price: 20, volume: 100 },
      ];
      expect(calcVWAP(trades)).toBe(15);
    });
  });

  describe('TWAP计算', () => {
    const calcTWAP = (prices: { price: number; timeWeight: number }[]): number => {
      const totalWeight = prices.reduce((s, p) => s + p.timeWeight, 0);
      return totalWeight > 0
        ? prices.reduce((s, p) => s + p.price * p.timeWeight, 0) / totalWeight
        : 0;
    };

    it('时间加权平均', () => {
      const prices = [
        { price: 10, timeWeight: 1 },
        { price: 20, timeWeight: 3 },
      ];
      expect(calcTWAP(prices)).toBe(17.5);
    });

    it('等权等于简单平均', () => {
      const prices = [
        { price: 10, timeWeight: 1 },
        { price: 20, timeWeight: 1 },
      ];
      expect(calcTWAP(prices)).toBe(15);
    });

    it('空数据返回0', () => {
      expect(calcTWAP([])).toBe(0);
    });
  });

  describe('盘口深度分析', () => {
    const analyzeDepth = (
      bids: [number, number][],
      asks: [number, number][]
    ) => {
      const bidDepth = bids.reduce((s, [, q]) => s + q, 0);
      const askDepth = asks.reduce((s, [, q]) => s + q, 0);
      const imbalance = bidDepth / (bidDepth + askDepth);

      return {
        bidDepth,
        askDepth,
        imbalance,
        pressure: imbalance > 0.6 ? 'buy' : imbalance < 0.4 ? 'sell' : 'neutral',
      };
    };

    it('买盘大于卖盘压力为买', () => {
      const result = analyzeDepth(
        [[10, 1000], [9.9, 500]],
        [[10.1, 200], [10.2, 100]]
      );
      expect(result.pressure).toBe('buy');
    });

    it('卖盘大于买盘压力为卖', () => {
      const result = analyzeDepth(
        [[10, 100], [9.9, 50]],
        [[10.1, 1000], [10.2, 500]]
      );
      expect(result.pressure).toBe('sell');
    });

    it('均衡为中性', () => {
      const result = analyzeDepth(
        [[10, 500]],
        [[10.1, 500]]
      );
      expect(result.pressure).toBe('neutral');
    });

    it('计算不平衡度', () => {
      const result = analyzeDepth(
        [[10, 700]],
        [[10.1, 300]]
      );
      expect(result.imbalance).toBeCloseTo(0.7);
    });
  });

  describe('撤单率分析', () => {
    const calcCancelRate = (orders: { cancelled: boolean }[]): number => {
      if (orders.length === 0) return 0;
      return orders.filter(o => o.cancelled).length / orders.length;
    };

    it('全撤单率为1', () => {
      const orders = [{ cancelled: true }, { cancelled: true }];
      expect(calcCancelRate(orders)).toBe(1);
    });

    it('无撤单率为0', () => {
      const orders = [{ cancelled: false }, { cancelled: false }];
      expect(calcCancelRate(orders)).toBe(0);
    });

    it('空订单返回0', () => {
      expect(calcCancelRate([])).toBe(0);
    });

    it('50%撤单率', () => {
      const orders = [{ cancelled: true }, { cancelled: false }];
      expect(calcCancelRate(orders)).toBe(0.5);
    });
  });
});
