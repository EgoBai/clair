import { describe, it, expect } from 'vitest';
import { detectPatterns, findSupportResistance, OHLCV } from '../utils/chartPatternEngine';

describe('技术形态识别引擎', () => {
  const candles: OHLCV[] = [
    { date: '2026-01-01', open: 100, high: 105, low: 98, close: 103, volume: 1000 },
    { date: '2026-01-02', open: 103, high: 107, low: 101, close: 106, volume: 1200 },
    { date: '2026-01-03', open: 106, high: 110, low: 104, close: 108, volume: 1500 },
    { date: '2026-01-04', open: 108, high: 112, low: 100, close: 101, volume: 2000 }, // bearish engulfing potential
    { date: '2026-01-05', open: 101, high: 103, low: 99, close: 102, volume: 800 },
    { date: '2026-01-06', open: 102, high: 105, low: 100, close: 104, volume: 900 },
    { date: '2026-01-07', open: 104, high: 108, low: 103, close: 107, volume: 1100 },
    { date: '2026-01-08', open: 107, high: 110, low: 105, close: 109, volume: 1300 },
    { date: '2026-01-09', open: 109, high: 112, low: 107, close: 111, volume: 1400 },
    { date: '2026-01-10', open: 111, high: 115, low: 109, close: 113, volume: 1600 },
    { date: '2026-01-11', open: 113, high: 116, low: 108, close: 109, volume: 1800 },
    { date: '2026-01-12', open: 109, high: 111, low: 105, close: 106, volume: 1200 },
  ];

  // Doji candle
  const dojiCandle: OHLCV = { date: '2026-01-13', open: 106, high: 108, low: 104, close: 106.1, volume: 500 };

  // Hammer: small body, long lower shadow
  const hammerCandles: OHLCV[] = [
    { date: '2026-01-01', open: 106, high: 108, low: 105, close: 107, volume: 1000 }, // prev up
    { date: '2026-01-02', open: 105, high: 106, low: 104, close: 104.5, volume: 1000 }, // prev down
    { date: '2026-01-03', open: 104.5, high: 104.55, low: 98, close: 104, volume: 1500 }, // hammer (after down)
  ];

  describe('detectPatterns', () => {
    it('should detect patterns', () => {
      const patterns = detectPatterns(candles);
      expect(Array.isArray(patterns)).toBe(true);
    });

    it('should classify bullish/bearish/neutral', () => {
      const patterns = detectPatterns(candles);
      patterns.forEach(p => {
        expect(['bullish', 'bearish', 'neutral']).toContain(p.type);
      });
    });

    it('should have valid confidence range', () => {
      const patterns = detectPatterns(candles);
      patterns.forEach(p => {
        expect(p.confidence).toBeGreaterThan(0);
        expect(p.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('should detect hammer pattern', () => {
      const patterns = detectPatterns(hammerCandles);
      const hammer = patterns.find(p => p.name === '锤子线');
      expect(hammer).toBeDefined();
      expect(hammer?.type).toBe('bullish');
    });

    it('should handle empty input', () => {
      const patterns = detectPatterns([]);
      expect(patterns.length).toBe(0);
    });

    it('should handle single candle', () => {
      const patterns = detectPatterns([candles[0]]);
      expect(patterns.length).toBe(0);
    });
  });

  describe('findSupportResistance', () => {
    it('should find levels', () => {
      const levels = findSupportResistance(candles, 2);
      expect(Array.isArray(levels)).toBe(true);
    });

    it('should classify support and resistance', () => {
      const levels = findSupportResistance(candles, 2);
      levels.forEach(l => {
        expect(['support', 'resistance']).toContain(l.type);
      });
    });

    it('should sort by strength', () => {
      const levels = findSupportResistance(candles, 2);
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i - 1].strength).toBeGreaterThanOrEqual(levels[i].strength);
      }
    });
  });
});
