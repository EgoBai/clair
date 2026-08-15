import { describe, it, expect } from 'vitest';
import {
  buildVolSurface,
  fitVolSmile,
  buildTermStructure,
  analyzeSkew,
  interpolateIV,
  type OptionIVData,
} from '../utils/volSurfaceEngine';

/**
 * 波动率曲面引擎测试 (导入真实模块)
 */

function makeOptions(): OptionIVData[] {
  const strikes = [80, 85, 90, 95, 100, 105, 110, 115, 120];
  const ivs: Record<number, number> = {
    80: 0.35, 85: 0.30, 90: 0.27, 95: 0.24, 100: 0.22,
    105: 0.23, 110: 0.25, 115: 0.28, 120: 0.32,
  };
  const shifts: Record<string, number> = { '30': 0, '60': 0.03, '90': 0.06 };
  const opts: OptionIVData[] = [];
  for (const expiry of ['30', '60', '90']) {
    for (const k of strikes) {
      opts.push({
        strike: k,
        expiry,
        iv: Math.round((ivs[k] + shifts[expiry]) * 1000) / 1000,
        delta: 0, gamma: 0, vega: 0, theta: 0,
      });
    }
  }
  return opts;
}

describe('buildVolSurface', () => {
  it('应构建与输入等长的曲面点', () => {
    const surface = buildVolSurface(makeOptions(), 100);
    expect(surface).toHaveLength(27);
  });

  it('应正确标记 ATM 与计算 moneyness', () => {
    const surface = buildVolSurface(makeOptions(), 100);
    const atm = surface.find(p => p.strike === 100);
    expect(atm?.moneyness).toBe(1);
    expect(atm?.moneynessLabel).toBe('atm');
  });
});

describe('fitVolSmile', () => {
  it('应拟合 ATM 波动率与偏度', () => {
    const surface = buildVolSurface(makeOptions(), 100);
    const params = fitVolSmile(surface, 30);
    expect(params.atmVol).toBeCloseTo(0.22, 2);
    expect(params.skew).toBeGreaterThan(0); // 认沽溢价 (put skew)
    expect(params.rmse).toBeGreaterThanOrEqual(0);
  });

  it('数据不足返回默认值', () => {
    const sparse = buildVolSurface([
      { strike: 100, expiry: '30', iv: 0.22, delta: 0, gamma: 0, vega: 0, theta: 0 },
      { strike: 105, expiry: '30', iv: 0.23, delta: 0, gamma: 0, vega: 0, theta: 0 },
    ], 100);
    const params = fitVolSmile(sparse, 30);
    expect(params.skew).toBe(0);
    expect(params.rmse).toBe(1);
  });
});

describe('buildTermStructure', () => {
  it('应按到期日构建期限结构', () => {
    const surface = buildVolSurface(makeOptions(), 100);
    const ts = buildTermStructure(surface, 1.0);
    expect(ts.tenors).toHaveLength(3);
    expect(ts.tenors[0].days).toBe(30);
    expect(ts.contango).toBe(true);
    expect(ts.expectedVol).toBeGreaterThan(0);
  });
});

describe('analyzeSkew', () => {
  it('应计算偏度百分位与解读', () => {
    const surface = buildVolSurface(makeOptions(), 100);
    const params = fitVolSmile(surface, 30);
    const analysis = analyzeSkew(params, [0.01, 0.02, 0.03]);
    expect(analysis.putCallSkew).toBe(params.skew);
    expect(analysis.skewPercentile).toBeGreaterThanOrEqual(0);
    expect(analysis.skewPercentile).toBeLessThanOrEqual(100);
    expect(typeof analysis.interpretation).toBe('string');
    expect(analysis.interpretation.length).toBeGreaterThan(0);
  });
});

describe('interpolateIV', () => {
  it('空曲面返回 0.2', () => {
    expect(interpolateIV([], 100, 30)).toBe(0.2);
  });

  it('已知点应返回近似原值', () => {
    const surface = buildVolSurface(makeOptions(), 100);
    const vol = interpolateIV(surface, 100, 30);
    expect(vol).toBeCloseTo(0.22, 2);
  });
});
