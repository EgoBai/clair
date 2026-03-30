import { describe, it, expect } from 'vitest';

/**
 * 订单管理系统测试
 */

interface Order {
  id: string; code: string; side: 'buy' | 'sell'; type: 'limit' | 'market' | 'stop';
  price: number; quantity: number; filledQty: number; status: 'pending' | 'partial' | 'filled' | 'cancelled';
  timestamp: number; stopPrice?: number;
}

const createOrder = (params: Partial<Order>): Order => ({
  id: params.id ?? `ord_${Date.now()}`,
  code: params.code ?? '000001',
  side: params.side ?? 'buy',
  type: params.type ?? 'limit',
  price: params.price ?? 0,
  quantity: params.quantity ?? 100,
  filledQty: 0,
  status: 'pending',
  timestamp: params.timestamp ?? Date.now(),
  ...params,
  filledQty: params.filledQty ?? 0,
  status: params.status ?? 'pending',
});

const validateOrder = (order: Order): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  if (order.quantity <= 0) errors.push('quantity must be positive');
  if (order.type === 'limit' && order.price <= 0) errors.push('limit order needs positive price');
  if (order.type === 'stop' && (!order.stopPrice || order.stopPrice <= 0)) errors.push('stop order needs stop price');
  if (order.filledQty > order.quantity) errors.push('filled exceeds quantity');
  if (!['buy', 'sell'].includes(order.side)) errors.push('invalid side');
  if (!order.code || !/^\d{6}$/.test(order.code)) errors.push('invalid stock code');
  return { valid: errors.length === 0, errors };
};

const matchOrders = (buyOrders: Order[], sellOrders: Order[]): { trades: { buyId: string; sellId: string; price: number; qty: number }[]; remaining: { buys: Order[]; sells: Order[] } } => {
  const trades: { buyId: string; sellId: string; price: number; qty: number }[] = [];
  const sortedBuys = [...buyOrders].sort((a, b) => b.price - a.price || a.timestamp - b.timestamp);
  const sortedSells = [...sellOrders].sort((a, b) => a.price - b.price || a.timestamp - b.timestamp);

  for (const buy of sortedBuys) {
    const buyRemain = buy.quantity - buy.filledQty;
    if (buyRemain <= 0) continue;
    for (const sell of sortedSells) {
      const sellRemain = sell.quantity - sell.filledQty;
      if (sellRemain <= 0) continue;
      if (sell.price > buy.price) break;
      const matchQty = Math.min(buyRemain, sellRemain);
      const matchPrice = (buy.price + sell.price) / 2;
      trades.push({ buyId: buy.id, sellId: sell.id, price: matchPrice, qty: matchQty });
      buy.filledQty += matchQty;
      sell.filledQty += matchQty;
      buy.status = buy.filledQty >= buy.quantity ? 'filled' : 'partial';
      sell.status = sell.filledQty >= sell.quantity ? 'filled' : 'partial';
    }
  }

  return {
    trades,
    remaining: {
      buys: sortedBuys.filter(b => b.filledQty < b.quantity),
      sells: sortedSells.filter(s => s.filledQty < s.quantity),
    }
  };
};

const calcOrderValue = (order: Order): number => order.price * order.quantity;
const calcFilledValue = (order: Order): number => order.price * order.filledQty;
const calcAvgFillPrice = (trades: { price: number; qty: number }[]): number => {
  if (trades.length === 0) return 0;
  const totalQty = trades.reduce((s, t) => s + t.qty, 0);
  return totalQty === 0 ? 0 : trades.reduce((s, t) => s + t.price * t.qty, 0) / totalQty;
};

const cancelOrder = (order: Order): Order => {
  if (order.status === 'filled') return order;
  return { ...order, status: 'cancelled' };
};

const splitOrder = (order: Order, parts: number): Order[] => {
  const qtyPerPart = Math.floor(order.quantity / parts);
  const remainder = order.quantity % parts;
  return Array.from({ length: parts }, (_, i) => ({
    ...order,
    id: `${order.id}_${i}`,
    quantity: qtyPerPart + (i < remainder ? 1 : 0),
    filledQty: 0,
    status: 'pending' as const,
  }));
};

