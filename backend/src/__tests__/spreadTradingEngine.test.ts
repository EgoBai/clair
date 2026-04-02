import { describe, it, expect } from 'vitest';
import { SpreadTradingEngine } from '../services/spreadTradingEngine';

describe('SpreadTradingEngine', () => {
  const engine = new SpreadTradingEngine();
  const makeData = (n: number, bias: number = 0) =>
    Array.from({ length: n }, (_, i) => ({
      timestamp: Date.now() + i * 3600000,
      price1: 100 + Math.sin(i * 0.1) * 5 + bias,
      price2: 100 + Math.cos(i * 0.1) * 3,
    }));

  describe('analyzeSpread', () => {
    it('should return valid z-score', () => {
      const result = engine.analyzeSpread(makeData(50));
      expect(typeof result.zScore).toBe('number');
    });

    it('should detect spread signal', () => {
      const result = engine.analyzeSpread(makeData(50));
      expect(['long_spread', 'short_spread', 'neutral']).toContain(result.signal);
    });

    it('should handle insufficient data', () => {
      const result = engine.analyzeSpread(makeData(3));
      expect(result.signal).toBe('neutral');
    });

    it('confidence in [0,1]', () => {
      const result = engine.analyzeSpread(makeData(50));
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should trigger signal with extreme bias', () => {
      // Create data where last point has ratio far from mean
      const baseData = Array.from({ length: 100 }, (_, i) => ({
        timestamp: Date.now() + i * 3600000,
        price1: 100 + Math.sin(i * 0.1) * 2,
        price2: 100,
      }));
      // Last point: very high ratio
      baseData.push({ timestamp: Date.now() + 100 * 3600000, price1: 200, price2: 100 });
      const result = engine.analyzeSpread(baseData, 1.5);
      expect(result.zScore).toBeGreaterThan(1.5);
    });
  });

  describe('calculateStats', () => {
    it('should return mean and std', () => {
      const stats = engine.calculateStats(makeData(50));
      expect(stats.mean).toBeGreaterThan(0);
      expect(stats.std).toBeGreaterThan(0);
    });

    it('correlation in [-1,1]', () => {
      const stats = engine.calculateStats(makeData(50));
      expect(stats.correlation).toBeGreaterThanOrEqual(-1);
      expect(stats.correlation).toBeLessThanOrEqual(1);
    });

    it('minRatio <= maxRatio', () => {
      const stats = engine.calculateStats(makeData(50));
      expect(stats.minRatio).toBeLessThanOrEqual(stats.maxRatio);
    });
  });
});
