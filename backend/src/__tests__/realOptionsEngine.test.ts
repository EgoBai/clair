import { describe, it, expect } from 'vitest';

describe('实物期权估值引擎 (Real Options Valuation)', () => {
  // Black-Scholes 实物期权
  function blackScholesCall(S: number, K: number, T: number, r: number, sigma: number): number {
    if (T <= 0) return Math.max(S - K, 0);
    const d1 = (Math.log(S / K) + (r + sigma ** 2 / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    const cdf = (x: number) => 0.5 * (1 + erf(x / Math.sqrt(2)));
    return S * cdf(d1) - K * Math.exp(-r * T) * cdf(d2);
  }

  function erf(x: number): number {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
  }

  // 扩张期权
  function expansionOption(baseValue: number, expansionCost: number, volatility: number, timeYears: number, riskFreeRate: number): number {
    return blackScholesCall(baseValue, expansionCost, timeYears, riskFreeRate, volatility);
  }

  // 放弃期权 (Put)
  function abandonmentOption(assetValue: number, salvageValue: number, volatility: number, timeYears: number, riskFreeRate: number): number {
    const K = salvageValue;
    if (timeYears <= 0) return Math.max(K - assetValue, 0);
    const d1 = (Math.log(assetValue / K) + (riskFreeRate + volatility ** 2 / 2) * timeYears) / (volatility * Math.sqrt(timeYears));
    const d2 = d1 - volatility * Math.sqrt(timeYears);
    const cdf = (x: number) => 0.5 * (1 + erf(x / Math.sqrt(2)));
    return K * Math.exp(-riskFreeRate * timeYears) * cdf(-d2) - assetValue * cdf(-d1);
  }

  // 延期期权
  function deferralOption(projectValue: number, investmentCost: number, maxDelay: number, volatility: number, riskFreeRate: number): number {
    const optionValue = blackScholesCall(projectValue, investmentCost, maxDelay, riskFreeRate, volatility);
    return Math.max(optionValue - projectValue + investmentCost, 0);
  }

  // 分阶段投资期权
  function stagedInvestmentOption(stages: { cost: number; value: number; time: number }[], volatility: number, riskFreeRate: number): number {
    let totalOptionValue = 0;
    for (const stage of stages) {
      totalOptionValue += blackScholesCall(stage.value, stage.cost, stage.time, riskFreeRate, volatility);
    }
    return totalOptionValue;
  }

  // 项目总价值 (NPV + 期权价值)
  function projectTotalValue(npv: number, optionValues: number[]): number {
    return npv + optionValues.reduce((sum, v) => sum + v, 0);
  }

  it('计算基础Black-Scholes看涨期权', () => {
    const result = blackScholesCall(100, 100, 1, 0.05, 0.2);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeCloseTo(10.45, 0);
  });

  it('深度实值期权接近内在价值', () => {
    const result = blackScholesCall(200, 100, 1, 0.05, 0.2);
    expect(result).toBeGreaterThan(95);
  });

  it('虚值期权价值较小', () => {
    const result = blackScholesCall(50, 100, 1, 0.05, 0.2);
    expect(result).toBeLessThan(2);
  });

  it('计算扩张期权价值', () => {
    const expValue = expansionOption(500, 300, 0.3, 2, 0.05);
    expect(expValue).toBeGreaterThan(0);
    expect(expValue).toBeLessThan(500);
  });

  it('高波动率增加实物期权价值', () => {
    const low = expansionOption(500, 300, 0.1, 2, 0.05);
    const high = expansionOption(500, 300, 0.5, 2, 0.05);
    expect(high).toBeGreaterThan(low);
  });

  it('计算放弃期权价值', () => {
    const putValue = abandonmentOption(80, 100, 0.3, 1, 0.05);
    expect(putValue).toBeGreaterThan(0);
  });

  it('资产价值高于残值时期权价值低', () => {
    const highAsset = abandonmentOption(150, 100, 0.3, 1, 0.05);
    const lowAsset = abandonmentOption(80, 100, 0.3, 1, 0.05);
    expect(lowAsset).toBeGreaterThan(highAsset);
  });

  it('计算延期期权价值', () => {
    const defValue = deferralOption(200, 180, 3, 0.25, 0.05);
    expect(defValue).toBeGreaterThan(0);
  });

  it('分阶段投资期权累加', () => {
    const stages = [
      { cost: 100, value: 120, time: 1 },
      { cost: 150, value: 200, time: 2 },
      { cost: 200, value: 300, time: 3 },
    ];
    const result = stagedInvestmentOption(stages, 0.3, 0.05);
    expect(result).toBeGreaterThan(0);
  });

  it('单阶段与分阶段对比', () => {
    const single = stagedInvestmentOption([{ cost: 100, value: 200, time: 1 }], 0.3, 0.05);
    expect(single).toBeGreaterThan(0);
  });

  it('计算项目总价值', () => {
    const npv = -50;
    const options = [30, 20, 15];
    const total = projectTotalValue(npv, options);
    expect(total).toBe(15);
  });

  it('期权价值可拯救负NPV项目', () => {
    const npv = -100;
    const options = [60, 50, 30];
    const total = projectTotalValue(npv, options);
    expect(total).toBe(40);
  });

  it('到期时间为零期权价值为max(S-K,0)', () => {
    expect(blackScholesCall(120, 100, 0, 0.05, 0.2)).toBe(20);
    expect(blackScholesCall(80, 100, 0, 0.05, 0.2)).toBe(0);
  });

  it('时间越长期权价值越高', () => {
    const short = blackScholesCall(100, 100, 0.5, 0.05, 0.2);
    const long = blackScholesCall(100, 100, 2, 0.05, 0.2);
    expect(long).toBeGreaterThan(short);
  });
});
