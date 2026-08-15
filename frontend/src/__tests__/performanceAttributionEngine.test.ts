/**
 * 业绩归因引擎测试 —— 直接驱动真实模块
 * 说明: 原测试内联重实现了 calculateReturns/Sharpe/Sortino/Calmar 及 Map 版 brinson, 与真实模块签名/行为不符, 已删除。
 *       改为测试真实导出: brinsonAttribution / calculateRiskMetrics / analyzeTimingSkill / analyzeStyleAttribution
 */
import { describe, it, expect } from 'vitest';
import {
  brinsonAttribution,
  calculateRiskMetrics,
  analyzeTimingSkill,
  analyzeStyleAttribution,
} from '../utils/performanceAttributionEngine';

describe('brinsonAttribution', () => {
  const portfolio = [
    { sector: 'tech', weight: 0.6, return: 0.1 },
    { sector: 'finance', weight: 0.4, return: 0.05 },
  ];
  const benchmark = [
    { sector: 'tech', weight: 0.5, return: 0.08 },
    { sector: 'finance', weight: 0.5, return: 0.06 },
  ];

  it('三类效应之和应等于 totalActiveReturn', () => {
    const r = brinsonAttribution(portfolio, benchmark);
    expect(r.totalActiveReturn).toBeCloseTo(
      r.allocationEffect + r.selectionEffect + r.interactionEffect,
      5
    );
  });

  it('应返回每个行业的分解', () => {
    const r = brinsonAttribution(portfolio, benchmark);
    expect(r.sectorBreakdown).toHaveLength(2);
    for (const s of r.sectorBreakdown) {
      expect(s.total).toBeCloseTo(s.allocation + s.selection + s.interaction, 5);
    }
  });
});

describe('calculateRiskMetrics', () => {
  it('样本不足时应返回零值且 beta 为 1', () => {
    const r = calculateRiskMetrics([0.01], [0.01]);
    expect(r.sharpeRatio).toBe(0);
    expect(r.beta).toBe(1);
    expect(r.trackingError).toBe(0);
  });

  it('应计算完整风险归因', () => {
    const returns = [0.01, -0.005, 0.02, -0.01, 0.015, -0.008, 0.012, 0.005];
    const bench = [0.008, -0.004, 0.018, -0.011, 0.013, -0.006, 0.009, 0.004];
    const r = calculateRiskMetrics(returns, bench);
    expect(r.totalRisk).toBeGreaterThan(0);
    expect(typeof r.beta).toBe('number');
    expect(r.maxDrawdown).toBeGreaterThanOrEqual(0);
    expect(r.trackingError).toBeGreaterThanOrEqual(0);
    expect(typeof r.sharpeRatio).toBe('number');
    expect(typeof r.informationRatio).toBe('number');
  });

  it('单调上涨序列的最大回撤应为 0, Calmar 为 0', () => {
    const returns = [0.01, 0.01, 0.01, 0.01];
    const r = calculateRiskMetrics(returns, returns);
    expect(r.maxDrawdown).toBe(0);
    expect(r.calmarRatio).toBe(0);
  });
});

describe('analyzeTimingSkill', () => {
  it('样本不足时应返回默认中性结果', () => {
    const r = analyzeTimingSkill([0.01], [0.01]);
    expect(r.timingScore).toBe(50);
    expect(r.stockPickingScore).toBe(50);
    expect(r.upCapture).toBe(1);
    expect(r.downCapture).toBe(1);
    expect(r.winRate).toBe(0.5);
    expect(r.profitFactor).toBe(1);
  });

  it('应返回合法范围的能力指标', () => {
    const returns = [0.02, -0.01, 0.03, -0.005, 0.015];
    const bench = [0.01, -0.008, 0.02, -0.004, 0.01];
    const r = analyzeTimingSkill(returns, bench);
    expect(r.timingScore).toBeGreaterThanOrEqual(0);
    expect(r.timingScore).toBeLessThanOrEqual(100);
    expect(r.winRate).toBeGreaterThanOrEqual(0);
    expect(r.winRate).toBeLessThanOrEqual(1);
    expect(typeof r.upCapture).toBe('number');
    expect(typeof r.profitFactor).toBe('number');
    expect(r.consistency).toBeGreaterThanOrEqual(0);
  });
});

describe('analyzeStyleAttribution', () => {
  it('应计算因子暴露并确定主导风格', () => {
    const holdings = [
      { code: 'A', weight: 0.5, return: 0.1, marketCap: 1e12, pe: 30, momentum: 0.8 },
      { code: 'B', weight: 0.5, return: 0.05, marketCap: 1e9, pe: 8, momentum: -0.2 },
    ];
    const r = analyzeStyleAttribution(holdings);
    expect(typeof r.dominantStyle).toBe('string');
    expect(typeof r.sizeExposure).toBe('number');
    expect(typeof r.valueExposure).toBe('number');
    expect(r.styleReturns).toHaveLength(3);
  });
});
