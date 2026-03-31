import { describe, it, expect } from 'vitest';
import {
  detectEconomicPhase,
  scoreSector,
  predictRotation,
  analyzeStyleRotation,
  type SectorData,
  type EconomicPhase,
} from '../utils/sectorRotationPredictEngine';

function makeSector(name: string, overrides: Partial<SectorData> = {}): SectorData {
  return {
    name,
    code: `BK${name}`,
    returns: { week: 0.02, month: 0.05, quarter: 0.1, year: 0.2 },
    valuation: { pe: 25, pePercentile: 40, pb: 2.5, pbPercentile: 35 },
    momentum: { rsi: 55, macdSignal: 'golden', trend: 'up' },
    crowding: { turnoverRate: 0.02, northboundChange: 0.05, fundAllocation: 30 },
    fundamentals: { earningsGrowth: 0.15, revenueGrowth: 0.12, roeChange: 0.02 },
    policy: { supportLevel: 1, recentPolicies: ['政策A'] },
    ...overrides,
  };
}

describe('sectorRotationPredictEngine', () => {
  describe('detectEconomicPhase', () => {
    it('should detect recovery', () => {
      const result = detectEconomicPhase({
        pmiGrowth: 1, creditGrowth: 12, inventoryCycle: -0.5, consumerConfidence: 105,
      });
      expect(result.phase).toBe('recovery');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should detect expansion', () => {
      const result = detectEconomicPhase({
        pmiGrowth: 2, creditGrowth: 15, inventoryCycle: 0.5, consumerConfidence: 110,
      });
      expect(['recovery', 'expansion']).toContain(result.phase);
    });

    it('should detect contraction', () => {
      const result = detectEconomicPhase({
        pmiGrowth: -2, creditGrowth: 3, inventoryCycle: -0.5, consumerConfidence: 90,
      });
      expect(['contraction', 'peak']).toContain(result.phase);
    });

    it('should return confidence 0-1', () => {
      const result = detectEconomicPhase({
        pmiGrowth: 0, creditGrowth: 8, inventoryCycle: 0, consumerConfidence: 100,
      });
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('scoreSector', () => {
    it('should score sector 0-100', () => {
      const sector = makeSector('科技');
      const result = scoreSector(sector, 'expansion');
      expect(result.compositeScore).toBeGreaterThanOrEqual(0);
      expect(result.compositeScore).toBeLessThanOrEqual(100);
    });

    it('should include all score components', () => {
      const sector = makeSector('科技');
      const result = scoreSector(sector, 'expansion');
      expect(result.momentumScore).toBeDefined();
      expect(result.valuationScore).toBeDefined();
      expect(result.crowdingScore).toBeDefined();
      expect(result.policyScore).toBeDefined();
    });

    it('should assign signal', () => {
      const sector = makeSector('科技');
      const result = scoreSector(sector, 'expansion');
      expect(['strong_buy', 'buy', 'hold', 'sell', 'strong_sell']).toContain(result.signal);
    });

    it('should boost undervalued sectors in recovery', () => {
      const cheap = makeSector('银行', { valuation: { pe: 8, pePercentile: 10, pb: 0.8, pbPercentile: 10 } });
      const expensive = makeSector('科技', { valuation: { pe: 80, pePercentile: 90, pb: 10, pbPercentile: 90 } });
      const cheapScore = scoreSector(cheap, 'recovery');
      const expensiveScore = scoreSector(expensive, 'recovery');
      expect(cheapScore.valuationScore).toBeGreaterThan(expensiveScore.valuationScore);
    });
  });

  describe('predictRotation', () => {
    it('should return top and bottom sectors', () => {
      const sectors = [
        makeSector('科技'), makeSector('银行'), makeSector('医药'),
        makeSector('消费'), makeSector('新能源'),
      ];
      const result = predictRotation(sectors, 'expansion', 0.7);
      expect(result.topSectors.length).toBeGreaterThan(0);
      expect(result.bottomSectors.length).toBeGreaterThan(0);
    });

    it('should include rotation strategy', () => {
      const sectors = [makeSector('科技')];
      const result = predictRotation(sectors, 'recovery', 0.7);
      expect(result.rotationStrategy.length).toBeGreaterThan(0);
    });

    it('should include transition probabilities', () => {
      const sectors = [makeSector('科技')];
      const result = predictRotation(sectors, 'expansion', 0.7);
      expect(result.transitionProbabilities.length).toBe(4);
    });

    it('should include next rotation timing', () => {
      const sectors = [makeSector('科技')];
      const result = predictRotation(sectors, 'recovery', 0.7);
      expect(result.nextRotationTiming.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeStyleRotation', () => {
    it('should determine style preference', () => {
      const sectors = [
        makeSector('银行', { returns: { week: 0.05, month: 0.1, quarter: 0.15, year: 0.3 } }),
        makeSector('半导体', { returns: { week: 0.01, month: 0.02, quarter: 0.05, year: 0.1 } }),
      ];
      const result = analyzeStyleRotation(sectors);
      expect(['large_cap', 'small_cap', 'balanced']).toContain(result.style);
    });

    it('should calculate spread', () => {
      const sectors = [
        makeSector('银行'), makeSector('半导体'),
      ];
      const result = analyzeStyleRotation(sectors);
      expect(typeof result.spread).toBe('number');
    });

    it('should provide recommendation', () => {
      const sectors = [makeSector('银行'), makeSector('半导体')];
      const result = analyzeStyleRotation(sectors);
      expect(result.recommendation.length).toBeGreaterThan(0);
    });
  });
});
