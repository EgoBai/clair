import { describe, it, expect } from 'vitest';
import {
  calculateLimits,
  checkLimitStatus,
  detectLimitPatterns,
  analyzeSectorHeatmap,
  calculateMarketSentiment,
  estimateOpenProbability,
  findLimitUpPool,
} from '../utils/circuitBreakerEngine';

describe('Circuit Breaker Engine', () => {
  describe('calculateLimits', () => {
    it('should calculate 10% limits for normal stocks', () => {
      const { limitUp, limitDown } = calculateLimits(10);
      expect(limitUp).toBeCloseTo(11, 1);
      expect(limitDown).toBeCloseTo(9, 1);
    });

    it('should calculate 5% limits for ST stocks', () => {
      const { limitUp, limitDown } = calculateLimits(10, true);
      expect(limitUp).toBeCloseTo(10.5, 1);
      expect(limitDown).toBeCloseTo(9.5, 1);
    });
  });

  describe('checkLimitStatus', () => {
    it('should detect limit up', () => {
      const status = checkLimitStatus('TEST', 11, 10, 1000, 500);
      expect(status.limitType).toBe('limit_up');
      expect(status.limitUp).toBe(11);
    });

    it('should detect limit down', () => {
      const status = checkLimitStatus('TEST', 9, 10, 1000, 500);
      expect(status.limitType).toBe('limit_down');
    });

    it('should detect no limit', () => {
      const status = checkLimitStatus('TEST', 10.5, 10, 1000, 500);
      expect(status.limitType).toBe('none');
    });

    it('should calculate volume ratio', () => {
      const status = checkLimitStatus('TEST', 10, 10, 2000, 500);
      expect(status.volumeRatio).toBe(4);
    });
  });

  describe('detectLimitPatterns', () => {
    it('should detect consecutive limit up', () => {
      const prices = [11, 12.1, 13.31];
      const volumes = [1000, 800, 600];
      const prevCloses = [10, 11, 12.1];

      const patterns = detectLimitPatterns('TEST', prices, volumes, prevCloses);
      expect(patterns.length).toBeGreaterThan(0);
      const continuous = patterns.filter(p => p.type === 'continuous_limit_up');
      expect(continuous.length).toBeGreaterThan(0);
    });

    it('should handle empty data', () => {
      expect(detectLimitPatterns('TEST', [], [], [])).toEqual([]);
    });
  });

  describe('analyzeSectorHeatmap', () => {
    it('should analyze sector heatmap', () => {
      const stocks = [
        { symbol: 'A', sector: 'tech', change: 0.1, limitType: 'limit_up' as const },
        { symbol: 'B', sector: 'tech', change: 0.05, limitType: 'none' as const },
        { symbol: 'C', sector: 'finance', change: -0.08, limitType: 'limit_down' as const },
      ];

      const heatmap = analyzeSectorHeatmap(stocks);

      expect(heatmap.length).toBe(2);
      expect(heatmap[0].sector).toBe('tech'); // highest intensity
      expect(heatmap[0].limitUpCount).toBe(1);
      expect(heatmap[1].sector).toBe('finance');
      expect(heatmap[1].limitDownCount).toBe(1);
    });
  });

  describe('calculateMarketSentiment', () => {
    it('should detect extreme greed', () => {
      const sentiment = calculateMarketSentiment(150, 10, 3000);
      expect(sentiment.sentiment).toBe('extreme_greed');
      expect(sentiment.score).toBeGreaterThan(50);
    });

    it('should detect extreme fear', () => {
      const sentiment = calculateMarketSentiment(10, 150, 3000);
      expect(sentiment.sentiment).toBe('extreme_fear');
      expect(sentiment.score).toBeLessThan(-50);
    });

    it('should detect neutral', () => {
      const sentiment = calculateMarketSentiment(30, 30, 3000);
      expect(sentiment.sentiment).toBe('neutral');
      expect(Math.abs(sentiment.score)).toBeLessThan(30);
    });
  });

  describe('estimateOpenProbability', () => {
    it('should estimate open probability', () => {
      const prob = estimateOpenProbability(1000000, 100, 1, 500);
      expect(prob).toBeGreaterThan(0);
      expect(prob).toBeLessThan(1);
    });

    it('should be lower for consecutive limit days', () => {
      const prob1 = estimateOpenProbability(1000000, 100, 1, 500);
      const prob5 = estimateOpenProbability(1000000, 100, 5, 500);
      expect(prob5).toBeLessThanOrEqual(prob1);
    });
  });

  describe('findLimitUpPool', () => {
    it('should find limit-up candidates', () => {
      const stocks = [
        { symbol: 'HOT', sector: 'tech', change: 0.08, volume: 5000, avgVolume: 1000, marketCap: 3e9, hasNews: true },
        { symbol: 'COLD', sector: 'finance', change: 0.01, volume: 1000, avgVolume: 1000, marketCap: 100e9, hasNews: false },
      ];

      const pool = findLimitUpPool(stocks);
      expect(pool.length).toBeGreaterThan(0);
      expect(pool[0].symbol).toBe('HOT');
      expect(pool[0].probability).toBeGreaterThan(0);
    });

    it('should not include low-scoring stocks', () => {
      const stocks = [
        { symbol: 'BORING', sector: 'staples', change: 0.001, volume: 100, avgVolume: 100, marketCap: 100e9, hasNews: false },
      ];

      const pool = findLimitUpPool(stocks);
      expect(pool).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle zero volume', () => {
      const status = checkLimitStatus('TEST', 10, 10, 0, 0);
      expect(status.volumeRatio).toBe(1);
    });

    it('should handle very large market sentiment', () => {
      const sentiment = calculateMarketSentiment(500, 500, 5000);
      expect(sentiment.sentiment).toBe('neutral');
    });
  });
});
