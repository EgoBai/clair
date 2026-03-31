import { describe, it, expect } from 'vitest';
import { quantamentalScreen, QuantamentalInput } from '../utils/quantamentalEngine';

describe('基本面+量化结合引擎', () => {
  const stocks: QuantamentalInput[] = [
    {
      symbol: 'STOCK_A', pe: 10, pb: 1.2, pePercentile: 0.15, pbPercentile: 0.1,
      roe: 0.2, grossMargin: 0.4, debtToEquity: 0.3, cashFlowYield: 0.08,
      revenueGrowth: 0.2, profitGrowth: 0.25,
      priceReturn3m: 0.1, priceReturn6m: 0.2, rsRating: 80,
      analystConsensus: 80, insiderActivity: 0.5,
      volatility: 0.2, beta: 1.0, maxDrawdown: -0.1,
    },
    {
      symbol: 'STOCK_B', pe: 40, pb: 6, pePercentile: 0.9, pbPercentile: 0.85,
      roe: 0.05, grossMargin: 0.15, debtToEquity: 2.0, cashFlowYield: 0.01,
      revenueGrowth: -0.05, profitGrowth: -0.1,
      priceReturn3m: -0.15, priceReturn6m: -0.25, rsRating: 20,
      analystConsensus: 30, insiderActivity: -0.8,
      volatility: 0.4, beta: 1.5, maxDrawdown: -0.35,
    },
  ];

  it('应返回结果数组', () => {
    const r = quantamentalScreen(stocks);
    expect(r.length).toBe(2);
  });

  it('STOCK_A应排名最高', () => {
    const r = quantamentalScreen(stocks);
    expect(r[0].symbol).toBe('STOCK_A');
  });

  it('应计算价值评分', () => {
    const r = quantamentalScreen(stocks);
    r.forEach(s => {
      expect(s.valueScore).toBeGreaterThanOrEqual(0);
      expect(s.valueScore).toBeLessThanOrEqual(100);
    });
  });

  it('应计算质量评分', () => {
    const r = quantamentalScreen(stocks);
    r.forEach(s => {
      expect(s.qualityScore).toBeGreaterThanOrEqual(0);
    });
  });

  it('应计算综合评分', () => {
    const r = quantamentalScreen(stocks);
    r.forEach(s => {
      expect(s.compositeScore).toBeGreaterThanOrEqual(0);
      expect(s.compositeScore).toBeLessThanOrEqual(100);
    });
  });

  it('应输出投资信号', () => {
    const r = quantamentalScreen(stocks);
    r.forEach(s => {
      expect(['strong_buy', 'buy', 'hold', 'sell', 'strong_sell']).toContain(s.signal);
    });
  });

  it('应输出因子分解', () => {
    const r = quantamentalScreen(stocks);
    r.forEach(s => {
      expect(s.factorContributions.length).toBe(5);
    });
  });

  it('应计算风险预算', () => {
    const r = quantamentalScreen(stocks);
    r.forEach(s => {
      expect(s.riskBudget).toBeGreaterThan(0);
      expect(s.riskBudget).toBeLessThanOrEqual(0.2);
    });
  });

  it('应评估信念等级', () => {
    const r = quantamentalScreen(stocks);
    r.forEach(s => {
      expect(['high', 'moderate', 'low']).toContain(s.convictionLevel);
    });
  });

  it('应输出洞察', () => {
    const r = quantamentalScreen(stocks);
    r.forEach(s => {
      expect(Array.isArray(s.insights)).toBe(true);
    });
  });
});
