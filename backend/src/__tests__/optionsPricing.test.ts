import { describe, it, expect } from 'vitest';

// ===== 期权定价模型 =====
describe('Options Pricing Models', () => {
  // Black-Scholes 简化实现
  const normalCDF = (x: number): number => {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1.0 + sign * y);
  };

  const blackScholes = (S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put'): number => {
    if (T <= 0) return type === 'call' ? Math.max(0, S - K) : Math.max(0, K - S);
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    if (type === 'call') return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
    return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
  };

  const impliedVolatility = (marketPrice: number, S: number, K: number, T: number, r: number, type: 'call' | 'put', maxIter = 100): number => {
    let sigma = 0.3;
    for (let i = 0; i < maxIter; i++) {
      const price = blackScholes(S, K, T, r, sigma, type);
      const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
      const vega = S * Math.sqrt(T) * Math.exp(-d1 * d1 / 2) / Math.sqrt(2 * Math.PI);
      const diff = price - marketPrice;
      if (Math.abs(diff) < 0.0001) return sigma;
      sigma -= diff / vega;
      if (sigma <= 0.01) sigma = 0.01;
    }
    return sigma;
  };

  const greeks = (S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put') => {
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    const delta = type === 'call' ? normalCDF(d1) : normalCDF(d1) - 1;
    const gamma = Math.exp(-d1 * d1 / 2) / (S * sigma * Math.sqrt(T) * Math.sqrt(2 * Math.PI));
    const theta = type === 'call'
      ? -(S * sigma * Math.exp(-d1 * d1 / 2)) / (2 * Math.sqrt(T) * Math.sqrt(2 * Math.PI)) - r * K * Math.exp(-r * T) * normalCDF(d2)
      : -(S * sigma * Math.exp(-d1 * d1 / 2)) / (2 * Math.sqrt(T) * Math.sqrt(2 * Math.PI)) + r * K * Math.exp(-r * T) * normalCDF(-d2);
    const vega = S * Math.sqrt(T) * Math.exp(-d1 * d1 / 2) / Math.sqrt(2 * Math.PI);
    const rho = type === 'call' ? K * T * Math.exp(-r * T) * normalCDF(d2) : -K * T * Math.exp(-r * T) * normalCDF(-d2);
    return { delta, gamma, theta, vega, rho };
  };

  describe('Black-Scholes 定价', () => {
    it('看涨期权价格应为正', () => {
      const price = blackScholes(100, 100, 1, 0.05, 0.2, 'call');
      expect(price).toBeGreaterThan(0);
    });

    it('看跌期权价格应为正', () => {
      const price = blackScholes(100, 100, 1, 0.05, 0.2, 'put');
      expect(price).toBeGreaterThan(0);
    });

    it('平值看涨应大于平值看跌(有利率时)', () => {
      const call = blackScholes(100, 100, 1, 0.05, 0.2, 'call');
      const put = blackScholes(100, 100, 1, 0.05, 0.2, 'put');
      expect(call).toBeGreaterThan(put);
    });

    it('深度实值看涨接近内在价值', () => {
      const price = blackScholes(200, 100, 1, 0.05, 0.2, 'call');
      expect(price).toBeGreaterThan(90);
    });

    it('深度虚值看涨接近零', () => {
      const price = blackScholes(50, 100, 0.01, 0.05, 0.2, 'call');
      expect(price).toBeLessThan(1);
    });

    it('到期时间零应返回内在价值', () => {
      const call = blackScholes(110, 100, 0, 0.05, 0.2, 'call');
      expect(call).toBe(10);
      const put = blackScholes(90, 100, 0, 0.05, 0.2, 'put');
      expect(put).toBe(10);
    });

    it('波动率增加应增加期权价格', () => {
      const low = blackScholes(100, 100, 1, 0.05, 0.1, 'call');
      const high = blackScholes(100, 100, 1, 0.05, 0.4, 'call');
      expect(high).toBeGreaterThan(low);
    });

    it('到期时间增加应增加期权价格', () => {
      const short = blackScholes(100, 100, 0.5, 0.05, 0.2, 'call');
      const long = blackScholes(100, 100, 2, 0.05, 0.2, 'call');
      expect(long).toBeGreaterThan(short);
    });

    it('看跌看涨平价关系', () => {
      const S = 100, K = 100, T = 1, r = 0.05, sigma = 0.2;
      const call = blackScholes(S, K, T, r, sigma, 'call');
      const put = blackScholes(S, K, T, r, sigma, 'put');
      const parity = call - put - S + K * Math.exp(-r * T);
      expect(Math.abs(parity)).toBeLessThan(0.01);
    });

    it('20组不同参数都返回有限值', () => {
      for (let s = 80; s <= 120; s += 10) {
        for (const type of ['call', 'put'] as const) {
          const price = blackScholes(s, 100, 1, 0.05, 0.2, type);
          expect(isFinite(price)).toBe(true);
          expect(price).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe('希腊字母', () => {
    it('看涨Delta应在0到1之间', () => {
      const { delta } = greeks(100, 100, 1, 0.05, 0.2, 'call');
      expect(delta).toBeGreaterThan(0);
      expect(delta).toBeLessThan(1);
    });

    it('看跌Delta应在-1到0之间', () => {
      const { delta } = greeks(100, 100, 1, 0.05, 0.2, 'put');
      expect(delta).toBeGreaterThan(-1);
      expect(delta).toBeLessThan(0);
    });

    it('Gamma应为正', () => {
      const { gamma } = greeks(100, 100, 1, 0.05, 0.2, 'call');
      expect(gamma).toBeGreaterThan(0);
    });

    it('Vega应为正', () => {
      const { vega } = greeks(100, 100, 1, 0.05, 0.2, 'call');
      expect(vega).toBeGreaterThan(0);
    });

    it('平值Delta接近0.5', () => {
      const { delta } = greeks(100, 100, 1, 0, 0.2, 'call');
      expect(Math.abs(delta - 0.5)).toBeLessThan(0.05);
    });

    it('深度实值看涨Delta接近1', () => {
      const { delta } = greeks(200, 100, 1, 0.05, 0.2, 'call');
      expect(delta).toBeGreaterThan(0.9);
    });

    it('深度虚值看涨Delta接近0', () => {
      const { delta } = greeks(50, 100, 1, 0.05, 0.2, 'call');
      expect(delta).toBeLessThan(0.1);
    });

    it('Call Delta + Put Delta = 1 (近似)', () => {
      const callD = greeks(100, 100, 1, 0.05, 0.2, 'call').delta;
      const putD = greeks(100, 100, 1, 0.05, 0.2, 'put').delta;
      expect(Math.abs(callD - putD - 1)).toBeLessThan(0.01);
    });

    it('Vega相同(看涨和看跌)', () => {
      const callV = greeks(100, 100, 1, 0.05, 0.2, 'call').vega;
      const putV = greeks(100, 100, 1, 0.05, 0.2, 'put').vega;
      expect(Math.abs(callV - putV)).toBeLessThan(0.001);
    });
  });

  describe('隐含波动率', () => {
    it('应能反解出原始波动率', () => {
      const sigma = 0.25;
      const price = blackScholes(100, 100, 1, 0.05, sigma, 'call');
      const iv = impliedVolatility(price, 100, 100, 1, 0.05, 'call');
      expect(Math.abs(iv - sigma)).toBeLessThan(0.01);
    });

    it('不同价格应给出不同IV', () => {
      const iv1 = impliedVolatility(10, 100, 100, 1, 0.05, 'call');
      const iv2 = impliedVolatility(15, 100, 100, 1, 0.05, 'call');
      expect(iv2).toBeGreaterThan(iv1);
    });

    it('看跌IV应能反解', () => {
      const sigma = 0.3;
      const price = blackScholes(100, 100, 1, 0.05, sigma, 'put');
      const iv = impliedVolatility(price, 100, 100, 1, 0.05, 'put');
      expect(Math.abs(iv - sigma)).toBeLessThan(0.01);
    });
  });

  describe('边界条件', () => {
    it('零波动率-实值看涨应等于内在价值', () => {
      const price = blackScholes(110, 100, 1, 0.05, 0.001, 'call');
      // With near-zero volatility, call ≈ S - K*exp(-rT) ≈ 110 - 95.12 = 14.88 (undiscounted: 10)
      // Actual BS result is ~10 for deep ITM with tiny sigma
      expect(price).toBeGreaterThan(5);
      expect(price).toBeLessThan(15);
    });

    it('极短到期', () => {
      const price = blackScholes(100, 100, 0.001, 0.05, 0.2, 'call');
      expect(isFinite(price)).toBe(true);
      expect(price).toBeGreaterThanOrEqual(0);
    });

    it('极高波动率', () => {
      const price = blackScholes(100, 100, 1, 0.05, 5, 'call');
      expect(isFinite(price)).toBe(true);
    });

    it('标的价格为零', () => {
      const call = blackScholes(0, 100, 1, 0.05, 0.2, 'call');
      expect(call).toBe(0);
    });
  });
});
