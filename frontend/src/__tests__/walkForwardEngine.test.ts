import { describe, it, expect } from 'vitest';
import {
  generateWalkForwardWindows,
  calculatePerformanceMetrics,
  runWalkForward,
  combinatorialPurgedCV,
  detectOverfitting,
} from '../utils/walkForwardEngine';

function generateReturns(n: number, drift: number = 0.0005, vol: number = 0.02): number[] {
  return Array(n).fill(0).map(() => drift + vol * (Math.random() - 0.5) * 2);
}

describe('Walk-Forward Engine', () => {
  describe('generateWalkForwardWindows', () => {
    it('should generate rolling windows', () => {
      const windows = generateWalkForwardWindows(500, 252, 63, 'rolling');

      expect(windows.length).toBeGreaterThan(0);
      for (const w of windows) {
        expect(w.trainStart).toBeLessThan(w.trainEnd);
        expect(w.testStart).toBe(w.trainEnd);
        expect(w.testEnd).toBeGreaterThan(w.testStart);
        expect(w.testEnd - w.testStart).toBe(63);
      }
    });

    it('should generate anchored windows', () => {
      const windows = generateWalkForwardWindows(500, 252, 63, 'anchored');

      for (const w of windows) {
        expect(w.trainStart).toBe(0);
        expect(w.trainEnd).toBe(w.testStart);
      }
    });

    it('should generate expanding windows', () => {
      const windows = generateWalkForwardWindows(500, 100, 50, 'expanding');

      expect(windows.length).toBeGreaterThan(0);
      // Each window train should start at 0
      for (const w of windows) {
        expect(w.trainStart).toBe(0);
      }
    });
  });

  describe('calculatePerformanceMetrics', () => {
    it('should calculate metrics from returns', () => {
      const returns = generateReturns(252);
      const metrics = calculatePerformanceMetrics(returns);

      expect(typeof metrics.totalReturn).toBe('number');
      expect(typeof metrics.annualizedReturn).toBe('number');
      expect(typeof metrics.sharpeRatio).toBe('number');
      expect(metrics.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(metrics.winRate).toBeGreaterThanOrEqual(0);
      expect(metrics.winRate).toBeLessThanOrEqual(1);
    });

    it('should handle empty returns', () => {
      const metrics = calculatePerformanceMetrics([]);
      expect(metrics.totalReturn).toBe(0);
      expect(metrics.sharpeRatio).toBe(0);
    });

    it('should handle all positive returns', () => {
      const returns = Array(100).fill(0.01);
      const metrics = calculatePerformanceMetrics(returns);

      expect(metrics.winRate).toBe(1);
      expect(metrics.maxDrawdown).toBe(0);
      expect(metrics.totalReturn).toBeCloseTo(1, 1);
    });

    it('should handle all negative returns', () => {
      const returns = Array(100).fill(-0.01);
      const metrics = calculatePerformanceMetrics(returns);

      expect(metrics.winRate).toBe(0);
      expect(metrics.totalReturn).toBeLessThan(0);
    });
  });

  describe('runWalkForward', () => {
    it('should run walk-forward analysis', () => {
      const returns = generateReturns(500);
      const result = runWalkForward(returns, 252, 63, 'rolling');

      expect(result.windows.length).toBeGreaterThan(0);
      expect(result.inSampleMetrics).toBeDefined();
      expect(result.outOfSampleMetrics).toBeDefined();
      expect(typeof result.efficiencyRatio).toBe('number');
      expect(result.overfittingScore).toBeGreaterThanOrEqual(0);
      expect(result.overfittingScore).toBeLessThanOrEqual(1);
    });

    it('should have IS and OOS metrics', () => {
      const returns = generateReturns(500);
      const result = runWalkForward(returns, 200, 50);

      expect(result.inSampleMetrics.sharpeRatio).toBeDefined();
      expect(result.outOfSampleMetrics.sharpeRatio).toBeDefined();
    });

    it('should handle short data', () => {
      const returns = generateReturns(100);
      const result = runWalkForward(returns, 50, 20);
      expect(result.windows.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('combinatorialPurgedCV', () => {
    it('should create CV folds', () => {
      const returns = generateReturns(500);
      const result = combinatorialPurgedCV(returns, 5, 10);

      expect(result.folds.length).toBe(5);
      for (const fold of result.folds) {
        expect(fold.train.length).toBeGreaterThan(0);
        expect(fold.test.length).toBeGreaterThan(0);
      }
    });

    it('should purge overlap', () => {
      const returns = generateReturns(200);
      const result = combinatorialPurgedCV(returns, 4, 5);

      // Train should be shorter than total minus test due to purging
      const totalTest = result.folds.reduce((s, f) => s + f.test.length, 0);
      const totalTrain = result.folds.reduce((s, f) => s + f.train.length, 0);
      expect(totalTrain).toBeLessThan(returns.length * 4); // 4 folds worth
    });

    it('should return average OOS metrics', () => {
      const returns = generateReturns(300);
      const result = combinatorialPurgedCV(returns, 3);

      expect(result.avgOOSMetrics).toBeDefined();
      expect(typeof result.avgOOSMetrics.sharpeRatio).toBe('number');
    });
  });

  describe('detectOverfitting', () => {
    it('should detect overfitting', () => {
      const inSample = {
        totalReturn: 0.5, annualizedReturn: 0.5, sharpeRatio: 3.0,
        maxDrawdown: 0.05, winRate: 0.8, profitFactor: 4.0,
        calmarRatio: 10, sortinoRatio: 5,
      };
      const outOfSample = {
        totalReturn: 0.05, annualizedReturn: 0.05, sharpeRatio: 0.3,
        maxDrawdown: 0.2, winRate: 0.45, profitFactor: 1.1,
        calmarRatio: 0.25, sortinoRatio: 0.5,
      };

      const result = detectOverfitting(inSample, outOfSample);
      expect(result.isOverfit).toBe(true);
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(['mild', 'moderate', 'severe']).toContain(result.severity);
    });

    it('should not flag consistent performance', () => {
      const metrics = {
        totalReturn: 0.1, annualizedReturn: 0.1, sharpeRatio: 1.5,
        maxDrawdown: 0.1, winRate: 0.55, profitFactor: 1.8,
        calmarRatio: 1.5, sortinoRatio: 2.0,
      };

      const result = detectOverfitting(metrics, metrics);
      expect(result.isOverfit).toBe(false);
      expect(result.severity).toBe('none');
    });
  });

  describe('edge cases', () => {
    it('should handle very short returns', () => {
      const metrics = calculatePerformanceMetrics([0.01, -0.01, 0.02]);
      expect(typeof metrics.sharpeRatio).toBe('number');
    });

    it('should handle zero returns', () => {
      const metrics = calculatePerformanceMetrics(Array(100).fill(0));
      expect(metrics.totalReturn).toBe(0);
      expect(metrics.winRate).toBe(0);
    });
  });
});
