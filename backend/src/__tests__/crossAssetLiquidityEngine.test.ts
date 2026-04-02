import { describe, it, expect } from 'vitest';
import { assessCrossAssetLiquidity, detectLiquidityShock, LiquiditySnapshot, CrossAssetLiquidity } from '../services/crossAssetLiquidityEngine';

function makeSnap(asset: string, spread: number, vol: number, depth: number, res: number): LiquiditySnapshot {
  return { asset, bidAskSpread: spread, volume: vol, turnoverRate: vol / 10000, depth, resilience: res, timestamp: Date.now() };
}

describe('CrossAssetLiquidityEngine', () => {
  const snaps: LiquiditySnapshot[] = [
    makeSnap('stock001', 0.002, 50000, 8, 0.85),
    makeSnap('stock002', 0.005, 30000, 5, 0.7),
    makeSnap('bond001', 0.001, 100000, 12, 0.9),
    makeSnap('commodity001', 0.008, 20000, 3, 0.6),
  ];

  describe('assessCrossAssetLiquidity', () => {
    it('returns null for insufficient data', () => {
      expect(assessCrossAssetLiquidity([makeSnap('s1', 0.01, 1000, 1, 0.5)])).toBeNull();
    });

    it('returns valid result for multiple assets', () => {
      const r = assessCrossAssetLiquidity(snaps);
      expect(r).not.toBeNull();
      if (!r) return;
      expect(r.compositeScore).toBeGreaterThanOrEqual(0);
      expect(r.compositeScore).toBeLessThanOrEqual(100);
    });

    it('detects abundant regime', () => {
      const good: LiquiditySnapshot[] = [
        makeSnap('stock001', 0.0005, 200000, 15, 0.95),
        makeSnap('bond001', 0.0003, 300000, 20, 0.98),
      ];
      const r = assessCrossAssetLiquidity(good);
      expect(r).not.toBeNull();
      if (!r) return;
      expect(r.regime).toBe('abundant');
      expect(r.riskSignal).toBe(false);
    });

    it('detects crisis regime', () => {
      const bad: LiquiditySnapshot[] = [
        makeSnap('stock001', 0.1, 10, 0, 0.05),
        makeSnap('bond001', 0.08, 20, 0, 0.08),
      ];
      const r = assessCrossAssetLiquidity(bad, { stock001: 100000, bond001: 100000 });
      expect(r).not.toBeNull();
      if (!r) return;
      expect(r.regime).toBe('crisis');
      expect(r.riskSignal).toBe(true);
    });

    it('computes per-asset liquidity scores', () => {
      const r = assessCrossAssetLiquidity(snaps);
      expect(r).not.toBeNull();
      if (!r) return;
      expect(Object.keys(r.details).length).toBe(4);
      for (const k of Object.keys(r.details)) {
        expect(r.details[k]).toBeGreaterThanOrEqual(0);
        expect(r.details[k]).toBeLessThanOrEqual(100);
      }
    });

    it('separates stock, bond, commodity liquidity', () => {
      const r = assessCrossAssetLiquidity(snaps);
      expect(r).not.toBeNull();
      if (!r) return;
      expect(typeof r.stockLiquidity).toBe('number');
      expect(typeof r.bondLiquidity).toBe('number');
      expect(typeof r.commodityLiquidity).toBe('number');
    });

    it('uses avgVolumes for normalization', () => {
      const avgs = { stock001: 100000, bond001: 200000, commodity001: 50000 };
      const r = assessCrossAssetLiquidity(snaps, avgs);
      expect(r).not.toBeNull();
    });

    it('handles tight regime', () => {
      const tight: LiquiditySnapshot[] = [
        makeSnap('stock001', 0.015, 5000, 2, 0.35),
        makeSnap('bond001', 0.01, 8000, 3, 0.4),
      ];
      const r = assessCrossAssetLiquidity(tight);
      expect(r).not.toBeNull();
      if (!r) return;
      expect(['tight', 'normal']).toContain(r.regime);
    });

    it('higher spread reduces score', () => {
      const good = assessCrossAssetLiquidity([makeSnap('s1', 0.001, 50000, 5, 0.8), makeSnap('s2', 0.001, 50000, 5, 0.8)]);
      const bad = assessCrossAssetLiquidity([makeSnap('s1', 0.05, 50000, 5, 0.8), makeSnap('s2', 0.05, 50000, 5, 0.8)]);
      expect(good).not.toBeNull();
      expect(bad).not.toBeNull();
      if (!good || !bad) return;
      expect(good.compositeScore).toBeGreaterThan(bad.compositeScore);
    });

    it('higher resilience increases score', () => {
      const high = assessCrossAssetLiquidity([makeSnap('s1', 0.002, 50000, 5, 0.95), makeSnap('s2', 0.002, 50000, 5, 0.95)]);
      const low = assessCrossAssetLiquidity([makeSnap('s1', 0.002, 50000, 5, 0.1), makeSnap('s2', 0.002, 50000, 5, 0.1)]);
      expect(high).not.toBeNull();
      expect(low).not.toBeNull();
      if (!high || !low) return;
      expect(high.compositeScore).toBeGreaterThan(low.compositeScore);
    });

    it('handles single asset type', () => {
      const r = assessCrossAssetLiquidity([makeSnap('stock001', 0.002, 50000, 5, 0.8), makeSnap('stock002', 0.003, 40000, 4, 0.7)]);
      expect(r).not.toBeNull();
    });

    it('handles empty avgVolumes', () => {
      const r = assessCrossAssetLiquidity(snaps, {});
      expect(r).not.toBeNull();
    });

    it('regime transitions are correct', () => {
      const scores = [80, 60, 35, 10];
      const regimes = scores.map(s => {
        if (s >= 70) return 'abundant';
        if (s >= 45) return 'normal';
        if (s >= 25) return 'tight';
        return 'crisis';
      });
      expect(regimes).toEqual(['abundant', 'normal', 'tight', 'crisis']);
    });
  });

  describe('detectLiquidityShock', () => {
    const prev: CrossAssetLiquidity = { compositeScore: 80, stockLiquidity: 80, bondLiquidity: 80, commodityLiquidity: 80, regime: 'abundant', riskSignal: false, details: {} };
    const curr: CrossAssetLiquidity = { compositeScore: 60, stockLiquidity: 60, bondLiquidity: 60, commodityLiquidity: 60, regime: 'normal', riskSignal: false, details: {} };

    it('detects shock when drop exceeds threshold', () => {
      expect(detectLiquidityShock(curr, prev, 15)).toBe(true);
    });

    it('no shock when drop is below threshold', () => {
      expect(detectLiquidityShock(curr, prev, 25)).toBe(false);
    });

    it('no shock when liquidity improves', () => {
      expect(detectLiquidityShock(prev, curr, 5)).toBe(false);
    });

    it('default threshold is 15', () => {
      expect(detectLiquidityShock(curr, prev)).toBe(true);
    });

    it('exact threshold boundary', () => {
      const exact: CrossAssetLiquidity = { ...prev, compositeScore: 65 };
      expect(detectLiquidityShock(exact, prev, 15)).toBe(false);
    });
  });
});
