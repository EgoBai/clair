import { describe, it, expect } from 'vitest';

/**
 * 期权希腊字母引擎测试
 */

interface OptionParams {
  spotPrice: number;
  strikePrice: number;
  timeToExpiry: number;
  riskFreeRate: number;
  volatility: number;
  optionType: 'call' | 'put';
  dividendYield?: number;
}

interface GreeksResult {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  price: number;
  intrinsicValue: number;
  timeValue: number;
}

function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function calculateGreeks(params: OptionParams): GreeksResult {
  const { spotPrice: S, strikePrice: K, timeToExpiry: T, riskFreeRate: r, volatility: sigma, optionType } = params;
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    const intrinsic = optionType === 'call' ? Math.max(0, S - K) : Math.max(0, K - S);
    return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0, price: intrinsic, intrinsicValue: intrinsic, timeValue: 0 };
  }
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  const Nd1 = normalCDF(d1);
  const Nd2 = normalCDF(d2);
  const NnegD1 = normalCDF(-d1);
  const NnegD2 = normalCDF(-d2);
  const nd1 = normalPDF(d1);

  let price: number, delta: number, theta: number, rho: number;
  if (optionType === 'call') {
    price = S * Nd1 - K * Math.exp(-r * T) * Nd2;
    delta = Nd1;
    theta = (-S * nd1 * sigma / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * Nd2) / 365;
    rho = K * T * Math.exp(-r * T) * Nd2 / 100;
  } else {
    price = K * Math.exp(-r * T) * NnegD2 - S * NnegD1;
    delta = Nd1 - 1;
    theta = (-S * nd1 * sigma / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * NnegD2) / 365;
    rho = -K * T * Math.exp(-r * T) * NnegD2 / 100;
  }
  const gamma = nd1 / (S * sigma * Math.sqrt(T));
  const vega = S * nd1 * Math.sqrt(T) / 100;
  const intrinsic = optionType === 'call' ? Math.max(0, S - K) : Math.max(0, K - S);

  return {
    price: parseFloat(price.toFixed(4)),
    delta: parseFloat(delta.toFixed(4)),
    gamma: parseFloat(gamma.toFixed(6)),
    theta: parseFloat(theta.toFixed(4)),
    vega: parseFloat(vega.toFixed(4)),
    rho: parseFloat(rho.toFixed(4)),
    intrinsicValue: intrinsic,
    timeValue: parseFloat((price - intrinsic).toFixed(4)),
  };
}

function calculatePortfolioGreeks(positions: Array<{ params: OptionParams; quantity: number }>): GreeksResult {
  const totals = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0, price: 0, intrinsicValue: 0, timeValue: 0 };
  positions.forEach(({ params, quantity }) => {
    const greeks = calculateGreeks(params);
    totals.delta += greeks.delta * quantity;
    totals.gamma += greeks.gamma * quantity;
    totals.theta += greeks.theta * quantity;
    totals.vega += greeks.vega * quantity;
    totals.rho += greeks.rho * quantity;
    totals.price += greeks.price * quantity;
    totals.intrinsicValue += greeks.intrinsicValue * quantity;
    totals.timeValue += greeks.timeValue * quantity;
  });
  return {
    delta: parseFloat(totals.delta.toFixed(4)),
    gamma: parseFloat(totals.gamma.toFixed(6)),
    theta: parseFloat(totals.theta.toFixed(4)),
    vega: parseFloat(totals.vega.toFixed(4)),
    rho: parseFloat(totals.rho.toFixed(4)),
    price: parseFloat(totals.price.toFixed(4)),
    intrinsicValue: parseFloat(totals.intrinsicValue.toFixed(4)),
    timeValue: parseFloat(totals.timeValue.toFixed(4)),
  };
}

describe('期权希腊字母引擎', () => {
  const baseParams: OptionParams = {
    spotPrice: 100,
    strikePrice: 100,
    timeToExpiry: 0.25,
    riskFreeRate: 0.05,
    volatility: 0.2,
    optionType: 'call',
  };

  describe('normalCDF', () => {
    it('should return 0.5 at x=0', () => {
      expect(normalCDF(0)).toBeCloseTo(0.5, 3);
    });

    it('should approach 1 for large positive x', () => {
      expect(normalCDF(4)).toBeGreaterThan(0.999);
    });

    it('should approach 0 for large negative x', () => {
      expect(normalCDF(-4)).toBeLessThan(0.001);
    });
  });

  describe('calculateGreeks', () => {
    it('should calculate call option price', () => {
      const greeks = calculateGreeks(baseParams);
      expect(greeks.price).toBeGreaterThan(0);
      expect(greeks.delta).toBeGreaterThan(0);
      expect(greeks.delta).toBeLessThanOrEqual(1);
    });

    it('put delta should be negative', () => {
      const greeks = calculateGreeks({ ...baseParams, optionType: 'put' });
      expect(greeks.delta).toBeLessThan(0);
      expect(greeks.delta).toBeGreaterThanOrEqual(-1);
    });

    it('gamma should be positive', () => {
      const callGamma = calculateGreeks(baseParams).gamma;
      const putGamma = calculateGreeks({ ...baseParams, optionType: 'put' }).gamma;
      expect(callGamma).toBeGreaterThan(0);
      expect(putGamma).toBeGreaterThan(0);
    });

    it('vega should be positive for both types', () => {
      expect(calculateGreeks(baseParams).vega).toBeGreaterThan(0);
      expect(calculateGreeks({ ...baseParams, optionType: 'put' }).vega).toBeGreaterThan(0);
    });

    it('ITM call should have higher delta', () => {
      const itm = calculateGreeks({ ...baseParams, spotPrice: 120 });
      const otm = calculateGreeks({ ...baseParams, spotPrice: 80 });
      expect(itm.delta).toBeGreaterThan(otm.delta);
    });

    it('should handle expired options', () => {
      const greeks = calculateGreeks({ ...baseParams, timeToExpiry: 0 });
      expect(greeks.price).toBe(0); // ATM call at expiry
      expect(greeks.delta).toBe(0);
    });

    it('intrinsic + time value should equal price', () => {
      const greeks = calculateGreeks(baseParams);
      expect(greeks.intrinsicValue + greeks.timeValue).toBeCloseTo(greeks.price, 2);
    });

    it('higher vol should increase call price', () => {
      const low = calculateGreeks({ ...baseParams, volatility: 0.1 });
      const high = calculateGreeks({ ...baseParams, volatility: 0.4 });
      expect(high.price).toBeGreaterThan(low.price);
    });
  });

  describe('calculatePortfolioGreeks', () => {
    it('should sum positions', () => {
      const portfolio = calculatePortfolioGreeks([
        { params: baseParams, quantity: 10 },
        { params: { ...baseParams, optionType: 'put' }, quantity: -5 },
      ]);
      expect(portfolio.delta).toBeGreaterThan(0); // 10 calls - 5 puts
    });

    it('single position should match direct calculation', () => {
      const direct = calculateGreeks(baseParams);
      const portfolio = calculatePortfolioGreeks([{ params: baseParams, quantity: 1 }]);
      expect(portfolio.price).toBeCloseTo(direct.price, 3);
      expect(portfolio.delta).toBeCloseTo(direct.delta, 3);
    });
  });
});
