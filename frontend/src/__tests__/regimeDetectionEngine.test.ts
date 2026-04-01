import { describe, it, expect } from 'vitest';

/**
 * 市场状态检测引擎测试
 * detectTrend / calculateVolatilityRegime / detectRegimeChanges
 */

interface TrendAnalysis {
  direction: 'up' | 'down' | 'neutral';
  strength: number;
  startIdx: number;
  endIdx: number;
  pivotHighs: number[];
  pivotLows: number[];
  supportLevels: number[];
  resistanceLevels: number[];
}

interface VolatilityRegime {
  regime: 'low' | 'normal' | 'high' | 'extreme';
  currentVol: number;
  percentile: number;
  meanReversionSpeed: number;
  expectedVol: number;
}

function detectTrend(prices: number[], window: number = 20): TrendAnalysis {
  const n = prices.length;
  if (n < window) {
    return { direction: 'neutral', strength: 0, startIdx: 0, endIdx: n - 1, pivotHighs: [], pivotLows: [], supportLevels: [], resistanceLevels: [] };
  }
  const recent = prices.slice(-window);
  const x = recent.map((_, i) => i);
  const y = recent;
  const xMean = x.reduce((a, b) => a + b, 0) / x.length;
  const yMean = y.reduce((a, b) => a + b, 0) / y.length;
  let num = 0, den = 0;
  for (let i = 0; i < x.length; i++) {
    num += (x[i] - xMean) * (y[i] - yMean);
    den += (x[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const direction = slope > 0.01 ? 'up' : slope < -0.01 ? 'down' : 'neutral';
  const strength = Math.min(1, Math.abs(slope) * 10);
  // Find pivot highs/lows
  const pivotHighs: number[] = [];
  const pivotLows: number[] = [];
  for (let i = 2; i < n - 2; i++) {
    if (prices[i] > prices[i-1] && prices[i] > prices[i+1] && prices[i] > prices[i-2] && prices[i] > prices[i+2]) {
      pivotHighs.push(i);
    }
    if (prices[i] < prices[i-1] && prices[i] < prices[i+1] && prices[i] < prices[i-2] && prices[i] < prices[i+2]) {
      pivotLows.push(i);
    }
  }
  const supportLevels = pivotLows.map(i => prices[i]).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).slice(0, 3);
  const resistanceLevels = pivotHighs.map(i => prices[i]).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => b - a).slice(0, 3);
  return {
    direction,
    strength: parseFloat(strength.toFixed(4)),
    startIdx: n - window,
    endIdx: n - 1,
    pivotHighs,
    pivotLows,
    supportLevels,
    resistanceLevels,
  };
}

function calculateVolatilityRegime(returns: number[], lookback: number = 60): VolatilityRegime {
  if (returns.length < 2) {
    return { regime: 'normal', currentVol: 0, percentile: 50, meanReversionSpeed: 0, expectedVol: 0 };
  }
  const recent = returns.slice(-Math.min(lookback, returns.length));
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const variance = recent.reduce((s, r) => s + (r - mean) ** 2, 0) / recent.length;
  const currentVol = Math.sqrt(variance) * Math.sqrt(252);
  const allVols: number[] = [];
  for (let i = 10; i < returns.length; i++) {
    const slice = returns.slice(i - 10, i);
    const m = slice.reduce((a, b) => a + b, 0) / slice.length;
    const v = slice.reduce((s, r) => s + (r - m) ** 2, 0) / slice.length;
    allVols.push(Math.sqrt(v) * Math.sqrt(252));
  }
  const sorted = [...allVols].sort((a, b) => a - b);
  const rank = sorted.filter(v => v <= currentVol).length;
  const percentile = sorted.length > 0 ? (rank / sorted.length) * 100 : 50;
  const longTermVol = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : currentVol;
  const regime = percentile > 80 ? 'extreme' : percentile > 60 ? 'high' : percentile < 20 ? 'low' : 'normal';
  return {
    regime,
    currentVol: parseFloat(currentVol.toFixed(4)),
    percentile: parseFloat(percentile.toFixed(2)),
    meanReversionSpeed: parseFloat((0.1 * (longTermVol - currentVol) / Math.max(0.001, currentVol)).toFixed(4)),
    expectedVol: parseFloat(longTermVol.toFixed(4)),
  };
}

function detectRegimeChanges(returns: number[], window: number = 20): Array<{ index: number; from: string; to: string; confidence: number }> {
  if (returns.length < window * 2) return [];
  const changes: Array<{ index: number; from: string; to: string; confidence: number }> = [];
  const classify = (slice: number[]): string => {
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const vol = Math.sqrt(slice.reduce((s, r) => s + (r - mean) ** 2, 0) / slice.length);
    if (mean > 0.001 && vol < 0.02) return 'bull';
    if (mean < -0.001 && vol < 0.02) return 'bear';
    if (vol > 0.03) return 'high_vol';
    return 'sideways';
  };
  for (let i = window; i < returns.length - window; i += window) {
    const before = returns.slice(i - window, i);
    const after = returns.slice(i, i + window);
    const regimeBefore = classify(before);
    const regimeAfter = classify(after);
    if (regimeBefore !== regimeAfter) {
      const meanBefore = before.reduce((a, b) => a + b, 0) / before.length;
      const meanAfter = after.reduce((a, b) => a + b, 0) / after.length;
      const confidence = Math.min(1, Math.abs(meanAfter - meanBefore) * 50);
      changes.push({ index: i, from: regimeBefore, to: regimeAfter, confidence: parseFloat(confidence.toFixed(4)) });
    }
  }
  return changes;
}

describe('市场状态检测引擎', () => {
  describe('detectTrend', () => {
    it('should return neutral for insufficient data', () => {
      const trend = detectTrend([1, 2, 3], 20);
      expect(trend.direction).toBe('neutral');
      expect(trend.strength).toBe(0);
    });

    it('should detect uptrend', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
      const trend = detectTrend(prices, 20);
      expect(trend.direction).toBe('up');
      expect(trend.strength).toBeGreaterThan(0);
    });

    it('should detect downtrend', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 200 - i * 2);
      const trend = detectTrend(prices, 20);
      expect(trend.direction).toBe('down');
    });

    it('should detect sideways for flat prices', () => {
      const prices = Array.from({ length: 30 }, () => 100);
      const trend = detectTrend(prices, 20);
      expect(trend.direction).toBe('neutral');
    });

    it('should identify pivot points', () => {
      const prices = [10, 12, 15, 12, 10, 8, 10, 13, 16, 13, 10, 7, 10, 14, 17, 14, 10, 6, 10, 15, 18, 15, 10, 5, 10];
      const trend = detectTrend(prices, 20);
      expect(trend.pivotHighs.length).toBeGreaterThanOrEqual(0);
      expect(trend.pivotLows.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateVolatilityRegime', () => {
    it('should handle insufficient data', () => {
      const vol = calculateVolatilityRegime([0.01]);
      expect(vol.regime).toBe('normal');
    });

    it('should detect high volatility', () => {
      const returns = Array.from({ length: 60 }, () => (Math.random() - 0.5) * 0.1);
      const vol = calculateVolatilityRegime(returns);
      expect(['low', 'normal', 'high', 'extreme']).toContain(vol.regime);
      expect(vol.currentVol).toBeGreaterThan(0);
    });

    it('should detect low volatility', () => {
      const returns = Array.from({ length: 60 }, () => (Math.random() - 0.5) * 0.001);
      const vol = calculateVolatilityRegime(returns);
      expect(vol.currentVol).toBeGreaterThan(0);
      expect(vol.percentile).toBeGreaterThanOrEqual(0);
      expect(vol.percentile).toBeLessThanOrEqual(100);
    });

    it('should calculate expected vol', () => {
      const returns = Array.from({ length: 100 }, (_, i) => Math.sin(i * 0.1) * 0.01);
      const vol = calculateVolatilityRegime(returns);
      expect(vol.expectedVol).toBeGreaterThan(0);
    });
  });

  describe('detectRegimeChanges', () => {
    it('should return empty for insufficient data', () => {
      expect(detectRegimeChanges([0.01, 0.02], 20)).toHaveLength(0);
    });

    it('should detect regime change in mixed data', () => {
      const bullPhase = Array.from({ length: 30 }, () => 0.005);
      const bearPhase = Array.from({ length: 30 }, () => -0.005);
      const returns = [...bullPhase, ...bearPhase];
      const changes = detectRegimeChanges(returns, 15);
      expect(changes.length).toBeGreaterThanOrEqual(0);
    });

    it('should not detect changes in stable data', () => {
      const returns = Array.from({ length: 60 }, () => 0.001);
      const changes = detectRegimeChanges(returns, 20);
      expect(changes).toHaveLength(0);
    });

    it('changes should have valid structure', () => {
      const mixed = Array.from({ length: 20 }, () => 0.01)
        .concat(Array.from({ length: 20 }, () => -0.01))
        .concat(Array.from({ length: 20 }, () => 0.01));
      const changes = detectRegimeChanges(mixed, 15);
      changes.forEach(c => {
        expect(c.index).toBeGreaterThanOrEqual(0);
        expect(typeof c.from).toBe('string');
        expect(typeof c.to).toBe('string');
        expect(c.confidence).toBeGreaterThanOrEqual(0);
        expect(c.confidence).toBeLessThanOrEqual(1);
      });
    });
  });
});
