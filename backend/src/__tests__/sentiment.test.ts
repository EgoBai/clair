/**
 * 情绪分析引擎测试 - Round 15
 * 测试: 连续梯度评分, 新闻文本情绪, 背离检测
 */
import { describe, it, expect } from 'vitest';
import {
  calculateSentimentScore,
  detectSentimentDivergence,
  calculateSentimentMovingAverage,
  analyzeNewsSentiment,
  SentimentData,
  SentimentScore,
} from '../services/sentimentAnalysisEngine';

function makeData(overrides: Partial<SentimentData> = {}): SentimentData {
  return {
    timestamp: new Date(),
    putCallRatio: 0.9,
    vixLevel: 20,
    marginBalance: 1e12,
    shortBalance: 3e10,
    newAccountCount: 300000,
    fundFlow: 0,
    limitUpCount: 50,
    limitDownCount: 30,
    advanceDeclineRatio: 0.5,
    ...overrides,
  };
}

describe('analyzeNewsSentiment', () => {
  it('should detect positive sentiment from bullish keywords', () => {
    const result = analyzeNewsSentiment('A股三大指数集体收涨，沪指重回3100点，涨停');
    expect(result.score).toBeGreaterThan(0);
    expect(result.category).toBe('positive');
    expect(result.confidence).toBeGreaterThan(0.2);
  });

  it('should detect negative sentiment from bearish keywords', () => {
    const result = analyzeNewsSentiment('房地产板块承压下行，多只个股跌停，暴跌');
    expect(result.score).toBeLessThan(0);
    expect(result.category).toBe('negative');
  });

  it('should detect mixed sentiment', () => {
    const result = analyzeNewsSentiment('部分个股涨停，但多只蓝筹股下跌回调');
    expect(result.category).toBe('mixed');
  });

  it('should return neutral for non-financial text', () => {
    const result = analyzeNewsSentiment('今天天气不错');
    expect(result.category).toBe('neutral');
    expect(result.confidence).toBeLessThan(0.2);
  });

  it('should handle strong positive with multiple keywords', () => {
    const result = analyzeNewsSentiment('宁德时代固态电池量产突破，业绩超预期，净流入');
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.keywords.length).toBeGreaterThanOrEqual(2);
  });
});

describe('calculateSentimentScore - continuous gradients', () => {
  it('should produce symmetric output for extreme fund flow', () => {
    const bullish = calculateSentimentScore(makeData({ fundFlow: 1e11 }));
    const bearish = calculateSentimentScore(makeData({ fundFlow: -1e11 }));
    expect(bullish.overall).toBeGreaterThan(bearish.overall);
  });

  it('should handle neutral middle ground', () => {
    const score = calculateSentimentScore(makeData());
    expect(score.fearGreedIndex).toBeGreaterThanOrEqual(0);
    expect(score.fearGreedIndex).toBeLessThanOrEqual(100);
  });

  it('should not have cliff edges (gradual change)', () => {
    // PCR from 0.69 to 0.71 should NOT jump from 0.8 to 0
    const low = calculateSentimentScore(makeData({ putCallRatio: 0.69 }));
    const mid = calculateSentimentScore(makeData({ putCallRatio: 0.71 }));
    const diff = Math.abs(low.components.sentiment - mid.components.sentiment);
    expect(diff).toBeLessThan(0.3); // No cliff
  });

  it('should classify extreme fear correctly', () => {
    const score = calculateSentimentScore(makeData({
      fundFlow: -1e11, vixLevel: 35, limitUpCount: 5, limitDownCount: 200,
      advanceDeclineRatio: 0.1, putCallRatio: 1.5, newAccountCount: 50000,
    }));
    expect(score.signal).toBe('extreme_fear');
    expect(score.fearGreedIndex).toBeLessThan(25);
  });

  it('should classify extreme greed correctly', () => {
    const score = calculateSentimentScore(makeData({
      fundFlow: 1e11, vixLevel: 12, limitUpCount: 300, limitDownCount: 5,
      advanceDeclineRatio: 0.9, putCallRatio: 0.5, newAccountCount: 800000,
    }));
    expect(score.signal).toBe('extreme_greed');
    expect(score.fearGreedIndex).toBeGreaterThan(75);
  });

  it('should have valid component ranges', () => {
    const score = calculateSentimentScore(makeData());
    expect(score.components.momentum).toBeGreaterThanOrEqual(-1);
    expect(score.components.momentum).toBeLessThanOrEqual(1);
    expect(score.components.volatility).toBeGreaterThanOrEqual(-1);
    expect(score.components.volatility).toBeLessThanOrEqual(1);
    expect(score.components.volume).toBeGreaterThanOrEqual(-1);
    expect(score.components.volume).toBeLessThanOrEqual(1);
    expect(score.components.breadth).toBeGreaterThanOrEqual(-1);
    expect(score.components.breadth).toBeLessThanOrEqual(1);
    expect(score.components.sentiment).toBeGreaterThanOrEqual(-1);
    expect(score.components.sentiment).toBeLessThanOrEqual(1);
  });
});

describe('detectSentimentDivergence', () => {
  it('should detect bearish divergence', () => {
    const score: SentimentScore = {
      overall: -0.4, fearGreedIndex: 30,
      components: { momentum: -0.5, volatility: -0.3, volume: -0.2, breadth: -0.4, sentiment: -0.5 },
      signal: 'fear', historicalPercentile: 30,
    };
    const div = detectSentimentDivergence(score, 0.03);
    expect(div).not.toBeNull();
    expect(div!.type).toBe('bearish');
  });

  it('should detect bullish divergence', () => {
    const score: SentimentScore = {
      overall: 0.4, fearGreedIndex: 70,
      components: { momentum: 0.5, volatility: 0.3, volume: 0.2, breadth: 0.4, sentiment: 0.5 },
      signal: 'greed', historicalPercentile: 70,
    };
    const div = detectSentimentDivergence(score, -0.03);
    expect(div).not.toBeNull();
    expect(div!.type).toBe('bullish');
  });

  it('should return null when no divergence', () => {
    const score: SentimentScore = {
      overall: 0.1, fearGreedIndex: 55,
      components: { momentum: 0.1, volatility: 0, volume: 0, breadth: 0.1, sentiment: 0.1 },
      signal: 'neutral', historicalPercentile: 55,
    };
    const div = detectSentimentDivergence(score, 0.005);
    expect(div).toBeNull();
  });
});

describe('calculateSentimentMovingAverage', () => {
  it('should compute moving average correctly', () => {
    const scores: SentimentScore[] = Array.from({ length: 7 }, (_, i) => ({
      overall: i * 0.1, fearGreedIndex: 50 + i * 5,
      components: { momentum: 0, volatility: 0, volume: 0, breadth: 0, sentiment: 0 },
      signal: 'neutral' as const, historicalPercentile: 50,
    }));
    const ma = calculateSentimentMovingAverage(scores, 5);
    expect(ma.length).toBe(3);
    expect(ma[0]).toBeCloseTo(0.2, 1); // avg of [0, 0.1, 0.2, 0.3, 0.4]
  });

  it('should return empty if not enough data', () => {
    const scores: SentimentScore[] = [{
      overall: 0.5, fearGreedIndex: 70,
      components: { momentum: 0.5, volatility: 0, volume: 0, breadth: 0, sentiment: 0.5 },
      signal: 'greed', historicalPercentile: 70,
    }];
    expect(calculateSentimentMovingAverage(scores, 5)).toEqual([]);
  });
});
