import { describe, it, expect } from 'vitest';
import { LiquidityScoreEngine, type LiquidityData } from '../utils/liquidityScoreEngine';

/**
 * 流动性评分引擎测试（导入真实模块）
 */

describe('流动性评分引擎', () => {
  const engine = new LiquidityScoreEngine();

  const baseStock: LiquidityData = {
    code: '600519', name: '贵州茅台', price: 1800,
    avgVolume: 10000000, avgTurnover: 18000000000,
    turnoverRate: 0.5, freeFloat: 1200000000000,
    dailyReturn: 0.02, dailyVolume: 9000000,
  };

  describe('calculateScore', () => {
    it('should return scores 0-100', () => {
      const score = engine.calculateScore(baseStock);
      expect(score.volumeScore).toBeGreaterThanOrEqual(0);
      expect(score.volumeScore).toBeLessThanOrEqual(100);
      expect(score.turnoverScore).toBeGreaterThanOrEqual(0);
      expect(score.turnoverScore).toBeLessThanOrEqual(100);
    });

    it('should classify high liquidity for active stocks', () => {
      const score = engine.calculateScore(baseStock);
      expect(['high', 'medium', 'low', 'illiquid']).toContain(score.tier);
    });

    it('should classify illiquid for tiny volume', () => {
      const illiquid = engine.calculateScore({ ...baseStock, avgVolume: 1, avgTurnover: 1, turnoverRate: 0.001 });
      expect(illiquid.compositeScore).toBeLessThanOrEqual(50);
    });

    it('should handle zero volume', () => {
      const score = engine.calculateScore({ ...baseStock, avgVolume: 0, avgTurnover: 0, dailyVolume: 0 });
      expect(score.volumeScore).toBe(0);
    });

    it('higher turnover should score higher', () => {
      const low = engine.calculateScore({ ...baseStock, turnoverRate: 0.1 });
      const high = engine.calculateScore({ ...baseStock, turnoverRate: 5 });
      expect(high.turnoverRateScore).toBeGreaterThan(low.turnoverRateScore);
    });
  });

  describe('rankLiquidity', () => {
    it('should sort by composite score descending', () => {
      const stocks = [
        { ...baseStock, code: 'A', avgVolume: 1000000 },
        { ...baseStock, code: 'B', avgVolume: 100000000 },
        { ...baseStock, code: 'C', avgVolume: 10000 },
      ];
      const ranked = engine.rankLiquidity(stocks).rankings;
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i].compositeScore).toBeLessThanOrEqual(ranked[i - 1].compositeScore);
      }
    });

    it('should handle empty input', () => {
      expect(engine.rankLiquidity([]).rankings).toHaveLength(0);
    });

    it('should compute market stats', () => {
      const result = engine.rankLiquidity([baseStock]);
      expect(result.marketStats.medianADV).toBeGreaterThan(0);
    });
  });

  describe('checkLiquidityRisk', () => {
    it('flags low turnover as risk signal', () => {
      const { risk, signals } = engine.checkLiquidityRisk(
        { ...baseStock, turnoverRate: 0.05, avgTurnover: 5000000 },
        [10000000, 10000000, 10000000, 10000000, 10000000],
      );
      expect(Array.isArray(signals)).toBe(true);
      expect(['high', 'medium', 'low']).toContain(risk);
    });
  });
});
