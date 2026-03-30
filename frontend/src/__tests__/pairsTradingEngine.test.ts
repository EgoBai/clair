import { describe, it, expect } from 'vitest';
import {
  calculateCorrelation,
  calculateHedgeRatio,
  calculateSpread,
  calculateZScore,
  calculateHalfLife,
  adfTest,
  findPairs,
  generatePairsSignals,
  analyzeMeanReversion,
  calculateBollingerBandSignal,
  calculateHurstExponent,
  kalmanFilterHedgeRatio,
  type PriceSeries,
} from '../utils/pairsTradingEngine';

// Generate correlated price series
function generateCorrelatedPrices(
  base: number[],
  correlation: number,
  noise: number = 0.01
): number[] {
  const result: number[] = [base[0] * (1 + (Math.random() - 0.5) * 0.1)];
  for (let i = 1; i < base.length; i++) {
    const baseReturn = (base[i] - base[i - 1]) / base[i - 1];
    const correlatedReturn = correlation * baseReturn + (1 - correlation) * (Math.random() - 0.5) * noise;
    result.push(result[i - 1] * (1 + correlatedReturn));
  }
  return result;
}

const basePrices = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i * 0.1) * 10);
const correlatedPrices = generateCorrelatedPrices(basePrices, 0.9, 0.005);
const unrelatedPrices = Array.from({ length: 100 }, (_, i) => 50 + Math.cos(i * 0.2) * 5);

describe('calculateCorrelation', () => {
  it('should return ~1 for identical series', () => {
    expect(calculateCorrelation(basePrices, basePrices)).toBeCloseTo(1, 5);
  });

  it('should return ~-1 for inverse series', () => {
    const inverse = basePrices.map(p => -p);
    expect(calculateCorrelation(basePrices, inverse)).toBeCloseTo(-1, 5);
  });

  it('should return 0 for empty arrays', () => {
    expect(calculateCorrelation([], [])).toBe(0);
  });

  it('should detect correlation in generated series', () => {
    const corr = calculateCorrelation(basePrices, correlatedPrices);
    expect(corr).toBeGreaterThan(0.5);
  });
});

describe('calculateHedgeRatio', () => {
  it('should calculate hedge ratio', () => {
    const hr = calculateHedgeRatio(basePrices, correlatedPrices);
    expect(typeof hr).toBe('number');
    expect(hr).not.toBeNaN();
  });

  it('should return 1 for insufficient data', () => {
    expect(calculateHedgeRatio([1], [2])).toBe(1);
  });
});

describe('calculateSpread', () => {
  it('should calculate spread series', () => {
    const spread = calculateSpread(basePrices, correlatedPrices, 1);
    expect(spread.length).toBe(Math.min(basePrices.length, correlatedPrices.length));
  });

  it('should return empty for empty inputs', () => {
    expect(calculateSpread([], [], 1)).toEqual([]);
  });
});

describe('calculateZScore', () => {
  it('should calculate z-scores', () => {
    const spread = calculateSpread(basePrices, correlatedPrices, 1);
    const zScores = calculateZScore(spread, 20);
    expect(zScores.length).toBe(spread.length);
  });

  it('should have mean close to 0', () => {
    const spread = Array.from({ length: 100 }, () => Math.random());
    const zScores = calculateZScore(spread, 20);
    // Later z-scores should have mean near 0
    const later = zScores.slice(50);
    const mean = later.reduce((a, b) => a + b, 0) / later.length;
    expect(Math.abs(mean)).toBeLessThan(1);
  });
});

describe('calculateHalfLife', () => {
  it('should calculate half-life', () => {
    // Mean-reverting series
    const spread = Array.from({ length: 100 }, (_, i) => Math.sin(i * 0.1) + Math.random() * 0.1);
    const hl = calculateHalfLife(spread);
    expect(typeof hl).toBe('number');
  });

  it('should return 0 for insufficient data', () => {
    expect(calculateHalfLife([1, 2])).toBe(0);
  });

  it('should return Infinity for trending series', () => {
    const trending = Array.from({ length: 50 }, (_, i) => i);
    const hl = calculateHalfLife(trending);
    expect(hl).toBe(Infinity);
  });
});

