import { describe, it, expect } from 'vitest';
import {
  calculateMaxPain,
  calculatePutCallRatio,
  calculateSkew,
  buildTermStructure,
  analyzeGreeks,
  findOptionsSupportResistance,
  analyzeOptionChain,
} from '../utils/optionsChainEngine';
import type { OptionContract } from '../utils/optionsChainEngine';

// Generate test option contracts
function generateOptionChain(spotPrice: number = 100): OptionContract[] {
  const contracts: OptionContract[] = [];
  const strikes = [90, 95, 100, 105, 110];

  for (const strike of strikes) {
    for (const expiry of [30, 60, 90]) {
      contracts.push({
        strike,
        expiry,
        type: 'call',
        lastPrice: Math.max(0, spotPrice - strike + 5),
        bid: Math.max(0, spotPrice - strike + 4.5),
        ask: Math.max(0, spotPrice - strike + 5.5),
        volume: Math.floor(Math.random() * 1000) + 100,
        openInterest: Math.floor(Math.random() * 5000) + 500,
        impliedVolatility: 0.2 + Math.random() * 0.2,
        delta: Math.min(1, Math.max(0, (spotPrice - strike + 10) / 20)),
        gamma: 0.02 + Math.random() * 0.02,
        theta: -0.05 - Math.random() * 0.05,
        vega: 0.1 + Math.random() * 0.1,
      });

      contracts.push({
        strike,
        expiry,
        type: 'put',
        lastPrice: Math.max(0, strike - spotPrice + 5),
        bid: Math.max(0, strike - spotPrice + 4.5),
        ask: Math.max(0, strike - spotPrice + 5.5),
        volume: Math.floor(Math.random() * 800) + 80,
        openInterest: Math.floor(Math.random() * 4000) + 400,
        impliedVolatility: 0.22 + Math.random() * 0.2,
        delta: -Math.min(1, Math.max(0, (strike - spotPrice + 10) / 20)),
        gamma: 0.02 + Math.random() * 0.02,
        theta: -0.05 - Math.random() * 0.05,
        vega: 0.1 + Math.random() * 0.1,
      });
    }
  }

  return contracts;
}

describe('Options Chain Analysis Engine', () => {
  const spotPrice = 100;
  const contracts = generateOptionChain(spotPrice);

  describe('calculateMaxPain', () => {
    it('should return a valid max pain strike', () => {
      const maxPain = calculateMaxPain(contracts);
      expect(maxPain).toBeGreaterThan(0);
      const strikes = [...new Set(contracts.map((c) => c.strike))];
      expect(strikes).toContain(maxPain);
    });

    it('should handle empty contracts', () => {
      const maxPain = calculateMaxPain([]);
      expect(maxPain).toBe(0);
    });
  });

  describe('calculatePutCallRatio', () => {
    it('should calculate volume ratio', () => {
      const { volumeRatio } = calculatePutCallRatio(contracts);
      expect(volumeRatio).toBeGreaterThan(0);
    });

    it('should calculate OI ratio', () => {
      const { oiRatio } = calculatePutCallRatio(contracts);
      expect(oiRatio).toBeGreaterThan(0);
    });

    it('should handle calls-only contracts', () => {
      const callsOnly = contracts.filter((c) => c.type === 'call');
      const { volumeRatio } = calculatePutCallRatio(callsOnly);
      expect(volumeRatio).toBe(0);
    });
  });

  describe('calculateSkew', () => {
    it('should calculate put-call IV skew', () => {
      const skew = calculateSkew(contracts, spotPrice);
      expect(typeof skew).toBe('number');
    });

    it('should return 0 for insufficient data', () => {
      const skew = calculateSkew([], spotPrice);
      expect(skew).toBe(0);
    });
  });

  describe('buildTermStructure', () => {
    it('should build term structure by expiry', () => {
      const ts = buildTermStructure(contracts);
      expect(ts.length).toBeGreaterThan(0);

      ts.forEach((point) => {
        expect(point.daysToExpiry).toBeGreaterThan(0);
        expect(point.avgIV).toBeGreaterThan(0);
      });
    });

    it('should sort by days to expiry', () => {
      const ts = buildTermStructure(contracts);
      for (let i = 1; i < ts.length; i++) {
        expect(ts[i].daysToExpiry).toBeGreaterThanOrEqual(
          ts[i - 1].daysToExpiry
        );
      }
    });
  });

  describe('analyzeGreeks', () => {
    it('should calculate net greeks', () => {
      const greeks = analyzeGreeks(contracts, spotPrice);

      expect(typeof greeks.netDelta).toBe('number');
      expect(typeof greeks.netGamma).toBe('number');
      expect(typeof greeks.netTheta).toBe('number');
      expect(typeof greeks.netVega).toBe('number');
    });

    it('should calculate gamma exposure', () => {
      const greeks = analyzeGreeks(contracts, spotPrice);
      expect(typeof greeks.gammaExposure).toBe('number');
    });

    it('should determine dealer position', () => {
      const greeks = analyzeGreeks(contracts, spotPrice);
      expect(['long_gamma', 'short_gamma', 'neutral']).toContain(
        greeks.dealerPosition
      );
    });
  });

  describe('findOptionsSupportResistance', () => {
    it('should find support and resistance zones', () => {
      const zones = findOptionsSupportResistance(contracts, spotPrice);

      expect(zones.supportZone.length).toBe(2);
      expect(zones.resistanceZone.length).toBe(2);
      expect(zones.supportZone[1]).toBeLessThanOrEqual(spotPrice);
      expect(zones.resistanceZone[0]).toBeGreaterThanOrEqual(spotPrice);
    });
  });

  describe('analyzeOptionChain', () => {
    it('should return complete analysis', () => {
      const analysis = analyzeOptionChain(contracts, spotPrice);

      expect(analysis.maxPain).toBeGreaterThan(0);
      expect(analysis.putCallRatio).toBeGreaterThan(0);
      expect(analysis.totalCallVolume).toBeGreaterThan(0);
      expect(analysis.totalPutVolume).toBeGreaterThan(0);
      expect(analysis.totalCallOI).toBeGreaterThan(0);
      expect(analysis.totalPutOI).toBeGreaterThan(0);
      expect(typeof analysis.skew).toBe('number');
      expect(analysis.termStructure.length).toBeGreaterThan(0);
      expect(['bullish', 'bearish', 'neutral']).toContain(analysis.sentiment);
    });
  });
});
