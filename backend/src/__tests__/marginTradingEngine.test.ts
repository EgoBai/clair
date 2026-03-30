import { describe, it, expect } from 'vitest';

// 融资融券引擎
interface MarginPosition {
  stockCode: string;
  type: 'margin_buy' | 'short_sell';
  principal: number;      // 本金
  borrowed: number;       // 借款/借券
  interestRate: number;   // 年利率
  days: number;           // 持有天数
  currentPrice: number;
  entryPrice: number;
  quantity: number;
}

function calcInterest(principal: number, rate: number, days: number): number {
  return principal * rate * days / 365;
}

function calcMarginRatio(position: MarginPosition): number {
  const totalValue = position.quantity * position.currentPrice;
  return totalValue > 0 ? position.principal / totalValue : 0;
}

function calcMaintenanceMargin(position: MarginPosition): number {
  const totalValue = position.quantity * position.currentPrice;
  return totalValue * 0.13; // A股维保比例底线130%
}

function calcLiquidationPrice(position: MarginPosition): number {
  if (position.type === 'margin_buy') {
    const interest = calcInterest(position.borrowed, position.interestRate, position.days);
    const debt = position.borrowed + interest;
    const maintMargin = debt * 1.3;
    return (maintMargin + debt - position.principal) / position.quantity;
  } else {
    const interest = calcInterest(position.borrowed * position.entryPrice, position.interestRate, position.days);
    const collateral = position.principal + position.borrowed * position.entryPrice;
    return (collateral + interest) / (position.quantity * 1.3);
  }
}

function calcMarginPnL(position: MarginPosition): number {
  if (position.type === 'margin_buy') {
    const interest = calcInterest(position.borrowed, position.interestRate, position.days);
    return position.quantity * (position.currentPrice - position.entryPrice) - interest;
  } else {
    const interest = calcInterest(position.borrowed * position.entryPrice, position.interestRate, position.days);
    return position.quantity * (position.entryPrice - position.currentPrice) - interest;
  }
}

function calcMarginReturn(position: MarginPosition): number {
  return position.principal > 0 ? (calcMarginPnL(position) / position.principal) * 100 : 0;
}

function isMarginCall(position: MarginPosition): boolean {
  const totalValue = position.quantity * position.currentPrice;
  const equity = position.type === 'margin_buy'
    ? totalValue - position.borrowed
    : position.principal + position.borrowed * position.entryPrice - totalValue;
  const debt = position.type === 'margin_buy' ? position.borrowed : totalValue;
  return debt > 0 && (equity / debt) < 1.3;
}

function calcMaxBorrowable(principal: number, marginRatio: number): number {
  if (marginRatio <= 0 || marginRatio >= 1) return 0;
  return principal / marginRatio - principal;
}

describe('融资融券引擎', () => {
  const marginBuy: MarginPosition = {
    stockCode: '000001', type: 'margin_buy',
    principal: 100000, borrowed: 100000, interestRate: 0.065,
    days: 30, currentPrice: 12, entryPrice: 10, quantity: 20000,
  };

  const shortSell: MarginPosition = {
    stockCode: '000002', type: 'short_sell',
    principal: 100000, borrowed: 10000, interestRate: 0.08,
    days: 30, currentPrice: 18, entryPrice: 20, quantity: 10000,
  };

  describe('利息计算', () => {
    it('应按日计算利息', () => {
      expect(calcInterest(100000, 0.065, 30)).toBeCloseTo(534.25, 1);
    });

    it('零天应为0', () => { expect(calcInterest(100000, 0.065, 0)).toBe(0); });
    it('零利率应为0', () => { expect(calcInterest(100000, 0, 30)).toBe(0); });
  });

  describe('保证金比例', () => {
    it('应正确计算', () => {
      expect(calcMarginRatio(marginBuy)).toBeCloseTo(0.417, 2);
    });
  });

  describe('强平价格', () => {
    it('融资应返回触发强平的价格', () => {
      const liqPrice = calcLiquidationPrice(marginBuy);
      expect(liqPrice).toBeGreaterThan(0);
      expect(liqPrice).toBeLessThan(marginBuy.entryPrice);
    });

    it('融券应返回触发强平的价格', () => {
      const liqPrice = calcLiquidationPrice(shortSell);
      expect(liqPrice).toBeGreaterThan(shortSell.entryPrice);
    });
  });

  describe('盈亏计算', () => {
    it('融资上涨应盈利', () => {
      const profit = calcMarginPnL({ ...marginBuy, currentPrice: 12 });
      expect(profit).toBeGreaterThan(0);
    });

    it('融券下跌应盈利', () => {
      const profit = calcMarginPnL(shortSell);
      expect(profit).toBeGreaterThan(0);
    });

    it('融资下跌应亏损', () => {
      expect(calcMarginPnL({ ...marginBuy, currentPrice: 8 })).toBeLessThan(0);
    });
  });

  describe('收益率', () => {
    it('应计算保证金收益率', () => {
      expect(calcMarginReturn(marginBuy)).toBeGreaterThan(0);
    });

    it('本金为零应返回0', () => {
      expect(calcMarginReturn({ ...marginBuy, principal: 0 })).toBe(0);
    });
  });

  describe('追保判定', () => {
    it('价格暴跌应触发追保', () => {
      expect(isMarginCall({ ...marginBuy, currentPrice: 5 })).toBe(true);
    });

    it('价格正常不应触发', () => {
      expect(isMarginCall(marginBuy)).toBe(false);
    });
  });

  describe('最大可融资额', () => {
    it('应正确计算', () => {
      expect(calcMaxBorrowable(100000, 0.5)).toBe(100000);
    });

    it('保证金比例<=0应返回0', () => { expect(calcMaxBorrowable(100000, 0)).toBe(0); });
    it('保证金比例>=1应返回0', () => { expect(calcMaxBorrowable(100000, 1)).toBe(0); });
  });
});