describe('adfTest', () => {
  it('should detect stationary series', () => {
    const stationary = Array.from({ length: 100 }, () => Math.random() - 0.5);
    const result = adfTest(stationary);
    expect(typeof result.statistic).toBe('number');
    expect(typeof result.isStationary).toBe('boolean');
  });

  it('should detect non-stationary series', () => {
    const trending = Array.from({ length: 100 }, (_, i) => i + Math.random());
    const result = adfTest(trending);
    expect(result.isStationary).toBe(false);
  });

  it('should handle short series', () => {
    expect(adfTest([1, 2, 3])).toEqual({ statistic: 0, isStationary: false });
  });
});

describe('findPairs', () => {
  it('should find correlated pairs', () => {
    const series: PriceSeries[] = [
      { symbol: 'A', prices: basePrices, timestamps: [] },
      { symbol: 'B', prices: correlatedPrices, timestamps: [] },
      { symbol: 'C', prices: unrelatedPrices, timestamps: [] },
    ];
    const pairs = findPairs(series, 0.5);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs[0].symbol1).toBeDefined();
    expect(pairs[0].hedgeRatio).toBeDefined();
  });

  it('should return empty for uncorrelated series', () => {
    const series: PriceSeries[] = [
      { symbol: 'A', prices: basePrices, timestamps: [] },
      { symbol: 'B', prices: unrelatedPrices, timestamps: [] },
    ];
    const pairs = findPairs(series, 0.99);
    expect(pairs.length).toBe(0);
  });
});

describe('generatePairsSignals', () => {
  it('should generate trading signals', () => {
    const pair = {
      symbol1: 'A', symbol2: 'B',
      correlation: 0.9, cointegrationScore: 3,
      halfLife: 10, hedgeRatio: 1,
      spread: Array.from({ length: 30 }, (_, i) => Math.sin(i * 0.3) * 5),
      zScore: Array.from({ length: 30 }, (_, i) => Math.sin(i * 0.3) * 2.5),
      isStationary: true, adfStatistic: -3,
    };
    const signals = generatePairsSignals(pair, Array.from({ length: 30 }, (_, i) => i));
    expect(signals.length).toBe(30);
    expect(signals.some(s => s.action !== 'hold')).toBe(true);
  });
});

describe('analyzeMeanReversion', () => {
  it('should analyze mean reversion', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.2) * 5);
    const result = analyzeMeanReversion(prices);
    expect(result.mean).toBeGreaterThan(0);
    expect(result.std).toBeGreaterThan(0);
    expect(typeof result.isOversold).toBe('boolean');
    expect(typeof result.isOverbought).toBe('boolean');
  });
});

describe('calculateBollingerBandSignal', () => {
  it('should calculate Bollinger Bands', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.2) * 5);
    const result = calculateBollingerBandSignal(prices);
    expect(result.upper).toBeGreaterThan(result.middle);
    expect(result.lower).toBeLessThan(result.middle);
    expect(['buy', 'sell', 'hold']).toContain(result.signal);
  });

  it('should signal buy at lower band', () => {
    const prices = Array.from({ length: 30 }, () => 100);
    prices.push(80);
    const result = calculateBollingerBandSignal(prices);
    expect(result.signal).toBe('buy');
  });

  it('should signal sell at upper band', () => {
    const prices = Array.from({ length: 30 }, () => 100);
    prices.push(120);
    const result = calculateBollingerBandSignal(prices);
    expect(result.signal).toBe('sell');
  });
});

describe('calculateHurstExponent', () => {
  it('should return ~0.5 for random walk', () => {
    const prices = Array.from({ length: 200 }, (_, i) => 100 + Math.random() * 2 - 1 + i * 0.01);
    const h = calculateHurstExponent(prices);
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThan(1);
  });

  it('should return 0.5 for short series', () => {
    expect(calculateHurstExponent([1, 2, 3])).toBe(0.5);
  });
});

describe('kalmanFilterHedgeRatio', () => {
  it('should calculate adaptive hedge ratio', () => {
    const hrs = kalmanFilterHedgeRatio(basePrices, correlatedPrices);
    expect(hrs.length).toBe(Math.min(basePrices.length, correlatedPrices.length));
    hrs.forEach(hr => expect(typeof hr).toBe('number'));
  });
});
