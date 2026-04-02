import { describe, it, expect } from 'vitest';
import { computeVolumeProfile, volumeProfileSupportResistance, VolumeBar } from '../services/volumeProfileEngine';

function genBars(n: number, center: number, spread: number): VolumeBar[] {
  const bars: VolumeBar[] = [];
  for (let i = 0; i < n; i++) {
    bars.push({
      price: center + (Math.sin(i * 0.2) * spread),
      volume: 1000 + Math.random() * 5000,
    });
  }
  return bars;
}

describe('VolumeProfileEngine', () => {
  const bars = genBars(200, 50, 5);
  const trendingBars = Array.from({ length: 200 }, (_, i) => ({
    price: 50 + i * 0.1,
    volume: 1000 + Math.random() * 3000 + (i > 150 ? 5000 : 0),
  }));

  describe('computeVolumeProfile', () => {
    it('should return null for insufficient data', () => {
      expect(computeVolumeProfile([{ price: 10, volume: 100 }])).toBeNull();
    });

    it('should compute POC, VAH, VAL', () => {
      const result = computeVolumeProfile(bars);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.poc).toBeGreaterThan(0);
      expect(result.vah).toBeGreaterThanOrEqual(result.poc);
      expect(result.val).toBeLessThanOrEqual(result.poc);
      expect(result.totalVolume).toBeGreaterThan(0);
    });

    it('should have bins with percent summing to ~1', () => {
      const result = computeVolumeProfile(bars);
      expect(result).not.toBeNull();
      if (!result) return;
      const totalPercent = result.profileBins.reduce((s, b) => s + b.percent, 0);
      expect(totalPercent).toBeCloseTo(1, 1);
    });

    it('should compute buy/sell ratio', () => {
      const result = computeVolumeProfile(bars);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.buySellRatio).toBeGreaterThan(0);
      expect(result.buyVolume + result.sellVolume).toBeGreaterThan(0);
    });

    it('should classify profile type', () => {
      const result = computeVolumeProfile(bars);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(['balanced', 'double_distribution', 'trend_up', 'trend_down', 'p_shape', 'b_shape']).toContain(result.profileType);
    });

    it('should apply custom bin size', () => {
      const result = computeVolumeProfile(bars, { binSize: 1.0 });
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.profileBins.length).toBeGreaterThan(0);
    });
  });

  describe('volumeProfileSupportResistance', () => {
    it('should return supports and resistances', () => {
      const profile = computeVolumeProfile(trendingBars);
      expect(profile).not.toBeNull();
      if (!profile) return;
      const { supports, resistances } = volumeProfileSupportResistance(profile);
      expect(Array.isArray(supports)).toBe(true);
      expect(Array.isArray(resistances)).toBe(true);
      supports.forEach(s => expect(s).toBeLessThan(profile.poc));
      resistances.forEach(r => expect(r).toBeGreaterThan(profile.poc));
    });
  });
});
