import { describe, it, expect } from 'vitest';

// 高级金融衍生品定价引擎测试
describe('衍生品定价引擎', () => {
  // Black-Scholes 欧式期权定价
  function normalCDF(x: number): number {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1.0 + sign * y);
  }

  function bsCall(S: number, K: number, T: number, r: number, sigma: number): number {
    if (T <= 0) return Math.max(S - K, 0);
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
  }

  function bsPut(S: number, K: number, T: number, r: number, sigma: number): number {
    if (T <= 0) return Math.max(K - S, 0);
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
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
    return Math.exp(-d1 * d1 / 2) / (Math.sqrt(2 * Math.PI) * S * sigma * Math.sqrt(T));
  }

  function vega(S: number, K: number, T: number, r: number, sigma: number): number {
    if (T <= 0) return 0;
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    return S * Math.sqrt(T) * Math.exp(-d1 * d1 / 2) / Math.sqrt(2 * Math.PI) / 100;
  }

  function theta(S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put'): number {
    if (T <= 0) return 0;
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    const common = -(S * Math.exp(-d1 * d1 / 2) * sigma) / (2 * Math.sqrt(2 * Math.PI * T));
    if (type === 'call') {
      return (common - r * K * Math.exp(-r * T) * normalCDF(d2)) / 365;
    }
    return (common + r * K * Math.exp(-r * T) * normalCDF(-d2)) / 365;
  }

  // 隐含波动率 (Newton-Raphson)
  function impliedVol(targetPrice: number, S: number, K: number, T: number, r: number, type: 'call' | 'put'): number {
    let sigma = 0.3;
    for (let i = 0; i < 100; i++) {
      const price = type === 'call' ? bsCall(S, K, T, r, sigma) : bsPut(S, K, T, r, sigma);
      const v = vega(S, K, T, r, sigma) * 100;
      if (v < 1e-10) break;
      const diff = price - targetPrice;
      sigma -= diff / v;
      if (Math.abs(diff) < 1e-6) break;
      sigma = Math.max(0.001, Math.min(sigma, 5));
    }
    return sigma;
  }

  // 看涨看跌平价
  function putCallParity(call: number, put: number, S: number, K: number, T: number, r: number): boolean {
    const lhs = call - put;
    const rhs = S - K * Math.exp(-r * T);
    return Math.abs(lhs - rhs) < 0.01;
  }

  // 二叉树期权定价
  function binomialTree(S: number, K: number, T: number, r: number, sigma: number, steps: number, type: 'call' | 'put'): number {
    const dt = T / steps;
    const u = Math.exp(sigma * Math.sqrt(dt));
    const d = 1 / u;
    const p = (Math.exp(r * dt) - d) / (u - d);
    const disc = Math.exp(-r * dt);

    const prices: number[] = [];
    for (let i = 0; i <= steps; i++) {
      prices[i] = S * Math.pow(u, steps - i) * Math.pow(d, i);
    }

    let values = prices.map(p => type === 'call' ? Math.max(p - K, 0) : Math.max(K - p, 0));

    for (let step = steps - 1; step >= 0; step--) {
      const newValues: number[] = [];
      for (let i = 0; i <= step; i++) {
        newValues[i] = disc * (p * values[i] + (1 - p) * values[i + 1]);
      }
      values = newValues;
    }
    return values[0];
  }

  describe('Black-Scholes看涨期权', () => {
    it('ATM期权价格为正', () => {
      const price = bsCall(100, 100, 1, 0.05, 0.2);
      expect(price).toBeGreaterThan(0);
      expect(price).toBeLessThan(20);
    });

    it('深度ITM看涨 ≈ S - K*exp(-rT)', () => {
      const price = bsCall(200, 100, 1, 0.05, 0.2);
      const intrinsic = 200 - 100 * Math.exp(-0.05);
      expect(price).toBeCloseTo(intrinsic, 0);
    });

    it('深度OTM看涨 ≈ 0', () => {
      const price = bsCall(50, 100, 1, 0.05, 0.2);
      expect(price).toBeLessThan(0.01);
    });

    it('到期日为内含价值', () => {
      expect(bsCall(110, 100, 0, 0.05, 0.2)).toBe(10);
      expect(bsCall(90, 100, 0, 0.05, 0.2)).toBe(0);
    });

    it('波动率越高价格越高', () => {
      const p1 = bsCall(100, 100, 1, 0.05, 0.1);
      const p2 = bsCall(100, 100, 1, 0.05, 0.5);
      expect(p2).toBeGreaterThan(p1);
    });

    it('期限越长价格越高(欧式看涨)', () => {
      const p1 = bsCall(100, 100, 0.5, 0.05, 0.2);
      const p2 = bsCall(100, 100, 2, 0.05, 0.2);
      expect(p2).toBeGreaterThan(p1);
    });
  });

  describe('Black-Scholes看跌期权', () => {
    it('ATM看跌价格为正', () => {
      const price = bsPut(100, 100, 1, 0.05, 0.2);
      expect(price).toBeGreaterThan(0);
    });

    it('深度ITM看跌 ≈ K*exp(-rT) - S', () => {
      const price = bsPut(50, 100, 1, 0.05, 0.2);
      expect(price).toBeGreaterThan(40);
    });

    it('深度OTM看跌 ≈ 0', () => {
      const price = bsPut(200, 100, 1, 0.05, 0.2);
      expect(price).toBeLessThan(0.01);
    });

    it('到期日为内含价值', () => {
      expect(bsPut(90, 100, 0, 0.05, 0.2)).toBe(10);
      expect(bsPut(110, 100, 0, 0.05, 0.2)).toBe(0);
    });
  });

  describe('看涨看跌平价', () => {
    it('满足平价关系', () => {
      const call = bsCall(100, 100, 1, 0.05, 0.2);
      const put = bsPut(100, 100, 1, 0.05, 0.2);
      expect(putCallParity(call, put, 100, 100, 1, 0.05)).toBe(true);
    });

    it('不同行权价也满足', () => {
      const call = bsCall(100, 105, 1, 0.05, 0.2);
      const put = bsPut(100, 105, 1, 0.05, 0.2);
      expect(putCallParity(call, put, 100, 105, 1, 0.05)).toBe(true);
    });
  });

  describe('Greeks', () => {
    it('看涨Delta在(0,1)', () => {
      const d = delta(100, 100, 1, 0.05, 0.2, 'call');
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(1);
      expect(d).toBeCloseTo(0.6, 1);
    });

    it('看跌Delta在(-1,0)', () => {
      const d = delta(100, 100, 1, 0.05, 0.2, 'put');
      expect(d).toBeGreaterThan(-1);
      expect(d).toBeLessThan(0);
    });

    it('Gamma为正', () => {
      const g = gamma(100, 100, 1, 0.05, 0.2);
      expect(g).toBeGreaterThan(0);
    });

    it('Vega为正', () => {
      const v = vega(100, 100, 1, 0.05, 0.2);
      expect(v).toBeGreaterThan(0);
    });

    it('Theta为负(时间衰减)', () => {
      const t = theta(100, 100, 1, 0.05, 0.2, 'call');
      expect(t).toBeLessThan(0);
    });

    it('ATM时Gamma最大', () => {
      const gATM = gamma(100, 100, 1, 0.05, 0.2);
      const gOTM = gamma(80, 100, 1, 0.05, 0.2);
      expect(gATM).toBeGreaterThan(gOTM);
    });

    it('到期Delta为阶梯函数', () => {
      expect(delta(110, 100, 0, 0.05, 0.2, 'call')).toBe(1);
      expect(delta(90, 100, 0, 0.05, 0.2, 'call')).toBe(0);
    });
  });

  describe('隐含波动率', () => {
    it('从已知波动率反推', () => {
      const sigma = 0.25;
      const price = bsCall(100, 100, 1, 0.05, sigma);
      const iv = impliedVol(price, 100, 100, 1, 0.05, 'call');
      expect(iv).toBeCloseTo(sigma, 2);
    });

    it('看跌也能反推', () => {
      const sigma = 0.3;
      const price = bsPut(100, 100, 1, 0.05, sigma);
      const iv = impliedVol(price, 100, 100, 1, 0.05, 'put');
      expect(iv).toBeCloseTo(sigma, 2);
    });

    it('返回正值', () => {
      const price = bsCall(100, 100, 1, 0.05, 0.2);
      const iv = impliedVol(price, 100, 100, 1, 0.05, 'call');
      expect(iv).toBeGreaterThan(0);
    });
  });

  describe('二叉树定价', () => {
    it('步数越多越接近BS', () => {
      const bsPrice = bsCall(100, 100, 1, 0.05, 0.2);
      const bt10 = binomialTree(100, 100, 1, 0.05, 0.2, 10, 'call');
      const bt100 = binomialTree(100, 100, 1, 0.05, 0.2, 100, 'call');
      expect(Math.abs(bt100 - bsPrice)).toBeLessThan(Math.abs(bt10 - bsPrice));
    });

    it('价格为正', () => {
      const price = binomialTree(100, 100, 1, 0.05, 0.2, 50, 'call');
      expect(price).toBeGreaterThan(0);
    });

    it('看跌也有效', () => {
      const price = binomialTree(100, 100, 1, 0.05, 0.2, 50, 'put');
      expect(price).toBeGreaterThan(0);
    });
  });
});
