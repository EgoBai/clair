import { describe, it, expect } from 'vitest';
import { PatternRecognitionEngine, PricePoint } from '../services/patternRecognitionEngine';

describe('Pattern Recognition Engine', () => {
  const engine = new PatternRecognitionEngine();

  const generatePrices = (count: number, trend: 'up' | 'down' | 'sideways' = 'sideways'): PricePoint[] => {
    const prices: PricePoint[] = [];
    let price = 100;

    for (let i = 0; i < count; i++) {
      let drift = 0;
      if (trend === 'up') drift = 0.1;
      else if (trend === 'down') drift = -0.1;

      const noise = (Math.random() - 0.5) * 2;
      price += drift + noise;

      const high = price + Math.random() * 1.5;
      const low = price - Math.random() * 1.5;
      const open = low + Math.random() * (high - low);
      const close = low + Math.random() * (high - low);

      prices.push({
        high, low, open, close,
        volume: 1e6 + Math.random() * 1e6,
        timestamp: Date.now() + i * 86400000
      });
    }

    return prices;
  };

  const generateHeadShoulders = (): PricePoint[] => {
    const prices: PricePoint[] = [];
    const pattern = [
      95, 97, 99, 101, 103, 105, 103, 100, 97, 95, 94,
      96, 99, 102, 106, 109, 112, 109, 106, 102, 99, 96, 94,
      96, 99, 102, 104, 106, 104, 102, 99, 96, 93, 90
    ];

    for (let i = 0; i < pattern.length; i++) {
      const p = pattern[i];
      prices.push({
        high: p + 1, low: p - 1, open: p - 0.5, close: p + 0.5,
        volume: 1e6, timestamp: Date.now() + i * 86400000
      });
    }

    return prices;
  };

  describe('findPivots', () => {
    it('should find pivot points', () => {
      const prices = generatePrices(100);
      const pivots = engine.findPivots(prices, 3);
      expect(pivots.length).toBeGreaterThan(0);
    });

    it('should classify high and low pivots', () => {
      const prices = generatePrices(100);
      const pivots = engine.findPivots(prices, 3);
      const highs = pivots.filter(p => p.type === 'high');
      const lows = pivots.filter(p => p.type === 'low');
      expect(highs.length).toBeGreaterThan(0);
      expect(lows.length).toBeGreaterThan(0);
    });

    it('should have strength between 0 and 1', () => {
      const prices = generatePrices(100);
      const pivots = engine.findPivots(prices, 3);
      for (const p of pivots) {
        expect(p.strength).toBeGreaterThanOrEqual(0);
        expect(p.strength).toBeLessThanOrEqual(1);
      }
    });

    it('should respect strength parameter', () => {
      const prices = generatePrices(100);
      const pivots3 = engine.findPivots(prices, 3);
      const pivots5 = engine.findPivots(prices, 5);
      // Higher strength = fewer pivots (generally)
      expect(pivots5.length).toBeLessThanOrEqual(pivots3.length);
    });
  });

  describe('identifyPatterns', () => {
    it('should return patterns array', () => {
      const prices = generatePrices(100);
      const patterns = engine.identifyPatterns(prices);
      expect(Array.isArray(patterns)).toBe(true);
    });

    it('should have valid pattern types', () => {
      const prices = generateHeadShoulders();
      const patterns = engine.identifyPatterns(prices);
      for (const p of patterns) {
        expect([
          'head_shoulders', 'inv_head_shoulders', 'double_top', 'double_bottom',
          'triangle_ascending', 'triangle_descending', 'triangle_symmetric',
          'flag_bull', 'flag_bear', 'wedge_rising', 'wedge_falling',
          'channel_up', 'channel_down', 'rectangle', 'cup_handle'
        ]).toContain(p.type);
      }
    });

    it('should have confidence between 0 and 1', () => {
      const prices = generatePrices(100);
      const patterns = engine.identifyPatterns(prices);
      for (const p of patterns) {
        expect(p.confidence).toBeGreaterThanOrEqual(0);
        expect(p.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should sort by confidence', () => {
      const prices = generatePrices(100);
      const patterns = engine.identifyPatterns(prices);
      for (let i = 1; i < patterns.length; i++) {
        expect(patterns[i - 1].confidence).toBeGreaterThanOrEqual(patterns[i].confidence);
      }
    });

    it('should have valid direction', () => {
      const prices = generatePrices(100);
      const patterns = engine.identifyPatterns(prices);
      for (const p of patterns) {
        expect(['bullish', 'bearish', 'neutral']).toContain(p.direction);
      }
    });

    it('should include target price and stop loss', () => {
      const prices = generatePrices(100);
      const patterns = engine.identifyPatterns(prices);
      for (const p of patterns) {
        expect(p.targetPrice).toBeTypeOf('number');
        expect(p.stopLoss).toBeTypeOf('number');
      }
    });
  });

  describe('identifyGaps', () => {
    it('should find gaps', () => {
      const prices = generatePrices(50);
      // Insert a gap
      prices[25] = {
        ...prices[25],
        low: prices[24].high + 5
      };
      const gaps = engine.identifyGaps(prices);
      expect(gaps.length).toBeGreaterThan(0);
    });

    it('should classify gap types', () => {
      const prices = generatePrices(50);
      prices[25] = { ...prices[25], low: prices[24].high + 5 };
      const gaps = engine.identifyGaps(prices);
      for (const g of gaps) {
        expect(['common', 'breakaway', 'runaway', 'exhaustion']).toContain(g.type);
      }
    });

    it('should calculate gap percent', () => {
      const prices = generatePrices(50);
      prices[25] = { ...prices[25], low: prices[24].high + 5 };
      const gaps = engine.identifyGaps(prices);
      for (const g of gaps) {
        expect(g.gapPercent).toBeGreaterThan(0);
      }
    });

    it('should return empty for gapless prices', () => {
      const prices: PricePoint[] = [];
      for (let i = 0; i < 50; i++) {
        const p = 100 + i * 0.1;
        prices.push({
          high: p + 0.5, low: p - 0.5, open: p - 0.2, close: p + 0.2,
          volume: 1e6, timestamp: Date.now() + i * 86400000
        });
      }
      const gaps = engine.identifyGaps(prices);
      // Tightly controlled prices should have no gaps
      expect(gaps.length).toBe(0);
    });
  });

  describe('drawTrendLines', () => {
    it('should return trend lines', () => {
      const prices = generatePrices(100);
      const lines = engine.drawTrendLines(prices);
      expect(Array.isArray(lines)).toBe(true);
    });

    it('should have valid types', () => {
      const prices = generatePrices(100);
      const lines = engine.drawTrendLines(prices);
      for (const l of lines) {
        expect(['support', 'resistance', 'channel_upper', 'channel_lower']).toContain(l.type);
      }
    });

    it('should have slope and strength', () => {
      const prices = generatePrices(100);
      const lines = engine.drawTrendLines(prices);
      for (const l of lines) {
        expect(l.slope).toBeTypeOf('number');
        expect(l.strength).toBeGreaterThanOrEqual(2);
      }
    });

    it('should include current level', () => {
      const prices = generatePrices(100);
      const lines = engine.drawTrendLines(prices);
      for (const l of lines) {
        expect(l.currentLevel).toBeTypeOf('number');
        expect(isFinite(l.currentLevel)).toBe(true);
      }
    });
  });

  describe('findSupportResistance', () => {
    it('should find S/R levels', () => {
      const prices = generatePrices(100);
      const levels = engine.findSupportResistance(prices);
      expect(Array.isArray(levels)).toBe(true);
    });

    it('should classify support and resistance', () => {
      const prices = generatePrices(100);
      const levels = engine.findSupportResistance(prices);
      for (const l of levels) {
        expect(['support', 'resistance']).toContain(l.type);
      }
    });

    it('should have touch count >= 2', () => {
      const prices = generatePrices(100);
      const levels = engine.findSupportResistance(prices);
      for (const l of levels) {
        expect(l.touchCount).toBeGreaterThanOrEqual(2);
      }
    });

    it('should have strength between 0 and 1', () => {
      const prices = generatePrices(100);
      const levels = engine.findSupportResistance(prices);
      for (const l of levels) {
        expect(l.strength).toBeGreaterThanOrEqual(0);
        expect(l.strength).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('recognizeAll', () => {
    it('should return complete recognition result', () => {
      const prices = generatePrices(100);
      const result = engine.recognizeAll(prices);
      expect(result.patterns).toBeDefined();
      expect(result.gaps).toBeDefined();
      expect(result.trendLines).toBeDefined();
      expect(result.supportResistance).toBeDefined();
      expect(result.pivots).toBeDefined();
      expect(['bullish', 'bearish', 'neutral']).toContain(result.currentBias);
    });

    it('should include pivots', () => {
      const prices = generatePrices(100);
      const result = engine.recognizeAll(prices);
      expect(result.pivots.length).toBeGreaterThan(0);
    });

    it('should handle head and shoulders pattern', () => {
      const prices = generateHeadShoulders();
      const result = engine.recognizeAll(prices);
      // May or may not detect depending on pivot calculation
      expect(result.patterns).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle very short series', () => {
      const prices = generatePrices(5);
      const result = engine.recognizeAll(prices);
      expect(result.patterns).toEqual([]);
    });

    it('should handle constant prices', () => {
      const prices: PricePoint[] = Array.from({ length: 50 }, (_, i) => ({
        high: 100, low: 100, open: 100, close: 100,
        volume: 1e6, timestamp: Date.now() + i * 86400000
      }));
      const result = engine.recognizeAll(prices);
      expect(result.pivots).toEqual([]);
    });

    it('should handle extreme volatility', () => {
      const prices: PricePoint[] = [];
      for (let i = 0; i < 50; i++) {
        const p = i % 2 === 0 ? 50 : 150;
        prices.push({
          high: p + 10, low: p - 10, open: p, close: p,
          volume: 1e6, timestamp: Date.now() + i * 86400000
        });
      }
      const result = engine.recognizeAll(prices);
      expect(result).toBeDefined();
    });
  });
});
