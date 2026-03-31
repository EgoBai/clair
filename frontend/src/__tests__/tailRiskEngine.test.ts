import { describe, it, expect } from 'vitest';
import { analyzeTailRisk, ReturnSeries } from '../utils/tailRiskEngine';

describe('尾部风险管理引擎', () => {
  const makeReturns = (code: string, n: number, weight: number): ReturnSeries => ({
    code,
    returns: Array.from({ length: n }, () => {
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return 0.0005 + 0.02 * z;
    }),
    weights: weight,
  });

  const returns: ReturnSeries[] = [
    makeReturns('A', 252, 0.5),
    makeReturns('B', 252, 0.3),
    makeReturns('C', 252, 0.2),
  ];

  it('应该计算组合VaR', () => {
    const result = analyzeTailRisk(returns);
    expect(result.portfolio.var95).toBeLessThan(0);
    expect(result.portfolio.var99).toBeLessThanOrEqual(result.portfolio.var95);
  });

  it('应该计算CVaR', () => {
    const result = analyzeTailRisk(returns);
    expect(result.portfolio.cvar95).toBeLessThanOrEqual(result.portfolio.var95);
  });

  it('应该计算偏度和峰度', () => {
    const result = analyzeTailRisk(returns);
    expect(typeof result.portfolio.skewness).toBe('number');
    expect(typeof result.portfolio.kurtosis).toBe('number');
  });

  it('应该计算最大回撤', () => {
    const result = analyzeTailRisk(returns);
    expect(result.portfolio.maxDrawdown).toBeLessThanOrEqual(0);
  });

  it('应该分析极端事件概率', () => {
    const result = analyzeTailRisk(returns);
    expect(result.extremeEvents.length).toBe(4);
    for (const e of result.extremeEvents) {
      expect(e.probability).toBeGreaterThanOrEqual(0);
      expect(e.probability).toBeLessThanOrEqual(1);
    }
  });

  it('应该生成对冲建议', () => {
    const result = analyzeTailRisk(returns);
    expect(Array.isArray(result.hedgingRecs)).toBe(true);
  });

  it('应该生成压力测试', () => {
    const result = analyzeTailRisk(returns);
    expect(result.stressTests.length).toBeGreaterThan(0);
    for (const st of result.stressTests) {
      expect(typeof st.loss).toBe('number');
    }
  });

  it('应该分析个股尾部风险', () => {
    const result = analyzeTailRisk(returns);
    expect(result.individual.length).toBe(3);
    for (const ind of result.individual) {
      expect(ind.metrics.var95).toBeDefined();
    }
  });

  it('应该计算风险预算', () => {
    const result = analyzeTailRisk(returns);
    expect(result.riskBudget).toBeGreaterThanOrEqual(0);
    expect(result.riskBudget).toBeLessThanOrEqual(1);
  });

  it('空数据应抛出错误', () => {
    expect(() => analyzeTailRisk([])).toThrow();
  });

  it('应该计算尾部风险指标', () => {
    const result = analyzeTailRisk(returns);
    expect(result.portfolio.tailRisk).toBeGreaterThanOrEqual(0);
  });
});
