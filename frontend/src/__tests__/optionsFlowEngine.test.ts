import { describe, it, expect } from 'vitest';
import {
  calculatePCR,
  detectUnusualActivity,
  analyzeIVSurface,
  trackSmartMoney,
  calculateMaxPain,
  analyzeGammaExposure,
  recommendStrategies,
  type OptionsFlow,
  type IVSurfacePoint,
} from '../utils/optionsFlowEngine';

function generateFlow(symbol: string, type: 'call' | 'put', overrides: Partial<OptionsFlow> = {}): OptionsFlow {
  return {
    timestamp: '2026-03-15T10:00:00Z',
    symbol,
    type,
    strike: 100,
    expiry: '2026-04-15',
    price: 2.5,
    volume: 50,
    openInterest: 500,
    impliedVolatility: 0.25,
    delta: type === 'call' ? 0.5 : -0.5,
    gamma: 0.02,
    vega: 0.15,
    theta: -0.05,
    underlyingPrice: 100,
    side: 'buy_to_open',
    ...overrides,
  };
}

const mockFlows: OptionsFlow[] = [
  generateFlow('AAPL', 'call', { timestamp: '2026-03-15T10:00:00Z', volume: 100 }),
  generateFlow('AAPL', 'put', { timestamp: '2026-03-15T10:01:00Z', volume: 50 }),
  generateFlow('AAPL', 'call', { timestamp: '2026-03-15T10:02:00Z', volume: 80 }),
  generateFlow('AAPL', 'put', { timestamp: '2026-03-15T10:03:00Z', volume: 30 }),
  generateFlow('AAPL', 'call', { timestamp: '2026-03-16T10:00:00Z', volume: 60 }),
  generateFlow('AAPL', 'put', { timestamp: '2026-03-16T10:01:00Z', volume: 90 }),
];

