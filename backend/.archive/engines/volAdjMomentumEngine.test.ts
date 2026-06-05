import { describe, it, expect } from 'vitest';
import {
  computeVolAdjMomentum,
  batchVolAdjMomentum,
  rankByVolAdjMomentum,
  PriceSeries,
} from '../services/volAdjMomentumEngine';

function generatePrices(days: number, startPrice: number, drift: number, vol: number): PriceSeries[] {
  const prices: PriceSeries[] = [];
  let price = startPrice;
  for (let i = 0; i < days; i++) {
    const date = `2025-01-${String(i + 1).padStart(2, '0')}`;
    const ret = drift + vol * (Math.sin(i * 0.5) * 0.5);
    price = price * (1 + ret);
    prices.push({ date, close: Math.max(0.01, price), volume: 1000000 + i * 10000 });
  }
  return prices;
}

describe('VolAdjMomentumEngine', () => {
  const uptrend = generatePrices(60, 10, 0.003, 0.015);
  const downtrend = generatePrices(60, 10, -0.003, 0.015);
  const sideways = generatePrices(60, 10, 0.0001, 0.02);
  const highVol = generatePrices(60, 10, 0.002, 0.05);

  describe('computeVolAdjMomentum', () => {
    it('should return null for insufficient data', () => {
      expect(computeVolAdjMomentum(generatePrices(5, 10, 0.001, 0.01))).toBeNull();
    });

    it('should return valid result for uptrend', () => {
      const result = computeVolAdjMomentum(uptrend);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.rawMomentum).toBeGreaterThan(0);
      expect(result.realizedVol).toBeGreaterThan(0);
      expect(result.volAdjMomentum).toBeGreaterThan(0);
      expect(['buy', 'strong_buy', 'neutral']).toContain(result.signal);
    });

    it('should return valid result for downtrend', () => {
      const result = computeVolAdjMomentum(downtrend);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.rawMomentum).toBeLessThan(0);
      expect(['sell', 'strong_sell', 'neutral']).toContain(result.signal);
    });

    it('should handle high volatility stocks', () => {
      const result = computeVolAdjMomentum(highVol);
      expect(result).not.toBeNull();
      if (!result) return;
      // 高波动率应该降低 volAdjMomentum
      const lowVolResult = computeVolAdjMomentum(uptrend);
      if (!lowVolResult) return;
      expect(result.realizedVol).toBeGreaterThan(lowVolResult.realizedVol);
    });

    it('should apply custom config thresholds', () => {
      const result = computeVolAdjMomentum(uptrend, {
        buyThreshold: 0.01,
        sellThreshold: -0.01,
        strongMultiplier: 1.5,
      });
      expect(result).not.toBeNull();
    });

    it('should compute confidence between 0 and 1', () => {
      const result = computeVolAdjMomentum(uptrend);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should compute percentile between 0 and 100', () => {
      const result = computeVolAdjMomentum(uptrend);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.percentile).toBeGreaterThanOrEqual(0);
      expect(result.percentile).toBeLessThanOrEqual(100);
    });

    it('should handle zero close price gracefully', () => {
      const bad: PriceSeries[] = [];
      for (let i = 0; i < 30; i++) {
        bad.push({ date: `2025-01-${String(i + 1).padStart(2, '0')}`, close: 0, volume: 100 });
      }
      expect(computeVolAdjMomentum(bad)).toBeNull();
    });
  });

  describe('batchVolAdjMomentum', () => {
    it('should process multiple stocks', () => {
      const stocks = { '600000': uptrend, '000001': downtrend, '600036': sideways };
      const result = batchVolAdjMomentum(stocks);
      expect(Object.keys(result)).toHaveLength(3);
      expect(result['600000']).not.toBeNull();
      expect(result['000001']).not.toBeNull();
    });
  });

  describe('rankByVolAdjMomentum', () => {
    it('should rank stocks by volAdjMomentum descending', () => {
      const stocks = { '600000': uptrend, '000001': downtrend, '600036': sideways };
      const ranked = rankByVolAdjMomentum(stocks);
      expect(ranked.length).toBeGreaterThan(0);
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1].result.volAdjMomentum).toBeGreaterThanOrEqual(
          ranked[i].result.volAdjMomentum
        );
      }
    });

    it('should exclude null results', () => {
      const stocks = { '600000': uptrend, 'INVALID': generatePrices(3, 1, 0, 0.01) };
      const ranked = rankByVolAdjMomentum(stocks);
      expect(ranked.every(r => r.code !== 'INVALID')).toBe(true);
    });
  });
});
