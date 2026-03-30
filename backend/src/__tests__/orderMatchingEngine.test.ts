import { describe, it, expect } from 'vitest';

describe('Order Matching Engine', () => {
  interface Order { id: string; side: 'buy' | 'sell'; price: number; quantity: number; timestamp: number; }
  interface Trade { buyOrderId: string; sellOrderId: string; price: number; quantity: number; }

  const matchOrders = (orders: Order[]): { trades: Trade[]; remaining: Order[] } => {
    const sorted = [...orders].sort((a, b) => {
      if (a.side === 'buy' && b.side === 'buy') return b.price - a.price || a.timestamp - b.timestamp;
      if (a.side === 'sell' && b.side === 'sell') return a.price - b.price || a.timestamp - b.timestamp;
      return a.side === 'buy' ? -1 : 1;
    });
    const buys: Order[] = sorted.filter(o => o.side === 'buy');
    const sells: Order[] = sorted.filter(o => o.side === 'sell');
    const trades: Trade[] = [];
    let bi = 0, si = 0;
    while (bi < buys.length && si < sells.length) {
      if (buys[bi].price < sells[si].price) { si++; continue; }
      const qty = Math.min(buys[bi].quantity, sells[si].quantity);
      const price = sells[si].timestamp < buys[bi].timestamp ? sells[si].price : buys[bi].price;
      trades.push({ buyOrderId: buys[bi].id, sellOrderId: sells[si].id, price, quantity: qty });
      buys[bi].quantity -= qty;
      sells[si].quantity -= qty;
      if (buys[bi].quantity === 0) bi++;
      if (sells[si].quantity === 0) si++;
    }
    return { trades, remaining: [...buys.slice(bi), ...sells.slice(si)] };
  };

  describe('订单撮合', () => {
    it('完全匹配', () => {
      const { trades } = matchOrders([
        { id: '1', side: 'buy', price: 100, quantity: 10, timestamp: 1 },
        { id: '2', side: 'sell', price: 100, quantity: 10, timestamp: 2 },
      ]);
      expect(trades.length).toBe(1);
      expect(trades[0].quantity).toBe(10);
    });
    it('部分匹配', () => {
      const { trades, remaining } = matchOrders([
        { id: '1', side: 'buy', price: 100, quantity: 20, timestamp: 1 },
        { id: '2', side: 'sell', price: 100, quantity: 10, timestamp: 2 },
      ]);
      expect(trades.length).toBe(1);
      expect(trades[0].quantity).toBe(10);
      expect(remaining.length).toBe(1);
    });
    it('无匹配', () => {
      const { trades } = matchOrders([
        { id: '1', side: 'buy', price: 90, quantity: 10, timestamp: 1 },
        { id: '2', side: 'sell', price: 100, quantity: 10, timestamp: 2 },
      ]);
      expect(trades.length).toBe(0);
    });
    it('多笔撮合', () => {
      const { trades } = matchOrders([
        { id: 'b1', side: 'buy', price: 101, quantity: 5, timestamp: 1 },
        { id: 'b2', side: 'buy', price: 100, quantity: 10, timestamp: 2 },
        { id: 's1', side: 'sell', price: 99, quantity: 8, timestamp: 3 },
      ]);
      expect(trades.length).toBe(2);
    });
    it('空订单', () => {
      const { trades, remaining } = matchOrders([]);
      expect(trades.length).toBe(0);
      expect(remaining.length).toBe(0);
    });
    it('只有买单', () => {
      const { remaining } = matchOrders([
        { id: '1', side: 'buy', price: 100, quantity: 10, timestamp: 1 },
      ]);
      expect(remaining.length).toBe(1);
    });
    it('价格优先', () => {
      const { trades } = matchOrders([
        { id: 'b1', side: 'buy', price: 102, quantity: 5, timestamp: 2 },
        { id: 'b2', side: 'buy', price: 101, quantity: 5, timestamp: 1 },
        { id: 's1', side: 'sell', price: 100, quantity: 5, timestamp: 3 },
      ]);
      expect(trades[0].buyOrderId).toBe('b1');
    });
    it('时间优先', () => {
      const { trades } = matchOrders([
        { id: 'b1', side: 'buy', price: 100, quantity: 5, timestamp: 2 },
        { id: 'b2', side: 'buy', price: 100, quantity: 5, timestamp: 1 },
        { id: 's1', side: 'sell', price: 100, quantity: 5, timestamp: 3 },
      ]);
      expect(trades[0].buyOrderId).toBe('b2');
    });
  });

  // 止损单
  const triggerStopOrders = (price: number, orders: { id: string; stopPrice: number; side: 'buy' | 'sell' }[]): string[] =>
    orders.filter(o => o.side === 'buy' ? price >= o.stopPrice : price <= o.stopPrice).map(o => o.id);

  describe('止损单触发', () => {
    it('卖出止损触发', () => {
      expect(triggerStopOrders(95, [{ id: '1', stopPrice: 100, side: 'sell' }])).toContain('1');
    });
    it('买入止损触发', () => {
      expect(triggerStopOrders(110, [{ id: '1', stopPrice: 100, side: 'buy' }])).toContain('1');
    });
    it('未触发', () => {
      expect(triggerStopOrders(105, [{ id: '1', stopPrice: 100, side: 'sell' }]).length).toBe(0);
    });
    it('边界触发', () => {
      expect(triggerStopOrders(100, [{ id: '1', stopPrice: 100, side: 'sell' }])).toContain('1');
    });
    it('多单部分触发', () => {
      const r = triggerStopOrders(98, [
        { id: '1', stopPrice: 100, side: 'sell' },
        { id: '2', stopPrice: 95, side: 'sell' },
      ]);
      expect(r).toContain('1');
      expect(r).not.toContain('2');
    });
  });

  // 订单簿深度
  const orderBookDepth = (orders: Order[], levels: number = 5): { bids: { price: number; qty: number }[]; asks: { price: number; qty: number }[] } => {
    const bidMap = new Map<number, number>();
    const askMap = new Map<number, number>();
    for (const o of orders) {
      const map = o.side === 'buy' ? bidMap : askMap;
      map.set(o.price, (map.get(o.price) || 0) + o.quantity);
    }
    const bids = [...bidMap.entries()].sort((a, b) => b[0] - a[0]).slice(0, levels).map(([price, qty]) => ({ price, qty }));
    const asks = [...askMap.entries()].sort((a, b) => a[0] - b[0]).slice(0, levels).map(([price, qty]) => ({ price, qty }));
    return { bids, asks };
  };

  describe('订单簿深度', () => {
    it('买卖分离', () => {
      const { bids, asks } = orderBookDepth([
        { id: '1', side: 'buy', price: 99, quantity: 10, timestamp: 1 },
        { id: '2', side: 'sell', price: 101, quantity: 5, timestamp: 2 },
      ]);
      expect(bids[0].price).toBe(99);
      expect(asks[0].price).toBe(101);
    });
    it('价格排序', () => {
      const { bids } = orderBookDepth([
        { id: '1', side: 'buy', price: 98, quantity: 10, timestamp: 1 },
        { id: '2', side: 'buy', price: 100, quantity: 5, timestamp: 2 },
      ]);
      expect(bids[0].price).toBe(100);
    });
    it('同价合并', () => {
      const { bids } = orderBookDepth([
        { id: '1', side: 'buy', price: 100, quantity: 10, timestamp: 1 },
        { id: '2', side: 'buy', price: 100, quantity: 5, timestamp: 2 },
      ]);
      expect(bids[0].qty).toBe(15);
    });
    it('层级限制', () => {
      const orders = Array.from({ length: 10 }, (_, i) => ({ id: String(i), side: 'buy' as const, price: 100 - i, quantity: 1, timestamp: i }));
      const { bids } = orderBookDepth(orders, 3);
      expect(bids.length).toBe(3);
    });
    it('空订单簿', () => {
      const { bids, asks } = orderBookDepth([]);
      expect(bids.length).toBe(0);
      expect(asks.length).toBe(0);
    });
  });

  // VWAP
  const calcVWAP = (trades: { price: number; volume: number }[]): number => {
    const totalVol = trades.reduce((s, t) => s + t.volume, 0);
    return totalVol === 0 ? 0 : trades.reduce((s, t) => s + t.price * t.volume, 0) / totalVol;
  };

  describe('VWAP', () => {
    it('加权计算', () => {
      expect(calcVWAP([{ price: 100, volume: 10 }, { price: 110, volume: 5 }])).toBeCloseTo(103.33, 1);
    });
    it('单笔', () => {
      expect(calcVWAP([{ price: 100, volume: 10 }])).toBe(100);
    });
    it('零成交量', () => {
      expect(calcVWAP([{ price: 100, volume: 0 }])).toBe(0);
    });
    it('等量', () => {
      expect(calcVWAP([{ price: 100, volume: 10 }, { price: 200, volume: 10 }])).toBe(150);
    });
    it('空交易', () => {
      expect(calcVWAP([])).toBe(0);
    });
  });
});
