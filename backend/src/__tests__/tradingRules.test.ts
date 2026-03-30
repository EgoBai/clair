import { describe, it, expect } from 'vitest';

// A股交易规则测试
describe('A-Share Trading Rules', () => {
  // 涨跌停价格计算
  const calcLimitPrice = (prevClose: number, limitPct: number): { upper: number; lower: number } => {
    const tickSize = 0.01;
    const upper = Math.round(prevClose * (1 + limitPct) / tickSize) * tickSize;
    const lower = Math.round(prevClose * (1 - limitPct) / tickSize) * tickSize;
    return { upper: +upper.toFixed(2), lower: +lower.toFixed(2) };
  };

  // T+1 检查
  const canSellToday = (buyDate: string, sellDate: string): boolean => {
    return sellDate > buyDate;
  };

  // 最小交易单位检查
  const isValidLotSize = (shares: number): boolean => {
    return shares > 0 && shares % 100 === 0;
  };

  // 最小卖出单位（可零股卖出）
  const isValidSellLot = (shares: number, heldShares: number): boolean => {
    if (shares <= 0) return false;
    if (shares === heldShares) return true; // 全部卖出可含零股
    return shares % 100 === 0;
  };

  // 佣金计算
  const calcCommission = (amount: number, rate: number = 0.0003, minFee: number = 5): number => {
    const commission = amount * rate;
    return Math.max(commission, minFee);
  };

  // 印花税（仅卖出收取）
  const calcStampDuty = (amount: number, isSell: boolean, rate: number = 0.001): number => {
    return isSell ? amount * rate : 0;
  };

  // 过户费
  const calcTransferFee = (amount: number, rate: number = 0.00001): number => {
    return amount * rate;
  };

  // 总交易成本
  const calcTotalCost = (amount: number, isSell: boolean): { commission: number; stampDuty: number; transferFee: number; total: number } => {
    const commission = calcCommission(amount);
    const stampDuty = calcStampDuty(amount, isSell);
    const transferFee = calcTransferFee(amount);
    return { commission, stampDuty, transferFee, total: commission + stampDuty + transferFee };
  };

  // 集合竞价时间判断
  const isCallAuctionPhase = (time: string): boolean => {
    const [h, m] = time.split(':').map(Number);
    const minutes = h * 60 + m;
    // 9:15-9:25 早盘集合竞价, 14:57-15:00 尾盘集合竞价
    return (minutes >= 555 && minutes <= 565) || (minutes >= 897 && minutes <= 900);
  };

  // 连续竞价时间判断
  const isContinuousTrading = (time: string): boolean => {
    const [h, m] = time.split(':').map(Number);
    const minutes = h * 60 + m;
    // 9:30-11:30, 13:00-14:57
    return (minutes >= 570 && minutes <= 690) || (minutes >= 780 && minutes < 897);
  };

  // ST股票涨跌停（5%）
  const isSTLimit = (stockName: string): boolean => {
    return stockName.startsWith('ST') || stockName.startsWith('*ST');
  };

  describe('Limit Prices', () => {
    it('should calculate 10% limit for main board', () => {
      const { upper, lower } = calcLimitPrice(100, 0.1);
      expect(upper).toBe(110);
      expect(lower).toBe(90);
    });

    it('should calculate 20% limit for ChiNext/STAR', () => {
      const { upper, lower } = calcLimitPrice(100, 0.2);
      expect(upper).toBe(120);
      expect(lower).toBe(80);
    });

    it('should calculate 5% limit for ST stocks', () => {
      const { upper, lower } = calcLimitPrice(10, 0.05);
      expect(upper).toBe(10.5);
      expect(lower).toBe(9.5);
    });

    it('should round to tick size', () => {
      const { upper } = calcLimitPrice(33.33, 0.1);
      const remainder = (upper * 100) % 1;
      expect(remainder < 0.01 || remainder > 0.99).toBe(true);
    });

    it('should handle low price stocks', () => {
      const { upper, lower } = calcLimitPrice(1.5, 0.1);
      expect(upper).toBeGreaterThan(lower);
    });
  });

  describe('T+1 Trading', () => {
    it('cannot sell on same day', () => {
      expect(canSellToday('2026-03-24', '2026-03-24')).toBe(false);
    });

    it('can sell next day', () => {
      expect(canSellToday('2026-03-24', '2026-03-25')).toBe(true);
    });

    it('can sell after many days', () => {
      expect(canSellToday('2026-03-24', '2026-04-01')).toBe(true);
    });
  });

  describe('Lot Size', () => {
    it('should accept 100 shares', () => {
      expect(isValidLotSize(100)).toBe(true);
    });

    it('should accept 500 shares', () => {
      expect(isValidLotSize(500)).toBe(true);
    });

    it('should reject 50 shares', () => {
      expect(isValidLotSize(50)).toBe(false);
    });

    it('should reject 150 shares', () => {
      expect(isValidLotSize(150)).toBe(false);
    });

    it('should reject 0 shares', () => {
      expect(isValidLotSize(0)).toBe(false);
    });

    it('should reject negative shares', () => {
      expect(isValidLotSize(-100)).toBe(false);
    });
  });

  describe('Sell Lot (odd lot allowed)', () => {
    it('can sell exact held amount (odd lot)', () => {
      expect(isValidSellLot(150, 150)).toBe(true);
    });

    it('must be 100 multiple for partial sell', () => {
      expect(isValidSellLot(50, 200)).toBe(false);
      expect(isValidSellLot(100, 200)).toBe(true);
    });

    it('rejects zero sell', () => {
      expect(isValidSellLot(0, 100)).toBe(false);
    });
  });

  describe('Commission', () => {
    it('should apply minimum fee for small trades', () => {
      expect(calcCommission(1000)).toBe(5);
    });

    it('should calculate rate for large trades', () => {
      expect(calcCommission(100000)).toBeCloseTo(30, 2);
    });

    it('should handle zero amount', () => {
      expect(calcCommission(0)).toBe(5);
    });
  });

  describe('Stamp Duty', () => {
    it('should charge on sell', () => {
      expect(calcStampDuty(100000, true)).toBe(100);
    });

    it('should not charge on buy', () => {
      expect(calcStampDuty(100000, false)).toBe(0);
    });
  });

  describe('Transfer Fee', () => {
    it('should calculate transfer fee', () => {
      expect(calcTransferFee(100000)).toBeCloseTo(1, 5);
    });
  });

  describe('Total Cost', () => {
    it('should sum all fees for sell', () => {
      const cost = calcTotalCost(100000, true);
      expect(cost.total).toBe(cost.commission + cost.stampDuty + cost.transferFee);
    });

    it('should be less for buy (no stamp duty)', () => {
      const buyCost = calcTotalCost(100000, false);
      const sellCost = calcTotalCost(100000, true);
      expect(buyCost.total).toBeLessThan(sellCost.total);
    });
  });

  describe('Call Auction', () => {
    it('should detect morning call auction', () => {
      expect(isCallAuctionPhase('09:20')).toBe(true);
    });

    it('should detect closing call auction', () => {
      expect(isCallAuctionPhase('14:58')).toBe(true);
    });

    it('should not detect during continuous trading', () => {
      expect(isCallAuctionPhase('10:00')).toBe(false);
    });

    it('should detect 9:15 start', () => {
      expect(isCallAuctionPhase('09:15')).toBe(true);
    });

    it('should detect 9:25 end', () => {
      expect(isCallAuctionPhase('09:25')).toBe(true);
    });
  });

  describe('Continuous Trading', () => {
    it('should detect morning session', () => {
      expect(isContinuousTrading('10:00')).toBe(true);
    });

    it('should detect afternoon session', () => {
      expect(isContinuousTrading('14:00')).toBe(true);
    });

    it('should not detect during lunch', () => {
      expect(isContinuousTrading('12:00')).toBe(false);
    });

    it('should not detect before open', () => {
      expect(isContinuousTrading('09:20')).toBe(false);
    });

    it('should detect 9:30 open', () => {
      expect(isContinuousTrading('09:30')).toBe(true);
    });

    it('should not detect at 14:57 (call auction)', () => {
      expect(isContinuousTrading('14:57')).toBe(false);
    });
  });

  describe('ST Stock Detection', () => {
    it('should detect ST prefix', () => {
      expect(isSTLimit('ST岩石')).toBe(true);
    });

    it('should detect *ST prefix', () => {
      expect(isSTLimit('*ST海润')).toBe(true);
    });

    it('should not detect normal stocks', () => {
      expect(isSTLimit('贵州茅台')).toBe(false);
    });
  });
});
