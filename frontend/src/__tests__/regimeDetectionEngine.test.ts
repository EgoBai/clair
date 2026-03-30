import { describe, it, expect } from 'vitest';
import {
  detectTrend,
  calculateVolatilityRegime,
  simpleHMM,
  detectRegimeChanges,
  detectRegimeTransitions,
  calculateMarketBreadth,
  calculateMcClellanOscillator,
} from '../utils/regimeDetectionEngine';

const upTrend = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5);
const downTrend = Array.from({ length: 50 }, (_, i) => 150 - i * 0.5);
const sideways = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.3) * 2);
const volatile = Array.from({ length: 50 }, (_, i) => 100 + (Math.random() - 0.5) * 20);

describe('detectTrend', () => {
  it('should detect uptrend', () => {
    const trend = detectTrend(upTrend);
    expect(trend.direction).toBe('up');
    expect(trend.strength).toBeGreaterThan(0);
  });

  it('should detect downtrend', () => {
    const trend = detectTrend(downTrend);
    expect(trend.direction).toBe('down');
  });

  it('should detect neutral for sideways', () => {
    const flatSeries = Array.from({ length: 50 }, () => 100);
    const trend = detectTrend(flatSeries);
    expect(trend.direction).toBe('neutral');
  });

  it('should find pivot highs and lows', () => {
    const trend = detectTrend(sideways);
    expect(Array.isArray(trend.pivotHighs)).toBe(true);
    expect(Array.isArray(trend.pivotLows)).toBe(true);
  });

  it('should find support and resistance', () => {
    const trend = detectTrend(sideways);
    expect(Array.isArray(trend.supportLevels)).toBe(true);
    expect(Array.isArray(trend.resistanceLevels)).toBe(true);
  });

  it('should handle short series', () => {
    const trend = detectTrend([1, 2, 3]);
    expect(trend.direction).toBe('neutral');
  });
});

describe('calculateVolatilityRegime', () => {
  it('should classify volatility regime', () => {
    const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02);
    const regime = calculateVolatilityRegime(returns);
    expect(['low', 'normal', 'high', 'extreme']).toContain(regime.regime);
    expect(regime.currentVol).toBeGreaterThan(0);
    expect(regime.percentile).toBeGreaterThanOrEqual(0);
    expect(regime.percentile).toBeLessThanOrEqual(100);
  });

  it('should handle short series', () => {
    const regime = calculateVolatilityRegime([0.01, 0.02]);
    expect(regime.regime).toBe('normal');
  });
});

describe('simpleHMM', () => {
  it('should assign states', () => {
    const obs = Array.from({ length: 100 }, (_, i) => i < 50 ? Math.random() * 0.01 : 0.05 + Math.random() * 0.01);
    const hmm = simpleHMM(obs, 2);
    expect(hmm.states.length).toBe(100);
    expect(hmm.transitionMatrix.length).toBe(2);
    expect(hmm.emissionMeans.length).toBe(2);
    expect(typeof hmm.logLikelihood).toBe('number');
  });

  it('should produce valid transition matrix', () => {
    const obs = Array.from({ length: 100 }, () => Math.random());
    const hmm = simpleHMM(obs, 2);
    hmm.transitionMatrix.forEach(row => {
      const sum = row.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 1);
    });
  });
});

describe('detectRegimeChanges', () => {
  it('should detect bull regime', () => {
    const timestamps = Array.from({ length: 50 }, (_, i) => i);
    const regimes = detectRegimeChanges(upTrend, timestamps);
    expect(regimes.length).toBeGreaterThan(0);
    expect(regimes[regimes.length - 1].regime).toBe('bull');
  });

  it('should detect bear regime', () => {
    const timestamps = Array.from({ length: 50 }, (_, i) => i);
    const regimes = detectRegimeChanges(downTrend, timestamps);
    expect(regimes[regimes.length - 1].regime).toBe('bear');
  });

  it('should track duration', () => {
    const timestamps = Array.from({ length: 50 }, (_, i) => i);
    const regimes = detectRegimeChanges(upTrend, timestamps);
    const last = regimes[regimes.length - 1];
    expect(last.duration).toBeGreaterThan(0);
  });
});

describe('detectRegimeTransitions', () => {
  it('should detect transitions', () => {
    const prices = [...upTrend, ...downTrend];
    const timestamps = Array.from({ length: 100 }, (_, i) => i);
    const regimes = detectRegimeChanges(prices, timestamps);
    const transitions = detectRegimeTransitions(regimes);
    expect(transitions.length).toBeGreaterThan(0);
    transitions.forEach(t => {
      expect(t.from).toBeDefined();
      expect(t.to).toBeDefined();
      expect(t.from).not.toBe(t.to);
    });
  });
});

describe('calculateMarketBreadth', () => {
  it('should calculate breadth metrics', () => {
    const result = calculateMarketBreadth(300, 100, 50);
    expect(result.advanceDeclineRatio).toBe(3);
    expect(result.breadthPercent).toBeGreaterThan(0);
    expect(result.signal).toBe('bullish');
  });

  it('should detect bearish breadth', () => {
    const result = calculateMarketBreadth(100, 300, 50);
    expect(result.signal).toBe('bearish');
  });

  it('should detect neutral breadth', () => {
    const result = calculateMarketBreadth(200, 200, 50);
    expect(result.signal).toBe('neutral');
  });
});

describe('calculateMcClellanOscillator', () => {
  it('should calculate oscillator', () => {
    const advancing = Array.from({ length: 50 }, () => Math.floor(Math.random() * 500 + 200));
    const declining = Array.from({ length: 50 }, () => Math.floor(Math.random() * 500 + 200));
    const osc = calculateMcClellanOscillator(advancing, declining);
    expect(osc.length).toBe(50);
  });
});
