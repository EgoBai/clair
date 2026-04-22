import { describe, it, expect } from 'vitest';
import { detectDivergence, scanAllPairs, MarketSeries } from '../services/crossMarketDivergenceEngine';

function genMarket(name: string, n: number, drift: number): MarketSeries {
  const values: number[] = [100];
  for (let i = 1; i < n; i++) {
    values.push(values[i - 1] * (1 + drift + Math.sin(i * 0.3) * 0.002));
  }
  return { name, values };
}

function genDivergent(name: string, n: number): MarketSeries {
  const values: number[] = [100];
  for (let i = 1; i < n; i++) {
    const drift = i < n / 2 ? 0.005 : -0.005;
    values.push(values[i - 1] * (1 + drift + Math.cos(i * 0.5) * 0.001));
  }
  return { name, values };
}

describe('CrossMarketDivergenceEngine', () => {
  const marketA = genMarket('SH', 100, 0.002);
  const marketB = genMarket('SZ', 100, 0.002);
  const divergentB = genDivergent('Divergent', 100);

  describe('detectDivergence', () => {
    it('should return null for insufficient data', () => {
      expect(detectDivergence(
        { name: 'a', values: [1, 2, 3] },
        { name: 'b', values: [1, 2, 3] }
      )).toBeNull();
    });

    it('should detect low divergence in correlated markets', () => {
      const result = detectDivergence(marketA, marketB);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.correlation).toBeGreaterThan(0);
      expect(['A_leading', 'B_leading', 'converging']).toContain(result.direction);
      expect(['reversal_warning', 'trend_confirm', 'neutral']).toContain(result.signal);
    });

    it('should detect higher divergence with divergent market', () => {
      const result = detectDivergence(marketA, divergentB);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.strength).toBeGreaterThan(0);
    });

    it('should have strength between 0 and 1', () => {
      const result = detectDivergence(marketA, marketB);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.strength).toBeGreaterThanOrEqual(0);
      expect(result.strength).toBeLessThanOrEqual(1);
    });
  });

  describe('scanAllPairs', () => {
    it('should return all pairs sorted by strength', () => {
      const results = scanAllPairs([marketA, marketB, divergentB]);
      expect(results.length).toBe(3); // C(3,2) = 3
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].strength).toBeGreaterThanOrEqual(results[i].strength);
      }
    });

    it('should return empty for single market', () => {
      expect(scanAllPairs([marketA])).toEqual([]);
    });
  });
});
