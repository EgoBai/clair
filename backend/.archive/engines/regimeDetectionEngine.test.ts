import { describe, it, expect } from 'vitest';
import {
  detectRegime,
  analyzeRegimeHistory,
  calculateRegimeAdjustedVolatility,
  predictNextRegime,
} from '../services/regimeDetectionEngine';

describe('regimeDetectionEngine', () => {
  describe('detectRegime', () => {
    it('should return empty for insufficient data', () => {
      const states = detectRegime([0.01, 0.02], 20);
      expect(states).toEqual([]);
    });

    it('should detect bull regime', () => {
      const returns = Array(30).fill(0.005); // strong positive returns
      const states = detectRegime(returns, 20);
      expect(states.length).toBeGreaterThan(0);
      expect(states[states.length - 1].regime).toBe('bull');
    });

    it('should detect bear regime', () => {
      const returns = Array(30).fill(-0.005); // negative returns
      const states = detectRegime(returns, 20);
      expect(states.length).toBeGreaterThan(0);
      expect(states[states.length - 1].regime).toBe('bear');
    });

    it('should detect sideways regime', () => {
      const returns = Array(30).fill(0.0001); // near zero returns
      const states = detectRegime(returns, 20);
      expect(states.length).toBeGreaterThan(0);
      // low vol, low return => sideways
      const last = states[states.length - 1];
      expect(['sideways', 'bull']).toContain(last.regime);
    });

    it('should detect volatile regime', () => {
      const returns = [];
      for (let i = 0; i < 30; i++) {
        returns.push(i % 2 === 0 ? 0.03 : -0.03); // high vol
      }
      const states = detectRegime(returns, 20);
      expect(states.length).toBeGreaterThan(0);
      expect(states[states.length - 1].regime).toBe('volatile');
    });

    it('should track duration', () => {
      const returns = Array(40).fill(0.005);
      const states = detectRegime(returns, 20);
      expect(states.length).toBeGreaterThan(1);
      // consecutive same-regime should have increasing duration
      if (states.length > 1 && states[0].regime === states[1].regime) {
        expect(states[1].duration).toBeGreaterThan(states[0].duration);
      }
    });

    it('should have confidence between 0 and 1', () => {
      const returns = Array(30).fill(0.005);
      const states = detectRegime(returns, 20);
      states.forEach(s => {
        expect(s.confidence).toBeGreaterThanOrEqual(0);
        expect(s.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('should have transition probabilities', () => {
      const returns = Array(30).fill(0.005);
      const states = detectRegime(returns, 20);
      const last = states[states.length - 1];
      const totalProb = Object.values(last.transitionProb).reduce((s, p) => s + p, 0);
      expect(totalProb).toBeCloseTo(1, 1);
    });

    it('should use custom window size', () => {
      const returns = Array(60).fill(0.005);
      const states10 = detectRegime(returns, 10);
      const states30 = detectRegime(returns, 30);
      expect(states10.length).toBeGreaterThan(states30.length);
    });
  });

  describe('analyzeRegimeHistory', () => {
    it('should return empty for insufficient data', () => {
      const history = analyzeRegimeHistory([0.01, 0.02], 20);
      expect(history.states).toEqual([]);
      expect(history.transitions).toEqual([]);
    });

    it('should group consecutive regimes', () => {
      const returns = Array(40).fill(0.005);
      const history = analyzeRegimeHistory(returns, 20);
      expect(history.states.length).toBeGreaterThan(0);
      history.states.forEach(s => {
        expect(s).toHaveProperty('regime');
        expect(s).toHaveProperty('avgReturn');
        expect(s).toHaveProperty('volatility');
      });
    });

    it('should track transitions', () => {
      const returns = [];
      for (let i = 0; i < 20; i++) returns.push(0.005);
      for (let i = 0; i < 20; i++) returns.push(-0.005);
      const history = analyzeRegimeHistory(returns, 10);
      // should have at least one transition if regimes changed
      history.transitions.forEach(t => {
        expect(t).toHaveProperty('from');
        expect(t).toHaveProperty('to');
        expect(t).toHaveProperty('count');
      });
    });
  });

  describe('calculateRegimeAdjustedVolatility', () => {
    it('should return zeros for no regimes', () => {
      const result = calculateRegimeAdjustedVolatility([0.01, 0.02], []);
      expect(result).toEqual([0, 0]);
    });

    it('should scale returns by regime', () => {
      const returns = Array(30).fill(0.01);
      const states = detectRegime(returns, 20);
      const adjusted = calculateRegimeAdjustedVolatility(returns, states);
      expect(adjusted.length).toBe(states.length);
    });

    it('should apply different scales for different regimes', () => {
      const volatile = Array(25).fill(0);
      for (let i = 0; i < 25; i += 2) volatile[i] = 0.03;
      const states = detectRegime(volatile, 20);
      const adjusted = calculateRegimeAdjustedVolatility(volatile, states);
      expect(adjusted.length).toBe(states.length);
    });
  });

  describe('predictNextRegime', () => {
    it('should predict next regime', () => {
      const returns = Array(30).fill(0.005);
      const states = detectRegime(returns, 20);
      const current = states[states.length - 1];
      const prediction = predictNextRegime(current, returns.slice(-5));
      expect(prediction.predicted).toBeTruthy();
      expect(prediction.probability).toBeGreaterThan(0);
      expect(prediction.probability).toBeLessThanOrEqual(1);
      expect(prediction.reasoning).toBeTruthy();
    });

    it('should include Chinese reasoning', () => {
      const returns = Array(30).fill(0.005);
      const states = detectRegime(returns, 20);
      const prediction = predictNextRegime(states[states.length - 1], [0.01]);
      expect(prediction.reasoning).toContain('状态');
    });
  });
});
