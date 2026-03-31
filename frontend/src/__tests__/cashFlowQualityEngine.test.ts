import { describe, it, expect } from 'vitest';
import { analyzeCashFlowQuality, CashFlowData } from '../utils/cashFlowQualityEngine';

describe('现金流质量引擎', () => {
  const data: CashFlowData[] = [
    { year: 2024, operatingCF: 8000, investingCF: -3000, financingCF: -2000, netIncome: 5000, depreciation: 2000, capex: 3000, dividends: 1000, revenue: 50000, totalAssets: 100000 },
    { year: 2025, operatingCF: 10000, investingCF: -4000, financingCF: -3000, netIncome: 6000, depreciation: 2200, capex: 3500, dividends: 1200, revenue: 55000, totalAssets: 110000 },
    { year: 2026, operatingCF: 12000, investingCF: -5000, financingCF: -2000, netIncome: 7000, depreciation: 2400, capex: 4000, dividends: 1500, revenue: 60000, totalAssets: 120000 },
  ];

  describe('analyzeCashFlowQuality', () => {
    it('should calculate quality score', () => {
      const result = analyzeCashFlowQuality(data);
      expect(result.qualityScore).toBeGreaterThanOrEqual(0);
      expect(result.qualityScore).toBeLessThanOrEqual(100);
    });

    it('should assign quality grade', () => {
      const result = analyzeCashFlowQuality(data);
      expect(['A', 'B', 'C', 'D', 'F']).toContain(result.qualityGrade);
    });

    it('should calculate cash conversion', () => {
      const result = analyzeCashFlowQuality(data);
      expect(typeof result.cashConversion).toBe('number');
    });

    it('should calculate FCF', () => {
      const result = analyzeCashFlowQuality(data);
      expect(result.fcf).toBe(8000); // 12000 - 4000
    });

    it('should analyze cash flow structure', () => {
      const result = analyzeCashFlowQuality(data);
      expect(result.cashFlowStructure.operatingPct).toBeDefined();
    });

    it('should detect trends', () => {
      const result = analyzeCashFlowQuality(data);
      expect(['improving', 'stable', 'deteriorating']).toContain(result.trends.operatingTrend);
    });

    it('should determine sustainability', () => {
      const result = analyzeCashFlowQuality(data);
      expect(['strong', 'adequate', 'weak', 'critical']).toContain(result.sustainability);
    });

    it('should handle empty data', () => {
      const result = analyzeCashFlowQuality([]);
      expect(result.qualityScore).toBe(0);
      expect(result.sustainability).toBe('critical');
    });

    it('should warn on negative OCF', () => {
      const badData: CashFlowData[] = [{ ...data[2], operatingCF: -1000, netIncome: 5000 }];
      const result = analyzeCashFlowQuality(badData);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
