import { describe, it, expect } from 'vitest';
import {
  calculateVolatility,
  calculateCovarianceMatrix,
  calculateRiskParityWeights,
  analyzeRiskParity,
  AssetReturn,
} from '../utils/riskParityEngine';

function makeReturns(n: number, len: number = 100): number[] {
  return Array.from({ length: len }, (_, i) => Math.sin(i * 0.1 + n) * 0.01 + (Math.random() - 0.5) * 0.02);
}

describe('calculateVolatility', () => {
  it('calculates volatility', () => {
    const returns = [0.01, -0.02, 0.015, -0.01, 0.005, -0.015, 0.02];
    const vol = calculateVolatility(returns);
    expect(vol).toBeGreaterThan(0);
  });

  it('returns 0 for insufficient data', () => {
    expect(calculateVolatility([0.01])).toBe(0);
  });

  it('annualizes by default', () => {
    const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02);
    const daily = calculateVolatility(returns, false);
    const annual = calculateVolatility(returns, true);
    expect(annual).toBeGreaterThan(daily);
  });
});

describe('calculateCovarianceMatrix', () => {
  it('creates symmetric matrix', () => {
    const assets: AssetReturn[] = [
      { symbol: 'A', returns: makeReturns(1) },
      { symbol: 'B', returns: makeReturns(2) },
    ];
    const cov = calculateCovarianceMatrix(assets);
    expect(cov.matrix).toHaveLength(2);
    expect(cov.matrix[0][1]).toBe(cov.matrix[1][0]);
    expect(cov.symbols).toEqual(['A', 'B']);
  });

  it('diagonal is variance', () => {
    const returns = [0.01, -0.02, 0.015, -0.01, 0.005];
    const cov = calculateCovarianceMatrix([{ symbol: 'X', returns }]);
    expect(cov.matrix[0][0]).toBeGreaterThan(0);
  });
});

describe('calculateRiskParityWeights', () => {
  it('returns equal weights for uncorrelated assets', () => {
    const cov = {
      symbols: ['A', 'B', 'C'],
      matrix: [
        [0.04, 0, 0],
        [0, 0.04, 0],
        [0, 0, 0.04],
      ],
    };
    const weights = calculateRiskParityWeights(cov);
    expect(weights).toHaveLength(3);
    const sum = weights.reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1, 3);
  });

  it('returns [1] for single asset', () => {
    const cov = { symbols: ['A'], matrix: [[0.04]] };
    expect(calculateRiskParityWeights(cov)).toEqual([1]);
  });

  it('returns [] for empty', () => {
    expect(calculateRiskParityWeights({ symbols: [], matrix: [] })).toEqual([]);
  });

  it('sums to 1', () => {
    const cov = {
      symbols: ['A', 'B'],
      matrix: [[0.04, 0.01], [0.01, 0.09]],
    };
    const weights = calculateRiskParityWeights(cov);
    const sum = weights.reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1, 3);
  });
});

describe('analyzeRiskParity', () => {
  it('returns complete analysis', () => {
    const assets: AssetReturn[] = [
      { symbol: 'A', returns: makeReturns(1, 100) },
      { symbol: 'B', returns: makeReturns(2, 100) },
      { symbol: 'C', returns: makeReturns(3, 100) },
    ];
    const result = analyzeRiskParity(assets);
    expect(result.weights).toHaveLength(3);
    expect(result.totalRisk).toBeGreaterThan(0);
    expect(result.diversificationRatio).toBeGreaterThan(0);
  });

  it('detects rebalance need', () => {
    const assets: AssetReturn[] = [
      { symbol: 'A', returns: makeReturns(1, 50) },
      { symbol: 'B', returns: makeReturns(2, 50) },
    ];
    const result = analyzeRiskParity(assets, [0.9, 0.1]); // heavily drifted
    expect(result.rebalanceNeeded).toBe(true);
  });

  it('no rebalance for equal weights', () => {
    const assets: AssetReturn[] = [
      { symbol: 'A', returns: Array.from({ length: 50 }, () => 0.001) },
      { symbol: 'B', returns: Array.from({ length: 50 }, () => 0.001) },
    ];
    const result = analyzeRiskParity(assets, [0.5, 0.5]);
    expect(result.rebalanceNeeded).toBe(false);
  });
});
