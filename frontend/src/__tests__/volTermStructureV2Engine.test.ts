import { describe, it, expect } from 'vitest';
import { analyzeVolTermStructure, VolPoint } from '../utils/volTermStructureV2Engine';

describe('波动率期限结构引擎', () => {
  const points: VolPoint[] = [
    { strike: 0.95, expiry: 30, iv: 0.28, delta: -0.25, gamma: 0.05, volume: 1000 },
    { strike: 1.00, expiry: 30, iv: 0.25, delta: 0.50, gamma: 0.08, volume: 5000 },
    { strike: 1.05, expiry: 30, iv: 0.23, delta: 0.25, gamma: 0.05, volume: 800 },
    { strike: 0.95, expiry: 60, iv: 0.30, delta: -0.25, gamma: 0.04, volume: 600 },
    { strike: 1.00, expiry: 60, iv: 0.27, delta: 0.50, gamma: 0.06, volume: 3000 },
    { strike: 1.05, expiry: 60, iv: 0.25, delta: 0.25, gamma: 0.04, volume: 500 },
    { strike: 0.95, expiry: 90, iv: 0.32, delta: -0.25, gamma: 0.03, volume: 400 },
    { strike: 1.00, expiry: 90, iv: 0.29, delta: 0.50, gamma: 0.05, volume: 2000 },
    { strike: 1.05, expiry: 90, iv: 0.27, delta: 0.25, gamma: 0.03, volume: 300 },
  ];

  it('应该构建期限结构', () => {
    const result = analyzeVolTermStructure(points);
    expect(result.termStructure.length).toBe(3);
  });

  it('应该计算期限斜率', () => {
    const result = analyzeVolTermStructure(points);
    expect(typeof result.slope).toBe('number');
  });

  it('应该判断斜率方向', () => {
    const result = analyzeVolTermStructure(points);
    expect(['steepening', 'flattening', 'stable']).toContain(result.slopeSignal);
  });

  it('应该判断contango/backwardation', () => {
    const result = analyzeVolTermStructure(points);
    expect(['contango', 'backwardation']).toContain(result.contangoBackwardation);
  });

  it('应该计算ATM波动率', () => {
    const result = analyzeVolTermStructure(points);
    for (const ts of result.termStructure) {
      expect(ts.atmIV).toBeGreaterThan(0);
    }
  });

  it('应该计算偏度', () => {
    const result = analyzeVolTermStructure(points);
    for (const ts of result.termStructure) {
      expect(typeof ts.skew).toBe('number');
    }
  });

  it('应该计算微笑', () => {
    const result = analyzeVolTermStructure(points);
    for (const ts of result.termStructure) {
      expect(typeof ts.smile).toBe('number');
    }
  });

  it('应该计算风险中性偏度', () => {
    const result = analyzeVolTermStructure(points);
    expect(typeof result.riskNeutralSkew).toBe('number');
  });

  it('应该计算期限溢价', () => {
    const result = analyzeVolTermStructure(points);
    expect(typeof result.termPremium).toBe('number');
  });

  it('空数据应抛出错误', () => {
    expect(() => analyzeVolTermStructure([])).toThrow();
  });

  it('应该搜索套利信号', () => {
    const result = analyzeVolTermStructure(points);
    expect(Array.isArray(result.arbSignals)).toBe(true);
  });

  it('应该生成警报', () => {
    const result = analyzeVolTermStructure(points);
    expect(Array.isArray(result.alerts)).toBe(true);
  });
});
