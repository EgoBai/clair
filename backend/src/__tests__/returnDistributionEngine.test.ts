import { describe, it, expect } from 'vitest';

describe('收益率分布拟合引擎 (Return Distribution Fitting)', () => {
  // 正态分布拟合
  function fitNormal(returns: number[]): { mean: number; std: number } {
    if (returns.length === 0) return { mean: 0, std: 0 };
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
    return { mean, std: Math.sqrt(variance) };
  }

  // 偏度计算
  function skewness(returns: number[]): number {
    if (returns.length < 3) return 0;
    const { mean, std } = fitNormal(returns);
    if (std === 0) return 0;
    const n = returns.length;
    return (n / ((n - 1) * (n - 2))) * returns.reduce((s, r) => s + ((r - mean) / std) ** 3, 0);
  }

  // 峰度计算
  function kurtosis(returns: number[]): number {
    if (returns.length < 4) return 0;
    const { mean, std } = fitNormal(returns);
    if (std === 0) return 0;
    const n = returns.length;
    const k = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3)) * returns.reduce((s, r) => s + ((r - mean) / std) ** 4, 0);
    const adj = (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
    return k - adj; // excess kurtosis
  }

  // Jarque-Bera正态性检验
  function jarqueBera(returns: number[]): { statistic: number; pValue: number } {
    const n = returns.length;
    const s = skewness(returns);
    const k = kurtosis(returns);
    const statistic = (n / 6) * (s ** 2 + (k ** 2) / 4);
    // 近似p值 (chi-square df=2)
    const pValue = Math.exp(-statistic / 2);
    return { statistic, pValue };
  }

  // Student-t分布拟合（矩估计）
  function fitStudentT(returns: number[]): { mu: number; sigma: number; nu: number } {
    const { mean, std } = fitNormal(returns);
    const k = kurtosis(returns);
    const nu = k > 0 ? 4 + 6 / k : 30;
    return { mu: mean, sigma: std, nu: Math.max(3, Math.min(nu, 100)) };
  }

  // 分位数
  function quantile(data: number[], q: number): number {
    if (data.length === 0) return 0;
    const sorted = [...data].sort((a, b) => a - b);
    const pos = q * (sorted.length - 1);
    const lower = Math.floor(pos);
    const frac = pos - lower;
    return sorted[lower] + frac * ((sorted[lower + 1] || sorted[lower]) - sorted[lower]);
  }

  // VaR计算
  function historicalVaR(returns: number[], confidence: number): number {
    return -quantile(returns, 1 - confidence);
  }

  // CVaR (Expected Shortfall)
  function historicalCVaR(returns: number[], confidence: number): number {
    const var95 = historicalVaR(returns, confidence);
    const tail = returns.filter(r => r <= -var95);
    if (tail.length === 0) return var95;
    return -tail.reduce((s, r) => s + r, 0) / tail.length;
  }

  it('正态分布拟合返回均值和标准差', () => {
    const returns = [0.01, -0.02, 0.015, -0.01, 0.005, 0.02, -0.015, 0.01];
    const { mean, std } = fitNormal(returns);
    expect(mean).toBeCloseTo(0.001875, 4);
    expect(std).toBeGreaterThan(0);
  });

  it('空数组返回零值', () => {
    expect(fitNormal([])).toEqual({ mean: 0, std: 0 });
  });

  it('对称分布偏度为零', () => {
    const returns = [-0.02, -0.01, 0.01, 0.02];
    expect(Math.abs(skewness(returns))).toBeLessThan(0.5);
  });

  it('右偏分布偏度为正', () => {
    const returns = [-0.01, 0.0, 0.01, 0.02, 0.05, 0.1];
    expect(skewness(returns)).toBeGreaterThan(0);
  });

  it('尖峰厚尾分布超额峰度为正', () => {
    const returns = [0, 0, 0, 0, 0, 0, 0, 0, 0.05, -0.08];
    expect(kurtosis(returns)).toBeGreaterThan(0);
  });

  it('Jarque-Bera检验正态分布', () => {
    const returns = Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? 0.01 : -0.01));
    const { statistic } = jarqueBera(returns);
    expect(statistic).toBeGreaterThanOrEqual(0);
  });

  it('非正态分布JB统计量高', () => {
    const returns = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, -0.5];
    const { statistic, pValue } = jarqueBera(returns);
    expect(statistic).toBeGreaterThan(0);
    expect(pValue).toBeLessThan(1);
  });

  it('Student-t分布拟合', () => {
    const returns = Array.from({ length: 50 }, () => Math.random() * 0.04 - 0.02);
    const { mu, sigma, nu } = fitStudentT(returns);
    expect(sigma).toBeGreaterThan(0);
    expect(nu).toBeGreaterThanOrEqual(3);
  });

  it('计算分位数', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(quantile(data, 0.5)).toBeCloseTo(5.5, 0);
    expect(quantile(data, 0)).toBe(1);
    expect(quantile(data, 1)).toBe(10);
  });

  it('历史VaR计算', () => {
    const returns = [-0.05, -0.03, -0.01, 0.01, 0.02, 0.03, 0.04];
    const var95 = historicalVaR(returns, 0.95);
    expect(var95).toBeGreaterThan(0);
  });

  it('CVaR大于等于VaR', () => {
    const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.1);
    const var95 = historicalVaR(returns, 0.95);
    const cvar95 = historicalCVaR(returns, 0.95);
    expect(cvar95).toBeGreaterThanOrEqual(var95 - 0.001);
  });

  it('常数数组偏度和峰度为零', () => {
    const returns = [0.01, 0.01, 0.01, 0.01, 0.01];
    expect(skewness(returns)).toBe(0);
    expect(kurtosis(returns)).toBe(0);
  });
});
