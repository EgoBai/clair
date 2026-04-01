import { describe, it, expect } from 'vitest';

/**
 * 因子暴露分析引擎测试
 */

function regressFactor(
  stockReturns: number[],
  factorReturns: number[]
): { beta: number; alpha: number; rSquared: number; residual: number } {
  const n = Math.min(stockReturns.length, factorReturns.length);
  if (n < 3) return { beta: 0, alpha: 0, rSquared: 0, residual: 0 };
  const y = stockReturns.slice(0, n);
  const x = factorReturns.slice(0, n);
  const meanY = y.reduce((s, r) => s + r, 0) / n;
  const meanX = x.reduce((s, r) => s + r, 0) / n;
  let covXY = 0, varX = 0;
  for (let i = 0; i < n; i++) {
    covXY += (x[i] - meanX) * (y[i] - meanY);
    varX += (x[i] - meanX) ** 2;
  }
  const beta = varX > 0 ? covXY / varX : 0;
  const alpha = meanY - beta * meanX;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = alpha + beta * x[i];
    ssRes += (y[i] - pred) ** 2;
    ssTot += (y[i] - meanY) ** 2;
  }
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const residual = Math.sqrt(ssRes / Math.max(1, n - 2));
  return { beta: parseFloat(beta.toFixed(6)), alpha: parseFloat(alpha.toFixed(6)), rSquared: parseFloat(rSquared.toFixed(4)), residual: parseFloat(residual.toFixed(6)) };
}

function analyzeFactorExposures(
  stockReturns: number[],
  factors: { name: string; returns: number[] }[]
): { exposures: Map<string, number>; alpha: number; rSquared: number } {
  const exposures = new Map<string, number>();
  let totalAlpha = 0, totalRSquared = 0;
  for (const factor of factors) {
    const result = regressFactor(stockReturns, factor.returns);
    exposures.set(factor.name, result.beta);
    totalAlpha += result.alpha;
    totalRSquared += result.rSquared;
  }
  return {
    exposures,
    alpha: parseFloat((totalAlpha / Math.max(1, factors.length)).toFixed(6)),
    rSquared: parseFloat((totalRSquared / Math.max(1, factors.length)).toFixed(4)),
  };
}

function calculateTrackingError(portfolioReturns: number[], benchmarkReturns: number[]): number {
  const n = Math.min(portfolioReturns.length, benchmarkReturns.length);
  if (n < 2) return 0;
  const diffs = [];
  for (let i = 0; i < n; i++) {
    diffs.push(portfolioReturns[i] - benchmarkReturns[i]);
  }
  const mean = diffs.reduce((s, v) => s + v, 0) / n;
  const variance = diffs.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  return parseFloat((Math.sqrt(variance) * Math.sqrt(252)).toFixed(4));
}

describe('因子暴露分析引擎', () => {
  describe('regressFactor', () => {
    it('should return zeros for insufficient data', () => {
      expect(regressFactor([1], [1])).toEqual({ beta: 0, alpha: 0, rSquared: 0, residual: 0 });
    });

    it('should find perfect linear relationship', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10]; // y = 2x
      const result = regressFactor(y, x);
      expect(result.beta).toBeCloseTo(2, 1);
      expect(result.rSquared).toBeCloseTo(1, 1);
    });

    it('should find beta=1 for identical returns', () => {
      const returns = [0.01, -0.02, 0.03, -0.01, 0.02];
      const result = regressFactor(returns, returns);
      expect(result.beta).toBeCloseTo(1, 2);
      expect(result.rSquared).toBeCloseTo(1, 2);
    });

    it('should handle negative correlation', () => {
      const x = [0.01, 0.02, 0.03, 0.04, 0.05];
      const y = [0.05, 0.04, 0.03, 0.02, 0.01];
      const result = regressFactor(y, x);
      expect(result.beta).toBeLessThan(0);
    });
  });

  describe('analyzeFactorExposures', () => {
    it('should return exposures for multiple factors', () => {
      const stockReturns = [0.01, -0.02, 0.03, -0.01, 0.02, 0.01, -0.01, 0.02];
      const factors = [
        { name: 'market', returns: [0.01, -0.01, 0.02, -0.01, 0.02, 0.01, -0.01, 0.02] },
        { name: 'size', returns: [0.005, -0.005, 0.01, 0.005, -0.005, 0.01, 0.005, -0.005] },
      ];
      const result = analyzeFactorExposures(stockReturns, factors);
      expect(result.exposures.size).toBe(2);
      expect(result.exposures.has('market')).toBe(true);
      expect(result.exposures.has('size')).toBe(true);
    });

    it('should handle empty factors', () => {
      const result = analyzeFactorExposures([0.01, 0.02], []);
      expect(result.exposures.size).toBe(0);
    });
  });

  describe('calculateTrackingError', () => {
    it('should return 0 for identical returns', () => {
      const returns = [0.01, 0.02, -0.01, 0.03];
      expect(calculateTrackingError(returns, returns)).toBe(0);
    });

    it('should return positive for different returns', () => {
      const port = [0.02, 0.03, 0.01, 0.04];
      const bench = [0.01, 0.02, 0.01, 0.02];
      expect(calculateTrackingError(port, bench)).toBeGreaterThan(0);
    });

    it('should handle short arrays', () => {
      expect(calculateTrackingError([0.01], [0.02])).toBe(0);
    });
  });
});
