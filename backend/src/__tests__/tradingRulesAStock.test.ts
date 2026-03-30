import { describe, it, expect } from 'vitest';

// A-share specific trading rules tests
describe('A-Share Trading Rules', () => {
  describe('Price Limit Rules', () => {
    function getLimitPrice(prevClose: number, board: 'main' | 'gem' | 'star' | 'st'): { up: number; down: number } {
      const limits: Record<string, number> = { main: 0.1, gem: 0.2, star: 0.2, st: 0.05 };
      const limit = limits[board];
      return {
        up: +(prevClose * (1 + limit)).toFixed(2),
        down: +(prevClose * (1 - limit)).toFixed(2),
      };
    }

    it('should have 10% limit for main board', () => {
      const { up, down } = getLimitPrice(100, 'main');
      expect(up).toBe(110);
      expect(down).toBe(90);
    });

    it('should have 20% limit for ChiNext', () => {
      const { up, down } = getLimitPrice(100, 'gem');
      expect(up).toBe(120);
      expect(down).toBe(80);
    });

    it('should have 20% limit for STAR Market', () => {
      const { up, down } = getLimitPrice(100, 'star');
      expect(up).toBe(120);
      expect(down).toBe(80);
    });

    it('should have 5% limit for ST stocks', () => {
      const { up, down } = getLimitPrice(100, 'st');
      expect(up).toBe(105);
      expect(down).toBe(95);
    });

    it('should detect limit up', () => {
      const price = 110;
      const { up } = getLimitPrice(100, 'main');
      expect(price).toBe(up);
    });

    it('should detect limit down', () => {
      const price = 90;
      const { down } = getLimitPrice(100, 'main');
      expect(price).toBe(down);
    });

    it('should calculate limit up return', () => {
      const prevClose = 50;
      const { up } = getLimitPrice(prevClose, 'main');
      const returnPct = ((up - prevClose) / prevClose) * 100;
      expect(returnPct).toBe(10);
    });
  });

  describe('Trading Hours', () => {
    function getTradingSession(time: string): string {
      const [h, m] = time.split(':').map(Number);
      const t = h * 100 + m;
      if (t >= 915 && t < 925) return '集合竞价';
      if (t >= 925 && t < 930) return '撮合成交';
      if (t >= 930 && t <= 1130) return '连续竞价(上午)';
      if (t > 1130 && t < 1300) return '午间休市';
      if (t >= 1300 && t <= 1457) return '连续竞价(下午)';
      if (t > 1457 && t <= 1500) return '收盘集合竞价';
      return '非交易时间';
    }

    it('should identify morning auction', () => {
      expect(getTradingSession('09:20')).toBe('集合竞价');
    });

    it('should identify morning continuous trading', () => {
      expect(getTradingSession('10:00')).toBe('连续竞价(上午)');
    });

    it('should identify lunch break', () => {
      expect(getTradingSession('12:00')).toBe('午间休市');
    });

    it('should identify afternoon continuous trading', () => {
      expect(getTradingSession('14:00')).toBe('连续竞价(下午)');
    });

    it('should identify closing auction', () => {
      expect(getTradingSession('14:58')).toBe('收盘集合竞价');
    });

    it('should identify non-trading time', () => {
      expect(getTradingSession('16:00')).toBe('非交易时间');
    });

    it('should identify pre-market', () => {
      expect(getTradingSession('08:30')).toBe('非交易时间');
    });
  });

  describe('T+1 Settlement', () => {
    function canSellToday(buyDate: string): boolean {
      // T+1: bought today can only sell tomorrow
      return false; // In T+1, you can never sell on the same day
    }

    it('should not allow same-day selling', () => {
      expect(canSellToday('2024-01-15')).toBe(false);
    });

    it('should calculate settlement date', () => {
      const tradeDate = new Date('2024-01-15');
      const settlementDate = new Date(tradeDate);
      settlementDate.setDate(settlementDate.getDate() + 1);
      expect(settlementDate.toISOString().split('T')[0]).toBe('2024-01-16');
    });

    it('should skip weekend for settlement', () => {
      const friday = new Date('2024-01-19');
      const settlement = new Date(friday);
      settlement.setDate(settlement.getDate() + 1);
      // If Saturday, add 2 more days
      if (settlement.getDay() === 6) settlement.setDate(settlement.getDate() + 2);
      expect(settlement.getDay()).not.toBe(0);
      expect(settlement.getDay()).not.toBe(6);
    });
  });

  describe('Lot Size Rules', () => {
    function roundToLot(shares: number): number {
      return Math.floor(shares / 100) * 100;
    }

    function isValidLot(shares: number): boolean {
      return shares > 0 && shares % 100 === 0;
    }

    it('should require 100-share lots', () => {
      expect(isValidLot(100)).toBe(true);
      expect(isValidLot(200)).toBe(true);
      expect(isValidLot(1000)).toBe(true);
    });

    it('should reject non-lot sizes', () => {
      expect(isValidLot(50)).toBe(false);
      expect(isValidLot(150)).toBe(false);
      expect(isValidLot(0)).toBe(false);
    });

    it('should round down to nearest lot', () => {
      expect(roundToLot(250)).toBe(200);
      expect(roundToLot(399)).toBe(300);
      expect(roundToLot(100)).toBe(100);
    });

    it('should calculate max affordable lots', () => {
      const cash = 100000;
      const price = 1800;
      const maxShares = Math.floor(cash / price);
      const maxLots = Math.floor(maxShares / 100) * 100;
      expect(maxLots).toBe(0); // Can't afford even 1 lot of Moutai at 1800
    });

    it('should calculate lots for cheaper stock', () => {
      const cash = 100000;
      const price = 50;
      const maxShares = Math.floor(cash / price);
      const maxLots = Math.floor(maxShares / 100) * 100;
      expect(maxLots).toBe(2000);
    });
  });

  describe('Stamp Duty Calculation', () => {
    function calcStampDuty(tradeType: 'buy' | 'sell', amount: number): number {
      // A-share: 0.05% stamp duty on sell only
      return tradeType === 'sell' ? amount * 0.0005 : 0;
    }

    it('should charge stamp duty on sell', () => {
      expect(calcStampDuty('sell', 100000)).toBe(50);
    });

    it('should not charge stamp duty on buy', () => {
      expect(calcStampDuty('buy', 100000)).toBe(0);
    });

    it('should calculate for large amount', () => {
      expect(calcStampDuty('sell', 10000000)).toBe(5000);
    });
  });

  describe('Commission Calculation', () => {
    function calcCommission(amount: number, rate: number = 0.00025, minFee: number = 5): number {
      return Math.max(amount * rate, minFee);
    }

    it('should calculate commission by rate', () => {
      expect(calcCommission(100000)).toBe(25);
    });

    it('should apply minimum fee', () => {
      expect(calcCommission(1000)).toBe(5);
    });

    it('should use default rate', () => {
      expect(calcCommission(100000)).toBe(100000 * 0.00025);
    });
  });

  describe('Suspension Handling', () => {
    interface TradingDay { date: string; suspended: boolean; reason?: string; }

    const days: TradingDay[] = [
      { date: '2024-01-15', suspended: false },
      { date: '2024-01-16', suspended: true, reason: '重大事项' },
      { date: '2024-01-17', suspended: true, reason: '重大事项' },
      { date: '2024-01-18', suspended: false },
    ];

    it('should identify suspended days', () => {
      const suspended = days.filter(d => d.suspended);
      expect(suspended).toHaveLength(2);
    });

    it('should track suspension duration', () => {
      let maxConsecutive = 0, current = 0;
      for (const day of days) {
        if (day.suspended) current++;
        else current = 0;
        maxConsecutive = Math.max(maxConsecutive, current);
      }
      expect(maxConsecutive).toBe(2);
    });

    it('should use last price during suspension', () => {
      const lastPrice = 100;
      const suspendedPrices = days.map(d => d.suspended ? lastPrice : 100 + Math.random() * 5);
      expect(suspendedPrices[1]).toBe(lastPrice);
      expect(suspendedPrices[2]).toBe(lastPrice);
    });
  });

  describe('IPO Lock-up Period', () => {
    function isLockedUp(listingDate: string, currentDate: string, lockupDays: number = 365): boolean {
      const listing = new Date(listingDate);
      const current = new Date(currentDate);
      return (current.getTime() - listing.getTime()) < lockupDays * 24 * 60 * 60 * 1000;
    }

    it('should lock shares within 1 year', () => {
      expect(isLockedUp('2024-01-15', '2024-06-15')).toBe(true);
    });

    it('should unlock after 1 year', () => {
      expect(isLockedUp('2024-01-15', '2025-01-16')).toBe(false);
    });

    it('should handle exact boundary', () => {
      expect(isLockedUp('2024-01-15', '2025-01-15')).toBe(false);
    });
  });

  describe('Dividend Tax', () => {
    function calcDividendTax(dividend: number, holdingDays: number): number {
      if (holdingDays > 365) return 0; // > 1 year: tax-free
      if (holdingDays > 30) return dividend * 0.10; // 1 month ~ 1 year: 10%
      return dividend * 0.20; // < 1 month: 20%
    }

    it('should be tax-free for long-term holding', () => {
      expect(calcDividendTax(1000, 400)).toBe(0);
    });

    it('should charge 10% for medium-term', () => {
      expect(calcDividendTax(1000, 180)).toBe(100);
    });

    it('should charge 20% for short-term', () => {
      expect(calcDividendTax(1000, 15)).toBe(200);
    });

    it('should handle exact boundary 365 days', () => {
      expect(calcDividendTax(1000, 366)).toBe(0);
      expect(calcDividendTax(1000, 365)).toBeLessThanOrEqual(100);
    });

    it('should handle exact boundary 30 days', () => {
      expect(calcDividendTax(1000, 31)).toBe(100);
      expect(calcDividendTax(1000, 30)).toBe(200);
    });
  });

  describe('Margin Trading Rules', () => {
    function canMarginTrade(marketValue: number, cashBalance: number, maintenanceRatio: number = 0.13): boolean {
      return marketValue >= 500000 && cashBalance >= 0;
    }

    it('should require minimum 50万 assets', () => {
      expect(canMarginTrade(500000, 0)).toBe(true);
      expect(canMarginTrade(499999, 0)).toBe(false);
    });

    it('should calculate margin buying power', () => {
      const collateral = 1000000;
      const marginRatio = 0.5; // 50% initial margin
      const buyingPower = collateral / marginRatio - collateral;
      expect(buyingPower).toBe(1000000);
    });

    it('should calculate margin call threshold', () => {
      const totalAssets = 1500000;
      const debt = 1000000;
      const maintenanceRatio = 0.13;
      const marginLevel = totalAssets / debt;
      expect(marginLevel).toBe(1.5);
      expect(marginLevel).toBeGreaterThan(maintenanceRatio);
    });
  });

  describe('Stock Connect Rules', () => {
    function isNorthboundEligible(code: string, board: string): boolean {
      // Main board and ChiNext stocks with sufficient market cap
      return (code.startsWith('6') || code.startsWith('0') || code.startsWith('3')) &&
             (board === 'main' || board === 'gem');
    }

    it('should include SH main board', () => {
      expect(isNorthboundEligible('600519', 'main')).toBe(true);
    });

    it('should include SZ main board', () => {
      expect(isNorthboundEligible('000858', 'main')).toBe(true);
    });

    it('should include ChiNext', () => {
      expect(isNorthboundEligible('300750', 'gem')).toBe(true);
    });

    it('should exclude STAR Market', () => {
      expect(isNorthboundEligible('688000', 'star')).toBe(false);
    });
  });
});
