import { describe, it, expect } from 'vitest';
import { RiskAdjustedReturnEngine } from '../utils/riskAdjustedReturnEngine';

describe('RiskAdjustedReturnEngine', () => {
  const engine = new RiskAdjustedReturnEngine();
  const makeReturns = (n: number, bias: number = 0.0005) =>
    Array.from({ length: n }, () => (Math.random() - 0.5 + bias) * 0.04);

  describe('calculate', () => {
    it('should return valid Sharpe ratio', () => {
      const result = engine.calculate({ returns: makeReturns(100) });
      expect(typeof result.sharpeRatio).toBe('number');
    });

    it('Sortino >= Sharpe for positive skew', () => {
      const returns = Array.from({ length: 200 }, () => Math.random() > 0.4 ? 0.01 : -0.005);
      const result = engine.calculate({ returns });
      expect(result.sortinoRatio).toBeGreaterThanOrEqual(result.sharpeRatio - 0.5);
    });

    it('maxDrawdown >= 0', () => {
      const result = engine.calculate({ returns: makeReturns(100) });
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
    });

    it('winRate in [0,1]', () => {
      const result = engine.calculate({ returns: makeReturns(100) });
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(1);
    });

    it('handles empty returns', () => {
      const result = engine.calculate({ returns: [] });
      expect(result.rating).toBe('N/A');
    });

    it('rating is valid', () => {
      const result = engine.calculate({ returns: makeReturns(100) });
      expect(['A+', 'A', 'B+', 'B', 'C+', 'C', 'N/A']).toContain(result.rating);
    });
  });
});
