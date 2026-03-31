import { describe, it, expect } from 'vitest';

/**
 * 股票对比功能测试
 */

interface StockData {
  code: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  turnover: number;
  high: number;
  low: number;
  open: number;
  preClose: number;
  marketCap: number;
  pe: number;
  pb: number;
  timestamp: string;
}

interface RelativePerformance {
  baseCode: string;
  compareCode: string;
  correlation: number;
  beta: number;
  relativeStrength: number;
  outperformance: number;
  trackingError: number;
  informationRatio: number;
}

function calcCorrelation(series1: number[], series2: number[]): number {
  if (series1.length !== series2.length || series1.length < 2) return 0;
  const n = series1.length;
  const mean1 = series1.reduce((s, v) => s + v, 0) / n;
  const mean2 = series2.reduce((s, v) => s + v, 0) / n;
  let num = 0, den1 = 0, den2 = 0;
  for (let i = 0; i < n; i++) {
    const diff1 = series1[i] - mean1;
    const diff2 = series2[i] - mean2;
    num += diff1 * diff2;
    den1 += diff1 * diff1;
    den2 += diff2 * diff2;
  }
  const den = Math.sqrt(den1 * den2);
  return den > 0 ? num / den : 0;
}

function calcBeta(stockReturns: number[], marketReturns: number[]): number {
  if (stockReturns.length !== marketReturns.length || stockReturns.length < 2) return 1;
  const cov = calcCovariance(stockReturns, marketReturns);
  const marketVar = calcVariance(marketReturns);
  return marketVar > 0 ? cov / marketVar : 1;
}

function calcCovariance(s1: number[], s2: number[]): number {
  const n = s1.length;
  const mean1 = s1.reduce((s, v) => s + v, 0) / n;
  const mean2 = s2.reduce((s, v) => s + v, 0) / n;
  return s1.reduce((s, v, i) => s + (v - mean1) * (s2[i] - mean2), 0) / n;
}

function calcVariance(s: number[]): number {
  const mean = s.reduce((sum, v) => sum + v, 0) / s.length;
  return s.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / s.length;
}

function compareRelativePerformance(
  baseReturns: number[],
  compareReturns: number[]
): Omit<RelativePerformance, 'baseCode' | 'compareCode'> {
  const correlation = calcCorrelation(baseReturns, compareReturns);
  const beta = calcBeta(baseReturns, compareReturns);
  const baseCumReturn = baseReturns.reduce((r, v) => r * (1 + v), 1) - 1;
  const compareCumReturn = compareReturns.reduce((r, v) => r * (1 + v), 1) - 1;
  const outperformance = baseCumReturn - compareCumReturn;
  const diffs = baseReturns.map((r, i) => r - compareReturns[i]);
  const trackingError = Math.sqrt(calcVariance(diffs));
  const meanDiff = diffs.reduce((s, v) => s + v, 0) / diffs.length;
  const informationRatio = trackingError > 0 ? meanDiff / trackingError : 0;
  const relativeStrength = compareCumReturn !== 0 ? baseCumReturn / compareCumReturn : 1;

  return {
    correlation: Math.round(correlation * 10000) / 10000,
    beta: Math.round(beta * 10000) / 10000,
    relativeStrength: Math.round(relativeStrength * 10000) / 10000,
    outperformance: Math.round(outperformance * 10000) / 10000,
    trackingError: Math.round(trackingError * 10000) / 10000,
    informationRatio: Math.round(informationRatio * 10000) / 10000,
  };
}

describe('Stock Compare', () => {
  const stock1Returns = [0.01, 0.02, -0.01, 0.03, 0.01, -0.02, 0.02, 0.01, -0.01, 0.02];
  const stock2Returns = [0.02, 0.01, -0.02, 0.02, 0.02, -0.01, 0.01, 0.02, -0.02, 0.01];
  const marketReturns = [0.01, 0.015, -0.015, 0.025, 0.015, -0.015, 0.015, 0.015, -0.015, 0.015];

  describe('相关性', () => {
    it('应该计算两个序列的相关系数', () => {
      const corr = calcCorrelation(stock1Returns, stock2Returns);
      expect(corr).toBeGreaterThan(-1);
      expect(corr).toBeLessThan(1);
    });

    it('相同序列应该相关系数为1', () => {
      expect(calcCorrelation(stock1Returns, stock1Returns)).toBe(1);
    });

    it('完全负相关应该返回-1', () => {
      const neg = stock1Returns.map(v => -v);
      expect(calcCorrelation(stock1Returns, neg)).toBeCloseTo(-1, 5);
    });

    it('空数据应该返回0', () => {
      expect(calcCorrelation([], [])).toBe(0);
    });
  });

  describe('Beta', () => {
    it('应该计算Beta值', () => {
      const beta = calcBeta(stock1Returns, marketReturns);
      expect(typeof beta).toBe('number');
    });

    it('与市场相同应该Beta为1', () => {
      expect(calcBeta(marketReturns, marketReturns)).toBeCloseTo(1, 5);
    });
  });

  describe('相对表现', () => {
    it('应该计算完整对比结果', () => {
      const result = compareRelativePerformance(stock1Returns, stock2Returns);
      expect(result.correlation).toBeDefined();
      expect(result.beta).toBeDefined();
      expect(result.relativeStrength).toBeDefined();
      expect(result.outperformance).toBeDefined();
      expect(result.trackingError).toBeDefined();
      expect(result.informationRatio).toBeDefined();
    });

    it('跟踪误差应该非负', () => {
      const result = compareRelativePerformance(stock1Returns, stock2Returns);
      expect(result.trackingError).toBeGreaterThanOrEqual(0);
    });
  });

  describe('方差和协方差', () => {
    it('应该计算方差', () => {
      const variance = calcVariance([1, 2, 3, 4, 5]);
      expect(variance).toBe(2);
    });

    it('应该计算协方差', () => {
      const cov = calcCovariance([1, 2, 3], [2, 4, 6]);
      expect(cov).toBeCloseTo(4/3, 2);
    });
  });
});
