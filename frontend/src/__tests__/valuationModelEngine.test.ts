import { describe, it, expect } from 'vitest';
import { multiDimensionalValuation, ValuationInput } from '../utils/valuationModelEngine';

describe('多维估值模型引擎', () => {
  const input: ValuationInput = {
    symbol: '000001',
    name: '平安银行',
    currentPrice: 12,
    eps: 1.5,
    bookValue: 15,
    revenue: 50000,
    sharesOutstanding: 1000,
    netIncome: 1500,
    growthRate: 0.15,
    industryPE: 8,
    industryPB: 1.0,
    historicalPE: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    historicalPB: [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4],
  };

  describe('multiDimensionalValuation', () => {
    it('should calculate PE/PB/PS/PEG', () => {
      const result = multiDimensionalValuation(input);
      expect(result.pe).toBeCloseTo(8, 0);
      expect(result.pb).toBeCloseTo(0.8, 1);
      expect(result.ps).toBeGreaterThan(0);
    });

    it('should calculate fair values', () => {
      const result = multiDimensionalValuation(input);
      expect(result.fairValuePE).toBeGreaterThan(0);
      expect(result.fairValuePB).toBeGreaterThan(0);
    });

    it('should calculate composite fair value', () => {
      const result = multiDimensionalValuation(input);
      expect(result.compositeFairValue).toBeGreaterThan(0);
    });

    it('should calculate margin of safety', () => {
      const result = multiDimensionalValuation(input);
      expect(typeof result.marginOfSafety).toBe('number');
    });

    it('should determine verdict', () => {
      const result = multiDimensionalValuation(input);
      expect(['deep_undervalue', 'undervalue', 'fair', 'overvalue', 'deep_overvalue']).toContain(result.verdict);
    });

    it('should calculate valuation band', () => {
      const result = multiDimensionalValuation(input);
      expect(result.valuationBand.low).toBeLessThan(result.valuationBand.mid);
      expect(result.valuationBand.mid).toBeLessThan(result.valuationBand.high);
    });

    it('should detect undervalued stock', () => {
      const cheap: ValuationInput = { ...input, currentPrice: 5 };
      const result = multiDimensionalValuation(cheap);
      expect(['deep_undervalue', 'undervalue']).toContain(result.verdict);
      expect(result.marginOfSafety).toBeGreaterThan(0);
    });

    it('should detect overvalued stock', () => {
      const expensive: ValuationInput = { ...input, currentPrice: 50 };
      const result = multiDimensionalValuation(expensive);
      expect(['overvalue', 'deep_overvalue']).toContain(result.verdict);
      expect(result.marginOfSafety).toBeLessThan(0);
    });

    it('should handle zero EPS', () => {
      const noEarnings: ValuationInput = { ...input, eps: 0, netIncome: 0 };
      const result = multiDimensionalValuation(noEarnings);
      expect(result.pe).toBe(999);
    });
  });
});
