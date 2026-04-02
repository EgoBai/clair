import { describe, it, expect } from 'vitest';
import {
  computeSignalScore,
  decaySignal,
  adaptiveWeights,
  detectSignalConflicts,
  computeSignalAccuracy,
  filterSignals,
  aggregateMultiTimeframe,
  type SignalComponent,
  type SignalHistory,
} from '../services/strategySignalScorerEngine';

describe('strategySignalScorerEngine', () => {
  const makeComponent = (name: string, value: number, weight = 1, confidence = 0.8, recency = 1): SignalComponent =>
    ({ name, value, weight, confidence, recency });

  describe('computeSignalScore', () => {
    it('should compute composite score from components', () => {
      const components = [
        makeComponent('momentum', 0.5),
        makeComponent('meanReversion', 0.3),
        makeComponent('volume', 0.4),
      ];
      const score = computeSignalScore(components);
      expect(score.composite).toBeGreaterThan(0);
      expect(score.direction).toBe('bullish');
      expect(score.confidence).toBeGreaterThan(0);
    });

    it('should detect bearish direction', () => {
      const components = [
        makeComponent('momentum', -0.6),
        makeComponent('trend', -0.4),
      ];
      const score = computeSignalScore(components);
      expect(score.direction).toBe('bearish');
    });

    it('should return neutral for empty components', () => {
      const score = computeSignalScore([]);
      expect(score.composite).toBe(0);
      expect(score.direction).toBe('neutral');
      expect(score.strength).toBe('weak');
    });

    it('should measure agreement', () => {
      const agree = [
        makeComponent('a', 0.5),
        makeComponent('b', 0.3),
        makeComponent('c', 0.4),
      ];
      const disagree = [
        makeComponent('a', 0.5),
        makeComponent('b', -0.4),
        makeComponent('c', 0.3),
      ];
      expect(computeSignalScore(agree).agreement).toBeGreaterThan(computeSignalScore(disagree).agreement);
    });

    it('should classify strength correctly', () => {
      expect(computeSignalScore([makeComponent('a', 0.8)]).strength).toBe('very_strong');
      expect(computeSignalScore([makeComponent('a', 0.5)]).strength).toBe('strong');
      expect(computeSignalScore([makeComponent('a', 0.25)]).strength).toBe('moderate');
      expect(computeSignalScore([makeComponent('a', 0.05)]).strength).toBe('weak');
    });
  });

  describe('decaySignal', () => {
    it('should decay signal over time', () => {
      expect(decaySignal(1, 0, 10)).toBe(1);
      expect(decaySignal(1, 10, 10)).toBeCloseTo(0.5, 4);
      expect(decaySignal(1, 20, 10)).toBeCloseTo(0.25, 4);
    });

    it('should preserve sign', () => {
      expect(decaySignal(-1, 10, 10)).toBeCloseTo(-0.5, 4);
    });
  });

  describe('adaptiveWeights', () => {
    it('should adjust weights based on accuracy', () => {
      const components = [
        { name: 'a', value: 0.5, weight: 1, confidence: 0.8, recency: 1 },
        { name: 'b', value: 0.3, weight: 1, confidence: 0.8, recency: 1 },
      ];
      const accuracy = { a: 0.9, b: 0.3 };
      const adjusted = adaptiveWeights(components, accuracy);
      expect(adjusted[0].weight).toBeGreaterThan(adjusted[1].weight);
    });
  });

  describe('detectSignalConflicts', () => {
    it('should detect conflicting signals', () => {
      const components = [
        makeComponent('a', 0.5),
        makeComponent('b', -0.4),
      ];
      const result = detectSignalConflicts(components);
      expect(result.hasConflict).toBe(true);
      expect(result.conflictingPairs).toHaveLength(1);
    });

    it('should not detect conflict for aligned signals', () => {
      const components = [
        makeComponent('a', 0.5),
        makeComponent('b', 0.3),
      ];
      expect(detectSignalConflicts(components).hasConflict).toBe(false);
    });

    it('should not detect conflict for weak signals', () => {
      const components = [
        makeComponent('a', 0.1),
        makeComponent('b', -0.1),
      ];
      expect(detectSignalConflicts(components).hasConflict).toBe(false);
    });
  });

  describe('computeSignalAccuracy', () => {
    it('should compute accuracy from history', () => {
      const history: SignalHistory[] = Array.from({ length: 20 }, (_, i) => ({
        timestamp: i,
        score: computeSignalScore([makeComponent('a', (Math.random() - 0.3) * 2)]),
        outcome: (Math.random() - 0.4) * 0.05,
      }));
      const accuracy = computeSignalAccuracy(history);
      expect(accuracy.totalSignals).toBe(20);
      expect(accuracy.accuracy).toBeGreaterThanOrEqual(0);
      expect(accuracy.accuracy).toBeLessThanOrEqual(1);
    });

    it('should handle empty history', () => {
      const accuracy = computeSignalAccuracy([]);
      expect(accuracy.totalSignals).toBe(0);
      expect(accuracy.accuracy).toBe(0);
    });

    it('should compute by-strength breakdown', () => {
      const history: SignalHistory[] = [
        { timestamp: 0, score: computeSignalScore([makeComponent('a', 0.8)]), outcome: 0.02 },
        { timestamp: 1, score: computeSignalScore([makeComponent('a', 0.1)]), outcome: -0.01 },
      ];
      const accuracy = computeSignalAccuracy(history);
      expect(accuracy.byStrength).toBeDefined();
    });
  });

  describe('filterSignals', () => {
    it('should filter low-confidence signals', () => {
      const components = [
        makeComponent('a', 0.5, 1, 0.9),
        makeComponent('b', 0.3, 1, 0.2),
      ];
      const filtered = filterSignals(components, 0.5, 0.6);
      expect(filtered.length).toBeLessThanOrEqual(components.length);
    });

    it('should return empty for low agreement', () => {
      const components = [
        makeComponent('a', 0.5, 1, 0.9),
        makeComponent('b', -0.5, 1, 0.9),
      ];
      expect(filterSignals(components, 0.5, 0.9)).toHaveLength(0);
    });
  });

  describe('aggregateMultiTimeframe', () => {
    it('should aggregate signals from multiple timeframes', () => {
      const result = aggregateMultiTimeframe([
        { timeframe: '5m', components: [makeComponent('momentum', 0.3)] },
        { timeframe: '1h', components: [makeComponent('trend', 0.5)] },
        { timeframe: '1d', components: [makeComponent('macro', 0.4)] },
      ], { '5m': 0.3, '1h': 0.5, '1d': 1.0 });

      expect(result.composite).toBeGreaterThan(0);
      expect(result.direction).toBe('bullish');
    });
  });
});
