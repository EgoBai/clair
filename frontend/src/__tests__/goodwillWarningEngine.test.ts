import { describe, it, expect } from 'vitest';
import { analyzeGoodwillRisk, GoodwillData } from '../utils/goodwillWarningEngine';

describe('商誉减值预警引擎', () => {
  const data: GoodwillData = {
    symbol: '000001',
    name: '测试公司',
    totalAssets: 100000,
    totalEquity: 60000,
    goodwill: 25000,
    netIncome: 5000,
    prevGoodwill: 20000,
    acquisitionCount: 3,
    acquiredRevenue: 8000,
    acquiredNetIncome: 400,
  };

  describe('analyzeGoodwillRisk', () => {
    it('should calculate goodwill ratio', () => {
      const result = analyzeGoodwillRisk(data);
      expect(result.goodwillRatio).toBeCloseTo(0.25, 2);
    });

    it('should calculate goodwill to equity ratio', () => {
      const result = analyzeGoodwillRisk(data);
      expect(result.goodwillToEquity).toBeCloseTo(0.417, 2);
    });

    it('should assess impairment risk', () => {
      const result = analyzeGoodwillRisk(data);
      expect(['low', 'moderate', 'high', 'critical']).toContain(result.impairmentRisk);
    });

    it('should calculate risk score', () => {
      const result = analyzeGoodwillRisk(data);
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
    });

    it('should estimate potential impairment', () => {
      const result = analyzeGoodwillRisk(data);
      expect(result.potentialImpairment).toBeGreaterThanOrEqual(0);
    });

    it('should generate warnings for high goodwill', () => {
      const high: GoodwillData = { ...data, goodwill: 50000, totalEquity: 40000, acquiredRevenue: 5000, acquiredNetIncome: -1000 };
      const result = analyzeGoodwillRisk(high);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.impairmentRisk).toBe('critical');
    });

    it('should handle zero goodwill', () => {
      const zero: GoodwillData = { ...data, goodwill: 0 };
      const result = analyzeGoodwillRisk(zero);
      expect(result.goodwillRatio).toBe(0);
      expect(result.impairmentRisk).toBe('low');
    });

    it('should track premium details', () => {
      const result = analyzeGoodwillRisk(data);
      expect(result.details.hasPremium).toBe(true);
      expect(result.details.premiumRatio).toBeGreaterThan(0);
    });
  });
});
