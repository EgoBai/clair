import { describe, it, expect } from 'vitest';

// Financial calculation utilities tests
describe('Financial Calculations', () => {
  // Compound interest
  describe('Compound Interest', () => {
    function compoundInterest(principal: number, rate: number, periods: number): number {
      return principal * Math.pow(1 + rate, periods);
    }

    it('should calculate compound interest', () => {
      expect(compoundInterest(10000, 0.05, 1)).toBeCloseTo(10500, 2);
    });

    it('should handle multiple periods', () => {
      expect(compoundInterest(10000, 0.1, 3)).toBeCloseTo(13310, 2);
    });

    it('should handle zero rate', () => {
      expect(compoundInterest(10000, 0, 5)).toBe(10000);
    });

    it('should handle zero periods', () => {
      expect(compoundInterest(10000, 0.1, 0)).toBe(10000);
    });

    it('should handle negative rate (loss)', () => {
      const result = compoundInterest(10000, -0.1, 1);
      expect(result).toBeCloseTo(9000, 2);
    });
  });

  // Moving averages
  describe('Moving Averages', () => {
    function sma(values: number[], period: number): number[] {
      const result: number[] = [];
      for (let i = 0; i < values.length; i++) {
        if (i < period - 1) {
          result.push(NaN);
        } else {
          const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
          result.push(sum / period);
        }
      }
      return result;
    }

    function ema(values: number[], period: number): number[] {
      const k = 2 / (period + 1);
      const result: number[] = [values[0]];
      for (let i = 1; i < values.length; i++) {
        result.push(values[i] * k + result[i - 1] * (1 - k));
      }
      return result;
    }

    it('should calculate SMA correctly', () => {
      const result = sma([1, 2, 3, 4, 5], 3);
      expect(result[2]).toBeCloseTo(2, 2); // (1+2+3)/3
      expect(result[4]).toBeCloseTo(4, 2); // (3+4+5)/3
    });

    it('should have NaN for insufficient data in SMA', () => {
      const result = sma([1, 2], 3);
      expect(result[0]).toBeNaN();
      expect(result[1]).toBeNaN();
    });

    it('should calculate EMA correctly', () => {
      const result = ema([1, 2, 3, 4, 5], 3);
      expect(result[0]).toBe(1);
      expect(result.length).toBe(5);
      // EMA should follow trend
      expect(result[4]).toBeGreaterThan(result[0]);
    });

    it('should handle single value', () => {
      const result = sma([42], 1);
      expect(result[0]).toBe(42);
    });

    it('should handle flat data', () => {
      const result = sma([5, 5, 5, 5, 5], 3);
      expect(result[2]).toBe(5);
      expect(result[4]).toBe(5);
    });
  });

  // VWAP (Volume Weighted Average Price)
  describe('VWAP', () => {
    function vwap(prices: number[], volumes: number[]): number {
      if (prices.length !== volumes.length || prices.length === 0) return 0;
      const totalVolume = volumes.reduce((a, b) => a + b, 0);
      if (totalVolume === 0) return 0;
      const pvSum = prices.reduce((sum, p, i) => sum + p * volumes[i], 0);
      return pvSum / totalVolume;
    }

    it('should calculate VWAP correctly', () => {
      const vwapVal = vwap([10, 11, 12], [100, 200, 100]);
      // (10*100 + 11*200 + 12*100) / 400 = 5400/400 = 13.5... 
      // Wait: 1000+2200+1200 = 4400 / 400 = 11
      expect(vwapVal).toBeCloseTo(11, 2);
    });

    it('should weight higher volume more', () => {
      const vwapVal = vwap([10, 20], [1000, 1]);
      // (10*1000 + 20*1) / 1001 ≈ 10.01
      expect(vwapVal).toBeGreaterThan(10);
      expect(vwapVal).toBeLessThan(11);
    });

    it('should handle equal volumes (= simple avg)', () => {
      const vwapVal = vwap([10, 20, 30], [100, 100, 100]);
      expect(vwapVal).toBeCloseTo(20, 2);
    });

    it('should return 0 for empty data', () => {
      expect(vwap([], [])).toBe(0);
    });

    it('should return 0 for zero volume', () => {
      expect(vwap([10, 20], [0, 0])).toBe(0);
    });
  });

  // Return calculations
  describe('Return Calculations', () => {
    function totalReturn(buyPrice: number, sellPrice: number, shares: number, commission = 0): number {
      const buyCost = buyPrice * shares + commission;
      const sellRevenue = sellPrice * shares - commission;
      return (sellRevenue - buyCost) / buyCost;
    }

    function annualizedReturn(totalReturn: number, days: number): number {
      if (days <= 0) return 0;
      return Math.pow(1 + totalReturn, 365 / days) - 1;
    }

    it('should calculate total return', () => {
      expect(totalReturn(10, 11, 100)).toBeCloseTo(0.1, 4);
    });

    it('should deduct commission', () => {
      const ret = totalReturn(10, 11, 100, 5);
      expect(ret).toBeLessThan(0.1);
    });

    it('should handle loss', () => {
      expect(totalReturn(10, 9, 100)).toBeLessThan(0);
    });

    it('should calculate annualized return', () => {
      const ret = annualizedReturn(0.1, 365);
      expect(ret).toBeCloseTo(0.1, 2);
    });

    it('should handle zero days', () => {
      expect(annualizedReturn(0.1, 0)).toBe(0);
    });

    it('should amplify short-term gains', () => {
      const ret = annualizedReturn(0.05, 30);
      expect(ret).toBeGreaterThan(0.05);
    });
  });

  // Sharpe Ratio
  describe('Sharpe Ratio', () => {
    function sharpeRatio(returns: number[], riskFreeRate = 0.03): number {
      if (returns.length < 2) return 0;
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const excessReturn = avgReturn - riskFreeRate / 252;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1);
      const stdDev = Math.sqrt(variance);
      if (stdDev === 0) return 0;
      return (excessReturn / stdDev) * Math.sqrt(252);
    }

    it('should return positive for profitable strategy', () => {
      const returns = Array(100).fill(0.001);
      expect(sharpeRatio(returns)).toBeGreaterThan(0);
    });

    it('should return 0 for empty data', () => {
      expect(sharpeRatio([])).toBe(0);
    });

    it('should return 0 for single data point', () => {
      expect(sharpeRatio([0.01])).toBe(0);
    });

    it('should return 0 for zero volatility', () => {
      expect(sharpeRatio([0.001, 0.001, 0.001])).toBe(0);
    });

    it('should handle negative returns', () => {
      const returns = Array(50).fill(-0.002);
      expect(sharpeRatio(returns)).toBeLessThan(0);
    });
  });

  // Maximum Drawdown
  describe('Maximum Drawdown', () => {
    function maxDrawdown(equity: number[]): { maxDD: number; peakIdx: number; troughIdx: number } {
      if (equity.length === 0) return { maxDD: 0, peakIdx: -1, troughIdx: -1 };
      let peak = equity[0];
      let peakIdx = 0;
      let maxDD = 0;
      let bestPeakIdx = 0;
      let bestTroughIdx = 0;

      for (let i = 1; i < equity.length; i++) {
        if (equity[i] > peak) {
          peak = equity[i];
          peakIdx = i;
        }
        const dd = (peak - equity[i]) / peak;
        if (dd > maxDD) {
          maxDD = dd;
          bestPeakIdx = peakIdx;
          bestTroughIdx = i;
        }
      }
      return { maxDD, peakIdx: bestPeakIdx, troughIdx: bestTroughIdx };
    }

    it('should find max drawdown', () => {
      const result = maxDrawdown([100, 110, 90, 95, 80, 100]);
      expect(result.maxDD).toBeCloseTo(0.273, 1); // (110-80)/110
      expect(result.peakIdx).toBe(1);
      expect(result.troughIdx).toBe(4);
    });

    it('should return 0 for always rising', () => {
      const result = maxDrawdown([100, 110, 120, 130]);
      expect(result.maxDD).toBe(0);
    });

    it('should return 0 for empty', () => {
      expect(maxDrawdown([]).maxDD).toBe(0);
    });

    it('should handle single element', () => {
      expect(maxDrawdown([100]).maxDD).toBe(0);
    });

    it('should handle falling market', () => {
      const result = maxDrawdown([100, 90, 80, 70]);
      expect(result.maxDD).toBeCloseTo(0.3, 2);
    });
  });
});
