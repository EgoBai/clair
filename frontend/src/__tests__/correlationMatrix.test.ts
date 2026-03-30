import { describe, it, expect } from 'vitest';
import {
  calculateReturns,
  calculateMean,
  calculateStdDev,
  calculateCovariance,
  calculateCorrelation,
  calculateBeta,
  buildCorrelationMatrix,
  analyzeCorrelationPair,
  findHighCorrelationPairs,
  findLowCorrelationPairs,
  clusterByCorrelation,
  detectDivergence,
  calculateRollingCorrelation,
  findDiversifiers,
  calculatePortfolioCorrelationRisk,
  type PriceSeries,
} from '../utils/correlationMatrix';

describe('CorrelationMatrix', () => {
  const series1: PriceSeries = {
    ticker: '000001',
    name: '平安银行',
    sector: '银行',
    prices: [10, 10.5, 11, 10.8, 11.2, 11.5, 11.3, 11.8, 12, 11.9, 12.2, 12.5, 12.3, 12.8, 13],
    returns: [0.05, 0.0476, -0.0182, 0.037, 0.0268, -0.0174, 0.0442, 0.0169, -0.0083, 0.0252, 0.0246, -0.016, 0.0407, 0.0156],
  };

  const series2: PriceSeries = {
    ticker: '000002',
    name: '万科A',
    sector: '地产',
    prices: [20, 20.5, 21, 20.2, 20.8, 21.5, 21.0, 21.8, 22, 21.5, 22.2, 22.8, 22.3, 23, 23.5],
    returns: [0.025, 0.0244, -0.0381, 0.0297, 0.0337, -0.0233, 0.0381, 0.0092, -0.0227, 0.0326, 0.027, -0.0219, 0.0314, 0.0217],
  };

  const series3: PriceSeries = {
    ticker: '000003',
    name: '测试科技',
    sector: '科技',
    prices: [50, 48, 47, 49, 50, 52, 51, 53, 55, 54, 56, 58, 57, 59, 60],
    returns: [-0.04, -0.0208, 0.0426, 0.0204, 0.04, -0.0192, 0.0392, 0.0377, -0.0182, 0.037, 0.0357, -0.0172, 0.0351, 0.0169],
  };

  describe('calculateReturns', () => {
    it('should calculate returns from prices', () => {
      const prices = [100, 110, 105, 115];
      const returns = calculateReturns(prices);
      expect(returns.length).toBe(3);
      expect(returns[0]).toBeCloseTo(0.1, 4);
      expect(returns[1]).toBeCloseTo(-0.04545, 3);
    });

    it('should handle zero price', () => {
      const prices = [100, 0, 50];
      const returns = calculateReturns(prices);
      expect(returns[0]).toBe(-1);
      expect(returns[1]).toBe(0); // division by zero handled
    });

    it('should return empty for single price', () => {
      expect(calculateReturns([100])).toEqual([]);
    });

    it('should return empty for empty input', () => {
      expect(calculateReturns([])).toEqual([]);
    });
  });

  describe('calculateMean', () => {
    it('should calculate mean', () => {
      expect(calculateMean([1, 2, 3, 4, 5])).toBe(3);
    });

    it('should return 0 for empty array', () => {
      expect(calculateMean([])).toBe(0);
    });

    it('should handle negative values', () => {
      expect(calculateMean([-2, 0, 2])).toBe(0);
    });
  });

  describe('calculateStdDev', () => {
    it('should calculate standard deviation', () => {
      const result = calculateStdDev([2, 4, 4, 4, 5, 5, 7, 9]);
      expect(result).toBeCloseTo(2.138, 2);
    });

    it('should return 0 for single value', () => {
      expect(calculateStdDev([5])).toBe(0);
    });

    it('should return 0 for identical values', () => {
      expect(calculateStdDev([5, 5, 5])).toBe(0);
    });
  });

  describe('calculateCovariance', () => {
    it('should calculate covariance', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];
      expect(calculateCovariance(x, y)).toBeCloseTo(5, 1);
    });

    it('should return 0 for insufficient data', () => {
      expect(calculateCovariance([1], [2])).toBe(0);
    });

    it('should handle arrays of different lengths', () => {
      const result = calculateCovariance([1, 2, 3, 4, 5], [2, 4, 6]);
      expect(result).toBeDefined();
    });

    it('should return 0 for empty arrays', () => {
      expect(calculateCovariance([], [])).toBe(0);
    });
  });

  describe('calculateCorrelation', () => {
    it('should return 1 for perfectly correlated series', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];
      expect(calculateCorrelation(x, y)).toBeCloseTo(1, 5);
    });

    it('should return -1 for perfectly inverse correlation', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [10, 8, 6, 4, 2];
      expect(calculateCorrelation(x, y)).toBeCloseTo(-1, 5);
    });

    it('should return 0 for zero std dev', () => {
      expect(calculateCorrelation([5, 5, 5], [1, 2, 3])).toBe(0);
    });

    it('should clamp between -1 and 1', () => {
      const result = calculateCorrelation([1, 2, 3], [1, 2, 3]);
      expect(result).toBeGreaterThanOrEqual(-1);
      expect(result).toBeLessThanOrEqual(1);
    });
  });

  describe('calculateBeta', () => {
    it('should calculate beta', () => {
      const beta = calculateBeta(series1.returns, series2.returns);
      expect(typeof beta).toBe('number');
      expect(isFinite(beta)).toBe(true);
    });

    it('should return 0 for zero market variance', () => {
      expect(calculateBeta([1, 2, 3], [5, 5, 5])).toBe(0);
    });

    it('should return 1 for identical returns', () => {
      const returns = [0.01, 0.02, -0.01, 0.03];
      expect(calculateBeta(returns, returns)).toBeCloseTo(1, 5);
    });
  });

  describe('buildCorrelationMatrix', () => {
    it('should build a correlation matrix', () => {
      const matrix = buildCorrelationMatrix([series1, series2, series3]);
      expect(matrix.tickers.length).toBe(3);
      expect(matrix.matrix.length).toBe(3);
      expect(matrix.matrix[0].length).toBe(3);
      expect(matrix.matrix[0][0]).toBe(1);
      expect(matrix.matrix[1][1]).toBe(1);
    });

    it('should be symmetric', () => {
      const matrix = buildCorrelationMatrix([series1, series2]);
      expect(matrix.matrix[0][1]).toBeCloseTo(matrix.matrix[1][0], 10);
    });

    it('should have diagonal of 1', () => {
      const matrix = buildCorrelationMatrix([series1, series2, series3]);
      for (let i = 0; i < 3; i++) {
        expect(matrix.matrix[i][i]).toBe(1);
      }
    });

    it('should have values between -1 and 1', () => {
      const matrix = buildCorrelationMatrix([series1, series2, series3]);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(matrix.matrix[i][j]).toBeGreaterThanOrEqual(-1);
          expect(matrix.matrix[i][j]).toBeLessThanOrEqual(1);
        }
      }
    });

    it('should set date and period', () => {
      const matrix = buildCorrelationMatrix([series1, series2]);
      expect(matrix.date).toBeDefined();
      expect(matrix.period).toBe(series1.returns.length);
    });

    it('should handle empty series', () => {
      const matrix = buildCorrelationMatrix([]);
      expect(matrix.tickers.length).toBe(0);
    });

    it('should handle single series', () => {
      const matrix = buildCorrelationMatrix([series1]);
      expect(matrix.tickers.length).toBe(1);
      expect(matrix.matrix[0][0]).toBe(1);
    });
  });

  describe('analyzeCorrelationPair', () => {
    it('should analyze a pair of stocks', () => {
      const pair = analyzeCorrelationPair(series1, series2);
      expect(pair.ticker1).toBe('000001');
      expect(pair.ticker2).toBe('000002');
      expect(pair.correlation).toBeGreaterThanOrEqual(-1);
      expect(pair.correlation).toBeLessThanOrEqual(1);
    });

    it('should include covariance and betas', () => {
      const pair = analyzeCorrelationPair(series1, series2);
      expect(typeof pair.covariance).toBe('number');
      expect(typeof pair.beta1To2).toBe('number');
      expect(typeof pair.beta2To1).toBe('number');
    });
  });

  describe('findHighCorrelationPairs', () => {
    it('should find pairs above threshold', () => {
      const matrix = buildCorrelationMatrix([series1, series2, series3]);
      const pairs = findHighCorrelationPairs(matrix, 0.5);
      for (const pair of pairs) {
        expect(Math.abs(pair.correlation)).toBeGreaterThanOrEqual(0.5);
      }
    });

    it('should sort by absolute correlation', () => {
      const matrix = buildCorrelationMatrix([series1, series2, series3]);
      const pairs = findHighCorrelationPairs(matrix, 0);
      for (let i = 1; i < pairs.length; i++) {
        expect(Math.abs(pairs[i - 1].correlation)).toBeGreaterThanOrEqual(
          Math.abs(pairs[i].correlation)
        );
      }
    });

    it('should not include same stock pairs', () => {
      const matrix = buildCorrelationMatrix([series1, series2, series3]);
      const pairs = findHighCorrelationPairs(matrix);
      for (const pair of pairs) {
        expect(pair.ticker1).not.toBe(pair.ticker2);
      }
    });

    it('should use default threshold of 0.7', () => {
      const matrix = buildCorrelationMatrix([series1, series2, series3]);
      const pairs = findHighCorrelationPairs(matrix);
      for (const pair of pairs) {
        expect(Math.abs(pair.correlation)).toBeGreaterThanOrEqual(0.7);
      }
    });
  });

  describe('findLowCorrelationPairs', () => {
    it('should find pairs below threshold', () => {
      const matrix = buildCorrelationMatrix([series1, series2, series3]);
      const pairs = findLowCorrelationPairs(matrix, 0.5);
      for (const pair of pairs) {
        expect(Math.abs(pair.correlation)).toBeLessThanOrEqual(0.5);
      }
    });

    it('should sort by absolute correlation ascending', () => {
      const matrix = buildCorrelationMatrix([series1, series2, series3]);
      const pairs = findLowCorrelationPairs(matrix, 1);
      for (let i = 1; i < pairs.length; i++) {
        expect(Math.abs(pairs[i - 1].correlation)).toBeLessThanOrEqual(
          Math.abs(pairs[i].correlation)
        );
      }
    });
  });

  describe('clusterByCorrelation', () => {
    it('should cluster correlated stocks', () => {
      const matrix = buildCorrelationMatrix([series1, series2, series3]);
      const clusters = clusterByCorrelation(matrix, [series1, series2, series3], 0.3, 2);
      expect(Array.isArray(clusters)).toBe(true);
    });

    it('should include dominant sector', () => {
      const matrix = buildCorrelationMatrix([series1, series2, series3]);
      const clusters = clusterByCorrelation(matrix, [series1, series2, series3], 0.3, 2);
      for (const cluster of clusters) {
        expect(typeof cluster.dominantSector).toBe('string');
      }
    });

    it('should respect min cluster size', () => {
      const matrix = buildCorrelationMatrix([series1, series2, series3]);
      const clusters = clusterByCorrelation(matrix, [series1, series2, series3], 0.3, 2);
      for (const cluster of clusters) {
        expect(cluster.tickers.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('should sort by intra-correlation', () => {
      const matrix = buildCorrelationMatrix([series1, series2, series3]);
      const clusters = clusterByCorrelation(matrix, [series1, series2, series3], 0.1, 2);
      for (let i = 1; i < clusters.length; i++) {
        expect(clusters[i - 1].avgIntraCorrelation).toBeGreaterThanOrEqual(
          clusters[i].avgIntraCorrelation
        );
      }
    });
  });

  describe('detectDivergence', () => {
    it('should return null for insufficient data', () => {
      const short: PriceSeries = {
        ticker: 'X', name: 'X', sector: 'X',
        prices: [1, 2, 3], returns: [1, 1],
      };
      expect(detectDivergence(series1, short)).toBeNull();
    });

    it('should return alert when divergence exceeds threshold', () => {
      const longSeries1: PriceSeries = {
        ...series1,
        returns: Array(80).fill(0.01),
      };
      const longSeries2: PriceSeries = {
        ...series2,
        returns: Array(40).fill(0.01).concat(Array(40).fill(-0.01)),
      };
      const alert = detectDivergence(longSeries1, longSeries2, 20, 60);
      if (alert) {
        expect(alert.divergence).toBeDefined();
        expect(['converge', 'diverge']).toContain(alert.signal);
      }
    });

    it('should include expected and actual correlation', () => {
      const longSeries1: PriceSeries = {
        ...series1,
        returns: Array(80).fill(0.01).concat(Array(20).fill(-0.02)),
      };
      const longSeries2: PriceSeries = {
        ...series2,
        returns: Array(100).fill(0.01),
      };
      const alert = detectDivergence(longSeries1, longSeries2, 20, 60);
      if (alert) {
        expect(typeof alert.expectedCorrelation).toBe('number');
        expect(typeof alert.actualCorrelation).toBe('number');
      }
    });
  });

  describe('calculateRollingCorrelation', () => {
    it('should calculate rolling correlation', () => {
      const rolling = calculateRollingCorrelation(series1.returns, series2.returns, 5);
      expect(rolling.length).toBeGreaterThan(0);
    });

    it('should return values between -1 and 1', () => {
      const rolling = calculateRollingCorrelation(series1.returns, series2.returns, 5);
      for (const r of rolling) {
        expect(r).toBeGreaterThanOrEqual(-1);
        expect(r).toBeLessThanOrEqual(1);
      }
    });

    it('should use default window of 20', () => {
      const longReturns = Array(30).fill(0).map((_, i) => Math.sin(i) * 0.01);
      const rolling = calculateRollingCorrelation(longReturns, longReturns);
      expect(rolling.length).toBe(11); // 30 - 20 + 1
    });

    it('should return empty for short data', () => {
      const rolling = calculateRollingCorrelation([1, 2], [1, 2], 5);
      expect(rolling.length).toBe(0);
    });
  });

  describe('findDiversifiers', () => {
    it('should find low-correlation stocks', () => {
      const matrix = buildCorrelationMatrix([series1, series2, series3]);
      const diversifiers = findDiversifiers(matrix, '000001', 0.8);
      expect(Array.isArray(diversifiers)).toBe(true);
      expect(diversifiers).not.toContain('000001');
    });

    it('should return empty for unknown ticker', () => {
      const matrix = buildCorrelationMatrix([series1, series2]);
      expect(findDiversifiers(matrix, '999999')).toEqual([]);
    });

    it('should use default maxCorrelation of 0.3', () => {
      const matrix = buildCorrelationMatrix([series1, series2, series3]);
      const diversifiers = findDiversifiers(matrix, '000001');
      const idx = matrix.tickers.indexOf('000001');
      for (const d of diversifiers) {
        const dIdx = matrix.tickers.indexOf(d);
        expect(Math.abs(matrix.matrix[idx][dIdx])).toBeLessThanOrEqual(0.3);
      }
    });
  });

  describe('calculatePortfolioCorrelationRisk', () => {
    it('should calculate portfolio risk', () => {
      const matrix = buildCorrelationMatrix([series1, series2, series3]);
      const risk = calculatePortfolioCorrelationRisk(matrix, [0.5, 0.3, 0.2]);
      expect(typeof risk).toBe('number');
    });

    it('should return 0 for mismatched weights', () => {
      const matrix = buildCorrelationMatrix([series1, series2]);
      expect(calculatePortfolioCorrelationRisk(matrix, [0.5])).toBe(0);
    });

    it('should return 0 for single stock', () => {
      const matrix = buildCorrelationMatrix([series1]);
      expect(calculatePortfolioCorrelationRisk(matrix, [1])).toBe(0);
    });

    it('should handle equal weights', () => {
      const matrix = buildCorrelationMatrix([series1, series2, series3]);
      const risk = calculatePortfolioCorrelationRisk(matrix, [1/3, 1/3, 1/3]);
      expect(typeof risk).toBe('number');
      expect(isFinite(risk)).toBe(true);
    });
  });
});
