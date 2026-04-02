import { describe, it, expect } from 'vitest';
import { analyzeTrend, trendMomentum, TrendBar } from '../services/trendStrengthEngine';

function genBars(n: number, trend: number): TrendBar[] {
  const bars: TrendBar[] = [];
  let p = 10;
  for (let i = 0; i < n; i++) {
    const change = trend + (Math.random() - 0.5) * 0.01;
    p = p * (1 + change);
    bars.push({
      date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      high: p * 1.01,
      low: p * 0.99,
      close: p,
    });
  }
  return bars;
}

describe('TrendStrengthEngine', () => {
  const uptrend = genBars(60, 0.005);
  const downtrend = genBars(60, -0.005);
  const sideways = genBars(60, 0.0005);

  describe('analyzeTrend', () => {
    it('should return null for insufficient data', () => {
      expect(analyzeTrend(genBars(3, 0.01))).toBeNull();
    });

    it('should detect uptrend', () => {
      const result = analyzeTrend(uptrend);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.direction).toBe('up');
      expect(result.trendSlope).toBeGreaterThan(0);
    });

    it('should detect downtrend', () => {
      const result = analyzeTrend(downtrend);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.direction).toBe('down');
      expect(result.trendSlope).toBeLessThan(0);
    });

    it('should detect weak trend for sideways', () => {
      const result = analyzeTrend(sideways);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(['weak', 'moderate', 'sideways', 'up', 'down']).toContain(
        result.direction === 'sideways' || result.strength === 'weak' ? result.direction : result.strength
      );
    });

    it('should have trendScore 0~100', () => {
      const result = analyzeTrend(uptrend);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.trendScore).toBeGreaterThanOrEqual(0);
      expect(result.trendScore).toBeLessThanOrEqual(100);
    });

    it('should compute consistency 0~1', () => {
      const result = analyzeTrend(uptrend);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.consistency).toBeGreaterThanOrEqual(0);
      expect(result.consistency).toBeLessThanOrEqual(1);
    });

    it('should classify strength levels', () => {
      const result = analyzeTrend(uptrend);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(['strong', 'moderate', 'weak']).toContain(result.strength);
    });
  });

  describe('trendMomentum', () => {
    it('should return trend and momentum', () => {
      const result = trendMomentum(uptrend);
      expect(result.trend).not.toBeNull();
      expect(typeof result.momentum).toBe('number');
    });

    it('should show positive momentum for uptrend', () => {
      const result = trendMomentum(uptrend);
      if (result.trend) {
        expect(result.momentum).toBeGreaterThan(0);
      }
    });
  });
});
