import { describe, it, expect } from 'vitest';
import {
  detectMomentumRegime,
  detectVolatilityRegime,
  detectVolumeRegime,
  detectTrendStrength,
  detectMeanReversion,
  detectMarketState,
  detectRegimeTransitions,
  analyzeMarketCycle,
  calculateRegimeProbability,
  type MarketState,
} from '../utils/marketRegimeDetector';

describe('MarketRegimeDetector', () => {
  const bullPrices = Array.from({ length: 100 }, (_, i) => 100 + i * 0.5 + Math.sin(i / 5) * 2);
  const bearPrices = Array.from({ length: 100 }, (_, i) => 150 - i * 0.5 + Math.sin(i / 5) * 2);
  const sidewaysPrices = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 3) * 5);
  
  const bullReturns = bullPrices.slice(1).map((p, i) => (p - bullPrices[i]) / bullPrices[i]);
  const bearReturns = bearPrices.slice(1).map((p, i) => (p - bearPrices[i]) / bearPrices[i]);
  
  const volumes = Array.from({ length: 100 }, () => 1000000 + Math.random() * 500000);
  const bullVolumes = Array.from({ length: 100 }, (_, i) => 1000000 + i * 10000);

  describe('detectMomentumRegime', () => {
    it('should detect bullish momentum', () => {
      const result = detectMomentumRegime(bullPrices);
      expect(result.name).toBe('动量趋势');
      expect(result.signal).toBe('bullish');
    });

    it('should detect bearish momentum', () => {
      const result = detectMomentumRegime(bearPrices);
      expect(result.signal).toBe('bearish');
    });

    it('should return neutral for insufficient data', () => {
      const result = detectMomentumRegime([1, 2, 3]);
      expect(result.signal).toBe('neutral');
      expect(result.weight).toBe(0.25);
    });

    it('should use custom windows', () => {
      const result = detectMomentumRegime(bullPrices, 10, 30);
      expect(typeof result.value).toBe('number');
    });
  });

  describe('detectVolatilityRegime', () => {
    it('should detect low volatility regime', () => {
      const lowVolReturns = Array.from({ length: 50 }, (_, i) => 0.001 + (i % 5) * 0.0001);
      const result = detectVolatilityRegime(lowVolReturns);
      expect(['bullish', 'neutral']).toContain(result.signal);
    });

    it('should detect high volatility regime', () => {
      const highVolReturns = Array.from({ length: 50 }, (_, i) => i % 2 === 0 ? 0.05 : -0.05);
      const result = detectVolatilityRegime(highVolReturns);
      expect(['bearish', 'neutral']).toContain(result.signal);
    });

    it('should return neutral for insufficient data', () => {
      expect(detectVolatilityRegime([0.01, 0.02]).signal).toBe('neutral');
    });

    it('should have weight of 0.2', () => {
      expect(detectVolatilityRegime(bullReturns).weight).toBe(0.2);
    });
  });

  describe('detectVolumeRegime', () => {
    it('should detect bullish volume pattern', () => {
      const result = detectVolumeRegime(bullVolumes, bullPrices);
      expect(result.name).toBe('量价关系');
    });

    it('should return neutral for insufficient data', () => {
      expect(detectVolumeRegime([1], [1]).signal).toBe('neutral');
    });

    it('should have weight of 0.15', () => {
      const result = detectVolumeRegime(volumes, sidewaysPrices);
      expect(result.weight).toBe(0.15);
    });
  });

  describe('detectTrendStrength', () => {
    it('should detect strong uptrend', () => {
      const result = detectTrendStrength(bullPrices);
      expect(result.name).toBe('趋势强度');
    });

    it('should return neutral for insufficient data', () => {
      expect(detectTrendStrength([1, 2, 3]).signal).toBe('neutral');
    });

    it('should use custom period', () => {
      const result = detectTrendStrength(bullPrices, 7);
      expect(typeof result.value).toBe('number');
    });
  });

  describe('detectMeanReversion', () => {
    it('should detect oversold condition', () => {
      const oversold = Array.from({ length: 80 }, (_, i) => 100 - i * 0.5);
      const result = detectMeanReversion(oversold);
      expect(result.signal).toBe('bullish');
    });

    it('should detect overbought condition', () => {
      const overbought = Array.from({ length: 80 }, (_, i) => 50 + i * 0.8);
      const result = detectMeanReversion(overbought);
      expect(result.signal).toBe('bearish');
    });

    it('should return neutral for insufficient data', () => {
      expect(detectMeanReversion([1, 2, 3]).signal).toBe('neutral');
    });
  });

  describe('detectMarketState', () => {
    it('should detect bull market', () => {
      const state = detectMarketState(bullPrices, bullReturns, volumes);
      expect(['bull', 'turning_up']).toContain(state.regime);
    });

    it('should detect bear market', () => {
      const state = detectMarketState(bearPrices, bearReturns, volumes);
      expect(['bear', 'turning_down']).toContain(state.regime);
    });

    it('should include confidence score', () => {
      const state = detectMarketState(bullPrices, bullReturns, volumes);
      expect(state.confidence).toBeGreaterThanOrEqual(0);
      expect(state.confidence).toBeLessThanOrEqual(1);
    });

    it('should include all indicators', () => {
      const state = detectMarketState(bullPrices, bullReturns, volumes);
      expect(state.indicators.length).toBe(5);
    });

    it('should include duration', () => {
      const state = detectMarketState(bullPrices, bullReturns, volumes);
      expect(state.duration).toBeGreaterThanOrEqual(1);
    });

    it('should return valid regime values', () => {
      const state = detectMarketState(sidewaysPrices, bullReturns, volumes);
      expect(['bull', 'bear', 'sideways', 'turning_up', 'turning_down']).toContain(state.regime);
    });
  });

  describe('detectRegimeTransitions', () => {
    it('should detect transitions', () => {
      // Create a price series that transitions from bull to bear
      const transitionPrices = [
        ...Array.from({ length: 50 }, (_, i) => 100 + i),
        ...Array.from({ length: 50 }, (_, i) => 150 - i),
      ];
      const transitionReturns = transitionPrices.slice(1).map((p, i) => (p - transitionPrices[i]) / transitionPrices[i]);
      const transitionVolumes = Array.from({ length: 100 }, () => 1000000);
      const transitions = detectRegimeTransitions(transitionPrices, transitionReturns, transitionVolumes);
      expect(Array.isArray(transitions)).toBe(true);
    });

    it('should return empty for insufficient data', () => {
      expect(detectRegimeTransitions([1, 2], [0.5], [1000])).toEqual([]);
    });

    it('should include confidence in transitions', () => {
      const transitions = detectRegimeTransitions(bullPrices, bullReturns, volumes);
      for (const t of transitions) {
        expect(t.confidence).toBeGreaterThanOrEqual(0);
        expect(t.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should include trigger information', () => {
      const transitions = detectRegimeTransitions(bullPrices, bullReturns, volumes);
      for (const t of transitions) {
        expect(typeof t.trigger).toBe('string');
      }
    });
  });

  describe('analyzeMarketCycle', () => {
    it('should identify phases', () => {
      const cycle = analyzeMarketCycle(bullReturns);
      expect(cycle.phases.length).toBeGreaterThan(0);
    });

    it('should calculate average durations', () => {
      const cycle = analyzeMarketCycle(bearReturns);
      expect(typeof cycle.avgBullDuration).toBe('number');
      expect(typeof cycle.avgBearDuration).toBe('number');
    });

    it('should calculate returns for bull and bear phases', () => {
      const mixedReturns = [...Array(30).fill(0.01), ...Array(30).fill(-0.01), ...Array(30).fill(0.01)];
      const cycle = analyzeMarketCycle(mixedReturns);
      expect(typeof cycle.bullReturn).toBe('number');
      expect(typeof cycle.bearReturn).toBe('number');
    });

    it('should handle empty returns', () => {
      const cycle = analyzeMarketCycle([]);
      expect(cycle.phases.length).toBeGreaterThan(0);
      expect(cycle.avgBullDuration).toBe(0);
    });
  });

  describe('calculateRegimeProbability', () => {
    const bullState: MarketState = { regime: 'bull', confidence: 0.8, duration: 10, indicators: [] };
    const bearState: MarketState = { regime: 'bear', confidence: 0.7, duration: 5, indicators: [] };
    const sideState: MarketState = { regime: 'sideways', confidence: 0.5, duration: 3, indicators: [] };

    it('should return probabilities', () => {
      const probs = calculateRegimeProbability(bullState, [bullState, bearState, sideState, bullState]);
      expect(probs.bull).toBeGreaterThanOrEqual(0);
      expect(probs.bear).toBeGreaterThanOrEqual(0);
      expect(probs.sideways).toBeGreaterThanOrEqual(0);
    });

    it('should sum to approximately 1', () => {
      const probs = calculateRegimeProbability(bullState, [bullState, bearState, sideState]);
      expect(probs.bull + probs.bear + probs.sideways).toBeCloseTo(1, 1);
    });

    it('should return uniform for empty history', () => {
      const probs = calculateRegimeProbability(bullState, []);
      expect(probs.bull).toBeCloseTo(0.33, 1);
      expect(probs.bear).toBeCloseTo(0.33, 1);
      expect(probs.sideways).toBeCloseTo(0.34, 1);
    });
  });
});
