import { describe, it, expect } from 'vitest';
import { stressTestPortfolio, PortfolioHolding, StressScenario } from '../utils/portfolioStressEngine';

describe('组合压力测试引擎', () => {
  const holdings: PortfolioHolding[] = [
    { code: 'A', weight: 0.4, returns: Array.from({ length: 60 }, () => -0.02 + Math.random() * 0.04), beta: 1.2 },
    { code: 'B', weight: 0.3, returns: Array.from({ length: 60 }, () => -0.03 + Math.random() * 0.06), beta: 0.8 },
    { code: 'C', weight: 0.3, returns: Array.from({ length: 60 }, () => -0.01 + Math.random() * 0.02), beta: 0.5 },
  ];

  const scenarios: StressScenario[] = [
    { name: '市场暴跌', description: '市场下跌20%', factorShocks: {}, marketReturn: -0.20, volatilityMultiplier: 2.0 },
    { name: '流动性危机', description: '流动性枯竭', factorShocks: { A: -0.15, B: -0.10, C: -0.05 }, marketReturn: -0.15, volatilityMultiplier: 3.0 },
    { name: '温和回调', description: '市场下跌5%', factorShocks: {}, marketReturn: -0.05, volatilityMultiplier: 1.2 },
  ];

  it('应该生成压力测试结果', () => {
    const result = stressTestPortfolio(holdings, scenarios);
    expect(result.results.length).toBe(3);
  });

  it('应该计算组合损失', () => {
    const result = stressTestPortfolio(holdings, scenarios);
    for (const r of result.results) {
      expect(r.portfolioLoss).toBeLessThan(0);
    }
  });

  it('应该识别最差情景', () => {
    const result = stressTestPortfolio(holdings, scenarios);
    // 流动性危机有额外因子冲击，可能比市场暴跌损失更大
    expect(result.worstCase.portfolioLoss).toBeLessThan(0);
    expect(['市场暴跌', '流动性危机']).toContain(result.worstCase.scenario.name);
  });

  it('应该计算最差持仓', () => {
    const result = stressTestPortfolio(holdings, scenarios);
    for (const r of result.results) {
      expect(r.worstHoldings.length).toBeGreaterThan(0);
      expect(r.worstHoldings[0].loss).toBeLessThanOrEqual(r.worstHoldings[r.worstHoldings.length - 1].loss);
    }
  });

  it('应该计算VaR/CVaR影响', () => {
    const result = stressTestPortfolio(holdings, scenarios);
    for (const r of result.results) {
      expect(r.varImpact).toBeLessThan(0);
      expect(r.cvarImpact).toBeLessThanOrEqual(r.varImpact);
    }
  });

  it('应该估算恢复时间', () => {
    const result = stressTestPortfolio(holdings, scenarios);
    for (const r of result.results) {
      expect(r.estimatedRecoveryDays).toBeGreaterThan(0);
    }
  });

  it('应该计算平均压力损失', () => {
    const result = stressTestPortfolio(holdings, scenarios);
    expect(result.averageStressLoss).toBeLessThan(0);
  });

  it('应该计算韧性评分', () => {
    const result = stressTestPortfolio(holdings, scenarios);
    expect(result.resilientScore).toBeGreaterThanOrEqual(0);
    expect(result.resilientScore).toBeLessThanOrEqual(100);
  });

  it('应该生成建议', () => {
    const result = stressTestPortfolio(holdings, scenarios);
    expect(Array.isArray(result.recommendations)).toBe(true);
  });

  it('空数据应抛出错误', () => {
    expect(() => stressTestPortfolio([], scenarios)).toThrow();
    expect(() => stressTestPortfolio(holdings, [])).toThrow();
  });

  it('应该计算流动性影响', () => {
    const result = stressTestPortfolio(holdings, scenarios);
    for (const r of result.results) {
      expect(r.liquidityImpact).toBeGreaterThanOrEqual(0);
    }
  });

  it('应该计算分散化收益', () => {
    const result = stressTestPortfolio(holdings, scenarios);
    expect(typeof result.diversificationBenefit).toBe('number');
  });
});
