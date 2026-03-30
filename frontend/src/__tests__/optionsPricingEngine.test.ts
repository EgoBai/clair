import { describe, it, expect } from 'vitest';
import {
  normalCDF,
  normalPDF,
  inverseNormalCDF,
  blackScholesPrice,
  calculateGreeks,
  priceOption,
  calculateImpliedVolatility,
  binomialTreePrice,
  putCallParity,
  aggregateGreeks,
  priceStrategy,
  interpolateVolatilitySurface,
  type OptionParams,
  type VolatilitySurface,
} from '../utils/optionsPricingEngine';

describe('normalCDF', () => {
  it('should return 0.5 for x=0', () => {
    expect(normalCDF(0)).toBeCloseTo(0.5, 5);
  });

  it('should approach 1 for large positive x', () => {
    expect(normalCDF(8)).toBeCloseTo(1, 5);
  });

  it('should approach 0 for large negative x', () => {
    expect(normalCDF(-8)).toBeCloseTo(0, 5);
  });

  it('should be symmetric around 0', () => {
    expect(normalCDF(1) + normalCDF(-1)).toBeCloseTo(1, 5);
  });

  it('should return ~0.8413 for x=1', () => {
    expect(normalCDF(1)).toBeCloseTo(0.8413, 3);
  });
});

describe('normalPDF', () => {
  it('should return ~0.3989 for x=0', () => {
    expect(normalPDF(0)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 5);
  });

  it('should be symmetric', () => {
    expect(normalPDF(1)).toBeCloseTo(normalPDF(-1), 10);
  });

  it('should decrease as |x| increases', () => {
    expect(normalPDF(0)).toBeGreaterThan(normalPDF(1));
    expect(normalPDF(1)).toBeGreaterThan(normalPDF(2));
  });
});

describe('inverseNormalCDF', () => {
  it('should return 0 for p=0.5', () => {
    expect(inverseNormalCDF(0.5)).toBeCloseTo(0, 2);
  });

  it('should return ~1.645 for p=0.95', () => {
    expect(inverseNormalCDF(0.95)).toBeCloseTo(1.645, 1);
  });

  it('should return ~-1.645 for p=0.05', () => {
    expect(inverseNormalCDF(0.05)).toBeCloseTo(-1.645, 1);
  });

  it('should roundtrip with normalCDF', () => {
    const p = 0.75;
    const x = inverseNormalCDF(p);
    expect(normalCDF(x)).toBeCloseTo(p, 3);
  });
});

const atmCall: OptionParams = {
  spot: 100,
  strike: 100,
  timeToExpiry: 0.25,
  riskFreeRate: 0.05,
  volatility: 0.2,
  type: 'call',
};

const atmPut: OptionParams = {
  ...atmCall,
  type: 'put',
};

const itmCall: OptionParams = {
  ...atmCall,
  strike: 90,
};

const otmCall: OptionParams = {
  ...atmCall,
  strike: 110,
};

describe('blackScholesPrice', () => {
  it('should price ATM call correctly', () => {
    const price = blackScholesPrice(atmCall);
    expect(price).toBeGreaterThan(0);
    expect(price).toBeCloseTo(4.615, 1);
  });

  it('should price ATM put correctly', () => {
    const price = blackScholesPrice(atmPut);
    expect(price).toBeGreaterThan(0);
    expect(price).toBeCloseTo(3.384, 1);
  });

  it('ITM call should be more expensive than OTM call', () => {
    expect(blackScholesPrice(itmCall)).toBeGreaterThan(blackScholesPrice(otmCall));
  });

  it('should return intrinsic value at expiry', () => {
    const expired = { ...atmCall, timeToExpiry: 0 };
    expect(blackScholesPrice(expired)).toBe(0);
  });

  it('should handle very small time to expiry', () => {
    const nearExpiry = { ...atmCall, timeToExpiry: 0.001 };
    expect(blackScholesPrice(nearExpiry)).toBeGreaterThan(0);
  });

  it('should satisfy put-call parity approximately', () => {
    const call = blackScholesPrice(atmCall);
    const put = blackScholesPrice(atmPut);
    const parity = putCallParity(call, put, atmCall.spot, atmCall.strike, atmCall.riskFreeRate, atmCall.timeToExpiry);
    expect(parity.isValid).toBe(true);
  });

  it('should increase with volatility', () => {
    const lowVol = blackScholesPrice({ ...atmCall, volatility: 0.1 });
    const highVol = blackScholesPrice({ ...atmCall, volatility: 0.4 });
    expect(highVol).toBeGreaterThan(lowVol);
  });

  it('should handle dividend yield', () => {
    const withDiv = blackScholesPrice({ ...atmCall, dividendYield: 0.03 });
    const withoutDiv = blackScholesPrice(atmCall);
    expect(withoutDiv).toBeGreaterThan(withDiv);
  });
});

