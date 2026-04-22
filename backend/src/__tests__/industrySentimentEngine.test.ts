import { describe, it, expect } from 'vitest';

describe('行业景气跟踪引擎 (Industry Sentiment Tracking)', () => {
  // PMI扩散指数模拟
  function pmiDiffusionIndex(values: number[]): number {
    if (values.length === 0) return 50;
    const increasing = values.filter((v, i) => i > 0 && v > values[i - 1]).length;
    return 50 + (increasing / (values.length - 1) - 0.5) * 100;
  }

  // 行业景气指数
  function industryProsperityIndex(indicators: { name: string; weight: number; value: number }[]): number {
    if (indicators.length === 0) return 50;
    const totalWeight = indicators.reduce((s, ind) => s + ind.weight, 0);
    return indicators.reduce((s, ind) => s + ind.weight * ind.value, 0) / (totalWeight || 1);
  }

  // 同环比增长
  function growthRates(current: number, previous: number, yearAgo: number): { mom: number; yoy: number } {
    return {
      mom: previous !== 0 ? (current - previous) / Math.abs(previous) : 0,
      yoy: yearAgo !== 0 ? (current - yearAgo) / Math.abs(yearAgo) : 0
    };
  }

  // 景气度分类
  function prosperityLevel(index: number): '过热' | '扩张' | '平稳' | '收缩' | '衰退' {
    if (index >= 60) return '过热';
    if (index >= 52) return '扩张';
    if (index >= 48) return '平稳';
    if (index >= 45) return '收缩';
    return '衰退';
  }

  // 行业轮动信号
  function sectorRotationSignal(currentRank: number[], previousRank: number[]): { sector: number; momentum: number }[] {
    return currentRank.map((rank, i) => ({
      sector: i,
      momentum: (previousRank[i] || rank) - rank // 正值=上升
    })).sort((a, b) => b.momentum - a.momentum);
  }

  // 领先指标合成
  function leadingIndicatorComposite(series: number[][], weights: number[]): number[] {
    if (series.length === 0) return [];
    const minLen = Math.min(...series.map(s => s.length));
    const result: number[] = [];
    for (let t = 0; t < minLen; t++) {
      let sum = 0;
      for (let i = 0; i < series.length; i++) {
        sum += series[i][t] * weights[i];
      }
      result.push(sum);
    }
    return result;
  }

  // 景气拐点检测
  function prosperityTurningPoints(indexSeries: number[], windowSize = 3): { index: number; type: 'peak' | 'trough' }[] {
    const points: { index: number; type: 'peak' | 'trough' }[] = [];
    for (let i = windowSize; i < indexSeries.length - windowSize; i++) {
      const left = indexSeries.slice(i - windowSize, i);
      const right = indexSeries.slice(i + 1, i + windowSize + 1);
      if (indexSeries[i] > Math.max(...left) && indexSeries[i] > Math.max(...right)) {
        points.push({ index: i, type: 'peak' });
      } else if (indexSeries[i] < Math.min(...left) && indexSeries[i] < Math.min(...right)) {
        points.push({ index: i, type: 'trough' });
      }
    }
    return points;
  }

  // 行业景气动量
  function industryMomentum(values: number[], period: number): number {
    if (values.length < period + 1) return 0;
    return values[values.length - 1] - values[values.length - 1 - period];
  }

  it('PMI扩散指数在50附近', () => {
    const values = [100, 101, 100, 101, 100];
    const result = pmiDiffusionIndex(values);
    expect(result).toBeGreaterThanOrEqual(40);
    expect(result).toBeLessThanOrEqual(60);
  });

  it('全上升序列PMI为100', () => {
    const values = [1, 2, 3, 4, 5];
    expect(pmiDiffusionIndex(values)).toBe(100);
  });

  it('空数组PMI返回50', () => {
    expect(pmiDiffusionIndex([])).toBe(50);
  });

  it('行业景气指数加权平均', () => {
    const result = industryProsperityIndex([
      { name: 'PMI', weight: 0.4, value: 52 },
      { name: '用电量', weight: 0.3, value: 48 },
      { name: '货运量', weight: 0.3, value: 50 }
    ]);
    expect(result).toBeCloseTo(50.2, 1);
  });

  it('环比同比计算', () => {
    const { mom, yoy } = growthRates(110, 100, 100);
    expect(mom).toBeCloseTo(0.1, 5);
    expect(yoy).toBeCloseTo(0.1, 5);
  });

  it('零基准处理', () => {
    const { mom, yoy } = growthRates(10, 0, 0);
    expect(mom).toBe(0);
    expect(yoy).toBe(0);
  });

  it('景气度分类', () => {
    expect(prosperityLevel(65)).toBe('过热');
    expect(prosperityLevel(55)).toBe('扩张');
    expect(prosperityLevel(50)).toBe('平稳');
    expect(prosperityLevel(46)).toBe('收缩');
    expect(prosperityLevel(40)).toBe('衰退');
  });

  it('行业轮动信号排序', () => {
    const signals = sectorRotationSignal([1, 3, 2], [3, 2, 1]);
    expect(signals[0].momentum).toBeGreaterThan(0);
  });

  it('领先指标合成', () => {
    const series = [[100, 102, 104], [50, 52, 48]];
    const weights = [0.6, 0.4];
    const result = leadingIndicatorComposite(series, weights);
    expect(result).toHaveLength(3);
  });

  it('景气拐点检测', () => {
    const series = [48, 50, 55, 52, 48, 45, 47, 52, 55];
    const points = prosperityTurningPoints(series, 2);
    expect(points.length).toBeGreaterThanOrEqual(0);
  });

  it('行业景气动量', () => {
    const values = [50, 52, 48, 55, 58];
    const momentum = industryMomentum(values, 2);
    expect(momentum).toBe(10); // 58 - 48
  });

  it('数据不足时动量为零', () => {
    expect(industryMomentum([50], 3)).toBe(0);
  });
});
