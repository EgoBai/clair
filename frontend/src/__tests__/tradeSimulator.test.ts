import { describe, it, expect } from 'vitest';

// ==================== 交易模拟引擎 ====================

interface Order {
  id: string;
  symbol: string;
  type: 'market' | 'limit' | 'stop' | 'stopLimit';
  side: 'buy' | 'sell';
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce: 'GTC' | 'IOC' | 'FOK' | 'DAY';
  status: 'pending' | 'filled' | 'partial' | 'cancelled' | 'rejected';
  filledQty: number;
  filledPrice: number;
  commission: number;
  timestamp: number;
}

interface Position {
  symbol: string;
  quantity: number;
  avgCost: number;
  marketPrice: number;
  unrealizedPnL: number;
  realizedPnL: number;
  entryTime: number;
}

interface Account {
  cash: number;
  equity: number;
  margin: number;
  buyingPower: number;
  positions: Map<string, Position>;
}

interface MarketData {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  volume: number;
  timestamp: number;
}

class TradeSimulator {
  private account: Account;
  private orders: Order[] = [];
  private orderCounter = 0;
  private commissionRate: number;
  private slippage: number;
  private tickSize: number;
  private tradeLog: { orderId: string; symbol: string; side: string; qty: number; price: number; time: number }[] = [];

  constructor(
    initialCash: number = 100000,
    commissionRate: number = 0.0003,
    slippage: number = 0.001,
    tickSize: number = 0.01
  ) {
    this.account = {
      cash: initialCash,
      equity: initialCash,
      margin: 0,
      buyingPower: initialCash,
      positions: new Map(),
    };
    this.commissionRate = commissionRate;
    this.slippage = slippage;
    this.tickSize = tickSize;
  }

  /** 下单 */
  placeOrder(params: {
    symbol: string;
    type: Order['type'];
    side: Order['side'];
    quantity: number;
    price?: number;
    stopPrice?: number;
    timeInForce?: Order['timeInForce'];
  }): Order {
    const order: Order = {
      id: `ORD-${++this.orderCounter}`,
      symbol: params.symbol,
      type: params.type,
      side: params.side,
      quantity: params.quantity,
      price: params.price,
      stopPrice: params.stopPrice,
      timeInForce: params.timeInForce || 'GTC',
      status: 'pending',
      filledQty: 0,
      filledPrice: 0,
      commission: 0,
      timestamp: Date.now(),
    };

    // 验证
    if (params.quantity <= 0) {
      order.status = 'rejected';
      this.orders.push(order);
      return order;
    }

    // 检查资金
    if (params.side === 'buy') {
      const cost = (params.price || 0) * params.quantity * (1 + this.commissionRate);
      if (cost > this.account.cash) {
        order.status = 'rejected';
        this.orders.push(order);
        return order;
      }
    }

    // 检查持仓
    if (params.side === 'sell') {
      const pos = this.account.positions.get(params.symbol);
      if (!pos || pos.quantity < params.quantity) {
        order.status = 'rejected';
        this.orders.push(order);
        return order;
      }
    }

    this.orders.push(order);
    return order;
  }

  /** 撮合 */
  matchOrder(order: Order, marketData: MarketData): Order {
    if (order.status !== 'pending') return order;

    let fillPrice = 0;
    let canFill = false;

    switch (order.type) {
      case 'market':
        fillPrice = order.side === 'buy' ? marketData.ask : marketData.bid;
        fillPrice = this.applySlippage(fillPrice, order.side);
        canFill = true;
        break;

      case 'limit':
        if (order.side === 'buy' && order.price! >= marketData.ask) {
          fillPrice = Math.min(order.price!, marketData.ask);
          canFill = true;
        } else if (order.side === 'sell' && order.price! <= marketData.bid) {
          fillPrice = Math.max(order.price!, marketData.bid);
          canFill = true;
        }
        break;

      case 'stop':
        if (order.side === 'buy' && marketData.price >= order.stopPrice!) {
          fillPrice = this.applySlippage(marketData.price, 'buy');
          canFill = true;
        } else if (order.side === 'sell' && marketData.price <= order.stopPrice!) {
          fillPrice = this.applySlippage(marketData.price, 'sell');
          canFill = true;
        }
        break;

      case 'stopLimit':
        if (order.side === 'buy' && marketData.price >= order.stopPrice!) {
          if (marketData.ask <= order.price!) {
            fillPrice = marketData.ask;
            canFill = true;
          }
        } else if (order.side === 'sell' && marketData.price <= order.stopPrice!) {
          if (marketData.bid >= order.price!) {
            fillPrice = marketData.bid;
            canFill = true;
          }
        }
        break;
    }

    if (canFill) {
      order.filledPrice = this.roundToTick(fillPrice);
      order.filledQty = order.quantity;
      order.commission = Math.round(fillPrice * order.quantity * this.commissionRate * 100) / 100;
      order.status = 'filled';

      this.executeTrade(order);
      this.tradeLog.push({
        orderId: order.id, symbol: order.symbol,
        side: order.side, qty: order.quantity,
        price: order.filledPrice, time: marketData.timestamp,
      });
    } else if (order.timeInForce === 'IOC' || order.timeInForce === 'FOK') {
      order.status = 'cancelled';
    }

    return order;
  }

