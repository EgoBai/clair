import { describe, it, expect } from 'vitest';

// ===== 期权定价基础测试 =====
describe('Option Pricing', () => {
  const normCDF = (x: number): number => {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * y);
  };

  const blackScholes = (S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put') => {
    if (T <= 0 || sigma <= 0) return { price: 0, delta: 0, gamma: 0, theta: 0, vega: 0 };
    const d1 = (Math.log(S / K) + (r + sigma ** 2 / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    let price: number, delta: number;
    if (type === 'call') {
      price = S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
      delta = normCDF(d1);
    } else {
      price = K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
      delta = normCDF(d1) - 1;
    }
    const gamma = Math.exp(-d1 * d1 / 2) / (S * sigma * Math.sqrt(T) * Math.sqrt(2 * Math.PI));
    const vega = S * Math.sqrt(T) * Math.exp(-d1 * d1 / 2) / Math.sqrt(2 * Math.PI) / 100;
    return { price: Math.max(0, price), delta, gamma, theta: 0, vega };
  };

  const calcImpliedVol = (marketPrice: number, S: number, K: number, T: number, r: number, type: 'call' | 'put'): number => {
    let low = 0.01, high = 5;
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2;
      const { price } = blackScholes(S, K, T, r, mid, type);
      if (price < marketPrice) low = mid; else high = mid;
    }
    return (low + high) / 2;
  };

  it('应该计算看涨期权价格', () => {
    const { price } = blackScholes(100, 100, 1, 0.05, 0.2, 'call');
    expect(price).toBeGreaterThan(0);
    expect(price).toBeLessThan(100);
  });

  it('应该计算看跌期权价格', () => {
    const { price } = blackScholes(100, 100, 1, 0.05, 0.2, 'put');
    expect(price).toBeGreaterThan(0);
  });

  it('应该满足看涨看跌平价关系', () => {
    const call = blackScholes(100, 100, 1, 0.05, 0.2, 'call');
    const put = blackScholes(100, 100, 1, 0.05, 0.2, 'put');
    // C - P = S - K * e^(-rT)
    const parity = call.price - put.price;
    const expected = 100 - 100 * Math.exp(-0.05);
    expect(parity).toBeCloseTo(expected, 1);
  });

  it('应该计算Delta', () => {
    const { delta } = blackScholes(100, 100, 1, 0.05, 0.2, 'call');
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThan(1);
  });

  it('看跌Delta应该为负', () => {
    const { delta } = blackScholes(100, 100, 1, 0.05, 0.2, 'put');
    expect(delta).toBeLessThan(0);
    expect(delta).toBeGreaterThan(-1);
  });

  it('应该计算Gamma', () => {
    const { gamma } = blackScholes(100, 100, 1, 0.05, 0.2, 'call');
    expect(gamma).toBeGreaterThan(0);
  });

  it('应该计算Vega', () => {
    const { vega } = blackScholes(100, 100, 1, 0.05, 0.2, 'call');
    expect(vega).toBeGreaterThan(0);
  });

  it('深度实值看涨接近内在价值', () => {
    const { price } = blackScholes(200, 100, 0.01, 0.05, 0.2, 'call');
    expect(price).toBeCloseTo(100, 0);
  });

  it('深度虚值看涨接近零', () => {
    const { price } = blackScholes(50, 100, 0.01, 0.05, 0.2, 'call');
    expect(price).toBeLessThan(1);
  });

  it('零到期时间返回零', () => {
    const { price } = blackScholes(100, 100, 0, 0.05, 0.2, 'call');
    expect(price).toBe(0);
  });

  it('应该反算隐含波动率', () => {
    const targetSigma = 0.3;
    const { price } = blackScholes(100, 100, 1, 0.05, targetSigma, 'call');
    const iv = calcImpliedVol(price, 100, 100, 1, 0.05, 'call');
    expect(iv).toBeCloseTo(targetSigma, 2);
  });
});

// ===== 期权希腊字母 =====
describe('Option Greeks', () => {
  const normPDF = (x: number): number => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);

  const calcGreeks = (S: number, K: number, T: number, r: number, sigma: number) => {
    if (T <= 0 || sigma <= 0) return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
    const d1 = (Math.log(S / K) + (r + sigma ** 2 / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    const nd1 = normPDF(d1);
    const normCDF = (x: number): number => {
      const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
      const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
      const sign = x < 0 ? -1 : 1;
      x = Math.abs(x) / Math.sqrt(2);
      const t = 1 / (1 + p * x);
      const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
      return 0.5 * (1 + sign * y);
    };
    const delta = normCDF(d1);
    const gamma = nd1 / (S * sigma * Math.sqrt(T));
    const theta = -(S * nd1 * sigma) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * normCDF(d2);
    const vega = S * nd1 * Math.sqrt(T);
    const rho = K * T * Math.exp(-r * T) * normCDF(d2);
    return { delta, gamma, theta: theta / 365, vega: vega / 100, rho: rho / 100 };
  };

  it('应该计算所有希腊字母', () => {
    const greeks = calcGreeks(100, 100, 0.5, 0.05, 0.25);
    expect(greeks.delta).toBeGreaterThan(0);
    expect(greeks.gamma).toBeGreaterThan(0);
    expect(greeks.vega).toBeGreaterThan(0);
  });

  it('Gamma在平值时最大', () => {
    const atm = calcGreeks(100, 100, 0.5, 0.05, 0.25);
    const itm = calcGreeks(120, 100, 0.5, 0.05, 0.25);
    expect(atm.gamma).toBeGreaterThan(itm.gamma);
  });

  it('Vega随波动率增加', () => {
    const low = calcGreeks(100, 100, 1, 0.05, 0.15);
    const high = calcGreeks(100, 100, 1, 0.05, 0.35);
    expect(high.vega).toBeGreaterThan(low.vega);
  });

  it('Delta接近1当深度实值', () => {
    const { delta } = calcGreeks(200, 100, 1, 0.05, 0.2);
    expect(delta).toBeGreaterThan(0.9);
  });

  it('Delta接近0当深度虚值', () => {
    const { delta } = calcGreeks(50, 100, 1, 0.05, 0.2);
    expect(delta).toBeLessThan(0.1);
  });

  it('零到期返回零希腊字母', () => {
    const greeks = calcGreeks(100, 100, 0, 0.05, 0.2);
    expect(greeks.delta).toBe(0);
    expect(greeks.gamma).toBe(0);
  });
});
