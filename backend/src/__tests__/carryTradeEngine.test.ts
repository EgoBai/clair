import { describe, it, expect } from 'vitest';
import { computeCarry, rankCarryAssets, CarryAsset } from '../services/carryTradeEngine';

const makeAsset = (name: string, spot: number, fund: number, lev: number, vol: number): CarryAsset =>
  ({ name, spotYield: spot, fundingCost: fund, leverage: lev, volatility: vol });

describe('CarryTradeEngine', () => {
  describe('computeCarry', () => {
    it('returns null for zero holding days', () => {
      expect(computeCarry(makeAsset('a', 0.05, 0.02, 1, 0.1), 0)).toBeNull();
    });

    it('computes positive carry', () => {
      const r = computeCarry(makeAsset('bond', 0.05, 0.02, 1, 0.08));
      expect(r).not.toBeNull();
      if (!r) return;
      expect(r.netCarry).toBeGreaterThan(0);
    });

    it('computes negative carry', () => {
      const r = computeCarry(makeAsset('bad', 0.01, 0.05, 1, 0.1));
      expect(r).not.toBeNull();
      if (!r) return;
      expect(r.netCarry).toBeLessThan(0);
    });

    it('leverage amplifies carry', () => {
      const r1 = computeCarry(makeAsset('a', 0.05, 0.02, 1, 0.1));
      const r3 = computeCarry(makeAsset('a', 0.05, 0.02, 3, 0.1));
      expect(r1).not.toBeNull();
      expect(r3).not.toBeNull();
      if (!r1 || !r3) return;
      expect(r3.netCarry).toBeGreaterThan(r1.netCarry);
    });

    it('classifies high attractiveness', () => {
      const r = computeCarry(makeAsset('good', 0.10, 0.02, 2, 0.1));
      expect(r).not.toBeNull();
      if (!r) return;
      expect(r.attractiveness).toBe('high');
    });

    it('classifies negative attractiveness', () => {
      const r = computeCarry(makeAsset('bad', 0.01, 0.05, 1, 0.1));
      expect(r).not.toBeNull();
      if (!r) return;
      expect(r.attractiveness).toBe('negative');
    });

    it('sharpe ratio uses volatility', () => {
      const lowVol = computeCarry(makeAsset('lv', 0.05, 0.02, 1, 0.02));
      const highVol = computeCarry(makeAsset('hv', 0.05, 0.02, 1, 0.2));
      expect(lowVol).not.toBeNull();
      expect(highVol).not.toBeNull();
      if (!lowVol || !highVol) return;
      expect(lowVol.sharpeRatio).toBeGreaterThan(highVol.sharpeRatio);
    });

    it('breakEvenDays is positive', () => {
      const r = computeCarry(makeAsset('a', 0.05, 0.02, 1, 0.1));
      expect(r).not.toBeNull();
      if (!r) return;
      expect(r.breakEvenDays).toBeGreaterThan(0);
    });

    it('zero volatility returns infinite sharpe', () => {
      const r = computeCarry(makeAsset('z', 0.05, 0.02, 1, 0));
      expect(r).not.toBeNull();
      if (!r) return;
      expect(r.sharpeRatio).toBe(0);
    });

    it('carryYield is percentage', () => {
      const r = computeCarry(makeAsset('a', 0.05, 0.02, 1, 0.1));
      expect(r).not.toBeNull();
      if (!r) return;
      expect(r.carryYield).toBeCloseTo(3, 1);
    });

    it('riskAdjustedCarry accounts for vol', () => {
      const low = computeCarry(makeAsset('a', 0.05, 0.02, 1, 0.05));
      const high = computeCarry(makeAsset('a', 0.05, 0.02, 1, 0.5));
      expect(low).not.toBeNull();
      expect(high).not.toBeNull();
      if (!low || !high) return;
      expect(low.riskAdjustedCarry).toBeGreaterThan(high.riskAdjustedCarry);
    });
  });

  describe('rankCarryAssets', () => {
    it('ranks assets by risk-adjusted carry', () => {
      const assets = [makeAsset('low', 0.03, 0.02, 1, 0.2), makeAsset('high', 0.08, 0.02, 1, 0.05)];
      const ranked = rankCarryAssets(assets);
      expect(ranked[0].name).toBe('high');
      expect(ranked[1].name).toBe('low');
    });

    it('handles single asset', () => {
      const ranked = rankCarryAssets([makeAsset('s', 0.05, 0.02, 1, 0.1)]);
      expect(ranked.length).toBe(1);
    });

    it('handles empty array', () => {
      expect(rankCarryAssets([])).toEqual([]);
    });

    it('returns scores as numbers', () => {
      const ranked = rankCarryAssets([makeAsset('a', 0.05, 0.02, 1, 0.1)]);
      expect(typeof ranked[0].score).toBe('number');
    });
  });
});
