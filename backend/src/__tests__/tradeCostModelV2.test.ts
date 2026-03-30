import { describe, it, expect } from 'vitest';

// 交易成本模型 v2
interface TradeCost {
  commission: number;      // 佣金
  stampDuty: number;       // 印花税
  transferFee: number;     // 过户费
  slippage: number;        // 滑点
  total: number;
}

function calcCommission(amount: number, rate: number = 0.0003, min: number = 5): number {
  const comm = amount * rate;
  return Math.max(comm, min);
}

function calcStampDuty(amount: number, isSell: boolean): number {
  return isSell ? amount * 0.0005 : 0;
}

function calcTransferFee(amount: number, market: 'sh' | 'sz'): number {
  return market === 'sh' ? amount * 0.00002 : 0;
}

function calcSlippage(price: number, volume: number, avgDailyVolume: number): number {
  const participation = volume / avgDailyVolume;
  return price * participation * 0.001;
}

function calcTotalTradeCost(price: number, volume: number, isSell: boolean, market: 'sh' | 'sz', avgDailyVolume: number = 1e7): TradeCost {
  const amount = price * volume;
  const commission = calcCommission(amount);
  const stampDuty = calcStampDuty(amount, isSell);
  const transferFee = calcTransferFee(amount, market);
  const slippage = calcSlippage(price, volume, avgDailyVolume);
  return { commission, stampDuty, transferFee, slippage, total: commission + stampDuty + transferFee + slippage };
}

function calcRoundTripCost(price: number, volume: number, market: 'sh' | 'sz'): number {
  const buy = calcTotalTradeCost(price, volume, false, market);
  const sell = calcTotalTradeCost(price, volume, true, market);
  return buy.total + sell.total;
}

function calcBreakEvenPrice(price: number, volume: number, market: 'sh' | 'sz'): number {
  const roundTrip = calcRoundTripCost(price, volume, market);
  return price + roundTrip / volume;
}

function calcAnnualizedCost(price: number, volume: number, market: 'sh' | 'sz', holdingDays: number): number {
  if (holdingDays <= 0) return 0;
  const roundTrip = calcRoundTripCost(price, volume, market);
  const totalValue = price * volume;
  return (roundTrip / totalValue) * (365 / holdingDays) * 100;
}

describe('交易成本模型 v2', () => {
  describe('佣金计算', () => {
    it('应按费率计算佣金', () => {
      expect(calcCommission(100000)).toBeCloseTo(30, 5);
    });

    it('低于最低佣金应取最低值', () => {
      expect(calcCommission(1000)).toBe(5);
    });

    it('自定义费率应生效', () => {
      expect(calcCommission(100000, 0.0005)).toBe(50);
    });
  });

  describe('印花税', () => {
    it('卖出应征收印花税', () => {
      expect(calcStampDuty(100000, true)).toBe(50);
    });

    it('买入不应征收印花税', () => {
      expect(calcStampDuty(100000, false)).toBe(0);
    });
  });

  describe('过户费', () => {
    it('沪市应收取过户费', () => {
      expect(calcTransferFee(100000, 'sh')).toBe(2);
    });

    it('深市不应收取过户费', () => {
      expect(calcTransferFee(100000, 'sz')).toBe(0);
    });
  });

  describe('滑点估算', () => {
    it('大单应有更高滑点', () => {
      const small = calcSlippage(10, 1000, 1e7);
      const large = calcSlippage(10, 1e6, 1e7);
      expect(large).toBeGreaterThan(small);
    });

    it('零成交应无滑点', () => {
      expect(calcSlippage(10, 0, 1e7)).toBe(0);
    });
  });

  describe('总成本', () => {
    it('买入应不含印花税', () => {
      const cost = calcTotalTradeCost(10, 1000, false, 'sh');
      expect(cost.stampDuty).toBe(0);
    });

    it('卖出应含印花税', () => {
      const cost = calcTotalTradeCost(10, 1000, true, 'sh');
      expect(cost.stampDuty).toBeGreaterThan(0);
    });

    it('总成本应为各分项之和', () => {
      const cost = calcTotalTradeCost(10, 1000, true, 'sh');
      expect(cost.total).toBeCloseTo(cost.commission + cost.stampDuty + cost.transferFee + cost.slippage);
    });
  });

  describe('往返成本', () => {
    it('应包含买卖双方成本', () => {
      const roundTrip = calcRoundTripCost(10, 1000, 'sh');
      const buy = calcTotalTradeCost(10, 1000, false, 'sh');
      const sell = calcTotalTradeCost(10, 1000, true, 'sh');
      expect(roundTrip).toBeCloseTo(buy.total + sell.total);
    });
  });

  describe('盈亏平衡价', () => {
    it('应高于买入价', () => {
      expect(calcBreakEvenPrice(10, 1000, 'sh')).toBeGreaterThan(10);
    });
  });

  describe('年化成本', () => {
    it('持有天数越少年化成本越高', () => {
      const short = calcAnnualizedCost(10, 1000, 'sh', 1);
      const long = calcAnnualizedCost(10, 1000, 'sh', 365);
      expect(short).toBeGreaterThan(long);
    });

    it('持有天数为0应返回0', () => {
      expect(calcAnnualizedCost(10, 1000, 'sh', 0)).toBe(0);
    });
  });
});
