import { describe, it, expect } from 'vitest';
import { KellyCriterionEngine } from '../services/kellyCriterionEngine';

describe('KellyCriterionEngine', () => {
  const engine = new KellyCriterionEngine();

  describe('calculateKelly', () => {
    it('positive kelly for favorable odds', () => {
      const result = engine.calculateKelly(0.6, 0.03, 0.02);
      expect(result.fullKelly).toBeGreaterThan(0);
    });

    it('zero for 50/50 with equal odds', () => {
      const result = engine.calculateKelly(0.5, 0.02, 0.02);
      expect(result.fullKelly).toBe(0);
    });

    it('halfKelly is half of fullKelly', () => {
      const result = engine.calculateKelly(0.6, 0.03, 0.02);
      expect(result.halfKelly).toBeCloseTo(result.fullKelly * 0.5, 4);
    });

    it('handles zero avgLoss', () => {
      const result = engine.calculateKelly(0.6, 0.03, 0);
      expect(result.fullKelly).toBe(0);
    });

    it('clamps invalid winRate', () => {
      const over = engine.calculateKelly(1.5, 0.03, 0.02);
      expect(over.fullKelly).toBe(0);
    });
  });

  describe('estimateFromTrades', () => {
    it('estimates from winning trades', () => {
      const trades = Array.from({ length: 20 }, (_, i) => ({
        entryPrice: 100, exitPrice: i % 3 === 0 ? 98 : 103,
        quantity: 100, timestamp: Date.now() + i,
      }));
      const result = engine.estimateFromTrades(trades);
      expect(result.winRate).toBeGreaterThan(0);
    });

    it('returns defaults for empty trades', () => {
      const result = engine.estimateFromTrades([]);
      expect(result.fullKelly).toBe(0);
    });
  });

  describe('constrainedKelly', () => {
    it('reduces kelly with tighter constraint', () => {
      const loose = engine.constrainedKelly(0.6, 0.03, 0.02, 0.5);
      const tight = engine.constrainedKelly(0.6, 0.03, 0.02, 0.1);
      expect(tight.halfKelly).toBeLessThanOrEqual(loose.halfKelly);
    });
  });

  describe('multiAssetKelly', () => {
    it('weights sum to 1', () => {
      const assets = [
        { symbol: 'A', winRate: 0.6, avgWin: 0.03, avgLoss: 0.02 },
        { symbol: 'B', winRate: 0.55, avgWin: 0.025, avgLoss: 0.02 },
      ];
      const result = engine.multiAssetKelly(assets);
      const total = Object.values(result).reduce((s, w) => s + w, 0);
      expect(total).toBeCloseTo(1, 1);
    });
  });
});
