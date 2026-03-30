import { describe, it, expect } from 'vitest';

// ==================== 事件驱动回测引擎测试 ====================

interface Event { type: 'bar' | 'signal' | 'order' | 'fill'; timestamp: number; data: Record<string, unknown>; }
interface Position { symbol: string; quantity: number; avgPrice: number; side: 'long' | 'short'; }
interface Order { symbol: string; quantity: number; price: number; side: 'buy' | 'sell'; filled: boolean; timestamp: number; }

function processBarEvent(event: Event, positions: Map<string, Position>, cash: number): { positions: Map<string, Position>; cash: number; orders: Order[] } {
  const data = event.data as { symbol: string; close: number; high: number; low: number };
  const orders: Order[] = [];
  const pos = positions.get(data.symbol);
  if (pos) {
    const unrealizedPnL = (data.close - pos.avgPrice) * pos.quantity * (pos.side === 'long' ? 1 : -1);
    if (unrealizedPnL / (pos.avgPrice * pos.quantity) < -0.05) {
      orders.push({ symbol: data.symbol, quantity: pos.quantity, price: data.close, side: pos.side === 'long' ? 'sell' : 'buy', filled: false, timestamp: event.timestamp });
    }
  }
  return { positions, cash, orders };
}

function processSignalEvent(event: Event, cash: number, maxPositionPct: number = 0.2): Order[] {
  const data = event.data as { symbol: string; direction: 'buy' | 'sell'; strength: number };
  const maxAmount = cash * maxPositionPct * data.strength;
  const price = (data as any).price || 100;
  const quantity = Math.floor(maxAmount / price / 100) * 100;
  if (quantity <= 0) return [];
  return [{ symbol: data.symbol, quantity, price, side: data.direction, filled: false, timestamp: event.timestamp }];
}

function fillOrder(order: Order, fillPrice: number): { filled: boolean; commission: number; slippage: number } {
  const commission = order.quantity * fillPrice * 0.0003;
  const slippage = fillPrice * 0.0001;
  return { filled: true, commission, slippage };
}

function calcEquityCurve(positions: Map<string, Position>, cash: number, prices: Map<string, number>): number {
  let equity = cash;
  positions.forEach((pos, symbol) => {
    const price = prices.get(symbol) || pos.avgPrice;
    equity += pos.quantity * price * (pos.side === 'long' ? 1 : -1);
  });
  return equity;
}

function runEventBacktest(events: Event[], initialCash: number = 1000000): { finalEquity: number; trades: number; maxDrawdown: number } {
  let cash = initialCash;
  const positions = new Map<string, Position>();
  const equity: number[] = [initialCash];
  let trades = 0;

  for (const event of events) {
    if (event.type === 'bar') {
      const result = processBarEvent(event, positions, cash);
      for (const order of result.orders) {
        const fill = fillOrder(order, order.price);
        if (fill.filled) {
          const cost = order.quantity * order.price + fill.commission;
          if (order.side === 'buy') {
            cash -= cost;
            positions.set(order.symbol, { symbol: order.symbol, quantity: order.quantity, avgPrice: order.price, side: 'long' });
          } else {
            cash += order.quantity * order.price - fill.commission;
            positions.delete(order.symbol);
          }
          trades++;
        }
      }
    } else if (event.type === 'signal') {
      const orders = processSignalEvent(event, cash);
      for (const order of orders) {
        const fill = fillOrder(order, order.price);
        if (fill.filled) {
          const cost = order.quantity * order.price + fill.commission;
          if (order.side === 'buy') { cash -= cost; positions.set(order.symbol, { symbol: order.symbol, quantity: order.quantity, avgPrice: order.price, side: 'long' }); }
          else { cash += order.quantity * order.price - fill.commission; positions.delete(order.symbol); }
          trades++;
        }
      }
    }
    const prices = new Map<string, number>();
    if (event.type === 'bar') prices.set((event.data as any).symbol, (event.data as any).close);
    equity.push(calcEquityCurve(positions, cash, prices));
  }

  let peak = equity[0], maxDD = 0;
  for (const e of equity) { if (e > peak) peak = e; const dd = (peak - e) / peak; if (dd > maxDD) maxDD = dd; }
  return { finalEquity: equity[equity.length - 1], trades, maxDrawdown: maxDD };
}

