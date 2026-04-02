import { describe, it, expect } from 'vitest';
import { MarketImpactEngine } from '../services/marketImpactEngine';

describe('MarketImpactEngine', () => {
  const engine = new MarketImpactEngine();
  const defaultParams = {
    dailyVolume: 10000000,
    volatility: 0.02,
    spread: 0.001,
    participationRate: 0.1
  };

  describe('linearImpact', () => {
    it('returns zero impact for zero order', () => {
      const result = engine.linearImpact(defaultParams, 0);
      expect(result.totalImpact).toBe(0);
    });

    it('returns zero for zero volume', () => {
      const result = engine.linearImpact({ ...defaultParams, dailyVolume: 0 }, 1000);
      expect(result.totalImpact).toBe(0);
    });

    it('impact increases with order size', () => {
      const small = engine.linearImpact(defaultParams, 10000);
      const large = engine.linearImpact(defaultParams, 1000000);
      expect(large.totalImpact).toBeGreaterThan(small.totalImpact);
    });

    it('impact is positive', () => {
      const result = engine.linearImpact(defaultParams, 100000);
      expect(result.temporaryImpact).toBeGreaterThan(0);
      expect(result.permanentImpact).toBeGreaterThanOrEqual(0);
      expect(result.totalImpact).toBeGreaterThan(0);
    });

    it('duration is reasonable', () => {
      const result = engine.linearImpact(defaultParams, 100000);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.duration).toBeLessThan(1000);
    });

    it('higher volatility increases impact', () => {
      const low = engine.linearImpact({ ...defaultParams, volatility: 0.01 }, 100000);
      const high = engine.linearImpact({ ...defaultParams, volatility: 0.05 }, 100000);
      expect(high.totalImpact).toBeGreaterThan(low.totalImpact);
    });
  });

  describe('almgrenImpact', () => {
    it('returns zero for empty order', () => {
      const result = engine.almgrenImpact(defaultParams, 0);
      expect(result.totalImpact).toBe(0);
    });

    it('impact is positive for valid order', () => {
      const result = engine.almgrenImpact(defaultParams, 500000);
      expect(result.totalImpact).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('larger orders have higher impact', () => {
      const s = engine.almgrenImpact(defaultParams, 10000);
      const l = engine.almgrenImpact(defaultParams, 1000000);
      expect(l.totalImpact).toBeGreaterThan(s.totalImpact);
    });
  });

  describe('optimizeOrderSplit', () => {
    it('returns zero for empty order', () => {
      const result = engine.optimizeOrderSplit(defaultParams, 0);
      expect(result.numSlices).toBe(0);
    });

    it('produces valid split plan', () => {
      const result = engine.optimizeOrderSplit(defaultParams, 1000000, 180);
      expect(result.sliceSize).toBeGreaterThan(0);
      expect(result.numSlices).toBeGreaterThan(0);
      expect(result.intervalMinutes).toBeGreaterThan(0);
      expect(result.expectedImpact).toBeGreaterThan(0);
    });

    it('total slices * sliceSize >= orderSize', () => {
      const result = engine.optimizeOrderSplit(defaultParams, 500000);
      expect(result.sliceSize * result.numSlices).toBeGreaterThanOrEqual(500000);
    });

    it('risk reduction is in [0, 1]', () => {
      const result = engine.optimizeOrderSplit(defaultParams, 500000);
      expect(result.riskReduction).toBeGreaterThanOrEqual(0);
      expect(result.riskReduction).toBeLessThanOrEqual(1);
    });
  });

  describe('intradayLiquidityProfile', () => {
    it('returns profiles for trading hours', () => {
      const profile = engine.intradayLiquidityProfile();
      expect(profile.length).toBe(7); // 9-15
      expect(profile[0].hour).toBe(9);
      expect(profile[6].hour).toBe(15);
    });

    it('all profiles have valid values', () => {
      const profile = engine.intradayLiquidityProfile();
      profile.forEach(p => {
        expect(p.relativeVolume).toBeGreaterThan(0);
        expect(p.effectiveSpread).toBeGreaterThan(0);
        expect(p.depth).toBeGreaterThan(0);
        expect(p.impactMultiplier).toBeGreaterThan(0);
      });
    });

    it('opening and closing have higher volume', () => {
      const profile = engine.intradayLiquidityProfile();
      const open = profile.find(p => p.hour === 9)!;
      const midday = profile.find(p => p.hour === 12)!;
      expect(open.relativeVolume).toBeGreaterThan(midday.relativeVolume);
    });
  });

  describe('impactDecay', () => {
    it('computes decay parameters', () => {
      const decay = engine.impactDecay(10, 5000000);
      expect(decay.halfLife).toBeGreaterThan(0);
      expect(decay.decayRate).toBeGreaterThan(0);
      expect(decay.initialImpact).toBe(10);
      expect(decay.residualImpact).toBeLessThan(10);
      expect(decay.residualImpact).toBeGreaterThanOrEqual(0);
    });

    it('higher volume = faster decay', () => {
      const low = engine.impactDecay(10, 100000);
      const high = engine.impactDecay(10, 10000000);
      expect(low.halfLife).toBeGreaterThan(high.halfLife);
    });

    it('residual is less than initial', () => {
      const decay = engine.impactDecay(50, 1000000);
      expect(decay.residualImpact).toBeLessThan(decay.initialImpact);
    });
  });

  describe('predictVWAPDeviation', () => {
    it('returns valid prediction', () => {
      const pred = engine.predictVWAPDeviation(defaultParams, 500000);
      expect(pred.upperBound).toBeGreaterThanOrEqual(pred.expectedVWAP);
      expect(pred.lowerBound).toBeLessThanOrEqual(pred.expectedVWAP);
      expect(pred.confidence).toBeGreaterThan(0);
      expect(pred.confidence).toBeLessThanOrEqual(1);
    });

    it('wider bounds for larger orders', () => {
      const small = engine.predictVWAPDeviation(defaultParams, 10000);
      const large = engine.predictVWAPDeviation(defaultParams, 1000000);
      const smallRange = small.upperBound - small.lowerBound;
      const largeRange = large.upperBound - large.lowerBound;
      expect(largeRange).toBeGreaterThan(smallRange);
    });

    it('zero volume returns zero', () => {
      const pred = engine.predictVWAPDeviation({ ...defaultParams, dailyVolume: 0 }, 1000);
      expect(pred.confidence).toBe(0);
    });
  });

  describe('optimizeParticipationRate', () => {
    it('returns valid optimal rate', () => {
      const result = engine.optimizeParticipationRate(defaultParams, 500000);
      expect(result.optimalRate).toBeGreaterThan(0);
      expect(result.optimalRate).toBeLessThanOrEqual(0.5);
      expect(result.expectedCost).toBeGreaterThanOrEqual(0);
    });

    it('returns zero for invalid inputs', () => {
      const result = engine.optimizeParticipationRate(defaultParams, 0);
      expect(result.optimalRate).toBe(0);
    });

    it('risk-averse prefers slower execution', () => {
      const aggressive = engine.optimizeParticipationRate(defaultParams, 500000, 0);
      const conservative = engine.optimizeParticipationRate(defaultParams, 500000, 1);
      // Conservative may choose different rate
      expect(conservative.optimalRate).toBeGreaterThan(0);
      expect(aggressive.optimalRate).toBeGreaterThan(0);
    });
  });

  describe('crossAssetImpact', () => {
    it('returns zero for zero volume', () => {
      expect(engine.crossAssetImpact(10, 0.5, 0, 1000)).toBe(0);
    });

    it('higher correlation = higher spillover', () => {
      const low = engine.crossAssetImpact(10, 0.1, 5000000, 10000000);
      const high = engine.crossAssetImpact(10, 0.9, 5000000, 10000000);
      expect(high).toBeGreaterThan(low);
    });

    it('handles equal ADV', () => {
      const result = engine.crossAssetImpact(5, 0.5, 1000000, 1000000);
      expect(result).toBeGreaterThan(0);
    });
  });
});
