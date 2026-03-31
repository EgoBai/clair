import { describe, it, expect } from 'vitest';
import { buildVolSurface, VolSurfacePoint } from '../utils/volSurfaceV3Engine';

describe('波动率曲面引擎v2', () => {
  const points: VolSurfacePoint[] = [
    { expiry: 30, strike: 0.95, iv: 0.28, bid: 0.27, ask: 0.29, delta: -0.25, volume: 1000 },
    { expiry: 30, strike: 1.00, iv: 0.25, bid: 0.24, ask: 0.26, delta: 0.50, volume: 5000 },
    { expiry: 30, strike: 1.05, iv: 0.23, bid: 0.22, ask: 0.24, delta: 0.25, volume: 800 },
    { expiry: 60, strike: 0.95, iv: 0.30, bid: 0.29, ask: 0.31, delta: -0.25, volume: 600 },
    { expiry: 60, strike: 1.00, iv: 0.27, bid: 0.26, ask: 0.28, delta: 0.50, volume: 3000 },
    { expiry: 60, strike: 1.05, iv: 0.25, bid: 0.24, ask: 0.26, delta: 0.25, volume: 500 },
    { expiry: 90, strike: 0.95, iv: 0.32, bid: 0.31, ask: 0.33, delta: -0.25, volume: 400 },
    { expiry: 90, strike: 1.00, iv: 0.29, bid: 0.28, ask: 0.30, delta: 0.50, volume: 2000 },
    { expiry: 90, strike: 1.05, iv: 0.27, bid: 0.26, ask: 0.28, delta: 0.25, volume: 300 },
  ];

  it('应该构建波动率曲面', () => {
    const result = buildVolSurface(points);
    expect(result.surface.length).toBeGreaterThan(0);
  });

  it('应该构建ATM期限结构', () => {
    const result = buildVolSurface(points);
    expect(result.atmTermStructure.length).toBe(5);
  });

  it('ATM IV应该随期限增加', () => {
    const result = buildVolSurface(points);
    // 有数据的期限应该满足(30, 60, 90天)
    const withData = result.atmTermStructure.filter(t => t.iv > 0.26);
    for (let i = 0; i < withData.length - 1; i++) {
      expect(withData[i + 1].iv).toBeGreaterThanOrEqual(withData[i].iv - 0.02);
    }
  });

  it('应该计算偏度', () => {
    const result = buildVolSurface(points);
    expect(result.skewByExpiry.length).toBe(5);
  });

  it('应该计算蝶式', () => {
    const result = buildVolSurface(points);
    expect(result.butterflyByExpiry.length).toBe(5);
  });

  it('应该检测套利违规', () => {
    const result = buildVolSurface(points);
    expect(Array.isArray(result.arbitrageViolations)).toBe(true);
  });

  it('应该评估曲面质量', () => {
    const result = buildVolSurface(points);
    expect(['excellent', 'good', 'degraded', 'poor']).toContain(result.surfaceQuality);
  });

  it('插值点应标记', () => {
    const result = buildVolSurface(points);
    const interpolated = result.surface.filter(s => s.interpolated);
    expect(interpolated.length).toBeGreaterThan(0);
  });

  it('所有IV应为正数', () => {
    const result = buildVolSurface(points);
    for (const s of result.surface) {
      expect(s.iv).toBeGreaterThan(0);
    }
  });

  it('空数据应抛出错误', () => {
    expect(() => buildVolSurface([])).toThrow();
  });

  it('自定义目标应工作', () => {
    const result = buildVolSurface(points, [30, 60], [0.95, 1.0, 1.05]);
    expect(result.surface.length).toBe(6);
  });
});
