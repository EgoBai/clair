import { describe, it, expect } from 'vitest';
import { MarginOfSafetyEngine } from '../utils/marginOfSafetyEngine';
import type { StockValuation } from '../utils/marginOfSafetyEngine';

describe('MarginOfSafetyEngine', () => {
  const engine = new MarginOfSafetyEngine();

  const goodStock: StockValuation = {
    price: 50,
    eps: 5,
    bookValue: 40,
    dividendYield: 3,
    peRatio: 10,
    pbRatio: 1.25,
    growthRate: 15,
    debtToEquity: 0.3,
    currentRatio: 2.5,
  };

  const expensiveStock: StockValuation = {
    price: 200,
    eps: 3,
    bookValue: 20,
    dividendYield: 0.5,
    peRatio: 66,
    pbRatio: 10,
    growthRate: 5,
    debtToEquity: 2.0,
    currentRatio: 0.8,
  };

  describe('Graham内在价值', () => {
    it('应该计算Graham价值', () => {
      const value = engine.grahamValue(5, 15);
      expect(value).toBeGreaterThan(0);
    });

    it('EPS为负时返回0', () => {
      const value = engine.grahamValue(-1, 15);
      expect(value).toBe(0);
    });

    it('高成长股票价值更高', () => {
      const lowGrowth = engine.grahamValue(5, 5);
      const highGrowth = engine.grahamValue(5, 20);
      expect(highGrowth).toBeGreaterThan(lowGrowth);
    });

    it('高利率环境价值更低', () => {
      const lowRate = engine.grahamValue(5, 15, 3);
      const highRate = engine.grahamValue(5, 15, 8);
      expect(lowRate).toBeGreaterThan(highRate);
    });
  });

  describe('安全边际计算', () => {
    it('优质股票应有高安全边际', () => {
      const result = engine.calculateMarginOfSafety(goodStock);
      expect(result.safetyMargin).toBeGreaterThan(0);
      expect(result.attractiveness).not.toBe('avoid');
    });

    it('昂贵股票应有低或负安全边际', () => {
      const result = engine.calculateMarginOfSafety(expensiveStock);
      expect(result.safetyMargin).toBeLessThan(0);
      expect(result.attractiveness).toBe('avoid');
    });

    it('应该包含信号', () => {
      const result = engine.calculateMarginOfSafety(goodStock);
      expect(result.signals.length).toBeGreaterThan(0);
    });

    it('质量评分应在0-100之间', () => {
      const result1 = engine.calculateMarginOfSafety(goodStock);
      const result2 = engine.calculateMarginOfSafety(expensiveStock);
      expect(result1.qualityScore).toBeGreaterThanOrEqual(0);
      expect(result1.qualityScore).toBeLessThanOrEqual(100);
      expect(result2.qualityScore).toBeGreaterThanOrEqual(0);
      expect(result2.qualityScore).toBeLessThanOrEqual(100);
    });

    it('风险调整收益应考虑质量和安全边际', () => {
      const result = engine.calculateMarginOfSafety(goodStock);
      expect(result.riskAdjustedReturn).toBeGreaterThan(0);
    });

    it('吸引力等级正确分级', () => {
      const excellent: StockValuation = { price: 20, eps: 5, bookValue: 40, dividendYield: 4, peRatio: 4, pbRatio: 0.5, growthRate: 20, debtToEquity: 0.2, currentRatio: 3 };
      const result = engine.calculateMarginOfSafety(excellent);
      expect(['excellent', 'good']).toContain(result.attractiveness);
    });
  });

  describe('估值分解', () => {
    it('应该分解为各组成部分', () => {
      const decomp = engine.decomposeValue(goodStock);
      expect(decomp.earningsValue).toBeGreaterThan(0);
      expect(decomp.assetValue).toBeGreaterThan(0);
      expect(decomp.fairValue).toBeGreaterThan(0);
    });

    it('高质量股票折价更小', () => {
      const decomp1 = engine.decomposeValue(goodStock);
      const decomp2 = engine.decomposeValue(expensiveStock);
      expect(decomp1.qualityDiscount).toBeGreaterThanOrEqual(decomp2.qualityDiscount);
    });

    it('高成长有成长溢价', () => {
      const lowGrowth = engine.decomposeValue({ ...goodStock, growthRate: 2 });
      const highGrowth = engine.decomposeValue({ ...goodStock, growthRate: 25 });
      expect(highGrowth.growthPremium).toBeGreaterThan(lowGrowth.growthPremium);
    });

    it('高股息有股息价值', () => {
      const noDiv = engine.decomposeValue({ ...goodStock, dividendYield: 0 });
      const highDiv = engine.decomposeValue({ ...goodStock, dividendYield: 8 });
      expect(highDiv.dividendValue).toBeGreaterThan(noDiv.dividendValue);
    });
  });

  describe('批量排名', () => {
    it('应该按风险调整收益排序', () => {
      const stocks = [
        { name: '便宜股', valuation: goodStock },
        { name: '昂贵股', valuation: expensiveStock },
      ];
      const ranked = engine.rankByMarginOfSafety(stocks);
      expect(ranked[0].rank).toBe(1);
      expect(ranked[0].name).toBe('便宜股');
    });

    it('空数组应返回空', () => {
      const ranked = engine.rankByMarginOfSafety([]);
      expect(ranked).toEqual([]);
    });

    it('排名应连续', () => {
      const stocks = [
        { name: 'A', valuation: goodStock },
        { name: 'B', valuation: expensiveStock },
      ];
      const ranked = engine.rankByMarginOfSafety(stocks);
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].rank).toBe(2);
    });
  });

  describe('边界情况', () => {
    it('零价格不应报错', () => {
      const zeroPrice: StockValuation = { ...goodStock, price: 0 };
      expect(() => engine.calculateMarginOfSafety(zeroPrice)).not.toThrow();
    });

    it('零EPS不应报错', () => {
      const zeroEps: StockValuation = { ...goodStock, eps: 0 };
      const result = engine.calculateMarginOfSafety(zeroEps);
      expect(result.grahamValue).toBe(0);
    });

    it('极端负债率不应报错', () => {
      const extremeDebt: StockValuation = { ...goodStock, debtToEquity: 100 };
      expect(() => engine.calculateMarginOfSafety(extremeDebt)).not.toThrow();
    });
  });
});
