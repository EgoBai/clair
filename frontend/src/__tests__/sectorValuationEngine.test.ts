import { describe, it, expect } from 'vitest';
import { valuationPercentileAnalysis, sectorValuationRanking, SectorValuation } from '../utils/sectorValuationEngine';

describe('板块估值分位引擎', () => {
  const sector: SectorValuation = {
    name: '银行',
    currentPE: 5.5,
    currentPB: 0.6,
    currentDividendYield: 0.05,
    historicalPE: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    historicalPB: [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3],
  };

  describe('valuationPercentileAnalysis', () => {
    it('should calculate PE percentile', () => {
      const result = valuationPercentileAnalysis(sector);
      expect(result.pePercentile).toBeGreaterThanOrEqual(0);
      expect(result.pePercentile).toBeLessThanOrEqual(100);
    });

    it('should calculate PB percentile', () => {
      const result = valuationPercentileAnalysis(sector);
      expect(result.pbPercentile).toBeGreaterThanOrEqual(0);
      expect(result.pbPercentile).toBeLessThanOrEqual(100);
    });

    it('should calculate composite percentile', () => {
      const result = valuationPercentileAnalysis(sector);
      expect(result.compositePercentile).toBeGreaterThanOrEqual(0);
      expect(result.compositePercentile).toBeLessThanOrEqual(100);
    });

    it('should classify valuation level', () => {
      const result = valuationPercentileAnalysis(sector);
      expect(['extreme_low', 'low', 'fair', 'high', 'extreme_high']).toContain(result.valuationLevel);
    });

    it('should provide recommendation', () => {
      const result = valuationPercentileAnalysis(sector);
      expect(result.recommendation.length).toBeGreaterThan(0);
    });

    it('should detect low valuation', () => {
      const cheap: SectorValuation = {
        ...sector,
        currentPE: 2.5,
        currentPB: 0.3,
        currentDividendYield: 0.08,
      };
      const result = valuationPercentileAnalysis(cheap);
      expect(['extreme_low', 'low']).toContain(result.valuationLevel);
      expect(result.compositePercentile).toBeLessThan(30);
    });
  });

  describe('sectorValuationRanking', () => {
    it('should rank sectors by valuation', () => {
      const sectors: SectorValuation[] = [
        sector,
        { name: '科技', currentPE: 50, currentPB: 8, currentDividendYield: 0.005, historicalPE: [20, 30, 40, 50, 60, 70], historicalPB: [3, 5, 7, 9, 11, 13] },
      ];
      const ranking = sectorValuationRanking(sectors);
      expect(ranking.length).toBe(2);
      expect(ranking[0].compositePercentile).toBeLessThanOrEqual(ranking[1].compositePercentile);
    });
  });
});
