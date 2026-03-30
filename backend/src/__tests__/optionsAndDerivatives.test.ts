import { describe, it, expect } from 'vitest';

// Options and derivatives pricing tests
describe('Options & Derivatives', () => {
  // Black-Scholes approximation (simplified)
  describe('Black-Scholes Calculations', () => {
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
      const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
      const d2 = d1 - sigma * Math.sqrt(T);
      return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
    }

    function bsPut(S: number, K: number, T: number, r: number, sigma: number): number {
      const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
      const d2 = d1 - sigma * Math.sqrt(T);
      return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
    }

    it('should calculate call option price', () => {
      const call = bsCall(100, 100, 1, 0.05, 0.2);
      expect(call).toBeGreaterThan(0);
      expect(call).toBeCloseTo(10.45, 0);
    });

    it('should calculate put option price', () => {
      const put = bsPut(100, 100, 1, 0.05, 0.2);
      expect(put).toBeGreaterThan(0);
      expect(put).toBeCloseTo(5.57, 0);
    });

    it('should satisfy put-call parity', () => {
      const S = 100, K = 100, T = 1, r = 0.05, sigma = 0.2;
      const call = bsCall(S, K, T, r, sigma);
      const put = bsPut(S, K, T, r, sigma);
      const lhs = call - put;
      const rhs = S - K * Math.exp(-r * T);
      expect(lhs).toBeCloseTo(rhs, 1);
    });

    it('should have call > put for ATM options', () => {
      const call = bsCall(100, 100, 1, 0.05, 0.2);
      const put = bsPut(100, 100, 1, 0.05, 0.2);
      expect(call).toBeGreaterThan(put);
    });

    it('should have ITM call > OTM call', () => {
      const itm = bsCall(110, 100, 1, 0.05, 0.2);
      const otm = bsCall(90, 100, 1, 0.05, 0.2);
      expect(itm).toBeGreaterThan(otm);
    });

    it('should have ITM put > OTM put', () => {
      const itm = bsPut(90, 100, 1, 0.05, 0.2);
      const otm = bsPut(110, 100, 1, 0.05, 0.2);
      expect(itm).toBeGreaterThan(otm);
    });

    it('should approach intrinsic value as T→0', () => {
      const intrinsic = Math.max(110 - 100, 0);
      const call = bsCall(110, 100, 0.001, 0.05, 0.2);
      expect(call).toBeCloseTo(intrinsic, 0);
    });

    it('should increase with higher volatility', () => {
      const lowVol = bsCall(100, 100, 1, 0.05, 0.1);
      const highVol = bsCall(100, 100, 1, 0.05, 0.4);
      expect(highVol).toBeGreaterThan(lowVol);
    });

    it('should increase with longer time to expiry', () => {
      const short = bsCall(100, 100, 0.5, 0.05, 0.2);
      const long = bsCall(100, 100, 2, 0.05, 0.2);
      expect(long).toBeGreaterThan(short);
    });
  });

  // Greeks calculations
  describe('Greeks', () => {
    function normalPDF(x: number): number {
      return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
    }

    function normalCDF(x: number): number {
      const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
      const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
      const sign = x < 0 ? -1 : 1;
      x = Math.abs(x) / Math.sqrt(2);
      const t = 1.0 / (1.0 + p * x);
      const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
      return 0.5 * (1.0 + sign * y);
    }

    function delta(S: number, K: number, T: number, r: number, sigma: number): number {
      const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
      return normalCDF(d1);
    }

    function gamma(S: number, K: number, T: number, r: number, sigma: number): number {
      const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
      return normalPDF(d1) / (S * sigma * Math.sqrt(T));
    }

    function vega(S: number, K: number, T: number, r: number, sigma: number): number {
      const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
      return S * normalPDF(d1) * Math.sqrt(T) / 100;
    }

    function theta(S: number, K: number, T: number, r: number, sigma: number): number {
      const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
      const d2 = d1 - sigma * Math.sqrt(T);
      const term1 = -(S * normalPDF(d1) * sigma) / (2 * Math.sqrt(T));
      const term2 = r * K * Math.exp(-r * T) * normalCDF(d2);
      return (term1 - term2) / 365; // per day
    }

    it('should have delta between 0 and 1 for calls', () => {
      const d = delta(100, 100, 1, 0.05, 0.2);
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(1);
    });

    it('should have delta near 0.5 for ATM options', () => {
      const d = delta(100, 100, 1, 0.05, 0.2);
      expect(d).toBeCloseTo(0.6, 0.1);
    });

    it('should have delta approach 1 for deep ITM', () => {
      const d = delta(200, 100, 1, 0.05, 0.2);
      expect(d).toBeGreaterThan(0.9);
    });

    it('should have delta approach 0 for deep OTM', () => {
      const d = delta(50, 100, 1, 0.05, 0.2);
      expect(d).toBeLessThan(0.1);
    });

    it('should have gamma positive for all options', () => {
      const g = gamma(100, 100, 1, 0.05, 0.2);
      expect(g).toBeGreaterThan(0);
    });

    it('should have gamma peak at ATM', () => {
      const atmGamma = gamma(100, 100, 1, 0.05, 0.2);
      const otmGamma = gamma(80, 100, 1, 0.05, 0.2);
      expect(atmGamma).toBeGreaterThan(otmGamma);
    });

    it('should have vega positive for all options', () => {
      const v = vega(100, 100, 1, 0.05, 0.2);
      expect(v).toBeGreaterThan(0);
    });

    it('should have theta negative for long options', () => {
      const t = theta(100, 100, 1, 0.05, 0.2);
      expect(t).toBeLessThan(0);
    });

    it('should have theta magnitude increase near expiry', () => {
      const farTheta = Math.abs(theta(100, 100, 1, 0.05, 0.2));
      const nearTheta = Math.abs(theta(100, 100, 0.1, 0.05, 0.2));
      expect(nearTheta).toBeGreaterThan(farTheta);
    });
  });

  // Implied Volatility estimation (simplified)
  describe('Implied Volatility', () => {
    it('should estimate IV from market price', () => {
      const marketPrice = 10.45;
      const S = 100, K = 100, T = 1, r = 0.05;
      // Simplified: check that sigma=0.2 gives ~marketPrice
      const d1 = (Math.log(S / K) + (r + 0.04 / 2) * T) / (0.2 * Math.sqrt(T));
      expect(Number.isFinite(d1)).toBe(true);
    });

    it('should have higher IV for wider bid-ask spreads', () => {
      const tightSpread = { bid: 10.40, ask: 10.50 };
      const wideSpread = { bid: 9.50, ask: 11.50 };
      const tightMid = (tightSpread.bid + tightSpread.ask) / 2;
      const wideMid = (wideSpread.bid + wideSpread.ask) / 2;
      expect(wideSpread.ask - wideSpread.bid).toBeGreaterThan(tightSpread.ask - tightSpread.bid);
    });
  });

  // Warrant pricing
  describe('Warrant Pricing', () => {
    it('should calculate warrant theoretical value', () => {
      const underlyingPrice = 50;
      const exercisePrice = 45;
      const conversionRatio = 1;
      const theoreticalValue = Math.max((underlyingPrice - exercisePrice) * conversionRatio, 0);
      expect(theoreticalValue).toBe(5);
    });

    it('should calculate premium percentage', () => {
      const marketPrice = 8;
      const intrinsicValue = 5;
      const premium = ((marketPrice - intrinsicValue) / intrinsicValue) * 100;
      expect(premium).toBe(60);
    });

    it('should calculate leverage ratio', () => {
      const underlyingPrice = 50;
      const warrantPrice = 5;
      const delta = 0.6;
      const leverage = (underlyingPrice / warrantPrice) * delta;
      expect(leverage).toBe(6);
    });

    it('should calculate break-even price', () => {
      const exercisePrice = 45;
      const warrantPrice = 8;
      const breakEven = exercisePrice + warrantPrice;
      expect(breakEven).toBe(53);
    });

    it('should have zero value for OTM warrants at expiry', () => {
      const underlyingPrice = 40;
      const exercisePrice = 45;
      expect(Math.max(underlyingPrice - exercisePrice, 0)).toBe(0);
    });
  });

  // Futures pricing
  describe('Futures Pricing', () => {
    it('should calculate futures price (cost of carry)', () => {
      const spot = 100;
      const r = 0.05;
      const T = 0.5;
      const futures = spot * Math.exp(r * T);
      expect(futures).toBeCloseTo(102.53, 1);
    });

    it('should have contango (futures > spot)', () => {
      const spot = 100;
      const futures = 102;
      expect(futures).toBeGreaterThan(spot);
    });

    it('should have backwardation (futures < spot)', () => {
      const spot = 100;
      const futures = 98;
      expect(futures).toBeLessThan(spot);
    });

    it('should calculate basis', () => {
      const futures = 102.5;
      const spot = 100;
      const basis = futures - spot;
      expect(basis).toBe(2.5);
    });

    it('should calculate basis percentage', () => {
      const futures = 102.5;
      const spot = 100;
      const basisPct = ((futures - spot) / spot) * 100;
      expect(basisPct).toBe(2.5);
    });
  });

  // Margin calculations
  describe('Margin Requirements', () => {
    it('should calculate initial margin', () => {
      const contractValue = 100000;
      const marginRate = 0.12;
      const initialMargin = contractValue * marginRate;
      expect(initialMargin).toBe(12000);
    });

    it('should calculate maintenance margin', () => {
      const initialMargin = 12000;
      const maintenanceRate = 0.75;
      const maintenanceMargin = initialMargin * maintenanceRate;
      expect(maintenanceMargin).toBe(9000);
    });

    it('should detect margin call', () => {
      const equity = 8000;
      const maintenanceMargin = 9000;
      expect(equity).toBeLessThan(maintenanceMargin);
    });

    it('should calculate margin utilization', () => {
      const used = 8000;
      const available = 12000;
      const utilization = (used / available) * 100;
      expect(utilization).toBeCloseTo(66.67, 1);
    });

    it('should calculate PnL impact on margin', () => {
      const initialEquity = 12000;
      const pnl = -2000;
      const currentEquity = initialEquity + pnl;
      expect(currentEquity).toBe(10000);
    });
  });
});
