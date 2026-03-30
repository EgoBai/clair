import { describe, it, expect } from 'vitest';

describe('投资组合风险指标', () => {
  interface Position { symbol: string; weight: number; returns: number[]; }

  function portfolioReturns(positions: Position[]): number[] {
    if (!positions.length) return [];
    const len = Math.min(...positions.map(p => p.returns.length));
    const result: number[] = [];
    for (let i = 0; i < len; i++) {
      result.push(positions.reduce((s, p) => s + p.weight * p.returns[i], 0));
    }
    return result;
  }
  function portfolioVolatility(returns: number[]): number {
    if (returns.length < 2) return 0;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    return Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1));
  }
  function correlation(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length < 2) return 0;
    const ma = a.reduce((x, y) => x + y, 0) / a.length;
    const mb = b.reduce((x, y) => x + y, 0) / b.length;
    let cov = 0, va = 0, vb = 0;
    for (let i = 0; i < a.length; i++) {
      cov += (a[i] - ma) * (b[i] - mb);
      va += (a[i] - ma) ** 2;
      vb += (b[i] - mb) ** 2;
    }
    const d = Math.sqrt(va * vb);
    return d === 0 ? 0 : cov / d;
  }
  function diversificationRatio(positions: Position[]): number {
    const weightedVols = positions.reduce((s, p) => {
      const v = portfolioVolatility(p.returns);
      return s + p.weight * v;
    }, 0);
    const pr = portfolioReturns(positions);
    const pv = portfolioVolatility(pr);
    if (pv === 0) return weightedVols > 0 ? Infinity : 1;
    return weightedVols / pv;
  }
  function concentrationHHI(positions: Position[]): number {
    return positions.reduce((s, p) => s + p.weight ** 2, 0);
  }
  function marginalContribution(positions: Position[], idx: number): number {
    const p = positions[idx];
    const pr = portfolioReturns(positions);
    const pv = portfolioVolatility(pr);
    if (pv === 0) return 0;
    const cov = p.returns.reduce((s, r, i) => s + (r - p.returns.reduce((a, b) => a + b, 0) / p.returns.length) * (pr[i] - pr.reduce((a, b) => a + b, 0) / pr.length), 0) / (p.returns.length - 1);
    return p.weight * cov / pv;
  }

  const pos1: Position = { symbol: '600519', weight: 0.4, returns: [0.01, -0.005, 0.02, -0.01, 0.015] };
  const pos2: Position = { symbol: '000858', weight: 0.35, returns: [0.015, -0.01, 0.025, -0.005, 0.02] };
  const pos3: Position = { symbol: '300750', weight: 0.25, returns: [0.02, 0.005, 0.01, -0.02, 0.01] };

  it('计算组合收益率', () => {
    const pr = portfolioReturns([pos1, pos2]);
    expect(pr).toHaveLength(5);
    expect(pr[0]).toBeCloseTo(0.4 * 0.01 + 0.35 * 0.015, 4);
  });

  it('空组合返回空', () => {
    expect(portfolioReturns([])).toEqual([]);
  });

  it('计算组合波动率', () => {
    const pr = portfolioReturns([pos1, pos2, pos3]);
    const vol = portfolioVolatility(pr);
    expect(vol).toBeGreaterThan(0);
  });

  it('相关系数范围', () => {
    const corr = correlation(pos1.returns, pos2.returns);
    expect(corr).toBeGreaterThanOrEqual(-1);
    expect(corr).toBeLessThanOrEqual(1);
  });

  it('自身相关系数为1', () => {
    expect(correlation(pos1.returns, pos1.returns)).toBeCloseTo(1, 5);
  });

  it('相关系数长度不匹配', () => {
    expect(correlation([1, 2], [1])).toBe(0);
  });

  it('分散化比率', () => {
    const dr = diversificationRatio([pos1, pos2, pos3]);
    expect(dr).toBeGreaterThanOrEqual(1);
  });

  it('集中度HHI', () => {
    const hhi = concentrationHHI([pos1, pos2, pos3]);
    expect(hhi).toBeGreaterThan(0);
    expect(hhi).toBeLessThanOrEqual(1);
  });

  it('等权组合HHI=1/n', () => {
    const eq = [
      { symbol: 'A', weight: 0.5, returns: [0.01] },
      { symbol: 'B', weight: 0.5, returns: [0.01] },
    ];
    expect(concentrationHHI(eq)).toBe(0.5);
  });

  it('单资产组合HHI=1', () => {
    expect(concentrationHHI([{ symbol: 'A', weight: 1, returns: [0.01] }])).toBe(1);
  });

  it('边际贡献', () => {
    const mc = marginalContribution([pos1, pos2, pos3], 0);
    expect(Number.isFinite(mc)).toBe(true);
  });

  it('权重和为1', () => {
    const total = pos1.weight + pos2.weight + pos3.weight;
    expect(total).toBeCloseTo(1, 5);
  });

  it('空收益组合波动率为0', () => {
    expect(portfolioVolatility([])).toBe(0);
    expect(portfolioVolatility([0.01])).toBe(0);
  });

  it('组合收益加权平均', () => {
    const p = portfolioReturns([
      { symbol: 'A', weight: 0.6, returns: [0.1] },
      { symbol: 'B', weight: 0.4, returns: [0.2] },
    ]);
    expect(p[0]).toBeCloseTo(0.14, 4);
  });
});
