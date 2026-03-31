import { describe, it, expect } from 'vitest';
import {
  buildVolatilitySurface,
  generateVolSignals,
  aggregateGreeks,
  findVolArbitrage,
  type OptionQuote,
  type VolatilitySurface,
} from '../utils/volatilitySurfaceEngine';

function makeQuote(overrides: Partial<OptionQuote> = {}): OptionQuote {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 30);
  return {
    strike: 100,
    expiry: futureDate.toISOString().slice(0, 10),
    type: 'call',
    bid: 5,
    ask: 5.5,
    iv: 0.25,
    delta: 0.5,
    gamma: 0.02,
    theta: -0.05,
    vega: 0.15,
    volume: 1000,
    openInterest: 5000,
    ...overrides,
  };
}

describe('Volatility Surface Engine', () => {
  describe('buildVolatilitySurface', () => {
    it('should build surface from quotes', () => {
      const quotes = [
        makeQuote({ strike: 90 }),
        makeQuote({ strike: 100 }),
        makeQuote({ strike: 110 }),
      ];
      const surface = buildVolatilitySurface('TEST', 100, quotes);

      expect(surface.underlying).toBe('TEST');
      expect(surface.spot).toBe(100);
      expect(surface.points.length).toBe(3);
      expect(surface.atmIV).toBeGreaterThan(0);
    });

    it('should calculate moneyness correctly', () => {
      const quotes = [makeQuote({ strike: 100 })];
      const surface = buildVolatilitySurface('TEST', 100, quotes);

      expect(surface.points[0].moneyness).toBeCloseTo(1, 2);
    });

    it('should calculate IV rank with history', () => {
      const quotes = [makeQuote({ iv: 0.3 })];
      const history = [0.1, 0.15, 0.2, 0.25, 0.35, 0.4];
      const surface = buildVolatilitySurface('TEST', 100, quotes, history);

      expect(surface.points[0].ivRank).toBeGreaterThan(0);
      expect(surface.points[0].ivRank).toBeLessThanOrEqual(100);
    });

    it('should build term structure', () => {
      const d30 = new Date();
      d30.setDate(d30.getDate() + 30);
      const d60 = new Date();
      d60.setDate(d60.getDate() + 60);

      const quotes = [
        makeQuote({ strike: 100, expiry: d30.toISOString().slice(0, 10), iv: 0.2 }),
        makeQuote({ strike: 100, expiry: d60.toISOString().slice(0, 10), iv: 0.25 }),
      ];
      const surface = buildVolatilitySurface('TEST', 100, quotes);

      expect(surface.termStructure.length).toBeGreaterThan(0);
    });

    it('should build smile curve', () => {
      const quotes = [
        makeQuote({ strike: 90, iv: 0.3 }),
        makeQuote({ strike: 95, iv: 0.26 }),
        makeQuote({ strike: 100, iv: 0.24 }),
        makeQuote({ strike: 105, iv: 0.26 }),
        makeQuote({ strike: 110, iv: 0.3 }),
      ];
      const surface = buildVolatilitySurface('TEST', 100, quotes);

      expect(surface.smile.length).toBeGreaterThan(0);
      // Smile should be sorted by moneyness
      for (let i = 1; i < surface.smile.length; i++) {
        expect(surface.smile[i].moneyness).toBeGreaterThanOrEqual(surface.smile[i - 1].moneyness);
      }
    });

    it('should calculate skew', () => {
      const quotes = [
        makeQuote({ strike: 85, iv: 0.35 }), // OTM put
        makeQuote({ strike: 100, iv: 0.25 }),
        makeQuote({ strike: 115, iv: 0.2 }), // OTM call
      ];
      const surface = buildVolatilitySurface('TEST', 100, quotes);

      // Put IV > Call IV → positive skew
      expect(surface.skew25d).toBeGreaterThan(0);
    });
  });

  describe('generateVolSignals', () => {
    it('should detect high IV', () => {
      const surface: VolatilitySurface = {
        underlying: 'TEST', spot: 100, date: '2026-03-31',
        points: [], atmIV: 0.4, skew25d: 0,
        termStructure: [{ dte: 30, iv: 0.4 }],
        smile: [],
      };
      const history = [0.1, 0.15, 0.2, 0.2, 0.2, 0.2, 0.22, 0.25, 0.28, 0.3, 0.32];
      const signals = generateVolSignals(surface, history);

      expect(signals.some(s => s.type === 'high_iv')).toBe(true);
    });

    it('should detect low IV', () => {
      const surface: VolatilitySurface = {
        underlying: 'TEST', spot: 100, date: '2026-03-31',
        points: [], atmIV: 0.1, skew25d: 0,
        termStructure: [{ dte: 30, iv: 0.1 }],
        smile: [],
      };
      const history = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.3, 0.35, 0.4, 0.3];
      const signals = generateVolSignals(surface, history);

      expect(signals.some(s => s.type === 'low_iv')).toBe(true);
    });

    it('should detect steep skew', () => {
      const surface: VolatilitySurface = {
        underlying: 'TEST', spot: 100, date: '2026-03-31',
        points: [], atmIV: 0.25, skew25d: 0.08,
        termStructure: [{ dte: 30, iv: 0.25 }],
        smile: [],
      };
      const signals = generateVolSignals(surface);

      expect(signals.some(s => s.type === 'skew_steep')).toBe(true);
    });

    it('should detect term structure inversion', () => {
      const surface: VolatilitySurface = {
        underlying: 'TEST', spot: 100, date: '2026-03-31',
        points: [], atmIV: 0.3, skew25d: 0,
        termStructure: [
          { dte: 30, iv: 0.35 },
          { dte: 60, iv: 0.3 },
          { dte: 90, iv: 0.25 },
        ],
        smile: [],
      };
      const signals = generateVolSignals(surface);

      expect(signals.some(s => s.type === 'term_inversion')).toBe(true);
    });
  });

  describe('aggregateGreeks', () => {
    it('should sum Greeks across positions', () => {
      const positions = [
        { quote: makeQuote({ delta: 0.5, gamma: 0.02 }), quantity: 1 },
        { quote: makeQuote({ delta: -0.3, gamma: 0.01 }), quantity: -1 },
      ];
      const greeks = aggregateGreeks(positions);

      expect(typeof greeks.netDelta).toBe('number');
      expect(typeof greeks.netGamma).toBe('number');
      expect(typeof greeks.netTheta).toBe('number');
      expect(typeof greeks.netVega).toBe('number');
      expect(greeks.gammaRisk).toBeGreaterThanOrEqual(0);
      expect(greeks.gammaRisk).toBeLessThanOrEqual(100);
    });

    it('should handle single position', () => {
      const positions = [{ quote: makeQuote(), quantity: 1 }];
      const greeks = aggregateGreeks(positions);

      expect(greeks.netDelta).toBeCloseTo(0.5 * 100, 0);
    });

    it('should calculate delta exposure', () => {
      const positions = [{ quote: makeQuote({ delta: 0.8 }), quantity: 5 }];
      const greeks = aggregateGreeks(positions);

      expect(greeks.deltaExposure).toBeGreaterThan(0);
    });
  });

  describe('findVolArbitrage', () => {
    it('should find calendar spread opportunities', () => {
      const surface: VolatilitySurface = {
        underlying: 'TEST', spot: 100, date: '2026-03-31',
        points: [], atmIV: 0.3, skew25d: 0,
        termStructure: [
          { dte: 30, iv: 0.4 },
          { dte: 60, iv: 0.3 },
          { dte: 90, iv: 0.28 },
        ],
        smile: [],
      };
      const opps = findVolArbitrage(surface);

      expect(opps.length).toBeGreaterThan(0);
      expect(opps[0].type).toBe('日历套利');
    });

    it('should return empty for normal surface', () => {
      const surface: VolatilitySurface = {
        underlying: 'TEST', spot: 100, date: '2026-03-31',
        points: [], atmIV: 0.25, skew25d: 0,
        termStructure: [
          { dte: 30, iv: 0.22 },
          { dte: 60, iv: 0.24 },
        ],
        smile: [
          { moneyness: 0.9, iv: 0.28 },
          { moneyness: 0.95, iv: 0.26 },
          { moneyness: 1.0, iv: 0.25 },
          { moneyness: 1.05, iv: 0.26 },
          { moneyness: 1.1, iv: 0.28 },
        ],
      };
      const opps = findVolArbitrage(surface);

      // Normal term structure shouldn't have calendar arb
      const calendarOpps = opps.filter(o => o.type === '日历套利');
      expect(calendarOpps.length).toBe(0);
    });

    it('should include expected profit and risk', () => {
      const surface: VolatilitySurface = {
        underlying: 'TEST', spot: 100, date: '2026-03-31',
        points: [], atmIV: 0.3, skew25d: 0,
        termStructure: [{ dte: 30, iv: 0.4 }, { dte: 60, iv: 0.25 }],
        smile: [],
      };
      const opps = findVolArbitrage(surface);

      opps.forEach(o => {
        expect(o.expectedProfit).toBeGreaterThan(0);
        expect(o.risk.length).toBeGreaterThan(0);
        expect(o.legs.length).toBeGreaterThan(0);
      });
    });
  });
});
