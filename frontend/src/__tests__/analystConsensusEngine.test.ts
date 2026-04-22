import { describe, it, expect } from 'vitest';
import {
  calculateConsensus,
  compareConsensus,
} from '../utils/analystConsensusEngine';
import type {
  AnalystRating,
  EarningsEstimate,
  EarningsSurprise,
} from '../utils/analystConsensusEngine';

function makeRatings(count = 10): AnalystRating[] {
  const firms = ['中信', '中金', '华泰', '国泰君安', '海通', '招商', '广发', '申万'];
  const ratings: AnalystRating['rating'][] = ['strong_buy', 'buy', 'buy', 'hold', 'hold'];
  return Array.from({ length: count }, (_, i) => ({
    analyst: `分析师${i + 1}`,
    firm: firms[i % firms.length],
    date: '2026-03-15',
    rating: ratings[i % ratings.length],
    targetPrice: 1900 + i * 20,
    currentPrice: 1800,
  }));
}

describe('Analyst Consensus Engine', () => {
  describe('calculateConsensus', () => {
    it('应计算共识评级', () => {
      const result = calculateConsensus('600519', makeRatings(), 1800);
      expect(result.totalAnalysts).toBe(10);
      expect(['strong_buy', 'buy', 'hold']).toContain(result.consensus.rating);
    });

    it('应计算评级分布', () => {
      const result = calculateConsensus('600519', makeRatings(), 1800);
      const total = Object.values(result.consensus.distribution).reduce((a, b) => a + b, 0);
      expect(total).toBe(10);
    });

    it('应计算目标价和上涨空间', () => {
      const result = calculateConsensus('600519', makeRatings(), 1800);
      expect(result.consensus.avgTargetPrice).toBeGreaterThan(1800);
      expect(result.consensus.priceUpside).toBeGreaterThan(0);
    });

    it('应计算修订趋势', () => {
      const result = calculateConsensus('600519', makeRatings(), 1800);
      expect(['up', 'down', 'stable']).toContain(result.revision.direction);
      expect(typeof result.revision.momentum).toBe('number');
    });

    it('应处理空数据', () => {
      const result = calculateConsensus('600519', [], 1800);
      expect(result.totalAnalysts).toBe(0);
      expect(result.consensus.rating).toBe('hold');
    });

    it('应分析盈利预测', () => {
      const estimates: EarningsEstimate[] = [
        { year: 2026, eps: 50, revenue: 1500, netProfit: 700, growth: 15 },
        { year: 2027, eps: 58, revenue: 1700, netProfit: 800, growth: 16 },
      ];
      const result = calculateConsensus('600519', makeRatings(), 1800, estimates);
      expect(result.eps.currentYear).toBe(50);
      expect(result.eps.nextYear).toBe(58);
      expect(result.eps.growth).toBeGreaterThan(0);
    });

    it('应分析盈利超预期率', () => {
      const history: EarningsSurprise[] = [
        { date: '2025-12-31', actualEps: 12.5, estimateEps: 12, surprisePct: 4.2, priceReaction: 2.1 },
        { date: '2025-09-30', actualEps: 11, estimateEps: 11.5, surprisePct: -4.3, priceReaction: -1.5 },
        { date: '2025-06-30', actualEps: 10, estimateEps: 9.5, surprisePct: 5.3, priceReaction: 3.0 },
      ];
      const result = calculateConsensus('600519', makeRatings(), 1800, undefined, history);
      expect(result.accuracy.hitRate).toBeGreaterThan(0);
      expect(result.eps.beatRate).toBeGreaterThan(0);
    });
  });

  describe('compareConsensus', () => {
    it('应比较多只股票共识', () => {
      const r1 = calculateConsensus('600519', makeRatings(), 1800);
      const r2 = calculateConsensus('000858', makeRatings(5), 150);
      const compared = compareConsensus([r1, r2]);
      expect(compared.length).toBe(2);
      expect(compared[0].rank).toBe(1);
      expect(compared[1].rank).toBe(2);
    });

    it('应计算综合评分', () => {
      const r1 = calculateConsensus('600519', makeRatings(), 1800);
      const compared = compareConsensus([r1]);
      expect(compared[0].compositeScore).toBeGreaterThan(0);
    });
  });
});
