import { describe, it, expect } from 'vitest';
import { analyzeShortInterest, type ShortInterestData } from '../utils/shortInterestEngine';

/**
 * 融券/做空兴趣引擎测试 (导入真实模块)
 */

describe('融券做空兴趣引擎', () => {
  const baseData: ShortInterestData = {
    symbol: '600519',
    shortShares: 1000000,
    totalShares: 10000000,
    avgDailyVolume: 500000,
    shortRatioHistory: [
      { date: '2024-01', ratio: 0.08 },
      { date: '2024-02', ratio: 0.09 },
      { date: '2024-03', ratio: 0.1 },
    ],
    priceHistory: [
      { date: '2024-01', close: 1800 },
      { date: '2024-02', close: 1750 },
      { date: '2024-03', close: 1700 },
    ],
    borrowCost: 3,
    availableShares: 500000,
  };

  describe('analyzeShortInterest', () => {
    it('should calculate short ratio', () => {
      const result = analyzeShortInterest(baseData);
      expect(result.shortRatio).toBe(0.1);
      expect(result.daysToCover).toBe(2);
    });

    it('should detect increasing trend', () => {
      const data = { ...baseData, shortRatioHistory: [
        { date: '1', ratio: 0.03 }, { date: '2', ratio: 0.04 }, { date: '3', ratio: 0.05 },
        { date: '4', ratio: 0.08 }, { date: '5', ratio: 0.10 }, { date: '6', ratio: 0.12 },
      ]};
      const result = analyzeShortInterest(data);
      expect(result.shortTrend).toBe('increasing');
    });

    it('should detect decreasing trend', () => {
      const data = { ...baseData, shortRatioHistory: [
        { date: '1', ratio: 0.15 }, { date: '2', ratio: 0.14 }, { date: '3', ratio: 0.12 },
        { date: '4', ratio: 0.08 }, { date: '5', ratio: 0.05 }, { date: '6', ratio: 0.03 },
      ]};
      const result = analyzeShortInterest(data);
      expect(result.shortTrend).toBe('decreasing');
    });

    it('should detect high squeeze risk', () => {
      const data = {
        ...baseData,
        shortShares: 3000000,
        totalShares: 5000000,
        avgDailyVolume: 100000,
        shortRatioHistory: [{ date: '1', ratio: 0.5 }, { date: '2', ratio: 0.6 }],
      };
      const result = analyzeShortInterest(data);
      expect(['high', 'extreme']).toContain(result.squeezeRisk);
    });

    it('should handle zero totalShares', () => {
      const result = analyzeShortInterest({ ...baseData, totalShares: 0 });
      expect(result.shortRatio).toBe(0);
    });

    it('should handle zero volume', () => {
      const result = analyzeShortInterest({ ...baseData, avgDailyVolume: 0 });
      expect(result.daysToCover).toBe(0);
    });

    it('borrow cost levels', () => {
      expect(analyzeShortInterest({ ...baseData, borrowCost: 2 }).borrowCostLevel).toBe('low');
      expect(analyzeShortInterest({ ...baseData, borrowCost: 7 }).borrowCostLevel).toBe('moderate');
      expect(analyzeShortInterest({ ...baseData, borrowCost: 15 }).borrowCostLevel).toBe('high');
    });

    it('should generate insights for high ratios', () => {
      const data = { ...baseData, shortShares: 2000000, totalShares: 10000000 };
      const result = analyzeShortInterest(data);
      expect(result.insights.length).toBeGreaterThan(0);
      expect(result.insights[0]).toContain('融券比例');
    });

    it('risk score should be 0-100', () => {
      const r = analyzeShortInterest(baseData).riskScore;
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(100);
    });

    it('squeeze signal requires high ratio, long cover and rising price', () => {
      // 不满足条件时信号为 false
      expect(analyzeShortInterest(baseData).shortSqueezeSignal).toBe(false);
    });
  });
});
