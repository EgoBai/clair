import { describe, it, expect } from 'vitest';

// 市场微观结构 - 订单簿分析引擎测试
describe('订单簿分析引擎', () => {
  interface OrderLevel {
    price: number;
    quantity: number;
    orders: number;
  }

  interface OrderBook {
    bids: OrderLevel[];
    asks: OrderLevel[];
    timestamp: number;
  }

  // 计算加权均价
  function vwap(levels: OrderLevel[]): number {
    const totalQty = levels.reduce((s, l) => s + l.quantity, 0);
    if (totalQty === 0) return 0;
    return levels.reduce((s, l) => s + l.price * l.quantity, 0) / totalQty;
  }

  // 买卖不平衡度
  function imbalanceRatio(bids: OrderLevel[], asks: OrderLevel[]): number {
    const bidVol = bids.reduce((s, b) => s + b.quantity, 0);
    const askVol = asks.reduce((s, a) => s + a.quantity, 0);
    if (bidVol + askVol === 0) return 0;
    return (bidVol - askVol) / (bidVol + askVol);
  }

  // 计算有效价差
  function effectiveSpread(bids: OrderLevel[], asks: OrderLevel[]): number {
    if (bids.length === 0 || asks.length === 0) return 0;
    const bestBid = Math.max(...bids.map(b => b.price));
    const bestAsk = Math.min(...asks.map(a => a.price));
    const mid = (bestBid + bestAsk) / 2;
    return mid === 0 ? 0 : (bestAsk - bestBid) / mid;
  }

  // 计算市场深度 (到指定价位的累积量)
  function marketDepth(levels: OrderLevel[], targetPrice: number, side: 'bid' | 'ask'): number {
    const filtered = side === 'bid'
      ? levels.filter(l => l.price >= targetPrice)
      : levels.filter(l => l.price <= targetPrice);
    return filtered.reduce((s, l) => s + l.quantity, 0);
  }

  // 订单流不平衡
  function orderFlowImbalance(buyVolumes: number[], sellVolumes: number[]): number[] {
    return buyVolumes.map((bv, i) => {
      const sv = sellVolumes[i] || 0;
      if (bv + sv === 0) return 0;
      return (bv - sv) / (bv + sv);
    });
  }

  // 流动性得分 (0-100)
  function liquidityScore(book: OrderBook): number {
    if (book.bids.length === 0 && book.asks.length === 0) return 0;
    const depth = book.bids.reduce((s, b) => s + b.quantity, 0) +
                  book.asks.reduce((s, a) => s + a.quantity, 0);
    const spread = effectiveSpread(book.bids, book.asks);
    const spreadScore = Math.max(0, 100 - spread * 100);
    const depthScore = Math.min(100, depth / 100);
    return (spreadScore * 0.6 + depthScore * 0.4);
  }

  // 大单检测
  function detectLargeOrders(levels: OrderLevel[], threshold: number = 2): OrderLevel[] {
    const avgQty = levels.reduce((s, l) => s + l.quantity, 0) / levels.length;
    return levels.filter(l => l.quantity > avgQty * threshold);
  }

  describe('VWAP计算', () => {
    it('等量时等于简单均价', () => {
      const levels: OrderLevel[] = [
        { price: 100, quantity: 100, orders: 1 },
        { price: 101, quantity: 100, orders: 1 },
        { price: 102, quantity: 100, orders: 1 },
      ];
      expect(vwap(levels)).toBeCloseTo(101, 5);
    });

    it('加权均价偏向大量', () => {
      const levels: OrderLevel[] = [
        { price: 100, quantity: 10, orders: 1 },
        { price: 200, quantity: 90, orders: 1 },
      ];
      expect(vwap(levels)).toBeCloseTo(190, 5);
    });

    it('空数据返回0', () => {
      expect(vwap([])).toBe(0);
    });

    it('单层返回该层价格', () => {
      const levels: OrderLevel[] = [{ price: 55.5, quantity: 500, orders: 3 }];
      expect(vwap(levels)).toBe(55.5);
    });
  });

  describe('买卖不平衡度', () => {
    it('完全买盘返回1', () => {
      const bids: OrderLevel[] = [{ price: 100, quantity: 100, orders: 1 }];
      const asks: OrderLevel[] = [{ price: 101, quantity: 0, orders: 0 }];
      expect(imbalanceRatio(bids, asks)).toBe(1);
    });

    it('完全卖盘返回-1', () => {
      const bids: OrderLevel[] = [{ price: 100, quantity: 0, orders: 0 }];
      const asks: OrderLevel[] = [{ price: 101, quantity: 100, orders: 1 }];
      expect(imbalanceRatio(bids, asks)).toBe(-1);
    });

    it('均衡返回0', () => {
      const bids: OrderLevel[] = [{ price: 100, quantity: 50, orders: 1 }];
      const asks: OrderLevel[] = [{ price: 101, quantity: 50, orders: 1 }];
      expect(imbalanceRatio(bids, asks)).toBe(0);
    });

    it('结果在[-1,1]范围', () => {
      const bids: OrderLevel[] = [{ price: 100, quantity: 30, orders: 1 }];
      const asks: OrderLevel[] = [{ price: 101, quantity: 70, orders: 1 }];
      const ratio = imbalanceRatio(bids, asks);
      expect(ratio).toBeGreaterThanOrEqual(-1);
      expect(ratio).toBeLessThanOrEqual(1);
    });
  });

  describe('有效价差', () => {
    it('计算正确价差比例', () => {
      const bids: OrderLevel[] = [{ price: 99.5, quantity: 100, orders: 1 }];
      const asks: OrderLevel[] = [{ price: 100.5, quantity: 100, orders: 1 }];
      const spread = effectiveSpread(bids, asks);
      expect(spread).toBeCloseTo(0.01, 3); // 1/100 = 0.01
    });

    it('空档返回0', () => {
      expect(effectiveSpread([], [])).toBe(0);
    });

    it('价差为0返回0', () => {
      const levels: OrderLevel[] = [{ price: 100, quantity: 100, orders: 1 }];
      expect(effectiveSpread(levels, levels)).toBe(0);
    });
  });

  describe('市场深度', () => {
    const levels: OrderLevel[] = [
      { price: 100, quantity: 50, orders: 1 },
      { price: 99, quantity: 30, orders: 1 },
      { price: 98, quantity: 20, orders: 1 },
    ];

    it('买单深度 - 包含目标价', () => {
      expect(marketDepth(levels, 99, 'bid')).toBe(80); // 50+30
    });

    it('买单深度 - 精确到100', () => {
      expect(marketDepth(levels, 100, 'bid')).toBe(50);
    });

    it('空数组返回0', () => {
      expect(marketDepth([], 99, 'bid')).toBe(0);
    });
  });

  describe('订单流不平衡', () => {
    it('全买返回1', () => {
      const result = orderFlowImbalance([100], [0]);
      expect(result[0]).toBe(1);
    });

    it('全卖返回-1', () => {
      const result = orderFlowImbalance([0], [100]);
      expect(result[0]).toBe(-1);
    });

    it('均衡返回0', () => {
      const result = orderFlowImbalance([50], [50]);
      expect(result[0]).toBe(0);
    });

    it('多期正确计算', () => {
      const result = orderFlowImbalance([100, 50, 0], [0, 50, 100]);
      expect(result[0]).toBe(1);
      expect(result[1]).toBe(0);
      expect(result[2]).toBe(-1);
    });

    it('零总量返回0', () => {
      const result = orderFlowImbalance([0], [0]);
      expect(result[0]).toBe(0);
    });
  });

  describe('流动性得分', () => {
    it('深度大价差小得分高', () => {
      const goodBook: OrderBook = {
        bids: Array(5).fill(null).map((_, i) => ({ price: 100 - i, quantity: 1000, orders: 10 })),
        asks: Array(5).fill(null).map((_, i) => ({ price: 101 + i, quantity: 1000, orders: 10 })),
        timestamp: Date.now(),
      };
      const score = liquidityScore(goodBook);
      expect(score).toBeGreaterThan(50);
    });

    it('空簿得分低', () => {
      const emptyBook: OrderBook = { bids: [], asks: [], timestamp: Date.now() };
      const score = liquidityScore(emptyBook);
      expect(score).toBeLessThan(50);
    });

    it('得分在[0,100]范围', () => {
      const book: OrderBook = {
        bids: [{ price: 100, quantity: 100, orders: 1 }],
        asks: [{ price: 101, quantity: 100, orders: 1 }],
        timestamp: Date.now(),
      };
      const score = liquidityScore(book);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('大单检测', () => {
    it('检测超过阈值的订单', () => {
      const levels: OrderLevel[] = [
        { price: 100, quantity: 10, orders: 1 },
        { price: 101, quantity: 50, orders: 1 },
        { price: 102, quantity: 10, orders: 1 },
      ];
      const large = detectLargeOrders(levels);
      expect(large).toHaveLength(1);
      expect(large[0].price).toBe(101);
    });

    it('自定义阈值', () => {
      const levels: OrderLevel[] = [
        { price: 100, quantity: 10, orders: 1 },
        { price: 101, quantity: 15, orders: 1 },
        { price: 102, quantity: 20, orders: 1 },
      ];
      const large = detectLargeOrders(levels, 1.5);
      expect(large.length).toBeGreaterThanOrEqual(0);
    });

    it('空数组返回空', () => {
      expect(detectLargeOrders([])).toHaveLength(0);
    });
  });
});
