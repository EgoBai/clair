import { describe, it, expect, beforeEach } from 'vitest';

// 交易执行引擎
interface OrderRequest { symbol: string; side: 'buy' | 'sell'; type: 'market' | 'limit' | 'stop' | 'stop_limit'; quantity: number; price?: number; stopPrice?: number; timeInForce: 'GTC' | 'IOC' | 'FOK' | 'DAY' }
interface Fill { price: number; quantity: number; timestamp: number; commission: number }
interface OrderStatus { orderId: string; status: 'pending' | 'partial' | 'filled' | 'cancelled' | 'rejected'; fills: Fill[]; remainingQty: number; avgPrice: number }

class TradeExecutor {
  private orders: Map<string, OrderStatus> = new Map();
  private commissionRate: number;
  private tickSize: number;

  constructor(commissionRate: number = 0.0003, tickSize: number = 0.01) {
    this.commissionRate = commissionRate;
    this.tickSize = tickSize;
  }

  static roundToTick(price: number, tickSize: number): number {
    return Math.round(price / tickSize) * tickSize;
  }

  static validateLotSize(quantity: number, lotSize: number = 100): { valid: boolean; message: string } {
    if (quantity <= 0) return { valid: false, message: '数量必须为正' };
    if (quantity % lotSize !== 0) return { valid: false, message: `数量必须为 ${lotSize} 的整数倍` };
    return { valid: true, message: '有效' };
  }

  static calcSlippage(expectedPrice: number, fillPrice: number, side: 'buy' | 'sell'): number {
    if (side === 'buy') return (fillPrice - expectedPrice) / expectedPrice;
    return (expectedPrice - fillPrice) / expectedPrice;
  }

  static calcMarketImpact(orderValue: number, avgDailyVolume: number, volatility: number): number {
    if (avgDailyVolume <= 0) return 0;
    const participationRate = orderValue / avgDailyVolume;
    return volatility * Math.sqrt(participationRate) * 0.1;
  }

  static calcTWAPSchedule(totalQty: number, intervals: number, maxPerInterval: number): number[] {
    if (intervals <= 0 || totalQty <= 0) return [];
    const perInterval = Math.min(totalQty / intervals, maxPerInterval);
    const schedule: number[] = [];
    let remaining = totalQty;
    for (let i = 0; i < intervals && remaining > 0; i++) {
      const qty = Math.min(perInterval, remaining);
      schedule.push(Math.round(qty));
      remaining -= qty;
    }
    return schedule;
  }

  static calcVWAPSchedule(totalQty: number, volumeProfile: number[]): number[] {
    const totalVolume = volumeProfile.reduce((a, b) => a + b, 0);
    if (totalVolume <= 0 || totalQty <= 0) return [];
    return volumeProfile.map(v => Math.round(totalQty * v / totalVolume));
  }

