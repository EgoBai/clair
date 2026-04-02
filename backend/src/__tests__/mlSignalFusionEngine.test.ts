import { describe, it, expect } from 'vitest';
import { MLSignalFusionEngine, Signal } from '../services/mlSignalFusionEngine';

const engine = new MLSignalFusionEngine();

function makeSignal(name: string, value: number, confidence: number = 0.8, category: Signal['category'] = 'technical'): Signal {
  return { name, value, confidence, timestamp: Date.now(), category };
}

describe('MLSignalFusionEngine', () => {
  describe('weightedFusion', () => {
    it('should return neutral for empty signals', () => {
      const result = engine.weightedFusion([]);
      expect(result.direction).toBe('neutral');
      expect(result.value).toBe(0);
      expect(result.confidence).toBe(0);
      expect(result.contributors).toEqual([]);
    });

    it('should fuse multiple bullish signals', () => {
      const signals = [
        makeSignal('RSI', 0.8, 0.9),
        makeSignal('MACD', 0.6, 0.7),
        makeSignal('Volume', 0.4, 0.8),
      ];
      const result = engine.weightedFusion(signals);
      expect(result.value).toBeGreaterThan(0);
      expect(result.direction).toBe('long');
      expect(result.agreement).toBe(1);
    });

    it('should detect disagreement in mixed signals', () => {
      const signals = [
        makeSignal('RSI', 0.8, 0.9),
        makeSignal('MACD', -0.6, 0.7),
      ];
      const result = engine.weightedFusion(signals);
      expect(result.agreement).toBeLessThan(1);
    });

    it('should apply custom weights', () => {
      const signals = [
        makeSignal('RSI', 1, 1),
        makeSignal('MACD', -1, 1),
      ];
      const weights = new Map([['RSI', 10], ['MACD', 1]]);
      const result = engine.weightedFusion(signals, weights);
      expect(result.value).toBeGreaterThan(0); // RSI dominates
    });

    it('should sum contributions to 1', () => {
      const signals = [
        makeSignal('A', 0.5, 0.8),
        makeSignal('B', 0.3, 0.6),
        makeSignal('C', -0.2, 0.7),
      ];
      const result = engine.weightedFusion(signals);
      const totalContrib = result.contributors.reduce((s, c) => s + c.contribution, 0);
      expect(totalContrib).toBeCloseTo(1, 2);
    });

    it('should return direction neutral for small values', () => {
      const signals = [
        makeSignal('A', 0.05, 0.5),
        makeSignal('B', -0.03, 0.3),
      ];
      const result = engine.weightedFusion(signals);
      expect(result.direction).toBe('neutral');
    });
  });

  describe('scoreSignalQuality', () => {
    it('should return zero metrics for empty input', () => {
      const result = engine.scoreSignalQuality('test', [], []);
      expect(result.accuracy).toBe(0);
      expect(result.precision).toBe(0);
      expect(result.recall).toBe(0);
    });

    it('should compute correct accuracy for perfect predictions', () => {
      const preds = [1, 1, -1, -1, 1, -1, 1, 1, -1, -1];
      const actuals = [0.5, 0.3, -0.2, -0.4, 0.1, -0.3, 0.2, 0.6, -0.1, -0.5];
      const result = engine.scoreSignalQuality('test', preds, actuals);
      expect(result.accuracy).toBe(1);
      expect(result.precision).toBe(1);
      expect(result.recall).toBe(1);
    });

    it('should compute lower accuracy for random predictions', () => {
      const preds = [1, -1, 1, -1, 1, -1, 1, -1];
      const actuals = [1, 1, 1, 1, -1, -1, -1, -1];
      const result = engine.scoreSignalQuality('test', preds, actuals);
      expect(result.accuracy).toBeLessThan(1);
    });
  });

  describe('bayesianUpdate', () => {
    it('should return valid posterior between 0 and 1', () => {
      const result = engine.bayesianUpdate(0.5, 0.8, 0.7);
      expect(result.posterior).toBeGreaterThanOrEqual(0);
      expect(result.posterior).toBeLessThanOrEqual(1);
    });

    it('should increase posterior with strong positive signal', () => {
      const prior = 0.5;
      const result = engine.bayesianUpdate(prior, 0.9, 0.8);
      expect(result.posterior).toBeGreaterThan(prior);
    });

    it('should include prior and likelihood', () => {
      const result = engine.bayesianUpdate(0.6, 0.5);
      expect(result.prior).toBe(0.6);
      expect(result.likelihood).toBeGreaterThan(0);
    });

    it('should clamp prior to [0.01, 0.99]', () => {
      const r1 = engine.bayesianUpdate(0, 0.5);
      expect(r1.prior).toBe(0.01);
      const r2 = engine.bayesianUpdate(1, 0.5);
      expect(r2.prior).toBe(0.99);
    });
  });

  describe('ensembleVote', () => {
    it('should count votes correctly for long majority', () => {
      const signals = [
        makeSignal('A', 0.5, 0.8),
        makeSignal('B', 0.6, 0.7),
        makeSignal('C', -0.2, 0.3), // below confidence threshold
      ];
      const result = engine.ensembleVote(signals);
      expect(result.majority).toBe('long');
      expect(result.longVotes).toBe(2);
    });

    it('should handle empty signals', () => {
      const result = engine.ensembleVote([]);
      expect(result.longVotes).toBe(0);
      expect(result.shortVotes).toBe(0);
      expect(result.neutralVotes).toBe(0);
      expect(result.conviction).toBe(0);
    });

    it('should return conviction between 0 and 1', () => {
      const signals = [
        makeSignal('A', 0.5, 0.8),
        makeSignal('B', -0.6, 0.7),
        makeSignal('C', 0.1, 0.4),
      ];
      const result = engine.ensembleVote(signals);
      expect(result.conviction).toBeGreaterThanOrEqual(0);
      expect(result.conviction).toBeLessThanOrEqual(1);
    });
  });

  describe('decaySignal', () => {
    it('should return original value at elapsed time 0', () => {
      const now = Date.now();
      const signal = makeSignal('A', 0.5, 0.8);
      signal.timestamp = now;
      const result = engine.decaySignal(signal, now, 3600);
      expect(result.currentValue).toBeCloseTo(0.5, 5);
      expect(result.elapsedTime).toBe(0);
    });

    it('should decay over time', () => {
      const now = Date.now();
      const signal = makeSignal('A', 1, 0.8);
      signal.timestamp = now - 3600000; // 1 hour ago
      const result = engine.decaySignal(signal, now, 3600);
      expect(result.currentValue).toBeCloseTo(0.5, 1); // half-life = 1hr
    });

    it('should have correct structure', () => {
      const now = Date.now();
      const signal = makeSignal('A', 0.5, 0.8);
      signal.timestamp = now;
      const result = engine.decaySignal(signal, now + 1000);
      expect(result).toHaveProperty('originalValue');
      expect(result).toHaveProperty('currentValue');
      expect(result).toHaveProperty('halfLife');
      expect(result).toHaveProperty('elapsedTime');
      expect(result).toHaveProperty('decayedConfidence');
    });
  });

  describe('detectConflicts', () => {
    it('should detect conflicts between opposing signals', () => {
      const signals = [
        makeSignal('A', 0.8, 0.9),
        makeSignal('B', -0.7, 0.8),
      ];
      const result = engine.detectConflicts(signals);
      expect(result.conflicts.length).toBe(1);
      expect(result.overallCoherence).toBe(0);
    });

    it('should not detect conflicts for aligned signals', () => {
      const signals = [
        makeSignal('A', 0.8, 0.9),
        makeSignal('B', 0.6, 0.7),
      ];
      const result = engine.detectConflicts(signals);
      expect(result.conflicts.length).toBe(0);
      expect(result.overallCoherence).toBe(1);
    });

    it('should return overall coherence of 1 for empty signals', () => {
      const result = engine.detectConflicts([]);
      expect(result.overallCoherence).toBe(1);
      expect(result.conflicts).toEqual([]);
    });
  });

  describe('adaptiveWeights', () => {
    it('should return default weights of 1 for all signals', () => {
      const signals = [makeSignal('A', 1), makeSignal('B', -1)];
      const weights = engine.adaptiveWeights(signals, []);
      expect(weights.get('A')).toBe(1);
      expect(weights.get('B')).toBe(1);
    });

    it('should update weights based on actual returns', () => {
      const signals = [makeSignal('A', 1), makeSignal('B', -1)];
      const returns = [0.01, 0.02, 0.01, -0.01, 0.03];
      const weights = engine.adaptiveWeights(signals, returns, 0.1);
      // Signal A predicts positive, returns are mostly positive -> should get higher weight
      expect(weights.get('A')).toBeGreaterThan(0);
      expect(weights.get('B')).toBeGreaterThan(0);
    });
  });
});
