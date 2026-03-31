import { describe, it, expect } from 'vitest';
import { calculateRelativeStrength } from '../utils/relativeStrengthEngine';

describe('相对强度分析引擎', () => {
  const genPrices = (n: number, trend: number): number[] => {
    const prices: number[] = [100];
    for (let i = 1; i < n; i++) {
      prices.push(prices[i - 1] * (1 + (Math.random() - 0.5 + trend) * 0.02));
    }
    return prices;
  };

  const stockPrices = genPrices(300, 0.002);
  const benchmarkPrices = genPrices(300, -0.001);

  it('应计算RS比率', () => {
    const r = calculateRelativeStrength({ stockPrices, benchmarkPrices, period: 252 });
    expect(r.rsRatio).toBeGreaterThan(0);
  });

  it('应计算RS评级', () => {
    const r = calculateRelativeStrength({ stockPrices, benchmarkPrices, period: 252 });
    expect(r.rsRating).toBeGreaterThanOrEqual(0);
    expect(r.rsRating).toBeLessThanOrEqual(100);
  });

  it('应判断RS趋势', () => {
    const r = calculateRelativeStrength({ stockPrices, benchmarkPrices, period: 252 });
    expect(['improving', 'stable', 'deteriorating']).toContain(r.rsTrend);
  });

  it('应计算个股收益率', () => {
    const r = calculateRelativeStrength({ stockPrices, benchmarkPrices, period: 252 });
    expect(typeof r.stockReturn).toBe('number');
  });

  it('应计算基准收益率', () => {
    const r = calculateRelativeStrength({ stockPrices, benchmarkPrices, period: 252 });
    expect(typeof r.benchmarkReturn).toBe('number');
  });

  it('应计算超额收益', () => {
    const r = calculateRelativeStrength({ stockPrices, benchmarkPrices, period: 252 });
    expect(r.alpha).toBeCloseTo(r.stockReturn - r.benchmarkReturn, 3);
  });

  it('应判断是否跑赢', () => {
    const r = calculateRelativeStrength({ stockPrices, benchmarkPrices, period: 252 });
    expect(typeof r.isOutperforming).toBe('boolean');
  });

  it('应输出强度信号', () => {
    const r = calculateRelativeStrength({ stockPrices, benchmarkPrices, period: 252 });
    expect(['strong_buy', 'buy', 'neutral', 'sell', 'strong_sell']).toContain(r.strengthSignal);
  });

  it('应计算连续跑赢天数', () => {
    const r = calculateRelativeStrength({ stockPrices, benchmarkPrices, period: 252 });
    expect(r.consecutiveOutperformDays).toBeGreaterThanOrEqual(0);
  });

  it('数据不足应抛出错误', () => {
    expect(() => calculateRelativeStrength({ stockPrices: [1, 2], benchmarkPrices: [1, 2], period: 252 })).toThrow();
  });
});
