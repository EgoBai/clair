import { describe, it, expect } from 'vitest';
import {
  detectEconomicCycle,
  calculateRelativeStrength,
  generateRotationSignals,
  sectorMomentumScore,
} from '../utils/sectorRotationV2Engine';
import type { SectorData } from '../utils/sectorRotationV2Engine';

function makeSector(name: string, r1m: number = 0.02, r3m: number = 0.05, r6m: number = 0.10): SectorData {
  return {
    name,
    returns: Array(60).fill(0).map(() => (Math.random() - 0.5) * 0.04),
    pe: 15 + Math.random() * 15,
    dividendYield: Math.random() * 0.04,
    momentum1M: r1m,
    momentum3M: r3m,
    momentum6M: r6m,
    volatility: 0.1 + Math.random() * 0.15,
  };
}

const testSectors: SectorData[] = [
  makeSector('technology', 0.05, 0.12, 0.20),
  makeSector('financials', 0.03, 0.08, 0.15),
  makeSector('consumer_discretionary', 0.04, 0.10, 0.18),
  makeSector('utilities', 0.01, 0.02, 0.05),
  makeSector('healthcare', 0.02, 0.06, 0.12),
  makeSector('energy', -0.02, 0.04, 0.08),
];

describe('Sector Rotation V2 Engine', () => {
  describe('detectEconomicCycle', () => {
    it('should detect cycle from sector data', () => {
      const cycle = detectEconomicCycle(testSectors);
      expect(['early', 'mid', 'late', 'recession']).toContain(cycle);
    });

    it('should detect mid cycle with strong returns', () => {
      const sectors = [
        makeSector('A', 0.06, 0.15, 0.25),
        makeSector('B', 0.05, 0.12, 0.22),
      ];
      expect(detectEconomicCycle(sectors)).toBe('mid');
    });

    it('should detect recession with negative returns', () => {
      const sectors = [
        makeSector('A', -0.08, -0.12, -0.15),
        makeSector('B', -0.06, -0.10, -0.12),
      ];
      expect(detectEconomicCycle(sectors)).toBe('recession');
    });
  });

  describe('calculateRelativeStrength', () => {
    it('should rank sectors by relative strength', () => {
      const rs = calculateRelativeStrength(testSectors);

      expect(rs.length).toBe(6);
      for (let i = 1; i < rs.length; i++) {
        expect(rs[i - 1].rs).toBeGreaterThanOrEqual(rs[i].rs);
      }
    });
  });

  describe('generateRotationSignals', () => {
    it('should generate rotation signals', () => {
      const report = generateRotationSignals(testSectors);

      expect(['early', 'mid', 'late', 'recession']).toContain(report.cycle);
      expect(report.signals.length).toBe(6);
      expect(report.leaders.length).toBeGreaterThan(0);
      expect(report.momentum.length).toBe(6);
      expect(report.recommendation.length).toBeGreaterThan(0);

      for (const signal of report.signals) {
        expect(['overweight', 'neutral', 'underweight']).toContain(signal.signal);
        expect(signal.rank).toBeGreaterThan(0);
        expect(signal.reasons.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should respect specified cycle', () => {
      const report = generateRotationSignals(testSectors, 'recession');
      expect(report.cycle).toBe('recession');

      // Utilities should be overweight in recession
      const utilities = report.signals.find(s => s.sector === 'utilities');
      expect(utilities?.signal).toBe('overweight');
    });

    it('should rank signals by score', () => {
      const report = generateRotationSignals(testSectors);
      for (let i = 1; i < report.signals.length; i++) {
        expect(report.signals[i - 1].score).toBeGreaterThanOrEqual(report.signals[i].score);
      }
    });
  });

  describe('sectorMomentumScore', () => {
    it('should calculate weighted momentum', () => {
      const sector = makeSector('TEST', 0.05, 0.10, 0.15);
      const score = sectorMomentumScore(sector);
      // 0.05*0.3 + 0.10*0.5 + 0.15*0.2 = 0.015 + 0.05 + 0.03 = 0.095
      expect(score).toBeCloseTo(0.095, 3);
    });
  });

  describe('edge cases', () => {
    it('should handle single sector', () => {
      const report = generateRotationSignals([makeSector('ONLY')]);
      expect(report.signals).toHaveLength(1);
    });

    it('should handle all zero momentum', () => {
      const sectors = [makeSector('A', 0, 0, 0), makeSector('B', 0, 0, 0)];
      const report = generateRotationSignals(sectors);
      expect(report.signals.length).toBe(2);
    });
  });
});
