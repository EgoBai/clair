import { describe, it, expect } from 'vitest';
import { analyzeAlphaDecay } from '../utils/alphaDecayEngine';
import type { AlphaData } from '../utils/alphaDecayEngine';

describe('Alpha衰减分析引擎', () => {
  const data: AlphaData[] = Array.from({ length: 100 }, (_, i) => ({
    date: `2024-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
    alpha: 0.001 + (Math.random() - 0.5) * 0.01,
    signalValue: 0.5 + Math.sin(i * 0.1) * 0.3,
    turnover: 0.05 + Math.random() * 0.03,
  }));

  it('应计算平均Alpha', () => {
    const r = analyzeAlphaDecay(data);
    expect(typeof r.avgAlpha).toBe('number');
  });

  it('应计算年化Alpha', () => {
    const r = analyzeAlphaDecay(data);
    expect(typeof r.annualizedAlpha).toBe('number');
  });

  it('应计算信息比率', () => {
    const r = analyzeAlphaDecay(data);
    expect(typeof r.informationRatio).toBe('number');
  });

  it('应计算持续性', () => {
    const r = analyzeAlphaDecay(data);
    expect(r.persistence).toBeGreaterThan(-1);
    expect(r.persistence).toBeLessThan(1);
  });

  it('应计算半衰期', () => {
    const r = analyzeAlphaDecay(data);
    expect(r.halfLife).toBeGreaterThanOrEqual(0);
  });

  it('应评估Alpha质量', () => {
    const r = analyzeAlphaDecay(data);
    expect(['excellent', 'good', 'degrading', 'dead']).toContain(r.alphaQuality);
  });

  it('应计算t统计量', () => {
    const r = analyzeAlphaDecay(data);
    expect(typeof r.tStat).toBe('number');
  });

  it('应判断统计显著性', () => {
    const r = analyzeAlphaDecay(data);
    expect(typeof r.isSignificant).toBe('boolean');
  });

  it('应计算换手Alpha比', () => {
    const r = analyzeAlphaDecay(data);
    expect(typeof r.turnoverAlphaRatio).toBe('number');
  });

  it('数据不足应抛出错误', () => {
    expect(() => analyzeAlphaDecay(data.slice(0, 10))).toThrow();
  });
});
