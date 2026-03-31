import { describe, it, expect } from 'vitest';
import { analyzeIndustryRotation, IndustryData } from '../utils/industryRotationEngine2';

describe('行业轮动量化引擎V2', () => {
  const industries: IndustryData[] = [
    { name: '半导体', returns1m: 0.08, returns3m: 0.15, returns6m: 0.25, returns12m: 0.35, volatility: 0.3, pePercentile: 0.4, earningsRevision: 0.15, fundFlow: 50, momentum: 0.6, meanReversion: 0.2 },
    { name: '新能源', returns1m: -0.03, returns3m: -0.08, returns6m: -0.15, returns12m: -0.2, volatility: 0.35, pePercentile: 0.2, earningsRevision: 0.05, fundFlow: -20, momentum: -0.3, meanReversion: 0.4 },
    { name: '消费', returns1m: 0.02, returns3m: 0.05, returns6m: 0.08, returns12m: 0.12, volatility: 0.2, pePercentile: 0.6, earningsRevision: 0.03, fundFlow: 10, momentum: 0.2, meanReversion: 0.1 },
    { name: '银行', returns1m: -0.01, returns3m: 0.02, returns6m: 0.05, returns12m: 0.08, volatility: 0.15, pePercentile: 0.15, earningsRevision: 0.02, fundFlow: 5, momentum: 0.1, meanReversion: 0.3 },
    { name: '地产', returns1m: -0.05, returns3m: -0.12, returns6m: -0.2, returns12m: -0.3, volatility: 0.4, pePercentile: 0.1, earningsRevision: -0.1, fundFlow: -30, momentum: -0.5, meanReversion: 0.5 },
  ];

  it('应返回信号数组', () => {
    const r = analyzeIndustryRotation(industries);
    expect(r.signals.length).toBe(5);
  });

  it('应判断超配/中性/低配', () => {
    const r = analyzeIndustryRotation(industries);
    r.signals.forEach(s => {
      expect(['overweight', 'neutral', 'underweight']).toContain(s.signal);
    });
  });

  it('应计算综合得分', () => {
    const r = analyzeIndustryRotation(industries);
    r.signals.forEach(s => {
      expect(typeof s.compositeScore).toBe('number');
    });
  });

  it('应输出排名前三行业', () => {
    const r = analyzeIndustryRotation(industries);
    expect(r.topIndustries.length).toBe(3);
  });

  it('应输出排名后三行业', () => {
    const r = analyzeIndustryRotation(industries);
    expect(r.bottomIndustries.length).toBe(3);
  });

  it('应判断轮动阶段', () => {
    const r = analyzeIndustryRotation(industries);
    expect(['early_momentum', 'mid_momentum', 'late_momentum', 'reversal']).toContain(r.rotationPhase);
  });

  it('应判断市场状态', () => {
    const r = analyzeIndustryRotation(industries);
    expect(['risk_on', 'risk_off', 'transition']).toContain(r.marketRegime);
  });

  it('应输出组合推荐', () => {
    const r = analyzeIndustryRotation(industries);
    expect(Array.isArray(r.portfolioRecommendation)).toBe(true);
  });

  it('数据不足应抛出错误', () => {
    expect(() => analyzeIndustryRotation(industries.slice(0, 2))).toThrow();
  });

  it('应计算风险调整后收益', () => {
    const r = analyzeIndustryRotation(industries);
    r.signals.forEach(s => {
      expect(typeof s.riskAdjustedReturn).toBe('number');
    });
  });
});
