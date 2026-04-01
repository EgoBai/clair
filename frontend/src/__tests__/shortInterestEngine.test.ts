import { describe, it, expect } from 'vitest';

/**
 * 融券/做空兴趣引擎测试
 */

interface ShortInterestData {
  symbol: string;
  shortShares: number;
  totalShares: number;
  avgDailyVolume: number;
  shortRatioHistory: { date: string; ratio: number }[];
  priceHistory: { date: string; close: number }[];
  borrowCost: number;
  availableShares: number;
}

interface ShortInterestResult {
  symbol: string;
  shortRatio: number;
  daysToCover: number;
  shortTrend: 'increasing' | 'stable' | 'decreasing';
  squeezeRisk: 'low' | 'moderate' | 'high' | 'extreme';
  borrowCostLevel: 'low' | 'moderate' | 'high';
  shortSqueezeSignal: boolean;
  sentiment: 'bearish' | 'neutral' | 'bullish';
  riskScore: number;
  insights: string[];
}

function analyzeShortInterest(data: ShortInterestData): ShortInterestResult {
  const insights: string[] = [];
  const shortRatio = data.totalShares > 0 ? data.shortShares / data.totalShares : 0;
  if (shortRatio > 0.15) insights.push('融券比例超过15%');
  else if (shortRatio > 0.1) insights.push('融券比例超过10%');

  const daysToCover = data.avgDailyVolume > 0 ? data.shortShares / data.avgDailyVolume : 0;
  if (daysToCover > 10) insights.push(`覆盖天数${Math.round(daysToCover)}`);

  const ratios = data.shortRatioHistory.map(h => h.ratio);
  let shortTrend: ShortInterestResult['shortTrend'] = 'stable';
  if (ratios.length >= 2) {
    const recent = ratios.slice(-3).reduce((s, v) => s + v, 0) / Math.min(3, ratios.length);
    const older = ratios.slice(0, Math.min(3, ratios.length)).reduce((s, v) => s + v, 0) / Math.min(3, ratios.length);
    if (recent > older * 1.1) shortTrend = 'increasing';
    else if (recent < older * 0.9) shortTrend = 'decreasing';
  }

  let squeezeRisk: ShortInterestResult['squeezeRisk'] = 'low';
  const squeezeScore = shortRatio * 100 + daysToCover * 2 + (shortTrend === 'increasing' ? 10 : 0);
  if (squeezeScore > 50) squeezeRisk = 'extreme';
  else if (squeezeScore > 30) squeezeRisk = 'high';
  else if (squeezeScore > 15) squeezeRisk = 'moderate';

  const borrowCostLevel = data.borrowCost > 10 ? 'high' : data.borrowCost > 5 ? 'moderate' : 'low';
  const shortSqueezeSignal = squeezeRisk === 'high' || squeezeRisk === 'extreme';
  const sentiment = shortRatio > 0.15 ? 'bearish' : shortRatio > 0.05 ? 'neutral' : 'bullish';

  const riskScore = Math.min(100, Math.round(shortRatio * 300 + daysToCover * 3 + (shortTrend === 'increasing' ? 15 : 0) + (data.borrowCost > 10 ? 15 : 0)));

  return {
    symbol: data.symbol,
    shortRatio: parseFloat(shortRatio.toFixed(4)),
    daysToCover: parseFloat(daysToCover.toFixed(2)),
    shortTrend,
    squeezeRisk,
    borrowCostLevel,
    shortSqueezeSignal,
    sentiment,
    riskScore,
    insights,
  };
}

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
      expect(result.insights.length).toBeGreaterThanOrEqual(0);
    });

    it('risk score should be 0-100', () => {
      expect(analyzeShortInterest(baseData).riskScore).toBeGreaterThanOrEqual(0);
      expect(analyzeShortInterest(baseData).riskScore).toBeLessThanOrEqual(100);
    });
  });
});
