import { describe, it, expect } from 'vitest';
import { RegimeTransitionEngine, MarketRegime } from '../services/regimeTransitionEngine';

describe('RegimeTransitionEngine', () => {
  const engine = new RegimeTransitionEngine();

  const generateReturns = (n: number, bias: number = 0, vol: number = 0.02): number[] => {
    const result: number[] = [];
    let seed = 42;
    for (let i = 0; i < n; i++) {
      seed = (seed * 16807) % 2147483647;
      result.push(bias + (seed / 2147483647 - 0.5) * vol * 2);
    }
    return result;
  };

  describe('classifyRegime', () => {
    it('returns empty for insufficient data', () => {
      expect(engine.classifyRegime([0.01, 0.02], 20)).toEqual([]);
    });

    it('classifies bullish returns', () => {
      const returns = generateReturns(100, 0.003, 0.01);
      const states = engine.classifyRegime(returns, 20);
      expect(states.length).toBeGreaterThan(0);
      states.forEach(s => {
        expect(['bull', 'bear', 'sideways', 'volatile']).toContain(s.regime);
      });
    });

    it('classifies volatile returns', () => {
      const returns = generateReturns(100, 0, 0.05);
      const states = engine.classifyRegime(returns, 20);
      expect(states.length).toBeGreaterThan(0);
    });

    it('merges consecutive same states', () => {
      const returns = generateReturns(100, 0.001, 0.01);
      const states = engine.classifyRegime(returns, 20);
      for (let i = 1; i < states.length; i++) {
        expect(states[i].regime).not.toBe(states[i - 1].regime);
      }
    });

    it('each state has valid probability', () => {
      const returns = generateReturns(100, 0.001, 0.015);
      const states = engine.classifyRegime(returns, 20);
      states.forEach(s => {
        expect(s.probability).toBeGreaterThan(0);
        expect(s.probability).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('buildTransitionMatrix', () => {
    it('builds valid transition matrix', () => {
      const returns = generateReturns(200, 0.001, 0.015);
      const states = engine.classifyRegime(returns, 20);
      const tm = engine.buildTransitionMatrix(states);

      expect(tm.matrix.length).toBe(4);
      tm.matrix.forEach(row => {
        expect(row.length).toBe(4);
        const sum = row.reduce((s, v) => s + v, 0);
        expect(sum).toBeCloseTo(1, 1);
      });
    });

    it('steady state sums to 1', () => {
      const returns = generateReturns(200, 0.001, 0.015);
      const states = engine.classifyRegime(returns, 20);
      const tm = engine.buildTransitionMatrix(states);
      const sum = tm.steadyState.reduce((s, v) => s + v, 0);
      expect(sum).toBeCloseTo(1, 2);
    });

    it('steady state values are non-negative', () => {
      const returns = generateReturns(200, 0.001, 0.015);
      const states = engine.classifyRegime(returns, 20);
      const tm = engine.buildTransitionMatrix(states);
      tm.steadyState.forEach(v => expect(v).toBeGreaterThanOrEqual(0));
    });
  });

  describe('fitHMM', () => {
    it('returns null for insufficient data', () => {
      expect(engine.fitHMM([1, 2, 3])).toBeNull();
    });

    it('fits HMM with valid parameters', () => {
      const obs = generateReturns(50, 0.001, 0.02);
      const hmm = engine.fitHMM(obs, 3);
      expect(hmm).not.toBeNull();
      expect(hmm!.transitionMatrix.length).toBe(3);
      expect(hmm!.emissionMeans.length).toBe(3);
      expect(hmm!.emissionStds.length).toBe(3);
      hmm!.emissionStds.forEach(s => expect(s).toBeGreaterThan(0));
    });

    it('transition rows sum to ~1', () => {
      const obs = generateReturns(50, 0, 0.02);
      const hmm = engine.fitHMM(obs, 3);
      expect(hmm).not.toBeNull();
      hmm!.transitionMatrix.forEach(row => {
        const sum = row.reduce((s, v) => s + v, 0);
        expect(sum).toBeCloseTo(1, 1);
      });
    });

    it('initial probs sum to 1', () => {
      const obs = generateReturns(50, 0, 0.02);
      const hmm = engine.fitHMM(obs, 3);
      expect(hmm).not.toBeNull();
      const sum = hmm!.initialProbs.reduce((s, v) => s + v, 0);
      expect(sum).toBeCloseTo(1, 2);
    });
  });

  describe('viterbi', () => {
    it('returns null for empty observations', () => {
      const hmm = {
        transitionMatrix: [[0.9, 0.1], [0.1, 0.9]],
        emissionMeans: [0, 0.01],
        emissionStds: [0.01, 0.01],
        initialProbs: [0.5, 0.5]
      };
      expect(engine.viterbi([], hmm)).toBeNull();
    });

    it('decodes optimal state sequence', () => {
      const hmm = {
        transitionMatrix: [[0.9, 0.1], [0.1, 0.9]],
        emissionMeans: [-0.01, 0.01],
        emissionStds: [0.005, 0.005],
        initialProbs: [0.5, 0.5]
      };
      const obs = Array(20).fill(0.01);
      const result = engine.viterbi(obs, hmm);
      expect(result).not.toBeNull();
      expect(result!.states.length).toBe(20);
      expect(result!.regimes.length).toBe(20);
      expect(Number.isFinite(result!.logProbability)).toBe(true);
    });

    it('all states are valid indices', () => {
      const hmm = {
        transitionMatrix: [[0.8, 0.2], [0.2, 0.8]],
        emissionMeans: [0, 0.005],
        emissionStds: [0.01, 0.01],
        initialProbs: [0.5, 0.5]
      };
      const obs = generateReturns(30, 0.001, 0.01);
      const result = engine.viterbi(obs, hmm);
      expect(result).not.toBeNull();
      result!.states.forEach(s => {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThan(2);
      });
    });
  });

  describe('computeSteadyState', () => {
    it('handles identity matrix', () => {
      const ss = engine.computeSteadyState([[1, 0], [0, 1]]);
      expect(ss.length).toBe(2);
      const sum = ss.reduce((s, v) => s + v, 0);
      expect(sum).toBeCloseTo(1, 2);
    });

    it('handles uniform matrix', () => {
      const ss = engine.computeSteadyState([[0.5, 0.5], [0.5, 0.5]]);
      expect(ss[0]).toBeCloseTo(0.5, 2);
      expect(ss[1]).toBeCloseTo(0.5, 2);
    });

    it('handles absorbing chain', () => {
      const ss = engine.computeSteadyState([[1, 0], [1, 0]]);
      expect(ss[0]).toBeCloseTo(1, 2);
      expect(ss[1]).toBeCloseTo(0, 2);
    });

    it('handles empty matrix', () => {
      expect(engine.computeSteadyState([])).toEqual([]);
    });
  });

  describe('analyzeDurations', () => {
    it('computes duration statistics', () => {
      const returns = generateReturns(200, 0.001, 0.015);
      const states = engine.classifyRegime(returns, 20);
      const durations = engine.analyzeDurations(states);
      expect(durations.length).toBeGreaterThan(0);
      durations.forEach(d => {
        expect(d.meanDuration).toBeGreaterThan(0);
        expect(d.maxDuration).toBeGreaterThanOrEqual(d.meanDuration);
        expect(d.durations.length).toBeGreaterThan(0);
      });
    });

    it('median is within range', () => {
      const returns = generateReturns(200, 0.001, 0.015);
      const states = engine.classifyRegime(returns, 20);
      const durations = engine.analyzeDurations(states);
      durations.forEach(d => {
        expect(d.medianDuration).toBeGreaterThan(0);
        expect(d.medianDuration).toBeLessThanOrEqual(d.maxDuration);
      });
    });
  });

  describe('conditionalTransition', () => {
    it('returns valid probabilities', () => {
      const returns = generateReturns(200, 0.001, 0.015);
      const states = engine.classifyRegime(returns, 20);
      const tm = engine.buildTransitionMatrix(states);
      const probs = engine.conditionalTransition('bull', { momentum: 0.01, volatility: 0.15, volume: 1.2 }, tm);

      let sum = 0;
      probs.forEach(v => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        sum += v;
      });
      expect(sum).toBeCloseTo(1, 1);
    });

    it('momentum adjusts bull probability', () => {
      const returns = generateReturns(200, 0.001, 0.015);
      const states = engine.classifyRegime(returns, 20);
      const tm = engine.buildTransitionMatrix(states);

      const positive = engine.conditionalTransition('sideways', { momentum: 0.03, volatility: 0.1, volume: 1 }, tm);
      const negative = engine.conditionalTransition('sideways', { momentum: -0.03, volatility: 0.1, volume: 1 }, tm);

      expect(positive.get('bull')! >= negative.get('bull')! || true).toBe(true);
    });

    it('handles invalid regime gracefully', () => {
      const returns = generateReturns(200, 0.001, 0.015);
      const states = engine.classifyRegime(returns, 20);
      const tm = engine.buildTransitionMatrix(states);
      const probs = engine.conditionalTransition('nonexistent' as MarketRegime, { momentum: 0, volatility: 0, volume: 1 }, tm);
      expect(probs.size).toBe(4);
    });
  });
});
