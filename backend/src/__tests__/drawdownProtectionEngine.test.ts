import { describe, it, expect } from 'vitest';
import { computeDrawdown, calmarRatio, ulcerIndex, EquityPoint } from '../services/drawdownProtectionEngine';

function buildEquity(values: number[]): EquityPoint[] {
  return values.map((nav, i) => ({ date: `2025-01-${String(i + 1).padStart(2, '0')}`, nav }));
}

describe('DrawdownProtectionEngine', () => {
  const flatEquity = buildEquity([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  const uptrendEquity = buildEquity([1, 1.02, 1.05, 1.08, 1.12, 1.15, 1.18, 1.20, 1.22, 1.25]);
  const drawdownEquity = buildEquity([1, 1.1, 1.15, 1.1, 1.0, 0.9, 0.85, 0.9, 0.95, 1.0, 1.05]);
  const deepDrawdown = buildEquity([1, 1.1, 1.15, 1.0, 0.8, 0.7, 0.65, 0.7, 0.75, 0.8]);

  describe('computeDrawdown', () => {
    it('should return null for insufficient data', () => {
      expect(computeDrawdown([{ date: '2025-01-01', nav: 1 }])).toBeNull();
    });

    it('should return zero drawdown for flat equity', () => {
      const result = computeDrawdown(flatEquity);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.maxDrawdown).toBe(0);
      expect(result.currentDrawdown).toBe(0);
      expect(result.protectionSignal).toBe('normal');
    });

    it('should return zero drawdown for pure uptrend', () => {
      const result = computeDrawdown(uptrendEquity);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.currentDrawdown).toBe(0);
      expect(result.recoveryDays).toBeGreaterThanOrEqual(0);
    });

    it('should detect drawdown correctly', () => {
      const result = computeDrawdown(drawdownEquity);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.maxDrawdown).toBeGreaterThan(0);
      expect(result.peakNav).toBe(1.15);
      expect(result.troughNav).toBe(0.85);
      expect(result.maxDrawdown).toBeCloseTo((1.15 - 0.85) / 1.15, 2);
    });

    it('should classify protection signals', () => {
      const normal = computeDrawdown(flatEquity);
      expect(normal?.protectionSignal).toBe('normal');

      const warning = computeDrawdown(drawdownEquity);
      expect(['warning', 'critical', 'halt']).toContain(warning?.protectionSignal);

      const halt = computeDrawdown(deepDrawdown);
      expect(halt?.protectionSignal).toBe('halt');
    });

    it('should compute risk score 0~100', () => {
      const result = computeDrawdown(drawdownEquity);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
    });

    it('should apply custom thresholds', () => {
      const result = computeDrawdown(drawdownEquity, {
        warningThreshold: 0.01,
        criticalThreshold: 0.05,
        haltThreshold: 0.10,
      });
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.protectionSignal).not.toBe('normal');
    });
  });

  describe('calmarRatio', () => {
    it('should return null when maxDrawdown is zero', () => {
      expect(calmarRatio(uptrendEquity, 0.15)).toBeNull();
    });

    it('should compute calmar ratio correctly', () => {
      const result = calmarRatio(drawdownEquity, 0.20);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result).toBeGreaterThan(0);
    });
  });

  describe('ulcerIndex', () => {
    it('should return null for insufficient data', () => {
      expect(ulcerIndex([{ date: '2025-01-01', nav: 1 }])).toBeNull();
    });

    it('should return 0 for flat equity', () => {
      const result = ulcerIndex(flatEquity);
      expect(result).toBe(0);
    });

    it('should return positive value for drawdown equity', () => {
      const result = ulcerIndex(drawdownEquity);
      expect(result).not.toBeNull();
      if (result === null) return;
      expect(result).toBeGreaterThan(0);
    });
  });
});
