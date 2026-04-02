import { describe, it, expect } from 'vitest';
import { computeSentiment, sentimentHistory, SentimentInputs } from '../services/marketSentimentCompositeEngine';

const neutralInput: SentimentInputs = {
  putCallRatio: 0.7, vixLevel: 18, advanceDeclineRatio: 1.2,
  newHighLowRatio: 1.5, marginBalance: 0.01, northboundFlow: 20,
  shortInterest: 0.01, turnoverRate: 2.0,
};

const fearInput: SentimentInputs = {
  putCallRatio: 1.5, vixLevel: 30, advanceDeclineRatio: 0.15,
  newHighLowRatio: 0.1, marginBalance: 0.005, northboundFlow: -60,
  shortInterest: 0.04, turnoverRate: 1.0,
};

const greedInput: SentimentInputs = {
  putCallRatio: 0.3, vixLevel: 10, advanceDeclineRatio: 3.0,
  newHighLowRatio: 4.0, marginBalance: 0.04, northboundFlow: 90,
  shortInterest: 0.005, turnoverRate: 4.5,
};

describe('MarketSentimentCompositeEngine', () => {
  describe('computeSentiment', () => {
    it('should return score 0~100', () => {
      const result = computeSentiment(neutralInput);
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });

    it('should detect fear in fearful market', () => {
      const result = computeSentiment(fearInput);
      expect(['extreme_fear', 'fear', 'neutral']).toContain(result.level);
      expect(result.overallScore).toBeLessThan(50);
    });

    it('should detect greed in greedy market', () => {
      const result = computeSentiment(greedInput);
      expect(['greed', 'extreme_greed', 'neutral']).toContain(result.level);
      expect(result.overallScore).toBeGreaterThan(40);
    });

    it('should generate contrarian signals', () => {
      const fearResult = computeSentiment(fearInput);
      const greedResult = computeSentiment(greedInput);
      expect(['strong_buy', 'buy', 'neutral']).toContain(fearResult.contrarianSignal);
      expect(['strong_sell', 'sell', 'neutral']).toContain(greedResult.contrarianSignal);
    });

    it('should have all component scores', () => {
      const result = computeSentiment(neutralInput);
      expect(result.components.optionsSentiment).toBeDefined();
      expect(result.components.breadthSentiment).toBeDefined();
      expect(result.components.flowSentiment).toBeDefined();
      expect(result.components.volatilitySentiment).toBeDefined();
      expect(result.components.leverageSentiment).toBeDefined();
    });

    it('should apply custom weights', () => {
      const result = computeSentiment(neutralInput, {
        weights: { options: 0.5, breadth: 0.1, flow: 0.1, volatility: 0.2, leverage: 0.1 },
      });
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('sentimentHistory', () => {
    it('should return history of sentiment scores', () => {
      const history = sentimentHistory([fearInput, neutralInput, greedInput]);
      expect(history).toHaveLength(3);
      history.forEach(h => {
        expect(h.score).toBeGreaterThanOrEqual(0);
        expect(h.level).toBeDefined();
      });
    });
  });
});
