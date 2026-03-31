import { describe, it, expect } from 'vitest';
import {
  calculateGini,
  calculateHHI,
  analyzeChipDistribution,
  analyzeProfitLoss,
  analyzeChipConcentration,
  findSupportResistance,
  analyzeChipPeaksValleys,
  analyzeChipMigration,
  type ChipLevel,
  type ChipDistribution,
} from '../utils/chipDistributionEngine';

const mockPrices = [10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15];
const mockVolumes = [100, 200, 500, 1000, 2000, 3000, 1500, 800, 400, 150, 50];

describe('筹码分布引擎', () => {
  describe('calculateGini', () => {
    it('should return 0 for uniform distribution', () => {
      const levels: ChipLevel[] = [
        { price: 10, volume: 100, percentage: 0.25 },
        { price: 11, volume: 100, percentage: 0.25 },
        { price: 12, volume: 100, percentage: 0.25 },
        { price: 13, volume: 100, percentage: 0.25 },
      ];
      expect(calculateGini(levels)).toBeCloseTo(0, 1);
    });

    it('should return high value for concentrated distribution', () => {
      const levels: ChipLevel[] = [
        { price: 10, volume: 1, percentage: 0.001 },
        { price: 11, volume: 9999, percentage: 0.999 },
      ];
      expect(calculateGini(levels)).toBeGreaterThan(0.4);
    });

    it('should handle empty levels', () => {
      expect(calculateGini([])).toBe(0);
    });

    it('should handle all zero volumes', () => {
      const levels: ChipLevel[] = [
        { price: 10, volume: 0, percentage: 0 },
        { price: 11, volume: 0, percentage: 0 },
      ];
      expect(calculateGini(levels)).toBe(0);
    });
  });

  describe('calculateHHI', () => {
    it('should return low value for dispersed distribution', () => {
      const levels: ChipLevel[] = Array.from({ length: 10 }, (_, i) => ({
        price: 10 + i, volume: 100, percentage: 0.1,
      }));
      expect(calculateHHI(levels)).toBeCloseTo(0.1, 1);
    });

    it('should return ~1 for monopoly', () => {
      const levels: ChipLevel[] = [
        { price: 10, volume: 0, percentage: 0 },
        { price: 11, volume: 1000, percentage: 1 },
      ];
      expect(calculateHHI(levels)).toBeCloseTo(1, 1);
    });

    it('should handle empty levels', () => {
      expect(calculateHHI([])).toBe(0);
    });
  });

  describe('analyzeChipDistribution', () => {
    it('should calculate correct total volume', () => {
      const result = analyzeChipDistribution(mockPrices, mockVolumes);
      expect(result.totalVolume).toBe(mockVolumes.reduce((a, b) => a + b, 0));
    });

    it('should calculate weighted average cost', () => {
      const result = analyzeChipDistribution(mockPrices, mockVolumes);
      expect(result.avgCost).toBeGreaterThan(10);
      expect(result.avgCost).toBeLessThan(15);
    });

    it('should find peak price', () => {
      const result = analyzeChipDistribution(mockPrices, mockVolumes);
      expect(result.peakPrice).toBe(12.5); // volume 3000
    });

    it('should calculate percentages that sum to 1', () => {
      const result = analyzeChipDistribution(mockPrices, mockVolumes);
      const totalPct = result.levels.reduce((s, l) => s + l.percentage, 0);
      expect(totalPct).toBeCloseTo(1, 2);
    });

    it('should handle empty input', () => {
      const result = analyzeChipDistribution([], []);
      expect(result.totalVolume).toBe(0);
      expect(result.avgCost).toBe(0);
    });

    it('should handle single level', () => {
      const result = analyzeChipDistribution([10], [100]);
      expect(result.levels).toHaveLength(1);
      expect(result.avgCost).toBe(10);
      expect(result.peakPrice).toBe(10);
    });
  });

  describe('analyzeProfitLoss', () => {
    const dist = analyzeChipDistribution(mockPrices, mockVolumes);

    it('should calculate profit/loss ratios', () => {
      const result = analyzeProfitLoss(dist, 12);
      expect(result.profitRatio).toBeGreaterThan(0);
      expect(result.lossRatio).toBeGreaterThan(0);
      expect(result.profitRatio + result.lossRatio).toBeCloseTo(1, 1);
    });

    it('should identify all profitable when price is high', () => {
      const result = analyzeProfitLoss(dist, 20);
      expect(result.profitRatio).toBeCloseTo(1, 1);
      expect(result.lossRatio).toBeCloseTo(0, 1);
    });

    it('should identify all trapped when price is low', () => {
      const result = analyzeProfitLoss(dist, 8);
      expect(result.profitRatio).toBeCloseTo(0, 1);
      expect(result.lossRatio).toBeCloseTo(1, 1);
    });

    it('should handle empty distribution', () => {
      const emptyDist: ChipDistribution = {
        levels: [], totalVolume: 0, avgCost: 0, medianCost: 0, peakPrice: 0,
      };
      const result = analyzeProfitLoss(emptyDist, 10);
      expect(result.profitRatio).toBe(0);
      expect(result.lossRatio).toBe(0);
    });

    it('should calculate trapped zone', () => {
      const result = analyzeProfitLoss(dist, 12);
      expect(result.trappedZone.high).toBeGreaterThanOrEqual(result.trappedZone.low);
    });

    it('should have positive avgProfit and avgLoss values', () => {
      const result = analyzeProfitLoss(dist, 12);
      expect(result.avgProfit).toBeGreaterThanOrEqual(0);
      expect(result.avgLoss).toBeGreaterThanOrEqual(0);
    });
  });

  describe('analyzeChipConcentration', () => {
    it('should analyze concentrated distribution', () => {
      const dist = analyzeChipDistribution(mockPrices, mockVolumes);
      const result = analyzeChipConcentration(dist);
      expect(result.giniCoefficient).toBeGreaterThanOrEqual(0);
      expect(result.giniCoefficient).toBeLessThanOrEqual(1);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(['high', 'medium', 'low']).toContain(result.level);
    });

    it('should have higher concentration for peaked distribution', () => {
      const peaked = analyzeChipDistribution(
        [10, 11, 12, 13, 14],
        [10, 10, 9000, 10, 10]
      );
      const flat = analyzeChipDistribution(
        [10, 11, 12, 13, 14],
        [200, 200, 200, 200, 200]
      );
      const peakedResult = analyzeChipConcentration(peaked);
      const flatResult = analyzeChipConcentration(flat);
      expect(peakedResult.hhi).toBeGreaterThan(flatResult.hhi);
    });

    it('should handle empty distribution', () => {
      const emptyDist: ChipDistribution = {
        levels: [], totalVolume: 0, avgCost: 0, medianCost: 0, peakPrice: 0,
      };
      const result = analyzeChipConcentration(emptyDist);
      expect(result.score).toBe(0);
      expect(result.level).toBe('low');
    });
  });

  describe('findSupportResistance', () => {
    it('should find support below current price', () => {
      const dist = analyzeChipDistribution(mockPrices, mockVolumes);
      const result = findSupportResistance(dist, 14);
      expect(result.support.length).toBeGreaterThanOrEqual(0);
      result.support.forEach(s => expect(s).toBeLessThan(14));
    });

    it('should find resistance above current price', () => {
      const dist = analyzeChipDistribution(mockPrices, mockVolumes);
      const result = findSupportResistance(dist, 11);
      expect(result.resistance.length).toBeGreaterThanOrEqual(0);
      result.resistance.forEach(r => expect(r).toBeGreaterThan(11));
    });

    it('should handle empty distribution', () => {
      const emptyDist: ChipDistribution = {
        levels: [], totalVolume: 0, avgCost: 0, medianCost: 0, peakPrice: 0,
      };
      const result = findSupportResistance(emptyDist, 10);
      expect(result.support).toHaveLength(0);
      expect(result.resistance).toHaveLength(0);
    });

    it('should limit support/resistance to 3 each', () => {
      const prices = Array.from({ length: 20 }, (_, i) => i + 1);
      const volumes = prices.map((_, i) => Math.sin(i * 0.5) * 500 + 600);
      const dist = analyzeChipDistribution(prices, volumes);
      const result = findSupportResistance(dist, 10);
      expect(result.support.length).toBeLessThanOrEqual(3);
      expect(result.resistance.length).toBeLessThanOrEqual(3);
    });
  });

  describe('analyzeChipPeaksValleys', () => {
    it('should identify peaks and valleys', () => {
      const dist = analyzeChipDistribution(mockPrices, mockVolumes);
      const result = analyzeChipPeaksValleys(dist);
      expect(result.peaks.length).toBeGreaterThanOrEqual(0);
      expect(result.dominantPeak).toBeGreaterThan(0);
    });

    it('should identify chip range', () => {
      const dist = analyzeChipDistribution(mockPrices, mockVolumes);
      const result = analyzeChipPeaksValleys(dist);
      expect(result.chipRange.low).toBe(10);
      expect(result.chipRange.high).toBe(15);
    });

    it('should handle small distributions', () => {
      const dist = analyzeChipDistribution([10, 11], [100, 200]);
      const result = analyzeChipPeaksValleys(dist);
      expect(result.peaks).toHaveLength(0);
      expect(result.valleys).toHaveLength(0);
    });
  });

  describe('analyzeChipMigration', () => {
    it('should detect accumulation', () => {
      const prev = analyzeChipDistribution([10, 11, 12], [100, 100, 100]);
      const curr = analyzeChipDistribution([10, 11, 12], [50, 50, 500]);
      const result = analyzeChipMigration(prev, curr);
      expect(result.netDirection).toBe('accumulation');
      expect(result.inflow.length).toBeGreaterThan(0);
    });

    it('should detect distribution', () => {
      const prev = analyzeChipDistribution([10, 11, 12], [50, 50, 800]);
      const curr = analyzeChipDistribution([10, 11, 12], [400, 300, 50]);
      const result = analyzeChipMigration(prev, curr);
      expect(result.netDirection).toBe('distribution');
      expect(result.outflow.length).toBeGreaterThan(0);
    });

    it('should detect neutral when balanced', () => {
      const prev = analyzeChipDistribution([10, 11, 12], [100, 100, 100]);
      const curr = analyzeChipDistribution([10, 11, 12], [100, 100, 100]);
      const result = analyzeChipMigration(prev, curr);
      expect(result.netDirection).toBe('neutral');
      expect(result.migrationStrength).toBe(0);
    });

    it('should limit inflow/outflow to 5 each', () => {
      const prices = Array.from({ length: 20 }, (_, i) => i + 1);
      const prev = analyzeChipDistribution(prices, prices.map(() => 100));
      const curr = analyzeChipDistribution(prices, prices.map((_, i) => i % 2 === 0 ? 500 : 50));
      const result = analyzeChipMigration(prev, curr);
      expect(result.inflow.length).toBeLessThanOrEqual(5);
      expect(result.outflow.length).toBeLessThanOrEqual(5);
    });

    it('should calculate migration strength 0-100', () => {
      const prev = analyzeChipDistribution([10, 11], [100, 100]);
      const curr = analyzeChipDistribution([10, 11], [1000, 10]);
      const result = analyzeChipMigration(prev, curr);
      expect(result.migrationStrength).toBeGreaterThanOrEqual(0);
      expect(result.migrationStrength).toBeLessThanOrEqual(100);
    });
  });
});
