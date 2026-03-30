import { describe, it, expect } from 'vitest';
import {
  blackScholes,
  calculateMaxPain,
  analyzePCR,
  analyzeIVSkew,
  type OptionData,
  type OptionChain,
} from '../utils/optionsAnalysisEngine';

describe('OptionsAnalysisEngine', () => {
  describe('Black-Scholes', () => {
    it('should price ATM call', () => {
      const result = blackScholes(100, 100, 0.25, 0.05, 0.2, 'call');
      expect(result.price).toBeGreaterThan(0);
      expect(result.delta).toBeGreaterThan(0.4);
      expect(result.delta).toBeLessThan(0.7);
    });

    it('should price ATM put', () => {
      const result = blackScholes(100, 100, 0.25, 0.05, 0.2, 'put');
      expect(result.price).toBeGreaterThan(0);
      expect(result.delta).toBeGreaterThan(-0.6);
      expect(result.delta).toBeLessThan(-0.3);
    });

    it('should price ITM call higher than OTM', () => {
      const itm = blackScholes(100, 90, 0.25, 0.05, 0.2, 'call');
      const otm = blackScholes(100, 110, 0.25, 0.05, 0.2, 'call');
      expect(itm.price).toBeGreaterThan(otm.price);
    });

    it('should have positive gamma for both types', () => {
      const callResult = blackScholes(100, 100, 0.25, 0.05, 0.2, 'call');
      const putResult = blackScholes(100, 100, 0.25, 0.05, 0.2, 'put');
      expect(callResult.gamma).toBeGreaterThan(0);
      expect(putResult.gamma).toBeGreaterThan(0);
    });

    it('should have negative theta', () => {
      const result = blackScholes(100, 100, 0.25, 0.05, 0.2, 'call');
      expect(result.theta).toBeLessThan(0);
    });

    it('should have positive vega', () => {
      const result = blackScholes(100, 100, 0.25, 0.05, 0.2, 'call');
      expect(result.vega).toBeGreaterThan(0);
    });

    it('should return intrinsic at expiry', () => {
      const itm = blackScholes(110, 100, 0, 0.05, 0.2, 'call');
      expect(itm.price).toBe(10);
      const otm = blackScholes(90, 100, 0, 0.05, 0.2, 'call');
      expect(otm.price).toBe(0);
    });

    it('should price higher with higher volatility', () => {
      const low = blackScholes(100, 100, 0.25, 0.05, 0.15, 'call');
      const high = blackScholes(100, 100, 0.25, 0.05, 0.3, 'call');
      expect(high.price).toBeGreaterThan(low.price);
    });

    it('should price higher with longer expiry', () => {
      const short = blackScholes(100, 100, 0.1, 0.05, 0.2, 'call');
      const long = blackScholes(100, 100, 0.5, 0.05, 0.2, 'call');
      expect(long.price).toBeGreaterThan(short.price);
    });

    it('should handle deep ITM put', () => {
      const result = blackScholes(100, 150, 0.25, 0.05, 0.2, 'put');
      expect(result.price).toBeGreaterThan(40);
    });

    it('should handle zero strike (edge case)', () => {
      const result = blackScholes(100, 0.01, 0.25, 0.05, 0.2, 'call');
      expect(result.price).toBeGreaterThan(0);
    });
  });

  describe('calculateMaxPain', () => {
    const chain: OptionChain = {
      calls: [
        { ticker: 'C95', underlying: 'SPY', type: 'call', strike: 95, expiry: '2024-03-15', price: 7, underlyingPrice: 100, iv: 0.2, volume: 100, openInterest: 1000, delta: 0.8, gamma: 0.02, theta: -0.05, vega: 0.15 },
        { ticker: 'C100', underlying: 'SPY', type: 'call', strike: 100, expiry: '2024-03-15', price: 3, underlyingPrice: 100, iv: 0.2, volume: 200, openInterest: 2000, delta: 0.5, gamma: 0.04, theta: -0.08, vega: 0.2 },
        { ticker: 'C105', underlying: 'SPY', type: 'call', strike: 105, expiry: '2024-03-15', price: 1, underlyingPrice: 100, iv: 0.2, volume: 150, openInterest: 1500, delta: 0.2, gamma: 0.03, theta: -0.04, vega: 0.12 },
      ],
      puts: [
        { ticker: 'P95', underlying: 'SPY', type: 'put', strike: 95, expiry: '2024-03-15', price: 1, underlyingPrice: 100, iv: 0.2, volume: 150, openInterest: 1500, delta: -0.2, gamma: 0.03, theta: -0.04, vega: 0.12 },
        { ticker: 'P100', underlying: 'SPY', type: 'put', strike: 100, expiry: '2024-03-15', price: 3, underlyingPrice: 100, iv: 0.2, volume: 200, openInterest: 2000, delta: -0.5, gamma: 0.04, theta: -0.08, vega: 0.2 },
        { ticker: 'P105', underlying: 'SPY', type: 'put', strike: 105, expiry: '2024-03-15', price: 7, underlyingPrice: 100, iv: 0.2, volume: 100, openInterest: 1000, delta: -0.8, gamma: 0.02, theta: -0.05, vega: 0.15 },
      ],
      spotPrice: 100,
      maxPain: 0,
      pcr: 0,
    };

    it('should calculate max pain', () => {
      const maxPain = calculateMaxPain(chain);
      expect(maxPain).toBeGreaterThan(0);
    });

    it('should return a valid strike', () => {
      const maxPain = calculateMaxPain(chain);
      const allStrikes = [...chain.calls.map((c) => c.strike), ...chain.puts.map((p) => p.strike)];
      expect(allStrikes).toContain(maxPain);
    });

    it('should handle empty chain', () => {
      const empty: OptionChain = { calls: [], puts: [], spotPrice: 100, maxPain: 0, pcr: 0 };
      const maxPain = calculateMaxPain(empty);
      expect(maxPain).toBe(100);
    });
  });

  describe('analyzePCR', () => {
    const chain: OptionChain = {
      calls: [
        { ticker: 'C1', underlying: 'SPY', type: 'call', strike: 100, expiry: '2024-03-15', price: 3, underlyingPrice: 100, iv: 0.2, volume: 500, openInterest: 5000, delta: 0.5, gamma: 0.04, theta: -0.08, vega: 0.2 },
      ],
      puts: [
        { ticker: 'P1', underlying: 'SPY', type: 'put', strike: 100, expiry: '2024-03-15', price: 3, underlyingPrice: 100, iv: 0.2, volume: 600, openInterest: 4000, delta: -0.5, gamma: 0.04, theta: -0.08, vega: 0.2 },
      ],
      spotPrice: 100,
      maxPain: 0,
      pcr: 0,
    };

    it('should calculate volume PCR', () => {
      const result = analyzePCR(chain);
      expect(result.volumePCR).toBe(1.2); // 600/500
    });

    it('should calculate OI PCR', () => {
      const result = analyzePCR(chain);
      expect(result.oiPCR).toBe(0.8); // 4000/5000
    });

    it('should signal bullish for high PCR', () => {
      const highPCR: OptionChain = {
        ...chain,
        puts: [{ ...chain.puts[0], volume: 700 }],
      };
      const result = analyzePCR(highPCR);
      expect(result.signal).toBe('bullish');
    });

    it('should signal bearish for low PCR', () => {
      const lowPCR: OptionChain = {
        ...chain,
        puts: [{ ...chain.puts[0], volume: 200 }],
      };
      const result = analyzePCR(lowPCR);
      expect(result.signal).toBe('bearish');
    });

    it('should handle zero call volume', () => {
      const noCall: OptionChain = {
        ...chain,
        calls: [{ ...chain.calls[0], volume: 0 }],
      };
      const result = analyzePCR(noCall);
      expect(result.volumePCR).toBe(0);
    });
  });

  describe('analyzeIVSkew', () => {
    const options: OptionData[] = [
      { ticker: 'P90', underlying: 'SPY', type: 'put', strike: 90, expiry: '2024-03-15', price: 0.5, underlyingPrice: 100, iv: 0.3, volume: 100, openInterest: 1000, delta: -0.1, gamma: 0.01, theta: -0.02, vega: 0.05, moneyness: -0.1 },
      { ticker: 'C100', underlying: 'SPY', type: 'call', strike: 100, expiry: '2024-03-15', price: 3, underlyingPrice: 100, iv: 0.2, volume: 200, openInterest: 2000, delta: 0.5, gamma: 0.04, theta: -0.08, vega: 0.2, moneyness: 0 },
      { ticker: 'C110', underlying: 'SPY', type: 'call', strike: 110, expiry: '2024-03-15', price: 0.3, underlyingPrice: 100, iv: 0.18, volume: 80, openInterest: 800, delta: 0.1, gamma: 0.01, theta: -0.02, vega: 0.05, moneyness: 0.1 },
    ];

    it('should calculate skew', () => {
      const result = analyzeIVSkew(options);
      expect(typeof result.skew).toBe('number');
    });

    it('should identify smirk for high put IV', () => {
      const result = analyzeIVSkew(options);
      expect(['smirk', 'smile', 'flat']).toContain(result.smile);
    });

    it('should determine direction', () => {
      const result = analyzeIVSkew(options);
      expect(['bullish', 'bearish', 'neutral']).toContain(result.direction);
    });

    it('should detect bearish skew when puts have much higher IV', () => {
      const options2: OptionData[] = options.map((o) => o.type === 'put' ? { ...o, iv: 0.5 } : o);
      const result = analyzeIVSkew(options2);
      expect(result.smile).toBe('smirk');
      expect(result.direction).toBe('bearish');
    });

    it('should handle empty options', () => {
      const result = analyzeIVSkew([]);
      expect(result.smile).toBe('flat');
    });
  });
});
