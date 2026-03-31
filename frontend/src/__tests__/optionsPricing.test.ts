import { describe, it, expect } from 'vitest';
import {
  blackScholes,
  binomialTree,
  impliedVolatility,
  volatilitySmile,
  generateGreeksSurface,
  type OptionParams,
  type OptionType,
} from '../utils/optionsPricing';

const baseParams: OptionParams = {
  spot: 100,
  strike: 100,
  timeToExpiry: 0.25, // 3个月
  riskFreeRate: 0.05,
  volatility: 0.2,
};

describe('期权定价引擎', () => {
  describe('blackScholes', () => {
    it('should price ATM call correctly', () => {
      const result = blackScholes(baseParams, 'call');
      expect(result.price).toBeGreaterThan(0);
      expect(result.price).toBeLessThan(baseParams.spot);
      expect(result.delta).toBeGreaterThan(0.4);
      expect(result.delta).toBeLessThan(0.6);
    });

    it('should price ATM put correctly', () => {
      const result = blackScholes(baseParams, 'put');
      expect(result.price).toBeGreaterThan(0);
      expect(result.delta).toBeLessThan(0);
      expect(result.delta).toBeGreaterThan(-0.6);
    });

    it('should satisfy put-call parity', () => {
      const call = blackScholes(baseParams, 'call');
      const put = blackScholes(baseParams, 'put');
      const { spot, strike, timeToExpiry, riskFreeRate } = baseParams;
      // C - P = S - K * e^(-rT)
      const parity = call.price - put.price;
      const expected = spot - strike * Math.exp(-riskFreeRate * timeToExpiry);
      expect(parity).toBeCloseTo(expected, 4);
    });

    it('should have delta between 0 and 1 for calls', () => {
      const params = { ...baseParams, strike: 80 }; // ITM
      const result = blackScholes(params, 'call');
      expect(result.delta).toBeGreaterThan(0.8);
    });

    it('should have delta close to 0 for deep OTM calls', () => {
      const params = { ...baseParams, strike: 150 }; // Deep OTM
      const result = blackScholes(params, 'call');
      expect(result.delta).toBeLessThan(0.1);
    });

    it('should have positive gamma', () => {
      const result = blackScholes(baseParams, 'call');
      expect(result.gamma).toBeGreaterThan(0);
    });

    it('should have positive vega', () => {
      const result = blackScholes(baseParams, 'call');
      expect(result.vega).toBeGreaterThan(0);
    });

    it('should have negative theta for long options', () => {
      const result = blackScholes(baseParams, 'call');
      expect(result.theta).toBeLessThan(0);
    });

    it('should return intrinsic for expired option', () => {
      const params = { ...baseParams, timeToExpiry: 0 };
      const call = blackScholes(params, 'call');
      expect(call.price).toBe(Math.max(baseParams.spot - baseParams.strike, 0));
      expect(call.timeValue).toBe(0);
    });

    it('should return intrinsic for zero volatility', () => {
      const params = { ...baseParams, volatility: 0 };
      const call = blackScholes(params, 'call');
      const intrinsic = Math.max(baseParams.spot - baseParams.strike, 0);
      expect(call.price).toBeCloseTo(intrinsic, 10);
    });

    it('should handle dividend yield', () => {
      const params = { ...baseParams, dividendYield: 0.03 };
      const withDiv = blackScholes(params, 'call');
      const withoutDiv = blackScholes(baseParams, 'call');
      // 有股息的看涨期权价格应该更低
      expect(withDiv.price).toBeLessThan(withoutDiv.price);
    });
  });

  describe('binomialTree', () => {
    it('should converge to Black-Scholes for European options', () => {
      const bsPrice = blackScholes(baseParams, 'call').price;
      const treePrice = binomialTree(baseParams, 'call', 'european', 200);
      expect(treePrice).toBeCloseTo(bsPrice, 1);
    });

    it('should price American put higher than European put', () => {
      const params = { ...baseParams, strike: 110 }; // ITM put
      const american = binomialTree(params, 'put', 'american', 100);
      const european = binomialTree(params, 'put', 'european', 100);
      expect(american).toBeGreaterThanOrEqual(european - 0.01);
    });

    it('should return intrinsic for zero time', () => {
      const params = { ...baseParams, timeToExpiry: 0 };
      const price = binomialTree(params, 'call', 'european', 10);
      expect(price).toBe(Math.max(baseParams.spot - baseParams.strike, 0));
    });

    it('should handle more steps for better accuracy', () => {
      const bsPrice = blackScholes(baseParams, 'call').price;
      const p50 = binomialTree(baseParams, 'call', 'european', 50);
      const p200 = binomialTree(baseParams, 'call', 'european', 200);
      // 更多步骤应该更接近BS
      expect(Math.abs(p200 - bsPrice)).toBeLessThanOrEqual(Math.abs(p50 - bsPrice) + 0.1);
    });
  });

  describe('impliedVolatility', () => {
    it('should recover known volatility', () => {
      const targetVol = 0.25;
      const params = { ...baseParams, volatility: targetVol };
      const marketPrice = blackScholes(params, 'call').price;
      const iv = impliedVolatility(marketPrice, baseParams, 'call');
      expect(iv).toBeCloseTo(targetVol, 3);
    });

    it('should work for puts', () => {
      const targetVol = 0.3;
      const params = { ...baseParams, volatility: targetVol };
      const marketPrice = blackScholes(params, 'put').price;
      const iv = impliedVolatility(marketPrice, baseParams, 'put');
      expect(iv).toBeCloseTo(targetVol, 3);
    });

    it('should handle extreme high price by returning high IV', () => {
      const iv = impliedVolatility(99999, baseParams, 'call');
      // 二分法会收敛到最大vol范围
      expect(iv).toBeGreaterThan(1);
    });

    it('should handle very low price by returning low IV', () => {
      const iv = impliedVolatility(0.001, baseParams, 'call');
      // 应该返回很低的IV
      if (iv !== null) {
        expect(iv).toBeLessThan(0.1);
      }
    });
  });

  describe('volatilitySmile', () => {
    it('should return vols for all strikes', () => {
      const strikes = [90, 95, 100, 105, 110];
      const vols = volatilitySmile(100, strikes, 0.25, 0.2);
      expect(vols.length).toBe(5);
      for (const v of vols) {
        expect(v).toBeGreaterThan(0);
      }
    });

    it('ATM vol should be closest to input', () => {
      const strikes = [90, 100, 110];
      const vols = volatilitySmile(100, strikes, 0.25, 0.2);
      // ATM (strike=100) 的波动率应该最接近0.2
      expect(Math.abs(vols[1] - 0.2)).toBeLessThanOrEqual(Math.abs(vols[0] - 0.2));
      expect(Math.abs(vols[1] - 0.2)).toBeLessThanOrEqual(Math.abs(vols[2] - 0.2));
    });

    it('should produce skew with positive skew param', () => {
      const strikes = [80, 90, 100, 110, 120];
      const vols = volatilitySmile(100, strikes, 0.25, 0.2, 0.1);
      // OTM put (low strike) 应该有更高波动率 (skew)
      // log(S/K) for K=80 is positive, so positive skew gives higher vol
      expect(vols[0]).toBeGreaterThan(vols[4]);
    });
  });

  describe('generateGreeksSurface', () => {
    it('should generate correct dimensions', () => {
      const strikes = [90, 100, 110];
      const expiries = [0.25, 0.5, 1.0];
      const surface = generateGreeksSurface(100, strikes, expiries, 0.05, 0.2);

      expect(surface.callPrices.length).toBe(3); // 3个到期日
      expect(surface.callPrices[0].length).toBe(3); // 3个行权价
      expect(surface.strikes).toEqual(strikes);
      expect(surface.expiries).toEqual(expiries);
    });

    it('call prices should decrease with strike', () => {
      const strikes = [80, 90, 100, 110, 120];
      const surface = generateGreeksSurface(100, strikes, [0.25], 0.05, 0.2);
      const prices = surface.callPrices[0];
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).toBeLessThanOrEqual(prices[i - 1] + 0.001);
      }
    });

    it('put prices should increase with strike', () => {
      const strikes = [80, 90, 100, 110, 120];
      const surface = generateGreeksSurface(100, strikes, [0.25], 0.05, 0.2);
      const prices = surface.putPrices[0];
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1] - 0.001);
      }
    });

    it('gammas should be positive', () => {
      const strikes = [90, 100, 110];
      const surface = generateGreeksSurface(100, strikes, [0.25], 0.05, 0.2);
      for (const row of surface.gammas) {
        for (const g of row) {
          expect(g).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('edge cases', () => {
    it('should handle zero spot', () => {
      const params = { ...baseParams, spot: 0 };
      const result = blackScholes(params, 'call');
      expect(result.price).toBe(0);
    });

    it('should handle very large spot', () => {
      const params = { ...baseParams, spot: 1000000, strike: 100 };
      const result = blackScholes(params, 'call');
      expect(result.price).toBeGreaterThan(0);
      expect(result.delta).toBeCloseTo(1, 1);
    });

    it('should handle very short expiry', () => {
      const params = { ...baseParams, timeToExpiry: 0.001 };
      const result = blackScholes(params, 'call');
      expect(result.price).toBeGreaterThan(0);
    });
  });
});
