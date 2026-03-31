import { describe, it, expect } from 'vitest';

describe('期权链分析引擎', () => {
  interface OptionQuote { strike: number; call: number; put: number; expiry: number; type: 'call' | 'put' }
  
  // Black-Scholes
  function bsPrice(s: number, k: number, t: number, r: number, sigma: number, type: 'call' | 'put') {
    const d1 = (Math.log(s / k) + (r + sigma ** 2 / 2) * t) / (sigma * Math.sqrt(t));
    const d2 = d1 - sigma * Math.sqrt(t);
    const normCdf = (x: number) => 0.5 * (1 + erf(x / Math.sqrt(2)));
    const erf = (x: number) => {
      const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
      const sign = x < 0 ? -1 : 1;
      const z = Math.abs(x);
      const t2 = 1 / (1 + p * z);
      const y = 1 - (((((a5 * t2 + a4) * t2) + a3) * t2 + a2) * t2 + a1) * t2 * Math.exp(-z * z);
      return sign * y;
    };
    if (type === 'call') return s * normCdf(d1) - k * Math.exp(-r * t) * normCdf(d2);
    return k * Math.exp(-r * t) * normCdf(-d2) - s * normCdf(-d1);
  }

  // Greeks
  function greeks(s: number, k: number, t: number, r: number, sigma: number, type: 'call' | 'put') {
    const d1 = (Math.log(s / k) + (r + sigma ** 2 / 2) * t) / (sigma * Math.sqrt(t));
    const d2 = d1 - sigma * Math.sqrt(t);
    const normPdf = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
    const normCdf = (x: number) => 0.5 * (1 + erf(x / Math.sqrt(2)));
    const erf = (x: number) => {
      const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
      const sign = x < 0 ? -1 : 1, z = Math.abs(x), t2 = 1 / (1 + p * z);
      return sign * (1 - (((((a5 * t2 + a4) * t2) + a3) * t2 + a2) * t2 + a1) * t2 * Math.exp(-z * z));
    };
    const delta = type === 'call' ? normCdf(d1) : normCdf(d1) - 1;
    const gamma = normPdf(d1) / (s * sigma * Math.sqrt(t));
    const vega = s * normPdf(d1) * Math.sqrt(t) / 100;
    const theta = type === 'call'
      ? (-(s * normPdf(d1) * sigma) / (2 * Math.sqrt(t)) - r * k * Math.exp(-r * t) * normCdf(d2)) / 365
      : (-(s * normPdf(d1) * sigma) / (2 * Math.sqrt(t)) + r * k * Math.exp(-r * t) * normCdf(-d2)) / 365;
    return { delta, gamma, vega, theta };
  }

  // 隐含波动率(二分法)
  function impliedVol(price: number, s: number, k: number, t: number, r: number, type: 'call' | 'put') {
    let low = 0.001, high = 5, mid = 0.5;
    for (let i = 0; i < 50; i++) {
      mid = (low + high) / 2;
      const p = bsPrice(s, k, t, r, mid, type);
      if (p > price) high = mid; else low = mid;
    }
    return mid;
  }

  // 波动率微笑
  function volatilitySmile(strikes: number[], marketPrices: number[], s: number, t: number, r: number, type: 'call' | 'put') {
    return strikes.map((k, i) => ({
      strike: k,
      moneyness: k / s,
      iv: impliedVol(marketPrices[i], s, k, t, r, type),
    }));
  }

  // Delta对冲比率
  function deltaHedge(s: number, k: number, t: number, r: number, sigma: number, type: 'call' | 'put', nContracts: number) {
    const { delta } = greeks(s, k, t, r, sigma, type);
    return { sharesNeeded: delta * nContracts * 100, delta, hedgeRatio: Math.abs(delta) };
  }

  // 期权组合P&L
  function portfolioPnL(positions: { strike: number; type: 'call' | 'put'; premium: number; qty: number }[], spotPrice: number, sigma: number, t: number, r: number) {
    return positions.map(pos => {
      const intrinsic = pos.type === 'call' ? Math.max(0, spotPrice - pos.strike) : Math.max(0, pos.strike - spotPrice);
      const pnl = (intrinsic - pos.premium) * pos.qty * 100;
      const { delta, gamma, vega, theta } = greeks(spotPrice, pos.strike, t, r, sigma, pos.type);
      return { ...pos, intrinsic, pnl, delta: delta * pos.qty * 100, gamma: gamma * pos.qty * 100 };
    });
  }

  const s = 100, k = 100, t = 0.25, r = 0.03, sigma = 0.2;

  describe('Black-Scholes定价', () => {
    it('看涨期权价格为正', () => {
      const price = bsPrice(s, k, t, r, sigma, 'call');
      expect(price).toBeGreaterThan(0);
    });

    it('看跌期权价格为正', () => {
      const price = bsPrice(s, k, t, r, sigma, 'put');
      expect(price).toBeGreaterThan(0);
    });

    it('深度价内看涨接近s-k*e^(-rt)', () => {
      const price = bsPrice(s, 80, t, r, sigma, 'call');
      const intrinsic = s - 80 * Math.exp(-r * t);
      expect(price).toBeGreaterThan(intrinsic * 0.9);
    });

    it('看涨看跌平价', () => {
      const call = bsPrice(s, k, t, r, sigma, 'call');
      const put = bsPrice(s, k, t, r, sigma, 'put');
      const lhs = call - put;
      const rhs = s - k * Math.exp(-r * t);
      expect(lhs).toBeCloseTo(rhs, 1);
    });
  });

  describe('Greeks', () => {
    it('Delta在0-1(看涨)', () => {
      const { delta } = greeks(s, k, t, r, sigma, 'call');
      expect(delta).toBeGreaterThan(0);
      expect(delta).toBeLessThan(1);
    });

    it('Delta在-1~0(看跌)', () => {
      const { delta } = greeks(s, k, t, r, sigma, 'put');
      expect(delta).toBeGreaterThan(-1);
      expect(delta).toBeLessThan(0);
    });

    it('Gamma为正', () => {
      const { gamma } = greeks(s, k, t, r, sigma, 'call');
      expect(gamma).toBeGreaterThan(0);
    });

    it('Vega为正', () => {
      const { vega } = greeks(s, k, t, r, sigma, 'call');
      expect(vega).toBeGreaterThan(0);
    });

    it('Theta为负(看涨)', () => {
      const { theta } = greeks(s, k, t, r, sigma, 'call');
      expect(theta).toBeLessThan(0);
    });
  });

  describe('隐含波动率', () => {
    it('回推正确的波动率', () => {
      const price = bsPrice(s, k, t, r, sigma, 'call');
      const iv = impliedVol(price, s, k, t, r, 'call');
      expect(iv).toBeCloseTo(sigma, 1);
    });

    it('看跌回推波动率', () => {
      const price = bsPrice(s, k, t, r, sigma, 'put');
      const iv = impliedVol(price, s, k, t, r, 'put');
      expect(iv).toBeCloseTo(sigma, 1);
    });
  });

  describe('波动率微笑', () => {
    it('返回微笑数据', () => {
      const strikes = [90, 95, 100, 105, 110];
      const prices = strikes.map(k2 => bsPrice(s, k2, t, r, sigma, 'call'));
      const smile = volatilitySmile(strikes, prices, s, t, r, 'call');
      expect(smile.length).toBe(5);
      smile.forEach(point => {
        expect(point.iv).toBeCloseTo(sigma, 1);
      });
    });
  });

  describe('Delta对冲', () => {
    it('计算对冲比率', () => {
      const hedge = deltaHedge(s, k, t, r, sigma, 'call', 10);
      expect(hedge.sharesNeeded).toBeGreaterThan(0);
      expect(hedge.delta).toBeGreaterThan(0);
    });
  });

  describe('组合P&L', () => {
    it('计算组合盈亏', () => {
      const positions = [
        { strike: 100, type: 'call' as const, premium: 3, qty: 1 },
        { strike: 95, type: 'put' as const, premium: 1.5, qty: -2 },
      ];
      const result = portfolioPnL(positions, 105, sigma, t, r);
      expect(result.length).toBe(2);
      result.forEach(r2 => expect(typeof r2.pnl).toBe('number'));
    });
  });
});
