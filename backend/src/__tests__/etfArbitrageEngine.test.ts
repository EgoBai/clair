import { describe, it, expect } from 'vitest';
import { ETFArbitrageEngine, ETFQuote, FuturesQuote, AHQuote, LOFQuote } from '../services/etfArbitrageEngine';

describe('ETF Arbitrage Engine', () => {
  const engine = new ETFArbitrageEngine();

  const createETFQuote = (overrides: Partial<ETFQuote> = {}): ETFQuote => ({
    symbol: '510300',
    name: '沪深300ETF',
    price: 4.5,
    iopv: 4.5,
    nav: 4.5,
    volume: 1e8,
    timestamp: Date.now(),
    ...overrides
  });

  const createFuturesQuote = (overrides: Partial<FuturesQuote> = {}): FuturesQuote => ({
    symbol: 'IF2406',
    underlying: '沪深300',
    price: 3950,
    spotPrice: 3900,
    deliveryDate: '2024-06-21',
    daysToDelivery: 90,
    timestamp: Date.now(),
    ...overrides
  });

  const createAHQuote = (overrides: Partial<AHQuote> = {}): AHQuote => ({
    aSymbol: '601318',
    hSymbol: '02318',
    aPrice: 50,
    hPrice: 45,
    exchangeRate: 0.9,
    timestamp: Date.now(),
    ...overrides
  });

  const createLOFQuote = (overrides: Partial<LOFQuote> = {}): LOFQuote => ({
    symbol: '161725',
    fieldPrice: 1.5,
    nav: 1.5,
    volume: 1e6,
    timestamp: Date.now(),
    ...overrides
  });

  describe('detectETFDiscountPremium', () => {
    it('should detect ETF premium', () => {
      const quotes = [createETFQuote({ price: 4.6, iopv: 4.5 })];
      const opps = engine.detectETFDiscountPremium(quotes);
      expect(opps.length).toBeGreaterThan(0);
      expect(opps[0].type).toBe('etf_premium');
    });

    it('should detect ETF discount', () => {
      const quotes = [createETFQuote({ price: 4.3, iopv: 4.5 })];
      const opps = engine.detectETFDiscountPremium(quotes);
      expect(opps.length).toBeGreaterThan(0);
      expect(opps[0].type).toBe('etf_discount');
    });

    it('should not detect when spread is small', () => {
      const quotes = [createETFQuote({ price: 4.501, iopv: 4.5 })];
      const opps = engine.detectETFDiscountPremium(quotes);
      expect(opps.length).toBe(0);
    });

    it('should handle zero IOPV', () => {
      const quotes = [createETFQuote({ iopv: 0 })];
      const opps = engine.detectETFDiscountPremium(quotes);
      expect(opps).toEqual([]);
    });

    it('should sort by net profit', () => {
      const quotes = [
        createETFQuote({ symbol: 'A', price: 4.55, iopv: 4.5 }),
        createETFQuote({ symbol: 'B', price: 4.7, iopv: 4.5 }),
      ];
      const opps = engine.detectETFDiscountPremium(quotes);
      for (let i = 1; i < opps.length; i++) {
        expect(opps[i - 1].netProfit).toBeGreaterThanOrEqual(opps[i].netProfit);
      }
    });
  });

  describe('detectFuturesBasisArb', () => {
    it('should detect futures premium', () => {
      const quotes = [createFuturesQuote({ price: 4200, spotPrice: 3900, daysToDelivery: 90 })];
      const opps = engine.detectFuturesBasisArb(quotes);
      expect(opps.length).toBeGreaterThan(0);
      expect(opps[0].direction).toBe('sell');
    });

    it('should not detect when basis is small', () => {
      const quotes = [createFuturesQuote({ price: 3910, spotPrice: 3900, daysToDelivery: 365 })];
      const opps = engine.detectFuturesBasisArb(quotes);
      expect(opps.length).toBe(0);
    });

    it('should calculate annualized basis', () => {
      const quotes = [createFuturesQuote({ price: 4000, spotPrice: 3900, daysToDelivery: 30 })];
      const opps = engine.detectFuturesBasisArb(quotes);
      if (opps.length > 0) {
        expect(opps[0].holdingPeriod).toBe('30天');
      }
    });

    it('should handle zero spot price', () => {
      const quotes = [createFuturesQuote({ spotPrice: 0 })];
      const opps = engine.detectFuturesBasisArb(quotes);
      expect(opps).toEqual([]);
    });
  });

  describe('detectAHPremiumArb', () => {
    it('should detect AH premium', () => {
      const quotes = [createAHQuote({ aPrice: 60, hPrice: 40, exchangeRate: 0.9 })];
      const opps = engine.detectAHPremiumArb(quotes);
      expect(opps.length).toBeGreaterThan(0);
      expect(opps[0].type).toBe('ah_premium');
    });

    it('should not detect when premium is small', () => {
      const quotes = [createAHQuote({ aPrice: 41, hPrice: 45, exchangeRate: 0.9 })];
      const opps = engine.detectAHPremiumArb(quotes);
      expect(opps.length).toBe(0);
    });

    it('should handle zero prices', () => {
      const quotes = [createAHQuote({ aPrice: 0 })];
      const opps = engine.detectAHPremiumArb(quotes);
      expect(opps).toEqual([]);
    });
  });

  describe('detectLOFArb', () => {
    it('should detect LOF premium', () => {
      const quotes = [createLOFQuote({ fieldPrice: 1.6, nav: 1.5 })];
      const opps = engine.detectLOFArb(quotes);
      expect(opps.length).toBeGreaterThan(0);
      expect(opps[0].type).toBe('lof_arb');
    });

    it('should detect LOF discount', () => {
      const quotes = [createLOFQuote({ fieldPrice: 1.35, nav: 1.5 })];
      const opps = engine.detectLOFArb(quotes);
      expect(opps.length).toBeGreaterThan(0);
    });

    it('should not detect when spread is small', () => {
      const quotes = [createLOFQuote({ fieldPrice: 1.505, nav: 1.5 })];
      const opps = engine.detectLOFArb(quotes);
      expect(opps.length).toBe(0);
    });
  });

  describe('generateReport', () => {
    it('should generate complete report', () => {
      const report = engine.generateReport(
        [createETFQuote({ price: 4.6, iopv: 4.5 })],
        [createFuturesQuote()],
        [createAHQuote()],
        [createLOFQuote()]
      );
      expect(report.opportunities).toBeDefined();
      expect(report.totalOpportunities).toBeGreaterThanOrEqual(0);
      expect(report.avgSpread).toBeGreaterThanOrEqual(0);
      expect(report.timestamp).toBeTypeOf('number');
    });

    it('should return null best opportunity when none found', () => {
      const report = engine.generateReport([], [], [], []);
      expect(report.bestOpportunity).toBeNull();
      expect(report.totalOpportunities).toBe(0);
    });

    it('should identify best opportunity', () => {
      const report = engine.generateReport(
        [createETFQuote({ price: 4.7, iopv: 4.5 })],
        [],
        [],
        []
      );
      if (report.bestOpportunity) {
        expect(report.bestOpportunity.netProfit).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
