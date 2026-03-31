import { describe, it, expect } from 'vitest';
import {
  calculateCompositeSentiment,
  detectSentimentDivergences,
  calculateNewsSentiment,
  calculateSocialSentiment,
  calculateOptionsSentiment,
  calculateFundFlowSentiment,
  calculateVIXSentiment,
} from '../utils/sentimentCompositeEngine';
import type { SentimentSource } from '../utils/sentimentCompositeEngine';

function makeSource(name: string, score: number): SentimentSource {
  return { name, score, weight: 0.25, reliability: 0.8, timestamp: '2024-01-01', dataPoints: 10 };
}

describe('Sentiment Composite Engine', () => {
  describe('calculateCompositeSentiment', () => {
    it('should calculate weighted composite score', () => {
      const sources = [
        makeSource('news', 60),
        makeSource('social', 40),
        makeSource('options', 50),
      ];
      const result = calculateCompositeSentiment(sources);

      expect(result.score).toBeGreaterThan(0);
      expect(result.label).toBe('greed');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.sources).toHaveLength(3);
    });

    it('should detect extreme fear', () => {
      const sources = [
        makeSource('news', -80),
        makeSource('social', -70),
        makeSource('options', -60),
      ];
      const result = calculateCompositeSentiment(sources);
      expect(result.label).toBe('extreme_fear');
    });

    it('should detect extreme greed', () => {
      const sources = [
        makeSource('news', 80),
        makeSource('social', 70),
        makeSource('options', 60),
      ];
      const result = calculateCompositeSentiment(sources);
      expect(result.label).toBe('extreme_greed');
    });

    it('should handle empty sources', () => {
      const result = calculateCompositeSentiment([]);
      expect(result.score).toBe(0);
      expect(result.label).toBe('neutral');
      expect(result.confidence).toBe(0);
    });

    it('should detect divergence', () => {
      const sources = [
        makeSource('news', 80),
        makeSource('social', -80),
        makeSource('options', 0),
      ];
      const result = calculateCompositeSentiment(sources);
      expect(result.divergence).toBe(true);
    });

    it('should weight by reliability', () => {
      const reliable = makeSource('reliable', -50);
      reliable.reliability = 1;
      reliable.weight = 1;

      const unreliable = makeSource('unreliable', 50);
      unreliable.reliability = 0.1;
      unreliable.weight = 1;

      const result = calculateCompositeSentiment([reliable, unreliable]);
      // Reliable source should dominate
      expect(result.score).toBeLessThan(0);
    });
  });

  describe('detectSentimentDivergences', () => {
    it('should find divergences', () => {
      const sources = [
        makeSource('A', 80),
        makeSource('B', -30),
        makeSource('C', 20),
      ];
      const divergences = detectSentimentDivergences(sources);

      expect(divergences.length).toBeGreaterThan(0);
      for (const d of divergences) {
        expect(d).toHaveProperty('source1');
        expect(d).toHaveProperty('source2');
        expect(d).toHaveProperty('divergence');
        expect(['low', 'medium', 'high']).toContain(d.significance);
      }
    });

    it('should not find divergences in aligned sources', () => {
      const sources = [
        makeSource('A', 50),
        makeSource('B', 55),
        makeSource('C', 45),
      ];
      const divergences = detectSentimentDivergences(sources);
      expect(divergences).toHaveLength(0);
    });

    it('should sort by divergence magnitude', () => {
      const sources = [
        makeSource('A', 80),
        makeSource('B', -50),
        makeSource('C', 30),
      ];
      const divergences = detectSentimentDivergences(sources);
      for (let i = 1; i < divergences.length; i++) {
        expect(divergences[i - 1].divergence).toBeGreaterThanOrEqual(divergences[i].divergence);
      }
    });
  });

  describe('calculateNewsSentiment', () => {
    it('should calculate news sentiment', () => {
      const articles = [
        { sentiment: 0.8, relevance: 0.9, date: '2024-01-15' },
        { sentiment: 0.3, relevance: 0.5, date: '2024-01-14' },
        { sentiment: -0.2, relevance: 0.7, date: '2024-01-13' },
      ];
      const result = calculateNewsSentiment(articles);

      expect(result.name).toBe('news');
      expect(result.score).toBeGreaterThan(0);
      expect(result.dataPoints).toBe(3);
      expect(result.reliability).toBeLessThanOrEqual(1);
    });

    it('should handle empty articles', () => {
      const result = calculateNewsSentiment([]);
      expect(result.score).toBe(0);
      expect(result.reliability).toBe(0);
    });
  });

  describe('calculateSocialSentiment', () => {
    it('should calculate social sentiment', () => {
      const posts = [
        { sentiment: 0.5, engagement: 10, followers: 1000 },
        { sentiment: -0.3, engagement: 5, followers: 500 },
      ];
      const result = calculateSocialSentiment(posts);

      expect(result.name).toBe('social');
      expect(typeof result.score).toBe('number');
      expect(result.dataPoints).toBe(2);
    });

    it('should handle empty posts', () => {
      const result = calculateSocialSentiment([]);
      expect(result.reliability).toBe(0);
    });
  });

  describe('calculateOptionsSentiment', () => {
    it('should calculate from put/call ratio', () => {
      const result = calculateOptionsSentiment(1000, 2000, 5000, 8000);

      expect(result.name).toBe('options');
      expect(result.score).toBeGreaterThan(0); // Low PCR = bullish
      expect(result.reliability).toBe(0.8);
    });

    it('should be bearish when PCR is high', () => {
      const result = calculateOptionsSentiment(3000, 1000, 10000, 5000);
      expect(result.score).toBeLessThan(0);
    });
  });

  describe('calculateFundFlowSentiment', () => {
    it('should be positive on net inflow', () => {
      const result = calculateFundFlowSentiment(1000, 500);
      expect(result.score).toBeGreaterThan(0);
      expect(result.name).toBe('fund_flow');
    });

    it('should be negative on net outflow', () => {
      const result = calculateFundFlowSentiment(500, 1000);
      expect(result.score).toBeLessThan(0);
    });

    it('should handle zero flows', () => {
      const result = calculateFundFlowSentiment(0, 0);
      expect(result.score).toBe(0);
    });
  });

  describe('calculateVIXSentiment', () => {
    it('should be bullish at low VIX', () => {
      const result = calculateVIXSentiment(10);
      expect(result.score).toBeGreaterThan(50);
    });

    it('should be bearish at high VIX', () => {
      const result = calculateVIXSentiment(35);
      expect(result.score).toBeLessThan(-50);
    });

    it('should be neutral around VIX 17-18', () => {
      const result = calculateVIXSentiment(17);
      expect(Math.abs(result.score)).toBeLessThan(50);
    });
  });

  describe('integration', () => {
    it('should combine all sentiment sources', () => {
      const news = calculateNewsSentiment([
        { sentiment: 0.5, relevance: 0.8, date: '2024-01-15' },
      ]);
      const social = calculateSocialSentiment([
        { sentiment: 0.3, engagement: 5, followers: 1000 },
      ]);
      const options = calculateOptionsSentiment(1000, 1500, 5000, 7000);
      const fundFlow = calculateFundFlowSentiment(800, 600);
      const vix = calculateVIXSentiment(18);

      const composite = calculateCompositeSentiment([news, social, options, fundFlow, vix]);

      expect(composite.score).toBeGreaterThanOrEqual(-100);
      expect(composite.score).toBeLessThanOrEqual(100);
      expect(composite.sources).toHaveLength(5);
    });
  });
});
