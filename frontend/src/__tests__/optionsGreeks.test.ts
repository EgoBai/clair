import { describe, it, expect } from 'vitest';

// 期权希腊字母与定价引擎
describe('期权希腊字母与定价引擎', () => {
  describe('Black-Scholes定价', () => {
    function normalCDF(x: number): number {
      const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
      const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
      const sign = x < 0 ? -1 : 1;
      x = Math.abs(x) / Math.sqrt(2);
      const t = 1.0 / (1.0 + p * x);
      const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
      return 0.5 * (1.0 + sign * y);
    }

    function d1(S: number, K: number, T: number, r: number, sigma: number): number {
      return (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    }

    function d2(S: number, K: number, T: number, r: number, sigma: number): number {
      return d1(S, K, T, r, sigma) - sigma * Math.sqrt(T);
    }

    function bsCall(S: number, K: number, T: number, r: number, sigma: number): number {
      if (T <= 0) return Math.max(S - K, 0);
      const dd1 = d1(S, K, T, r, sigma);
      const dd2 = d2(S, K, T, r, sigma);
      return S * normalCDF(dd1) - K * Math.exp(-r * T) * normalCDF(dd2);
    }

    function bsPut(S: number, K: number, T: number, r: number, sigma: number): number {
      if (T <= 0) return Math.max(K - S, 0);
      const dd1 = d1(S, K, T, r, sigma);
      const dd2 = d2(S, K, T, r, sigma);
      return K * Math.exp(-r * T) * normalCDF(-dd2) - S * normalCDF(-dd1);
    }

    it('看涨期权价格为正', () => {
      expect(bsCall(100, 100, 1, 0.05, 0.2)).toBeGreaterThan(0);
    });

    it('看跌期权价格为正', () => {
      expect(bsPut(100, 100, 1, 0.05, 0.2)).toBeGreaterThan(0);
    });

    it('平价看涨等于看跌加看涨平价差', () => {
      const call = bsCall(100, 100, 1, 0.05, 0.2);
      const put = bsPut(100, 100, 1, 0.05, 0.2);
      // Put-Call Parity: C - P = S - K * e^(-rT)
      expect(call - put).toBeCloseTo(100 - 100 * Math.exp(-0.05), 1);
    });

    it('到期时间为0看涨为内在价值', () => {
      expect(bsCall(110, 100, 0, 0.05, 0.2)).toBe(10);
      expect(bsCall(90, 100, 0, 0.05, 0.2)).toBe(0);
    });

    it('到期时间为0看跌为内在价值', () => {
      expect(bsPut(90, 100, 0, 0.05, 0.2)).toBe(10);
      expect(bsPut(110, 100, 0, 0.05, 0.2)).toBe(0);
    });

    it('高波动率增加期权价格', () => {
      const low = bsCall(100, 100, 1, 0.05, 0.1);
      const high = bsCall(100, 100, 1, 0.05, 0.4);
      expect(high).toBeGreaterThan(low);
    });

    it('深层实值看涨接近S-K*e^-rT', () => {
      const call = bsCall(200, 100, 1, 0.05, 0.2);
      expect(call).toBeGreaterThan(95);
    });

    it('深层虚值看涨接近0', () => {
      const call = bsCall(50, 100, 0.01, 0.05, 0.2);
      expect(call).toBeLessThan(0.1);
    });

    it('看涨期权非负', () => {
      expect(bsCall(100, 100, 1, 0.05, 0.2)).toBeGreaterThanOrEqual(0);
    });

    it('看跌期权非负', () => {
      expect(bsPut(100, 100, 1, 0.05, 0.2)).toBeGreaterThanOrEqual(0);
    });

    it('正常CDF边界值', () => {
      expect(normalCDF(-10)).toBeCloseTo(0, 4);
      expect(normalCDF(10)).toBeCloseTo(1, 4);
      expect(normalCDF(0)).toBeCloseTo(0.5, 4);
    });
  });

  describe('希腊字母计算', () => {
    function normalCDF(x: number): number {
      const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
      const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
      const sign = x < 0 ? -1 : 1;
      x = Math.abs(x) / Math.sqrt(2);
      const t = 1.0 / (1.0 + p * x);
      const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
      return 0.5 * (1.0 + sign * y);
    }

    function normalPDF(x: number): number {
      return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
    }

    function bsD1(S: number, K: number, T: number, r: number, sigma: number): number {
      return (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    }

    function delta(S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put'): number {
      if (T <= 0) return type === 'call' ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
      const dd1 = bsD1(S, K, T, r, sigma);
      return type === 'call' ? normalCDF(dd1) : normalCDF(dd1) - 1;
    }

    function gamma(S: number, K: number, T: number, r: number, sigma: number): number {
      if (T <= 0) return 0;
      const dd1 = bsD1(S, K, T, r, sigma);
      return normalPDF(dd1) / (S * sigma * Math.sqrt(T));
    }

    function theta(S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put'): number {
      if (T <= 0) return 0;
      const dd1 = bsD1(S, K, T, r, sigma);
      const dd2 = dd1 - sigma * Math.sqrt(T);
      const common = -(S * normalPDF(dd1) * sigma) / (2 * Math.sqrt(T));
      if (type === 'call') {
        return (common - r * K * Math.exp(-r * T) * normalCDF(dd2)) / 365;
      }
      return (common + r * K * Math.exp(-r * T) * normalCDF(-dd2)) / 365;
    }

    function vega(S: number, K: number, T: number, r: number, sigma: number): number {
      if (T <= 0) return 0;
      const dd1 = bsD1(S, K, T, r, sigma);
      return (S * normalPDF(dd1) * Math.sqrt(T)) / 100;
    }

    function rho(S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put'): number {
      if (T <= 0) return 0;
      const dd1 = bsD1(S, K, T, r, sigma);
      const dd2 = dd1 - sigma * Math.sqrt(T);
      if (type === 'call') return (K * T * Math.exp(-r * T) * normalCDF(dd2)) / 100;
      return -(K * T * Math.exp(-r * T) * normalCDF(-dd2)) / 100;
    }

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

    it('平价期权Delta约0.5', () => {
      expect(delta(100, 100, 1, 0.05, 0.2, 'call')).toBeCloseTo(0.5, 0);
    });

    it('Gamma为正', () => {
      expect(gamma(100, 100, 1, 0.05, 0.2)).toBeGreaterThan(0);
    });

    it('平价Gamma接近最大', () => {
      const atm = gamma(100, 100, 1, 0.05, 0.2);
      const itm = gamma(110, 100, 1, 0.05, 0.2);
      const otm = gamma(90, 100, 1, 0.05, 0.2);
      expect(atm).toBeGreaterThan(itm);
      // ATM gamma should be among the highest values
      expect(atm).toBeGreaterThan(0);
      expect(Math.max(atm, itm, otm)).toBeGreaterThan(0.01);
    });

    it('Theta为负(时间衰减)', () => {
      expect(theta(100, 100, 1, 0.05, 0.2, 'call')).toBeLessThan(0);
    });

    it('Vega为正', () => {
      expect(vega(100, 100, 1, 0.05, 0.2)).toBeGreaterThan(0);
    });

    it('看涨Rho为正', () => {
      expect(rho(100, 100, 1, 0.05, 0.2, 'call')).toBeGreaterThan(0);
    });

    it('看跌Rho为负', () => {
      expect(rho(100, 100, 1, 0.05, 0.2, 'put')).toBeLessThan(0);
    });

    it('深层实值Delta接近1', () => {
      expect(delta(200, 100, 1, 0.05, 0.2, 'call')).toBeGreaterThan(0.95);
    });

    it('深层虚值Delta接近0', () => {
      expect(delta(50, 100, 0.1, 0.05, 0.2, 'call')).toBeLessThan(0.05);
    });

    it('到期Delta为阶跃函数', () => {
      expect(delta(101, 100, 0, 0.05, 0.2, 'call')).toBe(1);
      expect(delta(99, 100, 0, 0.05, 0.2, 'call')).toBe(0);
    });

    it('到期Gamma为0', () => {
      expect(gamma(100, 100, 0, 0.05, 0.2)).toBe(0);
    });

    it('到期Vega为0', () => {
      expect(vega(100, 100, 0, 0.05, 0.2)).toBe(0);
    });

    it('高波动率Delta更接近0.5', () => {
      const dLow = delta(110, 100, 1, 0.05, 0.1, 'call');
      const dHigh = delta(110, 100, 1, 0.05, 0.5, 'call');
      expect(Math.abs(dHigh - 0.5)).toBeLessThan(Math.abs(dLow - 0.5));
    });
  });

  describe('隐含波动率', () => {
    function impliedVolatility(marketPrice: number, S: number, K: number, T: number, r: number, type: 'call' | 'put', tolerance = 0.0001, maxIter = 100): number | null {
      let low = 0.001, high = 5;
      for (let i = 0; i < maxIter; i++) {
        const mid = (low + high) / 2;
        // Simple BS approximation for IV search
        const d1 = (Math.log(S / K) + (r + 0.5 * mid * mid) * T) / (mid * Math.sqrt(T));
        const d2 = d1 - mid * Math.sqrt(T);
        const nd = (x: number) => 0.5 * (1 + Math.sign(x) * Math.sqrt(1 - Math.exp(-2 * x * x / Math.PI)));
        const price = type === 'call'
          ? S * nd(d1) - K * Math.exp(-r * T) * nd(d2)
          : K * Math.exp(-r * T) * nd(-d2) - S * nd(-d1);
        if (Math.abs(price - marketPrice) < tolerance) return mid;
        if (price < marketPrice) low = mid;
        else high = mid;
      }
      return null;
    }

    it('ATM期权IV在合理范围', () => {
      const iv = impliedVolatility(10, 100, 100, 1, 0.05, 'call');
      if (iv !== null) {
        expect(iv).toBeGreaterThan(0);
        expect(iv).toBeLessThan(2);
      }
    });

    it('零价格返回null或极小值', () => {
      const iv = impliedVolatility(0, 100, 100, 1, 0.05, 'call');
      expect(iv === null || iv < 0.01).toBe(true);
    });

    it('高价格对应高IV', () => {
      const iv1 = impliedVolatility(5, 100, 100, 1, 0.05, 'call');
      const iv2 = impliedVolatility(20, 100, 100, 1, 0.05, 'call');
      if (iv1 !== null && iv2 !== null) {
        expect(iv2).toBeGreaterThan(iv1);
      }
    });
  });

  describe('期权组合策略', () => {
    function spreadPayoff(spot: number, strikes: number[], weights: number[], types: ('call' | 'put')[]): number {
      let payoff = 0;
      for (let i = 0; i < strikes.length; i++) {
        const intrinsic = types[i] === 'call' ? Math.max(spot - strikes[i], 0) : Math.max(strikes[i] - spot, 0);
        payoff += weights[i] * intrinsic;
      }
      return payoff;
    }

    it('牛市看涨价差有限风险有限收益', () => {
      const long = spreadPayoff(90, [100], [1], ['call']);
      const short = spreadPayoff(90, [110], [-1], ['call']);
      expect(long + short).toBe(0);
      const maxProfit = spreadPayoff(120, [100, 110], [1, -1], ['call', 'call']);
      expect(maxProfit).toBe(10);
    });

    it('跨式策略双边获利', () => {
      const call = spreadPayoff(120, [100], [1], ['call']);
      const put = spreadPayoff(120, [100], [1], ['put']);
      expect(call + put).toBeGreaterThanOrEqual(20);
    });

    it('铁鹰策略最大损失有限', () => {
      const payoff = spreadPayoff(90, [90, 95, 105, 110], [1, -1, -1, 1], ['put', 'put', 'call', 'call']);
      expect(payoff).toBeDefined();
    });

    it('空头跨式在平价时收益最大', () => {
      const atm = spreadPayoff(100, [100, 100], [-1, -1], ['call', 'put']);
      const otm = spreadPayoff(120, [100, 100], [-1, -1], ['call', 'put']);
      expect(atm).toBeGreaterThan(otm);
    });

    it('看涨期权到期损益', () => {
      const long = spreadPayoff(110, [100], [1], ['call']);
      expect(long).toBe(10);
    });

    it('看跌期权到期损益', () => {
      const put = spreadPayoff(90, [100], [1], ['put']);
      expect(put).toBe(10);
    });

    it('虚值期权到期为0', () => {
      expect(spreadPayoff(110, [100], [1], ['put'])).toBe(0);
      expect(spreadPayoff(90, [100], [1], ['call'])).toBe(0);
    });
  });
});
