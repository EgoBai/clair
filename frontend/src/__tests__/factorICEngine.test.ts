import { describe, it, expect } from 'vitest';
import {
  calculateIC,
  calculateTimeSeriesIC,
  calculateQuintileReturns,
  calculateFactorCorrelation,
  compositeFactors,
  type FactorData,
} from '../utils/factorICEngine';

function makeFactorData(count: number, seed: number = 42): FactorData[] {
  const data: FactorData[] = [];
  let rng = seed;
  for (let i = 0; i < count; i++) {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    const factorValue = (rng / 0x7fffffff) * 2 - 1;
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    const nextReturn = (rng / 0x7fffffff) * 0.1 - 0.02;
    data.push({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      ticker: `T${i}`,
      factorValue,
      nextReturn,
    });
  }
  return data;
}

describe('Factor IC Engine', () => {
  describe('calculateIC', () => {
    it('should return null for insufficient data', () => {
      expect(calculateIC(makeFactorData(5))).toBeNull();
    });

    it('should return IC between -1 and 1', () => {
      const result = calculateIC(makeFactorData(50));
      expect(result).not.toBeNull();
      expect(result!.ic).toBeGreaterThanOrEqual(-1);
      expect(result!.ic).toBeLessThanOrEqual(1);
    });

    it('should calculate rank IC', () => {
      const result = calculateIC(makeFactorData(50));
      expect(result!.rankIC).toBeGreaterThanOrEqual(-1);
      expect(result!.rankIC).toBeLessThanOrEqual(1);
    });

    it('should detect valid factor', () => {
      // Create positively correlated data
      const data: FactorData[] = Array.from({ length: 30 }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        ticker: `T${i}`,
        factorValue: i,
        nextReturn: i * 0.01 + Math.random() * 0.005,
      }));
      const result = calculateIC(data);
      expect(result!.ic).toBeGreaterThan(0);
    });

    it('should include periods count', () => {
      const result = calculateIC(makeFactorData(50));
      expect(result!.periods).toBe(50);
    });
  });

  describe('calculateTimeSeriesIC', () => {
    it('should calculate ICIR from time series', () => {
      const byDate = new Map<string, FactorData[]>();
      for (let d = 0; d < 10; d++) {
        byDate.set(`2026-01-${d + 1}`, makeFactorData(30, d * 100));
      }
      const result = calculateTimeSeriesIC(byDate);
      expect(result).not.toBeNull();
      expect(result!.periods).toBe(10);
      expect(typeof result!.icir).toBe('number');
    });

    it('should return null for insufficient dates', () => {
      const byDate = new Map<string, FactorData[]>();
      byDate.set('2026-01-01', makeFactorData(30));
      expect(calculateTimeSeriesIC(byDate)).toBeNull();
    });
  });

  describe('calculateQuintileReturns', () => {
    it('should return null for insufficient data', () => {
      expect(calculateQuintileReturns(makeFactorData(10), 'test')).toBeNull();
    });

    it('should split into 5 quintiles', () => {
      const result = calculateQuintileReturns(makeFactorData(100), 'test');
      expect(result).not.toBeNull();
      expect(result!.quintiles).toHaveLength(5);
      expect(result!.quintiles[0].quintile).toBe(1);
      expect(result!.quintiles[4].quintile).toBe(5);
    });

    it('should calculate long-short return', () => {
      const result = calculateQuintileReturns(makeFactorData(100), 'test');
      expect(typeof result!.longShortReturn).toBe('number');
      expect(typeof result!.monotonic).toBe('boolean');
    });

    it('should have positive count in each quintile', () => {
      const result = calculateQuintileReturns(makeFactorData(100), 'test');
      result!.quintiles.forEach(q => {
        expect(q.count).toBeGreaterThan(0);
      });
    });
  });

  describe('calculateFactorCorrelation', () => {
    it('should return null for insufficient common tickers', () => {
      const a = new Map([['A', 1]]);
      const b = new Map([['B', 2]]);
      expect(calculateFactorCorrelation(a, b)).toBeNull();
    });

    it('should calculate correlation', () => {
      const a = new Map<string, number>();
      const b = new Map<string, number>();
      for (let i = 0; i < 20; i++) {
        a.set(`T${i}`, i);
        b.set(`T${i}`, i * 2 + 1);
      }
      const result = calculateFactorCorrelation(a, b);
      expect(result).not.toBeNull();
      expect(result!.correlation).toBeCloseTo(1, 1);
      expect(result!.independent).toBe(false);
    });

    it('should detect independent factors', () => {
      const a = new Map<string, number>();
      const b = new Map<string, number>();
      // Uncorrelated data
      for (let i = 0; i < 30; i++) {
        a.set(`T${i}`, i % 2 === 0 ? 1 : -1);
        b.set(`T${i}`, i % 3);
      }
      const result = calculateFactorCorrelation(a, b);
      expect(result).not.toBeNull();
      expect(result!.absCorrelation).toBeLessThan(1);
    });
  });

  describe('compositeFactors', () => {
    it('should weight by IC', () => {
      const factors = [
        { name: 'momentum', ic: 0.05, icir: 0.8 },
        { name: 'value', ic: 0.03, icir: 0.6 },
        { name: 'quality', ic: 0.02, icir: 1.0 },
      ];
      const composite = compositeFactors(factors, 'ic_weight');

      expect(composite.factors.length).toBe(3);
      expect(composite.factors[0].weight).toBeGreaterThan(composite.factors[2].weight);
      expect(composite.ic).toBeGreaterThan(0);
    });

    it('should support equal weighting', () => {
      const factors = [
        { name: 'A', ic: 0.05, icir: 1.0 },
        { name: 'B', ic: 0.02, icir: 0.5 },
      ];
      const composite = compositeFactors(factors, 'equal');
      expect(composite.factors[0].weight).toBeCloseTo(0.5, 1);
      expect(composite.factors[1].weight).toBeCloseTo(0.5, 1);
    });

    it('should support ICIR weighting', () => {
      const factors = [
        { name: 'A', ic: 0.03, icir: 1.0 },
        { name: 'B', ic: 0.05, icir: 0.2 },
      ];
      const composite = compositeFactors(factors, 'icir_weight');
      expect(composite.factors[0].weight).toBeGreaterThan(composite.factors[1].weight);
    });
  });
});
