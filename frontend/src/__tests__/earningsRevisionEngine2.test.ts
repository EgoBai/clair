import { describe, it, expect } from 'vitest';
import { analyzeEarningsRevision, EarningsRevisionData } from '../utils/earningsRevisionEngine2';

describe('盈利预期修正引擎V2', () => {
  const data: EarningsRevisionData = {
    symbol: 'TEST',
    currentEstimates: {
      date: '2024-03-01', epsEstimate: 2.5, revenueEstimate: 10000,
      analystCount: 15, buyRatings: 10, holdRatings: 4, sellRatings: 1,
    },
    historicalEstimates: [
      { date: '2024-01-01', epsEstimate: 2.0, revenueEstimate: 9000, analystCount: 10, buyRatings: 7, holdRatings: 2, sellRatings: 1 },
      { date: '2024-02-01', epsEstimate: 2.2, revenueEstimate: 9500, analystCount: 12, buyRatings: 8, holdRatings: 3, sellRatings: 1 },
    ],
    actualEps: 2.3,
  };

  it('应计算EPS修正比', () => {
    const r = analyzeEarningsRevision(data);
    expect(r.epsRevisionRatio).toBeGreaterThan(0);
  });

  it('应判断修正趋势', () => {
    const r = analyzeEarningsRevision(data);
    expect(['upward', 'stable', 'downward']).toContain(r.revisionTrend);
  });

  it('应计算修正动量', () => {
    const r = analyzeEarningsRevision(data);
    expect(typeof r.revisionMomentum).toBe('number');
  });

  it('应判断分析师共识', () => {
    const r = analyzeEarningsRevision(data);
    expect(['strong_buy', 'buy', 'hold', 'sell', 'strong_sell']).toContain(r.analystConsensus);
  });

  it('应判断覆盖变化', () => {
    const r = analyzeEarningsRevision(data);
    expect(['increasing', 'stable', 'decreasing']).toContain(r.coverageChange);
  });

  it('应计算盈利惊喜', () => {
    const r = analyzeEarningsRevision(data);
    expect(r.earningsSurprise).not.toBeNull();
  });

  it('应输出修正评分', () => {
    const r = analyzeEarningsRevision(data);
    expect(r.revisionScore).toBeGreaterThanOrEqual(0);
    expect(r.revisionScore).toBeLessThanOrEqual(100);
  });

  it('应输出信号', () => {
    const r = analyzeEarningsRevision(data);
    expect(Array.isArray(r.signals)).toBe(true);
  });

  it('数据不足应抛出错误', () => {
    expect(() => analyzeEarningsRevision({ ...data, historicalEstimates: [data.historicalEstimates[0]] })).toThrow();
  });

  it('应计算置信度', () => {
    const r = analyzeEarningsRevision(data);
    expect(r.confidence).toBeGreaterThan(0);
  });
});
