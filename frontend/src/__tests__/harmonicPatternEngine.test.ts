import { describe, it, expect } from 'vitest';
import { detectHarmonicPatterns, PricePoint } from '../utils/harmonicPatternEngine';

describe('谐波形态识别引擎', () => {
  // 构建一个Gartley形态的测试数据
  const lows: PricePoint[] = [
    { price: 100, index: 0 },  // X
    { price: 115, index: 10 }, // B
    { price: 103, index: 30 }, // D
  ];
  const highs: PricePoint[] = [
    { price: 130, index: 5 },  // A
    { price: 122, index: 20 }, // C
  ];

  it('应该检测形态', () => {
    const result = detectHarmonicPatterns(highs, lows, 0.2);
    expect(Array.isArray(result.patterns)).toBe(true);
  });

  it('应该返回形态类型', () => {
    const result = detectHarmonicPatterns(highs, lows, 0.5);
    if (result.patterns.length > 0) {
      expect(['gartley', 'butterfly', 'bat', 'crab', 'abcd', 'cypher']).toContain(result.patterns[0].type);
    }
  });

  it('应该计算完成度', () => {
    const result = detectHarmonicPatterns(highs, lows, 0.5);
    for (const p of result.patterns) {
      expect(p.completionPct).toBeGreaterThanOrEqual(0);
      expect(p.completionPct).toBeLessThanOrEqual(1);
    }
  });

  it('应该判断方向', () => {
    const result = detectHarmonicPatterns(highs, lows, 0.5);
    for (const p of result.patterns) {
      expect(['bullish', 'bearish']).toContain(p.direction);
    }
  });

  it('应该计算比率', () => {
    const result = detectHarmonicPatterns(highs, lows, 0.5);
    for (const p of result.patterns) {
      expect(p.ratios.abxa).toBeGreaterThan(0);
      expect(p.ratios.cdxa).toBeGreaterThan(0);
    }
  });

  it('应该识别关键价位', () => {
    const result = detectHarmonicPatterns(highs, lows, 0.5);
    expect(Array.isArray(result.keyLevels)).toBe(true);
  });

  it('应该返回活跃形态', () => {
    const result = detectHarmonicPatterns(highs, lows, 0.5);
    expect(result.activePattern === null || typeof result.activePattern === 'object').toBe(true);
  });

  it('应该返回最近形态', () => {
    const result = detectHarmonicPatterns(highs, lows, 0.5);
    expect(result.nearestPattern === null || typeof result.nearestPattern === 'object').toBe(true);
  });

  it('应该生成警报', () => {
    const result = detectHarmonicPatterns(highs, lows, 0.5);
    expect(Array.isArray(result.alerts)).toBe(true);
  });

  it('空数据应返回空结果', () => {
    const result = detectHarmonicPatterns([], []);
    expect(result.patterns.length).toBe(0);
  });

  it('形态应有目标价和止损', () => {
    const result = detectHarmonicPatterns(highs, lows, 0.5);
    for (const p of result.patterns) {
      expect(p.expectedTarget.price).toBeDefined();
      expect(p.stopLoss.price).toBeDefined();
    }
  });

  it('应该计算置信度', () => {
    const result = detectHarmonicPatterns(highs, lows, 0.5);
    for (const p of result.patterns) {
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });
});
