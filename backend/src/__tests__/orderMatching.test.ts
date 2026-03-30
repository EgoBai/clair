import { describe, it, expect } from 'vitest';

// 订单撮合逻辑测试
describe('订单撮合引擎', () => {
  interface Order {
    id: string;
    symbol: string;
    side: 'buy' | 'sell';
    price: number;
    quantity: number;
    timestamp: number;
    type: 'limit' | 'market';
  }

  interface Trade {
    buyOrderId: string;
    sellOrderId: string;
    price: number;
    quantity: number;
    timestamp: number;
  }

  function matchOrders(buyOrders: Order[], sellOrders: Order[]): Trade[] {
    const trades: Trade[] = [];
    const sortedBuys = [...buyOrders].sort((a, b) => b.price - a.price || a.timestamp - b.timestamp);
    const sortedSells = [...sellOrders].sort((a, b) => a.price - b.price || a.timestamp - b.timestamp);

    const buyRemaining = sortedBuys.map(o => ({ ...o }));
    const sellRemaining = sortedSells.map(o => ({ ...o }));

    for (const buy of buyRemaining) {
      for (const sell of sellRemaining) {
        if (buy.quantity <= 0) break;
        if (sell.quantity <= 0) continue;
        if (buy.price >= sell.price) {
          const tradeQty = Math.min(buy.quantity, sell.quantity);
          const tradePrice = buy.timestamp < sell.timestamp ? buy.price : sell.price;
          trades.push({
            buyOrderId: buy.id,
            sellOrderId: sell.id,
            price: tradePrice,
            quantity: tradeQty,
            timestamp: Date.now(),
          });
          buy.quantity -= tradeQty;
          sell.quantity -= tradeQty;
        }
      }
    }
    return trades;
  }

  describe('基本撮合', () => {
    it('买价>=卖价应该成交', () => {
      const buys: Order[] = [
        { id: 'b1', symbol: '600519', side: 'buy', price: 100, quantity: 100, timestamp: 1, type: 'limit' }
      ];
      const sells: Order[] = [
        { id: 's1', symbol: '600519', side: 'sell', price: 99, quantity: 100, timestamp: 2, type: 'limit' }
      ];
      const trades = matchOrders(buys, sells);
      expect(trades).toHaveLength(1);
      // 买单先到(timestamp=1), 所以成交价是买价
      expect(trades[0].price).toBe(100);
      expect(trades[0].quantity).toBe(100);
    });

    it('买价<卖价不应该成交', () => {
      const buys: Order[] = [
        { id: 'b1', symbol: '600519', side: 'buy', price: 98, quantity: 100, timestamp: 1, type: 'limit' }
      ];
      const sells: Order[] = [
        { id: 's1', symbol: '600519', side: 'sell', price: 100, quantity: 100, timestamp: 2, type: 'limit' }
      ];
      const trades = matchOrders(buys, sells);
      expect(trades).toHaveLength(0);
    });

    it('买价等于卖价应该成交', () => {
      const buys: Order[] = [
        { id: 'b1', symbol: '600519', side: 'buy', price: 100, quantity: 100, timestamp: 1, type: 'limit' }
      ];
      const sells: Order[] = [
        { id: 's1', symbol: '600519', side: 'sell', price: 100, quantity: 100, timestamp: 2, type: 'limit' }
      ];
      const trades = matchOrders(buys, sells);
      expect(trades).toHaveLength(1);
    });
  });

  describe('价格优先', () => {
    it('高价买单应该优先成交', () => {
      const buys: Order[] = [
        { id: 'b1', symbol: '600519', side: 'buy', price: 101, quantity: 50, timestamp: 2, type: 'limit' },
        { id: 'b2', symbol: '600519', side: 'buy', price: 102, quantity: 50, timestamp: 3, type: 'limit' },
      ];
      const sells: Order[] = [
        { id: 's1', symbol: '600519', side: 'sell', price: 100, quantity: 50, timestamp: 1, type: 'limit' },
      ];
      const trades = matchOrders(buys, sells);
      expect(trades[0].buyOrderId).toBe('b2');
    });

    it('低价卖单应该优先成交', () => {
      const buys: Order[] = [
        { id: 'b1', symbol: '600519', side: 'buy', price: 105, quantity: 50, timestamp: 1, type: 'limit' },
      ];
      const sells: Order[] = [
        { id: 's1', symbol: '600519', side: 'sell', price: 102, quantity: 50, timestamp: 3, type: 'limit' },
        { id: 's2', symbol: '600519', side: 'sell', price: 101, quantity: 50, timestamp: 2, type: 'limit' },
      ];
      const trades = matchOrders(buys, sells);
      expect(trades[0].sellOrderId).toBe('s2');
    });
  });

  describe('时间优先', () => {
    it('同价买单先到先成交', () => {
      const buys: Order[] = [
        { id: 'b1', symbol: '600519', side: 'buy', price: 100, quantity: 50, timestamp: 1, type: 'limit' },
        { id: 'b2', symbol: '600519', side: 'buy', price: 100, quantity: 50, timestamp: 2, type: 'limit' },
      ];
      const sells: Order[] = [
        { id: 's1', symbol: '600519', side: 'sell', price: 99, quantity: 50, timestamp: 3, type: 'limit' },
      ];
      const trades = matchOrders(buys, sells);
      expect(trades[0].buyOrderId).toBe('b1');
    });

    it('同价卖单先到先成交', () => {
      const buys: Order[] = [
        { id: 'b1', symbol: '600519', side: 'buy', price: 105, quantity: 50, timestamp: 3, type: 'limit' },
      ];
      const sells: Order[] = [
        { id: 's1', symbol: '600519', side: 'sell', price: 100, quantity: 50, timestamp: 1, type: 'limit' },
        { id: 's2', symbol: '600519', side: 'sell', price: 100, quantity: 50, timestamp: 2, type: 'limit' },
      ];
      const trades = matchOrders(buys, sells);
      expect(trades[0].sellOrderId).toBe('s1');
    });
  });

  describe('部分成交', () => {
    it('买量大于卖量应该部分成交', () => {
      const buys: Order[] = [
        { id: 'b1', symbol: '600519', side: 'buy', price: 100, quantity: 200, timestamp: 1, type: 'limit' }
      ];
      const sells: Order[] = [
        { id: 's1', symbol: '600519', side: 'sell', price: 99, quantity: 100, timestamp: 2, type: 'limit' }
      ];
      const trades = matchOrders(buys, sells);
      expect(trades).toHaveLength(1);
      expect(trades[0].quantity).toBe(100);
    });

    it('卖量大于买量应该部分成交', () => {
      const buys: Order[] = [
        { id: 'b1', symbol: '600519', side: 'buy', price: 100, quantity: 100, timestamp: 1, type: 'limit' }
      ];
      const sells: Order[] = [
        { id: 's1', symbol: '600519', side: 'sell', price: 99, quantity: 200, timestamp: 2, type: 'limit' }
      ];
      const trades = matchOrders(buys, sells);
      expect(trades).toHaveLength(1);
      expect(trades[0].quantity).toBe(100);
    });

    it('一笔买单可以匹配多笔卖单', () => {
      const buys: Order[] = [
        { id: 'b1', symbol: '600519', side: 'buy', price: 102, quantity: 200, timestamp: 1, type: 'limit' }
      ];
      const sells: Order[] = [
        { id: 's1', symbol: '600519', side: 'sell', price: 100, quantity: 100, timestamp: 2, type: 'limit' },
        { id: 's2', symbol: '600519', side: 'sell', price: 101, quantity: 100, timestamp: 3, type: 'limit' },
      ];
      const trades = matchOrders(buys, sells);
      expect(trades).toHaveLength(2);
      const totalQty = trades.reduce((sum, t) => sum + t.quantity, 0);
      expect(totalQty).toBe(200);
    });
  });

  describe('空订单簿', () => {
    it('没有买单不应该成交', () => {
      const sells: Order[] = [
        { id: 's1', symbol: '600519', side: 'sell', price: 100, quantity: 100, timestamp: 1, type: 'limit' }
      ];
      expect(matchOrders([], sells)).toHaveLength(0);
    });

    it('没有卖单不应该成交', () => {
      const buys: Order[] = [
        { id: 'b1', symbol: '600519', side: 'buy', price: 100, quantity: 100, timestamp: 1, type: 'limit' }
      ];
      expect(matchOrders(buys, [])).toHaveLength(0);
    });

    it('双方都空不应该成交', () => {
      expect(matchOrders([], [])).toHaveLength(0);
    });
  });

  describe('成交价格规则', () => {
    it('先到订单的价格应该是成交价', () => {
      const buys: Order[] = [
        { id: 'b1', symbol: '600519', side: 'buy', price: 102, quantity: 100, timestamp: 1, type: 'limit' }
      ];
      const sells: Order[] = [
        { id: 's1', symbol: '600519', side: 'sell', price: 100, quantity: 100, timestamp: 2, type: 'limit' }
      ];
      const trades = matchOrders(buys, sells);
      expect(trades[0].price).toBe(102); // 买单先到
    });

    it('卖单先到时卖价为成交价', () => {
      const buys: Order[] = [
        { id: 'b1', symbol: '600519', side: 'buy', price: 102, quantity: 100, timestamp: 2, type: 'limit' }
      ];
      const sells: Order[] = [
        { id: 's1', symbol: '600519', side: 'sell', price: 100, quantity: 100, timestamp: 1, type: 'limit' }
      ];
      const trades = matchOrders(buys, sells);
      expect(trades[0].price).toBe(100); // 卖单先到
    });
  });

  describe('多笔订单撮合', () => {
    it('应该正确撮合多笔订单', () => {
      const buys: Order[] = [
        { id: 'b1', symbol: '600519', side: 'buy', price: 102, quantity: 100, timestamp: 1, type: 'limit' },
        { id: 'b2', symbol: '600519', side: 'buy', price: 101, quantity: 200, timestamp: 2, type: 'limit' },
        { id: 'b3', symbol: '600519', side: 'buy', price: 99, quantity: 100, timestamp: 3, type: 'limit' }, // 不应成交
      ];
      const sells: Order[] = [
        { id: 's1', symbol: '600519', side: 'sell', price: 100, quantity: 150, timestamp: 1, type: 'limit' },
        { id: 's2', symbol: '600519', side: 'sell', price: 101, quantity: 100, timestamp: 2, type: 'limit' },
      ];
      const trades = matchOrders(buys, sells);
      expect(trades.length).toBeGreaterThan(0);
      // b3不应该参与成交（价格99 < 卖价100）
      expect(trades.some(t => t.buyOrderId === 'b3')).toBe(false);
    });
  });
});
