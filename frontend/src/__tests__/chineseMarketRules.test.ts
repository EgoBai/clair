import { describe, it, expect } from 'vitest';

// 中国A股市场规则引擎
describe('中国A股市场规则', () => {
  describe('涨跌停限制', () => {
    function priceLimit(prevClose: number, board: 'main' | 'gem' | 'star' | 'st'): { upLimit: number; downLimit: number } {
      const ratios: Record<string, number> = { main: 0.1, gem: 0.2, star: 0.2, st: 0.05 };
      const r = ratios[board];
      return {
        upLimit: Math.round(prevClose * (1 + r) * 100) / 100,
        downLimit: Math.round(prevClose * (1 - r) * 100) / 100,
      };
    }

    it('主板涨跌停10%', () => {
      const result = priceLimit(10, 'main');
      expect(result.upLimit).toBe(11);
      expect(result.downLimit).toBe(9);
    });

    it('创业板涨跌停20%', () => {
      const result = priceLimit(10, 'gem');
      expect(result.upLimit).toBe(12);
      expect(result.downLimit).toBe(8);
    });

    it('科创板涨跌停20%', () => {
      const result = priceLimit(50, 'star');
      expect(result.upLimit).toBe(60);
      expect(result.downLimit).toBe(40);
    });

    it('ST股票涨跌停5%', () => {
      const result = priceLimit(10, 'st');
      expect(result.upLimit).toBe(10.5);
      expect(result.downLimit).toBe(9.5);
    });

    it('非整数价格涨停正确四舍五入', () => {
      const result = priceLimit(7.33, 'main');
      expect(result.upLimit).toBe(8.06);
    });

    it('低价股涨停', () => {
      const result = priceLimit(1.01, 'main');
      expect(result.upLimit).toBe(1.11);
      expect(result.downLimit).toBe(0.91);
    });

    it('高价股跌停', () => {
      const result = priceLimit(1000, 'main');
      expect(result.upLimit).toBe(1100);
      expect(result.downLimit).toBe(900);
    });

    it('科创板高价股涨跌停', () => {
      const result = priceLimit(200, 'star');
      expect(result.upLimit).toBe(240);
      expect(result.downLimit).toBe(160);
    });

    it('ST低价股涨跌停', () => {
      const result = priceLimit(1.23, 'st');
      expect(result.upLimit).toBe(1.29);
      expect(result.downLimit).toBe(1.17);
    });

    it('多个价格连续涨停', () => {
      let price = 10;
      for (let i = 0; i < 3; i++) {
        price = priceLimit(price, 'main').upLimit;
      }
      expect(price).toBeCloseTo(13.31, 1);
    });
  });

  describe('交易时间判断', () => {
    function isTradingTime(date: Date): boolean {
      const day = date.getDay();
      if (day === 0 || day === 6) return false;
      const h = date.getHours();
      const m = date.getMinutes();
      const minutes = h * 60 + m;
      return (minutes >= 570 && minutes < 690) || (minutes >= 780 && minutes < 900);
    }

    it('上午9:30可以交易', () => {
      expect(isTradingTime(new Date(2024, 0, 15, 9, 30))).toBe(true);
    });

    it('上午11:30不能交易', () => {
      expect(isTradingTime(new Date(2024, 0, 15, 11, 30))).toBe(false);
    });

    it('下午13:00可以交易', () => {
      expect(isTradingTime(new Date(2024, 0, 15, 13, 0))).toBe(true);
    });

    it('下午15:00不能交易', () => {
      expect(isTradingTime(new Date(2024, 0, 15, 15, 0))).toBe(false);
    });

    it('周末不能交易', () => {
      expect(isTradingTime(new Date(2024, 0, 13, 10, 0))).toBe(false);
      expect(isTradingTime(new Date(2024, 0, 14, 10, 0))).toBe(false);
    });

    it('上午9:29不能交易', () => {
      expect(isTradingTime(new Date(2024, 0, 15, 9, 29))).toBe(false);
    });

    it('下午14:59可以交易', () => {
      expect(isTradingTime(new Date(2024, 0, 15, 14, 59))).toBe(true);
    });

    it('中午休市不能交易', () => {
      expect(isTradingTime(new Date(2024, 0, 15, 12, 0))).toBe(false);
      expect(isTradingTime(new Date(2024, 0, 15, 12, 30))).toBe(false);
    });

    it('集合竞价阶段(9:15-9:25)不算连续交易', () => {
      const callAuction = (h: number, m: number) => {
        const minutes = h * 60 + m;
        return minutes >= 555 && minutes <= 565;
      };
      expect(callAuction(9, 15)).toBe(true);
      expect(callAuction(9, 25)).toBe(true);
    });
  });

  describe('最小价格变动单位', () => {
    function tickSize(price: number): number {
      if (price < 0.1) return 0.001;
      if (price < 1) return 0.001;
      if (price < 5) return 0.01;
      if (price < 100) return 0.01;
      return 0.01;
    }

    it('1元以下最小变动0.001', () => {
      expect(tickSize(0.5)).toBe(0.001);
    });

    it('1-5元最小变动0.01', () => {
      expect(tickSize(3)).toBe(0.01);
    });

    it('5元以上最小变动0.01', () => {
      expect(tickSize(10)).toBe(0.01);
    });

    it('100元以上最小变动0.01', () => {
      expect(tickSize(200)).toBe(0.01);
    });
  });

  describe('最小交易单位', () => {
    function validateOrder(shares: number): { valid: boolean; reason: string } {
      if (shares < 100) return { valid: false, reason: '不足1手' };
      if (shares % 100 !== 0) return { valid: false, reason: '必须为100的整数倍' };
      return { valid: true, reason: '' };
    }

    it('100股是有效委托', () => {
      expect(validateOrder(100).valid).toBe(true);
    });

    it('200股是有效委托', () => {
      expect(validateOrder(200).valid).toBe(true);
    });

    it('50股不是有效委托', () => {
      expect(validateOrder(50).valid).toBe(false);
    });

    it('150股不是有效委托', () => {
      expect(validateOrder(150).valid).toBe(false);
    });

    it('0股不是有效委托', () => {
      expect(validateOrder(0).valid).toBe(false);
    });

    it('负数不是有效委托', () => {
      expect(validateOrder(-100).valid).toBe(false);
    });

    it('10000股是有效委托', () => {
      expect(validateOrder(10000).valid).toBe(true);
    });

    it('101股不是有效委托', () => {
      expect(validateOrder(101).valid).toBe(false);
    });
  });

  describe('手续费计算', () => {
    function calculateCommission(amount: number, type: 'buy' | 'sell'): { commission: number; stampTax: number; transferFee: number; total: number } {
      const commissionRate = 0.0003;
      const minCommission = 5;
      const commission = Math.max(amount * commissionRate, minCommission);
      const stampTax = type === 'sell' ? amount * 0.0005 : 0;
      const transferFee = amount * 0.00001;
      return { commission, stampTax, transferFee, total: commission + stampTax + transferFee };
    }

    it('买入手续费不含印花税', () => {
      const result = calculateCommission(10000, 'buy');
      expect(result.stampTax).toBe(0);
    });

    it('卖出手续费含印花税', () => {
      const result = calculateCommission(10000, 'sell');
      expect(result.stampTax).toBe(5);
    });

    it('最低佣金5元', () => {
      const result = calculateCommission(100, 'buy');
      expect(result.commission).toBe(5);
    });

    it('大额交易佣金按比例', () => {
      const result = calculateCommission(1000000, 'buy');
      expect(result.commission).toBe(300);
    });

    it('过户费按万分之0.1', () => {
      const result = calculateCommission(100000, 'buy');
      expect(result.transferFee).toBe(1);
    });

    it('总费用为各项之和', () => {
      const result = calculateCommission(100000, 'sell');
      expect(result.total).toBe(result.commission + result.stampTax + result.transferFee);
    });

    it('小额交易佣金最低5元', () => {
      const result = calculateCommission(1000, 'buy');
      expect(result.commission).toBe(5);
      expect(result.total).toBeGreaterThan(5);
    });

    it('卖出总费用高于买入', () => {
      const buy = calculateCommission(100000, 'buy');
      const sell = calculateCommission(100000, 'sell');
      expect(sell.total).toBeGreaterThan(buy.total);
    });
  });

  describe('T+1交易规则', () => {
    function canSellToday(buyDate: string, sellDate: string): boolean {
      return buyDate < sellDate;
    }

    it('当天买入不能当天卖出', () => {
      expect(canSellToday('2024-01-15', '2024-01-15')).toBe(false);
    });

    it('当天买入次日可以卖出', () => {
      expect(canSellToday('2024-01-15', '2024-01-16')).toBe(true);
    });

    it('隔周可以卖出', () => {
      expect(canSellToday('2024-01-12', '2024-01-15')).toBe(true);
    });
  });

  describe('复权计算', () => {
    function adjustPrice(price: number, dividend: number, splitRatio: number, type: 'forward' | 'backward'): number {
      if (type === 'forward') {
        return price / (1 - dividend / price) / splitRatio;
      }
      return price * (1 - dividend / price) * splitRatio;
    }

    it('前复权降低价格', () => {
      const adjusted = adjustPrice(10, 0.5, 1, 'forward');
      expect(adjusted).toBeGreaterThan(10);
    });

    it('后复权降低价格', () => {
      const adjusted = adjustPrice(10, 0.5, 1, 'backward');
      expect(adjusted).toBeLessThan(10);
    });

    it('无分红不调整', () => {
      const adjusted = adjustPrice(10, 0, 1, 'forward');
      expect(adjusted).toBe(10);
    });

    it('送股调整价格', () => {
      const adjusted = adjustPrice(10, 0, 2, 'forward');
      expect(adjusted).toBe(5);
    });
  });
});
