import { describe, it, expect } from 'vitest';
import { OptionsChainAnalyticsEngine, OptionContract } from '../services/optionsChainAnalyticsEngine';

describe('OptionsChainAnalyticsEngine', () => {
  const engine = new OptionsChainAnalyticsEngine();

  const makeOption = (overrides: Partial<OptionContract> = {}): OptionContract => ({
    strike: 100,
    expiry: '2026-06-20',
    type: 'call',
    bid: 5.0,
    ask: 5.2,
    last: 5.1,
    volume: 500,
    openInterest: 2000,
    impliedVol: 0.25,
    delta: 0.5,
    gamma: 0.02,
    theta: -0.05,
    vega: 0.15,
    ...overrides
  });

  const makeChain = (spot: number = 100): OptionContract[] => {
    const strikes = [90, 95, 100, 105, 110];
    const options: OptionContract[] = [];
    for (const strike of strikes) {
      const moneyness = spot / strike;
      options.push(makeOption({
        strike, type: 'call',
        delta: Math.min(1, Math.max(0, moneyness - 0.8)),
        impliedVol: 0.2 + Math.abs(strike - spot) * 0.005,
        volume: Math.floor(Math.random() * 1000 + 100),
        openInterest: Math.floor(Math.random() * 5000 + 500)
      }));
      options.push(makeOption({
        strike, type: 'put',
        delta: Math.min(0, Math.max(-1, 0.8 - moneyness)),
        impliedVol: 0.22 + Math.abs(strike - spot) * 0.006,
        volume: Math.floor(Math.random() * 800 + 50),
        openInterest: Math.floor(Math.random() * 4000 + 300)
      }));
    }
    return options;
  };

  describe('calculateMaxPain', () => {
    it('returns null for empty options', () => {
      expect(engine.calculateMaxPain([], 100)).toBeNull();
    });

    it('calculates max pain strike', () => {
      const options = makeChain(100);
      const result = engine.calculateMaxPain(options, 100);
      expect(result).not.toBeNull();
      expect(result!.strike).toBeGreaterThan(0);
      expect(result!.totalPain).toBeGreaterThanOrEqual(0);
      expect(result!.painByStrike.size).toBeGreaterThan(0);
    });

    it('max pain is one of available strikes', () => {
      const options = makeChain(100);
      const result = engine.calculateMaxPain(options, 100);
      expect(result).not.toBeNull();
      const strikes = [...new Set(options.map(o => o.strike))];
      expect(strikes).toContain(result!.strike);
    });

    it('pain values are non-negative', () => {
      const options = makeChain(100);
      const result = engine.calculateMaxPain(options, 100);
      expect(result).not.toBeNull();
      result!.painByStrike.forEach(v => expect(v).toBeGreaterThanOrEqual(0));
    });
  });

  describe('analyzePCR', () => {
    it('computes volume and OI ratios', () => {
      const options = makeChain(100);
      const pcr = engine.analyzePCR(options);
      expect(pcr.putVolume).toBeGreaterThanOrEqual(0);
      expect(pcr.callVolume).toBeGreaterThanOrEqual(0);
      expect(pcr.volumeRatio).toBeGreaterThanOrEqual(0);
      expect(pcr.oiRatio).toBeGreaterThanOrEqual(0);
      expect(['bearish', 'bullish', 'neutral']).toContain(pcr.signal);
    });

    it('handles all calls', () => {
      const options = [makeOption({ type: 'call', volume: 1000, openInterest: 5000 })];
      const pcr = engine.analyzePCR(options);
      expect(pcr.putVolume).toBe(0);
      expect(pcr.volumeRatio).toBe(0);
    });

    it('handles all puts', () => {
      const options = [makeOption({ type: 'put', volume: 1000, openInterest: 5000 })];
      const pcr = engine.analyzePCR(options);
      expect(pcr.callVolume).toBe(0);
    });
  });

  describe('analyzeGammaExposure', () => {
    it('returns gamma exposure by strike', () => {
      const options = makeChain(100);
      const gamma = engine.analyzeGammaExposure(options, 100);
      expect(gamma.length).toBeGreaterThan(0);
      gamma.forEach(g => {
        expect(g.strike).toBeGreaterThan(0);
        expect(Number.isFinite(g.netGamma)).toBe(true);
        expect(Number.isFinite(g.cumulativeGamma)).toBe(true);
      });
    });

    it('cumulative gamma is cumulative sum', () => {
      const options = makeChain(100);
      const gamma = engine.analyzeGammaExposure(options, 100);
      let cum = 0;
      for (const g of gamma) {
        cum += g.netGamma;
        expect(g.cumulativeGamma).toBeCloseTo(cum, 5);
      }
    });

    it('handles empty chain', () => {
      expect(engine.analyzeGammaExposure([], 100)).toEqual([]);
    });
  });

  describe('analyzeIVSkew', () => {
    it('computes IV skew by strike', () => {
      const options = makeChain(100);
      const skew = engine.analyzeIVSkew(options, 100);
      expect(skew.length).toBeGreaterThan(0);
      skew.forEach(s => {
        expect(s.strike).toBeGreaterThan(0);
        expect(Number.isFinite(s.skew)).toBe(true);
      });
    });

    it('results are sorted by strike', () => {
      const options = makeChain(100);
      const skew = engine.analyzeIVSkew(options, 100);
      for (let i = 1; i < skew.length; i++) {
        expect(skew[i].strike).toBeGreaterThan(skew[i - 1].strike);
      }
    });
  });

  describe('detectUnusualFlow', () => {
    it('detects unusual volume', () => {
      const options = makeChain(100);
      options.push(makeOption({ volume: 100000, openInterest: 100, type: 'call' }));
      const anomalies = engine.detectUnusualFlow(options);
      expect(anomalies.length).toBe(options.length);
      const unusual = anomalies.filter(a => a.unusualVolume);
      expect(unusual.length).toBeGreaterThan(0);
    });

    it('all anomalies have valid confidence', () => {
      const options = makeChain(100);
      const anomalies = engine.detectUnusualFlow(options);
      anomalies.forEach(a => {
        expect(a.confidence).toBeGreaterThanOrEqual(0);
        expect(a.confidence).toBeLessThanOrEqual(1);
        expect(['bullish', 'bearish', 'unclear']).toContain(a.direction);
      });
    });

    it('handles empty options', () => {
      expect(engine.detectUnusualFlow([])).toEqual([]);
    });
  });

  describe('liquidityScore', () => {
    it('scores liquidity for each option', () => {
      const options = makeChain(100);
      const scores = engine.liquidityScore(options);
      expect(scores.length).toBe(options.length);
      scores.forEach(s => {
        expect(s.score).toBeGreaterThanOrEqual(0);
        expect(s.score).toBeLessThanOrEqual(1);
        expect(s.bidAskSpread).toBeGreaterThanOrEqual(0);
      });
    });

    it('tighter spread gives higher score', () => {
      const tight = engine.liquidityScore([makeOption({ bid: 5.0, ask: 5.01 })]);
      const wide = engine.liquidityScore([makeOption({ bid: 4.0, ask: 6.0 })]);
      expect(tight[0].score).toBeGreaterThan(wide[0].score);
    });
  });

  describe('expirationDistribution', () => {
    it('groups by expiry', () => {
      const options = [
        makeOption({ expiry: '2026-06-20', volume: 100 }),
        makeOption({ expiry: '2026-06-20', volume: 200 }),
        makeOption({ expiry: '2026-09-19', volume: 150 }),
      ];
      const dist = engine.expirationDistribution(options);
      expect(dist.length).toBe(2);
      expect(dist[0].totalVolume).toBe(300);
      expect(dist[1].totalVolume).toBe(150);
    });

    it('results are sorted by expiry', () => {
      const options = [
        makeOption({ expiry: '2026-09-19' }),
        makeOption({ expiry: '2026-03-20' }),
        makeOption({ expiry: '2026-06-20' }),
      ];
      const dist = engine.expirationDistribution(options);
      for (let i = 1; i < dist.length; i++) {
        expect(dist[i].expiry >= dist[i - 1].expiry).toBe(true);
      }
    });
  });

  describe('aggregateGreeks', () => {
    it('aggregates all greeks', () => {
      const options = makeChain(100);
      const greeks = engine.aggregateGreeks(options);
      expect(Number.isFinite(greeks.totalDelta)).toBe(true);
      expect(Number.isFinite(greeks.totalGamma)).toBe(true);
      expect(Number.isFinite(greeks.totalTheta)).toBe(true);
      expect(Number.isFinite(greeks.totalVega)).toBe(true);
      expect(greeks.netDeltaExposure).toBe(greeks.totalDelta * 100);
    });

    it('handles single option', () => {
      const greeks = engine.aggregateGreeks([makeOption({ delta: 0.5, openInterest: 10 })]);
      expect(greeks.totalDelta).toBe(5);
    });
  });
});
