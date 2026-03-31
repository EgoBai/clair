import { describe, it, expect } from 'vitest';
import { buildFactorRiskModel, StockFactorData } from '../utils/multiFactorRiskEngine';

describe('多因子风险模型引擎', () => {
  const stocks: StockFactorData[] = [
    {
      symbol: 'A',
      returns: [0.01, 0.02, -0.01, 0.03],
      exposures: [
        { factor: 'market', exposure: 1.2, return_: 0.008 },
        { factor: 'size', exposure: -0.5, return_: -0.002 },
        { factor: 'value', exposure: 0.3, return_: 0.001 },
      ],
    },
    {
      symbol: 'B',
      returns: [0.02, 0.01, -0.02, 0.04],
      exposures: [
        { factor: 'market', exposure: 0.8, return_: 0.007 },
        { factor: 'size', exposure: 0.7, return_: 0.003 },
        { factor: 'value', exposure: -0.2, return_: -0.001 },
      ],
    },
    {
      symbol: 'C',
      returns: [-0.01, 0.03, 0.01, 0.02],
      exposures: [
        { factor: 'market', exposure: 1.0, return_: 0.009 },
        { factor: 'size', exposure: 0.1, return_: 0.001 },
        { factor: 'value', exposure: 0.5, return_: 0.002 },
      ],
    },
  ];

  describe('buildFactorRiskModel', () => {
    it('should return model with all fields', () => {
      const result = buildFactorRiskModel(stocks);
      expect(result.factors.length).toBe(3);
      expect(result.factorReturns.length).toBe(3);
      expect(result.factorCovariance.length).toBe(3);
      expect(result.totalRisk).toBeGreaterThanOrEqual(0);
    });

    it('should have marginal contributions', () => {
      const result = buildFactorRiskModel(stocks);
      expect(result.marginalContributions.length).toBe(3);
      result.marginalContributions.forEach(m => {
        expect(m.factor).toBeDefined();
        expect(typeof m.contribution).toBe('number');
        expect(typeof m.pct).toBe('number');
      });
    });

    it('should decompose risk per stock', () => {
      const result = buildFactorRiskModel(stocks);
      expect(result.riskDecomposition.length).toBe(3);
      result.riskDecomposition.forEach(r => {
        expect(r.totalRisk).toBeGreaterThanOrEqual(0);
        expect(r.symbol).toBeDefined();
      });
    });

    it('should handle empty input', () => {
      const result = buildFactorRiskModel([]);
      expect(result.factors.length).toBe(0);
      expect(result.totalRisk).toBe(0);
    });

    it('should have factor covariance matrix', () => {
      const result = buildFactorRiskModel(stocks);
      expect(result.factorCovariance.length).toBe(3);
      expect(result.factorCovariance[0].length).toBe(3);
      // 对角线应该 >= 0
      for (let i = 0; i < 3; i++) {
        expect(result.factorCovariance[i][i]).toBeGreaterThanOrEqual(0);
      }
    });

    it('should calculate specific risk', () => {
      const result = buildFactorRiskModel(stocks);
      expect(result.specificRisk.length).toBe(3);
      result.specificRisk.forEach(r => expect(r).toBeGreaterThanOrEqual(0));
    });
  });
});
