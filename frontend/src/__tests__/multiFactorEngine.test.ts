import { describe, it, expect } from 'vitest';
import {
  normalizeZScore,
  normalizeMinMax,
  normalizePercentile,
  scoreStocks,
  adjustWeightsByIC,
  filterCorrelatedFactors,
  StockFactors,
  ScoringConfig,
  FactorDefinition,
} from '../utils/multiFactorEngine';

const baseFactors: FactorDefinition[] = [
  { id: 'pe', name: 'PE', category: 'value', weight: 1, direction: 'lower_better', minRange: 0, maxRange: 100 },
  { id: 'roe', name: 'ROE', category: 'quality', weight: 1, direction: 'higher_better', minRange: -50, maxRange: 50 },
  { id: 'momentum_3m', name: '3M Momentum', category: 'momentum', weight: 1, direction: 'higher_better', minRange: -50, maxRange: 50 },
];

const config: ScoringConfig = {
  factors: baseFactors,
  normalization: 'zscore',
  outlierHandling: 'ignore',
  minDataPoints: 5,
};

function makeStocks(n: number): StockFactors[] {
  return Array.from({ length: n }, (_, i) => ({
    symbol: `${String(i + 1).padStart(6, '0')}`,
    name: `Stock ${i + 1}`,
    factors: {
      pe: 10 + i * 5,
      roe: 20 - i * 2,
      momentum_3m: i * 3,
    },
    timestamp: Date.now(),
  }));
}

describe('normalizeZScore', () => {
  it('centers around 0', () => {
    const result = normalizeZScore([10, 20, 30, 40, 50]);
    const mean = result.reduce((a, b) => a + b, 0) / result.length;
    expect(Math.abs(mean)).toBeLessThan(0.01);
  });

  it('handles single value', () => {
    const result = normalizeZScore([42]);
    expect(result[0]).toBe(0);
  });

  it('handles NaN', () => {
    const result = normalizeZScore([1, NaN, 3]);
    expect(result[1]).toBe(0);
  });

  it('handles empty', () => {
    expect(normalizeZScore([])).toEqual([]);
  });
});

describe('normalizeMinMax', () => {
  it('maps to 0-1 range', () => {
    const result = normalizeMinMax([10, 20, 30, 40, 50]);
    expect(result[0]).toBe(0);
    expect(result[4]).toBe(1);
  });

  it('handles identical values', () => {
    const result = normalizeMinMax([5, 5, 5]);
    expect(result.every(v => v === 0)).toBe(true);
  });

  it('handles NaN', () => {
    const result = normalizeMinMax([1, NaN, 3]);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(0); // NaN mapped to 0
    expect(result[2]).toBe(1);
  });
});

describe('normalizePercentile', () => {
  it('assigns 0-1 percentile', () => {
    const result = normalizePercentile([10, 20, 30, 40, 50]);
    expect(result[0]).toBe(0);
    expect(result[4]).toBe(1);
  });

  it('handles ties', () => {
    const result = normalizePercentile([10, 10, 30]);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(0.5);
    expect(result[2]).toBe(1);
  });
});

describe('scoreStocks', () => {
  it('ranks stocks correctly', () => {
    const stocks = makeStocks(5);
    const result = scoreStocks(stocks, config);
    expect(result.scores).toHaveLength(5);
    expect(result.scores[0].rank).toBe(1);
    expect(result.scores[0].totalScore).toBeGreaterThanOrEqual(result.scores[4].totalScore);
  });

  it('returns topN', () => {
    const stocks = makeStocks(25);
    const result = scoreStocks(stocks, config);
    expect(result.topN).toHaveLength(20);
  });

  it('computes stats', () => {
    const stocks = makeStocks(10);
    const result = scoreStocks(stocks, config);
    expect(result.stats.total).toBe(10);
    expect(result.stats.scored).toBeGreaterThan(0);
  });

  it('computes percentile', () => {
    const stocks = makeStocks(10);
    const result = scoreStocks(stocks, config);
    expect(result.scores[0].percentile).toBe(100);
    expect(result.scores[result.scores.length - 1].percentile).toBe(10);
  });

  it('handles empty input', () => {
    const result = scoreStocks([], config);
    expect(result.scores).toHaveLength(0);
    expect(result.stats.total).toBe(0);
  });

  it('respects minmax normalization', () => {
    const stocks = makeStocks(5);
    const result = scoreStocks(stocks, { ...config, normalization: 'minmax' });
    expect(result.scores).toHaveLength(5);
  });

  it('respects percentile normalization', () => {
    const stocks = makeStocks(5);
    const result = scoreStocks(stocks, { ...config, normalization: 'percentile' });
    expect(result.scores).toHaveLength(5);
  });

  it('handles clip outlier handling', () => {
    const stocks = makeStocks(5);
    const result = scoreStocks(stocks, { ...config, outlierHandling: 'clip' });
    expect(result.scores).toHaveLength(5);
  });

  it('includes factor scores', () => {
    const stocks = makeStocks(5);
    const result = scoreStocks(stocks, config);
    expect(result.scores[0].factorScores).toHaveProperty('pe');
    expect(result.scores[0].factorScores).toHaveProperty('roe');
    expect(result.scores[0].factorScores).toHaveProperty('momentum_3m');
  });
});

describe('adjustWeightsByIC', () => {
  it('adjusts weights based on IC', () => {
    const icValues = { pe: 0.05, roe: 0.03, momentum_3m: 0.02 };
    const adjusted = adjustWeightsByIC(baseFactors, icValues);
    const peFactor = adjusted.find(f => f.id === 'pe')!;
    const roeFactor = adjusted.find(f => f.id === 'roe')!;
    expect(peFactor.weight).toBeGreaterThan(roeFactor.weight);
  });

  it('normalizes total weight to 1', () => {
    const icValues = { pe: 0.05, roe: 0.03, momentum_3m: 0.02 };
    const adjusted = adjustWeightsByIC(baseFactors, icValues);
    const total = adjusted.reduce((s, f) => s + f.weight, 0);
    expect(total).toBeCloseTo(1, 2);
  });
});

describe('filterCorrelatedFactors', () => {
  it('removes highly correlated factors', () => {
    const corrMatrix: Record<string, Record<string, number>> = {
      pe: { roe: 0.9, momentum_3m: 0.2 },
      roe: { pe: 0.9, momentum_3m: 0.1 },
      momentum_3m: { pe: 0.2, roe: 0.1 },
    };
    const result = filterCorrelatedFactors(baseFactors, corrMatrix, 0.8);
    const ids = result.map(f => f.id);
    // pe has highest weight, so roe (correlated with pe) should be excluded
    expect(ids).toContain('pe');
    expect(ids).toContain('momentum_3m');
  });

  it('keeps low-correlated factors', () => {
    const corrMatrix: Record<string, Record<string, number>> = {
      pe: { roe: 0.3, momentum_3m: 0.2 },
      roe: { pe: 0.3, momentum_3m: 0.1 },
      momentum_3m: { pe: 0.2, roe: 0.1 },
    };
    const result = filterCorrelatedFactors(baseFactors, corrMatrix, 0.8);
    expect(result).toHaveLength(3);
  });
});