describe('事件驱动回测引擎', () => {
  describe('Bar事件处理', () => {
    it('应该检测止损信号', () => {
      const positions = new Map([['600519', { symbol: '600519', quantity: 100, avgPrice: 100, side: 'long' as const }]]);
      const event: Event = { type: 'bar', timestamp: 1000, data: { symbol: '600519', close: 94, high: 96, low: 93 } };
      const result = processBarEvent(event, positions, 100000);
      expect(result.orders.length).toBeGreaterThan(0);
    });

    it('正常波动不应该触发止损', () => {
      const positions = new Map([['600519', { symbol: '600519', quantity: 100, avgPrice: 100, side: 'long' as const }]]);
      const event: Event = { type: 'bar', timestamp: 1000, data: { symbol: '600519', close: 101, high: 102, low: 99 } };
      const result = processBarEvent(event, positions, 100000);
      expect(result.orders.length).toBe(0);
    });
  });

  describe('信号事件处理', () => {
    it('应该生成订单', () => {
      const event: Event = { type: 'signal', timestamp: 1000, data: { symbol: '600519', direction: 'buy', strength: 0.8, price: 100 } };
      const orders = processSignalEvent(event, 1000000);
      expect(orders.length).toBeGreaterThan(0);
      expect(orders[0].side).toBe('buy');
    });

    it('资金不足不应该生成订单', () => {
      const event: Event = { type: 'signal', timestamp: 1000, data: { symbol: '600519', direction: 'buy', strength: 0.8, price: 1e10 } };
      const orders = processSignalEvent(event, 1000);
      expect(orders.length).toBe(0);
    });

    it('应该限制仓位比例', () => {
      const event: Event = { type: 'signal', timestamp: 1000, data: { symbol: '600519', direction: 'buy', strength: 1, price: 100 } };
      const orders = processSignalEvent(event, 100000, 0.1);
      expect(orders[0].quantity * orders[0].price).toBeLessThanOrEqual(10000);
    });
  });

  describe('订单成交', () => {
    it('应该计算手续费', () => {
      const order: Order = { symbol: '600519', quantity: 100, price: 100, side: 'buy', filled: false, timestamp: 1000 };
      const fill = fillOrder(order, 100);
      expect(fill.commission).toBeGreaterThan(0);
      expect(fill.filled).toBe(true);
    });

    it('应该计算滑点', () => {
      const order: Order = { symbol: '600519', quantity: 100, price: 100, side: 'buy', filled: false, timestamp: 1000 };
      const fill = fillOrder(order, 100);
      expect(fill.slippage).toBeGreaterThan(0);
    });
  });

  describe('权益曲线', () => {
    it('无持仓应该等于现金', () => {
      const equity = calcEquityCurve(new Map(), 100000, new Map());
      expect(equity).toBe(100000);
    });

    it('有持仓应该包含市值', () => {
      const positions = new Map([['600519', { symbol: '600519', quantity: 100, avgPrice: 100, side: 'long' as const }]]);
      const prices = new Map([['600519', 110]]);
      const equity = calcEquityCurve(positions, 50000, prices);
      expect(equity).toBe(61000);
    });
  });

  describe('回测运行', () => {
    it('应该返回结果', () => {
      const events: Event[] = [
        { type: 'bar', timestamp: 1, data: { symbol: 'A', close: 100, high: 101, low: 99 } },
        { type: 'signal', timestamp: 2, data: { symbol: 'A', direction: 'buy', strength: 0.5, price: 100 } },
        { type: 'bar', timestamp: 3, data: { symbol: 'A', close: 105, high: 106, low: 99 } },
      ];
      const result = runEventBacktest(events);
      expect(result.finalEquity).toBeGreaterThan(0);
      expect(result.trades).toBeGreaterThanOrEqual(0);
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
    });

    it('空事件不应该崩溃', () => {
      const result = runEventBacktest([]);
      expect(result.finalEquity).toBe(1000000);
      expect(result.trades).toBe(0);
    });

    it('最大回撤不应该超过1', () => {
      const events: Event[] = Array.from({ length: 10 }, (_, i) => ({
        type: 'bar' as const, timestamp: i, data: { symbol: 'A', close: 100 - i, high: 100 - i, low: 99 - i },
      }));
      const result = runEventBacktest(events);
      expect(result.maxDrawdown).toBeLessThanOrEqual(1);
    });
  });
});
