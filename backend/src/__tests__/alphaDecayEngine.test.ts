import { describe, it, expect } from 'vitest';
import { AlphaDecayEngine } from '../services/alphaDecayEngine';

describe('AlphaDecayEngine', () => {
  const engine = new AlphaDecayEngine();

  const makeSignals = (n: number, decayRate: number = 0.1) => 
    Array.from({ length: n }, (_, i) => ({
      timestamp: Date.now() + i * 86400000,
      value: 0.1 * Math.exp(-decayRate * i),
      decayRate,
    }));

  describe('calculateHalfLife', () => {
    it('should return positive half-life', () => {
      const signals = makeSignals(20);
      const result = engine.calculateHalfLife(signals);
      expect(result.halfLife).toBeGreaterThan(0);
    });

    it('should return decay constant', () => {
      const signals = makeSignals(20);
      const result = engine.calculateHalfLife(signals);
      expect(result.decayConstant).toBeGreaterThan(0);
    });

    it('should project future alpha', () => {
      const signals = makeSignals(20);
      const result = engine.calculateHalfLife(signals);
      expect(result.projectedAlpha.length).toBe(5);
    });

    it('should handle insufficient data', () => {
      const result = engine.calculateHalfLife([{ timestamp: 0, value: 1, decayRate: 0 }]);
      expect(result.halfLife).toBe(0);
    });

    it('confidence should be in [0,1]', () => {
      const signals = makeSignals(10);
      const result = engine.calculateHalfLife(signals);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('fitDecayCurve', () => {
    it('should fit exponential decay', () => {
      const signals = makeSignals(30);
      const result = engine.fitDecayCurve(signals);
      expect(result.fitted.length).toBe(30);
      expect(result.rSquared).toBeGreaterThan(0.5);
    });

    it('should handle empty signals', () => {
      const result = engine.fitDecayCurve([]);
      expect(result.fitted.length).toBe(0);
    });
  });

  describe('estimateDecayRate', () => {
    it('should return positive decay rate', () => {
      const signals = makeSignals(20, 0.15);
      const rate = engine.estimateDecayRate(signals);
      expect(rate).toBeGreaterThan(0);
    });
  });
});
