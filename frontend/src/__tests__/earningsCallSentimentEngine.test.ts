import { describe, it, expect } from 'vitest';
import { analyzeEarningsCallSentiment, EarningsCall } from '../utils/earningsCallSentimentEngine';

describe('财报电话会议情绪引擎', () => {
  const calls: EarningsCall[] = [
    { companyName: 'A公司', date: '2023-05-10', quarter: 'Q1', sentimentScore: 0.2, confidenceWords: 20, uncertaintyWords: 10, forwardLookingStatements: 8, guidanceBeat: true, qaSentiment: 0.3, keyTopics: ['增长', '新业务'] },
    { companyName: 'A公司', date: '2023-08-10', quarter: 'Q2', sentimentScore: 0.1, confidenceWords: 18, uncertaintyWords: 12, forwardLookingStatements: 10, guidanceBeat: true, qaSentiment: 0.2, keyTopics: ['增长', '成本控制'] },
    { companyName: 'A公司', date: '2023-11-10', quarter: 'Q3', sentimentScore: 0.15, confidenceWords: 22, uncertaintyWords: 8, forwardLookingStatements: 7, guidanceBeat: false, qaSentiment: 0.25, keyTopics: ['市场份额', '创新'] },
    { companyName: 'A公司', date: '2024-02-10', quarter: 'Q4', sentimentScore: 0.25, confidenceWords: 25, uncertaintyWords: 8, forwardLookingStatements: 6, guidanceBeat: true, qaSentiment: 0.35, keyTopics: ['增长', '新业务', '国际'] },
  ];

  it('应该分析当前情绪', () => {
    const result = analyzeEarningsCallSentiment(calls);
    expect(result.currentSentiment).toBe(0.25);
  });

  it('应该判断情绪趋势', () => {
    const result = analyzeEarningsCallSentiment(calls);
    expect(['improving', 'deteriorating', 'stable']).toContain(result.sentimentTrend);
  });

  it('应该计算信心指数', () => {
    const result = analyzeEarningsCallSentiment(calls);
    expect(result.confidenceIndex).toBeGreaterThan(0);
    expect(result.confidenceIndex).toBeLessThanOrEqual(1);
  });

  it('应该分析指引信号', () => {
    const result = analyzeEarningsCallSentiment(calls);
    expect(['positive', 'negative', 'neutral']).toContain(result.guidanceSignal);
  });

  it('应该分析主题情绪', () => {
    const result = analyzeEarningsCallSentiment(calls);
    expect(result.topicSentiments.length).toBeGreaterThan(0);
  });

  it('应该生成综合信号', () => {
    const result = analyzeEarningsCallSentiment(calls);
    expect(['bullish', 'bearish', 'neutral']).toContain(result.overallSignal);
    expect(result.signalStrength).toBeGreaterThanOrEqual(0);
    expect(result.signalStrength).toBeLessThanOrEqual(100);
  });

  it('悲观公司应有负面信号', () => {
    const negativeCalls: EarningsCall[] = [
      { companyName: 'B', date: '2024-01-01', quarter: 'Q1', sentimentScore: -0.5, confidenceWords: 5, uncertaintyWords: 30, forwardLookingStatements: 20, guidanceBeat: false, qaSentiment: -0.4, keyTopics: ['困难'] },
    ];
    const result = analyzeEarningsCallSentiment(negativeCalls);
    expect(result.overallSignal).toBe('bearish');
  });

  it('空数据应抛出错误', () => {
    expect(() => analyzeEarningsCallSentiment([])).toThrow();
  });

  it('应该生成警报', () => {
    const result = analyzeEarningsCallSentiment(calls);
    expect(Array.isArray(result.alerts)).toBe(true);
  });

  it('应该使用最新一期数据', () => {
    const result = analyzeEarningsCallSentiment(calls);
    expect(result.currentSentiment).toBe(calls[calls.length - 1].sentimentScore);
  });
});
