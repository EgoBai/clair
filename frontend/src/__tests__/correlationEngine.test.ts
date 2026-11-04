import { describe, it, expect } from 'vitest';
import {
  calculateCorrelationMatrix,
  calculateRollingCorrelation,
  detectCorrelationRegime,
  minimumSpanningTree,
  correlationStabilityTest,
} from '../utils/correlationEngine';

function generateReturns(n: number, mean: number = 0, vol: number = 0.02): number[] {
  return Array.from({ length: n }, () => mean + (Math.random() - 0.5) * 2 * vol);
}

function generateCorrelatedReturns(n: number, base: number[], correlation: number): number[] {
  return base.map(r => r * correlation + (Math.random() - 0.5) * 0.02 * (1 - correlation));
}

describe('相关性分析引擎', () => {
  describe('calculateCorrelationMatrix', () => {
    it('should have 1 on diagonal', () => {
      const returns = new Map([
        ['A', generateReturns(100)],
        ['B', generateReturns(100)],
      ]);
      const result = calculateCorrelationMatrix(returns);
      expect(result.matrix[0][0]).toBeCloseTo(1, 5);
      expect(result.matrix[1][1]).toBeCloseTo(1, 5);
    });

    it('should detect high correlation', () => {
      const base = generateReturns(200);
      const returns = new Map([
        ['A', base],
        ['B', generateCorrelatedReturns(200, base, 0.95)],
      ]);
      const result = calculateCorrelationMatrix(returns);
      expect(result.matrix[0][1]).toBeGreaterThan(0.7);
    });

    it('should be symmetric', () => {
      const returns = new Map([
        ['A', generateReturns(100)],
        ['B', generateReturns(100)],
        ['C', generateReturns(100)],
      ]);
      const result = calculateCorrelationMatrix(returns);
      expect(result.matrix[0][1]).toBeCloseTo(result.matrix[1][0], 10);
      expect(result.matrix[0][2]).toBeCloseTo(result.matrix[2][0], 10);
    });

    it('should compute avg correlation', () => {
      const base = generateReturns(100);
      const returns = new Map([
        ['A', base],
        ['B', generateCorrelatedReturns(100, base, 0.8)],
        ['C', generateReturns(100)],
      ]);
      const result = calculateCorrelationMatrix(returns);
      expect(result.avgCorrelation).toBeDefined();
    });

    it('should return clusters', () => {
      const returns = new Map([
        ['A', generateReturns(100)],
        ['B', generateReturns(100)],
        ['C', generateReturns(100)],
        ['D', generateReturns(100)],
      ]);
      const result = calculateCorrelationMatrix(returns);
      expect(result.clusters.length).toBeLessThanOrEqual(3);
    });
  });

  describe('calculateRollingCorrelation', () => {
    it('should return rolling correlations', () => {
      const a = generateReturns(100);
      const b = generateReturns(100);
      const result = calculateRollingCorrelation(a, b, 20);
      expect(result.length).toBe(81);
      for (const r of result) {
        expect(r.correlation).toBeGreaterThanOrEqual(-1);
        expect(r.correlation).toBeLessThanOrEqual(1);
      }
    });

    it('should compute z-scores', () => {
      const a = generateReturns(100);
      const b = generateReturns(100);
      const result = calculateRollingCorrelation(a, b, 20);
      for (const r of result) {
        expect(typeof r.zScore).toBe('number');
      }
    });

    it('should return empty for short data', () => {
      const result = calculateRollingCorrelation([1, 2], [1, 2], 20);
      expect(result.length).toBe(0);
    });
  });

  describe('detectCorrelationRegime', () => {
    it('should detect regimes', () => {
      const corrs: { index: number; correlation: number; zScore: number }[] =
        Array.from({ length: 120 }, (_, i) => ({
          index: i,
          correlation: 0.3 + Math.random() * 0.4,
          zScore: 0
        }));

      const regimes = detectCorrelationRegime(corrs, 60);
      expect(regimes.length).toBeGreaterThan(0);
      for (const r of regimes) {
        expect(['low', 'medium', 'high']).toContain(r.regime);
        expect(r.stability).toBeGreaterThanOrEqual(0);
        expect(r.stability).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('minimumSpanningTree', () => {
    it('should return n-1 edges', () => {
      const symbols = ['A', 'B', 'C', 'D'];
      const matrix = [
        [1, 0.8, 0.3, 0.1],
        [0.8, 1, 0.4, 0.2],
        [0.3, 0.4, 1, 0.7],
        [0.1, 0.2, 0.7, 1],
      ];
      const edges = minimumSpanningTree(symbols, matrix);
      expect(edges.length).toBe(3);
    });

    it('should use highest correlations', () => {
      const symbols = ['A', 'B', 'C'];
      const matrix = [
        [1, 0.9, 0.1],
        [0.9, 1, 0.2],
        [0.1, 0.2, 1],
      ];
      const edges = minimumSpanningTree(symbols, matrix);
      // A-B应该有最小距离(最高相关)
      expect(edges.some(e =>
        (e.from === 'A' && e.to === 'B') || (e.from === 'B' && e.to === 'A')
      )).toBe(true);
    });

    it('should handle empty', () => {
      expect(minimumSpanningTree([], [])).toEqual([]);
    });
  });

  describe('correlationStabilityTest', () => {
    it('should return stability metrics', () => {
      const a = generateReturns(200);
      const b = generateCorrelatedReturns(200, a, 0.5);
      const result = correlationStabilityTest(a, b, 60, 50);

      expect(result.meanCorrelation).toBeGreaterThan(-1);
      expect(result.meanCorrelation).toBeLessThan(1);
      expect(result.stdCorrelation).toBeGreaterThanOrEqual(0);
      expect(result.ci95Lower).toBeLessThanOrEqual(result.ci95Upper);
    });

    it('should handle short data', () => {
      const result = correlationStabilityTest([1, 2], [1, 2], 60);
      expect(result.isStable).toBe(false);
    });

    it('同一输入两次调用应给出完全相同的稳定性结论（确定性，禁随机取窗）', () => {
      const fixed = (seed: number, n: number) => {
        const out: number[] = [];
        let x = seed;
        for (let i = 0; i < n; i++) {
          x = (x * 1103515245 + 12345) % 2147483648;
          out.push((x / 2147483648 - 0.5) * 0.02);
        }
        return out;
      };
      const a = fixed(11, 200);
      const b = fixed(29, 200).map((v, i) => v * 0.5 + a[i] * 0.5);
      const first = correlationStabilityTest(a, b, 60, 40);
      const second = correlationStabilityTest(a, b, 60, 40);
      expect(second).toEqual(first);
    });
  });

  describe('PCA 确定性', () => {
    it('同一相关系数矩阵两次调用应给出相同的特征值与解释方差（禁 Math.random 初始化）', () => {
      const fixed = (seed: number, n: number) => {
        const out: number[] = [];
        let x = seed;
        for (let i = 0; i < n; i++) {
          x = (x * 1103515245 + 12345) % 2147483648;
          out.push((x / 2147483648 - 0.5) * 0.02);
        }
        return out;
      };
      const returns = new Map([
        ['A', fixed(11, 80)],
        ['B', fixed(29, 80)],
        ['C', fixed(53, 80)],
        ['D', fixed(97, 80)],
      ]);
      const first = calculateCorrelationMatrix(returns);
      const second = calculateCorrelationMatrix(returns);
      expect(second.eigenvalues).toEqual(first.eigenvalues);
      expect(second.explainedVariance).toEqual(first.explainedVariance);
      expect(second.principalComponents).toEqual(first.principalComponents);
    });
  });
});
