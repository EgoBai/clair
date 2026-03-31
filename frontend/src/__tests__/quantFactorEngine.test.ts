import { describe, it, expect, beforeEach } from 'vitest';
import { QuantFactorEngine } from '../utils/quantFactorEngine';
import type { StockFactors } from '../utils/quantFactorEngine';

describe('QuantFactorEngine', () => {
  let engine: QuantFactorEngine;

  const createFactors = (overrides: Partial<StockFactors> = {}): StockFactors => ({
    symbol: '000001',
    returns1M: 0.05,
    returns3M: 0.1,
    returns6M: 0.15,
    returns12M: 0.2,
    pe: 15,
    pb: 2,
    ps: 3,
    roe: 0.15,
    grossMargin: 0.4,
    debtToEquity: 0.5,
    revenueGrowth: 0.1,
    earningsGrowth: 0.15,
    volatility20D: 0.2,
    volatility60D: 0.18,
    analystRating: 4,
    shortInterest: 0.02,
    institutionalHolding: 0.6,
    ...overrides,
  });

  beforeEach(() => {
    engine = new QuantFactorEngine();
  });

  describe('单股评分', () => {
    it('应该计算综合得分', () => {
      const result = engine.scoreStock(createFactors());
      expect(result.totalScore).toBeGreaterThan(0);
      expect(result.totalScore).toBeLessThanOrEqual(100);
    });

    it('应该分配等级', () => {
      const result = engine.scoreStock(createFactors());
      expect(['A+', 'A', 'B+', 'B', 'C', 'D', 'F']).toContain(result.grade);
    });

    it('应该给出推荐', () => {
      const result = engine.scoreStock(createFactors());
      expect(['strong_buy', 'buy', 'hold', 'sell', 'strong_sell']).toContain(result.recommendation);
    });

    it('应该包含因子明细', () => {
      const result = engine.scoreStock(createFactors());
      expect(result.factors.length).toBe(6);
      expect(result.factors.map(f => f.name)).toEqual(
        expect.arrayContaining(['动量', '估值', '质量', '波动率', '成长', '情绪'])
      );
    });

    it('每个因子应有权重和得分', () => {
      const result = engine.scoreStock(createFactors());
      for (const factor of result.factors) {
        expect(factor.weight).toBeGreaterThan(0);
        expect(factor.score).toBeGreaterThanOrEqual(0);
        expect(factor.score).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('高质量股票', () => {
    it('应该获得高分', () => {
      const result = engine.scoreStock(createFactors({
        returns1M: 0.1,
        returns3M: 0.25,
        returns6M: 0.4,
        roe: 0.25,
        grossMargin: 0.6,
        debtToEquity: 0.2,
        pe: 10,
        analystRating: 5,
        revenueGrowth: 0.3,
        earningsGrowth: 0.4,
      }));
      expect(result.totalScore).toBeGreaterThan(60);
    });
  });

  describe('低质量股票', () => {
    it('应该获得低分', () => {
      const result = engine.scoreStock(createFactors({
        returns1M: -0.15,
        returns3M: -0.3,
        roe: 0.02,
        grossMargin: 0.1,
        debtToEquity: 2,
        pe: 100,
        analystRating: 1,
        revenueGrowth: -0.2,
        earningsGrowth: -0.3,
      }));
      expect(result.totalScore).toBeLessThan(50);
    });
  });

  describe('批量评分', () => {
    it('应该按分数排序', () => {
      const stocks = [
        createFactors({ symbol: 'LOW', pe: 100, returns1M: -0.2, roe: 0.01 }),
        createFactors({ symbol: 'HIGH', pe: 8, returns1M: 0.15, roe: 0.3 }),
        createFactors({ symbol: 'MID', pe: 20, returns1M: 0.02, roe: 0.12 }),
      ];
      const results = engine.batchScore(stocks);
      expect(results[0].symbol).toBe('HIGH');
      expect(results[results.length - 1].symbol).toBe('LOW');
    });
  });

  describe('配置', () => {
    it('应该更新配置', () => {
      engine.updateConfig({ momentum: { weight: 0.4, lookback: 30 } });
      const result = engine.scoreStock(createFactors());
      expect(result.factors.find(f => f.name === '动量')!.weight).toBe(0.4);
    });
  });

  describe('边界条件', () => {
    it('应该处理零值', () => {
      const result = engine.scoreStock(createFactors({
        pe: 0, pb: 0, ps: 0, roe: 0,
        returns1M: 0, returns3M: 0, returns6M: 0,
      }));
      expect(result.totalScore).toBeGreaterThanOrEqual(0);
    });

    it('应该处理极端值', () => {
      const result = engine.scoreStock(createFactors({
        pe: 1000, roe: -1, returns1M: -0.99,
      }));
      expect(result.totalScore).toBeGreaterThanOrEqual(0);
    });
  });
});
