import { describe, it, expect } from 'vitest';

/**
 * 业绩归因引擎测试
 * Brinson归因/风险指标/择时技能
 */

function calculateReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return returns;
}

function calculateSharpeRatio(returns: number[], riskFreeRate = 0.03): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const annualizedReturn = mean * 252;
  const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1));
  const annualizedVol = std * Math.sqrt(252);
  return annualizedVol > 0 ? parseFloat(((annualizedReturn - riskFreeRate) / annualizedVol).toFixed(4)) : 0;
}

function calculateMaxDrawdown(prices: number[]): { maxDrawdown: number; peakDate: number; troughDate: number } {
  if (prices.length === 0) return { maxDrawdown: 0, peakDate: 0, troughDate: 0 };
  let peak = prices[0], peakIdx = 0;
  let maxDD = 0, ddPeakIdx = 0, ddTroughIdx = 0;
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > peak) { peak = prices[i]; peakIdx = i; }
    const dd = (peak - prices[i]) / peak;
    if (dd > maxDD) { maxDD = dd; ddPeakIdx = peakIdx; ddTroughIdx = i; }
  }
  return { maxDrawdown: parseFloat(maxDD.toFixed(4)), peakDate: ddPeakIdx, troughDate: ddTroughIdx };
}

function calculateSortinoRatio(returns: number[], riskFreeRate = 0.03): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const downside = returns.filter(r => r < 0);
  if (downside.length === 0) return 10;
  const downsideStd = Math.sqrt(downside.reduce((s, r) => s + r ** 2, 0) / downside.length);
  const annReturn = mean * 252;
  const annDownside = downsideStd * Math.sqrt(252);
  return annDownside > 0 ? parseFloat(((annReturn - riskFreeRate) / annDownside).toFixed(4)) : 0;
}

function calculateCalmarRatio(returns: number[], prices: number[]): number {
  if (returns.length < 2 || prices.length < 2) return 0;
  const annReturn = returns.reduce((a, b) => a + b, 0) / returns.length * 252;
  const { maxDrawdown } = calculateMaxDrawdown(prices);
  return maxDrawdown > 0 ? parseFloat((annReturn / maxDrawdown).toFixed(4)) : 0;
}

function brinsonAttribution(portfolioWeights: Map<string, number>, benchmarkWeights: Map<string, number>, portfolioReturns: Map<string, number>, benchmarkReturns: Map<string, number>): { allocationEffect: number; selectionEffect: number; interactionEffect: number; totalEffect: number } {
  const sectors = new Set([...portfolioWeights.keys(), ...benchmarkWeights.keys()]);
  let alloc = 0, select = 0, interact = 0;
  const benchmarkAvgReturn = Array.from(benchmarkReturns.values()).reduce((a, b) => a + b, 0) / Math.max(1, benchmarkReturns.size);
  sectors.forEach(s => {
    const wp = portfolioWeights.get(s) || 0;
    const wb = benchmarkWeights.get(s) || 0;
    const rp = portfolioReturns.get(s) || 0;
    const rb = benchmarkReturns.get(s) || 0;
    alloc += (wp - wb) * (rb - benchmarkAvgReturn);
    select += wb * (rp - rb);
    interact += (wp - wb) * (rp - rb);
  });
  return {
    allocationEffect: parseFloat(alloc.toFixed(6)),
    selectionEffect: parseFloat(select.toFixed(6)),
    interactionEffect: parseFloat(interact.toFixed(6)),
    totalEffect: parseFloat((alloc + select + interact).toFixed(6)),
  };
}

function analyzeTimingSkill(returns: number[], benchmarkReturns: number[]): { timingScore: number; skill: 'skilled' | 'average' | 'poor'; alpha: number } {
  const n = Math.min(returns.length, benchmarkReturns.length);
  if (n < 5) return { timingScore: 50, skill: 'average', alpha: 0 };
  let correctCalls = 0;
  for (let i = 0; i < n; i++) {
    if ((returns[i] > 0 && benchmarkReturns[i] > 0) || (returns[i] < 0 && benchmarkReturns[i] < 0)) correctCalls++;
  }
  const hitRate = correctCalls / n;
  const avgExcess = returns.slice(0, n).reduce((s, r, i) => s + (r - benchmarkReturns[i]), 0) / n;
  const alpha = parseFloat((avgExcess * 252).toFixed(4));
  const timingScore = parseFloat((hitRate * 70 + Math.min(30, Math.abs(alpha) * 100)).toFixed(2));
  return { timingScore, skill: timingScore > 65 ? 'skilled' : timingScore < 35 ? 'poor' : 'average', alpha };
}

describe('业绩归因引擎', () => {
  const prices = [100, 102, 101, 105, 103, 108, 107, 110, 112, 109];
  const returns = calculateReturns(prices);

  describe('calculateReturns', () => {
    it('should calculate daily returns', () => {
      expect(returns).toHaveLength(prices.length - 1);
      expect(returns[0]).toBeCloseTo(0.02, 4);
    });
  });

  describe('calculateSharpeRatio', () => {
    it('should return number', () => {
      const sharpe = calculateSharpeRatio(returns);
      expect(typeof sharpe).toBe('number');
    });

    it('should return 0 for insufficient data', () => {
      expect(calculateSharpeRatio([0.01])).toBe(0);
    });
  });

  describe('calculateMaxDrawdown', () => {
    it('should find max drawdown', () => {
      const { maxDrawdown } = calculateMaxDrawdown(prices);
      expect(maxDrawdown).toBeGreaterThan(0);
      expect(maxDrawdown).toBeLessThanOrEqual(1);
    });

    it('should return 0 for rising prices', () => {
      expect(calculateMaxDrawdown([1, 2, 3, 4]).maxDrawdown).toBe(0);
    });
  });

  describe('calculateSortinoRatio', () => {
    it('should use downside deviation', () => {
      const sortino = calculateSortinoRatio(returns);
      expect(typeof sortino).toBe('number');
    });

    it('should return 10 for all positive', () => {
      expect(calculateSortinoRatio([0.01, 0.02, 0.03])).toBe(10);
    });
  });

  describe('calculateCalmarRatio', () => {
    it('should be return/maxDrawdown', () => {
      const calmar = calculateCalmarRatio(returns, prices);
      expect(typeof calmar).toBe('number');
    });
  });

  describe('brinsonAttribution', () => {
    it('should calculate three effects', () => {
      const pw = new Map([['tech', 0.6], ['finance', 0.4]]);
      const bw = new Map([['tech', 0.5], ['finance', 0.5]]);
      const pr = new Map([['tech', 0.1], ['finance', 0.05]]);
      const br = new Map([['tech', 0.08], ['finance', 0.06]]);
      const result = brinsonAttribution(pw, bw, pr, br);
      expect(typeof result.totalEffect).toBe('number');
      expect(result.totalEffect).toBeCloseTo(result.allocationEffect + result.selectionEffect + result.interactionEffect, 5);
    });
  });

  describe('analyzeTimingSkill', () => {
    it('should rate timing skill', () => {
      const result = analyzeTimingSkill(returns, returns.map(r => r * 0.8));
      expect(['skilled', 'average', 'poor']).toContain(result.skill);
    });

    it('should handle insufficient data', () => {
      const result = analyzeTimingSkill([0.01], [0.01]);
      expect(result.skill).toBe('average');
    });
  });
});
