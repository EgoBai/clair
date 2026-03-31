import { describe, it, expect } from 'vitest';
import {
  calculateProsperityScore,
  generateRotationSignals,
  analyzeInventoryCycle,
  rankIndustries,
  type IndustryIndicator,
} from '../utils/industryProsperityEngine';

function makeIndicator(overrides: Partial<IndustryIndicator> = {}): IndustryIndicator {
  return {
    industry: '半导体',
    date: '2026-03',
    pmi: 52,
    capacityUtilization: 0.75,
    inventoryCycle: 'active_restocking',
    revenueGrowth: 15,
    profitGrowth: 20,
    marginTrend: 'expanding',
    demandIndex: 70,
    supplyIndex: 60,
    priceIndex: 65,
    ...overrides,
  };
}

describe('Industry Prosperity Engine', () => {
  describe('calculateProsperityScore', () => {
    it('should return score between 0-100', () => {
      const result = calculateProsperityScore(makeIndicator());
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should give high score for strong indicators', () => {
      const strong = makeIndicator({
        pmi: 55,
        profitGrowth: 30,
        capacityUtilization: 0.85,
        marginTrend: 'expanding',
      });
      const result = calculateProsperityScore(strong);
      expect(result.score).toBeGreaterThan(70);
      expect(result.grade).toBe('A');
      expect(result.drivers.length).toBeGreaterThan(0);
    });

    it('should give low score for weak indicators', () => {
      const weak = makeIndicator({
        pmi: 45,
        profitGrowth: -10,
        capacityUtilization: 0.5,
        marginTrend: 'compressing',
        inventoryCycle: 'active_destocking',
      });
      const result = calculateProsperityScore(weak);
      expect(result.score).toBeLessThan(40);
      expect(['D', 'E']).toContain(result.grade);
      expect(result.risks.length).toBeGreaterThan(0);
    });

    it('should detect expansion phase', () => {
      const expansion = makeIndicator({ pmi: 53, profitGrowth: 25 });
      const result = calculateProsperityScore(expansion);
      expect(result.phase).toBe('expansion');
    });

    it('should detect contraction phase', () => {
      const contraction = makeIndicator({ pmi: 47, profitGrowth: -5 });
      const result = calculateProsperityScore(contraction);
      expect(result.phase).toBe('contraction');
    });

    it('should detect rising trend with prev indicator', () => {
      const prev = makeIndicator({ pmi: 48, profitGrowth: 5 });
      const curr = makeIndicator({ pmi: 52, profitGrowth: 15 });
      const result = calculateProsperityScore(curr, prev);
      expect(result.trend).toBe('rising');
    });

    it('should penalize supply-demand imbalance', () => {
      const oversupply = makeIndicator({ demandIndex: 40, supplyIndex: 80 });
      const result = calculateProsperityScore(oversupply);
      expect(result.risks).toContain('供过于求');
    });

    it('should reward supply-demand balance', () => {
      const undersupply = makeIndicator({ demandIndex: 80, supplyIndex: 40 });
      const result = calculateProsperityScore(undersupply);
      expect(result.drivers).toContain('供不应求');
    });
  });

  describe('generateRotationSignals', () => {
    it('should rank industries by composite score', () => {
      const indicators = [
        makeIndicator({ industry: '强行业', pmi: 58, profitGrowth: 40, capacityUtilization: 0.9 }),
        makeIndicator({ industry: '弱行业', pmi: 42, profitGrowth: -20, capacityUtilization: 0.4, marginTrend: 'compressing', inventoryCycle: 'active_destocking' }),
        makeIndicator({ industry: '中等行业', pmi: 50, profitGrowth: 5 }),
      ];
      const valuations = new Map([
        ['强行业', 10],
        ['弱行业', 90],
        ['中等行业', 50],
      ]);

      const signals = generateRotationSignals(indicators, valuations);
      expect(signals[0].industry).toBe('强行业');
      expect(signals[signals.length - 1].industry).toBe('弱行业');
    });

    it('should factor in valuation', () => {
      const indicators = [makeIndicator()];
      const lowVal = generateRotationSignals(indicators, new Map([['半导体', 10]]));
      const highVal = generateRotationSignals(indicators, new Map([['半导体', 90]]));
      expect(lowVal[0].composite).toBeGreaterThan(highVal[0].composite);
    });

    it('should include reasoning', () => {
      const signals = generateRotationSignals(
        [makeIndicator()],
        new Map([['半导体', 50]])
      );
      expect(signals[0].reasoning.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeInventoryCycle', () => {
    it('should identify cycle phase', () => {
      const result = analyzeInventoryCycle(makeIndicator());
      expect(result.cycle).toBe('active_restocking');
      expect(result.nextPhase).toContain('被动补库存');
    });

    it('should detect near transition', () => {
      const result = analyzeInventoryCycle(makeIndicator(), 7);
      expect(result.nearTransition).toBe(true);
    });

    it('should not flag early stage as near transition', () => {
      const result = analyzeInventoryCycle(makeIndicator(), 2);
      expect(result.nearTransition).toBe(false);
    });

    it('should handle all cycle types', () => {
      const cycles = ['active_restocking', 'passive_destocking', 'active_destocking', 'passive_restocking'] as const;
      cycles.forEach(cycle => {
        const result = analyzeInventoryCycle(makeIndicator({ inventoryCycle: cycle }));
        expect(result.cycle).toBe(cycle);
        expect(result.nextPhase.length).toBeGreaterThan(0);
      });
    });
  });

  describe('rankIndustries', () => {
    it('should rank by score descending', () => {
      const indicators = [
        makeIndicator({ industry: 'A', pmi: 48, profitGrowth: -5 }),
        makeIndicator({ industry: 'B', pmi: 55, profitGrowth: 25 }),
        makeIndicator({ industry: 'C', pmi: 50, profitGrowth: 5 }),
      ];
      const ranking = rankIndustries(indicators);

      expect(ranking[0].industry).toBe('B');
      expect(ranking[0].rank).toBe(1);
      expect(ranking[0].score).toBeGreaterThanOrEqual(ranking[1].score);
    });

    it('should include highlights', () => {
      const ranking = rankIndustries([
        makeIndicator({ industry: '强势', pmi: 55, profitGrowth: 20, capacityUtilization: 0.85 }),
      ]);
      expect(ranking[0].highlights.length).toBeGreaterThan(0);
    });
  });
});