  /** 取消订单 */
  cancelOrder(orderId: string): boolean {
    const order = this.orders.find(o => o.id === orderId);
    if (!order || order.status !== 'pending') return false;
    order.status = 'cancelled';
    return true;
  }

  /** 更新市场报价 */
  updateMarketPrice(symbol: string, price: number): void {
    const pos = this.account.positions.get(symbol);
    if (pos) {
      pos.marketPrice = price;
      pos.unrealizedPnL = Math.round((price - pos.avgCost) * pos.quantity * 100) / 100;
    }
    this.recalculateEquity();
  }

  /** 获取账户 */
  getAccount(): Account { return this.account; }

  /** 获取持仓 */
  getPosition(symbol: string): Position | undefined { return this.account.positions.get(symbol); }

  /** 获取所有持仓 */
  getAllPositions(): Position[] { return Array.from(this.account.positions.values()); }

  /** 获取订单列表 */
  getOrders(filter?: { status?: Order['status']; symbol?: string }): Order[] {
    let result = this.orders;
    if (filter?.status) result = result.filter(o => o.status === filter.status);
    if (filter?.symbol) result = result.filter(o => o.symbol === filter.symbol);
    return result;
  }

  /** 获取成交记录 */
  getTradeLog(): typeof this.tradeLog { return this.tradeLog; }

  /** 获取订单簿统计 */
  getOrderStats(): { total: number; filled: number; cancelled: number; rejected: number; fillRate: number } {
    const total = this.orders.length;
    const filled = this.orders.filter(o => o.status === 'filled').length;
    const cancelled = this.orders.filter(o => o.status === 'cancelled').length;
    const rejected = this.orders.filter(o => o.status === 'rejected').length;
    return { total, filled, cancelled, rejected, fillRate: total > 0 ? Math.round((filled / total) * 10000) / 100 : 0 };
  }

  /** 止损/止盈检查 */
  checkStopOrders(currentPrices: Record<string, number>): Order[] {
    const triggered: Order[] = [];
    for (const order of this.orders.filter(o => o.status === 'pending' && (o.type === 'stop' || o.type === 'stopLimit'))) {
      const price = currentPrices[order.symbol];
      if (!price) continue;

      const md: MarketData = { symbol: order.symbol, price, bid: price - 0.01, ask: price + 0.01, volume: 1000, timestamp: Date.now() };
      const prev = order.status;
      this.matchOrder(order, md);
      if (order.status === 'filled' && prev === 'pending') {
        triggered.push(order);
      }
    }
    return triggered;
  }

  /** 盈亏汇总 */
  getPnLSummary(): { realizedPnL: number; unrealizedPnL: number; totalPnL: number; totalCommission: number } {
    let realizedPnL = 0, unrealizedPnL = 0;
    for (const pos of this.account.positions.values()) {
      realizedPnL += pos.realizedPnL;
      unrealizedPnL += pos.unrealizedPnL;
    }
    const totalCommission = this.orders.reduce((s, o) => s + o.commission, 0);
    return {
      realizedPnL: Math.round(realizedPnL * 100) / 100,
      unrealizedPnL: Math.round(unrealizedPnL * 100) / 100,
      totalPnL: Math.round((realizedPnL + unrealizedPnL) * 100) / 100,
      totalCommission: Math.round(totalCommission * 100) / 100,
    };
  }

