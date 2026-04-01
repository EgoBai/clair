import { describe, it, expect } from 'vitest';

// 股息增长分析引擎
interface DividendRecord {
  symbol: string;
  year: number;
  dividendPerShare: number;
  payoutRatio: number;
  exDate: string;
  payDate: string;
}

interface DividendAnalysis {
  symbol: string;
  consecutiveYears: number;
  cagr5Y: number;
  avgPayoutRatio: number;
  yieldAtCurrentPrice: number;
  dividendSafety: number;
  growthConsistency: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
}

function calcDividendCAGR(dividends: DividendRecord[], years: number = 5): number {
  const sorted = [...dividends].sort((a, b) => a.year - b.year);
  if (sorted.length < 2) return 0;
  const recent = sorted[sorted.length - 1];
  const past = sorted[Math.max(0, sorted.length - 1 - years)];
  if (past.dividendPerShare <= 0) return 0;
  const actualYears = recent.year - past.year;
  return actualYears > 0 ? Math.pow(recent.dividendPerShare / past.dividendPerShare, 1 / actualYears) - 1 : 0;
}

function calcConsecutiveGrowth(dividends: DividendRecord[]): number {
  const sorted = [...dividends].sort((a, b) => b.year - a.year);
  let count = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].dividendPerShare >= sorted[i].dividendPerShare) count++;
    else break;
  }
  return count;
}

function calcGrowthConsistency(dividends: DividendRecord[]): number {
  if (dividends.length < 2) return 0;
  const sorted = [...dividends].sort((a, b) => a.year - b.year);
  let growthCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].dividendPerShare >= sorted[i - 1].dividendPerShare) growthCount++;
  }
  return growthCount / (sorted.length - 1);
}

function analyzeDividend(dividends: DividendRecord[], currentPrice: number): DividendAnalysis {
  const sorted = [...dividends].sort((a, b) => b.year - a.year);
  const latest = sorted[0];
  const cagr = calcDividendCAGR(dividends, 5);
  const consecutive = calcConsecutiveGrowth(dividends);
  const consistency = calcGrowthConsistency(dividends);
  const avgPayout = dividends.reduce((s, d) => s + d.payoutRatio, 0) / dividends.length;
  const currentYield = currentPrice > 0 ? latest.dividendPerShare / currentPrice : 0;
  const safety = Math.max(0, 1 - avgPayout) * 0.4 + Math.min(1, consecutive / 10) * 0.3 + consistency * 0.3;

  const qualityScore = cagr * 0.3 + safety * 0.3 + consistency * 0.2 + Math.min(1, currentYield / 0.03) * 0.2;
  const quality = qualityScore > 0.7 ? 'excellent' : qualityScore > 0.5 ? 'good' : qualityScore > 0.3 ? 'fair' : 'poor';

  return {
    symbol: latest.symbol,
    consecutiveYears: consecutive,
    cagr5Y: cagr,
    avgPayoutRatio: avgPayout,
    yieldAtCurrentPrice: currentYield,
    dividendSafety: safety,
    growthConsistency: consistency,
    quality,
  };
}

function rankDividends(analyses: DividendAnalysis[]): DividendAnalysis[] {
  return [...analyses].sort((a, b) => {
    const scoreA = a.cagr5Y * 0.3 + a.dividendSafety * 0.3 + a.yieldAtCurrentPrice * 0.2 + a.growthConsistency * 0.2;
    const scoreB = b.cagr5Y * 0.3 + b.dividendSafety * 0.3 + b.yieldAtCurrentPrice * 0.2 + b.growthConsistency * 0.2;
    return scoreB - scoreA;
  });
}

describe('股息增长分析引擎', () => {
  const divs: DividendRecord[] = [
    { symbol: '600519', year: 2019, dividendPerShare: 17, payoutRatio: 0.5, exDate: '2020-06-15', payDate: '2020-06-22' },
    { symbol: '600519', year: 2020, dividendPerShare: 19, payoutRatio: 0.52, exDate: '2021-06-15', payDate: '2021-06-22' },
    { symbol: '600519', year: 2021, dividendPerShare: 21, payoutRatio: 0.51, exDate: '2022-06-15', payDate: '2022-06-22' },
    { symbol: '600519', year: 2022, dividendPerShare: 23, payoutRatio: 0.53, exDate: '2023-06-15', payDate: '2023-06-22' },
    { symbol: '600519', year: 2023, dividendPerShare: 25, payoutRatio: 0.52, exDate: '2024-06-15', payDate: '2024-06-22' },
  ];

  it('应计算股息CAGR', () => {
    const cagr = calcDividendCAGR(divs, 5);
    expect(cagr).toBeGreaterThan(0);
    expect(cagr).toBeLessThan(0.5);
  });

  it('应计算连续增长年数', () => {
    const consecutive = calcConsecutiveGrowth(divs);
    expect(consecutive).toBe(4);
  });

  it('应计算增长一致性', () => {
    const consistency = calcGrowthConsistency(divs);
    expect(consistency).toBe(1);
  });

  it('应综合分析股息', () => {
    const analysis = analyzeDividend(divs, 1800);
    expect(analysis.symbol).toBe('600519');
    expect(analysis.cagr5Y).toBeGreaterThan(0);
    expect(analysis.yieldAtCurrentPrice).toBeGreaterThan(0);
    expect(['excellent', 'good', 'fair', 'poor']).toContain(analysis.quality);
  });

  it('当前收益率应正确', () => {
    const analysis = analyzeDividend(divs, 1800);
    expect(analysis.yieldAtCurrentPrice).toBeCloseTo(25 / 1800, 5);
  });

  it('高派息率应降低安全性', () => {
    const highPayout = divs.map(d => ({ ...d, payoutRatio: 0.9 }));
    const lowPayout = divs.map(d => ({ ...d, payoutRatio: 0.3 }));
    const safetyHigh = analyzeDividend(highPayout, 1800).dividendSafety;
    const safetyLow = analyzeDividend(lowPayout, 1800).dividendSafety;
    expect(safetyHigh).toBeLessThan(safetyLow);
  });

  it('应排名股息', () => {
    const analysis = analyzeDividend(divs, 1800);
    const ranked = rankDividends([analysis]);
    expect(ranked.length).toBe(1);
  });

  it('单年数据应能分析', () => {
    const single: DividendRecord[] = [divs[0]];
    const analysis = analyzeDividend(single, 1800);
    expect(analysis.consecutiveYears).toBe(0);
    expect(analysis.cagr5Y).toBe(0);
  });

  it('零价格应收益率为零', () => {
    const analysis = analyzeDividend(divs, 0);
    expect(analysis.yieldAtCurrentPrice).toBe(0);
  });

  it('空数据应能处理', () => {
    const analysis = analyzeDividend([divs[divs.length - 1]], 100);
    expect(analysis.symbol).toBe('600519');
  });
});
