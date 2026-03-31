import { describe, it, expect } from 'vitest';
import { calculateFCF, dcfValuation, FCFForecast, DCFInput } from '../utils/dcfFcfEngine';

describe('自由现金流估值引擎', () => {
  const forecasts: FCFForecast[] = [
    { year: 2026, revenue: 1000, growthRate: 0.15, operatingMargin: 0.15, taxRate: 0.25, capex: 50, deltaWorkingCapital: 20, depreciation: 30 },
    { year: 2027, revenue: 1150, growthRate: 0.12, operatingMargin: 0.16, taxRate: 0.25, capex: 55, deltaWorkingCapital: 22, depreciation: 35 },
    { year: 2028, revenue: 1288, growthRate: 0.10, operatingMargin: 0.17, taxRate: 0.25, capex: 60, deltaWorkingCapital: 25, depreciation: 40 },
  ];

  const input: DCFInput = {
    forecasts,
    wacc: 0.10,
    terminalGrowthRate: 0.03,
    sharesOutstanding: 1000,
    netDebt: 500,
  };

  describe('calculateFCF', () => {
    it('should calculate FCF correctly', () => {
      const fcf = calculateFCF(forecasts[0]);
      expect(fcf).toBeGreaterThan(0);
    });

    it('should handle zero margins', () => {
      const fcf = calculateFCF({ ...forecasts[0], operatingMargin: 0 });
      expect(fcf).toBeLessThanOrEqual(0);
    });
  });

  describe('dcfValuation', () => {
    it('should calculate equity value', () => {
      const result = dcfValuation(input, 100);
      expect(result.equityValue).toBeGreaterThan(0);
      expect(result.valuePerShare).toBeGreaterThan(0);
    });

    it('should have year breakdown', () => {
      const result = dcfValuation(input, 100);
      expect(result.yearBreakdown.length).toBe(3);
      result.yearBreakdown.forEach(y => {
        expect(y.year).toBeDefined();
        expect(typeof y.fcf).toBe('number');
        expect(typeof y.pv).toBe('number');
      });
    });

    it('should calculate terminal value percentage', () => {
      const result = dcfValuation(input, 100);
      expect(result.terminalValuePct).toBeGreaterThan(0);
      expect(result.terminalValuePct).toBeLessThanOrEqual(1);
    });

    it('should calculate margin of safety', () => {
      const result = dcfValuation(input, 50);
      expect(result.marginOfSafety).toBeDefined();
    });

    it('should generate sensitivity table', () => {
      const result = dcfValuation(input, 100);
      expect(result.sensitivity.length).toBeGreaterThan(0);
    });

    it('should handle empty forecasts', () => {
      const result = dcfValuation({ ...input, forecasts: [] }, 100);
      expect(result.equityValue).toBe(0);
    });

    it('should handle zero WACC', () => {
      const result = dcfValuation({ ...input, wacc: 0 }, 100);
      expect(result.equityValue).toBe(0);
    });

    it('should subtract net debt', () => {
      const withDebt = dcfValuation(input, 100);
      const noDebt = dcfValuation({ ...input, netDebt: 0 }, 100);
      expect(noDebt.equityValue).toBeGreaterThan(withDebt.equityValue);
    });
  });
});
