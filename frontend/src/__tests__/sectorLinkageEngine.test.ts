import { describe, it, expect } from 'vitest';
import {
  getDirectRelations,
  calculateSpillover,
  findPropagationPaths,
  clusterLinkedSectors,
  predictAffectedSectors,
  getAllRelations,
} from '../utils/sectorLinkageEngine';

describe('板块联动引擎', () => {
  describe('getDirectRelations', () => {
    it('should find upstream sectors', () => {
      const result = getDirectRelations('新能源');
      expect(result.upstream.length).toBeGreaterThan(0);
      expect(result.upstream[0].upstream).toBe('有色金属');
    });

    it('should find downstream sectors', () => {
      const result = getDirectRelations('有色金属');
      expect(result.downstream.length).toBeGreaterThan(0);
    });

    it('should return empty for unknown sector', () => {
      const result = getDirectRelations('未知板块');
      expect(result.upstream).toHaveLength(0);
      expect(result.downstream).toHaveLength(0);
    });
  });

  describe('calculateSpillover', () => {
    it('should calculate spillover for related sectors', () => {
      const result = calculateSpillover('有色金属', 5, '新能源', 0.7);
      expect(result).not.toBeNull();
      expect(result!.magnitude).toBeGreaterThan(0);
      expect(result!.direction).toBe('positive');
    });

    it('should handle negative correlation', () => {
      const result = calculateSpillover('有色金属', 5, '新能源', -0.7);
      expect(result).not.toBeNull();
      expect(result!.direction).toBe('negative');
    });

    it('should return null for unrelated sectors', () => {
      const result = calculateSpillover('银行', 5, '半导体', 0.5);
      expect(result).toBeNull();
    });

    it('should include half life', () => {
      const result = calculateSpillover('有色金属', 5, '新能源', 0.7);
      expect(result!.halfLife).toBeGreaterThan(0);
    });
  });

  describe('findPropagationPaths', () => {
    it('should find paths from sector', () => {
      const paths = findPropagationPaths('原油', 3);
      expect(paths.length).toBeGreaterThan(0);
    });

    it('should start with origin sector', () => {
      const paths = findPropagationPaths('原油', 3);
      paths.forEach(p => {
        expect(p.path[0]).toBe('原油');
      });
    });

    it('should sort by expected impact', () => {
      const paths = findPropagationPaths('原油', 3);
      for (let i = 1; i < paths.length; i++) {
        expect(paths[i - 1].expectedImpact).toBeGreaterThanOrEqual(paths[i].expectedImpact);
      }
    });

    it('should limit results', () => {
      const paths = findPropagationPaths('原油', 4);
      expect(paths.length).toBeLessThanOrEqual(20);
    });

    it('should have valid strength and lag', () => {
      const paths = findPropagationPaths('原油', 3);
      paths.forEach(p => {
        expect(p.totalStrength).toBeGreaterThan(0);
        expect(p.totalStrength).toBeLessThanOrEqual(1);
        expect(p.totalLag).toBeGreaterThan(0);
      });
    });

    it('should return empty for unknown sector', () => {
      const paths = findPropagationPaths('未知板块', 3);
      expect(paths).toHaveLength(0);
    });
  });

  describe('clusterLinkedSectors', () => {
    const sectorReturns = new Map([
      ['有色金属', 5],
      ['新能源', 3],
      ['半导体', 2],
      ['消费电子', 1],
      ['银行', -1],
    ]);

    it('should find clusters of linked sectors', () => {
      const clusters = clusterLinkedSectors(sectorReturns);
      expect(clusters.length).toBeGreaterThan(0);
    });

    it('should include multiple sectors per cluster', () => {
      const clusters = clusterLinkedSectors(sectorReturns);
      clusters.forEach(c => {
        expect(c.sectors.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('should have valid correlation values', () => {
      const clusters = clusterLinkedSectors(sectorReturns);
      clusters.forEach(c => {
        expect(c.internalCorrelation).toBeGreaterThanOrEqual(0);
        expect(c.internalCorrelation).toBeLessThanOrEqual(1);
      });
    });

    it('should sort by cluster strength', () => {
      const clusters = clusterLinkedSectors(sectorReturns);
      for (let i = 1; i < clusters.length; i++) {
        expect(clusters[i - 1].clusterStrength).toBeGreaterThanOrEqual(clusters[i].clusterStrength);
      }
    });

    it('should handle empty map', () => {
      const clusters = clusterLinkedSectors(new Map());
      expect(clusters).toHaveLength(0);
    });
  });

  describe('predictAffectedSectors', () => {
    it('should predict downstream impact', () => {
      const result = predictAffectedSectors('有色金属', 5);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].sector).toBe('新能源');
    });

    it('should include lag days', () => {
      const result = predictAffectedSectors('有色金属', 5);
      result.forEach(r => {
        expect(r.lagDays).toBeGreaterThan(0);
      });
    });

    it('should include confidence score', () => {
      const result = predictAffectedSectors('有色金属', 5);
      result.forEach(r => {
        expect(r.confidence).toBeGreaterThan(0);
        expect(r.confidence).toBeLessThanOrEqual(100);
      });
    });

    it('should handle unknown sector', () => {
      const result = predictAffectedSectors('未知板块', 5);
      expect(result).toHaveLength(0);
    });

    it('should sort by absolute impact', () => {
      const result = predictAffectedSectors('原油', 3);
      for (let i = 1; i < result.length; i++) {
        expect(Math.abs(result[i - 1].expectedImpact)).toBeGreaterThanOrEqual(
          Math.abs(result[i].expectedImpact)
        );
      }
    });
  });

  describe('getAllRelations', () => {
    it('should return all predefined relations', () => {
      const relations = getAllRelations();
      expect(relations.length).toBeGreaterThan(0);
    });

    it('should have valid structure', () => {
      const relations = getAllRelations();
      relations.forEach(r => {
        expect(r.upstream).toBeTruthy();
        expect(r.downstream).toBeTruthy();
        expect(r.strength).toBeGreaterThan(0);
        expect(r.strength).toBeLessThanOrEqual(1);
        expect(r.correlation).toBeGreaterThan(-1);
        expect(r.correlation).toBeLessThanOrEqual(1);
      });
    });
  });
});
