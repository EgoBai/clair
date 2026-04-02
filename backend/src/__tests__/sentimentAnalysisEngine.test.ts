import { describe, it, expect } from 'vitest';
import {
  calculateSentimentScore,
  detectSentimentDivergence,
  calculateSentimentMovingAverage,
  rankSentimentIndicators,
  SentimentData,
  SentimentScore,
} from '../services/sentimentAnalysisEngine';

const neutralData: SentimentData = {
  timestamp: new Date(),
  putCallRatio: 1.0,
  vixLevel: 20,
  marginBalance: 8e11,
  shortBalance: 3e10,
  newAccountCount: 300000,
  fundFlow: 0,
  limitUpCount: 50,
  limitDownCount: 50,
  advanceDeclineRatio: 0.5,
};

const bullishData: SentimentData = {
  timestamp: new Date(),
  putCallRatio: 0.5,
  vixLevel: 12,
  marginBalance: 1.5e12,
  shortBalance: 1e9,
  newAccountCount: 600000,
  fundFlow: 1e10,
  limitUpCount: 200,
  limitDownCount: 20,
  advanceDeclineRatio: 0.85,
};

const bearishData: SentimentData = {
  timestamp: new Date(),
  putCallRatio: 1.5,
  vixLevel: 35,
  marginBalance: 3e11,
  shortBalance: 2e11,
  newAccountCount: 50000,
  fundFlow: -1e10,
  limitUpCount: 10,
  limitDownCount: 200,
  advanceDeclineRatio: 0.15,
};

describe('sentimentAnalysisEngine', () => {
  describe('calculateSentimentScore', () => {
    it('should return score between -1 and 1', () => {
      const score = calculateSentimentScore(neutralData);
      expect(score.overall).toBeGreaterThanOrEqual(-1);
      expect(score.overall).toBeLessThanOrEqual(1);
    });

    it('should return fearGreedIndex between 0 and 100', () => {
      const score = calculateSentimentScore(neutralData);
      expect(score.fearGreedIndex).toBeGreaterThanOrEqual(0);
      expect(score.fearGreedIndex).toBeLessThanOrEqual(100);
    });

    it('should classify bullish data as greed/extreme_greed', () => {
      const score = calculateSentimentScore(bullishData);
      expect(['greed', 'extreme_greed']).toContain(score.signal);
    });

    it('should classify bearish data as fear/extreme_fear', () => {
      const score = calculateSentimentScore(bearishData);
      expect(['fear', 'extreme_fear']).toContain(score.signal);
    });

    it('should have all component scores', () => {
      const score = calculateSentimentScore(neutralData);
      expect(score.components).toHaveProperty('momentum');
      expect(score.components).toHaveProperty('volatility');
      expect(score.components).toHaveProperty('volume');
      expect(score.components).toHaveProperty('breadth');
      expect(score.components).toHaveProperty('sentiment');
    });

    it('should handle zero limits', () => {
      const data = { ...neutralData, limitUpCount: 0, limitDownCount: 0 };
      const score = calculateSentimentScore(data);
      expect(score.components.breadth).toBe(0);
    });

    it('should calculate bullish momentum with positive fund flow', () => {
      const data = { ...neutralData, fundFlow: 1e10, advanceDeclineRatio: 0.8 };
      const score = calculateSentimentScore(data);
      expect(score.components.momentum).toBeGreaterThan(0);
    });

    it('should calculate bearish momentum with negative fund flow', () => {
      const data = { ...neutralData, fundFlow: -1e10, advanceDeclineRatio: 0.2 };
      const score = calculateSentimentScore(data);
      expect(score.components.momentum).toBeLessThan(0);
    });

    it('should have valid signal type', () => {
      const score = calculateSentimentScore(neutralData);
      expect(['extreme_fear', 'fear', 'neutral', 'greed', 'extreme_greed']).toContain(score.signal);
    });
  });

  describe('detectSentimentDivergence', () => {
    it('should detect bearish divergence', () => {
      const score = calculateSentimentScore(bearishData);
      const divergence = detectSentimentDivergence(score, 0.05);
      if (divergence) {
        expect(divergence.type).toBe('bearish');
      }
    });

    it('should detect bullish divergence', () => {
      const score = calculateSentimentScore(bullishData);
      const divergence = detectSentimentDivergence(score, -0.05);
      if (divergence) {
        expect(divergence.type).toBe('bullish');
      }
    });

    it('should return null when no divergence', () => {
      const score = calculateSentimentScore(neutralData);
      const divergence = detectSentimentDivergence(score, 0.01);
      expect(divergence).toBeNull();
    });

    it('should include description in divergence', () => {
      const score: SentimentScore = {
        overall: -0.5,
        fearGreedIndex: 25,
        components: { momentum: 0, volatility: 0, volume: 0, breadth: 0, sentiment: 0 },
        signal: 'fear',
        historicalPercentile: 25,
      };
      const divergence = detectSentimentDivergence(score, 0.05);
      expect(divergence?.description).toBeTruthy();
    });
  });

  describe('calculateSentimentMovingAverage', () => {
    const makeScores = (overalls: number[]): SentimentScore[] =>
      overalls.map(o => ({
        overall: o,
        fearGreedIndex: (o + 1) * 50,
        components: { momentum: 0, volatility: 0, volume: 0, breadth: 0, sentiment: 0 },
        signal: 'neutral' as const,
        historicalPercentile: 50,
      }));

    it('should calculate moving average', () => {
      const scores = makeScores([0.1, 0.2, 0.3, 0.4, 0.5]);
      const ma = calculateSentimentMovingAverage(scores, 3);
      expect(ma.length).toBe(3);
      expect(ma[0]).toBeCloseTo(0.2, 5);
    });

    it('should return empty for insufficient data', () => {
      const scores = makeScores([0.1, 0.2]);
      const ma = calculateSentimentMovingAverage(scores, 5);
      expect(ma).toEqual([]);
    });

    it('should handle period of 1', () => {
      const scores = makeScores([0.1, 0.2, 0.3]);
      const ma = calculateSentimentMovingAverage(scores, 1);
      expect(ma.length).toBe(3);
    });
  });

  describe('rankSentimentIndicators', () => {
    it('should return all indicators', () => {
      const ranked = rankSentimentIndicators(neutralData);
      expect(ranked.length).toBe(6);
    });

    it('should classify bullish indicators', () => {
      const ranked = rankSentimentIndicators(bullishData);
      const pcr = ranked.find(r => r.indicator === '看跌看涨比');
      expect(pcr?.signal).toBe('bullish');
    });

    it('should classify bearish indicators', () => {
      const ranked = rankSentimentIndicators(bearishData);
      const pcr = ranked.find(r => r.indicator === '看跌看涨比');
      expect(pcr?.signal).toBe('bearish');
    });

    it('should classify neutral indicators', () => {
      const ranked = rankSentimentIndicators(neutralData);
      const pcr = ranked.find(r => r.indicator === '看跌看涨比');
      expect(pcr?.signal).toBe('neutral');
    });

    it('should include indicator name and value', () => {
      const ranked = rankSentimentIndicators(neutralData);
      ranked.forEach(r => {
        expect(r.indicator).toBeTruthy();
        expect(typeof r.value).toBe('number');
        expect(['bullish', 'bearish', 'neutral']).toContain(r.signal);
      });
    });
  });
});
