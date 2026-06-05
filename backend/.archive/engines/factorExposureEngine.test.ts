import { describe, it, expect } from 'vitest';
import {
  regressFactor,
  multiFactorRegression,
  analyzePortfolioExposure,
  decomposeReturns,
  FactorData,
  StockExposure,
} from '../services/factorExposureEngine';

describe('factorExposureEngine', () => {
  describe('regressFactor', () => {
    it('should return zeros for insufficient data', () => {
      const result = regressFactor([1, 2], [1, 2]);
      expect(result.beta).toBe(0);
      expect(result.rSquared).toBe(0);
    });

    it('should calculate beta for correlated data', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10]; // y = 2x
      const result = regressFactor(y, x);
      expect(result.beta).toBeCloseTo(2, 1);
    });

    it('should calculate alpha (intercept)', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [3, 5, 7, 9, 11]; // y = 2x + 1
      const result = regressFactor(y, x);
      expect(result.alpha).toBeCloseTo(1, 1);
    });

    it('should calculate R-squared', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10]; // perfect correlation
      const result = regressFactor(y, x);
      expect(result.rSquared).toBeCloseTo(1, 1);
    });

    it('should handle uncorrelated data', () => {
      const x = [1, 1, 1, 1, 1]; // constant
      const y = [1, 2, 3, 4, 5];
      const result = regressFactor(y, x);
      expect(result.beta).toBe(0);
    });

    it('should calculate residual', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];
      const result = regressFactor(y, x);
      expect(result.residual).toBeCloseTo(0, 1);
    });
  });

  describe('multiFactorRegression', () => {
    it('should handle empty factors', () => {
      const result = multiFactorRegression([1, 2, 3], []);
      expect(result.exposures.size).toBe(0);
      expect(result.rSquared).toBe(0);
    });

    it('should calculate exposures for multiple factors', () => {
      const factors: FactorData[] = [
        { name: 'market', returns: [0.01, 0.02, 0.01, 0.03, 0.02], description: 'Market' },
        { name: 'size', returns: [0.005, -0.01, 0.02, 0.01, -0.005], description: 'Size' },
      ];
      const stockReturns = [0.015, 0.02, 0.02, 0.03, 0.015];
      const result = multiFactorRegression(stockReturns, factors);
      expect(result.exposures.has('market')).toBe(true);
      expect(result.exposures.has('size')).toBe(true);
    });

    it('should have alpha', () => {
      const factors: FactorData[] = [
        { name: 'market', returns: [0.01, 0.02, 0.01], description: '' },
      ];
      const result = multiFactorRegression([0.02, 0.03, 0.02], factors);
      expect(typeof result.alpha).toBe('number');
    });

    it('should have residualVol >= 0', () => {
      const factors: FactorData[] = [
        { name: 'f1', returns: [0.01, 0.02, 0.01, 0.02, 0.01], description: '' },
      ];
      const result = multiFactorRegression([0.01, 0.02, 0.01, 0.02, 0.01], factors);
      expect(result.residualVol).toBeGreaterThanOrEqual(0);
    });

    it('should have rSquared between 0 and 1', () => {
      const factors: FactorData[] = [
        { name: 'f1', returns: [0.01, 0.02, 0.03, 0.04, 0.05], description: '' },
      ];
      const result = multiFactorRegression([0.01, 0.02, 0.03, 0.04, 0.05], factors);
      expect(result.rSquared).toBeGreaterThanOrEqual(0);
      expect(result.rSquared).toBeLessThanOrEqual(1);
    });
  });

  describe('analyzePortfolioExposure', () => {
    it('should calculate total exposures', () => {
      const stocks: StockExposure[] = [
        {
          symbol: 'A', returns: [], alpha: 0.01, rSquared: 0.8, residualVol: 0.02,
          exposures: new Map([['market', 1.2], ['size', 0.5]]),
        },
        {
          symbol: 'B', returns: [], alpha: 0.02, rSquared: 0.7, residualVol: 0.03,
          exposures: new Map([['market', 0.8], ['size', -0.3]]),
        },
      ];
      const weights = [0.6, 0.4];
      const bench = new Map([['market', 1.0], ['size', 0.0]]);
      const result = analyzePortfolioExposure(stocks, weights, bench);

      expect(result.totalExposures.get('market')).toBeCloseTo(1.04, 2);
      expect(result.activeExposures.has('market')).toBe(true);
    });

    it('should calculate alpha', () => {
      const stocks: StockExposure[] = [
        { symbol: 'A', returns: [], alpha: 0.02, rSquared: 0, residualVol: 0, exposures: new Map([['f', 1]]) },
        { symbol: 'B', returns: [], alpha: 0.03, rSquared: 0, residualVol: 0, exposures: new Map([['f', 1]]) },
      ];
      const result = analyzePortfolioExposure(stocks, [0.5, 0.5], new Map([['f', 0]]));
      expect(result.alpha).toBeCloseTo(0.025, 5);
    });

    it('should handle empty stocks', () => {
      const result = analyzePortfolioExposure([], [], new Map());
      expect(result.totalExposures.size).toBe(0);
    });
  });

  describe('decomposeReturns', () => {
    it('should decompose returns into factors', () => {
      const factors: FactorData[] = [
        { name: 'market', returns: [0.01, 0.02, 0.01], description: '' },
      ];
      const result = decomposeReturns([0.02, 0.03, 0.02], factors);
      expect(result.factorContributions.has('market')).toBe(true);
      expect(typeof result.alpha).toBe('number');
      expect(result.totalReturn).toBeCloseTo(0.07, 5);
    });

    it('should handle no factors', () => {
      const result = decomposeReturns([0.01, 0.02], []);
      expect(result.factorContributions.size).toBe(0);
      expect(result.totalReturn).toBeCloseTo(0.03, 5);
    });
  });
});
