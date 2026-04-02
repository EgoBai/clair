import { describe, it, expect } from 'vitest';
import { SectorRotationTimingEngine, SectorData } from '../utils/sectorRotationTimingEngine';

describe('SectorRotationTimingEngine', () => {
  const engine = new SectorRotationTimingEngine();

  const makeSectors = (): SectorData[] => [
    { name: '科技', returns: Array.from({ length: 30 }, () => 0.01), momentum: 0.15, valuation: 0.8, fundFlow: 0.05 },
    { name: '消费', returns: Array.from({ length: 30 }, () => 0.005), momentum: 0.05, valuation: 0.5, fundFlow: 0.02 },
    { name: '金融', returns: Array.from({ length: 30 }, () => -0.005), momentum: -0.05, valuation: 0.3, fundFlow: -0.03 },
    { name: '医药', returns: Array.from({ length: 30 }, () => 0.008), momentum: 0.08, valuation: 0.6, fundFlow: 0.01 },
    { name: '能源', returns: Array.from({ length: 30 }, () => -0.01), momentum: -0.1, valuation: 0.2, fundFlow: -0.05 },
  ];

  describe('analyze', () => {
    it('should return rotation signals', () => {
      const result = engine.analyze(makeSectors());
      expect(result.length).toBe(5);
    });

    it('signals are valid', () => {
      const result = engine.analyze(makeSectors());
      result.forEach(s => {
        expect(['overweight', 'underweight', 'neutral']).toContain(s.signal);
        expect(['early', 'mid', 'late']).toContain(s.timing);
      });
    });

    it('composite scores in [0,1]', () => {
      const result = engine.analyze(makeSectors());
      result.forEach(s => {
        expect(s.compositeScore).toBeGreaterThanOrEqual(0);
        expect(s.compositeScore).toBeLessThanOrEqual(1);
      });
    });

    it('sorted by composite score descending', () => {
      const result = engine.analyze(makeSectors());
      for (let i = 1; i < result.length; i++) {
        expect(result[i].compositeScore).toBeLessThanOrEqual(result[i - 1].compositeScore);
      }
    });

    it('handles empty sectors', () => {
      expect(engine.analyze([])).toEqual([]);
    });
  });

  describe('getTopRotation', () => {
    it('should return buy and sell lists', () => {
      const result = engine.getTopRotation(makeSectors());
      expect(result.buy.length).toBeLessThanOrEqual(3);
      expect(result.sell.length).toBeLessThanOrEqual(3);
    });
  });
});
