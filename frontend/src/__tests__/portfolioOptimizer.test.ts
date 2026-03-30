import { describe, it, expect } from 'vitest';
import {
  calculatePortfolioReturn,
  calculatePortfolioVolatility,
  calculateSharpeRatio,
  calculateRiskContributions,
  equalWeightPortfolio,
  inverseVolatilityPortfolio,
  maxSharpePortfolio,
  minVariancePortfolio,
  riskParityPortfolio,
  generateEfficientFrontier,
  calculateMaxDrawdown,
  calculateValueAtRisk,
  calculateExpectedShortfall,
  applySectorConstraints,
  type Asset,
  type CovarianceMatrix,
} from '../utils/portfolioOptimizer';

describe('PortfolioOptimizer', () => {
  const assets: Asset[] = [
    { ticker: '000001', name: '平安银行', sector: '银行', expectedReturn: 0.08, volatility: 0.2, returns: [0.01, -0.02, 0.03, 0.01, -0.01] },
    { ticker: '000002', name: '万科A', sector: '地产', expectedReturn: 0.12, volatility: 0.3, returns: [0.02, -0.03, 0.04, 0.02, -0.02] },
    { ticker: '000003', name: '测试科技', sector: '科技', expectedReturn: 0.15, volatility: 0.35, returns: [0.03, -0.04, 0.05, 0.03, -0.03] },
    { ticker: '000004', name: '测试消费', sector: '消费', expectedReturn: 0.10, volatility: 0.18, returns: [0.01, -0.01, 0.02, 0.01, 0.00] },
  ];

  const covMatrix: CovarianceMatrix = {
    tickers: ['000001', '000002', '000003', '000004'],
    matrix: [
      [0.04, 0.012, 0.008, 0.01],
      [0.012, 0.09, 0.02, 0.015],
      [0.008, 0.02, 0.1225, 0.012],
      [0.01, 0.015, 0.012, 0.0324],
    ],
  };

  describe('calculatePortfolioReturn', () => {
    it('should calculate weighted return', () => {
      const weights = { '000001': 0.5, '000002': 0.3, '000003': 0.2, '000004': 0 };
      const ret = calculatePortfolioReturn(weights, assets);
      expect(ret).toBeCloseTo(0.08 * 0.5 + 0.12 * 0.3 + 0.15 * 0.2, 4);
    });

    it('should return 0 for empty weights', () => {
      expect(calculatePortfolioReturn({}, assets)).toBe(0);
    });

    it('should handle single asset', () => {
      const weights = { '000001': 1 };
      expect(calculatePortfolioReturn(weights, assets)).toBe(0.08);
    });

    it('should ignore missing tickers', () => {
      const weights = { '999999': 1 };
      expect(calculatePortfolioReturn(weights, assets)).toBe(0);
    });
  });

  describe('calculatePortfolioVolatility', () => {
    it('should calculate portfolio volatility', () => {
      const weights = { '000001': 0.5, '000002': 0.5, '000003': 0, '000004': 0 };
      const vol = calculatePortfolioVolatility(weights, assets, covMatrix);
      expect(vol).toBeGreaterThan(0);
    });

    it('should return 0 for empty weights', () => {
      expect(calculatePortfolioVolatility({}, assets, covMatrix)).toBe(0);
    });

    it('should return asset vol for single asset', () => {
      const weights = { '000001': 1 };
      const vol = calculatePortfolioVolatility(weights, assets, covMatrix);
      expect(vol).toBeCloseTo(0.2, 2);
    });

    it('should be non-negative', () => {
      const weights = { '000001': 0.25, '000002': 0.25, '000003': 0.25, '000004': 0.25 };
      const vol = calculatePortfolioVolatility(weights, assets, covMatrix);
      expect(vol).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateSharpeRatio', () => {
    it('should calculate sharpe ratio', () => {
      const sharpe = calculateSharpeRatio(0.10, 0.15);
      expect(sharpe).toBeCloseTo((0.10 - 0.03) / 0.15, 4);
    });

    it('should return 0 for zero volatility', () => {
      expect(calculateSharpeRatio(0.10, 0)).toBe(0);
    });

    it('should use default risk free rate', () => {
      const sharpe = calculateSharpeRatio(0.10, 0.2);
      expect(sharpe).toBeCloseTo(0.35, 2);
    });

    it('should handle custom risk free rate', () => {
      const sharpe = calculateSharpeRatio(0.10, 0.2, 0.05);
      expect(sharpe).toBeCloseTo(0.25, 2);
    });

    it('should be negative when return < risk free rate', () => {
      expect(calculateSharpeRatio(0.01, 0.1)).toBeLessThan(0);
    });
  });

  describe('calculateRiskContributions', () => {
    it('should calculate risk contributions', () => {
      const weights = { '000001': 0.5, '000002': 0.3, '000003': 0.2, '000004': 0 };
      const rc = calculateRiskContributions(weights, assets, covMatrix);
      expect(rc['000001']).toBeDefined();
      expect(rc['000002']).toBeDefined();
    });

    it('should sum to approximately 1', () => {
      const weights = { '000001': 0.25, '000002': 0.25, '000003': 0.25, '000004': 0.25 };
      const rc = calculateRiskContributions(weights, assets, covMatrix);
      const sum = Object.values(rc).reduce((s, v) => s + v, 0);
      expect(sum).toBeCloseTo(1, 1);
    });

    it('should return zeros for zero volatility', () => {
      const zeroAssets: Asset[] = [
        { ticker: 'A', name: 'A', sector: 'A', expectedReturn: 0.1, volatility: 0, returns: [0, 0, 0] },
      ];
      const zeroCov: CovarianceMatrix = { tickers: ['A'], matrix: [[0]] };
      const rc = calculateRiskContributions({ 'A': 1 }, zeroAssets, zeroCov);
      expect(rc['A']).toBe(0);
    });
  });

  describe('equalWeightPortfolio', () => {
    it('should assign equal weights', () => {
      const weights = equalWeightPortfolio(assets);
      for (const asset of assets) {
        expect(weights[asset.ticker]).toBeCloseTo(0.25, 4);
      }
    });

    it('should sum to 1', () => {
      const weights = equalWeightPortfolio(assets);
      const sum = Object.values(weights).reduce((s, w) => s + w, 0);
      expect(sum).toBeCloseTo(1, 5);
    });
  });

  describe('inverseVolatilityPortfolio', () => {
    it('should assign higher weight to lower volatility', () => {
      const weights = inverseVolatilityPortfolio(assets);
      expect(weights['000004']).toBeGreaterThan(weights['000003']);
    });

    it('should sum to 1', () => {
      const weights = inverseVolatilityPortfolio(assets);
      const sum = Object.values(weights).reduce((s, w) => s + w, 0);
      expect(sum).toBeCloseTo(1, 5);
    });

    it('should handle zero volatility', () => {
      const zeroVol: Asset[] = [
        { ticker: 'A', name: 'A', sector: 'A', expectedReturn: 0.1, volatility: 0, returns: [0] },
        { ticker: 'B', name: 'B', sector: 'B', expectedReturn: 0.1, volatility: 0.2, returns: [0.01] },
      ];
      const weights = inverseVolatilityPortfolio(zeroVol);
      expect(weights['A']).toBe(0);
    });
  });

  describe('maxSharpePortfolio', () => {
    it('should return optimization result', () => {
      const result = maxSharpePortfolio(assets, covMatrix);
      expect(result.expectedReturn).toBeDefined();
      expect(result.volatility).toBeDefined();
      expect(result.sharpeRatio).toBeDefined();
    });

    it('should have weights summing to 1', () => {
      const result = maxSharpePortfolio(assets, covMatrix);
      const sum = Object.values(result.weights).reduce((s, w) => s + w, 0);
      expect(sum).toBeCloseTo(1, 1);
    });

    it('should have non-negative weights', () => {
      const result = maxSharpePortfolio(assets, covMatrix);
      for (const w of Object.values(result.weights)) {
        expect(w).toBeGreaterThanOrEqual(-0.01);
      }
    });

    it('should include risk contributions', () => {
      const result = maxSharpePortfolio(assets, covMatrix);
      for (const asset of assets) {
        expect(result.riskContributions[asset.ticker]).toBeDefined();
      }
    });
  });

  describe('minVariancePortfolio', () => {
    it('should return optimization result', () => {
      const result = minVariancePortfolio(assets, covMatrix);
      expect(result.volatility).toBeGreaterThan(0);
    });

    it('should have lower volatility than equal weight', () => {
      const result = minVariancePortfolio(assets, covMatrix);
      const eqWeights = equalWeightPortfolio(assets);
      const eqVol = calculatePortfolioVolatility(eqWeights, assets, covMatrix);
      expect(result.volatility).toBeLessThanOrEqual(eqVol + 0.01);
    });

    it('should have weights summing to 1', () => {
      const result = minVariancePortfolio(assets, covMatrix);
      const sum = Object.values(result.weights).reduce((s, w) => s + w, 0);
      expect(sum).toBeCloseTo(1, 1);
    });
  });

  describe('riskParityPortfolio', () => {
    it('should return optimization result', () => {
      const result = riskParityPortfolio(assets, covMatrix);
      expect(result.volatility).toBeGreaterThan(0);
    });

    it('should have roughly equal risk contributions', () => {
      const result = riskParityPortfolio(assets, covMatrix);
      const rcs = Object.values(result.riskContributions);
      if (rcs.length > 0) {
        const mean = rcs.reduce((s, v) => s + v, 0) / rcs.length;
        for (const rc of rcs) {
          expect(Math.abs(rc - mean)).toBeLessThan(0.3);
        }
      }
    });

    it('should have weights summing to 1', () => {
      const result = riskParityPortfolio(assets, covMatrix);
      const sum = Object.values(result.weights).reduce((s, w) => s + w, 0);
      expect(sum).toBeCloseTo(1, 1);
    });
  });

  describe('generateEfficientFrontier', () => {
    it('should generate specified number of points', () => {
      const frontier = generateEfficientFrontier(assets, covMatrix, 10);
      expect(frontier.length).toBe(10);
    });

    it('should have increasing returns', () => {
      const frontier = generateEfficientFrontier(assets, covMatrix, 10);
      for (let i = 1; i < frontier.length; i++) {
        expect(frontier[i].expectedReturn).toBeGreaterThanOrEqual(
          frontier[i - 1].expectedReturn - 0.001
        );
      }
    });

    it('should include sharpe ratio for each point', () => {
      const frontier = generateEfficientFrontier(assets, covMatrix, 5);
      for (const point of frontier) {
        expect(typeof point.sharpeRatio).toBe('number');
      }
    });

    it('should default to 20 points', () => {
      const frontier = generateEfficientFrontier(assets, covMatrix);
      expect(frontier.length).toBe(20);
    });

    it('should have weights summing to 1 at each point', () => {
      const frontier = generateEfficientFrontier(assets, covMatrix, 5);
      for (const point of frontier) {
        const sum = Object.values(point.weights).reduce((s, w) => s + w, 0);
        expect(sum).toBeCloseTo(1, 1);
      }
    });
  });

  describe('calculateMaxDrawdown', () => {
    it('should calculate max drawdown', () => {
      const returns = [0.1, -0.05, 0.1, -0.15, 0.05, -0.1, 0.2];
      const dd = calculateMaxDrawdown(returns);
      expect(dd).toBeGreaterThan(0);
      expect(dd).toBeLessThanOrEqual(1);
    });

    it('should return 0 for all positive returns', () => {
      expect(calculateMaxDrawdown([0.01, 0.02, 0.01, 0.03])).toBe(0);
    });

    it('should return 1 for complete loss', () => {
      expect(calculateMaxDrawdown([0.1, -1.0])).toBe(1);
    });

    it('should return 0 for empty array', () => {
      expect(calculateMaxDrawdown([])).toBe(0);
    });

    it('should handle single return', () => {
      const dd = calculateMaxDrawdown([-0.1]);
      expect(dd).toBeCloseTo(0.1, 2);
    });
  });

  describe('calculateValueAtRisk', () => {
    it('should calculate VaR', () => {
      const returns = Array.from({ length: 100 }, (_, i) => (i - 50) / 500);
      const var95 = calculateValueAtRisk(returns, 0.95);
      expect(var95).toBeGreaterThan(0);
    });

    it('should return 0 for empty array', () => {
      expect(calculateValueAtRisk([], 0.95)).toBe(0);
    });

    it('should use 95% confidence by default', () => {
      const returns = Array.from({ length: 100 }, (_, i) => (i - 50) / 500);
      const varDefault = calculateValueAtRisk(returns);
      const var95 = calculateValueAtRisk(returns, 0.95);
      expect(varDefault).toBe(var95);
    });

    it('should return higher VaR at higher confidence', () => {
      const returns = Array.from({ length: 200 }, (_, i) => (i - 100) / 1000);
      const var90 = calculateValueAtRisk(returns, 0.90);
      const var99 = calculateValueAtRisk(returns, 0.99);
      expect(var99).toBeGreaterThanOrEqual(var90);
    });
  });

  describe('calculateExpectedShortfall', () => {
    it('should calculate ES', () => {
      const returns = Array.from({ length: 100 }, (_, i) => (i - 50) / 500);
      const es = calculateExpectedShortfall(returns, 0.95);
      expect(es).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 for empty array', () => {
      expect(calculateExpectedShortfall([], 0.95)).toBe(0);
    });

    it('should be >= VaR', () => {
      const returns = Array.from({ length: 100 }, (_, i) => (i - 50) / 500);
      const var95 = calculateValueAtRisk(returns, 0.95);
      const es = calculateExpectedShortfall(returns, 0.95);
      expect(es).toBeGreaterThanOrEqual(var95 - 0.01);
    });
  });

  describe('applySectorConstraints', () => {
    it('should respect sector max constraints', () => {
      const weights = { '000001': 0.6, '000002': 0.1, '000003': 0.1, '000004': 0.2 };
      const constraints = { '银行': { min: 0, max: 0.3 } };
      const adjusted = applySectorConstraints(weights, assets, constraints);
      expect(adjusted['000001']).toBeLessThanOrEqual(0.35);
    });

    it('should maintain approximate sum of 1', () => {
      const weights = { '000001': 0.25, '000002': 0.25, '000003': 0.25, '000004': 0.25 };
      const constraints = { '银行': { min: 0.1, max: 0.4 } };
      const adjusted = applySectorConstraints(weights, assets, constraints);
      const sum = Object.values(adjusted).reduce((s, w) => s + w, 0);
      expect(sum).toBeCloseTo(1, 1);
    });

    it('should handle empty constraints', () => {
      const weights = { '000001': 0.25, '000002': 0.25, '000003': 0.25, '000004': 0.25 };
      const adjusted = applySectorConstraints(weights, assets, {});
      for (const t of Object.keys(weights)) {
        expect(adjusted[t]).toBeCloseTo(weights[t], 2);
      }
    });

    it('should not produce negative weights', () => {
      const weights = { '000001': 0.9, '000002': 0.05, '000003': 0.025, '000004': 0.025 };
      const constraints = { '银行': { min: 0, max: 0.2 } };
      const adjusted = applySectorConstraints(weights, assets, constraints);
      for (const w of Object.values(adjusted)) {
        expect(w).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