describe('calculateGreeks', () => {
  it('should calculate positive delta for call', () => {
    const greeks = calculateGreeks(atmCall);
    expect(greeks.delta).toBeGreaterThan(0);
    expect(greeks.delta).toBeLessThanOrEqual(1);
  });

  it('should calculate negative delta for put', () => {
    const greeks = calculateGreeks(atmPut);
    expect(greeks.delta).toBeLessThan(0);
    expect(greeks.delta).toBeGreaterThanOrEqual(-1);
  });

  it('should calculate positive gamma', () => {
    const greeks = calculateGreeks(atmCall);
    expect(greeks.gamma).toBeGreaterThan(0);
  });

  it('should calculate negative theta for long options', () => {
    const greeks = calculateGreeks(atmCall);
    expect(greeks.theta).toBeLessThan(0);
  });

  it('should calculate positive vega', () => {
    const greeks = calculateGreeks(atmCall);
    expect(greeks.vega).toBeGreaterThan(0);
  });

  it('should calculate positive rho for call', () => {
    const greeks = calculateGreeks(atmCall);
    expect(greeks.rho).toBeGreaterThan(0);
  });

  it('should calculate negative rho for put', () => {
    const greeks = calculateGreeks(atmPut);
    expect(greeks.rho).toBeLessThan(0);
  });

  it('should return zero greeks at expiry', () => {
    const greeks = calculateGreeks({ ...atmCall, timeToExpiry: 0 });
    expect(greeks.delta).toBe(0);
    expect(greeks.gamma).toBe(0);
  });

  it('ATM call delta should be close to 0.5', () => {
    const greeks = calculateGreeks(atmCall);
    expect(greeks.delta).toBeCloseTo(0.5, 0);
  });

  it('ITM call delta should be greater than ATM', () => {
    const itmDelta = calculateGreeks(itmCall).delta;
    const atmDelta = calculateGreeks(atmCall).delta;
    expect(itmDelta).toBeGreaterThan(atmDelta);
  });
});

describe('priceOption', () => {
  it('should return complete pricing result', () => {
    const result = priceOption(atmCall);
    expect(result.price).toBeGreaterThan(0);
    expect(result.intrinsicValue).toBe(0); // ATM
    expect(result.timeValue).toBeCloseTo(result.price, 5);
    expect(result.greeks).toBeDefined();
  });

  it('ITM option should have positive intrinsic value', () => {
    const result = priceOption(itmCall);
    expect(result.intrinsicValue).toBe(itmCall.spot - itmCall.strike);
  });

  it('OTM option should have zero intrinsic value', () => {
    const result = priceOption(otmCall);
    expect(result.intrinsicValue).toBe(0);
  });
});

