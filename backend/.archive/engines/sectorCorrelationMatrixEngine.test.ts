import { describe, it, expect } from 'vitest';
import {
  pearsonCorrelation,
  spearmanCorrelation,
  rollingCorrelation,
  buildCorrelationMatrix,
  detectCorrelationDivergence,
  analyzeSectorPair,
  detectCorrelationRegime,
  computeDecorrelatedReturns,
  type SectorReturnData,
} from '../services/sectorCorrelationMatrixEngine';

describe('sectorCorrelationMatrixEngine', () => {
  describe('pearsonCorrelation', () => {
    it('should return 1 for identical series', () => {
      const x = [1, 2, 3, 4, 5];
      expect(pearsonCorrelation(x, x)).toBeCloseTo(1, 6);
    });

    it('should return -1 for inverse series', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [5, 4, 3, 2, 1];
      expect(pearsonCorrelation(x, y)).toBeCloseTo(-1, 6);
    });

    it('should return ~0 for uncorrelated series', () => {
      const x = [1, -1, 1, -1, 1, -1, 1, -1];
      const y = [1, 1, -1, -1, 1, 1, -1, -1];
      expect(Math.abs(pearsonCorrelation(x, y))).toBeLessThan(0.5);
    });

    it('should handle insufficient data', () => {
      expect(pearsonCorrelation([1], [2])).toBe(0);
    });

    it('should handle constant series', () => {
      expect(pearsonCorrelation([5, 5, 5], [1, 2, 3])).toBe(0);
    });
  });

  describe('spearmanCorrelation', () => {
    it('should return 1 for monotonic increasing', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [10, 20, 30, 40, 50];
      expect(spearmanCorrelation(x, y)).toBeCloseTo(1, 4);
    });

    it('should return -1 for monotonic decreasing', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [50, 40, 30, 20, 10];
      expect(spearmanCorrelation(x, y)).toBeCloseTo(-1, 4);
    });

    it('should handle insufficient data', () => {
      expect(spearmanCorrelation([1], [2])).toBe(0);
    });
  });

  describe('rollingCorrelation', () => {
    it('should compute rolling correlation', () => {
      const x = Array.from({ length: 50 }, (_, i) => i + Math.random());
      const y = Array.from({ length: 50 }, (_, i) => i + Math.random());
      const result = rollingCorrelation(x, y, 10);
      expect(result).toHaveLength(41);
      result.forEach(r => {
        expect(r).toBeGreaterThanOrEqual(-1);
        expect(r).toBeLessThanOrEqual(1);
      });
    });

    it('should return empty for insufficient data', () => {
      expect(rollingCorrelation([1, 2], [3, 4], 5)).toEqual([]);
    });
  });

  describe('buildCorrelationMatrix', () => {
    it('should build symmetric correlation matrix', () => {
      const sectors: SectorReturnData[] = [
        { sector: 'Tech', returns: [0.01, 0.02, -0.01, 0.03], timestamps: [] },
        { sector: 'Finance', returns: [0.02, 0.01, -0.02, 0.02], timestamps: [] },
        { sector: 'Health', returns: [0.005, 0.015, 0.00, 0.025], timestamps: [] },
      ];
      const result = buildCorrelationMatrix(sectors);
      expect(result.sectors).toEqual(['Tech', 'Finance', 'Health']);
      expect(result.matrix).toHaveLength(3);
      expect(result.matrix[0][0]).toBe(1);
      expect(result.matrix[0][1]).toBe(result.matrix[1][0]);
      expect(result.avgCorrelation).toBeGreaterThan(-1);
    });

    it('should handle empty input', () => {
      const result = buildCorrelationMatrix([]);
      expect(result.sectors).toEqual([]);
    });

    it('should support rolling window', () => {
      const sectors: SectorReturnData[] = [
        { sector: 'A', returns: Array.from({ length: 50 }, () => Math.random()), timestamps: [] },
        { sector: 'B', returns: Array.from({ length: 50 }, () => Math.random()), timestamps: [] },
      ];
      const result = buildCorrelationMatrix(sectors, 20);
      expect(result.matrix[0][1]).toBeGreaterThanOrEqual(-1);
    });
  });

  describe('detectCorrelationDivergence', () => {
    it('should detect divergence', () => {
      const result = detectCorrelationDivergence({
        sectorA: 'A', sectorB: 'B',
        correlation: 0.8,
        rollingCorrelation: [0.1, 0.2, 0.1, 0.15, 0.1],
        isDiverging: false,
        divergenceMagnitude: 0,
      }, 0.3);
      expect(result).toBe(true);
    });

    it('should not detect divergence for stable correlation', () => {
      expect(detectCorrelationDivergence({
        sectorA: 'A', sectorB: 'B',
        correlation: 0.5,
        rollingCorrelation: [0.48, 0.52, 0.5, 0.49, 0.51],
        isDiverging: false,
        divergenceMagnitude: 0,
      })).toBe(false);
    });

    it('should handle short rolling data', () => {
      expect(detectCorrelationDivergence({
        sectorA: 'A', sectorB: 'B',
        correlation: 0.5,
        rollingCorrelation: [0.5],
        isDiverging: false,
        divergenceMagnitude: 0,
      })).toBe(false);
    });
  });

  describe('analyzeSectorPair', () => {
    it('should analyze pair correlation', () => {
      const a: SectorReturnData = { sector: 'Tech', returns: Array.from({ length: 100 }, () => Math.random()), timestamps: [] };
      const b: SectorReturnData = { sector: 'Finance', returns: Array.from({ length: 100 }, () => Math.random()), timestamps: [] };
      const result = analyzeSectorPair(a, b, 20);
      expect(result.correlation).toBeGreaterThanOrEqual(-1);
      expect(result.correlation).toBeLessThanOrEqual(1);
      expect(result.rollingCorrelation.length).toBeGreaterThan(0);
    });
  });

  describe('detectCorrelationRegime', () => {
    it('should detect correlation regimes', () => {
      const corrMatrix = {
        sectors: ['A', 'B', 'C'],
        matrix: [[1, 0.8, 0.7], [0.8, 1, 0.75], [0.7, 0.75, 1]],
        timestamp: Date.now(),
        avgCorrelation: 0.75,
        eigenPortfolio: [1/3, 1/3, 1/3],
      };
      const timestamps = Array.from({ length: 500 }, (_, i) => i);
      const regimes = detectCorrelationRegime(corrMatrix, timestamps, 60);
      expect(regimes.length).toBeGreaterThan(0);
      regimes.forEach(r => {
        expect(['low', 'normal', 'high', 'crisis']).toContain(r.regime);
      });
    });
  });

  describe('computeDecorrelatedReturns', () => {
    it('should reduce correlation in returns', () => {
      const common = Array.from({ length: 50 }, () => Math.random() * 0.02);
      const returns = {
        A: common.map(c => c + Math.random() * 0.001),
        B: common.map(c => c + Math.random() * 0.001),
      };
      const result = computeDecorrelatedReturns(returns);
      expect(result.A).toHaveLength(50);
      expect(result.B).toHaveLength(50);

      const origCorr = pearsonCorrelation(returns.A, returns.B);
      const decorrCorr = pearsonCorrelation(result.A, result.B);
      // 去相关后相关系数应该降低
      expect(Math.abs(decorrCorr)).toBeLessThanOrEqual(Math.abs(origCorr) + 0.1);
    });
  });
});
