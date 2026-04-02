import { describe, it, expect } from 'vitest';
import { computeHedgeRatio, HedgeInput } from '../services/hedgingRatioEngine';

function generateReturns(n: number, seed: number = 1): number[] {
  const arr: number[] = [];
  for (let i = 0; i < n; i++) {
    arr.push(((seed * (i + 1) * 7) % 100 - 50) / 500);
  }
  return arr;
}

function generateCorrelatedReturns(n: number, base: number[], noise: number = 0.01): number[] {
  return base.map((v, i) => v * 0.8 + ((i * 13) % 100 - 50) / 5000 * noise * 100);
}

describe('HedgingRatioEngine', () => {
  describe('computeHedgeRatio', () => {
    it('should return null when data is too short', () => {
      const input: HedgeInput = {
        spotReturns: [0.01, 0.02],
        hedgeReturns: [0.005, 0.01],
        lookback: 5,
      };
      expect(computeHedgeRatio(input)).toBeNull();
    });

    it('should return null when fewer than 5 data points', () => {
      const input: HedgeInput = {
        spotReturns: [0.01, 0.02, 0.03, 0.01],
        hedgeReturns: [0.005, 0.01, 0.015, 0.005],
        lookback: 3,
      };
      expect(computeHedgeRatio(input)).toBeNull();
    });

    it('should compute hedge ratio for correlated series', () => {
      const spot = generateReturns(30, 1);
      const hedge = generateCorrelatedReturns(30, spot);
      const input: HedgeInput = { spotReturns: spot, hedgeReturns: hedge, lookback: 10 };
      const result = computeHedgeRatio(input);
      expect(result).not.toBeNull();
      expect(result!.hedgeRatio).toBeTypeOf('number');
      expect(result!.hedgeEfficiency).toBeGreaterThanOrEqual(0);
      expect(result!.hedgeEfficiency).toBeLessThanOrEqual(1);
      expect(result!.correlation).toBeGreaterThanOrEqual(-1);
      expect(result!.correlation).toBeLessThanOrEqual(1);
    });

    it('should return result with correct structure', () => {
      const spot = generateReturns(20, 2);
      const hedge = generateReturns(20, 3);
      const input: HedgeInput = { spotReturns: spot, hedgeReturns: hedge, lookback: 5 };
      const result = computeHedgeRatio(input);
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('hedgeRatio');
      expect(result).toHaveProperty('hedgeEfficiency');
      expect(result).toHaveProperty('residualRisk');
      expect(result).toHaveProperty('optimalRatio');
      expect(result).toHaveProperty('correlation');
      expect(result).toHaveProperty('basisRisk');
    });

    it('should have non-negative residual risk', () => {
      const spot = generateReturns(30, 5);
      const hedge = generateReturns(30, 6);
      const input: HedgeInput = { spotReturns: spot, hedgeReturns: hedge, lookback: 10 };
      const result = computeHedgeRatio(input);
      expect(result).not.toBeNull();
      expect(result!.residualRisk).toBeGreaterThanOrEqual(0);
    });

    it('basis risk should be 1 - |correlation|', () => {
      const spot = generateReturns(20, 7);
      const hedge = generateReturns(20, 8);
      const input: HedgeInput = { spotReturns: spot, hedgeReturns: hedge, lookback: 5 };
      const result = computeHedgeRatio(input);
      expect(result).not.toBeNull();
      expect(result!.basisRisk).toBeCloseTo(1 - Math.abs(result!.correlation), 3);
    });

    it('should handle perfectly correlated returns', () => {
      const n = 20;
      const spot = Array.from({ length: n }, (_, i) => i * 0.001);
      const hedge = spot.map(v => v * 2); // 2x correlated
      const input: HedgeInput = { spotReturns: spot, hedgeReturns: hedge, lookback: 5 };
      const result = computeHedgeRatio(input);
      expect(result).not.toBeNull();
      expect(Math.abs(result!.correlation)).toBeGreaterThan(0.99);
    });

    it('should handle length mismatch (longer spot)', () => {
      const spot = generateReturns(30, 1);
      const hedge = generateReturns(20, 2);
      const input: HedgeInput = { spotReturns: spot, hedgeReturns: hedge, lookback: 5 };
      const result = computeHedgeRatio(input);
      expect(result).not.toBeNull();
    });
  });
});
