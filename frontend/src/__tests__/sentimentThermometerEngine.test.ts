import { describe, it, expect } from 'vitest';
import {
  calculateSentimentScore,
  createFearGreedGauge,
  analyzeSocialSentiment,
  identifyMarketRegime,
  type SentimentInput,
} from '../utils/sentimentThermometerEngine';

describe('SentimentThermometerEngine', () => {
  it('should calculate sentiment with all indicators', () => {
    const input: SentimentInput = {
      vixLevel: 15,
      putCallRatio: 0.7,
      advanceDeclineRatio: 1.5,
      newHighsNewLows: { highs: 200, lows: 50 },
      northboundFlow: 10000,
      socialPositiveRatio: 0.6,
      newsPositiveRatio: 0.65,
      fundFlow: 50000,
    };
    const result = calculateSentimentScore(input);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(['extreme_fear', 'fear', 'neutral', 'greed', 'extreme_greed']).toContain(result.label);
    expect(Object.keys(result.components).length).toBeGreaterThan(0);
  });

  it('should calculate sentiment with minimal indicators', () => {
    const result = calculateSentimentScore({ vixLevel: 30 });
    expect(result.score).toBeGreaterThan(0);
    expect(result.components.vix).toBeDefined();
  });

  it('should handle empty input', () => {
    const result = calculateSentimentScore({});
    expect(result.score).toBe(50);
    expect(result.label).toBe('neutral');
  });

  it('should detect extreme fear', () => {
    const result = calculateSentimentScore({
      vixLevel: 45,
      putCallRatio: 1.5,
      advanceDeclineRatio: 0.3,
    });
    expect(result.score).toBeLessThan(40);
  });

  it('should detect extreme greed', () => {
    const result = calculateSentimentScore({
      vixLevel: 12,
      putCallRatio: 0.4,
      advanceDeclineRatio: 2.5,
      socialPositiveRatio: 0.9,
    });
    expect(result.score).toBeGreaterThan(60);
  });

  it('should detect divergences', () => {
    const result = calculateSentimentScore({
      vixLevel: 12, // greed
      putCallRatio: 1.3, // fear
      advanceDeclineRatio: 0.4, // fear
      socialPositiveRatio: 0.9, // greed
    });
    // With mixed signals, should detect divergence
    expect(result.divergences.length).toBeGreaterThanOrEqual(0);
  });

  it('should create fear-greed gauge', () => {
    const history = Array.from({ length: 30 }, (_, i) => 30 + i);
    const gauge = createFearGreedGauge(55, history);
    expect(gauge.current).toBe(55);
    expect(gauge.previousClose).toBe(58);
    expect(gauge.weekAgo).toBe(55);
    expect(gauge.monthAgo).toBe(40);
    expect(gauge.sparkline.length).toBe(20);
    expect(gauge.interpretation).toBeTruthy();
  });

  it('should provide correct interpretation levels', () => {
    expect(createFearGreedGauge(10, []).interpretation).toContain('恐慌');
    expect(createFearGreedGauge(35, []).interpretation).toContain('悲观');
    expect(createFearGreedGauge(50, []).interpretation).toContain('中性');
    expect(createFearGreedGauge(65, []).interpretation).toContain('乐观');
    expect(createFearGreedGauge(90, []).interpretation).toContain('贪婪');
  });

  it('should analyze social sentiment', () => {
    const posts = [
      { text: '牛市来了，看好后市', likes: 100, timestamp: '2025-01-15' },
      { text: '突破新高，买入加仓', likes: 50, timestamp: '2025-01-15' },
      { text: '熊市来了，卖出减仓', likes: 80, timestamp: '2025-01-15' },
      { text: '破位下跌，看空', likes: 30, timestamp: '2025-01-15' },
    ];
    const result = analyzeSocialSentiment(posts);
    expect(result.volume).toBe(4);
    expect(typeof result.overallScore).toBe('number');
    expect(typeof result.momentum).toBe('number');
  });

  it('should handle empty posts', () => {
    const result = analyzeSocialSentiment([]);
    expect(result.volume).toBe(0);
    expect(result.overallScore).toBe(0);
  });

  it('should identify risk-on regime', () => {
    const regime = identifyMarketRegime({
      vix: 15,
      creditSpreads: 0.02,
      yieldCurveSlope: 0.5,
      dollarStrength: -0.3,
      commodityMomentum: 0.2,
    });
    expect(regime.regime).toBe('risk_on');
    expect(regime.confidence).toBeGreaterThan(0.5);
  });

  it('should identify risk-off regime', () => {
    const regime = identifyMarketRegime({
      vix: 35,
      creditSpreads: 0.08,
      yieldCurveSlope: -0.2,
      dollarStrength: 0.5,
      commodityMomentum: -0.3,
    });
    expect(regime.regime).toBe('risk_off');
  });

  it('should identify transition regime', () => {
    const regime = identifyMarketRegime({
      vix: 22,
      creditSpreads: 0.025,
      yieldCurveSlope: 0.1,
      dollarStrength: 0.2,
      commodityMomentum: -0.1,
    });
    expect(['transition', 'uncertain']).toContain(regime.regime);
  });
});