describe('calculateImpliedVolatility', () => {
  it('should recover known volatility', () => {
    const marketPrice = blackScholesPrice(atmCall);
    const iv = calculateImpliedVolatility(marketPrice, {
      spot: atmCall.spot,
      strike: atmCall.strike,
      timeToExpiry: atmCall.timeToExpiry,
      riskFreeRate: atmCall.riskFreeRate,
      type: atmCall.type,
    });
    expect(iv).toBeCloseTo(atmCall.volatility, 2);
  });

  it('should handle put options', () => {
    const marketPrice = blackScholesPrice(atmPut);
    const iv = calculateImpliedVolatility(marketPrice, {
      spot: atmPut.spot,
      strike: atmPut.strike,
      timeToExpiry: atmPut.timeToExpiry,
      riskFreeRate: atmPut.riskFreeRate,
      type: atmPut.type,
    });
    expect(iv).toBeCloseTo(atmPut.volatility, 2);
  });
});

describe('binomialTreePrice', () => {
  it('should approximate Black-Scholes for European options', () => {
    const bsPrice = blackScholesPrice(atmCall);
    const binPrice = binomialTreePrice(atmCall, 200);
    expect(binPrice).toBeCloseTo(bsPrice, 0);
  });

  it('American put should be worth at least European put', () => {
    const bsPut = blackScholesPrice(atmPut);
    const binPut = binomialTreePrice(atmPut, 100);
    expect(binPut).toBeGreaterThanOrEqual(bsPut - 0.1);
  });
});

describe('putCallParity', () => {
  it('should verify put-call parity', () => {
    const call = blackScholesPrice(atmCall);
    const put = blackScholesPrice(atmPut);
    const result = putCallParity(call, put, 100, 100, 0.05, 0.25);
    expect(result.isValid).toBe(true);
    expect(result.difference).toBeLessThan(0.01);
  });
});

describe('aggregateGreeks', () => {
  it('should aggregate Greeks for multiple positions', () => {
    const positions = [
      { params: atmCall, quantity: 10 },
      { params: atmPut, quantity: -5 },
    ];
    const agg = aggregateGreeks(positions);
    expect(agg.delta).toBeDefined();
    expect(agg.gamma).toBeDefined();
    expect(agg.theta).toBeDefined();
  });

  it('opposite positions should partially cancel', () => {
    const long = aggregateGreeks([{ params: atmCall, quantity: 1 }]);
    const short = aggregateGreeks([{ params: atmCall, quantity: -1 }]);
    const combined = aggregateGreeks([
      { params: atmCall, quantity: 1 },
      { params: atmCall, quantity: -1 },
    ]);
    expect(Math.abs(combined.delta)).toBeLessThan(Math.abs(long.delta) + 0.001);
  });
});

describe('priceStrategy', () => {
  it('should price a straddle', () => {
    const straddle = priceStrategy([
      { params: atmCall, quantity: 1 },
      { params: atmPut, quantity: 1 },
    ]);
    expect(straddle.totalCost).toBeGreaterThan(0);
    expect(straddle.breakeven.length).toBeGreaterThanOrEqual(1);
  });
});

describe('interpolateVolatilitySurface', () => {
  it('should interpolate vol surface', () => {
    const surface: VolatilitySurface = {
      strikes: [90, 95, 100, 105, 110],
      expiries: [0.25, 0.5, 1.0],
      impliedVols: [
        [0.25, 0.22, 0.20, 0.22, 0.25],
        [0.24, 0.21, 0.19, 0.21, 0.24],
        [0.23, 0.20, 0.18, 0.20, 0.23],
      ],
    };
    const vol = interpolateVolatilitySurface(surface, 100, 0.5);
    expect(vol).toBeCloseTo(0.19, 1);
  });

  it('should handle boundary strikes', () => {
    const surface: VolatilitySurface = {
      strikes: [90, 100, 110],
      expiries: [0.25, 0.5],
      impliedVols: [[0.25, 0.20, 0.25], [0.24, 0.19, 0.24]],
    };
    const vol = interpolateVolatilitySurface(surface, 90, 0.25);
    expect(vol).toBeCloseTo(0.25, 2);
  });
});
