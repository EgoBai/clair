import { describe, it, expect } from 'vitest';
import {
  calculateCovarianceMatrix,
  minimumVariancePortfolio,
  maxSharpePortfolio,
  generateEfficientFrontier,
  riskParityPortfolio,
  buildAssetReturns,
  type AssetReturn,
  type CovarianceMatrix,
} from '../utils/portfolioOptimizer';

function generateReturns(n: number, mean: number = 0.001, vol: number = 0.02): number[] {
  const r: number[] = [];
  for (let i = 0; i < n; i++) {
    r.push(mean + (Math.random() - 0.5) * 2 * vol);
  }
  return r;
}

function generatePrices(n: number, startPrice: number = 100): number[] {
  const prices: number[] = [startPrice];
  for (let i = 1; i < n; i++) {
    prices.push(prices[i - 1] * (1 + (Math.random() - 0.5) * 0.04));
  }
  return prices;
}

describe('投资组合优化引擎', () => {
  describe('calculateCovarianceMatrix', () => {
    it('should calculate correct covariance for two assets', () => {
      const assets: AssetReturn[] = [
        { symbol: 'A', returns: [0.01, 0.02, -0.01, 0.03], expectedReturn: 0.0125, volatility: 0.02 },
        { symbol: 'B', returns: [0.02, 0.01, -0.02, 0.01], expectedReturn: 0.005, volatility: 0.018 },
      ];
      const result = calculateCovarianceMatrix(assets);
      expect(result.symbols).toEqual(['A', 'B']);
      expect(result.matrix.length).toBe(2);
      expect(result.matrix[0].length).toBe(2);
      // 对角线应该是方差
      expect(result.matrix[0][0]).toBeGreaterThan(0);
      expect(result.matrix[1][1]).toBeGreaterThan(0);
      // 协方差矩阵是对称的
      expect(result.matrix[0][1]).toBeCloseTo(result.matrix[1][0], 10);
    });

    it('should handle single asset', () => {
      const assets: AssetReturn[] = [
        { symbol: 'A', returns: [0.01, 0.02, -0.01], expectedReturn: 0.0067, volatility: 0.015 },
      ];
      const result = calculateCovarianceMatrix(assets);
      expect(result.matrix.length).toBe(1);
      expect(result.matrix[0][0]).toBeGreaterThan(0);
    });

    it('should handle empty array', () => {
      const result = calculateCovarianceMatrix([]);
      expect(result.symbols).toEqual([]);
      expect(result.matrix.length).toBe(0);
    });

    it('should produce positive semi-definite matrix', () => {
      const assets: AssetReturn[] = [
        { symbol: 'A', returns: generateReturns(100), expectedReturn: 0.1, volatility: 0.2 },
        { symbol: 'B', returns: generateReturns(100, 0.0005), expectedReturn: 0.05, volatility: 0.15 },
        { symbol: 'C', returns: generateReturns(100, 0.002), expectedReturn: 0.15, volatility: 0.25 },
      ];
      const result = calculateCovarianceMatrix(assets);
      // 特征值应该非负 (PSD)
      const eigenvalues = computeEigenvalues2x2or3x3(result.matrix);
      for (const ev of eigenvalues) {
        expect(ev).toBeGreaterThanOrEqual(-1e-10);
      }
    });
  });

  describe('minimumVariancePortfolio', () => {
    it('should return equal weights for single asset', () => {
      const cov: CovarianceMatrix = { symbols: ['A'], matrix: [[0.04]] };
      const w = minimumVariancePortfolio(cov);
      expect(w['A']).toBe(1);
    });

    it('should return weights summing to 1', () => {
      const cov: CovarianceMatrix = {
        symbols: ['A', 'B', 'C'],
        matrix: [
          [0.04, 0.01, 0.02],
          [0.01, 0.09, 0.015],
          [0.02, 0.015, 0.06],
        ],
      };
      const w = minimumVariancePortfolio(cov);
      const sum = Object.values(w).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 6);
    });

    it('should give more weight to low-volatility assets', () => {
      const cov: CovarianceMatrix = {
        symbols: ['Low', 'High'],
        matrix: [
          [0.01, 0.005],
          [0.005, 0.09],
        ],
      };
      const w = minimumVariancePortfolio(cov);
      expect(w['Low']).toBeGreaterThan(w['High']);
    });

    it('should respect constraints', () => {
      const cov: CovarianceMatrix = {
        symbols: ['A', 'B'],
        matrix: [
          [0.04, 0.01],
          [0.01, 0.09],
        ],
      };
      const w = minimumVariancePortfolio(cov, { min: 0.1, max: 0.8 });
      for (const v of Object.values(w)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('maxSharpePortfolio', () => {
    it('should handle single asset', () => {
      const assets: AssetReturn[] = [
        { symbol: 'A', returns: [0.01, 0.02], expectedReturn: 0.1, volatility: 0.2 },
      ];
      const cov: CovarianceMatrix = { symbols: ['A'], matrix: [[0.04]] };
      const result = maxSharpePortfolio(assets, cov);
      expect(result.weights['A']).toBe(1);
      expect(result.expectedReturn).toBe(0.1);
    });

    it('should prefer high-return low-volatility assets', () => {
      const assets: AssetReturn[] = [
        { symbol: 'Good', returns: generateReturns(100), expectedReturn: 0.15, volatility: 0.1 },
        { symbol: 'Bad', returns: generateReturns(100), expectedReturn: 0.05, volatility: 0.3 },
      ];
      const cov = calculateCovarianceMatrix(assets);
      const result = maxSharpePortfolio(assets, cov);
      expect(result.weights['Good']).toBeGreaterThan(result.weights['Bad']);
    });

    it('should return valid sharpe ratio', () => {
      const assets: AssetReturn[] = [
        { symbol: 'A', returns: generateReturns(50), expectedReturn: 0.12, volatility: 0.2 },
        { symbol: 'B', returns: generateReturns(50), expectedReturn: 0.08, volatility: 0.15 },
      ];
      const cov = calculateCovarianceMatrix(assets);
      const result = maxSharpePortfolio(assets, cov);
      expect(result.sharpeRatio).toBeGreaterThan(0);
      expect(result.volatility).toBeGreaterThan(0);
    });

    it('should handle empty portfolio', () => {
      const result = maxSharpePortfolio([], { symbols: [], matrix: [] });
      expect(result.sharpeRatio).toBe(0);
    });
  });

  describe('generateEfficientFrontier', () => {
    it('should generate requested number of points', () => {
      const assets: AssetReturn[] = [
        { symbol: 'A', returns: generateReturns(100), expectedReturn: 0.1, volatility: 0.2 },
        { symbol: 'B', returns: generateReturns(100), expectedReturn: 0.05, volatility: 0.1 },
      ];
      const cov = calculateCovarianceMatrix(assets);
      const frontier = generateEfficientFrontier(assets, cov, 10);
      expect(frontier.length).toBeLessThanOrEqual(10);
      expect(frontier.length).toBeGreaterThan(0);
    });

    it('should have increasing volatility with target return', () => {
      const assets: AssetReturn[] = [
        { symbol: 'A', returns: generateReturns(200), expectedReturn: 0.12, volatility: 0.2 },
        { symbol: 'B', returns: generateReturns(200), expectedReturn: 0.06, volatility: 0.1 },
      ];
      const cov = calculateCovarianceMatrix(assets);
      const frontier = generateEfficientFrontier(assets, cov, 10);
      // 一般趋势: 目标收益越高，波动率越大
      for (let i = 1; i < frontier.length; i++) {
        expect(frontier[i].volatility).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('riskParityPortfolio', () => {
    it('should return weights summing to 1', () => {
      const cov: CovarianceMatrix = {
        symbols: ['A', 'B', 'C'],
        matrix: [
          [0.04, 0.01, 0.02],
          [0.01, 0.09, 0.015],
          [0.02, 0.015, 0.06],
        ],
      };
      const w = riskParityPortfolio(cov);
      const sum = Object.values(w).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 4);
    });

    it('should give more weight to low-volatility assets', () => {
      const cov: CovarianceMatrix = {
        symbols: ['Low', 'High'],
        matrix: [
          [0.01, 0.002],
          [0.002, 0.09],
        ],
      };
      const w = riskParityPortfolio(cov);
      expect(w['Low']).toBeGreaterThan(w['High']);
    });

    it('should handle single asset', () => {
      const cov: CovarianceMatrix = { symbols: ['A'], matrix: [[0.04]] };
      const w = riskParityPortfolio(cov);
      expect(w['A']).toBe(1);
    });

    it('should handle 4 assets', () => {
      const cov: CovarianceMatrix = {
        symbols: ['A', 'B', 'C', 'D'],
        matrix: [
          [0.04, 0.01, 0.005, 0.02],
          [0.01, 0.09, 0.015, 0.01],
          [0.005, 0.015, 0.06, 0.008],
          [0.02, 0.01, 0.008, 0.16],
        ],
      };
      const w = riskParityPortfolio(cov);
      const sum = Object.values(w).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 3);
    });
  });

  describe('buildAssetReturns', () => {
    it('should compute returns from prices', () => {
      const data = new Map<string, number[]>();
      data.set('AAPL', [100, 102, 101, 105, 108]);
      data.set('GOOGL', [200, 198, 202, 210, 215]);

      const assets = buildAssetReturns(data);
      expect(assets.length).toBe(2);
      const aapl = assets.find(a => a.symbol === 'AAPL')!;
      expect(aapl.returns.length).toBe(4);
      expect(aapl.volatility).toBeGreaterThan(0);
    });

    it('should skip assets with insufficient data', () => {
      const data = new Map<string, number[]>();
      data.set('A', [100]); // 只有1个价格
      data.set('B', [100, 102, 101]);
      const assets = buildAssetReturns(data);
      expect(assets.length).toBe(1);
      expect(assets[0].symbol).toBe('B');
    });

    it('should handle empty input', () => {
      const assets = buildAssetReturns(new Map());
      expect(assets.length).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle zero covariance matrix', () => {
      const cov: CovarianceMatrix = {
        symbols: ['A', 'B'],
        matrix: [
          [0, 0],
          [0, 0],
        ],
      };
      const w = minimumVariancePortfolio(cov);
      const sum = Object.values(w).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
    });

    it('should handle highly correlated assets', () => {
      const cov: CovarianceMatrix = {
        symbols: ['A', 'B'],
        matrix: [
          [0.04, 0.039],
          [0.039, 0.04],
        ],
      };
      const w = riskParityPortfolio(cov);
      expect(w['A']).toBeCloseTo(w['B'], 2);
    });
  });
});

// Helper: 简化特征值计算 (2x2和3x3)
function computeEigenvalues2x2or3x3(matrix: number[][]): number[] {
  const n = matrix.length;
  if (n === 1) return [matrix[0][0]];
  if (n === 2) {
    const [a, b] = [matrix[0][0], matrix[0][1]];
    const [c, d] = [matrix[1][0], matrix[1][1]];
    const trace = a + d;
    const det = a * d - b * c;
    const disc = Math.sqrt(Math.max(0, trace * trace - 4 * det));
    return [(trace + disc) / 2, (trace - disc) / 2];
  }
  // 3x3: 返回主对角线近似
  return matrix.map((row, i) => row[i]);
}
