import { describe, it, expect } from 'vitest';
import { optimizeTurnover, TradeCost } from '../services/turnoverOptimizationEngine';

const defaultCost: TradeCost = {
  commissionRate: 0.0003,
  slippageRate: 0.0005,
  marketImpact: 0.0002,
};

describe('TurnoverOptimizationEngine', () => {
  describe('optimizeTurnover', () => {
    it('should return null for zero or negative grossAlpha', () => {
      expect(optimizeTurnover(0, 0.5, defaultCost)).toBeNull();
      expect(optimizeTurnover(-0.1, 0.5, defaultCost)).toBeNull();
    });

    it('should return null for negative currentTurnover', () => {
      expect(optimizeTurnover(0.1, -0.5, defaultCost)).toBeNull();
    });

    it('should compute valid result for positive alpha', () => {
      const result = optimizeTurnover(0.1, 0.3, defaultCost);
      expect(result).not.toBeNull();
      expect(result!.optimalTurnover).toBeGreaterThanOrEqual(0);
      expect(result!.optimalTurnover).toBeLessThanOrEqual(1);
      expect(result!.expectedCost).toBeGreaterThanOrEqual(0);
    });

    it('should return correct structure', () => {
      const result = optimizeTurnover(0.15, 0.4, defaultCost);
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('optimalTurnover');
      expect(result).toHaveProperty('expectedCost');
      expect(result).toHaveProperty('netAlpha');
      expect(result).toHaveProperty('costRatio');
      expect(result).toHaveProperty('turnoverLimit');
    });

    it('should have costRatio between 0 and 1 for profitable strategies', () => {
      const result = optimizeTurnover(0.2, 0.5, defaultCost);
      expect(result).not.toBeNull();
      expect(result!.costRatio).toBeGreaterThanOrEqual(0);
      expect(result!.costRatio).toBeLessThanOrEqual(1);
    });

    it('should handle very high alpha', () => {
      const result = optimizeTurnover(1.0, 0.5, defaultCost);
      expect(result).not.toBeNull();
      expect(result!.optimalTurnover).toBe(1); // capped at 1
    });

    it('should handle zero current turnover', () => {
      const result = optimizeTurnover(0.1, 0, defaultCost);
      expect(result).not.toBeNull();
      expect(result!.optimalTurnover).toBeGreaterThan(0);
    });

    it('should handle very high cost rate', () => {
      const highCost: TradeCost = { commissionRate: 0.01, slippageRate: 0.01, marketImpact: 0.01 };
      const result = optimizeTurnover(0.05, 0.3, highCost);
      expect(result).not.toBeNull();
      // With high costs, optimal turnover is still computed by formula
      expect(result!.optimalTurnover).toBeGreaterThan(0);
      expect(result!.expectedCost).toBeGreaterThan(0);
    });

    it('should respect alphaDecayRate parameter', () => {
      const r1 = optimizeTurnover(0.1, 0.3, defaultCost, 0.01);
      const r2 = optimizeTurnover(0.1, 0.3, defaultCost, 0.1);
      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();
      // Higher decay -> lower optimal turnover
      expect(r2!.optimalTurnover).toBeLessThan(r1!.optimalTurnover);
    });

    it('should have turnoverLimit <= 1', () => {
      const result = optimizeTurnover(0.5, 0.3, defaultCost);
      expect(result).not.toBeNull();
      expect(result!.turnoverLimit).toBeLessThanOrEqual(1);
    });
  });
});
