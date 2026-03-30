import { describe, it, expect } from 'vitest';

// Order matching engine simulation
interface Order {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  price: number;
  quantity: number;
  timestamp: number;
  filled: number;
  status: 'pending' | 'partial' | 'filled' | 'cancelled';
}

interface Trade {
  buyOrderId: string;
  sellOrderId: string;
  price: number;
  quantity: string;
  timestamp: number;
}

function createOrder(partial: Partial<Order> & { symbol: string; side: 'buy' | 'sell'; price: number; quantity: number }): Order {
  return {
    id: partial.id || `order_${Date.now()}_${Math.random()}`,
    type: partial.type || 'limit',
    timestamp: partial.timestamp || Date.now(),
    filled: 0,
    status: 'pending',
    ...partial,
  } as Order;
}

function matchOrders(buyOrders: Order[], sellOrders: Order[]): Trade[] {
  const trades: Trade[] = [];
  const sortedBuys = [...buyOrders].sort((a, b) => b.price - a.price || a.timestamp - b.timestamp);
  const sortedSells = [...sellOrders].sort((a, b) => a.price - b.price || a.timestamp - b.timestamp);

  for (const buy of sortedBuys) {
    for (const sell of sortedSells) {
      if (buy.price >= sell.price && buy.filled < buy.quantity && sell.filled < sell.quantity) {
        const matchQty = Math.min(buy.quantity - buy.filled, sell.quantity - sell.filled);
        const matchPrice = sell.price;
        buy.filled += matchQty;
        sell.filled += matchQty;
        buy.status = buy.filled >= buy.quantity ? 'filled' : 'partial';
        sell.status = sell.filled >= sell.quantity ? 'filled' : 'partial';
        trades.push({
          buyOrderId: buy.id,
          sellOrderId: sell.id,
          price: matchPrice,
          quantity: String(matchQty),
          timestamp: Math.max(buy.timestamp, sell.timestamp),
        });
      }
    }
  }
  return trades;
}

function calculateVWAP(trades: Trade[]): number {
  if (trades.length === 0) return 0;
  let totalVolume = 0;
  let totalValue = 0;
  for (const trade of trades) {
    const qty = parseInt(trade.quantity);
    totalVolume += qty;
    totalValue += trade.price * qty;
  }
  return totalVolume === 0 ? 0 : totalValue / totalVolume;
}

function calculateOrderBookImbalance(bids: { price: number; quantity: number }[], asks: { price: number; quantity: number }[]) {
  const totalBidVolume = bids.reduce((sum, b) => sum + b.quantity, 0);
  const totalAskVolume = asks.reduce((sum, a) => sum + a.quantity, 0);
  const total = totalBidVolume + totalAskVolume;
  if (total === 0) return { imbalance: 0, bidPressure: 0.5, askPressure: 0.5 };
  return {
    imbalance: (totalBidVolume - totalAskVolume) / total,
    bidPressure: totalBidVolume / total,
    askPressure: totalAskVolume / total,
  };
}

function calculateSpread(bids: { price: number }[], asks: { price: number }[]) {
  if (bids.length === 0 || asks.length === 0) return { spread: 0, spreadPercent: 0 };
  const bestBid = Math.max(...bids.map(b => b.price));
  const bestAsk = Math.min(...asks.map(a => a.price));
  const mid = (bestBid + bestAsk) / 2;
  return {
    spread: bestAsk - bestBid,
    spreadPercent: mid === 0 ? 0 : ((bestAsk - bestBid) / mid) * 100,
  };
}

function calculateMarketImpact(orderSize: number, avgDailyVolume: number, volatility: number) {
  if (avgDailyVolume === 0) return 0;
  const participationRate = orderSize / avgDailyVolume;
  return volatility * Math.sqrt(participationRate) * 0.1;
}

function estimateSlippage(orderSize: number, orderBookDepth: number, spread: number) {
  if (orderBookDepth === 0) return spread;
  const depthImpact = (orderSize / orderBookDepth) * spread;
  return spread / 2 + depthImpact;
}

