import { describe, it, expect } from 'vitest';
import { computeFactorExposures, StockExposure, FactorExposure } from '../services/barraFactorEngine';

function makeStocks(n: number, seed: number = 1): StockExposure[] {
  const stocks: StockExposure[] = [];
  for (let i = 0; i < n; i++) {
    const r = (seed + i * 7) % 100 / 100;
    stocks.push({
      stockId: `S${i}`,
      market: r,
      size: 1 - r,
      value: r * 0.8,
      momentum: (r - 0.5) * 2,
      volatility: Math.abs(r - 0.5),
      quality: r * 0.6 + 0.2,
      return_: r * 0.1 - 0.03,
    });
  }
  return stocks;
}

describe('BarraFactorEngine', () => {
  describe('computeFactorExposures', () => {
    it('should return empty array when fewer than 5 stocks', () => {
      const stocks = makeStocks(3);
      const result = computeFactorExposures(stocks);
      expect(result).toEqual([]);
    });

    it('should return exactly 6 factor exposures for sufficient data', () => {
      const stocks = makeStocks(10);
      const result = computeFactorExposures(stocks);
      expect(result).toHaveLength(6);
      const factorNames = result.map(f => f.factor);
      expect(factorNames).toContain('market');
      expect(factorNames).toContain('size');
      expect(factorNames).toContain('value');
      expect(factorNames).toContain('momentum');
      expect(factorNames).toContain('volatility');
      expect(factorNames).toContain('quality');
    });

    it('should return FactorExposure objects with correct structure', () => {
      const stocks = makeStocks(8);
      const result = computeFactorExposures(stocks);
      for (const f of result) {
        expect(f).toHaveProperty('factor');
        expect(f).toHaveProperty('exposure');
        expect(f).toHaveProperty('tStat');
        expect(f).toHaveProperty('significance');
        expect(typeof f.exposure).toBe('number');
        expect(typeof f.tStat).toBe('number');
        expect(typeof f.significance).toBe('boolean');
      }
    });

    it('should mark significance when |tStat| > 1.96', () => {
      const stocks = makeStocks(20, 42);
      const result = computeFactorExposures(stocks);
      for (const f of result) {
        if (Math.abs(f.tStat) > 1.96) {
          expect(f.significance).toBe(true);
        } else {
          expect(f.significance).toBe(false);
        }
      }
    });

    it('should handle constant exposure factor (zero variance)', () => {
      const stocks: StockExposure[] = [];
      for (let i = 0; i < 10; i++) {
        stocks.push({
          stockId: `S${i}`,
          market: 1, // constant
          size: i * 0.1,
          value: i * 0.05,
          momentum: 0,
          volatility: 0.2,
          quality: 0.8,
          return_: i * 0.01,
        });
      }
      const result = computeFactorExposures(stocks);
      const marketFactor = result.find(f => f.factor === 'market');
      expect(marketFactor).toBeDefined();
      expect(marketFactor!.exposure).toBe(0); // zero variance -> zero beta
    });

    it('should handle empty input', () => {
      const result = computeFactorExposures([]);
      expect(result).toEqual([]);
    });
  });
});
