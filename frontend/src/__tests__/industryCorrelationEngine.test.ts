import { describe, it, expect } from 'vitest';
import {
  buildCorrelationMatrix,
  industryLinkageStrength,
  IndustryReturns,
} from '../utils/industryCorrelationEngine';

describe('行业相关性矩阵引擎', () => {
  const industries: IndustryReturns[] = [
    { name: '银行', returns: Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02) },
    { name: '保险', returns: Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02) },
    { name: '券商', returns: Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.03) },
    { name: '科技', returns: Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.04) },
  ];

  describe('buildCorrelationMatrix', () => {
    it('should build matrix with correct dimensions', () => {
      const result = buildCorrelationMatrix(industries);
      expect(result.industries.length).toBe(4);
      expect(result.matrix.length).toBe(4);
      expect(result.matrix[0].length).toBe(4);
    });

    it('should have diagonal of 1', () => {
      const result = buildCorrelationMatrix(industries);
      for (let i = 0; i < 4; i++) {
        expect(result.matrix[i][i]).toBe(1);
      }
    });

    it('should have symmetric matrix', () => {
      const result = buildCorrelationMatrix(industries);
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
          expect(result.matrix[i][j]).toBeCloseTo(result.matrix[j][i], 5);
        }
      }
    });

    it('should generate pairs', () => {
      const result = buildCorrelationMatrix(industries);
      expect(result.pairs.length).toBe(6); // C(4,2) = 6
    });

    it('should classify strength', () => {
      const result = buildCorrelationMatrix(industries);
      result.pairs.forEach(p => {
        expect(['strong', 'moderate', 'weak']).toContain(p.strength);
      });
    });

    it('should handle empty input', () => {
      const result = buildCorrelationMatrix([]);
      expect(result.industries.length).toBe(0);
      expect(result.pairs.length).toBe(0);
    });

    it('should handle single industry', () => {
      const result = buildCorrelationMatrix([{ name: 'A', returns: [1, 2, 3] }]);
      expect(result.matrix[0][0]).toBe(1);
    });

    it('should detect highly correlated pair', () => {
      const corr: IndustryReturns[] = [
        { name: 'A', returns: [0.01, 0.02, -0.01, 0.03, 0.01] },
        { name: 'B', returns: [0.01, 0.02, -0.01, 0.03, 0.01] },
      ];
      const result = buildCorrelationMatrix(corr);
      expect(result.pairs[0].correlation).toBeCloseTo(1, 2);
    });
  });

  describe('industryLinkageStrength', () => {
    it('should return linkage scores for all industries', () => {
      const matrix = buildCorrelationMatrix(industries);
      const linkage = industryLinkageStrength(matrix);
      expect(linkage.length).toBe(4);
      linkage.forEach(l => {
        expect(l.linkageScore).toBeGreaterThanOrEqual(0);
        expect(l.linkageScore).toBeLessThanOrEqual(1);
      });
    });

    it('should sort by linkage score descending', () => {
      const matrix = buildCorrelationMatrix(industries);
      const linkage = industryLinkageStrength(matrix);
      for (let i = 1; i < linkage.length; i++) {
        expect(linkage[i - 1].linkageScore).toBeGreaterThanOrEqual(linkage[i].linkageScore);
      }
    });
  });
});
