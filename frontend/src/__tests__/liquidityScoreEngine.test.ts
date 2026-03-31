import { describe, it, expect } from 'vitest';
import {
  calculateAmihud,
  calculateTurnoverRate,
  estimateBidAskSpread,
  calculateLiquidityScore,
  calculateLiquidityTrend,
  crossSectionLiquidityRanking,
} from '../utils/liquidityScoreEngine';

function generateMockData(days: number) {
  const dailyVolume: number[] = [];
  const dailyReturn: number[] = [];
  const dailyPrice: number[] = [];
  const totalShares: number[] = [];
  let price = 100;

  for (let i = 0; i < days; i++) {
    const ret = (Math.random() - 0.5) * 0.04;
    price *= (1 + ret);
    dailyVolume.push(Math.floor(100000 + Math.random() * 500000));
    dailyReturn.push(ret);
    dailyPrice.push(price);
    totalShares.push(10000000);
  }
  return { dailyVolume, dailyReturn, dailyPrice, totalShares };
}

const mockData = generateMockData(100);

describe('流动性评分引擎', () => {
  describe('calculateAmihud', () => {
    it('should calculate Amihud ratios', () => {
      const result = calculateAmihud(
        [0.01, -0.02, 0.005],
        [100000, 200000, 150000],
        [100, 102, 101]
      );
      expect(result.length).toBe(3);
      result.forEach(r => expect(r).toBeGreaterThanOrEqual(0));
    });

    it('should handle zero volume', () => {
      const result = calculateAmihud([0.01], [0], [100]);
      expect(result[0]).toBe(0);
    });
  });

  describe('calculateTurnoverRate', () => {
    it('should calculate turnover rates', () => {
      const result = calculateTurnoverRate([100000, 200000], [10000000, 10000000]);
      expect(result).toEqual([0.01, 0.02]);
    });

    it('should handle zero shares', () => {
      const result = calculateTurnoverRate([100000], [0]);
      expect(result[0]).toBe(0);
    });
  });

  describe('estimateBidAskSpread', () => {
    it('should estimate spread from returns', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02);
      const spread = estimateBidAskSpread(returns);
      expect(spread).toBeGreaterThanOrEqual(0);
    });

    it('should handle short data', () => {
      expect(estimateBidAskSpread([0.01])).toBe(0);
    });

    it('should handle empty data', () => {
      expect(estimateBidAskSpread([])).toBe(0);
    });
  });

  describe('calculateLiquidityScore', () => {
    it('should calculate comprehensive score', () => {
      const score = calculateLiquidityScore(mockData);
      expect(score.totalScore).toBeGreaterThanOrEqual(0);
      expect(score.totalScore).toBeLessThanOrEqual(100);
      expect(['A', 'B', 'C', 'D', 'E']).toContain(score.grade);
      expect(['low', 'medium', 'high', 'critical']).toContain(score.riskLevel);
    });

    it('should have valid factor scores', () => {
      const score = calculateLiquidityScore(mockData);
      expect(score.factorScores.volume).toBeGreaterThanOrEqual(0);
      expect(score.factorScores.turnover).toBeGreaterThanOrEqual(0);
      expect(score.factorScores.priceImpact).toBeGreaterThanOrEqual(0);
      expect(score.factorScores.consistency).toBeGreaterThanOrEqual(0);
      expect(score.factorScores.spread).toBeGreaterThanOrEqual(0);
    });

    it('should include metrics', () => {
      const score = calculateLiquidityScore(mockData);
      expect(score.metrics.turnoverRate).toBeGreaterThanOrEqual(0);
      expect(score.metrics.amihudRatio).toBeGreaterThanOrEqual(0);
    });

    it('should have trading recommendation', () => {
      const score = calculateLiquidityScore(mockData);
      expect(score.tradingRecommendation).toBeTruthy();
    });

    it('should handle empty data', () => {
      const score = calculateLiquidityScore({
        dailyVolume: [], dailyReturn: [], dailyPrice: [], totalShares: [],
      });
      expect(score.totalScore).toBe(0);
      expect(score.grade).toBe('E');
    });

    it('should score high-volume stocks higher', () => {
      const highVol = generateMockData(100);
      highVol.dailyVolume = highVol.dailyVolume.map(v => v * 10);
      const lowVol = generateMockData(100);
      lowVol.dailyVolume = lowVol.dailyVolume.map(v => v / 10);

      const highScore = calculateLiquidityScore(highVol);
      const lowScore = calculateLiquidityScore(lowVol);
      expect(highScore.totalScore).toBeGreaterThanOrEqual(lowScore.totalScore);
    });
  });

  describe('calculateLiquidityTrend', () => {
    it('should calculate trends', () => {
      const scores = Array.from({ length: 50 }, () => 50 + Math.random() * 30);
      const dates = scores.map((_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`);
      const trends = calculateLiquidityTrend(scores, dates);
      expect(trends.length).toBe(50);
      trends.forEach(t => {
        expect(['improving', 'stable', 'deteriorating']).toContain(t.trend);
        expect(t.ma5).toBeGreaterThan(0);
        expect(t.ma20).toBeGreaterThan(0);
      });
    });

    it('should detect improving trend', () => {
      const scores = Array.from({ length: 30 }, (_, i) => 30 + i); // Rising
      const trends = calculateLiquidityTrend(scores, []);
      const lastTrend = trends[trends.length - 1];
      expect(lastTrend.trend).toBe('improving');
    });
  });

  describe('crossSectionLiquidityRanking', () => {
    it('should rank stocks by liquidity', () => {
      const stocks = [
        { name: 'A', score: 80 },
        { name: 'B', score: 60 },
        { name: 'C', score: 90 },
        { name: 'D', score: 40 },
      ];
      const ranking = crossSectionLiquidityRanking(stocks);
      expect(ranking.length).toBe(4);
      expect(ranking[0].name).toBe('C');
      expect(ranking[0].rank).toBe(1);
      expect(ranking[3].name).toBe('D');
    });

    it('should calculate percentiles', () => {
      const stocks = Array.from({ length: 100 }, (_, i) => ({
        name: `Stock${i}`,
        score: Math.random() * 100,
      }));
      const ranking = crossSectionLiquidityRanking(stocks);
      ranking.forEach(r => {
        expect(r.percentile).toBeGreaterThanOrEqual(0);
        expect(r.percentile).toBeLessThanOrEqual(100);
      });
    });

    it('should detect outliers', () => {
      const stocks = [
        { name: 'Normal', score: 50 },
        { name: 'Normal2', score: 52 },
        { name: 'Normal3', score: 48 },
        { name: 'Normal4', score: 51 },
        { name: 'Normal5', score: 49 },
        { name: 'Outlier', score: 500 },
      ];
      const ranking = crossSectionLiquidityRanking(stocks);
      const outlier = ranking.find(r => r.name === 'Outlier');
      expect(outlier?.isOutlier).toBe(true);
    });
  });
});
