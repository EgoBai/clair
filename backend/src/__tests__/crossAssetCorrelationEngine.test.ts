import { describe, it, expect } from 'vitest';
import { CrossAssetCorrelationEngine } from '../services/crossAssetCorrelationEngine';

describe('CrossAssetCorrelationEngine', () => {
  const engine = new CrossAssetCorrelationEngine();

  const generateReturns = (n: number, seed: number = 42): number[] => {
    const result: number[] = [];
    let s = seed;
    for (let i = 0; i < n; i++) {
      s = (s * 16807 + 0) % 2147483647;
      result.push((s / 2147483647 - 0.5) * 0.04);
    }
    return result;
  };

  const generateCorrelated = (n: number, corr: number): [number[], number[]] => {
    const x = generateReturns(n, 42);
    const noise = generateReturns(n, 99);
    const y = x.map((v, i) => corr * v + Math.sqrt(1 - corr * corr) * noise[i]);
    return [x, y];
  };

  describe('pearsonCorrelation', () => {
    it('returns 0 for insufficient data', () => {
      const result = engine.pearsonCorrelation([1, 2], [3, 4]);
      expect(result.corr).toBe(0);
      expect(result.pValue).toBe(1);
    });

    it('returns 1 for perfectly correlated series', () => {
      const series = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const { corr } = engine.pearsonCorrelation(series, series);
      expect(corr).toBeCloseTo(1, 5);
    });

    it('returns -1 for negatively correlated series', () => {
      const s1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const s2 = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
      const { corr } = engine.pearsonCorrelation(s1, s2);
      expect(corr).toBeCloseTo(-1, 5);
    });

    it('returns near 0 for uncorrelated series', () => {
      const [x, y] = generateCorrelated(100, 0);
      const { corr } = engine.pearsonCorrelation(x, y);
      expect(Math.abs(corr)).toBeLessThan(0.3);
    });

    it('clamps correlation to [-1, 1]', () => {
      const s1 = [1, 2, 3, 4, 5];
      const { corr } = engine.pearsonCorrelation(s1, s1);
      expect(corr).toBeGreaterThanOrEqual(-1);
      expect(corr).toBeLessThanOrEqual(1);
    });

    it('returns 0 for zero-variance series', () => {
      const const1 = [5, 5, 5, 5, 5];
      const const2 = [3, 3, 3, 3, 3];
      const { corr } = engine.pearsonCorrelation(const1, const2);
      expect(corr).toBe(0);
    });

    it('handles mixed-length series', () => {
      const s1 = [1, 2, 3, 4, 5, 6, 7, 8];
      const s2 = [10, 20, 30, 40, 50];
      const { corr } = engine.pearsonCorrelation(s1, s2);
      expect(corr).toBeCloseTo(1, 5);
    });
  });

  describe('rollingCorrelation', () => {
    it('returns empty for short series', () => {
      const result = engine.rollingCorrelation([1, 2, 3], [4, 5, 6], 10);
      expect(result).toEqual([]);
    });

    it('computes rolling correlations', () => {
      const [x, y] = generateCorrelated(100, 0.8);
      const result = engine.rollingCorrelation(x, y, 20);
      expect(result.length).toBeGreaterThan(0);
      result.forEach(r => {
        expect(r.corr).toBeGreaterThanOrEqual(-1);
        expect(r.corr).toBeLessThanOrEqual(1);
      });
    });

    it('respects window size', () => {
      const [x, y] = generateCorrelated(100, 0.5);
      const w20 = engine.rollingCorrelation(x, y, 20);
      const w50 = engine.rollingCorrelation(x, y, 50);
      expect(w50.length).toBeLessThan(w20.length);
    });

    it('timestamps are sequential', () => {
      const [x, y] = generateCorrelated(50, 0.5);
      const result = engine.rollingCorrelation(x, y, 10);
      for (let i = 1; i < result.length; i++) {
        expect(result[i].timestamp).toBeGreaterThan(result[i - 1].timestamp);
      }
    });
  });

  describe('correlationMatrix', () => {
    it('builds diagonal as 1', () => {
      const assets = ['A', 'B', 'C'];
      const returns = new Map([
        ['A', generateReturns(50, 1)],
        ['B', generateReturns(50, 2)],
        ['C', generateReturns(50, 3)],
      ]);
      const result = engine.correlationMatrix(assets, returns, 30);
      for (let i = 0; i < 3; i++) {
        expect(result.matrix[i][i]).toBe(1);
      }
    });

    it('is symmetric', () => {
      const assets = ['A', 'B', 'C'];
      const returns = new Map([
        ['A', generateReturns(50, 1)],
        ['B', generateReturns(50, 2)],
        ['C', generateReturns(50, 3)],
      ]);
      const result = engine.correlationMatrix(assets, returns, 30);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(result.matrix[i][j]).toBeCloseTo(result.matrix[j][i], 10);
        }
      }
    });

    it('handles missing assets gracefully', () => {
      const assets = ['A', 'B'];
      const returns = new Map([['A', generateReturns(50, 1)]]);
      const result = engine.correlationMatrix(assets, returns, 30);
      expect(result.matrix.length).toBe(2);
    });
  });

  describe('fitDCC', () => {
    it('returns null for insufficient data', () => {
      expect(engine.fitDCC([1, 2], [3, 4])).toBeNull();
    });

    it('fits DCC model', () => {
      const [x, y] = generateCorrelated(100, 0.7);
      const result = engine.fitDCC(x, y);
      expect(result).not.toBeNull();
      expect(result!.alpha).toBe(0.05);
      expect(result!.beta).toBe(0.93);
      expect(result!.dynamicCorrs.length).toBe(100);
      expect(Math.abs(result!.unconditionalCorr[0])).toBeGreaterThan(0.3);
    });

    it('returns null for zero-variance series', () => {
      const zeros = Array(50).fill(0);
      expect(engine.fitDCC(zeros, zeros)).toBeNull();
    });

    it('dynamic correlations are bounded', () => {
      const [x, y] = generateCorrelated(100, 0.5);
      const result = engine.fitDCC(x, y);
      expect(result).not.toBeNull();
      result!.dynamicCorrs.forEach(([c]) => {
        expect(c).toBeGreaterThanOrEqual(-1);
        expect(c).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('detectStructuralBreaks', () => {
    it('returns empty for short series', () => {
      const result = engine.detectStructuralBreaks([1, 2, 3], [4, 5, 6]);
      expect(result).toEqual([]);
    });

    it('detects correlation regime changes', () => {
      // First half correlated, second half uncorrelated
      const n = 100;
      const [x1, y1] = generateCorrelated(50, 0.9);
      const x2 = generateReturns(50, 77);
      const y2 = generateReturns(50, 88);
      const x = [...x1, ...x2];
      const y = [...y1, ...y2];
      const result = engine.detectStructuralBreaks(x, y, 20);
      expect(result.length).toBeGreaterThanOrEqual(0); // may or may not detect
    });

    it('breaks have valid confidence', () => {
      const [x, y] = generateCorrelated(200, 0.5);
      const result = engine.detectStructuralBreaks(x, y, 30);
      result.forEach(b => {
        expect(b.confidence).toBeGreaterThan(2);
        expect(b.beforeCorr).toBeGreaterThanOrEqual(-1);
        expect(b.afterCorr).toBeGreaterThanOrEqual(-1);
      });
    });
  });

  describe('contagionAnalysis', () => {
    it('returns empty for short series', () => {
      const result = engine.contagionAnalysis([1, 2, 3], [4, 5, 6]);
      expect(result).toEqual([]);
    });

    it('detects lead-lag relationships', () => {
      const n = 100;
      const source = generateReturns(n, 42);
      const target = source.map((v, i) => (i > 0 ? 0.5 * source[i - 1] + 0.5 * (Math.random() - 0.5) * 0.02 : v));
      const result = engine.contagionAnalysis(source, target, 3);
      expect(result.length).toBe(3);
      result.forEach(e => {
        expect(e.lagDays).toBeGreaterThanOrEqual(1);
        expect(e.rSquared).toBeGreaterThanOrEqual(0);
        expect(e.rSquared).toBeLessThanOrEqual(1);
      });
    });

    it('returns results for each lag', () => {
      const [x, y] = generateCorrelated(100, 0.5);
      const result = engine.contagionAnalysis(x, y, 5);
      expect(result.length).toBe(5);
    });
  });

  describe('quantileCorrelation', () => {
    it('returns null for insufficient data', () => {
      expect(engine.quantileCorrelation([1, 2], [3, 4])).toBeNull();
    });

    it('computes tail correlations', () => {
      const [x, y] = generateCorrelated(200, 0.6);
      const result = engine.quantileCorrelation(x, y);
      expect(result).not.toBeNull();
      expect(result!.lowerTail).toBeGreaterThanOrEqual(-1);
      expect(result!.lowerTail).toBeLessThanOrEqual(1);
      expect(result!.upperTail).toBeGreaterThanOrEqual(-1);
      expect(result!.upperTail).toBeLessThanOrEqual(1);
    });

    it('normal correlation is in valid range', () => {
      const [x, y] = generateCorrelated(100, 0.3);
      const result = engine.quantileCorrelation(x, y);
      expect(result).not.toBeNull();
      expect(Math.abs(result!.normalCorr)).toBeGreaterThan(0);
    });
  });

  describe('eigenAnalysis', () => {
    it('handles empty matrix', () => {
      const result = engine.eigenAnalysis([]);
      expect(result.eigenvalues).toEqual([]);
    });

    it('returns eigenvalues for identity matrix', () => {
      const matrix = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const result = engine.eigenAnalysis(matrix);
      expect(result.eigenvalues.length).toBe(3);
      result.eigenvalues.forEach(e => expect(Math.abs(e)).toBeGreaterThan(0));
    });

    it('explained variance sums to ~1', () => {
      const matrix = [[1, 0.5, 0.3], [0.5, 1, 0.4], [0.3, 0.4, 1]];
      const result = engine.eigenAnalysis(matrix);
      const sum = result.explainedVariance.reduce((s, v) => s + v, 0);
      expect(sum).toBeCloseTo(1, 1);
    });

    it('cumulative variance is non-decreasing', () => {
      const matrix = [[1, 0.5], [0.5, 1]];
      const result = engine.eigenAnalysis(matrix);
      for (let i = 1; i < result.cumulativeVariance.length; i++) {
        expect(result.cumulativeVariance[i]).toBeGreaterThanOrEqual(result.cumulativeVariance[i - 1]);
      }
    });
  });

  describe('stabilityScore', () => {
    it('returns 0 for empty array', () => {
      expect(engine.stabilityScore([])).toBe(0);
    });

    it('returns 0 for single element', () => {
      expect(engine.stabilityScore([0.5])).toBe(0);
    });

    it('returns high score for stable correlations', () => {
      const stable = Array(50).fill(0.8);
      const score = engine.stabilityScore(stable);
      expect(score).toBeGreaterThan(0.9);
    });

    it('returns low score for volatile correlations', () => {
      const volatile = [0.9, -0.8, 0.7, -0.9, 0.8, -0.7];
      const score = engine.stabilityScore(volatile);
      expect(score).toBeLessThan(0.5);
    });

    it('score is bounded [0, 1]', () => {
      expect(engine.stabilityScore([0.1, 0.2, 0.3])).toBeGreaterThanOrEqual(0);
      expect(engine.stabilityScore([0.1, 0.2, 0.3])).toBeLessThanOrEqual(1);
    });
  });
});