describe('订单管理系统', () => {
  describe('订单创建', () => {
    it('应该创建有效买单', () => {
      const order = createOrder({ code: '000001', side: 'buy', price: 10, quantity: 100 });
      expect(order.side).toBe('buy');
      expect(order.status).toBe('pending');
    });

    it('应该创建有效卖单', () => {
      const order = createOrder({ code: '600000', side: 'sell', price: 20, quantity: 50 });
      expect(order.side).toBe('sell');
    });

    it('默认值应合理', () => {
      const order = createOrder({});
      expect(order.quantity).toBe(100);
      expect(order.filledQty).toBe(0);
      expect(order.status).toBe('pending');
    });

    it('市价单不需要价格', () => {
      const order = createOrder({ type: 'market', price: 0, quantity: 100 });
      expect(order.type).toBe('market');
    });

    it('止损单需要止损价', () => {
      const order = createOrder({ type: 'stop', stopPrice: 9.5, price: 10, quantity: 100 });
      expect(order.stopPrice).toBe(9.5);
    });

    it('订单ID应唯一', () => {
      const o1 = createOrder({ id: 'a' });
      const o2 = createOrder({ id: 'b' });
      expect(o1.id).not.toBe(o2.id);
    });
  });

  describe('订单验证', () => {
    it('有效限价单应通过', () => {
      const order = createOrder({ code: '000001', side: 'buy', type: 'limit', price: 10, quantity: 100 });
      expect(validateOrder(order).valid).toBe(true);
    });

    it('零数量应失败', () => {
      const order = createOrder({ code: '000001', quantity: 0, price: 10 });
      expect(validateOrder(order).valid).toBe(false);
    });

    it('限价单零价格应失败', () => {
      const order = createOrder({ code: '000001', type: 'limit', price: 0, quantity: 100 });
      expect(validateOrder(order).valid).toBe(false);
    });

    it('止损单无止损价应失败', () => {
      const order = createOrder({ code: '000001', type: 'stop', price: 10, quantity: 100 });
      expect(validateOrder(order).valid).toBe(false);
    });

    it('无效股票代码应失败', () => {
      const order = createOrder({ code: 'ABC', price: 10, quantity: 100 });
      expect(validateOrder(order).valid).toBe(false);
    });

    it('六位数字代码应通过', () => {
      const order = createOrder({ code: '600036', price: 10, quantity: 100 });
      expect(validateOrder(order).valid).toBe(true);
    });

    it('成交超过总量应失败', () => {
      const order = createOrder({ code: '000001', price: 10, quantity: 100, filledQty: 200 });
      expect(validateOrder(order).valid).toBe(false);
    });

    it('错误信息应准确', () => {
      const order = createOrder({ code: 'ABC', quantity: -1, price: 0 });
      const { errors } = validateOrder(order);
      expect(errors.length).toBeGreaterThan(1);
    });

    it('负数量应失败', () => {
      const order = createOrder({ code: '000001', quantity: -50, price: 10 });
      expect(validateOrder(order).valid).toBe(false);
    });

    it('市价单零价格应通过', () => {
      const order = createOrder({ code: '000001', type: 'market', price: 0, quantity: 100 });
      expect(validateOrder(order).valid).toBe(true);
    });
  });

  describe('订单撮合', () => {
    it('应该撮合可匹配的订单', () => {
      const buys = [createOrder({ id: 'b1', price: 10, quantity: 100 })];
      const sells = [createOrder({ id: 's1', price: 9, quantity: 100 })];
      const { trades } = matchOrders(buys, sells);
      expect(trades.length).toBe(1);
    });

    it('价格不匹配不应撮合', () => {
      const buys = [createOrder({ id: 'b1', price: 9, quantity: 100 })];
      const sells = [createOrder({ id: 's1', price: 10, quantity: 100 })];
      const { trades } = matchOrders(buys, sells);
      expect(trades.length).toBe(0);
    });

    it('应该按价格优先撮合', () => {
      const buys = [
        createOrder({ id: 'b1', price: 10, quantity: 50 }),
        createOrder({ id: 'b2', price: 11, quantity: 50 }),
      ];
      const sells = [createOrder({ id: 's1', price: 9, quantity: 100 })];
      const { trades } = matchOrders(buys, sells);
      expect(trades[0].buyId).toBe('b2');
    });

    it('空订单簿返回空', () => {
      const { trades } = matchOrders([], []);
      expect(trades).toEqual([]);
    });

    it('部分成交应更新状态', () => {
      const buys = [createOrder({ id: 'b1', price: 10, quantity: 200 })];
      const sells = [createOrder({ id: 's1', price: 9, quantity: 100 })];
      const { trades } = matchOrders(buys, sells);
      expect(trades[0].qty).toBe(100);
      expect(buys[0].filledQty).toBe(100);
      expect(buys[0].status).toBe('partial');
    });

    it('完全成交应标记filled', () => {
      const buys = [createOrder({ id: 'b1', price: 10, quantity: 100 })];
      const sells = [createOrder({ id: 's1', price: 9, quantity: 100 })];
      matchOrders(buys, sells);
      expect(buys[0].status).toBe('filled');
      expect(sells[0].status).toBe('filled');
    });

    it('撮合价格应为买卖中间价', () => {
      const buys = [createOrder({ id: 'b1', price: 10, quantity: 100 })];
      const sells = [createOrder({ id: 's1', price: 9, quantity: 100 })];
      const { trades } = matchOrders(buys, sells);
      expect(trades[0].price).toBe(9.5);
    });

    it('时间优先同价位', () => {
      const buys = [
        createOrder({ id: 'b1', price: 10, quantity: 50, timestamp: 2 }),
        createOrder({ id: 'b2', price: 10, quantity: 50, timestamp: 1 }),
      ];
      const sells = [createOrder({ id: 's1', price: 9, quantity: 100 })];
      const { trades } = matchOrders(buys, sells);
      expect(trades[0].buyId).toBe('b2');
    });

    it('多笔撮合', () => {
      const buys = [
        createOrder({ id: 'b1', price: 10, quantity: 50 }),
        createOrder({ id: 'b2', price: 9.5, quantity: 50 }),
      ];
      const sells = [
        createOrder({ id: 's1', price: 9, quantity: 50 }),
        createOrder({ id: 's2', price: 9.5, quantity: 50 }),
      ];
      const { trades } = matchOrders(buys, sells);
      expect(trades.length).toBe(2);
    });
  });

  describe('订单取消', () => {
    it('pending订单应取消', () => {
      const order = createOrder({ status: 'pending' });
      expect(cancelOrder(order).status).toBe('cancelled');
    });

    it('partial订单应取消', () => {
      const order = createOrder({ status: 'partial', filledQty: 50, quantity: 100 });
      expect(cancelOrder(order).status).toBe('cancelled');
    });

    it('filled订单不应取消', () => {
      const order = createOrder({ status: 'filled', filledQty: 100, quantity: 100 });
      expect(cancelOrder(order).status).toBe('filled');
    });

    it('取消不应修改原订单', () => {
      const order = createOrder({ status: 'pending' });
      cancelOrder(order);
      expect(order.status).toBe('pending');
    });
  });

  describe('订单拆分', () => {
    it('应该拆分为指定份数', () => {
      const order = createOrder({ quantity: 100 });
      const parts = splitOrder(order, 3);
      expect(parts.length).toBe(3);
    });

    it('拆分总量应等于原数量', () => {
      const order = createOrder({ quantity: 100 });
      const parts = splitOrder(order, 3);
      const total = parts.reduce((s, p) => s + p.quantity, 0);
      expect(total).toBe(100);
    });

    it('每份应有唯一ID', () => {
      const order = createOrder({ id: 'orig' });
      const parts = splitOrder(order, 3);
      const ids = new Set(parts.map(p => p.id));
      expect(ids.size).toBe(3);
    });

    it('拆分后都应为pending', () => {
      const order = createOrder({ quantity: 100 });
      const parts = splitOrder(order, 2);
      for (const p of parts) expect(p.status).toBe('pending');
    });

    it('不能整除时余数应分配', () => {
      const order = createOrder({ quantity: 10 });
      const parts = splitOrder(order, 3);
      const total = parts.reduce((s, p) => s + p.quantity, 0);
      expect(total).toBe(10);
    });

    it('拆分为1份应等于原订单', () => {
      const order = createOrder({ quantity: 100, price: 10 });
      const parts = splitOrder(order, 1);
      expect(parts.length).toBe(1);
      expect(parts[0].quantity).toBe(100);
    });
  });

  describe('订单价值计算', () => {
    it('订单总价值应正确', () => {
      const order = createOrder({ price: 10, quantity: 100 });
      expect(calcOrderValue(order)).toBe(1000);
    });

    it('已成交价值应正确', () => {
      const order = createOrder({ price: 10, quantity: 100, filledQty: 50 });
      expect(calcFilledValue(order)).toBe(500);
    });

    it('零价格订单价值为0', () => {
      const order = createOrder({ price: 0, quantity: 100 });
      expect(calcOrderValue(order)).toBe(0);
    });

    it('平均成交价应正确', () => {
      const trades = [
        { price: 10, qty: 50 },
        { price: 12, qty: 50 },
      ];
      expect(calcAvgFillPrice(trades)).toBeCloseTo(11, 5);
    });

    it('空成交列表均价为0', () => {
      expect(calcAvgFillPrice([])).toBe(0);
    });

    it('加权平均价应正确', () => {
      const trades = [
        { price: 10, qty: 100 },
        { price: 20, qty: 50 },
      ];
      expect(calcAvgFillPrice(trades)).toBeCloseTo(13.33, 1);
    });

    it('零成交量均价为0', () => {
      expect(calcAvgFillPrice([{ price: 10, qty: 0 }])).toBe(0);
    });
  });
});
