/**
 * 市场情绪复合引擎测试
 *
 * 测试 computeSentiment() 和 sentimentHistory()
 * 覆盖: 基础计算、多源聚合、边界值、一致性、历史快照
 */

import { describe, it, expect } from 'vitest';
import { computeSentiment, sentimentHistory } from '../services/marketSentimentCompositeEngine';
import type { SentimentInputs } from '../services/marketSentimentCompositeEngine';

const bearMarket: SentimentInputs = {
  putCallRatio: 1.5,
  vixLevel: 30,
  advanceDeclineRatio: 0.2,
  newHighLowRatio: 0.1,
  marginBalance: -20,
  northboundFlow: -30,
  shortInterest: 30,
  turnoverRate: 0.3,
};

const bullMarket: SentimentInputs = {
  putCallRatio: 0.6,
  vixLevel: 12,
  advanceDeclineRatio: 1.8,
  newHighLowRatio: 2.0,
  marginBalance: 15,
  northboundFlow: 60,
  shortInterest: -10,
  turnoverRate: 1.5,
};

const tunedNeutral: SentimentInputs = {
  putCallRatio: 0.9,
  vixLevel: 15,
  advanceDeclineRatio: 2.0,
  newHighLowRatio: 1.5,
  marginBalance: 5,
  northboundFlow: 10,
  shortInterest: 0,
  turnoverRate: 1.0,
};

// ==================== 基础情绪计算 ====================

describe('MarketSentimentCompositeEngine > computeSentiment', () => {
  it('should return extreme_fear for bear market inputs', () => {
    const result = computeSentiment(bearMarket);
    expect(result.overallScore).toBeLessThanOrEqual(20);
    expect(result.level).toBe('extreme_fear');
    expect(result.components).toBeDefined();
    expect(Array.isArray(result.signals)).toBe(true);
    expect(result.signals.length).toBeGreaterThanOrEqual(1);
  });

  it('should return greed for bull market inputs', () => {
    const result = computeSentiment(bullMarket);
    expect(result.overallScore).toBeGreaterThanOrEqual(60);
    // Bull market with 60+ northbound flow → greed range
    expect(Array.of('greed', 'extreme_greed')).toContain(result.level);
  });

  it('should return neutral for balanced inputs', () => {
    const result = computeSentiment(tunedNeutral);
    expect(result.level).toBe('neutral');
    expect(result.overallScore).toBeGreaterThan(40);
    expect(result.overallScore).toBeLessThan(60);
  });

  it('should contain all 5 component scores', () => {
    const result = computeSentiment(tunedNeutral);
    expect(result.components).toHaveProperty('optionsSentiment');
    expect(result.components).toHaveProperty('breadthSentiment');
    expect(result.components).toHaveProperty('flowSentiment');
    expect(result.components).toHaveProperty('volatilitySentiment');
    expect(result.components).toHaveProperty('leverageSentiment');
  });

  it('all component scores should be 0-100', () => {
    const result = computeSentiment(tunedNeutral);
    Object.values(result.components).forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
  });
});

// ==================== 边界值测试 ====================

describe('MarketSentimentCompositeEngine > 边界值', () => {
  it('should handle extreme fear values (lowest sentiment)', () => {
    const extreme: SentimentInputs = {
      putCallRatio: 3.0,
      vixLevel: 50,
      advanceDeclineRatio: 0.01,
      newHighLowRatio: 0.01,
      marginBalance: -50,
      northboundFlow: -100,
      shortInterest: 100,
      turnoverRate: 0.01,
    };
    const result = computeSentiment(extreme);
    expect(result.overallScore).toBeLessThanOrEqual(20);
    expect(result.level).toBe('extreme_fear');
    expect(result.contrarianSignal).toBe('strong_buy');
  });

  it('should handle extreme greed values (highest sentiment)', () => {
    const extreme: SentimentInputs = {
      putCallRatio: 0.1,
      vixLevel: 8,
      advanceDeclineRatio: 5.0,
      newHighLowRatio: 5.0,
      marginBalance: 50,
      northboundFlow: 200,
      shortInterest: -50,
      turnoverRate: 5.0,
    };
    const result = computeSentiment(extreme);
    expect(result.overallScore).toBeGreaterThanOrEqual(80);
    expect(Array.of('greed', 'extreme_greed')).toContain(result.level);
  });

  it('should handle zero turnoverRate', () => {
    const inputs: SentimentInputs = { ...tunedNeutral, turnoverRate: 0 };
    const result = computeSentiment(inputs);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it('should handle negative northboundFlow', () => {
    const inputs: SentimentInputs = { ...tunedNeutral, northboundFlow: -50 };
    const result = computeSentiment(inputs);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });
});

// ==================== 情绪标签一致性 ====================

describe('MarketSentimentCompositeEngine > 标签一致性', () => {
  it('extreme_fear should have contrarianSignal strong_buy', () => {
    const result = computeSentiment(bearMarket);
    expect(result.level).toBe('extreme_fear');
    expect(result.contrarianSignal).toBe('strong_buy');
  });

  it('neutral level should have contrarianSignal neutral', () => {
    const result = computeSentiment(tunedNeutral);
    expect(result.level).toBe('neutral');
    expect(result.contrarianSignal).toBe('neutral');
  });

  it('level should be one of the valid values', () => {
    const result = computeSentiment(tunedNeutral);
    expect(['extreme_fear', 'fear', 'neutral', 'greed', 'extreme_greed']).toContain(result.level);
  });
});

// ==================== 信号生成 ====================

describe('MarketSentimentCompositeEngine > 信号', () => {
  it('bear market should generate fear signals', () => {
    const result = computeSentiment(bearMarket);
    const hasSignal = result.signals.some(s => s.includes('恐慌') || s.includes('极差') || s.includes('飙升'));
    expect(hasSignal).toBe(true);
  });

  it('bull market should generate flow signal', () => {
    const result = computeSentiment(bullMarket);
    const hasFlowSignal = result.signals.some(s => s.includes('大幅流入'));
    expect(hasFlowSignal).toBe(true);
  });

  it('high vix should generate volatility signal', () => {
    const inputs: SentimentInputs = { ...tunedNeutral, vixLevel: 30 };
    const result = computeSentiment(inputs);
    const hasVolSignal = result.signals.some(s => s.includes('波动率'));
    expect(hasVolSignal).toBe(true);
  });
});

// ==================== 历史记录 ====================

describe('MarketSentimentCompositeEngine > sentimentHistory', () => {
  it('should process a single item series', () => {
    const series: SentimentInputs[] = [tunedNeutral];
    const history = sentimentHistory(series);
    expect(history).toHaveLength(1);
    expect(history[0]).toHaveProperty('score');
    expect(history[0]).toHaveProperty('level');
  });

  it('should process multiple time points and show sentiment evolution', () => {
    const series: SentimentInputs[] = [bearMarket, tunedNeutral, bullMarket];
    const history = sentimentHistory(series);
    expect(history).toHaveLength(3);
    // Bear → bull progression
    expect(history[0].score).toBeLessThan(history[2].score);
  });

  it('should handle empty series', () => {
    const history = sentimentHistory([]);
    expect(history).toEqual([]);
  });
});
