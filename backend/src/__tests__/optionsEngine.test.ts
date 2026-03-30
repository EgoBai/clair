import { describe, it, expect } from 'vitest';

// 期权定价引擎
interface OptionParams { spot: number; strike: number; timeToExpiry: number; riskFreeRate: number; volatility: number; type: 'call' | 'put' }
interface Greeks { delta: number; gamma: number; theta: number; vega: number; rho: number }

class OptionsEngine {
  private static normCDF(x: number): number {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * y);
  }

  private static normPDF(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  static blackScholes(params: OptionParams): number {
    const { spot: S, strike: K, timeToExpiry: T, riskFreeRate: r, volatility: sigma, type } = params;
    if (T <= 0) return type === 'call' ? Math.max(0, S - K) : Math.max(0, K - S);
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    if (type === 'call') {
      return S * OptionsEngine.normCDF(d1) - K * Math.exp(-r * T) * OptionsEngine.normCDF(d2);
    }
    return K * Math.exp(-r * T) * OptionsEngine.normCDF(-d2) - S * OptionsEngine.normCDF(-d1);
  }

  static calcGreeks(params: OptionParams): Greeks {
    const { spot: S, strike: K, timeToExpiry: T, riskFreeRate: r, volatility: sigma, type } = params;
    if (T <= 0.001) return { delta: type === 'call' ? (S > K ? 1 : 0) : (S < K ? -1 : 0), gamma: 0, theta: 0, vega: 0, rho: 0 };
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    const gamma = OptionsEngine.normPDF(d1) / (S * sigma * Math.sqrt(T));
    const vega = S * OptionsEngine.normPDF(d1) * Math.sqrt(T) / 100;
    let delta: number, theta: number, rho: number;
    if (type === 'call') {
      delta = OptionsEngine.normCDF(d1);
      theta = -(S * OptionsEngine.normPDF(d1) * sigma) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * OptionsEngine.normCDF(d2);
      rho = K * T * Math.exp(-r * T) * OptionsEngine.normCDF(d2) / 100;
    } else {
      delta = OptionsEngine.normCDF(d1) - 1;
      theta = -(S * OptionsEngine.normPDF(d1) * sigma) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * OptionsEngine.normCDF(-d2);
      rho = -K * T * Math.exp(-r * T) * OptionsEngine.normCDF(-d2) / 100;
    }
    return { delta, gamma, theta: theta / 365, vega, rho };
  }

  static impliedVolatility(marketPrice: number, params: Omit<OptionParams, 'volatility'>, maxIter: number = 100): number {
    let vol = 0.3;
    for (let i = 0; i < maxIter; i++) {
      const price = OptionsEngine.blackScholes({ ...params, volatility: vol });
      const vega = OptionsEngine.calcGreeks({ ...params, volatility: vol }).vega * 100;
      if (Math.abs(vega) < 1e-10) break;
      const diff = price - marketPrice;
      vol -= diff / vega;
      vol = Math.max(0.001, Math.min(5, vol));
      if (Math.abs(diff) < 0.0001) break;
    }
    return vol;
  }

  static calcPutCallParity(callPrice: number, spot: number, strike: number, timeToExpiry: number, rate: number): number {
    return callPrice - spot + strike * Math.exp(-rate * timeToExpiry);
  }

  static calcIntrinsicValue(params: OptionParams): number {
    if (params.type === 'call') return Math.max(0, params.spot - params.strike);
    return Math.max(0, params.strike - params.spot);
  }

  static calcTimeValue(params: OptionParams): number {
    return Math.max(0, OptionsEngine.blackScholes(params) - OptionsEngine.calcIntrinsicValue(params));
  }
}

