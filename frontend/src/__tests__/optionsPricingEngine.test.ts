import { describe, it, expect } from 'vitest';

// 期权定价引擎测试
describe('期权定价引擎', () => {
  // 标准正态分布累积函数近似
  function normalCDF(x: number): number {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
    const p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1.0 + sign * y);
  }

  // Black-Scholes 定价
  function blackScholes(S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put'): number {
    if (T <= 0) return type === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    if (type === 'call') {
      return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
    }
    return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
  }

  // Greeks
  function delta(S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put'): number {
    if (T <= 0) return type === 'call' ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    return type === 'call' ? normalCDF(d1) : normalCDF(d1) - 1;
  }

  function gamma(S: number, K: number, T: number, r: number, sigma: number): number {
    if (T <= 0) return 0;
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    return Math.exp(-d1 * d1 / 2) / (S * sigma * Math.sqrt(T) * Math.sqrt(2 * Math.PI));
  }

  function theta(S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put'): number {
    if (T <= 0) return 0;
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    const common = -(S * Math.exp(-d1 * d1 / 2) * sigma) / (2 * Math.sqrt(T) * Math.sqrt(2 * Math.PI));
    if (type === 'call') {
      return (common - r * K * Math.exp(-r * T) * normalCDF(d2)) / 365;
    }
    return (common + r * K * Math.exp(-r * T) * normalCDF(-d2)) / 365;
  }

  function vega(S: number, K: number, T: number, r: number, sigma: number): number {
    if (T <= 0) return 0;
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    return (S * Math.sqrt(T) * Math.exp(-d1 * d1 / 2)) / (100 * Math.sqrt(2 * Math.PI));
  }

  describe('Black-Scholes定价', () => {
    it('看涨期权价格为正', () => {
      expect(blackScholes(100, 100, 1, 0.05, 0.2, 'call')).toBeGreaterThan(0);
    });

    it('看跌期权价格为正', () => {
      expect(blackScholes(100, 100, 1, 0.05, 0.2, 'put')).toBeGreaterThan(0);
    });

    it('深度实值看涨接近内在价值', () => {
      const call = blackScholes(200, 100, 1, 0.05, 0.2, 'call');
      expect(call).toBeGreaterThan(90);
    });

    it('深度虚值看涨趋近零', () => {
      const call = blackScholes(50, 100, 0.01, 0.05, 0.2, 'call');
      expect(call).toBeLessThan(0.1);
    });

    it('到期时看涨等于max(S-K,0)', () => {
      expect(blackScholes(110, 100, 0, 0.05, 0.2, 'call')).toBe(10);
      expect(blackScholes(90, 100, 0, 0.05, 0.2, 'call')).toBe(0);
    });

    it('到期时看跌等于max(K-S,0)', () => {
      expect(blackScholes(90, 100, 0, 0.05, 0.2, 'put')).toBe(10);
      expect(blackScholes(110, 100, 0, 0.05, 0.2, 'put')).toBe(0);
    });

    it('平价看涨看跌满足看涨看跌平价', () => {
      const call = blackScholes(100, 100, 1, 0.05, 0.2, 'call');
      const put = blackScholes(100, 100, 1, 0.05, 0.2, 'put');
      const pvK = 100 * Math.exp(-0.05 * 1);
      expect(call - put).toBeCloseTo(100 - pvK, 1);
    });

    it('波动率增加看涨价格增加', () => {
      const low = blackScholes(100, 100, 1, 0.05, 0.1, 'call');
      const high = blackScholes(100, 100, 1, 0.05, 0.4, 'call');
      expect(high).toBeGreaterThan(low);
    });

    it('波动率增加看跌价格增加', () => {
      const low = blackScholes(100, 100, 1, 0.05, 0.1, 'put');
      const high = blackScholes(100, 100, 1, 0.05, 0.4, 'put');
      expect(high).toBeGreaterThan(low);
    });
  });

  describe('Delta', () => {
    it('看涨Delta在0-1之间', () => {
      const d = delta(100, 100, 1, 0.05, 0.2, 'call');
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(1);
    });

    it('看跌Delta在-1到0之间', () => {
      const d = delta(100, 100, 1, 0.05, 0.2, 'put');
      expect(d).toBeGreaterThan(-1);
      expect(d).toBeLessThan(0);
    });

    it('深度实值看涨Delta接近1', () => {
      expect(delta(200, 100, 1, 0.05, 0.2, 'call')).toBeGreaterThan(0.9);
    });

    it('深度虚值看涨Delta接近0', () => {
      expect(delta(50, 100, 1, 0.05, 0.2, 'call')).toBeLessThan(0.1);
    });

    it('到期实值Delta为1', () => {
      expect(delta(110, 100, 0, 0.05, 0.2, 'call')).toBe(1);
    });

    it('到期虚值Delta为0', () => {
      expect(delta(90, 100, 0, 0.05, 0.2, 'call')).toBe(0);
    });
  });

  describe('Gamma', () => {
    it('Gamma为正', () => {
      expect(gamma(100, 100, 1, 0.05, 0.2)).toBeGreaterThan(0);
    });

    it('平价Gamma最大', () => {
      const atm = gamma(100, 100, 1, 0.05, 0.2);
      const otm = gamma(80, 100, 1, 0.05, 0.2);
      expect(atm).toBeGreaterThan(otm);
    });

    it('到期Gamma趋近无穷或零', () => {
      expect(gamma(100, 100, 0, 0.05, 0.2)).toBe(0);
    });
  });

  describe('Vega', () => {
    it('Vega为正', () => {
      expect(vega(100, 100, 1, 0.05, 0.2)).toBeGreaterThan(0);
    });

    it('平价Vega最大', () => {
      const atm = vega(100, 100, 1, 0.05, 0.2);
      const otm = vega(80, 100, 1, 0.05, 0.2);
      expect(atm).toBeGreaterThan(otm);
    });

    it('到期Vega为零', () => {
      expect(vega(100, 100, 0, 0.05, 0.2)).toBe(0);
    });
  });

  describe('Theta', () => {
    it('看涨平价Theta为负', () => {
      expect(theta(100, 100, 1, 0.05, 0.2, 'call')).toBeLessThan(0);
    });

    it('到期Theta为零', () => {
      expect(theta(100, 100, 0, 0.05, 0.2, 'call')).toBe(0);
    });
  });

  describe('隐含波动率', () => {
    function impliedVolatility(marketPrice: number, S: number, K: number, T: number, r: number, type: 'call' | 'put', tolerance = 0.0001, maxIter = 100): number {
      let low = 0.001, high = 5;
      for (let i = 0; i < maxIter; i++) {
        const mid = (low + high) / 2;
        const price = blackScholes(S, K, T, r, mid, type);
        if (Math.abs(price - marketPrice) < tolerance) return mid;
        if (price > marketPrice) high = mid;
        else low = mid;
      }
      return (low + high) / 2;
    }

    it('隐含波动率接近原始波动率', () => {
      const sigma = 0.25;
      const price = blackScholes(100, 100, 1, 0.05, sigma, 'call');
      const iv = impliedVolatility(price, 100, 100, 1, 0.05, 'call');
      expect(iv).toBeCloseTo(sigma, 2);
    });

    it('隐含波动率为正', () => {
      const price = blackScholes(100, 100, 1, 0.05, 0.3, 'put');
      const iv = impliedVolatility(price, 100, 100, 1, 0.05, 'put');
      expect(iv).toBeGreaterThan(0);
    });
  });
});
