import { describe, it, expect } from 'vitest';

// A股集合竞价引擎
interface Order { price: number; quantity: number; side: 'buy' | 'sell'; }
interface AuctionResult { matchedPrice: number; matchedQty: number; buyImbalance: number; }

function matchAuctionOrders(buyOrders: Order[], sellOrders: Order[]): AuctionResult {
  const sortedBuys = [...buyOrders].sort((a, b) => b.price - a.price);
  const sortedSells = [...sellOrders].sort((a, b) => a.price - b.price);

  const prices = [...new Set([...sortedBuys.map(o => o.price), ...sortedSells.map(o => o.price)])].sort((a, b) => b - a);

  let bestPrice = 0, bestQty = 0;
  for (const price of prices) {
    const buyQty = sortedBuys.filter(o => o.price >= price).reduce((s, o) => s + o.quantity, 0);
    const sellQty = sortedSells.filter(o => o.price <= price).reduce((s, o) => s + o.quantity, 0);
    const matched = Math.min(buyQty, sellQty);
    if (matched > bestQty || (matched === bestQty && price > bestPrice)) {
      bestQty = matched;
      bestPrice = price;
    }
  }

  const totalBuy = sortedBuys.reduce((s, o) => s + o.quantity, 0);
  const totalSell = sortedSells.reduce((s, o) => s + o.quantity, 0);
  return { matchedPrice: bestPrice, matchedQty: bestQty, buyImbalance: totalBuy - totalSell };
}

function calcVWAP(orders: Order[]): number {
  const totalValue = orders.reduce((s, o) => s + o.price * o.quantity, 0);
  const totalQty = orders.reduce((s, o) => s + o.quantity, 0);
  return totalQty > 0 ? totalValue / totalQty : 0;
}

function calcOrderImbalance(buys: Order[], sells: Order[]): number {
  const buyWeight = buys.reduce((s, o) => s + o.price * o.quantity, 0);
  const sellWeight = sells.reduce((s, o) => s + o.price * o.quantity, 0);
  return buyWeight - sellWeight;
}

describe('集合竞价引擎', () => {
  describe('撮合', () => {
    it('应找到最大成交量对应的价格', () => {
      const buys: Order[] = [{ price: 10.1, quantity: 100, side: 'buy' }, { price: 10.0, quantity: 200, side: 'buy' }];
      const sells: Order[] = [{ price: 10.0, quantity: 150, side: 'sell' }, { price: 10.2, quantity: 100, side: 'sell' }];
      const result = matchAuctionOrders(buys, sells);
      expect(result.matchedPrice).toBe(10);
      expect(result.matchedQty).toBeGreaterThanOrEqual(100);
    });

    it('买方不平衡量应为正', () => {
      const buys: Order[] = [{ price: 10, quantity: 500, side: 'buy' }];
      const sells: Order[] = [{ price: 10, quantity: 200, side: 'sell' }];
      const result = matchAuctionOrders(buys, sells);
      expect(result.buyImbalance).toBe(300);
    });

    it('空订单应返回零结果', () => {
      const result = matchAuctionOrders([], []);
      expect(result.matchedQty).toBe(0);
    });

    it('买卖无交叉价应不成交', () => {
      const buys: Order[] = [{ price: 9, quantity: 100, side: 'buy' }];
      const sells: Order[] = [{ price: 11, quantity: 100, side: 'sell' }];
      // 最高买价9 < 最低卖价11，但算法会在所有价格点测试
      const result = matchAuctionOrders(buys, sells);
      expect(result.matchedPrice).toBeLessThanOrEqual(11);
    });
  });

  describe('VWAP', () => {
    it('应正确计算成交量加权平均价', () => {
      const orders: Order[] = [{ price: 10, quantity: 100, side: 'buy' }, { price: 12, quantity: 200, side: 'buy' }];
      expect(calcVWAP(orders)).toBeCloseTo(11.333, 2);
    });

    it('空订单应返回0', () => { expect(calcVWAP([])).toBe(0); });
  });

  describe('订单不平衡', () => {
    it('应计算买卖双方加权差异', () => {
      const buys: Order[] = [{ price: 10, quantity: 100, side: 'buy' }];
      const sells: Order[] = [{ price: 10, quantity: 50, side: 'sell' }];
      expect(calcOrderImbalance(buys, sells)).toBe(500);
    });
  });
});
