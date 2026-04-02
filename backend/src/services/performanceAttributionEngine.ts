/**
 * 绩效归因引擎
 * Brinson模型 + 多因子归因
 */

export interface Holding {
  symbol: string;
  sector: string;
  weight: number;
  return: number;
  benchmarkWeight: number;
  benchmarkReturn: number;
  factorExposures?: Record<string, number>;
}

export interface BrinsonAttribution {
  allocationEffect: number;
  selectionEffect: number;
  interactionEffect: number;
  totalActiveReturn: number;
  sectorBreakdown: SectorAttribution[];
}

export interface SectorAttribution {
  sector: string;
  allocationEffect: number;
  selectionEffect: number;
  interactionEffect: number;
  totalEffect: number;
  portfolioWeight: number;
  benchmarkWeight: number;
}

export interface FactorAttribution {
  factor: string;
  exposure: number;
  return: number;
  contribution: number;
}

export interface PerformanceMetrics {
  totalReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  calmarRatio: number;
  informationRatio: number;
  treynorRatio: number;
  beta: number;
  alpha: number;
  trackingError: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
}

export interface TimeWeightedReturn {
  period: [number, number];
  return: number;
  cumulativeReturn: number;
}

/**
 * Brinson归因分析
 */
export function brinsonAttribution(holdings: Holding[]): BrinsonAttribution {
  const sectors = [...new Set(holdings.map(h => h.sector))];
  const sectorBreakdown: SectorAttribution[] = [];

  for (const sector of sectors) {
    const sectorHoldings = holdings.filter(h => h.sector === sector);
    const wp = sectorHoldings.reduce((s, h) => s + h.weight, 0);
    const wb = sectorHoldings.reduce((s, h) => s + h.benchmarkWeight, 0);
    const rp = sectorHoldings.reduce((s, h) => s + h.weight * h.return, 0) / Math.max(wp, 1e-10);
    const rb = sectorHoldings.reduce((s, h) => s + h.benchmarkWeight * h.benchmarkReturn, 0) / Math.max(wb, 1e-10);
    const rbTotal = holdings.reduce((s, h) => s + h.benchmarkWeight * h.benchmarkReturn, 0);

    const allocationEffect = (wp - wb) * (rb - rbTotal);
    const selectionEffect = wb * (rp - rb);
    const interactionEffect = (wp - wb) * (rp - rb);

    sectorBreakdown.push({
      sector,
      allocationEffect,
      selectionEffect,
      interactionEffect,
      totalEffect: allocationEffect + selectionEffect + interactionEffect,
      portfolioWeight: wp,
      benchmarkWeight: wb,
    });
  }

  return {
    allocationEffect: sectorBreakdown.reduce((s, a) => s + a.allocationEffect, 0),
    selectionEffect: sectorBreakdown.reduce((s, a) => s + a.selectionEffect, 0),
    interactionEffect: sectorBreakdown.reduce((s, a) => s + a.interactionEffect, 0),
    totalActiveReturn: sectorBreakdown.reduce((s, a) => s + a.totalEffect, 0),
    sectorBreakdown,
  };
}

/**
 * 多因子归因
 */
