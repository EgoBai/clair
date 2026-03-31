import { describe, it, expect } from 'vitest';
import { calculateCompositeScore, rankStocks, StockScoreInput, ScoreDimension } from '../utils/compositeScoreEngine';

describe('综合投资评分引擎', () => {
  const dimensions: ScoreDimension[] = [
    { name: '估值', score: 75, weight: 0.25 },
    { name: '成长', score: 85, weight: 0.25 },
    { name: '质量', score: 70, weight: 0.2 },
    { name: '动量', score: 60, weight: 0.15 },
    { name: '风险', score: 50, weight: 0.15 },
  ];

  const input: StockScoreInput = {
    symbol: '000001',
    name: '平安银行',
    dimensions,
    price: 12.5,
    targetPrice: 15,
  };

  describe('calculateCompositeScore', () => {
    it('should calculate total score', () => {
      const result = calculateCompositeScore(input);
      expect(result.totalScore).toBeGreaterThan(0);
      expect(result.totalScore).toBeLessThanOrEqual(100);
    });

    it('should assign grade', () => {
      const result = calculateCompositeScore(input);
      expect(['A+', 'A', 'B+', 'B', 'C', 'D', 'F']).toContain(result.grade);
    });

    it('should provide recommendation', () => {
      const result = calculateCompositeScore(input);
      expect(['强烈推荐', '推荐', '中性', '减持', '回避']).toContain(result.recommendation);
    });

    it('should detail dimension scores', () => {
      const result = calculateCompositeScore(input);
      expect(result.dimensionScores.length).toBe(5);
      result.dimensionScores.forEach(d => {
        expect(d.score).toBeGreaterThanOrEqual(0);
        expect(d.score).toBeLessThanOrEqual(100);
      });
    });

    it('should sort dimensions by score', () => {
      const result = calculateCompositeScore(input);
      for (let i = 1; i < result.dimensionScores.length; i++) {
        expect(result.dimensionScores[i - 1].score).toBeGreaterThanOrEqual(result.dimensionScores[i].score);
      }
    });

    it('should calculate upside potential', () => {
      const result = calculateCompositeScore(input);
      expect(result.upsidePotential).toBeCloseTo(0.2, 1);
    });

    it('should handle empty dimensions', () => {
      const result = calculateCompositeScore({ ...input, dimensions: [] });
      expect(result.totalScore).toBe(0);
      expect(result.grade).toBe('F');
    });

    it('should determine risk level', () => {
      const result = calculateCompositeScore(input);
      expect(['低风险', '中低风险', '中等风险', '中高风险', '高风险']).toContain(result.riskLevel);
    });
  });

  describe('rankStocks', () => {
    it('should rank by total score', () => {
      const stocks: StockScoreInput[] = [
        input,
        { ...input, symbol: '000002', name: '万科A', dimensions: dimensions.map(d => ({ ...d, score: d.score - 20 })) },
      ];
      const ranking = rankStocks(stocks);
      expect(ranking[0].totalScore).toBeGreaterThanOrEqual(ranking[1].totalScore);
    });
  });
});
