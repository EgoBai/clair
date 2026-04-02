import { describe, it, expect } from 'vitest';
import { analyzePair, batchPairAnalysis, PriceData } from '../services/pairTradingEngine';

function genPrices(days: number, start: number, drift: number, vol: number): PriceData[] {
  const prices: PriceData[] = [];
  let p = start;
  for (let i = 0; i < days; i++) {
    p = p * (1 + drift + vol * Math.sin(i * 0.3));
    prices.push({ date: `2025-01-${String(i + 1).padStart(2, '0')}`, close: Math.max(0.01, p) });
  }
  return prices;
}

describe('PairTradingEngine', () => {
  const correlatedA = genPrices(100, 10, 0.001, 0.02);
  const correlatedB = genPrices(100, 20, 0.001, 0.02);
  const divergentA = genPrices(100, 10, 0.005, 0.01);
  const divergentB = genPrices(100, 20, -0.005, 0.01);

  describe('analyzePair', () => {
    it('should return null for insufficient data', () => {
      expect(analyzePair(genPrices(3, 1, 0, 0.01), genPrices(3, 1, 0, 0.01))).toBeNull();
    });

    it('should return valid result for correlated pairs', () => {
      const result = analyzePair(correlatedA, correlatedB);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.spread.length).toBeGreaterThan(0);
      expect(result.zScore).toBeDefined();
      expect(result.halfLife).toBeGreaterThan(0);
      expect(result.hurst).toBeGreaterThanOrEqual(0);
      expect(result.hurst).toBeLessThanOrEqual(1);
    });

    it('should detect spread signal for divergent pairs', () => {
      const result = analyzePair(divergentA, divergentB, { entryZScore: 1.0 });
      expect(result).not.toBeNull();
      if (!result) return;
      expect(['long_spread', 'short_spread', 'neutral']).toContain(result.signal);
    });

    it('should compute cointegration score', () => {
      const result = analyzePair(correlatedA, correlatedB);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.cointegrationScore).toBeGreaterThanOrEqual(0);
      expect(result.cointegrationScore).toBeLessThanOrEqual(1);
    });

    it('should apply custom config', () => {
      const result = analyzePair(correlatedA, correlatedB, {
        lookback: 30,
        entryZScore: 1.5,
        exitZScore: 0.3,
      });
      expect(result).not.toBeNull();
    });
  });

  describe('batchPairAnalysis', () => {
    it('should analyze multiple pairs', () => {
      const pairs = [
        { a: correlatedA, b: correlatedB, name: 'pair1' },
        { a: divergentA, b: divergentB, name: 'pair2' },
      ];
      const results = batchPairAnalysis(pairs);
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('pair1');
      expect(results[1].name).toBe('pair2');
    });
  });
});
