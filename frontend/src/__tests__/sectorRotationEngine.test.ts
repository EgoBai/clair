import { describe, it, expect } from 'vitest';
import {
  calculateRelativeStrength,
  generateRotationSignals,
  analyzeSeasonality,
  detectStyleRotation,
  rankSectorMomentum,
  type SectorData,
} from '../utils/sectorRotationEngine';

function generateSector(name: string, n: number, drift: number = 0): SectorData {
  const prices: number[] = [100];
  const returns: number[] = [];
  const volume: number[] = [];

  for (let i = 1; i < n; i++) {
    const r = drift + (Math.random() - 0.5) * 0.02;
    returns.push(r);
    prices.push(prices[i - 1] * (1 + r));
    volume.push(1000000 + Math.random() * 500000);
  }

  return { name, returns, prices, volume };
}

describe('板块轮动引擎', () => {
  describe('calculateRelativeStrength', () => {
    it('should return RS values', () => {
      const sector = [0.01, -0.005, 0.02, 0.01, -0.01, 0.015, 0.005, -0.008, 0.012, 0.007,
        0.003, -0.002, 0.018, 0.005, -0.01, 0.01, 0.008, -0.005, 0.015, 0.01];
      const bench = Array(20).fill(0.002);

      const rs = calculateRelativeStrength(sector, bench, 10);
      expect(rs.length).toBe(11); // 20 - 10 + 1
      for (const v of rs) {
        expect(v).toBeGreaterThan(0);
      }
    });

    it('should handle insufficient data', () => {
      const rs = calculateRelativeStrength([0.01], [0.01], 10);
      expect(rs.length).toBe(0);
    });
  });

  describe('generateRotationSignals', () => {
    it('should rank sectors by composite score', () => {
      const sectors: SectorData[] = [
        generateSector('Tech', 100, 0.002),
        generateSector('Finance', 100, -0.001),
        generateSector('Energy', 100, 0.001),
      ];
      const bench = Array(100).fill(0.001);

      const signals = generateRotationSignals(sectors, bench);
      expect(signals.length).toBe(3);
      // 应该按分数降序排列
      for (let i = 1; i < signals.length; i++) {
        expect(signals[i].compositeScore).toBeLessThanOrEqual(signals[i - 1].compositeScore);
      }
    });

    it('should assign recommendations', () => {
      const sectors: SectorData[] = [
        generateSector('A', 100, 0.005),
        generateSector('B', 100, -0.005),
      ];
      const signals = generateRotationSignals(sectors, []);
      for (const s of signals) {
        expect(['overweight', 'neutral', 'underweight']).toContain(s.recommendation);
      }
    });

    it('should have all score components', () => {
      const sectors: SectorData[] = [generateSector('Test', 100)];
      const signals = generateRotationSignals(sectors, []);
      expect(signals[0].momentum).toBeDefined();
      expect(signals[0].trend).toBeDefined();
      expect(signals[0].volumeConfirmation).toBeDefined();
    });
  });

  describe('analyzeSeasonality', () => {
    it('should return monthly returns', () => {
      const n = 365 * 2;
      const sector = generateSector('Test', n);
      const dates = Array.from({ length: n }, (_, i) => new Date(2023, 0, 1 + i));

      const result = analyzeSeasonality(sector, dates);
      expect(Object.keys(result.monthlyReturns).length).toBe(12);
      expect(result.bestMonth).toBeGreaterThanOrEqual(1);
      expect(result.bestMonth).toBeLessThanOrEqual(12);
    });

    it('consistency should be between 0 and 1', () => {
      const n = 365;
      const sector = generateSector('Test', n);
      const dates = Array.from({ length: n }, (_, i) => new Date(2023, 0, 1 + i));

      const result = analyzeSeasonality(sector, dates);
      expect(result.consistency).toBeGreaterThanOrEqual(0);
      expect(result.consistency).toBeLessThanOrEqual(1);
    });
  });

  describe('detectStyleRotation', () => {
    it('should classify style correctly', () => {
      const n = 100;
      const value = Array(n).fill(0.002);
      const growth = Array(n).fill(0.001);
      const large = Array(n).fill(0.002);
      const small = Array(n).fill(0.001);
      const highVol = Array(n).fill(0.001);
      const lowVol = Array(n).fill(0.002);
      const momentum = Array(n).fill(0.0015);

      const result = detectStyleRotation(value, growth, large, small, highVol, lowVol, momentum);
      expect(result.style).toBe('value_large');
      expect(result.valueVsGrowth).toBeGreaterThan(0);
      expect(result.largeVsSmall).toBeGreaterThan(0);
    });

    it('should detect growth small', () => {
      const n = 100;
      const value = Array(n).fill(0.001);
      const growth = Array(n).fill(0.003);
      const large = Array(n).fill(0.001);
      const small = Array(n).fill(0.003);
      const highVol = Array(n).fill(0.001);
      const lowVol = Array(n).fill(0.002);
      const momentum = Array(n).fill(0.002);

      const result = detectStyleRotation(value, growth, large, small, highVol, lowVol, momentum);
      expect(result.style).toBe('growth_small');
    });
  });

  describe('rankSectorMomentum', () => {
    it('should rank by momentum', () => {
      const sectors: SectorData[] = [
        generateSector('Weak', 500, -0.003),
        generateSector('Strong', 500, 0.005),
        generateSector('Medium', 500, 0.001),
      ];

      const ranked = rankSectorMomentum(sectors);
      expect(ranked.length).toBe(3);
      expect(ranked[0].rank).toBe(1);
      // Strong should generally rank first with larger drift difference
      expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[2].score);
    });
  });
});
