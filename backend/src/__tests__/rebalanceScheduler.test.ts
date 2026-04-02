import { describe, it, expect } from 'vitest';
import { evaluateRebalance, RebalanceSignal } from '../services/rebalanceScheduler';

function makeSignal(overrides: Partial<RebalanceSignal> = {}): RebalanceSignal {
  return {
    driftScore: 0.5,
    costScore: 0.3,
    momentumScore: 0.2,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('RebalanceScheduler', () => {
  describe('evaluateRebalance', () => {
    it('should trigger rebalance when drift exceeds threshold and cost is acceptable', () => {
      const signal = makeSignal({ driftScore: 0.5, costScore: 0.3 });
      const result = evaluateRebalance(signal);
      expect(result.shouldRebalance).toBe(true);
      expect(result.reason).toContain('drift_exceeded');
      expect(result.reason).toContain('cost_acceptable');
    });

    it('should not trigger when drift is below threshold', () => {
      const signal = makeSignal({ driftScore: 0.1, costScore: 0.3 });
      const result = evaluateRebalance(signal);
      expect(result.shouldRebalance).toBe(false);
    });

    it('should not trigger when cost is too high', () => {
      const signal = makeSignal({ driftScore: 0.5, costScore: 150 }); // > costBudget * 200
      const result = evaluateRebalance(signal);
      expect(result.shouldRebalance).toBe(false);
    });

    it('should set urgency high for composite score > 0.7', () => {
      const signal = makeSignal({ driftScore: 0.9, costScore: 0.1, momentumScore: 0.8 });
      const result = evaluateRebalance(signal);
      expect(result.urgency).toBe('high');
      expect(result.nextCheckMs).toBe(60000);
    });

    it('should set urgency medium for composite score 0.4-0.7', () => {
      const signal = makeSignal({ driftScore: 0.5, costScore: 0.3, momentumScore: 0.1 });
      const result = evaluateRebalance(signal);
      expect(result.urgency).toBe('medium');
      expect(result.nextCheckMs).toBe(300000);
    });

    it('should set urgency low for composite score < 0.4', () => {
      const signal = makeSignal({ driftScore: 0.2, costScore: 50, momentumScore: 0 });
      const result = evaluateRebalance(signal, 0.5, 0.001);
      expect(result.urgency).toBe('low');
      expect(result.nextCheckMs).toBe(900000);
    });

    it('should include momentum_shift in reason when |momentum| > 0.5', () => {
      const signal = makeSignal({ driftScore: 0.5, costScore: 0.3, momentumScore: 0.7 });
      const result = evaluateRebalance(signal);
      expect(result.reason).toContain('momentum_shift');
    });

    it('should return no_trigger when no conditions met', () => {
      const signal = makeSignal({ driftScore: 0.1, costScore: 50, momentumScore: 0 });
      const result = evaluateRebalance(signal, 0.5, 0.001);
      expect(result.reason).toBe('no_trigger');
    });

    it('should respect custom thresholds', () => {
      const signal = makeSignal({ driftScore: 0.4, costScore: 0.5 });
      // With higher drift threshold, should not trigger
      const result = evaluateRebalance(signal, 0.5, 0.005);
      expect(result.shouldRebalance).toBe(false);
    });

    it('should round score to 2 decimal places', () => {
      const signal = makeSignal({ driftScore: 0.333, costScore: 0.111, momentumScore: 0.222 });
      const result = evaluateRebalance(signal);
      const str = result.score.toString();
      if (str.includes('.')) {
        expect(str.split('.')[1].length).toBeLessThanOrEqual(2);
      }
    });
  });
});