export function factorAttribution(
  holdings: Holding[],
  factorReturns: Record<string, number>,
): FactorAttribution[] {
  const factors = Object.keys(factorReturns);
  const results: FactorAttribution[] = [];

  for (const factor of factors) {
    let totalExposure = 0;
    let totalContribution = 0;

    for (const h of holdings) {
      const exposure = h.factorExposures?.[factor] ?? 0;
      totalExposure += h.weight * exposure;
      totalContribution += h.weight * exposure * factorReturns[factor];
    }

    results.push({
      factor,
      exposure: totalExposure,
      return: factorReturns[factor],
      contribution: totalContribution,
    });
  }

  return results.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

/**
 * 计算绩效指标
 */
export function computePerformanceMetrics(
  returns: number[],
  benchmarkReturns: number[],
  riskFreeRate = 0.02 / 252,
): PerformanceMetrics {
  const n = returns.length;
  if (n === 0) {
    return {
      totalReturn: 0, annualizedReturn: 0, volatility: 0, sharpeRatio: 0,
      sortinoRatio: 0, maxDrawdown: 0, calmarRatio: 0, informationRatio: 0,
      treynorRatio: 0, beta: 0, alpha: 0, trackingError: 0, winRate: 0,
      profitFactor: 0, avgWin: 0, avgLoss: 0, maxConsecutiveWins: 0,
      maxConsecutiveLosses: 0,
    };
  }

  const totalReturn = returns.reduce((prod, r) => prod * (1 + r), 1) - 1;
  const annualizedReturn = Math.pow(1 + totalReturn, 252 / n) - 1;

  const mean = returns.reduce((s, v) => s + v, 0) / n;
  const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const volatility = Math.sqrt(variance) * Math.sqrt(252);

  const downsideReturns = returns.filter(r => r < riskFreeRate);
  const downsideVariance = downsideReturns.length > 0
    ? downsideReturns.reduce((s, v) => s + (v - riskFreeRate) ** 2, 0) / downsideReturns.length : 0;
  const downsideDev = Math.sqrt(downsideVariance) * Math.sqrt(252);

  const sharpeRatio = volatility > 0 ? (annualizedReturn - riskFreeRate * 252) / volatility : 0;
  const sortinoRatio = downsideDev > 0 ? (annualizedReturn - riskFreeRate * 252) / downsideDev : 0;

  // 最大回撤
  let cumulative = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const r of returns) {
    cumulative *= (1 + r);
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, (peak - cumulative) / peak);
  }

  const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;

  // Beta和Alpha
  const benchmarkMean = benchmarkReturns.length > 0
    ? benchmarkReturns.reduce((s, v) => s + v, 0) / Math.min(n, benchmarkReturns.length) : 0;
  const minLen = Math.min(n, benchmarkReturns.length);
  let cov = 0, benchVar = 0;
  for (let i = 0; i < minLen; i++) {
    cov += (returns[i] - mean) * (benchmarkReturns[i] - benchmarkMean);
    benchVar += (benchmarkReturns[i] - benchmarkMean) ** 2;
  }
  const beta = benchVar > 0 ? cov / benchVar : 0;
  const alpha = annualizedReturn - (riskFreeRate * 252 + beta * (benchmarkMean * 252 - riskFreeRate * 252));

  // Tracking Error
  const activeReturns = returns.slice(0, minLen).map((r, i) => r - benchmarkReturns[i]);
  const activeMean = activeReturns.reduce((s, v) => s + v, 0) / minLen;
  const trackingError = Math.sqrt(activeReturns.reduce((s, v) => s + (v - activeMean) ** 2, 0) / minLen) * Math.sqrt(252);
  const informationRatio = trackingError > 0 ? (annualizedReturn - benchmarkMean * 252) / trackingError : 0;
  const treynorRatio = beta !== 0 ? (annualizedReturn - riskFreeRate * 252) / beta : 0;

  // 胜率和盈亏比
  const wins = returns.filter(r => r > 0);
  const losses = returns.filter(r => r <= 0);
  const winRate = wins.length / n;
  const avgWin = wins.length > 0 ? wins.reduce((s, v) => s + v, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, v) => s + v, 0) / losses.length) : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : 0;

  // 连续盈亏
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let currentWins = 0;
  let currentLosses = 0;
  for (const r of returns) {
    if (r > 0) { currentWins++; currentLosses = 0; maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWins); }
    else { currentLosses++; currentWins = 0; maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLosses); }
  }

  return {
    totalReturn,
    annualizedReturn,
    volatility,
    sharpeRatio,
    sortinoRatio,
    maxDrawdown,
    calmarRatio,
    informationRatio,
    treynorRatio,
    beta,
    alpha,
    trackingError,
    winRate,
    profitFactor,
    avgWin,
    avgLoss,
    maxConsecutiveWins,
    maxConsecutiveLosses,
  };
}

/**
 * 计算时间加权收益率
 */
export function computeTimeWeightedReturns(
  cashFlows: { time: number; amount: number }[],
  values: { time: number; value: number }[],
): TimeWeightedReturn[] {
  if (values.length < 2) return [];

  const periods: TimeWeightedReturn[] = [];
  let cumulativeReturn = 0;

  for (let i = 1; i < values.length; i++) {
    const cf = cashFlows.find(c => c.time === values[i].time)?.amount ?? 0;
    const r = (values[i].value - values[i - 1].value - cf) / values[i - 1].value;
    cumulativeReturn = (1 + cumulativeReturn) * (1 + r) - 1;

    periods.push({
      period: [values[i - 1].time, values[i].time],
      return: r,
      cumulativeReturn,
    });
  }

  return periods;
}

/**
 * 滚动绩效分析
 */
export function rollingPerformance(
  returns: number[],
  window: number,
  benchmarkReturns: number[] = [],
): PerformanceMetrics[] {
  if (returns.length < window) return [];

  const results: PerformanceMetrics[] = [];
  for (let i = window - 1; i < returns.length; i++) {
    const windowReturns = returns.slice(i - window + 1, i + 1);
    const windowBench = benchmarkReturns.length > 0
      ? benchmarkReturns.slice(i - window + 1, i + 1) : new Array(window).fill(0);
    results.push(computePerformanceMetrics(windowReturns, windowBench));
  }

  return results;
}
