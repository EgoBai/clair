import { describe, it, expect } from 'vitest';
import {
  blackScholes,
  calculateGreeks,
  impliedVolatility,
  putCallParity,
  buildBullCallSpread,
  buildBearPutSpread,
  buildStraddle,
  buildIronCondor,
  calculateMaxPain,
  calculatePCR,
  type OptionParams,
} from '../utils/advancedOptionsEngine';

describe('AdvancedOptionsEngine', () => {
  const baseParams: OptionParams = {
    spot: 100,
    strike: 100,
    timeToExpiry: 0.5,
    riskFreeRate: 0.05,
    volatility: 0.2,
    type: 'call',
  };

  describe('blackScholes', () => {
    it('should price ATM call', () => {
      const result = blackScholes(baseParams);
      expect(result.price).toBeGreaterThan(5);
      expect(result.price).toBeLessThan(15);
    });

    it('should price ATM put', () => {
      const result = blackScholes({ ...baseParams, type: 'put' });
      expect(result.price).toBeGreaterThan(2);
      expect(result.price).toBeLessThan(10);
    });

    it('should have zero time value at expiry', () => {
      const result = blackScholes({ ...baseParams, timeToExpiry: 0 });
      expect(result.timeValue).toBe(0);
    });

    it('should have ITM intrinsic at expiry', () => {
      const result = blackScholes({ ...baseParams, spot: 110, timeToExpiry: 0 });
      expect(result.intrinsic).toBe(10);
      expect(result.price).toBe(10);
    });

    it('should have OTM price of 0 at expiry', () => {
      const result = blackScholes({ ...baseParams, spot: 90, timeToExpiry: 0 });
      expect(result.price).toBe(0);
    });

    it('should price OTM call lower than ATM', () => {
      const atm = blackScholes(baseParams);
      const otm = blackScholes({ ...baseParams, strike: 110 });
      expect(otm.price).toBeLessThan(atm.price);
    });

    it('should price higher vol options higher', () => {
      const lowVol = blackScholes(baseParams);
      const highVol = blackScholes({ ...baseParams, volatility: 0.4 });
      expect(highVol.price).toBeGreaterThan(lowVol.price);
    });

    it('should have non-negative price', () => {
      const result = blackScholes({ ...baseParams, spot: 50, strike: 200 });
      expect(result.price).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateGreeks', () => {
    it('should calculate delta between 0 and 1 for call', () => {
      const greeks = calculateGreeks(baseParams);
      expect(greeks.delta).toBeGreaterThan(0);
      expect(greeks.delta).toBeLessThan(1);
    });

    it('should calculate delta between -1 and 0 for put', () => {
      const greeks = calculateGreeks({ ...baseParams, type: 'put' });
      expect(greeks.delta).toBeGreaterThan(-1);
      expect(greeks.delta).toBeLessThan(0);
    });

    it('should have positive gamma', () => {
      const greeks = calculateGreeks(baseParams);
      expect(greeks.gamma).toBeGreaterThan(0);
    });

    it('should have negative theta for long call', () => {
      const greeks = calculateGreeks(baseParams);
      expect(greeks.theta).toBeLessThan(0);
    });

    it('should have positive vega', () => {
      const greeks = calculateGreeks(baseParams);
      expect(greeks.vega).toBeGreaterThan(0);
    });

    it('should have positive rho for call', () => {
      const greeks = calculateGreeks(baseParams);
      expect(greeks.rho).toBeGreaterThan(0);
    });

    it('should have negative rho for put', () => {
      const greeks = calculateGreeks({ ...baseParams, type: 'put' });
      expect(greeks.rho).toBeLessThan(0);
    });

    it('should handle zero time to expiry', () => {
      const greeks = calculateGreeks({ ...baseParams, timeToExpiry: 0 });
      // ATM at expiry, delta is 0.5 boundary
      expect(Math.abs(greeks.delta)).toBeLessThanOrEqual(1);
      expect(greeks.gamma).toBe(0);
    });

    it('should have ATM delta near 0.5', () => {
      const greeks = calculateGreeks(baseParams);
      expect(greeks.delta).toBeCloseTo(0.6, 0.15);
    });
  });

  describe('impliedVolatility', () => {
    it('should recover known volatility', () => {
      const price = blackScholes(baseParams).price;
      const iv = impliedVolatility(price, 100, 100, 0.5, 0.05, 'call');
      expect(iv).toBeCloseTo(0.2, 2);
    });

    it('should return null for invalid inputs', () => {
      expect(impliedVolatility(0, 100, 100, 0.5, 0.05, 'call')).toBeNull();
      expect(impliedVolatility(5, 100, 100, 0, 0.05, 'call')).toBeNull();
    });

    it('should return higher IV for higher market price', () => {
      const iv1 = impliedVolatility(5, 100, 100, 0.5, 0.05, 'call');
      const iv2 = impliedVolatility(10, 100, 100, 0.5, 0.05, 'call');
      expect(iv1).toBeLessThan(iv2!);
    });
  });

  describe('putCallParity', () => {
    it('should detect no arbitrage when parity holds', () => {
      const call = blackScholes(baseParams).price;
      const put = blackScholes({ ...baseParams, type: 'put' }).price;
      const result = putCallParity(call, put, 100, 100, 0.05, 0.5);
      expect(result.arbitrage).toBe(false);
    });

    it('should detect arbitrage opportunity', () => {
      const result = putCallParity(10, 2, 100, 100, 0.05, 0.5);
      expect(result.arbitrage).toBe(true);
    });

    it('should calculate theoretical difference', () => {
      const result = putCallParity(7.48, 4.99, 100, 100, 0.05, 0.5);
      expect(result.theoreticalDiff).toBeCloseTo(100 - 100 * Math.exp(-0.05 * 0.5), 1);
    });
  });

  describe('buildBullCallSpread', () => {
    it('should create valid strategy', () => {
      const strategy = buildBullCallSpread(100, 95, 105, 3);
      expect(strategy.name).toBe('牛市看涨价差');
      expect(strategy.legs.length).toBe(2);
      expect(strategy.maxProfit).toBe(7);
      expect(strategy.maxLoss).toBe(3);
    });

    it('should have one breakeven point', () => {
      const strategy = buildBullCallSpread(100, 95, 105, 3);
      expect(strategy.breakeven.length).toBe(1);
      expect(strategy.breakeven[0]).toBe(98);
    });
  });

  describe('buildBearPutSpread', () => {
    it('should create valid strategy', () => {
      const strategy = buildBearPutSpread(100, 95, 105, 3);
      expect(strategy.name).toBe('熊市看跌价差');
      expect(strategy.legs.length).toBe(2);
      expect(strategy.maxProfit).toBe(7);
      expect(strategy.maxLoss).toBe(3);
    });
  });

  describe('buildStraddle', () => {
    it('should create valid strategy', () => {
      const strategy = buildStraddle(100, 100, 12);
      expect(strategy.name).toBe('跨式策略');
      expect(strategy.legs.length).toBe(2);
      expect(strategy.maxLoss).toBe(12);
      expect(strategy.maxProfit).toBe(Infinity);
    });

    it('should have two breakeven points', () => {
      const strategy = buildStraddle(100, 100, 12);
      expect(strategy.breakeven.length).toBe(2);
      expect(strategy.breakeven[0]).toBe(88);
      expect(strategy.breakeven[1]).toBe(112);
    });
  });

  describe('buildIronCondor', () => {
    it('should create valid strategy', () => {
      const strategy = buildIronCondor(100, 85, 90, 110, 115, 2);
      expect(strategy.name).toBe('铁鹰策略');
      expect(strategy.legs.length).toBe(4);
      expect(strategy.maxProfit).toBe(2);
      expect(strategy.maxLoss).toBe(3);
    });

    it('should have two breakeven points', () => {
      const strategy = buildIronCondor(100, 85, 90, 110, 115, 2);
      expect(strategy.breakeven.length).toBe(2);
    });
  });

  describe('calculateMaxPain', () => {
    it('should find max pain strike', () => {
      const strikes = [90, 95, 100, 105, 110];
      const callOI = [100, 200, 500, 300, 100];
      const putOI = [100, 300, 500, 200, 100];
      const mp = calculateMaxPain(strikes, callOI, putOI);
      expect(strikes).toContain(mp);
    });

    it('should return a strike price', () => {
      const strikes = [95, 100, 105];
      const callOI = [100, 200, 100];
      const putOI = [100, 200, 100];
      const mp = calculateMaxPain(strikes, callOI, putOI);
      expect(typeof mp).toBe('number');
      expect(mp).toBeGreaterThan(0);
    });
  });

  describe('calculatePCR', () => {
    it('should calculate put-call ratio', () => {
      const result = calculatePCR(800, 1000);
      expect(result.ratio).toBeCloseTo(0.8, 2);
      expect(result.sentiment).toBe('neutral');
    });

    it('should detect bearish sentiment', () => {
      const result = calculatePCR(1500, 1000);
      expect(result.ratio).toBe(1.5);
      expect(result.sentiment).toBe('bearish');
    });

    it('should detect bullish sentiment', () => {
      const result = calculatePCR(500, 1000);
      expect(result.ratio).toBe(0.5);
      expect(result.sentiment).toBe('bullish');
    });

    it('should handle zero call volume', () => {
      const result = calculatePCR(100, 0);
      expect(result.ratio).toBe(0);
    });
  });
});
