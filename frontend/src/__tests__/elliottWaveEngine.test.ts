import { describe, it, expect } from 'vitest';
import {
  detectPivots,
  detectImpulseWave,
  detectCorrectiveWave,
  calculateFibonacciLevels,
  analyzeElliottWave,
  classifyWaveDegree,
  checkWaveAlternation,
  analyzeWaveChannel,
  projectNextWave,
} from '../utils/elliottWaveEngine';

describe('Elliott Wave Engine', () => {
  // Generate test price data with a clear uptrend pattern
  const uptrendPrices = [
    100, 102, 101, 105, 103, 108, 106, 112, 110, 115,
    113, 118, 116, 120, 118, 115, 113, 110, 108, 112,
    114, 118, 116, 122, 120, 125, 123, 128, 126, 130,
    128, 125, 122, 120, 118, 122, 124, 128, 126, 132,
  ];

  // Generate test price data with a zigzag pattern
  const zigzagPrices = [
    100, 105, 110, 115, 120, 125, 130, 125, 120, 115,
    110, 105, 100, 105, 110, 115, 120, 115, 110, 105,
  ];

  describe('detectPivots', () => {
    it('should detect high and low pivots', () => {
      const pivots = detectPivots(uptrendPrices, 3);
      expect(pivots.length).toBeGreaterThan(0);

      const highs = pivots.filter((p) => p.type === 'high');
      const lows = pivots.filter((p) => p.type === 'low');
      expect(highs.length).toBeGreaterThan(0);
      expect(lows.length).toBeGreaterThan(0);
    });

    it('should return pivots sorted by significance', () => {
      const pivots = detectPivots(uptrendPrices, 3);
      for (let i = 1; i < pivots.length; i++) {
        expect(pivots[i - 1].significance).toBeGreaterThanOrEqual(
          pivots[i].significance
        );
      }
    });

    it('should detect correct pivot types', () => {
      const pivots = detectPivots(uptrendPrices, 3);
      pivots.forEach((pivot) => {
        expect(['high', 'low']).toContain(pivot.type);
        expect(pivot.index).toBeGreaterThanOrEqual(0);
        expect(pivot.price).toBeGreaterThan(0);
        expect(pivot.significance).toBeGreaterThan(0);
      });
    });

    it('should handle short price arrays', () => {
      const pivots = detectPivots([100, 105, 100], 1);
      expect(Array.isArray(pivots)).toBe(true);
    });

    it('should handle flat prices', () => {
      const flatPrices = [100, 100, 100, 100, 100];
      const pivots = detectPivots(flatPrices, 1);
      expect(Array.isArray(pivots)).toBe(true);
    });
  });

  describe('detectImpulseWave', () => {
    it('should detect impulse wave patterns', () => {
      const pivots = detectPivots(uptrendPrices, 2);
      const impulse = detectImpulseWave(pivots, uptrendPrices);

      if (impulse) {
        expect(impulse.type).toBe('impulse');
        expect(impulse.confidence).toBeGreaterThan(0);
        expect(impulse.waves.length).toBe(5);
      }
    });

    it('should return null for insufficient data', () => {
      const smallPivots = [
        { index: 0, price: 100, type: 'low' as const, significance: 95 },
        { index: 1, price: 105, type: 'high' as const, significance: 95 },
      ];
      const result = detectImpulseWave(smallPivots, [100, 105]);
      expect(result).toBeNull();
    });
  });

  describe('detectCorrectiveWave', () => {
    it('should detect corrective wave patterns', () => {
      const pivots = detectPivots(zigzagPrices, 2);
      const corrective = detectCorrectiveWave(pivots, zigzagPrices);

      if (corrective) {
        expect(corrective.type).toBe('corrective');
        expect(corrective.confidence).toBeGreaterThan(0);
      }
    });

    it('should return null for insufficient pivots', () => {
      const smallPivots = [
        { index: 0, price: 100, type: 'low' as const, significance: 95 },
      ];
      const result = detectCorrectiveWave(smallPivots, [100]);
      expect(result).toBeNull();
    });
  });

  describe('calculateFibonacciLevels', () => {
    it('should calculate correct retracement levels', () => {
      const fib = calculateFibonacciLevels(120, 100);

      expect(fib.retracement[0.0]).toBe(120);
      expect(fib.retracement[1.0]).toBe(100);
      expect(fib.retracement[0.5]).toBe(110);
      expect(fib.retracement[0.382]).toBeCloseTo(112.36, 1);
      expect(fib.retracement[0.618]).toBeCloseTo(107.64, 1);
    });

    it('should calculate correct extension levels', () => {
      const fib = calculateFibonacciLevels(120, 100);

      expect(fib.extension[1.272]).toBeLessThan(100);
      expect(fib.extension[1.618]).toBeLessThan(100);
      expect(fib.extension[1.618]).toBeLessThan(fib.extension[1.272]!);
    });

    it('should calculate correct projection levels', () => {
      const fib = calculateFibonacciLevels(120, 100);

      expect(fib.projection[1.0]).toBe(140);
      expect(fib.projection[1.618]).toBeGreaterThan(140);
    });

    it('should handle small ranges', () => {
      const fib = calculateFibonacciLevels(100.5, 100);

      expect(fib.retracement[0.5]).toBeCloseTo(100.25, 2);
      expect(fib.retracement[0.0]).toBe(100.5);
      expect(fib.retracement[1.0]).toBe(100);
    });
  });

  describe('analyzeElliottWave', () => {
    it('should return a complete analysis', () => {
      const analysis = analyzeElliottWave(uptrendPrices);

      expect(analysis.pattern).toBeDefined();
      expect(analysis.fibonacci).toBeDefined();
      expect(analysis.currentWave).toBeGreaterThanOrEqual(1);
      expect(analysis.confidence).toBeGreaterThanOrEqual(0);
      expect(analysis.confidence).toBeLessThanOrEqual(1);
      expect(['up', 'down', 'uncertain']).toContain(
        analysis.nextExpectedDirection
      );
      expect(analysis.targetPrice).toBeGreaterThan(0);
      expect(analysis.stopLoss).toBeGreaterThan(0);
      expect(analysis.invalidationPrice).toBeGreaterThan(0);
    });

    it('should detect pattern type', () => {
      const analysis = analyzeElliottWave(uptrendPrices);

      expect(['impulse', 'corrective']).toContain(analysis.pattern.type);
      expect(typeof analysis.pattern.isComplete).toBe('boolean');
      expect(typeof analysis.pattern.isValid).toBe('boolean');
    });

    it('should return wave labels', () => {
      const analysis = analyzeElliottWave(uptrendPrices);

      expect(Array.isArray(analysis.waveLabels)).toBe(true);
      expect(analysis.waveLabels.length).toBeGreaterThan(0);
    });

    it('should handle flat prices', () => {
      const flatPrices = Array(30).fill(100);
      const analysis = analyzeElliottWave(flatPrices);

      expect(analysis.pattern).toBeDefined();
      expect(analysis.fibonacci).toBeDefined();
    });
  });

  describe('classifyWaveDegree', () => {
    it('should classify large price ranges correctly', () => {
      expect(classifyWaveDegree(600, 100)).toBe('grand_supercycle');
      expect(classifyWaveDegree(250, 100)).toBe('supercycle');
      expect(classifyWaveDegree(120, 100)).toBe('cycle');
      expect(classifyWaveDegree(60, 100)).toBe('primary');
      expect(classifyWaveDegree(25, 100)).toBe('intermediate');
      expect(classifyWaveDegree(12, 100)).toBe('minor');
      expect(classifyWaveDegree(6, 100)).toBe('minute');
      expect(classifyWaveDegree(3, 100)).toBe('minuette');
      expect(classifyWaveDegree(1, 100)).toBe('subminuette');
    });
  });

  describe('checkWaveAlternation', () => {
    it('should detect strong alternation', () => {
      const result = checkWaveAlternation(
        { start: 100, end: 120 },
        { start: 110, end: 115 }
      );
      expect(result.isAlternating).toBe(true);
      expect(result.description).toContain('alternation');
    });

    it('should detect similar lengths', () => {
      const result = checkWaveAlternation(
        { start: 100, end: 120 },
        { start: 110, end: 130 }
      );
      expect(result.isAlternating).toBe(false);
    });
  });

  describe('analyzeWaveChannel', () => {
    it('should calculate channel boundaries', () => {
      const waves = [
        { index: 0, price: 100, timestamp: 0 },
        { index: 1, price: 110, timestamp: 1 },
        { index: 2, price: 105, timestamp: 2 },
        { index: 3, price: 115, timestamp: 3 },
      ];

      const channel = analyzeWaveChannel(waves);

      expect(channel.upperChannel.length).toBe(4);
      expect(channel.lowerChannel.length).toBe(4);
      expect(typeof channel.isBreakingUp).toBe('boolean');
      expect(typeof channel.isBreakingDown).toBe('boolean');
    });

    it('should handle insufficient data', () => {
      const waves = [{ index: 0, price: 100, timestamp: 0 }];
      const channel = analyzeWaveChannel(waves);

      expect(channel.upperChannel.length).toBe(0);
      expect(channel.lowerChannel.length).toBe(0);
    });
  });

  describe('projectNextWave', () => {
    it('should project next wave direction and target', () => {
      const analysis = analyzeElliottWave(uptrendPrices);
      const currentPrice = uptrendPrices[uptrendPrices.length - 1];

      const projection = projectNextWave(analysis, currentPrice);

      expect(projection.target).toBeGreaterThan(0);
      expect(projection.probability).toBeGreaterThanOrEqual(0);
      expect(projection.probability).toBeLessThanOrEqual(1);
      expect(['up', 'down']).toContain(projection.direction);
    });
  });
});
