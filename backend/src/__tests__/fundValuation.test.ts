import { describe, it, expect } from 'vitest';

// 基金估值计算测试
describe('Fund Valuation', () => {
  // ETF净值计算
  const calcNAV = (holdings: { weight: number; price: number; prevPrice: number }[], prevNAV: number): number => {
    const portfolioReturn = holdings.reduce((s, h) => s + h.weight * (h.price / h.prevPrice - 1), 0);
    return prevNAV * (1 + portfolioReturn);
  };

  // 折溢价率
  const calcPremiumDiscount = (marketPrice: number, nav: number): number => {
    return nav > 0 ? ((marketPrice - nav) / nav) * 100 : 0;
  };

  // 基金规模估算
  const calcFundSize = (shares: number, nav: number): number => shares * nav;

  // 跟踪误差
  const calcTrackingError = (fundReturns: number[], benchmarkReturns: number[]): number => {
    if (fundReturns.length !== benchmarkReturns.length || fundReturns.length === 0) return 0;
    const diffs = fundReturns.map((r, i) => r - benchmarkReturns[i]);
    const mean = diffs.reduce((s, d) => s + d, 0) / diffs.length;
    return Math.sqrt(diffs.reduce((s, d) => s + (d - mean) ** 2, 0) / diffs.length);
  };

  // 年化收益率
  const calcAnnualizedReturn = (totalReturn: number, days: number): number => {
    if (days <= 0) return 0;
    return Math.pow(1 + totalReturn, 365 / days) - 1;
  };

  // 费用影响
  const calcFeeImpact = (nav: number, managementFee: number, custodyFee: number, days: number): number => {
    const dailyFee = (managementFee + custodyFee) / 365;
    return nav * dailyFee * days;
  };

  // 股息率
  const calcDividendYield = (dividends: number[], price: number): number => {
    if (price <= 0) return 0;
    const totalDiv = dividends.reduce((s, d) => s + d, 0);
    return (totalDiv / price) * 100;
  };

  describe('NAV Calculation', () => {
    it('should calculate NAV change from holdings', () => {
      const holdings = [
        { weight: 0.5, price: 110, prevPrice: 100 },
        { weight: 0.3, price: 95, prevPrice: 100 },
        { weight: 0.2, price: 105, prevPrice: 100 },
      ];
      const nav = calcNAV(holdings, 1.0);
      // return = 0.5*0.1 + 0.3*(-0.05) + 0.2*0.05 = 0.05 - 0.015 + 0.01 = 0.045
      expect(nav).toBeCloseTo(1.045, 5);
    });

    it('should handle all holdings rising', () => {
      const holdings = [
        { weight: 0.5, price: 110, prevPrice: 100 },
        { weight: 0.5, price: 105, prevPrice: 100 },
      ];
      const nav = calcNAV(holdings, 1.0);
      expect(nav).toBeGreaterThan(1.0);
    });

    it('should handle all holdings falling', () => {
      const holdings = [
        { weight: 0.5, price: 90, prevPrice: 100 },
        { weight: 0.5, price: 95, prevPrice: 100 },
      ];
      const nav = calcNAV(holdings, 1.0);
      expect(nav).toBeLessThan(1.0);
    });

    it('should handle single holding', () => {
      const holdings = [{ weight: 1.0, price: 105, prevPrice: 100 }];
      const nav = calcNAV(holdings, 2.0);
      expect(nav).toBeCloseTo(2.1, 5);
    });

    it('should return prevNAV for flat holdings', () => {
      const holdings = [{ weight: 1.0, price: 100, prevPrice: 100 }];
      expect(calcNAV(holdings, 1.5)).toBe(1.5);
    });
  });

  describe('Premium/Discount', () => {
    it('should calculate premium', () => {
      expect(calcPremiumDiscount(105, 100)).toBeCloseTo(5, 5);
    });

    it('should calculate discount', () => {
      expect(calcPremiumDiscount(95, 100)).toBeCloseTo(-5, 5);
    });

    it('should be 0 at par', () => {
      expect(calcPremiumDiscount(100, 100)).toBe(0);
    });

    it('should handle zero NAV', () => {
      expect(calcPremiumDiscount(100, 0)).toBe(0);
    });
  });

  describe('Fund Size', () => {
    it('should calculate fund size', () => {
      expect(calcFundSize(1000000, 1.5)).toBe(1500000);
    });

    it('should handle zero shares', () => {
      expect(calcFundSize(0, 1.5)).toBe(0);
    });
  });

  describe('Tracking Error', () => {
    it('should calculate tracking error', () => {
      const fund = [0.01, 0.02, -0.01, 0.03];
      const bench = [0.01, 0.015, -0.005, 0.025];
      const te = calcTrackingError(fund, bench);
      expect(te).toBeGreaterThan(0);
    });

    it('should be 0 for identical returns', () => {
      const returns = [0.01, 0.02, -0.01];
      expect(calcTrackingError(returns, returns)).toBe(0);
    });

    it('should handle mismatched lengths', () => {
      expect(calcTrackingError([0.01], [0.01, 0.02])).toBe(0);
    });

    it('should handle empty arrays', () => {
      expect(calcTrackingError([], [])).toBe(0);
    });
  });

  describe('Annualized Return', () => {
    it('should annualize 10% in 180 days', () => {
      const annual = calcAnnualizedReturn(0.1, 180);
      expect(annual).toBeGreaterThan(0.1);
      expect(annual).toBeCloseTo(0.21, 1);
    });

    it('should handle zero return', () => {
      expect(calcAnnualizedReturn(0, 365)).toBe(0);
    });

    it('should handle zero days', () => {
      expect(calcAnnualizedReturn(0.1, 0)).toBe(0);
    });

    it('should handle full year', () => {
      expect(calcAnnualizedReturn(0.1, 365)).toBeCloseTo(0.1, 5);
    });

    it('should handle negative return', () => {
      const annual = calcAnnualizedReturn(-0.1, 180);
      expect(annual).toBeLessThan(0);
    });
  });

  describe('Fee Impact', () => {
    it('should calculate fee impact', () => {
      const impact = calcFeeImpact(1000000, 0.005, 0.001, 365);
      expect(impact).toBeCloseTo(6000, 0);
    });

    it('should be 0 for zero fees', () => {
      expect(calcFeeImpact(1000000, 0, 0, 365)).toBe(0);
    });

    it('should be proportional to NAV', () => {
      const i1 = calcFeeImpact(1000000, 0.005, 0.001, 30);
      const i2 = calcFeeImpact(2000000, 0.005, 0.001, 30);
      expect(i2).toBeCloseTo(i1 * 2, 5);
    });
  });

  describe('Dividend Yield', () => {
    it('should calculate dividend yield', () => {
      expect(calcDividendYield([0.5, 0.5], 20)).toBeCloseTo(5, 5);
    });

    it('should handle zero price', () => {
      expect(calcDividendYield([0.5], 0)).toBe(0);
    });

    it('should handle no dividends', () => {
      expect(calcDividendYield([], 100)).toBe(0);
    });

    it('should sum quarterly dividends', () => {
      expect(calcDividendYield([0.25, 0.25, 0.25, 0.25], 50)).toBeCloseTo(2, 5);
    });
  });
});