describe('撮合引擎与盘口分析', () => {
  describe('订单创建', () => {
    it('应该创建有效订单', () => {
      const order = createOrder({ symbol: '600519', side: 'buy', price: 1800, quantity: 100 });
      expect(order.symbol).toBe('600519');
      expect(order.side).toBe('buy');
      expect(order.status).toBe('pending');
      expect(order.filled).toBe(0);
    });

    it('应该有默认值', () => {
      const order = createOrder({ symbol: '000001', side: 'sell', price: 10, quantity: 500 });
      expect(order.type).toBe('limit');
      expect(order.id).toBeTruthy();
      expect(order.timestamp).toBeGreaterThan(0);
    });

    it('应该支持自定义ID', () => {
      const order = createOrder({ id: 'custom_123', symbol: '000001', side: 'buy', price: 10, quantity: 100 });
      expect(order.id).toBe('custom_123');
    });
  });

  describe('订单撮合', () => {
    it('应该撮合买单卖单', () => {
      const buys = [createOrder({ id: 'b1', symbol: '600519', side: 'buy', price: 100, quantity: 100 })];
      const sells = [createOrder({ id: 's1', symbol: '600519', side: 'sell', price: 99, quantity: 100 })];
      const trades = matchOrders(buys, sells);
      expect(trades.length).toBe(1);
      expect(trades[0].price).toBe(99);
      expect(trades[0].quantity).toBe('100');
    });

    it('应该部分成交', () => {
      const buys = [createOrder({ id: 'b1', symbol: '600519', side: 'buy', price: 100, quantity: 200 })];
      const sells = [createOrder({ id: 's1', symbol: '600519', side: 'sell', price: 99, quantity: 100 })];
      const trades = matchOrders(buys, sells);
      expect(trades.length).toBe(1);
      expect(trades[0].quantity).toBe('100');
      expect(buys[0].status).toBe('partial');
      expect(sells[0].status).toBe('filled');
    });

    it('价格不匹配不应该成交', () => {
      const buys = [createOrder({ id: 'b1', symbol: '600519', side: 'buy', price: 98, quantity: 100 })];
      const sells = [createOrder({ id: 's1', symbol: '600519', side: 'sell', price: 100, quantity: 100 })];
      const trades = matchOrders(buys, sells);
      expect(trades.length).toBe(0);
    });

    it('应该按价格优先撮合', () => {
      const buys = [
        createOrder({ id: 'b1', symbol: 'X', side: 'buy', price: 100, quantity: 100, timestamp: 1 }),
        createOrder({ id: 'b2', symbol: 'X', side: 'buy', price: 101, quantity: 100, timestamp: 2 }),
      ];
      const sells = [createOrder({ id: 's1', symbol: 'X', side: 'sell', price: 99, quantity: 100 })];
      const trades = matchOrders(buys, sells);
      expect(trades[0].buyOrderId).toBe('b2');
    });

    it('相同价格应该时间优先', () => {
      const buys = [
        createOrder({ id: 'b1', symbol: 'X', side: 'buy', price: 100, quantity: 50, timestamp: 1 }),
        createOrder({ id: 'b2', symbol: 'X', side: 'buy', price: 100, quantity: 50, timestamp: 2 }),
      ];
      const sells = [createOrder({ id: 's1', symbol: 'X', side: 'sell', price: 99, quantity: 100 })];
      const trades = matchOrders(buys, sells);
      expect(trades[0].buyOrderId).toBe('b1');
    });
  });

  describe('VWAP计算', () => {
    it('应该正确计算成交量加权均价', () => {
      const trades: Trade[] = [
        { buyOrderId: '', sellOrderId: '', price: 100, quantity: '100', timestamp: 1 },
        { buyOrderId: '', sellOrderId: '', price: 102, quantity: '200', timestamp: 2 },
      ];
      expect(calculateVWAP(trades)).toBeCloseTo(101.333, 2);
    });

    it('无交易时返回0', () => {
      expect(calculateVWAP([])).toBe(0);
    });

    it('单笔交易VWAP等于该价格', () => {
      const trades: Trade[] = [{ buyOrderId: '', sellOrderId: '', price: 50, quantity: '100', timestamp: 1 }];
      expect(calculateVWAP(trades)).toBe(50);
    });

    it('等量交易应该是简单均价', () => {
      const trades: Trade[] = [
        { buyOrderId: '', sellOrderId: '', price: 10, quantity: '100', timestamp: 1 },
        { buyOrderId: '', sellOrderId: '', price: 20, quantity: '100', timestamp: 2 },
      ];
      expect(calculateVWAP(trades)).toBe(15);
    });
  });

  describe('盘口不平衡度', () => {
    it('应该正确计算买卖压力', () => {
      const result = calculateOrderBookImbalance(
        [{ price: 10, quantity: 300 }, { price: 9, quantity: 200 }],
        [{ price: 11, quantity: 100 }, { price: 12, quantity: 150 }]
      );
      expect(result.imbalance).toBeGreaterThan(0);
      expect(result.bidPressure).toBeGreaterThan(result.askPressure);
    });

    it('均衡盘口应该imbalance接近0', () => {
      const result = calculateOrderBookImbalance(
        [{ price: 10, quantity: 250 }],
        [{ price: 11, quantity: 250 }]
      );
      expect(result.imbalance).toBeCloseTo(0);
    });

    it('空盘口应该返回中性值', () => {
      const result = calculateOrderBookImbalance([], []);
      expect(result.imbalance).toBe(0);
      expect(result.bidPressure).toBe(0.5);
    });
  });

  describe('买卖价差', () => {
    it('应该正确计算价差', () => {
      const result = calculateSpread(
        [{ price: 100 }, { price: 99 }],
        [{ price: 101 }, { price: 102 }]
      );
      expect(result.spread).toBe(1);
      expect(result.spreadPercent).toBeCloseTo(0.995, 2);
    });

    it('空盘口价差为0', () => {
      expect(calculateSpread([], []).spread).toBe(0);
    });
  });

  describe('市场冲击', () => {
    it('应该计算价格冲击', () => {
      const impact = calculateMarketImpact(10000, 1000000, 0.02);
      expect(impact).toBeGreaterThan(0);
    });

    it('零成交量返回0', () => {
      expect(calculateMarketImpact(100, 0, 0.02)).toBe(0);
    });

    it('大订单冲击应该更大', () => {
      const small = calculateMarketImpact(1000, 1000000, 0.02);
      const large = calculateMarketImpact(100000, 1000000, 0.02);
      expect(large).toBeGreaterThan(small);
    });
  });

  describe('滑点估算', () => {
    it('应该估算滑点', () => {
      const slippage = estimateSlippage(100, 10000, 0.01);
      expect(slippage).toBeGreaterThan(0);
    });

    it('零深度应该返回价差', () => {
      expect(estimateSlippage(100, 0, 0.02)).toBe(0.02);
    });

    it('大订单滑点应该更大', () => {
      const small = estimateSlippage(100, 10000, 0.01);
      const large = estimateSlippage(5000, 10000, 0.01);
      expect(large).toBeGreaterThan(small);
    });
  });
});
