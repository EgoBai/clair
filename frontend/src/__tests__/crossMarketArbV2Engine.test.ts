import { describe, it, expect } from 'vitest';
import { analyzeCrossMarketArb, CrossMarketPair } from '../utils/crossMarketArbV2Engine';

describe('跨市场套利引擎', () => {
  const pairs: CrossMarketPair[] = [
    { code1: '600519', market1: 'A', price1: 1800, code2: '060519', market2: 'H', price2: 150, exchangeRate: 0.92, conversionRatio: 1, date: '2024-03-15' },
    { code1: '000858', market1: 'A', price1: 150, code2: '00858', market2: 'H', price2: 18, exchangeRate: 0.92, conversionRatio: 1, date: '2024-03-15' },
    { code1: '510300', market1: 'A', price1: 4.5, code2: '2828', market2: 'H', price2: 25, exchangeRate: 0.92, conversionRatio: 0.18, date: '2024-03-15' },
  ];

  it('应该分析套利机会', () => {
    const result = analyzeCrossMarketArb(pairs);
    expect(result.opportunities.length).toBe(3);
  });

  it('应该计算溢价率', () => {
    const result = analyzeCrossMarketArb(pairs);
    for (const o of result.opportunities) {
      expect(typeof o.premium).toBe('number');
    }
  });

  it('应该生成信号', () => {
    const result = analyzeCrossMarketArb(pairs);
    for (const o of result.opportunities) {
      expect(['buy_1_sell_2', 'buy_2_sell_1', 'hold']).toContain(o.signal);
    }
  });

  it('应该计算净收益', () => {
    const result = analyzeCrossMarketArb(pairs);
    for (const o of result.opportunities) {
      expect(typeof o.netProfit).toBe('number');
    }
  });

  it('应该评估风险等级', () => {
    const result = analyzeCrossMarketArb(pairs);
    for (const o of result.opportunities) {
      expect(['low', 'medium', 'high']).toContain(o.riskLevel);
    }
  });

  it('应该计算平均溢价', () => {
    const result = analyzeCrossMarketArb(pairs);
    expect(typeof result.avgPremium).toBe('number');
  });

  it('应该计算市场效率', () => {
    const result = analyzeCrossMarketArb(pairs);
    expect(result.marketEfficiency).toBeGreaterThanOrEqual(0);
    expect(result.marketEfficiency).toBeLessThanOrEqual(1);
  });

  it('应该返回TOP机会', () => {
    const result = analyzeCrossMarketArb(pairs);
    expect(Array.isArray(result.topOpportunities)).toBe(true);
  });

  it('空数据应抛出错误', () => {
    expect(() => analyzeCrossMarketArb([])).toThrow();
  });

  it('应该生成警报', () => {
    const result = analyzeCrossMarketArb(pairs);
    expect(Array.isArray(result.alerts)).toBe(true);
  });

  it('应该计算交易成本', () => {
    const result = analyzeCrossMarketArb(pairs);
    for (const o of result.opportunities) {
      expect(o.cost).toBeGreaterThan(0);
    }
  });

  it('自定义成本应生效', () => {
    const result = analyzeCrossMarketArb(pairs, 0.01);
    for (const o of result.opportunities) {
      expect(o.cost).toBeCloseTo(0.02, 3);
    }
  });
});
