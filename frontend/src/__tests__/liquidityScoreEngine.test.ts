import { describe, it, expect } from 'vitest';

/**
 * 流动性评分引擎测试
 */

interface LiquidityData {
  code: string;
  name: string;
  price: number;
  avgVolume: number;
  avgTurnover: number;
  turnoverRate: number;
  freeFloat: number;
  dailyReturn: number;
  dailyVolume: number;
}

interface LiquidityScore {
  code: string;
  volumeScore: number;
  turnoverScore: number;
  turnoverRateScore: number;
  amihudScore: number;
  compositeScore: number;
  tier: 'high' | 'medium' | 'low' | 'illiquid';
  adv: number;
}

function calculateLiquidityScore(data: LiquidityData): LiquidityScore {
  const volumeScore = Math.min(100, Math.round(Math.log10(Math.max(1, data.avgVolume)) * 20));
  const turnoverScore = Math.min(100, Math.round(Math.log10(Math.max(1, data.avgTurnover)) * 15));
  const turnoverRateScore = Math.min(100, Math.round(data.turnoverRate * 2));
  const amihudIlliq = data.dailyVolume > 0 ? Math.abs(data.dailyReturn) / (data.dailyVolume * data.price) : 0;
  const amihudScore = Math.min(100, Math.round(amihudIlliq * 1e10));
  const compositeScore = Math.round(volumeScore * 0.3 + turnoverScore * 0.3 + turnoverRateScore * 0.2 + (100 - amihudScore) * 0.2);
  const tier: LiquidityScore['tier'] = compositeScore >= 70 ? 'high' : compositeScore >= 40 ? 'medium' : compositeScore >= 20 ? 'low' : 'illiquid';
  return { code: data.code, volumeScore, turnoverScore, turnoverRateScore, amihudScore, compositeScore, tier, adv: data.avgTurnover };
}

function rankByLiquidity(stocks: LiquidityData[]): LiquidityScore[] {
  return stocks.map(s => calculateLiquidityScore(s)).sort((a, b) => b.compositeScore - a.compositeScore);
}

describe('流动性评分引擎', () => {
  const baseStock: LiquidityData = {
    code: '600519', name: '贵州茅台', price: 1800,
    avgVolume: 10000000, avgTurnover: 18000000000,
    turnoverRate: 0.5, freeFloat: 1200000000000,
    dailyReturn: 0.02, dailyVolume: 9000000,
  };

  describe('calculateLiquidityScore', () => {
    it('should return scores 0-100', () => {
      const score = calculateLiquidityScore(baseStock);
      expect(score.volumeScore).toBeGreaterThanOrEqual(0);
      expect(score.volumeScore).toBeLessThanOrEqual(100);
      expect(score.turnoverScore).toBeGreaterThanOrEqual(0);
      expect(score.turnoverScore).toBeLessThanOrEqual(100);
    });

    it('should classify high liquidity for active stocks', () => {
      const score = calculateLiquidityScore(baseStock);
      expect(['high', 'medium', 'low', 'illiquid']).toContain(score.tier);
    });

    it('should classify illiquid for tiny volume', () => {
      const illiquid = calculateLiquidityScore({ ...baseStock, avgVolume: 1, avgTurnover: 1, turnoverRate: 0.001 });
      expect(illiquid.compositeScore).toBeLessThanOrEqual(50);
    });

    it('should handle zero volume', () => {
      const score = calculateLiquidityScore({ ...baseStock, avgVolume: 0, avgTurnover: 0, dailyVolume: 0 });
      expect(score.volumeScore).toBe(0);
    });

    it('higher turnover should score higher', () => {
      const low = calculateLiquidityScore({ ...baseStock, turnoverRate: 0.1 });
      const high = calculateLiquidityScore({ ...baseStock, turnoverRate: 5 });
      expect(high.turnoverRateScore).toBeGreaterThan(low.turnoverRateScore);
    });
  });

  describe('rankByLiquidity', () => {
    it('should sort by composite score descending', () => {
      const stocks = [
        { ...baseStock, code: 'A', avgVolume: 1000000 },
        { ...baseStock, code: 'B', avgVolume: 100000000 },
        { ...baseStock, code: 'C', avgVolume: 10000 },
      ];
      const ranked = rankByLiquidity(stocks);
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i].compositeScore).toBeLessThanOrEqual(ranked[i-1].compositeScore);
      }
    });

    it('should handle empty input', () => {
      expect(rankByLiquidity([])).toHaveLength(0);
    });
  });
});