  // ==================== 私有方法 ====================

  private executeTrade(order: Order): void {
    if (order.side === 'buy') {
      const cost = order.filledPrice * order.filledQty + order.commission;
      this.account.cash -= cost;

      const existing = this.account.positions.get(order.symbol);
      if (existing) {
        const totalQty = existing.quantity + order.filledQty;
        existing.avgCost = (existing.avgCost * existing.quantity + order.filledPrice * order.filledQty) / totalQty;
        existing.quantity = totalQty;
      } else {
        this.account.positions.set(order.symbol, {
          symbol: order.symbol,
          quantity: order.filledQty,
          avgCost: order.filledPrice,
          marketPrice: order.filledPrice,
          unrealizedPnL: 0,
          realizedPnL: 0,
          entryTime: order.timestamp,
        });
      }
    } else {
      const revenue = order.filledPrice * order.filledQty - order.commission;
      this.account.cash += revenue;

      const pos = this.account.positions.get(order.symbol)!;
      const pnl = (order.filledPrice - pos.avgCost) * order.filledQty - order.commission;
      pos.realizedPnL += pnl;
      pos.quantity -= order.filledQty;

      if (pos.quantity <= 0) {
        this.account.positions.delete(order.symbol);
      }
    }
    this.recalculateEquity();
  }

  private applySlippage(price: number, side: 'buy' | 'sell'): number {
    return side === 'buy' ? price * (1 + this.slippage) : price * (1 - this.slippage);
  }

  private roundToTick(price: number): number {
    return Math.round(price / this.tickSize) * this.tickSize;
  }

  private recalculateEquity(): void {
    let positionsValue = 0;
    for (const pos of this.account.positions.values()) {
      positionsValue += pos.marketPrice * pos.quantity;
    }
    this.account.equity = Math.round((this.account.cash + positionsValue) * 100) / 100;
    this.account.buyingPower = this.account.cash;
  }
}

// ==================== 测试 ====================

