import { describe, it, expect } from 'vitest';
import {
  normalCDF,
  normalPDF,
  calculateGreeks,
  impliedVolatility,
  portfolioGreeks,
  OptionParams,
} from '../utils/optionsGreeksEngine';

describe('normalCDF', () => {
  it('returns 0.5 at zero', () => {
    expect(normalCDF(0)).toBeCloseTo(0.5, 2);
  });

  it('approaches 1 for large positive', () => {
    expect(normalCDF(5)).toBeCloseTo(1, 3);
  });

  it('approaches 0 for large negative', () => {
    expect(normalCDF(-5)).toBeCloseTo(0, 3);
  });

  it('is symmetric', () => {
    expect(normalCDF(1) + normalCDF(-1)).toBeCloseTo(1, 5);
  });
});

describe('normalPDF', () => {
  it('peaks at zero', () => {
    expect(normalPDF(0)).toBeCloseTo(0.3989, 3);
  });

  it('is symmetric', () => {
    expect(normalPDF(1)).toBeCloseTo(normalPDF(-1), 5);
  });
});

describe('calculateGreeks', () => {
  const baseParams: OptionParams = {
    spot: 100,
    strike: 100,
    timeToExpiry: 0.25, // 3 months
    riskFreeRate: 0.05,
    volatility: 0.2,
    type: 'call',
  };

  it('prices ATM call correctly', () => {
    const greeks = calculateGreeks(baseParams);
    expect(greeks.price).toBeGreaterThan(0);
    expect(greeks.price).toBeLessThan(baseParams.spot);
  });

  it('delta between 0 and 1 for call', () => {
    const greeks = calculateGreeks(baseParams);
    expect(greeks.delta).toBeGreaterThan(0);
    expect(greeks.delta).toBeLessThan(1);
  });

  it('ATM call has delta near 0.5', () => {
    const greeks = calculateGreeks(baseParams);
    expect(greeks.delta).toBeGreaterThan(0.45);
    expect(greeks.delta).toBeLessThan(0.65);
  });

  it('gamma is positive', () => {
    const greeks = calculateGreeks(baseParams);
    expect(greeks.gamma).toBeGreaterThan(0);
  });

  it('theta is negative (time decay)', () => {
    const greeks = calculateGreeks(baseParams);
    expect(greeks.theta).toBeLessThan(0);
  });

  it('vega is positive', () => {
    const greeks = calculateGreeks(baseParams);
    expect(greeks.vega).toBeGreaterThan(0);
  });

  it('put delta between -1 and 0', () => {
    const greeks = calculateGreeks({ ...baseParams, type: 'put' });
    expect(greeks.delta).toBeLessThan(0);
    expect(greeks.delta).toBeGreaterThan(-1);
  });

  it('put-call parity holds approximately', () => {
    const call = calculateGreeks(baseParams);
    const put = calculateGreeks({ ...baseParams, type: 'put' });
    const S = baseParams.spot;
    const K = baseParams.strike;
    const T = baseParams.timeToExpiry;
    const r = baseParams.riskFreeRate;
    // C - P ≈ S - K * e^(-rT)
    const diff = call.price - put.price;
    const expected = S - K * Math.exp(-r * T);
    expect(diff).toBeCloseTo(expected, 1);
  });

  it('handles expired option', () => {
    const greeks = calculateGreeks({ ...baseParams, strike: 90, timeToExpiry: 0 });
    expect(greeks.intrinsicValue).toBe(10); // S=100, K=90
    expect(greeks.timeValue).toBe(0);
  });

  it('computes moneyness', () => {
    const greeks = calculateGreeks(baseParams);
    expect(greeks.moneyness).toBe(1);
  });

  it('ITM call has higher delta', () => {
    const itm = calculateGreeks({ ...baseParams, strike: 90 });
    const atm = calculateGreeks(baseParams);
    expect(itm.delta).toBeGreaterThan(atm.delta);
  });
});

describe('impliedVolatility', () => {
  it('recovers known volatility', () => {
    const params: Omit<import('../utils/optionsGreeksEngine').OptionParams, 'volatility'> = {
      spot: 100, strike: 100, timeToExpiry: 0.25, riskFreeRate: 0.05, type: 'call',
    };
    const { price } = calculateGreeks({ ...params, volatility: 0.25 });
    const iv = impliedVolatility(price, params);
    expect(iv).toBeCloseTo(0.25, 2);
  });

  it('returns null if cannot converge', () => {
    const iv = impliedVolatility(-100, {
      spot: 100, strike: 100, timeToExpiry: 0.25, riskFreeRate: 0.05, type: 'call',
    });
    expect(iv).toBeNull();
  });
});

describe('portfolioGreeks', () => {
  it('sums positions', () => {
    const positions = [
      {
        params: { spot: 100, strike: 100, timeToExpiry: 0.25, riskFreeRate: 0.05, volatility: 0.2, type: 'call' as const },
        quantity: 2,
      },
      {
        params: { spot: 100, strike: 100, timeToExpiry: 0.25, riskFreeRate: 0.05, volatility: 0.2, type: 'put' as const },
        quantity: -1,
      },
    ];
    const greeks = portfolioGreeks(positions);
    expect(greeks.delta).not.toBe(0);
  });

  it('handles empty portfolio', () => {
    const greeks = portfolioGreeks([]);
    expect(greeks.price).toBe(0);
    expect(greeks.delta).toBe(0);
  });
});
