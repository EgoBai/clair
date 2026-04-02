import { describe, it, expect } from 'vitest';
import { analyzeFactorDecay, computeWeightedFactor, FactorReturn } from '../services/factorDecayEngine';

function genFactorReturns(n: number, decayRate: number): FactorReturn[] {
  const data: FactorReturn[] = [];
  let fv = 1.0;
  for (let i = 0; i < n; i++) {
    fv = fv * (1 - decayRate) + (Math.random() - 0.5) * 0.1;
    data.push({
      date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      factorValue: fv,
      forwardReturn: fv * 0.3 + (Math.random() - 0.5) * 0.05,
    });
  }
  return data;
}

describe('FactorDecayEngine', () => {
  const fastDecay = genFactorReturns(100, 0.3);
  const slowDecay = genFactorReturns(100, 0.02);

  describe('analyzeFactorDecay', () => {
    it('should return null for insufficient data', () => {
      expect(analyzeFactorDecay(genFactorReturns(3, 0.1))).toBeNull();
    });

    it('should return valid decay result', () => {
      const result = analyzeFactorDecay(fastDecay);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.halfLife).toBeGreaterThan(0);
      expect(result.icSeries.length).toBeGreaterThan(0);
      expect(result.decayWeights.length).toBeGreaterThan(0);
    });

    it('should detect faster decay for high decay rate', () => {
      const fast = analyzeFactorDecay(fastDecay);
      const slow = analyzeFactorDecay(slowDecay);
      expect(fast).not.toBeNull();
      expect(slow).not.toBeNull();
      if (!fast || !slow) return;
      expect(fast.halfLife).toBeLessThanOrEqual(slow.halfLife);
    });

    it('should compute IC metrics', () => {
      const result = analyzeFactorDecay(slowDecay);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(typeof result.meanIC).toBe('number');
      expect(result.icStd).toBeGreaterThanOrEqual(0);
      expect(typeof result.icIR).toBe('number');
    });

    it('should classify decay speed', () => {
      const result = analyzeFactorDecay(fastDecay);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(['fast', 'medium', 'slow']).toContain(result.decaySpeed);
    });

    it('should apply custom config', () => {
      const result = analyzeFactorDecay(slowDecay, { maxLag: 10, effectiveICThreshold: 0.01 });
      expect(result).not.toBeNull();
    });
  });

  describe('computeWeightedFactor', () => {
    it('should return weighted factor values', () => {
      const weighted = computeWeightedFactor(slowDecay);
      expect(weighted.length).toBe(slowDecay.length);
    });

    it('should smooth out noise', () => {
      const weighted = computeWeightedFactor(fastDecay);
      // 加权平均应该比原始值更平滑
      let rawVar = 0, wVar = 0;
      for (let i = 1; i < fastDecay.length; i++) {
        rawVar += (fastDecay[i].factorValue - fastDecay[i - 1].factorValue) ** 2;
        wVar += (weighted[i] - weighted[i - 1]) ** 2;
      }
      // 加权后的方差应该更小（更平滑）
      expect(wVar).toBeLessThanOrEqual(rawVar * 1.1); // 允许小误差
    });
  });
});