describe('期权资金流引擎', () => {
  describe('calculatePCR', () => {
    it('should calculate Put/Call ratios', () => {
      const results = calculatePCR(mockFlows);
      expect(results.length).toBe(2); // 2 dates
      expect(results[0].date).toBe('2026-03-15');
      expect(results[0].volumePCR).toBeGreaterThan(0);
    });

    it('should determine sentiment correctly', () => {
      const bullishFlows = [
        generateFlow('X', 'call', { volume: 1000, timestamp: '2026-03-15T10:00:00Z' }),
        generateFlow('X', 'put', { volume: 10, timestamp: '2026-03-15T10:01:00Z' }),
      ];
      const results = calculatePCR(bullishFlows);
      expect(results[0].sentiment).toBe('bullish');
    });

    it('should handle bearish sentiment', () => {
      const bearishFlows = [
        generateFlow('X', 'call', { volume: 10, timestamp: '2026-03-15T10:00:00Z' }),
        generateFlow('X', 'put', { volume: 1000, timestamp: '2026-03-15T10:01:00Z' }),
      ];
      const results = calculatePCR(bearishFlows);
      expect(results[0].sentiment).toBe('bearish');
    });

    it('should handle empty flows', () => {
      const results = calculatePCR([]);
      expect(results).toEqual([]);
    });

    it('should calculate premium PCR', () => {
      const results = calculatePCR(mockFlows);
      results.forEach(r => {
        expect(r.premiumPCR).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('detectUnusualActivity', () => {
    it('should detect volume anomalies', () => {
      const flows = [
        ...Array.from({ length: 10 }, () => generateFlow('AAPL', 'call', { volume: 50 })),
        generateFlow('AAPL', 'call', { volume: 5000 }), // Anomaly
      ];
      const unusual = detectUnusualActivity(flows);
      expect(unusual.length).toBeGreaterThan(0);
      expect(unusual[0].severity).toBeDefined();
    });

    it('should detect premium anomalies', () => {
      const flows = [
        generateFlow('AAPL', 'call', { price: 50, volume: 100 }), // $500,000 premium
      ];
      const unusual = detectUnusualActivity(flows, { premiumThreshold: 100000 });
      expect(unusual.length).toBeGreaterThan(0);
    });

    it('should return sorted by score', () => {
      const flows = [
        generateFlow('AAPL', 'call', { volume: 100 }),
        generateFlow('AAPL', 'call', { volume: 10000 }),
      ];
      const unusual = detectUnusualActivity(flows);
      for (let i = 1; i < unusual.length; i++) {
        expect(unusual[i].score).toBeLessThanOrEqual(unusual[i - 1].score);
      }
    });

    it('should handle normal data', () => {
      const flows = Array.from({ length: 20 }, () => generateFlow('AAPL', 'call', { volume: 50 }));
      const unusual = detectUnusualActivity(flows);
      expect(unusual.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('analyzeIVSurface', () => {
    const surface: IVSurfacePoint[] = [
      { strike: 90, expiry: '2026-04-15', iv: 0.30, moneyness: 0.9, dte: 30 },
      { strike: 95, expiry: '2026-04-15', iv: 0.27, moneyness: 0.95, dte: 30 },
      { strike: 100, expiry: '2026-04-15', iv: 0.25, moneyness: 1.0, dte: 30 },
      { strike: 105, expiry: '2026-04-15', iv: 0.23, moneyness: 1.05, dte: 30 },
      { strike: 110, expiry: '2026-04-15', iv: 0.22, moneyness: 1.1, dte: 30 },
      { strike: 100, expiry: '2026-05-15', iv: 0.28, moneyness: 1.0, dte: 60 },
      { strike: 100, expiry: '2026-06-15', iv: 0.30, moneyness: 1.0, dte: 90 },
    ];

    it('should calculate skew', () => {
      const result = analyzeIVSurface(surface, 100);
      expect(result.skew).toBeGreaterThan(0); // Put IV > Call IV (typical)
    });

    it('should calculate term structure', () => {
      const result = analyzeIVSurface(surface, 100);
      expect(result.termStructure).toBeGreaterThan(0); // Far term IV > Near term
    });

    it('should find ATM IV', () => {
      const result = analyzeIVSurface(surface, 100);
      expect(result.atmIV).toBe(0.25);
    });

    it('should calculate IV rank', () => {
      const result = analyzeIVSurface(surface, 100);
      expect(result.ivRank).toBeGreaterThanOrEqual(0);
      expect(result.ivRank).toBeLessThanOrEqual(100);
    });

    it('should handle insufficient data', () => {
      const result = analyzeIVSurface([{ strike: 100, expiry: '2026-04-15', iv: 0.25, moneyness: 1.0, dte: 30 }], 100);
      expect(result.skew).toBe(0);
    });
  });

  describe('trackSmartMoney', () => {
    it('should track large flows', () => {
      const flows = [
        generateFlow('AAPL', 'call', { volume: 200, price: 5, side: 'buy_to_open', timestamp: '2026-03-15T10:00:00Z' }),
        generateFlow('AAPL', 'put', { volume: 100, price: 3, side: 'sell_to_open', timestamp: '2026-03-15T10:01:00Z' }),
      ];
      const results = trackSmartMoney(flows);
      expect(results.length).toBe(1);
      expect(results[0].netCallPremium).toBeGreaterThan(0);
    });

    it('should determine direction', () => {
      const bullishFlows = Array.from({ length: 5 }, () =>
        generateFlow('AAPL', 'call', { volume: 500, price: 5, side: 'buy_to_open', timestamp: '2026-03-15T10:00:00Z' })
      );
      const results = trackSmartMoney(bullishFlows);
      expect(results[0].estimatedDirection).toBe('bullish');
    });

    it('should handle empty flows', () => {
      const results = trackSmartMoney([]);
      expect(results).toEqual([]);
    });
  });

  describe('calculateMaxPain', () => {
    it('should calculate max pain', () => {
      const options = [
        { strike: 95, callOI: 100, putOI: 500 },
        { strike: 100, callOI: 300, putOI: 300 },
        { strike: 105, callOI: 500, putOI: 100 },
      ];
      const result = calculateMaxPain(options);
      expect(result.maxPain).toBeGreaterThan(0);
      expect(result.painByStrike.length).toBe(3);
    });

    it('should handle empty options', () => {
      const result = calculateMaxPain([]);
      expect(result.maxPain).toBe(0);
    });

    it('should find minimum pain strike', () => {
      const options = [
        { strike: 90, callOI: 10, putOI: 1000 },
        { strike: 100, callOI: 500, putOI: 500 },
        { strike: 110, callOI: 1000, putOI: 10 },
      ];
      const result = calculateMaxPain(options);
      expect(result.maxPain).toBe(100); // Middle strike has least pain
    });
  });

  describe('analyzeGammaExposure', () => {
    it('should calculate gamma exposure', () => {
      const options = [
        { strike: 95, gamma: 0.03, oi: 500, type: 'call' as const },
        { strike: 100, gamma: 0.05, oi: 1000, type: 'call' as const },
        { strike: 105, gamma: 0.03, oi: 500, type: 'put' as const },
      ];
      const result = analyzeGammaExposure(options, 100);
      expect(result.gammaByStrike.length).toBeGreaterThan(0);
      expect(result.flipPoint).toBeGreaterThan(0);
      expect(['positive', 'negative', 'neutral']).toContain(result.hedgingPressure);
    });

    it('should handle empty options', () => {
      const result = analyzeGammaExposure([], 100);
      expect(result.totalGamma).toBe(0);
    });
  });

  describe('recommendStrategies', () => {
    it('should recommend strategies for high IV', () => {
      const recs = recommendStrategies(85, 0.02, 0.01, 'neutral', 'neutral');
      expect(recs.length).toBeGreaterThan(0);
      expect(recs.some(r => r.strategy.includes('Iron Condor') || r.strategy.includes('Straddle'))).toBe(true);
    });

    it('should recommend strategies for low IV', () => {
      const recs = recommendStrategies(15, 0.02, 0.01, 'neutral', 'neutral');
      expect(recs.length).toBeGreaterThan(0);
      expect(recs.some(r => r.strategy.includes('Straddle') || r.strategy.includes('Calendar'))).toBe(true);
    });

    it('should recommend bullish strategies', () => {
      const recs = recommendStrategies(30, 0, 0, 'bullish', 'neutral');
      expect(recs.some(r => r.strategy.includes('Bull'))).toBe(true);
    });

    it('should recommend bearish strategies', () => {
      const recs = recommendStrategies(30, 0, 0, 'bearish', 'neutral');
      expect(recs.some(r => r.strategy.includes('Bear'))).toBe(true);
    });

    it('should return sorted by confidence', () => {
      const recs = recommendStrategies(50, 0, 0, 'neutral', 'neutral');
      for (let i = 1; i < recs.length; i++) {
        expect(recs[i].confidence).toBeLessThanOrEqual(recs[i - 1].confidence);
      }
    });
  });
});
