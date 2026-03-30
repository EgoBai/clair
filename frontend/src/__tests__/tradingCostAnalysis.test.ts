import { describe, it, expect } from 'vitest';

// 交易成本分析引擎测试
describe('交易成本分析引擎', () => {
  describe('佣金计算', () => {
    function calculateCommission(amount: number, rate: number, minFee = 5): number {
      const commission = amount * rate;
      return Math.max(commission, minFee);
    }

    it('大额交易按比例收费', () => {
      expect(calculateCommission(100000, 0.0003)).toBeCloseTo(30, 5);
    });

    it('小额交易收取最低佣金', () => {
      expect(calculateCommission(1000, 0.0003)).toBe(5);
    });

    it('等于最低佣金时取最低', () => {
      expect(calculateCommission(16666, 0.0003)).toBeCloseTo(5, 0);
    });

    it('零金额收取最低佣金', () => {
      expect(calculateCommission(0, 0.0003)).toBe(5);
    });
  });

  describe('印花税计算', () => {
    function stampDuty(amount: number, rate: number, side: 'buy' | 'sell'): number {
      return side === 'sell' ? amount * rate : 0;
    }

    it('卖出收取印花税', () => {
      expect(stampDuty(100000, 0.001, 'sell')).toBe(100);
    });

    it('买入不收印花税', () => {
      expect(stampDuty(100000, 0.001, 'buy')).toBe(0);
    });

    it('零金额印花税为零', () => {
      expect(stampDuty(0, 0.001, 'sell')).toBe(0);
    });
  });

  describe('过户费计算', () => {
    function transferFee(shares: number, rate: number): number {
      return shares * rate;
    }

    it('按股数计算', () => {
      expect(transferFee(10000, 0.00001)).toBe(0.1);
    });

    it('零股数为零', () => {
      expect(transferFee(0, 0.00001)).toBe(0);
    });
  });

  describe('滑点估算', () => {
    function estimateSlippage(price: number, volume: number, avgDailyVolume: number, volatility: number): number {
      const participationRate = volume / avgDailyVolume;
      const impact = participationRate * volatility * price;
      return impact;
    }

    it('大单滑点更大', () => {
      const small = estimateSlippage(10, 1000, 100000, 0.02);
      const large = estimateSlippage(10, 50000, 100000, 0.02);
      expect(large).toBeGreaterThan(small);
    });

    it('高波动滑点更大', () => {
      const low = estimateSlippage(10, 5000, 100000, 0.01);
      const high = estimateSlippage(10, 5000, 100000, 0.05);
      expect(high).toBeGreaterThan(low);
    });

    it('零交易量滑点为零', () => {
      expect(estimateSlippage(10, 0, 100000, 0.02)).toBe(0);
    });
  });

  describe('总交易成本', () => {
    function totalCost(amount: number, side: 'buy' | 'sell', config: { commissionRate: number; stampRate: number; transferRate: number; shares: number }) {
      const commission = Math.max(amount * config.commissionRate, 5);
      const stamp = side === 'sell' ? amount * config.stampRate : 0;
      const transfer = config.shares * config.transferRate;
      return { commission, stamp, transfer, total: commission + stamp + transfer };
    }

    it('买入成本较低', () => {
      const buy = totalCost(100000, 'buy', { commissionRate: 0.0003, stampRate: 0.001, transferRate: 0.00001, shares: 10000 });
      const sell = totalCost(100000, 'sell', { commissionRate: 0.0003, stampRate: 0.001, transferRate: 0.00001, shares: 10000 });
      expect(buy.total).toBeLessThan(sell.total);
    });

    it('各项费用非负', () => {
      const c = totalCost(50000, 'sell', { commissionRate: 0.0003, stampRate: 0.001, transferRate: 0.00001, shares: 5000 });
      expect(c.commission).toBeGreaterThanOrEqual(0);
      expect(c.stamp).toBeGreaterThanOrEqual(0);
      expect(c.transfer).toBeGreaterThanOrEqual(0);
      expect(c.total).toBeGreaterThanOrEqual(0);
    });

    it('总成本=佣金+印花税+过户费', () => {
      const c = totalCost(100000, 'sell', { commissionRate: 0.0003, stampRate: 0.001, transferRate: 0.00001, shares: 10000 });
      expect(c.total).toBeCloseTo(c.commission + c.stamp + c.transfer, 5);
    });
  });

  describe('盈亏平衡点', () => {
    function breakevenPrice(buyPrice: number, shares: number, config: { commissionRate: number; stampRate: number; transferRate: number }): number {
      const buyCost = Math.max(buyPrice * shares * config.commissionRate, 5) + shares * config.transferRate;
      const totalCost = buyCost;
      const sellNeeded = totalCost + buyPrice * shares;
      const sellCommission = Math.max(sellNeeded * config.commissionRate, 5);
      const sellStamp = sellNeeded * config.stampRate;
      const sellTransfer = shares * config.transferRate;
      return (sellNeeded + sellCommission + sellStamp + sellTransfer) / shares;
    }

    it('盈亏平衡价高于买入价', () => {
      const be = breakevenPrice(10, 1000, { commissionRate: 0.0003, stampRate: 0.001, transferRate: 0.00001 });
      expect(be).toBeGreaterThan(10);
    });

    it('零佣金盈亏平衡接近买入价', () => {
      const be = breakevenPrice(10, 100000, { commissionRate: 0, stampRate: 0, transferRate: 0 });
      expect(be).toBeCloseTo(10, 2);
    });
  });

  describe('换手成本率', () => {
    function turnoverCostRate(dailyTurnover: number, holdingDays: number, dailyCostRate: number): number {
      return dailyTurnover * dailyCostRate * holdingDays;
    }

    it('高换手成本高', () => {
      expect(turnoverCostRate(0.5, 30, 0.001)).toBeGreaterThan(turnoverCostRate(0.1, 30, 0.001));
    });

    it('长持有期成本高', () => {
      expect(turnoverCostRate(0.2, 60, 0.001)).toBeGreaterThan(turnoverCostRate(0.2, 10, 0.001));
    });

    it('零换手成本为零', () => {
      expect(turnoverCostRate(0, 30, 0.001)).toBe(0);
    });
  });
});