describe('期权定价引擎', () => {
  const baseParams: OptionParams = { spot: 100, strike: 100, timeToExpiry: 1, riskFreeRate: 0.05, volatility: 0.2, type: 'call' };

  describe('Black-Scholes定价', () => {
    it('ATM看涨期权应有正价格', () => {
      const price = OptionsEngine.blackScholes(baseParams);
      expect(price).toBeGreaterThan(0);
    });
    it('ATM看跌期权应有正价格', () => {
      const price = OptionsEngine.blackScholes({ ...baseParams, type: 'put' });
      expect(price).toBeGreaterThan(0);
    });
    it('深度实值看涨应接近内在价值', () => {
      const price = OptionsEngine.blackScholes({ ...baseParams, spot: 200, strike: 100 });
      expect(price).toBeGreaterThan(90);
    });
    it('深度虚值看涨应接近零', () => {
      const price = OptionsEngine.blackScholes({ ...baseParams, spot: 50, strike: 100 });
      expect(price).toBeLessThan(0.1);
    });
    it('到期时期权价值应为内在价值', () => {
      const price = OptionsEngine.blackScholes({ ...baseParams, timeToExpiry: 0, spot: 110 });
      expect(price).toBeCloseTo(10, 5);
    });
    it('看涨看跌平价关系', () => {
      const call = OptionsEngine.blackScholes(baseParams);
      const put = OptionsEngine.blackScholes({ ...baseParams, type: 'put' });
      const parity = OptionsEngine.calcPutCallParity(call, baseParams.spot, baseParams.strike, baseParams.timeToExpiry, baseParams.riskFreeRate);
      expect(put).toBeCloseTo(parity, 2);
    });
  });

  describe('Greeks计算', () => {
    it('看涨Delta应在0-1之间', () => {
      const greeks = OptionsEngine.calcGreeks(baseParams);
      expect(greeks.delta).toBeGreaterThan(0);
      expect(greeks.delta).toBeLessThan(1);
    });
    it('看跌Delta应在-1到0之间', () => {
      const greeks = OptionsEngine.calcGreeks({ ...baseParams, type: 'put' });
      expect(greeks.delta).toBeGreaterThan(-1);
      expect(greeks.delta).toBeLessThan(0);
    });
    it('Gamma应为正', () => {
      const greeks = OptionsEngine.calcGreeks(baseParams);
      expect(greeks.gamma).toBeGreaterThan(0);
    });
    it('ATM看涨Vega应为正', () => {
      const greeks = OptionsEngine.calcGreeks(baseParams);
      expect(greeks.vega).toBeGreaterThan(0);
    });
    it('到期时Greeks应趋近零', () => {
      const greeks = OptionsEngine.calcGreeks({ ...baseParams, timeToExpiry: 0.0001 });
      expect(greeks.gamma).toBeCloseTo(0, 1);
    });
    it('看涨Rho应为正', () => {
      const greeks = OptionsEngine.calcGreeks(baseParams);
      expect(greeks.rho).toBeGreaterThan(0);
    });
    it('看跌Rho应为负', () => {
      const greeks = OptionsEngine.calcGreeks({ ...baseParams, type: 'put' });
      expect(greeks.rho).toBeLessThan(0);
    });
  });

  describe('隐含波动率', () => {
    it('应该反解出原始波动率', () => {
      const price = OptionsEngine.blackScholes(baseParams);
      const iv = OptionsEngine.impliedVolatility(price, { spot: baseParams.spot, strike: baseParams.strike, timeToExpiry: baseParams.timeToExpiry, riskFreeRate: baseParams.riskFreeRate, type: baseParams.type });
      expect(iv).toBeCloseTo(0.2, 1);
    });
    it('应该处理高波动率', () => {
      const price = OptionsEngine.blackScholes({ ...baseParams, volatility: 0.8 });
      const iv = OptionsEngine.impliedVolatility(price, { spot: baseParams.spot, strike: baseParams.strike, timeToExpiry: baseParams.timeToExpiry, riskFreeRate: baseParams.riskFreeRate, type: baseParams.type });
      expect(iv).toBeCloseTo(0.8, 1);
    });
    it('深度虚值应返回合理IV', () => {
      const price = OptionsEngine.blackScholes({ ...baseParams, spot: 50 });
      const iv = OptionsEngine.impliedVolatility(price, { spot: 50, strike: baseParams.strike, timeToExpiry: baseParams.timeToExpiry, riskFreeRate: baseParams.riskFreeRate, type: baseParams.type });
      expect(iv).toBeGreaterThan(0);
    });
  });

  describe('内在价值', () => {
    it('实值看涨内在价值为正', () => {
      expect(OptionsEngine.calcIntrinsicValue({ ...baseParams, spot: 110 })).toBeCloseTo(10, 5);
    });
    it('虚值看涨内在价值为零', () => {
      expect(OptionsEngine.calcIntrinsicValue({ ...baseParams, spot: 90 })).toBe(0);
    });
    it('实值看跌内在价值为正', () => {
      expect(OptionsEngine.calcIntrinsicValue({ ...baseParams, type: 'put', spot: 90 })).toBeCloseTo(10, 5);
    });
    it('虚值看跌内在价值为零', () => {
      expect(OptionsEngine.calcIntrinsicValue({ ...baseParams, type: 'put', spot: 110 })).toBe(0);
    });
  });

  describe('时间价值', () => {
    it('ATM期权应有最大时间价值', () => {
      const tvATM = OptionsEngine.calcTimeValue(baseParams);
      const tvITM = OptionsEngine.calcTimeValue({ ...baseParams, spot: 120 });
      const tvOTM = OptionsEngine.calcTimeValue({ ...baseParams, spot: 80 });
      expect(tvATM).toBeGreaterThan(tvITM - 0.01);
      expect(tvATM).toBeGreaterThan(tvOTM - 0.01);
    });
    it('到期时时间价值为零', () => {
      expect(OptionsEngine.calcTimeValue({ ...baseParams, timeToExpiry: 0 })).toBe(0);
    });
    it('时间价值应非负', () => {
      expect(OptionsEngine.calcTimeValue(baseParams)).toBeGreaterThanOrEqual(0);
    });
  });
});
