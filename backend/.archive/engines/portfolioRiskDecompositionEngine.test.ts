import { describe, it, expect } from 'vitest';
import {
  estimateCovariance,
  computePortfolioRisk,
  computeMarginalRiskContributions,
  computePortfolioBeta,
  decomposeRisk,
  covarianceToCorrelation,
  computeEigenValues,
  suggestRiskBudgetAdjustments,
  type AssetWeight,
  type CovarianceMatrix,
} from '../services/portfolioRiskDecompositionEngine';

describe('portfolioRiskDecompositionEngine', () => {
  describe('estimateCovariance', () => {
    it('should compute covariance matrix from returns', () => {
      const returns = {
        A: [0.01, 0.02, -0.01, 0.03, 0.01],
        B: [0.02, 0.01, -0.02, 0.02, 0.01],
      };
      const cov = estimateCovariance(returns);
      expect(cov.symbols).toEqual(['A', 'B']);
      expect(cov.matrix).toHaveLength(2);
      expect(cov.matrix[0][0]).toBeGreaterThan(0); // variance A
      expect(cov.matrix[1][1]).toBeGreaterThan(0); // variance B
      expect(cov.matrix[0][1]).toBe(cov.matrix[1][0]); // symmetric
    });

    it('should handle empty returns', () => {
      const cov = estimateCovariance({});
      expect(cov.symbols).toEqual([]);
    });

    it('should handle single observation', () => {
      const cov = estimateCovariance({ A: [0.01] });
      expect(cov.matrix[0][0]).toBe(0);
    });

    it('should produce diagonal for uncorrelated series', () => {
      const returns = { A: [1, -1, 1, -1], B: [0, 0, 0, 0] };
      const cov = estimateCovariance(returns);
      expect(cov.matrix[0][1]).toBe(0);
    });
  });

  describe('computePortfolioRisk', () => {
    it('should compute risk from covariance matrix', () => {
      const weights = [0.5, 0.5];
      const covariance = [[0.04, 0.01], [0.01, 0.09]];
      const risk = computePortfolioRisk(weights, covariance);
      expect(risk).toBeGreaterThan(0);
      expect(risk).toBeLessThan(0.5);
    });

    it('should be lower than weighted average for diversification', () => {
      const weights = [0.5, 0.5];
      const cov = [[0.04, 0.01], [0.01, 0.04]];
      const risk = computePortfolioRisk(weights, cov);
      const avgVol = 0.5 * Math.sqrt(0.04) + 0.5 * Math.sqrt(0.04);
      expect(risk).toBeLessThan(avgVol);
    });

    it('should return 0 for zero weights', () => {
      expect(computePortfolioRisk([0, 0], [[1, 0], [0, 1]])).toBe(0);
    });

    it('should handle single asset', () => {
      const risk = computePortfolioRisk([1], [[0.09]]);
      expect(risk).toBeCloseTo(0.3, 4);
    });
  });

  describe('computeMarginalRiskContributions', () => {
    it('should sum to total portfolio risk', () => {
      const weights = [0.6, 0.4];
      const cov = [[0.04, 0.012], [0.012, 0.09]];
      const marginalContribs = computeMarginalRiskContributions(weights, cov);
      const totalRisk = computePortfolioRisk(weights, cov);
      const weightedSum = weights.reduce((s, w, i) => s + w * marginalContribs[i], 0);
      expect(weightedSum).toBeCloseTo(totalRisk, 6);
    });

    it('should return zeros for degenerate case', () => {
      const result = computeMarginalRiskContributions([0, 0], [[0, 0], [0, 0]]);
      expect(result).toEqual([0, 0]);
    });
  });

  describe('computePortfolioBeta', () => {
    it('should compute weighted beta', () => {
      expect(computePortfolioBeta([0.5, 0.5], [1.2, 0.8])).toBeCloseTo(1.0, 4);
    });

    it('should be zero for zero weights', () => {
      expect(computePortfolioBeta([0, 0], [1, 2])).toBe(0);
    });
  });

  describe('decomposeRisk', () => {
    it('should decompose total risk into systematic and specific', () => {
      const assets: AssetWeight[] = [
        { symbol: 'A', weight: 0.6, expectedReturn: 0.1, volatility: 0.2, beta: 1.2 },
        { symbol: 'B', weight: 0.4, expectedReturn: 0.08, volatility: 0.3, beta: 0.8 },
      ];
      const cov: CovarianceMatrix = {
        symbols: ['A', 'B'],
        matrix: [[0.04, 0.012], [0.012, 0.09]],
      };
      const result = decomposeRisk(assets, cov, 0.0225);

      expect(result.totalRisk).toBeGreaterThan(0);
      expect(result.systematicRisk).toBeGreaterThanOrEqual(0);
      expect(result.specificRisk).toBeGreaterThanOrEqual(0);
      expect(result.componentRisks).toHaveLength(2);
      expect(result.marginalContributions).toHaveLength(2);
      expect(result.correlationStats.avgCorrelation).toBeGreaterThan(-1);
      expect(result.correlationStats.eigenValues.length).toBeGreaterThan(0);
    });

    it('should handle single asset', () => {
      const assets: AssetWeight[] = [
        { symbol: 'A', weight: 1, expectedReturn: 0.1, volatility: 0.2, beta: 1 },
      ];
      const cov: CovarianceMatrix = { symbols: ['A'], matrix: [[0.04]] };
      const result = decomposeRisk(assets, cov, 0.0225);
      expect(result.totalRisk).toBeCloseTo(0.2, 4);
      expect(result.diversificationRatio).toBe(1);
    });
  });

  describe('covarianceToCorrelation', () => {
    it('should convert covariance to correlation', () => {
      const cov = [[0.04, 0.012], [0.012, 0.09]];
      const corr = covarianceToCorrelation(cov);
      expect(corr[0][0]).toBeCloseTo(1, 4);
      expect(corr[1][1]).toBeCloseTo(1, 4);
      expect(corr[0][1]).toBeCloseTo(0.012 / (0.2 * 0.3), 4);
    });

    it('should handle zero variance', () => {
      const corr = covarianceToCorrelation([[0, 0], [0, 0.04]]);
      expect(corr[0][0]).toBe(1);
      expect(corr[0][1]).toBe(0);
    });
  });

  describe('computeEigenValues', () => {
    it('should compute eigenvalues for identity matrix', () => {
      const eigen = computeEigenValues([[1, 0], [0, 1]]);
      expect(eigen.length).toBeGreaterThan(0);
      eigen.forEach(v => expect(typeof v).toBe('number'));
    });

    it('should handle 1x1 matrix', () => {
      expect(computeEigenValues([[5]])).toEqual([5]);
    });

    it('should handle empty matrix', () => {
      expect(computeEigenValues([])).toEqual([]);
    });

    it('should return sorted eigenvalues', () => {
      const eigen = computeEigenValues([[2, 1], [1, 3]]);
      expect(eigen[0]).toBeGreaterThanOrEqual(eigen[1]);
    });
  });

  describe('suggestRiskBudgetAdjustments', () => {
    it('should suggest weight adjustments', () => {
      const assets: AssetWeight[] = [
        { symbol: 'A', weight: 0.7, expectedReturn: 0.1, volatility: 0.15, beta: 1 },
        { symbol: 'B', weight: 0.3, expectedReturn: 0.12, volatility: 0.25, beta: 1.5 },
      ];
      const cov: CovarianceMatrix = {
        symbols: ['A', 'B'],
        matrix: [[0.0225, 0.01], [0.01, 0.0625]],
      };
      const adjustments = suggestRiskBudgetAdjustments(assets, cov, [0.5, 0.5]);
      expect(adjustments).toHaveLength(2);
      adjustments.forEach(a => {
        expect(a.currentWeight).toBeGreaterThanOrEqual(0);
        expect(a.suggestedWeight).toBeGreaterThanOrEqual(0);
        expect(a.suggestedWeight).toBeLessThanOrEqual(1);
      });
    });
  });
});
