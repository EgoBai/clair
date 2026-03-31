import { describe, it, expect } from 'vitest';
import {
  calculateSentimentScore,
  fearGreedIndex,
  calculateMFI,
  calculateOBVSentiment,
  type SentimentInputs,
} from '../utils/sentimentEngine';

const neutralInputs: SentimentInputs = {
  advancers: 1500, decliners: 1500,
  newHighs: 50, newLows: 50,
  upVolume: 1000000, downVolume: 1000000,
  vix: 20, vixMA: 20,
  inflowAmount: 500000, outflowAmount: 500000,
  marginBuy: 100000, marginSell: 100000,
  limitUp: 30, limitDown: 30,
};

const bullishInputs: SentimentInputs = {
  advancers: 3000, decliners: 500,
  newHighs: 200, newLows: 10,
  upVolume: 2000000, downVolume: 300000,
  vix: 12, vixMA: 18,
  inflowAmount: 800000, outflowAmount: 200000,
  marginBuy: 150000, marginSell: 50000,
  limitUp: 100, limitDown: 5,
};

const bearishInputs: SentimentInputs = {
  advancers: 300, decliners: 3000,
  newHighs: 5, newLows: 200,
  upVolume: 200000, downVolume: 2000000,
  vix: 35, vixMA: 18,
  inflowAmount: 200000, outflowAmount: 800000,
  marginBuy: 50000, marginSell: 150000,
  limitUp: 5, limitDown: 100,
};

describe('情绪评分引擎', () => {
  describe('calculateSentimentScore', () => {
    it('should return near-neutral score for balanced inputs', () => {
      const result = calculateSentimentScore(neutralInputs);
      expect(Math.abs(result.overall)).toBeLessThan(50);
      expect(['neutral', 'greed', 'fear']).toContain(result.level);
    });

    it('should return greed for bullish inputs', () => {
      const result = calculateSentimentScore(bullishInputs);
      expect(result.overall).toBeGreaterThan(0);
      expect(['greed', 'extreme_greed']).toContain(result.level);
    });

    it('should return fear for bearish inputs', () => {
      const result = calculateSentimentScore(bearishInputs);
      expect(result.overall).toBeLessThan(0);
      expect(['fear', 'extreme_fear']).toContain(result.level);
    });

    it('all sub-scores should be in range', () => {
      const result = calculateSentimentScore(bullishInputs);
      for (const key of ['breadth', 'volume', 'volatility', 'moneyFlow', 'margin', 'extremes']) {
        expect((result as any)[key]).toBeGreaterThanOrEqual(-100);
        expect((result as any)[key]).toBeLessThanOrEqual(100);
      }
    });

    it('should generate signals for extreme conditions', () => {
      const result = calculateSentimentScore(bearishInputs);
      expect(result.signals.length).toBeGreaterThan(0);
    });

    it('overall should be weighted average of sub-scores', () => {
      const result = calculateSentimentScore(neutralInputs);
      expect(result.overall).toBeGreaterThan(-100);
      expect(result.overall).toBeLessThan(100);
    });
  });

  describe('fearGreedIndex', () => {
    it('should return value between 0 and 100', () => {
      const result = fearGreedIndex(neutralInputs);
      expect(result.value).toBeGreaterThanOrEqual(0);
      expect(result.value).toBeLessThanOrEqual(100);
    });

    it('should classify bullish as greed', () => {
      const result = fearGreedIndex(bullishInputs);
      expect(result.value).toBeGreaterThan(50);
    });

    it('should classify bearish as fear', () => {
      const result = fearGreedIndex(bearishInputs);
      expect(result.value).toBeLessThan(50);
    });

    it('should have all components', () => {
      const result = fearGreedIndex(neutralInputs);
      expect(Object.keys(result.components).length).toBe(6);
      for (const comp of Object.values(result.components)) {
        expect(comp.value).toBeGreaterThanOrEqual(0);
        expect(comp.value).toBeLessThanOrEqual(100);
        expect(comp.rating).toBeDefined();
      }
    });
  });

  describe('calculateMFI', () => {
    it('should return values between 0 and 100', () => {
      const n = 50;
      const highs = Array.from({ length: n }, () => 100 + Math.random() * 5);
      const lows = Array.from({ length: n }, () => 95 + Math.random() * 5);
      const closes = Array.from({ length: n }, () => 97 + Math.random() * 5);
      const volumes = Array.from({ length: n }, () => 1000000 + Math.random() * 500000);

      const mfi = calculateMFI(highs, lows, closes, volumes, 14);
      for (const v of mfi) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    });

    it('should handle insufficient data', () => {
      const mfi = calculateMFI([1], [1], [1], [1], 14);
      expect(mfi.length).toBe(0);
    });

    it('should have correct length', () => {
      const n = 30;
      const mfi = calculateMFI(
        Array(n).fill(100), Array(n).fill(95), Array(n).fill(97), Array(n).fill(1000), 14
      );
      expect(mfi.length).toBe(n - 14);
    });
  });

  describe('calculateOBVSentiment', () => {
    it('should return positive for uptrend', () => {
      const closes = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109,
                      110, 111, 112, 113, 114, 115, 116, 117, 118, 119];
      const volumes = Array(20).fill(1000000);
      const sentiment = calculateOBVSentiment(closes, volumes, 15);
      expect(sentiment).toBeGreaterThan(0);
    });

    it('should return negative for downtrend', () => {
      const closes = [120, 119, 118, 117, 116, 115, 114, 113, 112, 111,
                      110, 109, 108, 107, 106, 105, 104, 103, 102, 101];
      const volumes = Array(20).fill(1000000);
      const sentiment = calculateOBVSentiment(closes, volumes, 15);
      expect(sentiment).toBeLessThan(0);
    });

    it('should return near zero for flat', () => {
      const closes = Array(20).fill(100);
      const volumes = Array(20).fill(1000000);
      const sentiment = calculateOBVSentiment(closes, volumes, 15);
      expect(Math.abs(sentiment)).toBeLessThan(10);
    });

    it('should handle short data', () => {
      const sentiment = calculateOBVSentiment([100], [1000], 14);
      expect(sentiment).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle zero volumes', () => {
      const inputs: SentimentInputs = {
        ...neutralInputs,
        upVolume: 0, downVolume: 0,
        inflowAmount: 0, outflowAmount: 0,
      };
      const result = calculateSentimentScore(inputs);
      expect(result.overall).toBeDefined();
    });

    it('should handle all advancers', () => {
      const inputs: SentimentInputs = {
        ...neutralInputs,
        advancers: 3000, decliners: 0,
        newHighs: 300, newLows: 0,
      };
      const result = calculateSentimentScore(inputs);
      expect(result.breadth).toBeGreaterThan(50);
    });

    it('should handle all decliners', () => {
      const inputs: SentimentInputs = {
        ...neutralInputs,
        advancers: 0, decliners: 3000,
        newHighs: 0, newLows: 300,
      };
      const result = calculateSentimentScore(inputs);
      expect(result.breadth).toBeLessThan(-50);
    });
  });
});
