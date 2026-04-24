import { describe, it, expect } from 'vitest';
import {
  calculatePremiumRate,
  classifyPremiumStatus,
  determineArbitrageSignal,
  calculateLiquidityScore,
  calculateTrackingEfficiency,
  costAdjustedPremium,
  analyzePremiumDiscount,
  scanArbOpportunities,
  calculateFairValue,
  analyzeDivergence,
} from '../utils/etfPremiumDiscountEngine';
import type { ETFData } from '../utils/etfPremiumDiscountEngine';

function createETF(overrides: Partial<ETFData> = {}): ETFData {
  return {
    symbol: '510300.SH',
    name: '沪深300ETF',
    nav: 4.50,
    marketPrice: 4.52,
    totalAssets: 1000000000,
    shares: 222222222,
    trackingError: 0.0005,
    expenseRatio: 0.0015,
    dividendYield: 0.02,
    volume: 5000000,
    creationRedemptionUnit: 1000000,
    underlying: '000300.SH',
    ...overrides,
  };
}

describe('ETF Premium/Discount Engine', () => {
  describe('calculatePremiumRate', () => {
    it('should calculate premium rate for premium', () => {
      expect(calculatePremiumRate(105, 100)).toBeCloseTo(5, 2);
    });

    it('should calculate discount rate', () => {
      expect(calculatePremiumRate(95, 100)).toBeCloseTo(-5, 2);
    });

    it('should return 0 for zero NAV', () => {
      expect(calculatePremiumRate(100, 0)).toBe(0);
    });
  });

  describe('classifyPremiumStatus', () => {
    it('should classify premium', () => {
      expect(classifyPremiumStatus(1.5)).toBe('premium');
    });

    it('should classify discount', () => {
      expect(classifyPremiumStatus(-1.5)).toBe('discount');
    });

    it('should classify par', () => {
      expect(classifyPremiumStatus(0.1)).toBe('par');
    });
  });

  describe('determineArbitrageSignal', () => {
    it('should signal create for high premium', () => {
      expect(determineArbitrageSignal(1.5)).toBe('create');
    });

    it('should signal redeem for deep discount', () => {
      expect(determineArbitrageSignal(-1.5)).toBe('redeem');
    });

    it('should signal none for small premium', () => {
      expect(determineArbitrageSignal(0.3)).toBe('none');
    });
  });

  describe('calculateLiquidityScore', () => {
    it('should calculate liquidity score', () => {
      const score = calculateLiquidityScore(1000000, 1000000000);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should return 0 for zero assets', () => {
      expect(calculateLiquidityScore(100, 0)).toBe(0);
    });
  });

  describe('calculateTrackingEfficiency', () => {
    it('should return 100 for perfect tracking', () => {
      expect(calculateTrackingEfficiency(0.0015, 0.0015)).toBe(100);
    });

    it('should return lower value for poor tracking', () => {
      const efficiency = calculateTrackingEfficiency(0.01, 0.0015);
      expect(efficiency).toBeLessThan(100);
    });
  });

  describe('costAdjustedPremium', () => {
    it('should deduct costs from premium', () => {
      const adj = costAdjustedPremium(2.0, 0.15, 0.1);
      expect(adj).toBeCloseTo(1.75, 2);
    });
  });

  describe('analyzePremiumDiscount', () => {
    it('should return complete analysis', () => {
      const etf = createETF();
      const result = analyzePremiumDiscount(etf);

      expect(typeof result.premiumRate).toBe('number');
      expect(['premium', 'discount', 'par']).toContain(result.status);
      expect(['create', 'redeem', 'none']).toContain(result.arbitrageSignal);
      expect(result.liquidityScore).toBeGreaterThanOrEqual(0);
      expect(result.trackingEfficiency).toBeGreaterThanOrEqual(0);
    });

    it('should detect premium', () => {
      const etf = createETF({ marketPrice: 4.60, nav: 4.50 });
      const result = analyzePremiumDiscount(etf);
      expect(result.status).toBe('premium');
    });

    it('should detect discount', () => {
      const etf = createETF({ marketPrice: 4.40, nav: 4.50 });
      const result = analyzePremiumDiscount(etf);
      expect(result.status).toBe('discount');
    });
  });

  describe('scanArbOpportunities', () => {
    it('should find arbitrage opportunities', () => {
      const etfs = [
        createETF({ symbol: 'A', marketPrice: 4.70, nav: 4.50 }),
        createETF({ symbol: 'B', marketPrice: 4.30, nav: 4.50 }),
        createETF({ symbol: 'C', marketPrice: 4.51, nav: 4.50 }),
      ];
      const opps = scanArbOpportunities(etfs);
      expect(opps.length).toBeGreaterThan(0);
      opps.forEach((o) => {
        expect(['create', 'redeem']).toContain(o.direction);
        expect(['high', 'medium', 'low']).toContain(o.feasibility);
      });
    });

    it('should return empty for no opportunities', () => {
      const etfs = [createETF({ marketPrice: 4.51, nav: 4.50 })];
      expect(scanArbOpportunities(etfs).length).toBe(0);
    });
  });

  describe('calculateFairValue', () => {
    it('should calculate fair value', () => {
      expect(calculateFairValue(100, 0)).toBe(100);
      expect(calculateFairValue(100, 2)).toBe(102);
    });
  });

  describe('analyzeDivergence', () => {
    it('should calculate divergence metrics', () => {
      const etfReturns = [0.01, 0.02, -0.01, 0.005];
      const benchReturns = [0.011, 0.018, -0.012, 0.006];
      const result = analyzeDivergence(etfReturns, benchReturns);

      expect(typeof result.cumulativeDivergence).toBe('number');
      expect(typeof result.annualizedTrackingError).toBe('number');
      expect(typeof result.beta).toBe('number');
    });

    it('should handle empty data', () => {
      const result = analyzeDivergence([], []);
      expect(result.cumulativeDivergence).toBe(0);
      expect(result.beta).toBe(1);
    });
  });
});
