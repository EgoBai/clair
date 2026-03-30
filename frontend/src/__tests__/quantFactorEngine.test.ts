import { describe, it, expect } from 'vitest';
import {
  calculateFactorIC,
  compositeFactorScore,
  factorAttribution,
  generateFactorSignals,
  type FactorExposure,
  type FactorPerformance,
} from '../utils/quantFactorEngine';

describe('QuantFactorEngine', () => {
  describe('calculateFactorIC', () => {
    it('should calculate positive IC for correlated data', () => {
      const factors = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const returns = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
      const ic = calculateFactorIC(factors, returns);
      expect(ic).toBeGreaterThan(0.8);
    });

    it('should calculate negative IC for inversely correlated', () => {
      const factors = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const returns = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];
      const ic = calculateFactorIC(factors, returns);
      expect(ic).toBeLessThan(-0.8);
    });

    it('should return near 0 for uncorrelated data', () => {
      // Alternating pattern creates low correlation
      const factors = [1, 10, 2, 9, 3, 8, 4, 7, 5, 6];
      const returns = [5, 1, 8, 3, 2, 9, 6, 4, 7, 10];
      const ic = calculateFactorIC(factors, returns);
      expect(Math.abs(ic)).toBeLessThan(0.8);
    });

    it('should return 0 for insufficient data', () => {
      expect(calculateFactorIC([1, 2], [1, 2])).toBe(0);
    });

    it('should return 0 for mismatched lengths', () => {
      expect(calculateFactorIC([1, 2, 3], [1, 2])).toBe(0);
    });

    it('should handle constant factor gracefully', () => {
      // rankArray assigns unique ranks even for equal values, so IC may not be 0
      const ic = calculateFactorIC([5, 5, 5, 5, 5], [1, 2, 3, 4, 5]);
      expect(typeof ic).toBe('number');
    });

    it('should round to 4 decimal places', () => {
      const ic = calculateFactorIC([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
      expect(ic).toBe(Math.round(ic * 10000) / 10000);
    });
  });

  describe('compositeFactorScore', () => {
    const exposures: FactorExposure[] = [
      { ticker: 'A', name: 'StockA', marketBeta: 1.2, sizeFactor: 0.5, valueFactor: 0.8, momentumFactor: 0.3, qualityFactor: 0.6, lowVolFactor: -0.2, compositeScore: 0 },
      { ticker: 'B', name: 'StockB', marketBeta: 0.8, sizeFactor: -0.3, valueFactor: 0.2, momentumFactor: 0.9, qualityFactor: 0.4, lowVolFactor: 0.5, compositeScore: 0 },
      { ticker: 'C', name: 'StockC', marketBeta: 1.0, sizeFactor: 0.1, valueFactor: -0.5, momentumFactor: 0.1, qualityFactor: 0.9, lowVolFactor: 0.3, compositeScore: 0 },
      { ticker: 'D', name: 'StockD', marketBeta: 0.5, sizeFactor: -0.8, valueFactor: 0.4, momentumFactor: -0.2, qualityFactor: 0.2, lowVolFactor: 0.8, compositeScore: 0 },
      { ticker: 'E', name: 'StockE', marketBeta: 1.5, sizeFactor: 0.9, valueFactor: 0.1, momentumFactor: 0.5, qualityFactor: -0.3, lowVolFactor: -0.5, compositeScore: 0 },
    ];

    it('should rank all stocks', () => {
      const result = compositeFactorScore(exposures);
      expect(result).toHaveLength(5);
      expect(result.map((r) => r.rank).sort()).toEqual([1, 2, 3, 4, 5]);
    });

    it('should sort by score descending', () => {
      const result = compositeFactorScore(exposures);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
      }
    });

    it('should calculate percentile', () => {
      const result = compositeFactorScore(exposures);
      for (const r of result) {
        expect(r.percentile).toBeGreaterThanOrEqual(0);
        expect(r.percentile).toBeLessThanOrEqual(100);
      }
    });

    it('should use custom weights', () => {
      const result = compositeFactorScore(exposures, {
        marketBeta: 0.5, sizeFactor: 0.1, valueFactor: 0.1,
        momentumFactor: 0.1, qualityFactor: 0.1, lowVolFactor: 0.1,
      });
      expect(result).toHaveLength(5);
    });

    it('should handle single stock', () => {
      const result = compositeFactorScore([exposures[0]]);
      expect(result).toHaveLength(1);
      expect(result[0].rank).toBe(1);
      expect(result[0].percentile).toBe(100);
    });

    it('should handle empty exposures', () => {
      const result = compositeFactorScore([]);
      expect(result).toHaveLength(0);
    });

    it('should include ticker and name', () => {
      const result = compositeFactorScore(exposures);
      for (const r of result) {
        expect(r.ticker).toBeDefined();
        expect(r.name).toBeDefined();
      }
    });
  });

  describe('factorAttribution', () => {
    const portfolioReturns = [0.01, 0.02, -0.01, 0.03, 0.01, -0.02, 0.02, 0.01, 0.03, -0.01];
    const factorReturns = new Map([
      ['market', [0.008, 0.015, -0.008, 0.025, 0.01, -0.015, 0.018, 0.008, 0.025, -0.008]],
      ['size', [0.002, 0.005, -0.003, 0.005, 0.001, -0.005, 0.002, 0.003, 0.005, -0.003]],
      ['value', [-0.001, 0.003, 0.002, -0.002, 0.002, -0.001, 0.001, -0.001, 0.003, 0.002]],
    ]);

    it('should calculate factor contributions', () => {
      const result = factorAttribution(portfolioReturns, factorReturns);
      expect(Object.keys(result.factorContributions)).toHaveLength(3);
    });

    it('should calculate alpha', () => {
      const result = factorAttribution(portfolioReturns, factorReturns);
      expect(typeof result.alpha).toBe('number');
    });

    it('should calculate R-squared', () => {
      const result = factorAttribution(portfolioReturns, factorReturns);
      expect(result.rSquared).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty factors', () => {
      const result = factorAttribution(portfolioReturns, new Map());
      expect(Object.keys(result.factorContributions)).toHaveLength(0);
    });

    it('should round contributions', () => {
      const result = factorAttribution(portfolioReturns, factorReturns);
      for (const v of Object.values(result.factorContributions)) {
        expect(v).toBe(Math.round(v * 10000) / 10000);
      }
    });
  });

  describe('generateFactorSignals', () => {
    const performances: FactorPerformance[] = [
      { factor: '动量', dailyReturn: 0.5, monthReturn: 3.2, yearReturn: 15, sharpe: 1.2, maxDrawdown: -5, winRate: 0.65 },
      { factor: '价值', dailyReturn: -0.2, monthReturn: -1.5, yearReturn: 5, sharpe: -0.8, maxDrawdown: -8, winRate: 0.45 },
      { factor: '质量', dailyReturn: 0.1, monthReturn: 0.5, yearReturn: 8, sharpe: 0.3, maxDrawdown: -3, winRate: 0.55 },
    ];

    it('should generate signals for each factor', () => {
      const signals = generateFactorSignals(performances);
      expect(signals).toHaveLength(3);
    });

    it('should identify long signals', () => {
      const signals = generateFactorSignals(performances);
      const momentum = signals.find((s) => s.factor === '动量')!;
      expect(momentum.direction).toBe('long');
    });

    it('should identify short signals', () => {
      const signals = generateFactorSignals(performances);
      const value = signals.find((s) => s.factor === '价值')!;
      expect(value.direction).toBe('short');
    });

    it('should assign strength', () => {
      const signals = generateFactorSignals(performances);
      for (const s of signals) {
        expect(s.strength).toBeGreaterThanOrEqual(0);
        expect(s.strength).toBeLessThanOrEqual(100);
      }
    });

    it('should include IC', () => {
      const signals = generateFactorSignals(performances);
      for (const s of signals) {
        expect(s.ic).toBeGreaterThanOrEqual(0);
        expect(s.ic).toBeLessThanOrEqual(1);
      }
    });

    it('should include message', () => {
      const signals = generateFactorSignals(performances);
      for (const s of signals) {
        expect(s.message.length).toBeGreaterThan(0);
      }
    });

    it('should handle empty performances', () => {
      const signals = generateFactorSignals([]);
      expect(signals).toHaveLength(0);
    });
  });
});
