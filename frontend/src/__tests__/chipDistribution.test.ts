import { describe, it, expect } from 'vitest';
import {
  calculateChipDistribution,
  analyzeProfitLoss,
  detectChipTransition,
  type ChipDistribution,
  type ChipAnalysis,
} from '../utils/chipDistribution';

describe('ChipDistribution', () => {
  // 模拟历史价格数据
  function generateHistory(
    startPrice: number,
    endPrice: number,
    days: number
  ): { close: number; volume: number }[] {
    const step = (endPrice - startPrice) / days;
    return Array.from({ length: days }, (_, i) => ({
      close: startPrice + step * i + Math.sin(i) * 0.5,
      volume: 10000 + Math.random() * 5000,
    }));
  }

  describe('calculateChipDistribution', () => {
    it('should calculate chip distribution from historical data', () => {
      const history = generateHistory(10, 15, 60);
      const result = calculateChipDistribution(history, 15);
      expect(result.costDistribution.length).toBeGreaterThan(0);
      expect(result.avgCost).toBeGreaterThan(0);
    });

    it('should return centered distribution for single price', () => {
      const singlePrice = Array.from({ length: 30 }, () => ({
        close: 10,
        volume: 1000,
      }));
      const result = calculateChipDistribution(singlePrice, 10);
      expect(result.avgCost).toBeCloseTo(10, 0);
    });

    it('should calculate profit ratio', () => {
      const history = generateHistory(10, 12, 30);
      const result = calculateChipDistribution(history, 15); // current > historical
      expect(result.profitRatio).toBeGreaterThan(0.5); // most chips profitable
    });

    it('should calculate concentration', () => {
      const history = generateHistory(10, 15, 60);
      const result = calculateChipDistribution(history, 12);
      expect(result.concentration).toBeGreaterThanOrEqual(0);
      expect(result.concentration).toBeLessThanOrEqual(1);
    });

    it('should identify support and resistance levels', () => {
      const history = generateHistory(10, 15, 60);
      const result = calculateChipDistribution(history, 12);
      expect(result.supportLevel).toBeLessThan(result.resistanceLevel);
    });

    it('should classify chip structure', () => {
      const history = generateHistory(10, 15, 60);
      const result = calculateChipDistribution(history, 12);
      expect(['concentrated', 'dispersed', 'mixed']).toContain(result.chipStructure);
    });

    it('should handle empty history', () => {
      const result = calculateChipDistribution([], 10);
      expect(result.avgCost).toBe(10);
      expect(result.chipStructure).toBe('mixed');
    });

    it('should respect decay factor', () => {
      const history = generateHistory(10, 15, 30);
      const decay09 = calculateChipDistribution(history, 12, 0.9);
      const decay099 = calculateChipDistribution(history, 12, 0.99);
      // More aggressive decay should weight recent data more
      expect(decay09.avgCost).not.toBe(decay099.avgCost);
    });

    it('should use custom bin count', () => {
      const history = generateHistory(10, 15, 30);
      const small = calculateChipDistribution(history, 12, 0.95, 10);
      const large = calculateChipDistribution(history, 12, 0.95, 100);
      // More bins should give finer distribution
      expect(large.costDistribution.length).toBeGreaterThanOrEqual(small.costDistribution.length);
    });

    it('should round values', () => {
      const history = generateHistory(10, 15, 30);
      const result = calculateChipDistribution(history, 12);
      expect(result.avgCost).toBe(Math.round(result.avgCost * 100) / 100);
      expect(result.supportLevel).toBe(Math.round(result.supportLevel * 100) / 100);
    });

    it('should have percentages sum close to 100', () => {
      const history = generateHistory(10, 15, 30);
      const result = calculateChipDistribution(history, 12);
      const totalPct = result.costDistribution.reduce((s, d) => s + d.percentage, 0);
      expect(totalPct).toBeCloseTo(100, 0);
    });
  });

  describe('analyzeProfitLoss', () => {
    const distribution: ChipDistribution[] = [
      { price: 8, volume: 1000, percentage: 10 },
      { price: 9, volume: 2000, percentage: 20 },
      { price: 10, volume: 3000, percentage: 30 },
      { price: 11, volume: 2500, percentage: 25 },
      { price: 12, volume: 1500, percentage: 15 },
    ];

    it('should calculate profit/loss ratios', () => {
      const result = analyzeProfitLoss(distribution, 10.5);
      expect(result.profitableRatio + result.breakEvenRatio + result.lossRatio).toBeCloseTo(1, 1);
    });

    it('should identify profitable chips when price is high', () => {
      const result = analyzeProfitLoss(distribution, 12);
      expect(result.profitableRatio).toBeGreaterThan(0.5);
      expect(result.lossRatio).toBeLessThan(0.5);
    });

    it('should identify loss chips when price is low', () => {
      const result = analyzeProfitLoss(distribution, 8);
      expect(result.lossRatio).toBeGreaterThan(0.5);
      expect(result.profitableRatio).toBeLessThan(0.5);
    });

    it('should calculate max pain price', () => {
      const result = analyzeProfitLoss(distribution, 10);
      // Max volume is at price 10 (3000 volume)
      expect(result.maxPainPrice).toBe(10);
    });

    it('should handle empty distribution', () => {
      const result = analyzeProfitLoss([], 10);
      expect(result.profitableRatio).toBe(0);
      expect(result.currentPrice).toBe(10);
    });

    it('should include current price', () => {
      const result = analyzeProfitLoss(distribution, 10.5);
      expect(result.currentPrice).toBe(10.5);
    });

    it('should calculate average profit rate', () => {
      const result = analyzeProfitLoss(distribution, 12);
      expect(typeof result.avgProfitRate).toBe('number');
    });

    it('should handle all profitable', () => {
      const result = analyzeProfitLoss(distribution, 15);
      expect(result.profitableRatio).toBeGreaterThan(0.9);
      expect(result.lossRatio).toBe(0);
    });

    it('should handle all losing', () => {
      const result = analyzeProfitLoss(distribution, 5);
      expect(result.lossRatio).toBeGreaterThan(0.9);
      expect(result.profitableRatio).toBe(0);
    });
  });

  describe('detectChipTransition', () => {
    const baseChip: ChipAnalysis = {
      costDistribution: [],
      avgCost: 10,
      medianCost: 10,
      profitRatio: 0.5,
      concentration: 0.3,
      supportLevel: 9,
      resistanceLevel: 11,
      chipStructure: 'mixed',
    };

    it('should detect gathering (concentration increase)', () => {
      const current = { ...baseChip, concentration: 0.5 };
      const previous = { ...baseChip, concentration: 0.3 };
      const result = detectChipTransition(current, previous);
      expect(result.type).toBe('gathering');
      expect(result.intensity).toBeGreaterThan(0);
      expect(result.description).toContain('集中');
    });

    it('should detect distributing (concentration decrease)', () => {
      const current = { ...baseChip, concentration: 0.1 };
      const previous = { ...baseChip, concentration: 0.4 };
      const result = detectChipTransition(current, previous);
      expect(result.type).toBe('distributing');
      expect(result.description).toContain('分散');
    });

    it('should detect stable transition', () => {
      const current = { ...baseChip, concentration: 0.32 };
      const previous = { ...baseChip, concentration: 0.3 };
      const result = detectChipTransition(current, previous);
      expect(result.type).toBe('stable');
    });

    it('should detect profit increase', () => {
      const current = { ...baseChip, profitRatio: 0.8 };
      const previous = { ...baseChip, profitRatio: 0.4 };
      const result = detectChipTransition(current, previous);
      expect(result.description).toContain('获利');
    });

    it('should detect loss increase', () => {
      const current = { ...baseChip, profitRatio: 0.2 };
      const previous = { ...baseChip, profitRatio: 0.6 };
      const result = detectChipTransition(current, previous);
      expect(result.description).toContain('套牢');
    });

    it('should cap intensity at 100', () => {
      const current = { ...baseChip, concentration: 0.95 };
      const previous = { ...baseChip, concentration: 0.05 };
      const result = detectChipTransition(current, previous);
      expect(result.intensity).toBeLessThanOrEqual(100);
    });

    it('should include intensity', () => {
      const current = { ...baseChip, concentration: 0.5 };
      const previous = { ...baseChip, concentration: 0.3 };
      const result = detectChipTransition(current, previous);
      expect(result.intensity).toBeGreaterThanOrEqual(0);
      expect(result.intensity).toBeLessThanOrEqual(100);
    });
  });
});
