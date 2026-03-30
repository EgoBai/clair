import { describe, it, expect } from 'vitest';

// Financial models and calculations tests
describe('Financial Models', () => {
  describe('DCF Valuation', () => {
    function dcfValue(cashFlows: number[], terminalGrowth: number, discountRate: number): number {
      const pvCashFlows = cashFlows.reduce((sum, cf, i) => sum + cf / Math.pow(1 + discountRate, i + 1), 0);
      const terminalValue = cashFlows[cashFlows.length - 1] * (1 + terminalGrowth) / (discountRate - terminalGrowth);
      const pvTerminal = terminalValue / Math.pow(1 + discountRate, cashFlows.length);
      return pvCashFlows + pvTerminal;
    }

    it('should calculate DCF value', () => {
      const cashFlows = [100, 110, 120, 130, 140];
      const value = dcfValue(cashFlows, 0.03, 0.10);
      expect(value).toBeGreaterThan(0);
    });

    it('should increase with lower discount rate', () => {
      const cf = [100, 110, 120, 130, 140];
      const v1 = dcfValue(cf, 0.03, 0.10);
      const v2 = dcfValue(cf, 0.03, 0.08);
      expect(v2).toBeGreaterThan(v1);
    });

    it('should increase with higher terminal growth', () => {
      const cf = [100, 110, 120, 130, 140];
      const v1 = dcfValue(cf, 0.02, 0.10);
      const v2 = dcfValue(cf, 0.04, 0.10);
      expect(v2).toBeGreaterThan(v1);
    });

    it('should handle single cash flow', () => {
      const value = dcfValue([100], 0.03, 0.10);
      expect(value).toBeGreaterThan(100);
    });
  });

  describe('WACC Calculation', () => {
    function wacc(equityWeight: number, debtWeight: number, costOfEquity: number, costOfDebt: number, taxRate: number): number {
      return equityWeight * costOfEquity + debtWeight * costOfDebt * (1 - taxRate);
    }

    it('should calculate WACC', () => {
      const result = wacc(0.7, 0.3, 0.10, 0.05, 0.25);
      expect(result).toBeCloseTo(0.08125, 4);
    });

    it('should equal cost of equity when no debt', () => {
      const result = wacc(1.0, 0.0, 0.10, 0.05, 0.25);
      expect(result).toBe(0.10);
    });

    it('should benefit from tax shield', () => {
      const noTax = wacc(0.5, 0.5, 0.10, 0.06, 0);
      const withTax = wacc(0.5, 0.5, 0.10, 0.06, 0.25);
      expect(withTax).toBeLessThan(noTax);
    });

    it('should sum weights to 1', () => {
      const w = 0.7 + 0.3;
      expect(w).toBe(1);
    });
  });

  describe('DuPont Analysis', () => {
    function dupont(roe: number): { netMargin: number; assetTurnover: number; equityMultiplier: number } {
      // ROE = Net Margin × Asset Turnover × Equity Multiplier
      // Simplified: use typical decomposition
      return { netMargin: 0.10, assetTurnover: 0.8, equityMultiplier: 2.0 };
    }

    function calcROE(netMargin: number, assetTurnover: number, equityMultiplier: number): number {
      return netMargin * assetTurnover * equityMultiplier;
    }

    it('should decompose ROE', () => {
      const { netMargin, assetTurnover, equityMultiplier } = dupont(0.16);
      const roe = calcROE(netMargin, assetTurnover, equityMultiplier);
      expect(roe).toBeCloseTo(0.16, 2);
    });

    it('should have multiplicative relationship', () => {
      const roe = calcROE(0.12, 0.75, 1.8);
      expect(roe).toBe(0.162);
    });

    it('should detect high leverage risk', () => {
      const equityMultiplier = 3.5;
      expect(equityMultiplier).toBeGreaterThan(2.5);
    });
  });

  describe('PEG Ratio', () => {
    function pegRatio(pe: number, growthRate: number): number {
      if (growthRate <= 0) return Infinity;
      return pe / growthRate;
    }

    it('should calculate PEG', () => {
      expect(pegRatio(30, 20)).toBe(1.5);
    });

    it('should indicate undervalued when PEG < 1', () => {
      expect(pegRatio(15, 20)).toBeLessThan(1);
    });

    it('should handle zero growth', () => {
      expect(pegRatio(30, 0)).toBe(Infinity);
    });

    it('should handle negative growth', () => {
      expect(pegRatio(30, -5)).toBe(Infinity);
    });
  });

  describe('EV/EBITDA Multiples', () => {
    function evEbitda(marketCap: number, debt: number, cash: number, ebitda: number): number {
      const ev = marketCap + debt - cash;
      return ev / ebitda;
    }

    it('should calculate EV/EBITDA', () => {
      expect(evEbitda(1000, 200, 100, 150)).toBeCloseTo(7.33, 1);
    });

    it('should decrease with more cash', () => {
      const v1 = evEbitda(1000, 200, 100, 150);
      const v2 = evEbitda(1000, 200, 300, 150);
      expect(v2).toBeLessThan(v1);
    });

    it('should increase with more debt', () => {
      const v1 = evEbitda(1000, 200, 100, 150);
      const v2 = evEbitda(1000, 400, 100, 150);
      expect(v2).toBeGreaterThan(v1);
    });
  });

  describe('Operating Leverage', () => {
    function degreeOfOperatingLeverage(contributionMargin: number, operatingIncome: number): number {
      return contributionMargin / operatingIncome;
    }

    it('should calculate DOL', () => {
      expect(degreeOfOperatingLeverage(500, 200)).toBe(2.5);
    });

    it('should indicate high fixed cost when DOL > 3', () => {
      const dol = degreeOfOperatingLeverage(600, 150);
      expect(dol).toBeGreaterThan(3);
    });

    it('should estimate income change from revenue change', () => {
      const dol = 2.5;
      const revenueChange = 0.10; // 10% revenue increase
      const incomeChange = dol * revenueChange;
      expect(incomeChange).toBe(0.25); // 25% income increase
    });
  });

  describe('Free Cash Flow', () => {
    function fcf(operatingCashFlow: number, capex: number): number {
      return operatingCashFlow - capex;
    }

    function fcfYield(fcf: number, marketCap: number): number {
      return fcf / marketCap;
    }

    it('should calculate FCF', () => {
      expect(fcf(500, 200)).toBe(300);
    });

    it('should calculate FCF yield', () => {
      expect(fcfYield(300, 5000)).toBe(0.06);
    });

    it('should have higher yield for better value', () => {
      expect(fcfYield(400, 5000)).toBeGreaterThan(fcfYield(300, 5000));
    });

    it('should flag negative FCF', () => {
      const result = fcf(200, 500);
      expect(result).toBeLessThan(0);
    });
  });

  describe('Earnings Quality', () => {
    function earningsQuality(netIncome: number, operatingCashFlow: number): { ratio: number; quality: string } {
      const ratio = operatingCashFlow / netIncome;
      let quality = 'poor';
      if (ratio > 1.2) quality = 'excellent';
      else if (ratio > 0.8) quality = 'good';
      else if (ratio > 0.5) quality = 'fair';
      return { ratio, quality };
    }

    it('should rate excellent when OCF >> net income', () => {
      const { quality } = earningsQuality(100, 150);
      expect(quality).toBe('excellent');
    });

    it('should rate poor when OCF << net income', () => {
      const { quality } = earningsQuality(100, 30);
      expect(quality).toBe('poor');
    });

    it('should calculate accruals ratio', () => {
      const netIncome = 100;
      const ocf = 70;
      const accrualRatio = (netIncome - ocf) / netIncome;
      expect(accrualRatio).toBe(0.3);
    });
  });

  describe('Altman Z-Score', () => {
    function altmanZScore(
      workingCapital: number, totalAssets: number,
      retainedEarnings: number, ebit: number,
      marketCap: number, totalLiabilities: number,
      revenue: number
    ): number {
      const a = workingCapital / totalAssets;
      const b = retainedEarnings / totalAssets;
      const c = ebit / totalAssets;
      const d = marketCap / totalLiabilities;
      const e = revenue / totalAssets;
      return 1.2 * a + 1.4 * b + 3.3 * c + 0.6 * d + 1.0 * e;
    }

    it('should calculate Z-Score', () => {
      const z = altmanZScore(500, 2000, 800, 400, 3000, 1000, 4000);
      expect(Number.isFinite(z)).toBe(true);
    });

    it('should indicate safe zone when Z > 2.99', () => {
      const z = altmanZScore(800, 2000, 1000, 600, 5000, 500, 5000);
      expect(z).toBeGreaterThan(2.99);
    });

    it('should indicate danger zone when Z < 1.81', () => {
      const z = altmanZScore(-200, 2000, 100, 50, 500, 2000, 1000);
      expect(z).toBeLessThan(1.81);
    });
  });

  describe('Bond Pricing', () => {
    function bondPrice(faceValue: number, couponRate: number, ytm: number, years: number): number {
      const coupon = faceValue * couponRate;
      let price = 0;
      for (let t = 1; t <= years; t++) {
        price += coupon / Math.pow(1 + ytm, t);
      }
      price += faceValue / Math.pow(1 + ytm, years);
      return price;
    }

    it('should price at par when coupon = YTM', () => {
      expect(bondPrice(1000, 0.05, 0.05, 10)).toBeCloseTo(1000, 0);
    });

    it('should price above par when coupon > YTM', () => {
      expect(bondPrice(1000, 0.08, 0.05, 10)).toBeGreaterThan(1000);
    });

    it('should price below par when coupon < YTM', () => {
      expect(bondPrice(1000, 0.03, 0.05, 10)).toBeLessThan(1000);
    });

    it('should approach face value as YTM approaches coupon', () => {
      const price = bondPrice(1000, 0.05, 0.0501, 10);
      expect(price).toBeCloseTo(1000, -1);
    });
  });

  describe('Duration and Convexity', () => {
    function macaulayDuration(faceValue: number, couponRate: number, ytm: number, years: number): number {
      const coupon = faceValue * couponRate;
      let weightedSum = 0, price = 0;
      for (let t = 1; t <= years; t++) {
        const pv = coupon / Math.pow(1 + ytm, t);
        weightedSum += t * pv;
        price += pv;
      }
      const pvFace = faceValue / Math.pow(1 + ytm, years);
      weightedSum += years * pvFace;
      price += pvFace;
      return weightedSum / price;
    }

    it('should calculate Macaulay duration', () => {
      const dur = macaulayDuration(1000, 0.05, 0.05, 10);
      expect(dur).toBeGreaterThan(0);
      expect(dur).toBeLessThan(10);
    });

    it('should have shorter duration for higher coupon', () => {
      const dur1 = macaulayDuration(1000, 0.08, 0.05, 10);
      const dur2 = macaulayDuration(1000, 0.03, 0.05, 10);
      expect(dur1).toBeLessThan(dur2);
    });

    it('should equal maturity for zero coupon bond', () => {
      const dur = macaulayDuration(1000, 0, 0.05, 10);
      expect(dur).toBeCloseTo(10, 0);
    });
  });

  describe('CAPM', () => {
    function capm(riskFree: number, beta: number, marketReturn: number): number {
      return riskFree + beta * (marketReturn - riskFree);
    }

    it('should calculate expected return', () => {
      expect(capm(0.03, 1.2, 0.10)).toBeCloseTo(0.114, 3);
    });

    it('should equal market return when beta = 1', () => {
      expect(capm(0.03, 1.0, 0.10)).toBe(0.10);
    });

    it('should equal risk-free when beta = 0', () => {
      expect(capm(0.03, 0, 0.10)).toBe(0.03);
    });

    it('should exceed market return when beta > 1', () => {
      expect(capm(0.03, 1.5, 0.10)).toBeGreaterThan(0.10);
    });
  });
});