describe('TradeSimulator 交易模拟引擎', () => {
  let sim: TradeSimulator;

  beforeEach(() => {
    sim = new TradeSimulator(100000, 0.0003, 0.001, 0.01);
  });

  describe('下单', () => {
    it('应创建市价单', () => {
      const order = sim.placeOrder({ symbol: '000001', type: 'market', side: 'buy', quantity: 100 });
      expect(order.id).toMatch(/^ORD-/);
      expect(order.status).toBe('pending');
    });

    it('应创建限价单', () => {
      const order = sim.placeOrder({ symbol: '000001', type: 'limit', side: 'buy', quantity: 100, price: 10 });
      expect(order.type).toBe('limit');
      expect(order.price).toBe(10);
    });

    it('数量为0应拒绝', () => {
      const order = sim.placeOrder({ symbol: '000001', type: 'market', side: 'buy', quantity: 0 });
      expect(order.status).toBe('rejected');
    });

    it('无持仓卖出应拒绝', () => {
      const order = sim.placeOrder({ symbol: '000001', type: 'market', side: 'sell', quantity: 100 });
      expect(order.status).toBe('rejected');
    });
  });

  describe('撮合', () => {
    it('市价买单应以ask价成交', () => {
      const order = sim.placeOrder({ symbol: '000001', type: 'market', side: 'buy', quantity: 100 });
      const md: MarketData = { symbol: '000001', price: 10, bid: 9.99, ask: 10.01, volume: 1000, timestamp: Date.now() };
      sim.matchOrder(order, md);
      expect(order.status).toBe('filled');
      expect(order.filledPrice).toBeGreaterThan(10);
    });

    it('限价买单应在价格满足时成交', () => {
      const order = sim.placeOrder({ symbol: '000001', type: 'limit', side: 'buy', quantity: 100, price: 10.05 });
      const md: MarketData = { symbol: '000001', price: 10, bid: 9.99, ask: 10.01, volume: 1000, timestamp: Date.now() };
      sim.matchOrder(order, md);
      expect(order.status).toBe('filled');
    });

    it('限价买单在价格不满足时不应成交', () => {
      const order = sim.placeOrder({ symbol: '000001', type: 'limit', side: 'buy', quantity: 100, price: 9 });
      const md: MarketData = { symbol: '000001', price: 10, bid: 9.99, ask: 10.01, volume: 1000, timestamp: Date.now() };
      sim.matchOrder(order, md);
      expect(order.status).toBe('pending');
    });

    it('止损单应触发', () => {
      // 先买入
      const buyOrder = sim.placeOrder({ symbol: '000001', type: 'market', side: 'buy', quantity: 100 });
      sim.matchOrder(buyOrder, { symbol: '000001', price: 10, bid: 9.99, ask: 10.01, volume: 1000, timestamp: Date.now() });
      // 再设置止损
      const order = sim.placeOrder({ symbol: '000001', type: 'stop', side: 'sell', quantity: 100, stopPrice: 9 });

      const md: MarketData = { symbol: '000001', price: 8.5, bid: 8.49, ask: 8.51, volume: 1000, timestamp: Date.now() };
      sim.matchOrder(order, md);
      expect(order.status).toBe('filled');
    });
  });

  describe('账户管理', () => {
    it('买入后现金应减少', () => {
      const before = sim.getAccount().cash;
      const order = sim.placeOrder({ symbol: '000001', type: 'market', side: 'buy', quantity: 100 });
      sim.matchOrder(order, { symbol: '000001', price: 10, bid: 9.99, ask: 10.01, volume: 1000, timestamp: Date.now() });
      expect(sim.getAccount().cash).toBeLessThan(before);
    });

    it('买入后应有持仓', () => {
      const order = sim.placeOrder({ symbol: '000001', type: 'market', side: 'buy', quantity: 100 });
      sim.matchOrder(order, { symbol: '000001', price: 10, bid: 9.99, ask: 10.01, volume: 1000, timestamp: Date.now() });
      const pos = sim.getPosition('000001');
      expect(pos).toBeDefined();
      expect(pos!.quantity).toBe(100);
    });

    it('卖出后持仓应减少', () => {
      const buy = sim.placeOrder({ symbol: '000001', type: 'market', side: 'buy', quantity: 100 });
      sim.matchOrder(buy, { symbol: '000001', price: 10, bid: 9.99, ask: 10.01, volume: 1000, timestamp: Date.now() });

      const sell = sim.placeOrder({ symbol: '000001', type: 'market', side: 'sell', quantity: 50 });
      sim.matchOrder(sell, { symbol: '000001', price: 11, bid: 10.99, ask: 11.01, volume: 1000, timestamp: Date.now() });

      expect(sim.getPosition('000001')!.quantity).toBe(50);
    });

    it('全部卖出后持仓应删除', () => {
      const buy = sim.placeOrder({ symbol: '000001', type: 'market', side: 'buy', quantity: 100 });
      sim.matchOrder(buy, { symbol: '000001', price: 10, bid: 9.99, ask: 10.01, volume: 1000, timestamp: Date.now() });

      const sell = sim.placeOrder({ symbol: '000001', type: 'market', side: 'sell', quantity: 100 });
      sim.matchOrder(sell, { symbol: '000001', price: 11, bid: 10.99, ask: 11.01, volume: 1000, timestamp: Date.now() });

      expect(sim.getPosition('000001')).toBeUndefined();
    });
  });

  describe('订单管理', () => {
    it('应取消pending订单', () => {
      const order = sim.placeOrder({ symbol: '000001', type: 'limit', side: 'buy', quantity: 100, price: 5 });
      expect(sim.cancelOrder(order.id)).toBe(true);
      expect(order.status).toBe('cancelled');
    });

    it('不应取消已成交订单', () => {
      const order = sim.placeOrder({ symbol: '000001', type: 'market', side: 'buy', quantity: 100 });
      sim.matchOrder(order, { symbol: '000001', price: 10, bid: 9.99, ask: 10.01, volume: 1000, timestamp: Date.now() });
      expect(sim.cancelOrder(order.id)).toBe(false);
    });

    it('应按状态过滤订单', () => {
      sim.placeOrder({ symbol: '000001', type: 'market', side: 'buy', quantity: 100 });
      const pending = sim.getOrders({ status: 'pending' });
      expect(pending.length).toBe(1);
    });
  });

  describe('市场更新', () => {
    it('应更新未实现盈亏', () => {
      const order = sim.placeOrder({ symbol: '000001', type: 'market', side: 'buy', quantity: 100 });
      sim.matchOrder(order, { symbol: '000001', price: 10, bid: 9.99, ask: 10.01, volume: 1000, timestamp: Date.now() });
      sim.updateMarketPrice('000001', 12);
      expect(sim.getPosition('000001')!.unrealizedPnL).toBeCloseTo(200, -1);
    });

    it('应更新权益', () => {
      const order = sim.placeOrder({ symbol: '000001', type: 'market', side: 'buy', quantity: 100 });
      sim.matchOrder(order, { symbol: '000001', price: 10, bid: 9.99, ask: 10.01, volume: 1000, timestamp: Date.now() });
      const before = sim.getAccount().equity;
      sim.updateMarketPrice('000001', 15);
      expect(sim.getAccount().equity).toBeGreaterThan(before);
    });
  });

  describe('止损检查', () => {
    it('应触发止损单', () => {
      const buy = sim.placeOrder({ symbol: '000001', type: 'market', side: 'buy', quantity: 100 });
      sim.matchOrder(buy, { symbol: '000001', price: 10, bid: 9.99, ask: 10.01, volume: 1000, timestamp: Date.now() });

      sim.placeOrder({ symbol: '000001', type: 'stop', side: 'sell', quantity: 100, stopPrice: 9 });
      const triggered = sim.checkStopOrders({ '000001': 8.5 });
      expect(triggered.length).toBe(1);
    });

    it('未触发条件不应成交', () => {
      sim.placeOrder({ symbol: '000001', type: 'stop', side: 'buy', quantity: 100, stopPrice: 15 });
      const triggered = sim.checkStopOrders({ '000001': 10 });
      expect(triggered.length).toBe(0);
    });
  });

  describe('盈亏汇总', () => {
    it('应计算总盈亏', () => {
      const buy = sim.placeOrder({ symbol: '000001', type: 'market', side: 'buy', quantity: 100 });
      sim.matchOrder(buy, { symbol: '000001', price: 10, bid: 9.99, ask: 10.01, volume: 1000, timestamp: Date.now() });
      sim.updateMarketPrice('000001', 12);

      const summary = sim.getPnLSummary();
      expect(summary.unrealizedPnL).toBeGreaterThan(0);
      expect(summary.totalCommission).toBeGreaterThan(0);
    });
  });

  describe('订单统计', () => {
    it('应统计订单状态', () => {
      const buy = sim.placeOrder({ symbol: '000001', type: 'market', side: 'buy', quantity: 100 });
      sim.matchOrder(buy, { symbol: '000001', price: 10, bid: 9.99, ask: 10.01, volume: 1000, timestamp: Date.now() });
      sim.placeOrder({ symbol: '000001', type: 'market', side: 'buy', quantity: 0 }); // rejected

      const stats = sim.getOrderStats();
      expect(stats.total).toBe(2);
      expect(stats.filled).toBe(1);
      expect(stats.rejected).toBe(1);
      expect(stats.fillRate).toBe(50);
    });
  });

  describe('IOC/FOK', () => {
    it('IOC未成交应取消', () => {
      const order = sim.placeOrder({ symbol: '000001', type: 'limit', side: 'buy', quantity: 100, price: 5, timeInForce: 'IOC' });
      sim.matchOrder(order, { symbol: '000001', price: 10, bid: 9.99, ask: 10.01, volume: 1000, timestamp: Date.now() });
      expect(order.status).toBe('cancelled');
    });
  });

  describe('成交记录', () => {
    it('应记录成交', () => {
      const buy = sim.placeOrder({ symbol: '000001', type: 'market', side: 'buy', quantity: 100 });
      sim.matchOrder(buy, { symbol: '000001', price: 10, bid: 9.99, ask: 10.01, volume: 1000, timestamp: Date.now() });
      const log = sim.getTradeLog();
      expect(log.length).toBe(1);
      expect(log[0].side).toBe('buy');
    });
  });
});
