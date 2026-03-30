import { describe, it, expect } from 'vitest';
import {
  calculateZScore,
  normalizeFactor,
  winsorize,
  calculateFactorExposures,
  calculateFactorReturns,
  calculateFactorIC,
  buildMultiFactorModel,
  neutralizeFactors,
  compositeFactorScore,
  type Factor,
  type FactorExposure,
} from '../utils/quantFactorEngine';

describe('QuantFactorEngine', () => {
  const factors: Factor[] = [
    { name: 'PE', category: 'value', values: [
      { ticker: 'A', value: 10 }, { ticker: 'B', value: 15 }, { ticker: 'C', value: 20 },
      { ticker: 'D', value: 25 }, { ticker: 'E', value: 30 },
    ]},
    { name: 'ROE', category: 'quality', values: [
      { ticker: 'A', value: 0.2 }, { ticker: 'B', value: 0.15 }, { ticker: 'C', value: 0.1 },
      { ticker: 'D', value: 0.25 }, { ticker: 'E', value: 0.18 },
    ]},
    { name: 'Momentum', category: 'momentum', values: [
      { ticker: 'A', value: 0.1 }, { ticker: 'B', value: -0.05 }, { ticker: 'C', value: 0.15 },
      { ticker: 'D', value: 0.08 }, { ticker: 'E', value: -0.02 },
    ]},
  ];

  const stockReturns = [
    { ticker: 'A', return: 0.08 }, { ticker: 'B', return: -0.03 }, { ticker: 'C', return: 0.12 },
    { ticker: 'D', return: 0.05 }, { ticker: 'E', return: -0.01 },
  ];

  describe('calculateZScore', () => {
    it('should calculate z-scores', () => {
      const zScores = calculateZScore([1, 2, 3, 4, 5]);
      expect(zScores.reduce((s, z) => s + z, 0)).toBeCloseTo(0, 5);
    });

    it('should return zeros for identical values', () => {
      const zScores = calculateZScore([5, 5, 5]);
      expect(zScores.every(z => z === 0)).toBe(true);
    });

    it('should handle empty array', () => {
      expect(calculateZScore([])).toEqual([]);
    });
  });

  describe('normalizeFactor', () => {
    it('should normalize factor values to z-scores', () => {
      const normalized = normalizeFactor(factors[0]);
      expect(normalized.values.length).toBe(factors[0].values.length);
      expect(normalized.name).toBe('PE');
    });

    it('should preserve ticker mapping', () => {
      const normalized = normalizeFactor(factors[0]);
      expect(normalized.values.map(v => v.ticker)).toEqual(['A', 'B', 'C', 'D', 'E']);
    });
  });

  describe('winsorize', () => {
    it('should cap extreme values', () => {
      const values = Array(20).fill(2).concat([10000]);
      const result = winsorize(values, 2);
      expect(result[20]).toBeLessThan(10000);
    });

    it('should not modify values within bounds', () => {
      const values = [2, 3, 3, 3, 4];
      const result = winsorize(values, 3);
      expect(result[0]).toBe(2);
      expect(result[4]).toBe(4);
    });

    it('should use default limit of 3', () => {
      const values = Array(20).fill(2).concat([100000]);
      const result = winsorize(values);
      expect(result[20]).toBeLessThan(100000);
    });
  });

  describe('calculateFactorExposures', () => {
    it('should calculate exposures for a ticker', () => {
      const exposure = calculateFactorExposures(factors, 'A');
      expect(exposure.ticker).toBe('A');
      expect(exposure.exposures['PE']).toBe(10);
      expect(exposure.exposures['ROE']).toBe(0.2);
    });

    it('should calculate expected return and risk', () => {
      const exposure = calculateFactorExposures(factors, 'A');
      expect(typeof exposure.expectedReturn).toBe('number');
      expect(typeof exposure.risk).toBe('number');
    });

    it('should handle missing ticker', () => {
      const exposure = calculateFactorExposures(factors, 'X');
      expect(exposure.exposures['PE']).toBe(0);
    });
  });

  describe('calculateFactorReturns', () => {
    it('should calculate factor returns', () => {
      const returns = calculateFactorReturns(factors, stockReturns);
      expect(returns.length).toBe(factors.length);
      for (const r of returns) {
        expect(typeof r.periodReturn).toBe('number');
        expect(typeof r.tStat).toBe('number');
        expect(typeof r.significant).toBe('boolean');
      }
    });

    it('should flag significant factors', () => {
      const returns = calculateFactorReturns(factors, stockReturns);
      for (const r of returns) {
        expect(r.significant).toBe(Math.abs(r.tStat) > 1.96);
      }
    });
  });

  describe('calculateFactorIC', () => {
    it('should calculate IC', () => {
      const ic = calculateFactorIC(factors[0], stockReturns);
      expect(ic.factorName).toBe('PE');
      expect(ic.ic).toBeGreaterThanOrEqual(-1);
      expect(ic.ic).toBeLessThanOrEqual(1);
    });

    it('should calculate rank IC', () => {
      const ic = calculateFactorIC(factors[0], stockReturns);
      expect(ic.rankIC).toBeGreaterThanOrEqual(-1);
      expect(ic.rankIC).toBeLessThanOrEqual(1);
    });

    it('should return zeros for insufficient data', () => {
      const smallFactor: Factor = { name: 'test', category: 'value', values: [{ ticker: 'A', value: 1 }] };
      const ic = calculateFactorIC(smallFactor, [{ ticker: 'A', return: 0.1 }]);
      expect(ic.ic).toBe(0);
    });
  });

  describe('buildMultiFactorModel', () => {
    it('should build model', () => {
      const model = buildMultiFactorModel(factors, stockReturns);
      expect(model.factors.length).toBe(factors.length);
      expect(model.returns.length).toBe(factors.length);
      expect(model.rSquared).toBeGreaterThanOrEqual(0);
      expect(model.rSquared).toBeLessThanOrEqual(1);
    });

    it('should include residual risk', () => {
      const model = buildMultiFactorModel(factors, stockReturns);
      expect(model.residualRisk).toBeGreaterThanOrEqual(0);
    });
  });

  describe('neutralizeFactors', () => {
    it('should set neutralized factors to 0', () => {
      const exposures: FactorExposure[] = [
        { ticker: 'A', exposures: { PE: 1, ROE: 0.5, Momentum: 0.2 }, expectedReturn: 0.5, risk: 0.5 },
      ];
      const result = neutralizeFactors(exposures, ['PE']);
      expect(result[0].exposures['PE']).toBe(0);
      expect(result[0].exposures['ROE']).toBe(0.5);
    });
  });

  describe('compositeFactorScore', () => {
    it('should calculate composite scores', () => {
      const exposures: FactorExposure[] = factors[0].values.map(v => 
        calculateFactorExposures(factors, v.ticker)
      );
      const scores = compositeFactorScore(exposures, { PE: 0.5, ROE: 0.3, Momentum: 0.2 });
      expect(scores.length).toBe(exposures.length);
      expect(scores[0].rank).toBe(1);
    });

    it('should sort by score descending', () => {
      const exposures: FactorExposure[] = factors[0].values.map(v => 
        calculateFactorExposures(factors, v.ticker)
      );
      const scores = compositeFactorScore(exposures, { PE: 1 });
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i - 1].score).toBeGreaterThanOrEqual(scores[i].score);
      }
    });
  });
});
