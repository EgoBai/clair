import { describe, it, expect } from 'vitest';
import {
  buildCovarianceMatrix,
  portfolioVariance,
  portfolioRisk,
  marginalRiskContribution,
  riskContributionDecomposition,
  diversificationRatio,
  calculateVaR,
  calculateCVaR,
  analyzePortfolioRisk,
  riskParityAllocation,
} from '../utils/portfolioRiskBudgetEngine';
import type { Asset } from '../utils/portfolioRiskBudgetEngine';

const assets: Asset[] = [
  { name: 'Stocks', weight: 0.5, volatility: 0.2, expectedReturn: 0.1, beta: 1.0 },
  { name: 'Bonds', weight: 0.3, volatility: 0.05, expectedReturn: 0.04, beta: 0.2 },
  { name: 'Gold', weight: 0.2, volatility: 0.15, expectedReturn: 0.06, beta: 0.1 },
];

const correlations = [
  [1.0, -0.2, 0.1],
  [-0.2, 1.0, 0.0],
  [0.1, 0.0, 1.0],
];

describe('Portfolio Risk Budget Engine', () => {
  describe('buildCovarianceMatrix', () => {
    it('should build correct covariance matrix', () => {
      const cov = buildCovarianceMatrix(assets, correlations);
      expect(cov.length).toBe(3);
      expect(cov[0][0]).toBeCloseTo(0.04, 4); // 0.2 * 0.2 * 1
      expect(cov[1][1]).toBeCloseTo(0.0025, 4);
      expect(cov[0][1]).toBeCloseTo(-0.002, 4);
    });

    it('should handle missing correlations', () => {
      const cov = buildCovarianceMatrix(assets, []);
      expect(cov[0][1]).toBe(0);
    });
  });

  describe('portfolioVariance', () => {
    it('should calculate portfolio variance', () => {
      const cov = buildCovarianceMatrix(assets, correlations);
      const w = assets.map((a) => a.weight);
      const variance = portfolioVariance(w, cov);
      expect(variance).toBeGreaterThan(0);
    });
  });

  describe('portfolioRisk', () => {
    it('should calculate portfolio risk (std dev)', () => {
      const cov = buildCovarianceMatrix(assets, correlations);
      const w = assets.map((a) => a.weight);
      const risk = portfolioRisk(w, cov);
      expect(risk).toBeGreaterThan(0);
      expect(risk).toBe(Math.sqrt(portfolioVariance(w, cov)));
    });
  });

  describe('marginalRiskContribution', () => {
    it('should calculate marginal risk for each asset', () => {
      const cov = buildCovarianceMatrix(assets, correlations);
      const w = assets.map((a) => a.weight);
      const mrc = marginalRiskContribution(w, cov, 0);
      expect(typeof mrc).toBe('number');
    });
  });

  describe('riskContributionDecomposition', () => {
    it('should decompose risk contributions', () => {
      const cov = buildCovarianceMatrix(assets, correlations);
      const decomp = riskContributionDecomposition(assets, cov);

      expect(decomp.length).toBe(3);
      const totalPct = decomp.reduce((s, d) => s + d.riskContributionPct, 0);
      expect(totalPct).toBeCloseTo(100, 0);
    });
  });

  describe('diversificationRatio', () => {
    it('should be >= 1 for diversified portfolio', () => {
      const cov = buildCovarianceMatrix(assets, correlations);
      const w = assets.map((a) => a.weight);
      const vols = assets.map((a) => a.volatility);
      const dr = diversificationRatio(w, vols, cov);
      expect(dr).toBeGreaterThanOrEqual(1);
    });

    it('should be 1 for single asset', () => {
      const cov = [[0.04]];
      const dr = diversificationRatio([1], [0.2], cov);
      expect(dr).toBe(1);
    });
  });

  describe('calculateVaR', () => {
    it('should calculate VaR', () => {
      const var95 = calculateVaR(0.08, 0.15);
      expect(typeof var95).toBe('number');
    });

    it('should be higher for 99% confidence', () => {
      const var95 = calculateVaR(0.08, 0.15, 0.95);
      const var99 = calculateVaR(0.08, 0.15, 0.99);
      expect(var99).toBeGreaterThan(var95);
    });
  });

  describe('calculateCVaR', () => {
    it('should be >= VaR', () => {
      const var95 = calculateVaR(0.08, 0.15);
      const cvar95 = calculateCVaR(0.08, 0.15);
      expect(cvar95).toBeGreaterThanOrEqual(var95);
    });
  });

  describe('analyzePortfolioRisk', () => {
    it('should return complete risk analysis', () => {
      const cov = buildCovarianceMatrix(assets, correlations);
      const risk = analyzePortfolioRisk(assets, correlations);

      expect(risk.totalRisk).toBeGreaterThan(0);
      expect(risk.diversificationRatio).toBeGreaterThanOrEqual(1);
      expect(risk.riskContributions.length).toBe(3);
      expect(typeof risk.sharpeRatio).toBe('number');
      expect(typeof risk.maxDrawdown).toBe('number');
      expect(typeof risk.var95).toBe('number');
      expect(typeof risk.cvar95).toBe('number');
    });
  });

  describe('riskParityAllocation', () => {
    it('should return valid allocations', () => {
      const result = riskParityAllocation(assets, correlations);

      expect(result.allocations.length).toBe(3);
      result.allocations.forEach((a) => {
        expect(a.weight).toBeGreaterThanOrEqual(0);
        expect(a.weight).toBeLessThanOrEqual(1);
      });
    });

    it('should return total risk', () => {
      const result = riskParityAllocation(assets, correlations);
      expect(result.totalRisk).toBeGreaterThanOrEqual(0);
    });

    it('should indicate if balanced', () => {
      const result = riskParityAllocation(assets, correlations);
      expect(typeof result.isBalanced).toBe('boolean');
    });
  });
});
