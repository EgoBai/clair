import { describe, it, expect } from 'vitest';

describe('波动率风险溢价引擎 (Volatility Risk Premium)', () => {
  // 隐含波动率 vs 实现波动率溢价
  function volRiskPremium(impliedVol: number, realizedVol: number): number {
    if (realizedVol === 0) return 0;
    return (impliedVol - realizedVol) / realizedVol;
  }

  // 波动率曲面溢价
  function volSurfacePremium(strikes: number[], impliedVols: number[], spotPrice: number): { moneyness: number; premium: number }[] {
    return strikes.map((k, i) => ({
      moneyness: spotPrice / k,
      premium: impliedVols[i] - impliedVols[Math.floor(strikes.length / 2)]
    }));
  }

  // 方差互换定价
  function varianceSwapPayoff(realizedVariance: number, strikeVariance: number, notional: number): number {
    return notional * (realizedVariance - strikeVariance);
  }

  // 波动率期限结构斜率
  function volTermSlope(shortVol: number, longVol: number, shortDays: number, longDays: number): number {
    if (longDays === shortDays) return 0;
    return (longVol - shortVol) / ((longDays - shortDays) / 365);
  }

  // 波动率风险溢价历史均值回归
  function volPremiumMeanReversion(currentPremium: number, historicalMean: number, halflife: number): number {
    const speed = Math.log(2) / halflife;
    return historicalMean + (currentPremium - historicalMean) * Math.exp(-speed);
  }

  // Gamma暴露与波动率溢价关系
  function gammaExposure(optionGamma: number, spotPrice: number, portfolioDelta: number): number {
    return optionGamma * spotPrice ** 2 * 0.01 * (portfolioDelta > 0 ? -1 : 1);
  }

  // VIX类指数隐含波动率与实现波动率的历史溢价
  function historicalVRP(impliedVols: number[], realizedVols: number[]): { mean: number; std: number; ratio: number } {
    if (impliedVols.length === 0) return { mean: 0, std: 0, ratio: 0 };
    const premiums = impliedVols.map((iv, i) => iv - realizedVols[i]);
    const mean = premiums.reduce((s, p) => s + p, 0) / premiums.length;
    const variance = premiums.reduce((s, p) => s + (p - mean) ** 2, 0) / premiums.length;
    const meanImplied = impliedVols.reduce((s, v) => s + v, 0) / impliedVols.length;
    return { mean, std: Math.sqrt(variance), ratio: mean / (meanImplied || 1) };
  }

  it('计算波动率风险溢价', () => {
    const premium = volRiskPremium(0.25, 0.18);
    expect(premium).toBeCloseTo(0.389, 1);
  });

  it('实现波动率等于隐含波动率时溢价为零', () => {
    expect(volRiskPremium(0.20, 0.20)).toBe(0);
  });

  it('零实现波动率返回零', () => {
    expect(volRiskPremium(0.25, 0)).toBe(0);
  });

  it('波动率曲面溢价计算', () => {
    const strikes = [90, 95, 100, 105, 110];
    const ivs = [0.28, 0.25, 0.22, 0.24, 0.27];
    const result = volSurfacePremium(strikes, ivs, 100);
    expect(result).toHaveLength(5);
    expect(result[2].premium).toBe(0); // ATM为基准
    expect(result[0].premium).toBeGreaterThan(0); // ITM put波动率偏高
  });

  it('方差互换买方获利当实现方差高于约定方差', () => {
    const payoff = varianceSwapPayoff(0.04, 0.03, 1000000);
    expect(payoff).toBeCloseTo(10000, 0);
  });

  it('方差互换卖方获利当实现方差低于约定方差', () => {
    const payoff = varianceSwapPayoff(0.02, 0.03, 1000000);
    expect(payoff).toBeCloseTo(-10000, 0);
  });

  it('波动率期限结构斜率', () => {
    const slope = volTermSlope(0.20, 0.25, 30, 90);
    expect(slope).toBeGreaterThan(0); // Contango
  });

  it('波动率风险溢价均值回归预测', () => {
    const current = 0.08;
    const historicalMean = 0.03;
    const result = volPremiumMeanReversion(current, historicalMean, 30);
    expect(result).toBeLessThan(current);
    expect(result).toBeGreaterThan(historicalMean);
  });

  it('高半衰期回归速度慢', () => {
    const fast = volPremiumMeanReversion(0.08, 0.03, 10);
    const slow = volPremiumMeanReversion(0.08, 0.03, 100);
    expect(Math.abs(fast - 0.03)).toBeLessThan(Math.abs(slow - 0.03));
  });

  it('Gamma暴露计算', () => {
    const exposure = gammaExposure(0.05, 100, 100);
    expect(exposure).toBeLessThan(0); // 做多Gamma为负暴露
  });

  it('历史波动率风险溢价统计', () => {
    const ivs = [0.22, 0.25, 0.23, 0.28, 0.24];
    const rvs = [0.18, 0.20, 0.19, 0.22, 0.20];
    const stats = historicalVRP(ivs, rvs);
    expect(stats.mean).toBeGreaterThan(0);
    expect(stats.std).toBeGreaterThan(0);
    expect(stats.ratio).toBeGreaterThan(0);
  });

  it('空输入返回零值', () => {
    const stats = historicalVRP([], []);
    expect(stats.mean).toBe(0);
    expect(stats.std).toBe(0);
  });
});
