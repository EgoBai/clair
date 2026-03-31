import { describe, it, expect } from 'vitest';
import { quantScreening, FundamentalData } from '../utils/fundamentalQuantEngine';

describe('基本面量化筛选引擎', () => {
  const stocks: FundamentalData[] = [
    {
      symbol: 'STOCK_A', pe: 12, pb: 1.5, ps: 2, pcf: 8,
      roe: 0.2, grossMargin: 0.4, netMargin: 0.15,
      revenueGrowth: 0.2, profitGrowth: 0.25,
      debtToEquity: 0.3, currentRatio: 2.5,
      operatingCashFlow: 1000, netProfit: 800,
      dividendYield: 0.03, priceReturn6m: 0.15, priceReturn12m: 0.3,
      earningsSurprise: 0.05,
    },
    {
      symbol: 'STOCK_B', pe: 35, pb: 5, ps: 8, pcf: 25,
      roe: 0.05, grossMargin: 0.15, netMargin: 0.02,
      revenueGrowth: -0.1, profitGrowth: -0.2,
      debtToEquity: 1.5, currentRatio: 0.8,
      operatingCashFlow: 100, netProfit: 50,
      dividendYield: 0.005, priceReturn6m: -0.2, priceReturn12m: -0.3,
      earningsSurprise: -0.1,
    },
    {
      symbol: 'STOCK_C', pe: 20, pb: 2.5, ps: 4, pcf: 15,
      roe: 0.12, grossMargin: 0.3, netMargin: 0.08,
      revenueGrowth: 0.1, profitGrowth: 0.12,
      debtToEquity: 0.6, currentRatio: 1.5,
      operatingCashFlow: 500, netProfit: 400,
      dividendYield: 0.02, priceReturn6m: 0.05, priceReturn12m: 0.1,
      earningsSurprise: 0.02,
    },
  ];

  it('应返回结果数组', () => {
    const r = quantScreening(stocks);
    expect(r.length).toBe(3);
  });

  it('应计算价值评分', () => {
    const r = quantScreening(stocks);
    r.forEach(s => {
      expect(s.valueScore).toBeGreaterThanOrEqual(0);
      expect(s.valueScore).toBeLessThanOrEqual(100);
    });
  });

  it('应计算质量评分', () => {
    const r = quantScreening(stocks);
    r.forEach(s => {
      expect(s.qualityScore).toBeGreaterThanOrEqual(0);
    });
  });

  it('应计算成长评分', () => {
    const r = quantScreening(stocks);
    r.forEach(s => {
      expect(s.growthScore).toBeGreaterThanOrEqual(0);
    });
  });

  it('应计算动量评分', () => {
    const r = quantScreening(stocks);
    r.forEach(s => {
      expect(s.momentumScore).toBeGreaterThanOrEqual(0);
    });
  });

  it('应计算综合评分', () => {
    const r = quantScreening(stocks);
    r.forEach(s => {
      expect(s.totalScore).toBeGreaterThanOrEqual(0);
      expect(s.totalScore).toBeLessThanOrEqual(100);
    });
  });

  it('应输出排名', () => {
    const r = quantScreening(stocks);
    const ranks = r.map(s => s.rank).sort();
    expect(ranks).toEqual([1, 2, 3]);
  });

  it('STOCK_A应排名最高', () => {
    const r = quantScreening(stocks);
    expect(r[0].symbol).toBe('STOCK_A');
  });

  it('应输出因子分解', () => {
    const r = quantScreening(stocks);
    r.forEach(s => {
      expect(s.factorBreakdown.length).toBe(4);
    });
  });

  it('应输出投资建议', () => {
    const r = quantScreening(stocks);
    r.forEach(s => {
      expect(['strong_buy', 'buy', 'hold', 'sell', 'strong_sell']).toContain(s.recommendation);
    });
  });
});
