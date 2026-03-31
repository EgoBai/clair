import { describe, it, expect } from 'vitest';
import { LiquidityScoreEngine } from '../utils/liquidityScoreEngine';
import type { LiquidityData } from '../utils/liquidityScoreEngine';

describe('LiquidityScoreEngine', () => {
  const engine = new LiquidityScoreEngine();

  const liquidStock: LiquidityData = {
    code: '000001',
    name: '平安银行',
    price: 12,
    avgVolume: 50000000,
    avgTurnover: 600000000,
    turnoverRate: 2.5,
    freeFloat: 200000000000,
    dailyReturn: 0.02,
    dailyVolume: 55000000,
  };

  const illiquidStock: LiquidityData = {
    code: '000999',
    name: '小盘股',
    price: 5,
    avgVolume: 100000,
    avgTurnover: 500000,
    turnoverRate: 0.05,
    freeFloat: 500000000,
    dailyReturn: 0.01,
    dailyVolume: 80000,
  };

  describe('流动性评分', () => {
    it('高流动性股票应得高分', () => {
      const score = engine.calculateScore(liquidStock);
      expect(score.compositeScore).toBeGreaterThan(50);
      expect(['high', 'medium']).toContain(score.tier);
    });

    it('低流动性股票应得相对低分', () => {
      const score = engine.calculateScore(illiquidStock);
      const liquidScore = engine.calculateScore(liquidStock);
      expect(score.compositeScore).toBeLessThan(liquidScore.compositeScore);
    });

    it('评分应在0-100之间', () => {
      const score1 = engine.calculateScore(liquidStock);
      const score2 = engine.calculateScore(illiquidStock);
      expect(score1.compositeScore).toBeGreaterThanOrEqual(0);
      expect(score1.compositeScore).toBeLessThanOrEqual(100);
      expect(score2.compositeScore).toBeGreaterThanOrEqual(0);
      expect(score2.compositeScore).toBeLessThanOrEqual(100);
    });

    it('应包含所有子评分', () => {
      const score = engine.calculateScore(liquidStock);
      expect(score.volumeScore).toBeGreaterThanOrEqual(0);
      expect(score.turnoverScore).toBeGreaterThanOrEqual(0);
      expect(score.turnoverRateScore).toBeGreaterThanOrEqual(0);
      expect(score.amihudScore).toBeGreaterThanOrEqual(0);
    });

    it('tier应有效', () => {
      const score = engine.calculateScore(liquidStock);
      expect(['high', 'medium', 'low', 'illiquid']).toContain(score.tier);
    });

    it('ADV应为正', () => {
      const score = engine.calculateScore(liquidStock);
      expect(score.adv).toBeGreaterThan(0);
    });
  });

  describe('批量排名', () => {
    it('应返回排名结果', () => {
      const ranking = engine.rankLiquidity([liquidStock, illiquidStock]);
      expect(ranking.rankings.length).toBe(2);
      expect(ranking.rankings[0].compositeScore).toBeGreaterThanOrEqual(ranking.rankings[1].compositeScore);
    });

    it('应计算市场统计', () => {
      const ranking = engine.rankLiquidity([liquidStock, illiquidStock]);
      expect(ranking.marketStats.medianADV).toBeGreaterThan(0);
      expect(ranking.marketStats.avgTurnoverRate).toBeGreaterThan(0);
      expect(ranking.marketStats.illiquidPct).toBeGreaterThanOrEqual(0);
      expect(ranking.marketStats.illiquidPct).toBeLessThanOrEqual(1);
    });

    it('空数据应返回空', () => {
      const ranking = engine.rankLiquidity([]);
      expect(ranking.rankings).toEqual([]);
      expect(ranking.marketStats.medianADV).toBe(0);
    });

    it('应按综合评分降序排列', () => {
      const stocks = [
        { ...liquidStock, code: 'A' },
        { ...illiquidStock, code: 'B' },
        { ...liquidStock, code: 'C', avgVolume: 100000000 },
      ];
      const ranking = engine.rankLiquidity(stocks);
      for (let i = 1; i < ranking.rankings.length; i++) {
        expect(ranking.rankings[i - 1].compositeScore).toBeGreaterThanOrEqual(ranking.rankings[i].compositeScore);
      }
    });
  });

  describe('流动性预警', () => {
    it('正常股票应为低风险', () => {
      const risk = engine.checkLiquidityRisk(liquidStock, Array.from({ length: 20 }, () => 50000000));
      expect(risk.risk).toBe('low');
    });

    it('成交量萎缩应触发预警', () => {
      const history = [
        ...Array.from({ length: 15 }, () => 50000000),
        ...Array.from({ length: 5 }, () => 1000000), // 近期萎缩
      ];
      const risk = engine.checkLiquidityRisk(liquidStock, history);
      expect(risk.risk).not.toBe('low');
      expect(risk.signals.length).toBeGreaterThan(0);
    });

    it('极低换手率应触发预警', () => {
      const risk = engine.checkLiquidityRisk(illiquidStock, [100000]);
      expect(risk.signals.some(s => s.includes('换手率'))).toBe(true);
    });

    it('低成交额应触发预警', () => {
      const lowTurnover: LiquidityData = { ...liquidStock, avgTurnover: 5000000 };
      const risk = engine.checkLiquidityRisk(lowTurnover, [50000]);
      expect(risk.signals.some(s => s.includes('成交额'))).toBe(true);
    });

    it('历史数据不足不应报错', () => {
      const risk = engine.checkLiquidityRisk(liquidStock, [50000000]);
      expect(risk.risk).toBeDefined();
    });

    it('空历史不应报错', () => {
      const risk = engine.checkLiquidityRisk(liquidStock, []);
      expect(risk.risk).toBeDefined();
    });
  });

  describe('边界情况', () => {
    it('零成交量不应报错', () => {
      const zero: LiquidityData = { ...liquidStock, avgVolume: 0, dailyVolume: 0 };
      expect(() => engine.calculateScore(zero)).not.toThrow();
    });

    it('零成交额不应报错', () => {
      const zero: LiquidityData = { ...liquidStock, avgTurnover: 0 };
      expect(() => engine.calculateScore(zero)).not.toThrow();
    });

    it('极端换手率不应报错', () => {
      const extreme: LiquidityData = { ...liquidStock, turnoverRate: 50 };
      expect(() => engine.calculateScore(extreme)).not.toThrow();
    });

    it('负收益率不应报错', () => {
      const neg: LiquidityData = { ...liquidStock, dailyReturn: -0.05 };
      expect(() => engine.calculateScore(neg)).not.toThrow();
    });
  });
});
