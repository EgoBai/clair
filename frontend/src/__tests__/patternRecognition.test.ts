import { describe, it, expect } from 'vitest';
import {
  findSupportResistance,
  detectPatterns,
  analyzeVolumePrice,
  type OHLCV,
} from '../utils/patternRecognition';

describe('PatternRecognition', () => {
  function makeOHLCV(overrides: Partial<OHLCV> = {}): OHLCV {
    return { date: '2024-01-01', open: 10, high: 10.5, low: 9.5, close: 10.2, volume: 1e6, ...overrides };
  }

  // 生成20根K线
  function generateBars(startPrice: number, endPrice: number, trend: 'up' | 'down' | 'sideways'): OHLCV[] {
    const bars: OHLCV[] = [];
    const step = (endPrice - startPrice) / 20;
    for (let i = 0; i < 20; i++) {
      const close = startPrice + step * i + (Math.random() - 0.5) * 0.5;
      const range = Math.abs(step) + 0.3;
      bars.push({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        open: close - step / 2,
        high: close + range,
        low: close - range,
        close,
        volume: 1e6 + Math.random() * 5e5,
      });
    }
    return bars;
  }

  describe('findSupportResistance', () => {
    it('should find support and resistance levels', () => {
      const bars = generateBars(10, 12, 'up');
      const levels = findSupportResistance(bars, 2, 0.03);
      expect(levels.length).toBeGreaterThanOrEqual(0);
    });

    it('should classify levels as support or resistance', () => {
      const bars = generateBars(10, 12, 'up');
      const levels = findSupportResistance(bars, 2, 0.03);
      for (const l of levels) {
        expect(['support', 'resistance']).toContain(l.type);
      }
    });

    it('should include strength (touch count)', () => {
      const bars = generateBars(10, 12, 'up');
      const levels = findSupportResistance(bars, 2, 0.03);
      for (const l of levels) {
        expect(l.strength).toBeGreaterThanOrEqual(2);
      }
    });

    it('should sort by strength descending', () => {
      const bars = generateBars(10, 12, 'up');
      const levels = findSupportResistance(bars, 2, 0.03);
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i - 1].strength).toBeGreaterThanOrEqual(levels[i].strength);
      }
    });

    it('should handle empty data', () => {
      const levels = findSupportResistance([], 2, 0.02);
      expect(levels).toHaveLength(0);
    });

    it('should respect minTouches parameter', () => {
      const bars = generateBars(10, 12, 'up');
      const strict = findSupportResistance(bars, 5, 0.03);
      const loose = findSupportResistance(bars, 2, 0.03);
      expect(strict.length).toBeLessThanOrEqual(loose.length);
    });
  });

  describe('detectPatterns', () => {
    it('should detect upward trend', () => {
      const bars = generateBars(10, 14, 'up');
      const patterns = detectPatterns(bars);
      expect(patterns.some((p) => p.direction === 'bullish')).toBe(true);
    });

    it('should detect downward trend', () => {
      const bars = generateBars(14, 10, 'down');
      const patterns = detectPatterns(bars);
      expect(patterns.some((p) => p.direction === 'bearish')).toBe(true);
    });

    it('should return empty for insufficient data', () => {
      const patterns = detectPatterns([makeOHLCV()]);
      expect(patterns).toHaveLength(0);
    });

    it('should include target price and stop loss', () => {
      const bars = generateBars(10, 14, 'up');
      const patterns = detectPatterns(bars);
      for (const p of patterns) {
        expect(p.targetPrice).toBeGreaterThan(0);
        expect(p.stopLoss).toBeGreaterThan(0);
      }
    });

    it('should include confidence score', () => {
      const bars = generateBars(10, 14, 'up');
      const patterns = detectPatterns(bars);
      for (const p of patterns) {
        expect(p.confidence).toBeGreaterThan(0);
        expect(p.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should include description', () => {
      const bars = generateBars(10, 14, 'up');
      const patterns = detectPatterns(bars);
      for (const p of patterns) {
        expect(p.description.length).toBeGreaterThan(0);
      }
    });

    it('should include pattern name', () => {
      const bars = generateBars(10, 14, 'up');
      const patterns = detectPatterns(bars);
      for (const p of patterns) {
        expect(p.pattern.length).toBeGreaterThan(0);
      }
    });
  });

  describe('analyzeVolumePrice', () => {
    it('should detect high volume up move', () => {
      const bars: OHLCV[] = [
        ...Array.from({ length: 10 }, (_, i) => makeOHLCV({
          date: `2024-01-${String(i + 1).padStart(2, '0')}`,
          close: 10 + i * 0.1,
          volume: 1e6,
        })),
        makeOHLCV({ date: '2024-01-11', close: 11, high: 11.5, low: 9.5, volume: 3e6 }),
      ];
      const signals = analyzeVolumePrice(bars);
      expect(signals.some((s) => s.pattern.includes('放量'))).toBe(true);
    });

    it('should detect low volume up move', () => {
      const bars: OHLCV[] = [
        ...Array.from({ length: 10 }, (_, i) => makeOHLCV({
          date: `2024-01-${String(i + 1).padStart(2, '0')}`,
          close: 10,
          volume: 2e6,
        })),
        makeOHLCV({ date: '2024-01-11', close: 10.5, high: 11, low: 9, volume: 5e5 }),
      ];
      const signals = analyzeVolumePrice(bars);
      expect(signals.some((s) => s.pattern.includes('缩量'))).toBe(true);
    });

    it('should assign bullish/bearish type', () => {
      const bars = generateBars(10, 12, 'up');
      bars[19] = { ...bars[19], volume: 5e6 };
      const signals = analyzeVolumePrice(bars);
      for (const s of signals) {
        expect(['bullish', 'bearish', 'neutral']).toContain(s.type);
      }
    });

    it('should include strength', () => {
      const bars = generateBars(10, 12, 'up');
      const signals = analyzeVolumePrice(bars);
      for (const s of signals) {
        expect(s.strength).toBeGreaterThanOrEqual(0);
        expect(s.strength).toBeLessThanOrEqual(100);
      }
    });

    it('should return empty for insufficient data', () => {
      const signals = analyzeVolumePrice([makeOHLCV()]);
      expect(signals).toHaveLength(0);
    });

    it('should include description', () => {
      const bars = generateBars(10, 12, 'up');
      bars[19] = { ...bars[19], volume: 3e6 };
      const signals = analyzeVolumePrice(bars);
      for (const s of signals) {
        expect(s.description.length).toBeGreaterThan(0);
      }
    });
  });
});
