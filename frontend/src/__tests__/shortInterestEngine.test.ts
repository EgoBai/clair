import { describe, it, expect } from 'vitest';
import { analyzeShortInterest, ShortInterestData } from '../utils/shortInterestEngine';

describe('融券/做空兴趣引擎', () => {
  const data: ShortInterestData = {
    symbol: 'TEST',
    shortShares: 5000000,
    totalShares: 100000000,
    avgDailyVolume: 500000,
    shortRatioHistory: [
      { date: '2024-01-01', ratio: 0.03 },
      { date: '2024-02-01', ratio: 0.04 },
      { date: '2024-03-01', ratio: 0.05 },
    ],
    priceHistory: Array.from({ length: 30 }, (_, i) => ({ date: `2024-01-${i + 1}`, close: 50 + i * 0.5 })),
    borrowCost: 2.5,
    availableShares: 10000000,
  };

  it('应计算融券比例', () => {
    const r = analyzeShortInterest(data);
    expect(r.shortRatio).toBe(0.05);
  });

  it('应计算覆盖天数', () => {
    const r = analyzeShortInterest(data);
    expect(r.daysToCover).toBe(10);
  });

  it('应判断做空趋势', () => {
    const r = analyzeShortInterest(data);
    expect(['increasing', 'stable', 'decreasing']).toContain(r.shortTrend);
  });

  it('应评估挤压风险', () => {
    const r = analyzeShortInterest(data);
    expect(['low', 'moderate', 'high', 'extreme']).toContain(r.squeezeRisk);
  });

  it('应判断融券费率水平', () => {
    const r = analyzeShortInterest(data);
    expect(['low', 'moderate', 'high']).toContain(r.borrowCostLevel);
  });

  it('应判断市场情绪', () => {
    const r = analyzeShortInterest(data);
    expect(['bearish', 'neutral', 'bullish']).toContain(r.sentiment);
  });

  it('应计算风险评分', () => {
    const r = analyzeShortInterest(data);
    expect(r.riskScore).toBeGreaterThanOrEqual(0);
    expect(r.riskScore).toBeLessThanOrEqual(100);
  });

  it('应输出洞察', () => {
    const r = analyzeShortInterest(data);
    expect(Array.isArray(r.insights)).toBe(true);
  });

  it('应检测空头挤压信号', () => {
    const r = analyzeShortInterest(data);
    expect(typeof r.shortSqueezeSignal).toBe('boolean');
  });

  it('高融券比例应为bearish', () => {
    const highShort: ShortInterestData = { ...data, shortShares: 20000000, avgDailyVolume: 200000 };
    const r = analyzeShortInterest(highShort);
    expect(r.sentiment).toBe('bearish');
  });
});
