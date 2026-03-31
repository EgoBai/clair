import { describe, it, expect } from 'vitest';
import {
  analyzeBasis,
  analyzeTermStructure,
  analyzeDeliveryEffect,
  crossVarietySpread,
  type FuturesData,
} from '../utils/futuresBasisEngine';

function makeFutures(overrides: Partial<FuturesData> = {}): FuturesData {
  return {
    ticker: 'IF2604',
    name: '沪深300当月',
    type: 'IF',
    spot: 3900,
    futures: 3890,
    basis: -10,
    basisRatio: -10 / 3900,
    daysToExpiry: 20,
    expiryDate: '2026-04-18',
    volume: 1e5,
    openInterest: 5e4,
    ...overrides,
  };
}

describe('Futures Basis Engine', () => {
  describe('analyzeBasis', () => {
    it('should detect discount', () => {
      const analysis = analyzeBasis(makeFutures({ futures: 3850, spot: 3900 }));
      expect(analysis.basisState).toBe('discount');
      expect(analysis.signal).toContain('贴水');
    });

    it('should detect premium', () => {
      const analysis = analyzeBasis(makeFutures({ futures: 3950, spot: 3900 }));
      expect(analysis.basisState).toBe('premium');
    });

    it('should calculate annualized basis', () => {
      const analysis = analyzeBasis(makeFutures());
      expect(typeof analysis.annualizedBasis).toBe('number');
      expect(analysis.hedgeCost).toBeGreaterThan(0);
    });

    it('should detect arbitrage opportunity', () => {
      const analysis = analyzeBasis(makeFutures({
        futures: 4100, spot: 3900, daysToExpiry: 30,
      }));
      expect(analysis.arbitrageOpportunity).toBe(true);
      expect(analysis.arbDirection).toBe('cash_carry');
    });

    it('should assess expiry effect', () => {
      const near = analyzeBasis(makeFutures({ daysToExpiry: 3 }));
      const far = analyzeBasis(makeFutures({ daysToExpiry: 30 }));
      expect(near.expiryEffect).toBe('strong');
      expect(far.expiryEffect).toBe('weak');
    });
  });

  describe('analyzeTermStructure', () => {
    it('should return null for insufficient contracts', () => {
      expect(analyzeTermStructure([makeFutures()])).toBeNull();
    });

    it('should analyze contango structure', () => {
      const contracts = [
        makeFutures({ daysToExpiry: 10, futures: 3900 }),
        makeFutures({ daysToExpiry: 40, futures: 3920 }),
        makeFutures({ daysToExpiry: 70, futures: 3940 }),
      ];
      const ts = analyzeTermStructure(contracts);
      expect(ts!.structure).toBe('contango');
    });

    it('should analyze backwardation structure', () => {
      const contracts = [
        makeFutures({ daysToExpiry: 10, futures: 3920 }),
        makeFutures({ daysToExpiry: 40, futures: 3900 }),
        makeFutures({ daysToExpiry: 70, futures: 3880 }),
      ];
      const ts = analyzeTermStructure(contracts);
      expect(ts!.structure).toBe('backwardation');
    });

    it('should include contracts list', () => {
      const contracts = [
        makeFutures({ daysToExpiry: 10, expiryDate: '2026-04-10' }),
        makeFutures({ daysToExpiry: 40, expiryDate: '2026-05-10' }),
      ];
      const ts = analyzeTermStructure(contracts);
      expect(ts!.contracts.length).toBe(2);
    });
  });

  describe('analyzeDeliveryEffect', () => {
    it('should analyze delivery dynamics', () => {
      const effect = analyzeDeliveryEffect(makeFutures({ daysToExpiry: 5 }));
      expect(effect.daysBefore).toBe(5);
      expect(['fast', 'normal', 'slow']).toContain(effect.convergenceSpeed);
      expect(effect.tradingAdvice.length).toBeGreaterThan(0);
    });

    it('should be fast near delivery', () => {
      const near = analyzeDeliveryEffect(makeFutures({ daysToExpiry: 2 }));
      expect(near.convergenceSpeed).toBe('fast');
    });
  });

  describe('crossVarietySpread', () => {
    it('should calculate spread between contracts', () => {
      const if1 = makeFutures({ type: 'IF', futures: 3900 });
      const ic1 = makeFutures({ type: 'IC', futures: 5800 });
      const spread = crossVarietySpread(if1, ic1);

      expect(spread.spread).toBe(-1900);
      expect(spread.signal.length).toBeGreaterThan(0);
    });

    it('should include historical percentile', () => {
      const spread = crossVarietySpread(makeFutures(), makeFutures({ futures: 3950 }));
      expect(spread.historicalPercentile).toBeGreaterThanOrEqual(0);
      expect(spread.historicalPercentile).toBeLessThanOrEqual(100);
    });
  });
});
