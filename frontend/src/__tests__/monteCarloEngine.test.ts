import { describe, it, expect } from 'vitest';
import {
  generateWalkForwardWindows,
  expandingWindow,
  runMonteCarloSimulation,
  runBootstrap,
  walkForwardOptimization,
  calculateConfidenceInterval,
  permutationTest,
  simulateGeometricBrownianMotion,
} from '../utils/monteCarloEngine';

describe('generateWalkForwardWindows', () => {
  it('should generate correct number of windows', () => {
    const windows = generateWalkForwardWindows(100, 50, 10);
    expect(windows.length).toBeGreaterThan(0);
    windows.forEach(w => {
      expect(w.trainStart).toBeGreaterThanOrEqual(0);
      expect(w.trainEnd).toBeGreaterThan(w.trainStart);
      expect(w.testStart).toBe(w.trainEnd);
      expect(w.testEnd).toBeGreaterThan(w.testStart);
    });
  });

  it('should return empty if not enough data', () => {
    expect(generateWalkForwardWindows(10, 50, 10).length).toBe(0);
  });

  it('should respect custom step size', () => {
    const windows = generateWalkForwardWindows(100, 50, 10, 20);
    expect(windows.length).toBeGreaterThan(0);
  });
});

describe('expandingWindow', () => {
  it('should generate expanding windows', () => {
    const windows = expandingWindow(100, 30, 10);
    expect(windows.length).toBeGreaterThan(0);
    windows.forEach(w => {
      expect(w.trainStart).toBe(0);
      expect(w.trainSize).toBe(w.trainEnd);
    });
  });

  it('should increase train size across windows', () => {
    const windows = expandingWindow(100, 30, 10);
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i].trainEnd).toBeGreaterThan(windows[i - 1].trainEnd);
    }
  });
});

describe('runMonteCarloSimulation', () => {
  it('should generate correct number of paths', () => {
    const result = runMonteCarloSimulation({
      simulations: 100,
      timeSteps: 50,
      initialValue: 100,
      drift: 0.05,
      volatility: 0.2,
      seed: 42,
    });
    expect(result.paths.length).toBe(100);
    expect(result.paths[0].length).toBe(51); // initial + steps
    expect(result.finalValues.length).toBe(100);
  });

  it('should calculate percentiles', () => {
    const result = runMonteCarloSimulation({
      simulations: 1000,
      timeSteps: 50,
      initialValue: 100,
      drift: 0.05,
      volatility: 0.2,
      seed: 42,
    });
    expect(result.percentiles[50]).toBeDefined();
    expect(result.percentiles[5]).toBeLessThan(result.percentiles[95]);
  });

  it('should calculate VaR', () => {
    const result = runMonteCarloSimulation({
      simulations: 1000,
      timeSteps: 50,
      initialValue: 100,
      drift: 0.05,
      volatility: 0.2,
      seed: 42,
    });
    expect(result.var95).toBeGreaterThan(0);
    expect(result.var99).toBeGreaterThan(result.var95);
  });

  it('should be reproducible with seed', () => {
    const config = { simulations: 10, timeSteps: 10, initialValue: 100, drift: 0.05, volatility: 0.2, seed: 42 };
    const r1 = runMonteCarloSimulation(config);
    const r2 = runMonteCarloSimulation(config);
    expect(r1.finalValues).toEqual(r2.finalValues);
  });
});

describe('runBootstrap', () => {
  it('should bootstrap a statistic', () => {
    const data = Array.from({ length: 100 }, () => Math.random());
    const result = runBootstrap(data, (s) => s.reduce((a, b) => a + b, 0) / s.length, 500);
    expect(result.originalStatistic).toBeCloseTo(0.5, 1);
    expect(result.bootstrapStd).toBeGreaterThan(0);
    expect(result.confidenceInterval[0]).toBeLessThan(result.confidenceInterval[1]);
  });

  it('should calculate p-value', () => {
    const data = Array.from({ length: 100 }, (_, i) => i * 0.01);
    const result = runBootstrap(data, (s) => s.reduce((a, b) => a + b, 0) / s.length, 500);
    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
  });
});

describe('walkForwardOptimization', () => {
  it('should run walk-forward optimization', () => {
    const data = Array.from({ length: 100 }, () => [Math.random(), Math.random()]);
    const labels = Array.from({ length: 100 }, () => Math.random() > 0.5 ? 1 : -1);
    const windows = generateWalkForwardWindows(100, 50, 10);

    const result = walkForwardOptimization(
      data, labels,
      (trainData) => trainData[0], // Simple "optimizer"
      (params, testData) => Math.random(), // Random "evaluator"
      windows
    );

    expect(result.windows).toEqual(windows);
    expect(typeof result.robustness).toBe('number');
    expect(typeof result.overfitting).toBe('number');
  });
});

describe('calculateConfidenceInterval', () => {
  it('should calculate 95% CI', () => {
    const data = Array.from({ length: 1000 }, () => Math.random());
    const ci = calculateConfidenceInterval(data, 0.95);
    expect(ci.mean).toBeCloseTo(0.5, 0);
    expect(ci.lower).toBeLessThan(ci.mean);
    expect(ci.upper).toBeGreaterThan(ci.mean);
  });

  it('should calculate 99% CI', () => {
    const data = Array.from({ length: 100 }, () => Math.random());
    const ci95 = calculateConfidenceInterval(data, 0.95);
    const ci99 = calculateConfidenceInterval(data, 0.99);
    expect(ci99.lower).toBeLessThan(ci95.lower);
    expect(ci99.upper).toBeGreaterThan(ci95.upper);
  });
});

describe('permutationTest', () => {
  it('should detect significant difference', () => {
    const sample1 = Array.from({ length: 50 }, () => Math.random() + 1);
    const sample2 = Array.from({ length: 50 }, () => Math.random());
    const result = permutationTest(sample1, sample2, 500);
    expect(result.observedDiff).toBeGreaterThan(0);
    expect(result.pValue).toBeLessThan(0.05);
  });

  it('should not detect difference for similar samples', () => {
    // Use fixed seed-like approach: identical distributions
    const base = Array.from({ length: 50 }, (_, i) => i * 0.02);
    const sample1 = base.map(v => v + 0.001); // tiny offset
    const sample2 = base.map(v => v - 0.001);
    const result = permutationTest(sample1, sample2, 1000);
    expect(result.pValue).toBeGreaterThan(0.01); // relax threshold for flakiness
  });
});

describe('simulateGeometricBrownianMotion', () => {
  it('should generate paths', () => {
    const paths = simulateGeometricBrownianMotion(100, 0.05, 0.2, 1, 252, 100, 42);
    expect(paths.length).toBe(100);
    expect(paths[0].length).toBe(253);
    expect(paths[0][0]).toBe(100);
  });

  it('should be reproducible', () => {
    const p1 = simulateGeometricBrownianMotion(100, 0.05, 0.2, 1, 10, 5, 42);
    const p2 = simulateGeometricBrownianMotion(100, 0.05, 0.2, 1, 10, 5, 42);
    expect(p1).toEqual(p2);
  });
});
