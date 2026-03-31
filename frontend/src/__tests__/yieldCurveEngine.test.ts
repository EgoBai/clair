import { describe, it, expect } from 'vitest';
import { analyzeYieldCurve, YieldCurveData } from '../utils/yieldCurveEngine';

describe('收益率曲线分析引擎', () => {
  const normalCurve: YieldCurveData = {
    m1: 1.0, m3: 1.3, m6: 1.6, y1: 2.0, y2: 2.3, y5: 2.8, y10: 3.5, y30: 4.0,
    history10y: Array.from({ length: 60 }, (_, i) => ({ date: `2024-01-${(i % 28) + 1}`, yield: 2.8 + i * 0.005 })),
    history2y: Array.from({ length: 60 }, (_, i) => ({ date: `2024-01-${(i % 28) + 1}`, yield: 2.3 + i * 0.003 })),
  };

  const invertedCurve: YieldCurveData = {
    m1: 5.0, m3: 5.2, m6: 4.8, y1: 4.5, y2: 4.2, y5: 3.8, y10: 3.2, y30: 3.3,
    history10y: Array.from({ length: 60 }, (_, i) => ({ date: `2024-01-${(i % 28) + 1}`, yield: 4.0 - i * 0.01 })),
    history2y: Array.from({ length: 60 }, (_, i) => ({ date: `2024-01-${(i % 28) + 1}`, yield: 4.5 - i * 0.005 })),
  };

  it('应识别正常曲线', () => {
    const r = analyzeYieldCurve(normalCurve);
    expect(r.curveShape).toBe('normal');
  });

  it('应识别倒挂曲线', () => {
    const r = analyzeYieldCurve(invertedCurve);
    expect(r.curveShape).toBe('inverted');
  });

  it('应计算10Y-2Y利差', () => {
    const r = analyzeYieldCurve(normalCurve);
    expect(r.spread10y2y).toBe(1.2);
  });

  it('应计算10Y-3M利差', () => {
    const r = analyzeYieldCurve(normalCurve);
    expect(r.spread10y3m).toBe(2.2);
  });

  it('应计算期限溢价', () => {
    const r = analyzeYieldCurve(normalCurve);
    expect(r.termPremium).toBe(1.5);
  });

  it('应判断利率周期', () => {
    const r = analyzeYieldCurve(normalCurve);
    expect(['early_easing', 'mid_easing', 'late_easing', 'early_tightening', 'mid_tightening', 'late_tightening']).toContain(r.rateCycle);
  });

  it('应计算衰退概率', () => {
    const r = analyzeYieldCurve(invertedCurve);
    expect(r.recessionProbability).toBeGreaterThan(0.3);
  });

  it('应输出牛熊信号', () => {
    const r = analyzeYieldCurve(normalCurve);
    expect(['bullish', 'bearish', 'neutral']).toContain(r.bullBearSignal);
  });

  it('应评估股市影响', () => {
    const r = analyzeYieldCurve(normalCurve);
    expect(['positive', 'negative', 'neutral']).toContain(r.equityImpact);
  });

  it('倒挂曲线应有衰退警告', () => {
    const r = analyzeYieldCurve(invertedCurve);
    expect(r.keyInsights.length).toBeGreaterThan(0);
  });
});