  submitOrder(req: OrderRequest): string {
    const orderId = `ORD_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.orders.set(orderId, {
      orderId, status: 'pending', fills: [], remainingQty: req.quantity,
      avgPrice: 0,
    });
    return orderId;
  }

  fillOrder(orderId: string, fillPrice: number, fillQty: number): boolean {
    const order = this.orders.get(orderId);
    if (!order || order.status === 'filled' || order.status === 'cancelled') return false;
    const commission = fillPrice * fillQty * this.commissionRate;
    order.fills.push({ price: fillPrice, quantity: fillQty, timestamp: Date.now(), commission });
    order.remainingQty -= fillQty;
    const totalQty = order.fills.reduce((s, f) => s + f.quantity, 0);
    order.avgPrice = order.fills.reduce((s, f) => s + f.price * f.quantity, 0) / totalQty;
    order.status = order.remainingQty <= 0 ? 'filled' : 'partial';
    return true;
  }

  cancelOrder(orderId: string): boolean {
    const order = this.orders.get(orderId);
    if (!order || order.status === 'filled') return false;
    order.status = 'cancelled';
    return true;
  }

  getOrder(orderId: string): OrderStatus | undefined {
    return this.orders.get(orderId);
  }

  getTotalCommission(orderId: string): number {
    const order = this.orders.get(orderId);
    if (!order) return 0;
    return order.fills.reduce((s, f) => s + f.commission, 0);
  }

  static calcCostBasis(fills: Fill[]): { avgPrice: number; totalQty: number; totalCost: number; totalCommission: number } {
    const totalQty = fills.reduce((s, f) => s + f.quantity, 0);
    const totalCost = fills.reduce((s, f) => s + f.price * f.quantity, 0);
    const totalCommission = fills.reduce((s, f) => s + f.commission, 0);
    return { avgPrice: totalQty > 0 ? totalCost / totalQty : 0, totalQty, totalCost, totalCommission };
  }
}

describe('交易执行引擎', () => {
  let executor: TradeExecutor;

  beforeEach(() => { executor = new TradeExecutor(0.0003, 0.01); });

  describe('价格精度', () => {
    it('应该取整到最小变动价位', () => {
      expect(TradeExecutor.roundToTick(10.123, 0.01)).toBeCloseTo(10.12, 2);
    });
    it('应该处理0.05tick', () => {
      expect(TradeExecutor.roundToTick(10.12, 0.05)).toBeCloseTo(10.10, 2);
    });
    it('整数价格不变', () => {
      expect(TradeExecutor.roundToTick(10, 0.01)).toBeCloseTo(10, 5);
    });
  });

  describe('手数验证', () => {
    it('100股应有效', () => {
      expect(TradeExecutor.validateLotSize(100).valid).toBe(true);
    });
    it('150股应无效（A股100整数倍）', () => {
      expect(TradeExecutor.validateLotSize(150, 100).valid).toBe(false);
    });
    it('零股应无效', () => {
      expect(TradeExecutor.validateLotSize(0).valid).toBe(false);
    });
    it('负数应无效', () => {
      expect(TradeExecutor.validateLotSize(-100).valid).toBe(false);
    });
    it('1000股应有效', () => {
      expect(TradeExecutor.validateLotSize(1000, 100).valid).toBe(true);
    });
  });

  describe('滑点计算', () => {
    it('买入滑点应为正', () => {
      expect(TradeExecutor.calcSlippage(10, 10.05, 'buy')).toBeGreaterThan(0);
    });
    it('卖出滑点应为正', () => {
      expect(TradeExecutor.calcSlippage(10, 9.95, 'sell')).toBeGreaterThan(0);
    });
    it('无滑点应为零', () => {
      expect(TradeExecutor.calcSlippage(10, 10, 'buy')).toBe(0);
    });
    it('反向滑点应为负', () => {
      expect(TradeExecutor.calcSlippage(10, 9.95, 'buy')).toBeLessThan(0);
    });
  });

  describe('市场冲击', () => {
    it('应该计算价格冲击', () => {
      const impact = TradeExecutor.calcMarketImpact(1e6, 1e8, 0.02);
      expect(impact).toBeGreaterThan(0);
    });
    it('零交易量应返回零', () => {
      expect(TradeExecutor.calcMarketImpact(1e6, 0, 0.02)).toBe(0);
    });
    it('小额交易冲击应小于大额', () => {
      const small = TradeExecutor.calcMarketImpact(1e4, 1e8, 0.02);
      const large = TradeExecutor.calcMarketImpact(1e7, 1e8, 0.02);
      expect(small).toBeLessThan(large);
    });
  });

  describe('TWAP调度', () => {
    it('应该均匀分配', () => {
      const schedule = TradeExecutor.calcTWAPSchedule(1000, 5, 500);
      expect(schedule.reduce((a, b) => a + b, 0)).toBe(1000);
    });
    it('应该受最大单笔限制', () => {
      const schedule = TradeExecutor.calcTWAPSchedule(1000, 5, 150);
      expect(Math.max(...schedule)).toBeLessThanOrEqual(150);
    });
    it('应处理零区间', () => {
      expect(TradeExecutor.calcTWAPSchedule(1000, 0, 500)).toEqual([]);
    });
    it('应处理零总量', () => {
      expect(TradeExecutor.calcTWAPSchedule(0, 5, 500)).toEqual([]);
    });
    it('单区间应全量', () => {
      expect(TradeExecutor.calcTWAPSchedule(500, 1, 1000)).toEqual([500]);
    });
  });

  describe('VWAP调度', () => {
    it('应该按成交量比例分配', () => {
      const schedule = TradeExecutor.calcVWAPSchedule(1000, [100, 200, 300, 400]);
      expect(schedule.reduce((a, b) => a + b, 0)).toBe(1000);
      expect(schedule[3]).toBeGreaterThan(schedule[0]);
    });
    it('应处理零成交量', () => {
      expect(TradeExecutor.calcVWAPSchedule(1000, [0, 0])).toEqual([]);
    });
    it('应处理空分布', () => {
      expect(TradeExecutor.calcVWAPSchedule(1000, [])).toEqual([]);
    });
  });

  describe('订单生命周期', () => {
    it('应该提交订单', () => {
      const id = executor.submitOrder({ symbol: '600519', side: 'buy', type: 'limit', quantity: 100, price: 1800, timeInForce: 'GTC' });
      expect(id).toBeTruthy();
      expect(executor.getOrder(id)?.status).toBe('pending');
    });
    it('应该部分成交', () => {
      const id = executor.submitOrder({ symbol: '600519', side: 'buy', type: 'limit', quantity: 200, price: 1800, timeInForce: 'GTC' });
      executor.fillOrder(id, 1800, 100);
      const order = executor.getOrder(id)!;
      expect(order.status).toBe('partial');
      expect(order.remainingQty).toBe(100);
    });
    it('应该完全成交', () => {
      const id = executor.submitOrder({ symbol: '600519', side: 'buy', type: 'limit', quantity: 100, price: 1800, timeInForce: 'GTC' });
      executor.fillOrder(id, 1800, 100);
      expect(executor.getOrder(id)?.status).toBe('filled');
    });
    it('应该取消订单', () => {
      const id = executor.submitOrder({ symbol: '600519', side: 'buy', type: 'limit', quantity: 100, price: 1800, timeInForce: 'GTC' });
      expect(executor.cancelOrder(id)).toBe(true);
      expect(executor.getOrder(id)?.status).toBe('cancelled');
    });
    it('已成交订单不能取消', () => {
      const id = executor.submitOrder({ symbol: '600519', side: 'buy', type: 'limit', quantity: 100, price: 1800, timeInForce: 'GTC' });
      executor.fillOrder(id, 1800, 100);
      expect(executor.cancelOrder(id)).toBe(false);
    });
    it('不存在的订单返回false', () => {
      expect(executor.cancelOrder('nonexistent')).toBe(false);
    });
    it('成交不存在的订单返回false', () => {
      expect(executor.fillOrder('nonexistent', 10, 100)).toBe(false);
    });
  });

  describe('佣金计算', () => {
    it('应该计算佣金', () => {
      const id = executor.submitOrder({ symbol: '600519', side: 'buy', type: 'limit', quantity: 100, price: 1800, timeInForce: 'GTC' });
      executor.fillOrder(id, 1800, 100);
      const commission = executor.getTotalCommission(id);
      expect(commission).toBeCloseTo(1800 * 100 * 0.0003, 2);
    });
    it('多次成交佣金累加', () => {
      const id = executor.submitOrder({ symbol: '600519', side: 'buy', type: 'limit', quantity: 200, price: 1800, timeInForce: 'GTC' });
      executor.fillOrder(id, 1800, 100);
      executor.fillOrder(id, 1810, 100);
      const commission = executor.getTotalCommission(id);
      expect(commission).toBeGreaterThan(0);
    });
  });

  describe('成本基础', () => {
    it('应该计算加权均价', () => {
      const fills: Fill[] = [
        { price: 10, quantity: 100, timestamp: 1, commission: 3 },
        { price: 12, quantity: 100, timestamp: 2, commission: 3.6 },
      ];
      const basis = TradeExecutor.calcCostBasis(fills);
      expect(basis.avgPrice).toBeCloseTo(11, 2);
      expect(basis.totalQty).toBe(200);
    });
    it('应处理空成交', () => {
      const basis = TradeExecutor.calcCostBasis([]);
      expect(basis.avgPrice).toBe(0);
      expect(basis.totalQty).toBe(0);
    });
    it('应该累计佣金', () => {
      const fills: Fill[] = [
        { price: 10, quantity: 100, timestamp: 1, commission: 3 },
        { price: 10, quantity: 100, timestamp: 2, commission: 3 },
      ];
      expect(TradeExecutor.calcCostBasis(fills).totalCommission).toBe(6);
    });
  });

  describe('平均价格', () => {
    it('应该计算成交均价', () => {
      const id = executor.submitOrder({ symbol: '600519', side: 'buy', type: 'limit', quantity: 200, price: 1800, timeInForce: 'GTC' });
      executor.fillOrder(id, 1800, 100);
      executor.fillOrder(id, 1820, 100);
      expect(executor.getOrder(id)?.avgPrice).toBeCloseTo(1810, 1);
    });
  });
});
