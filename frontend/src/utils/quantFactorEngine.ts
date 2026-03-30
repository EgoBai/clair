/**
 * 量化因子引擎
 * Fama-French因子/动量因子/质量因子/多因子合成
 */

export interface FactorExposure {
  ticker: string;
  name: string;
  marketBeta: number;    // 市场因子
  sizeFactor: number;    // SMB (小市值溢价)
  valueFactor: number;   // HML (价值溢价)
  momentumFactor: number; // MOM (动量)
  qualityFactor: number;  // RMW (盈利质量)
  lowVolFactor: number;   // CMA (投资保守)
  compositeScore: number;
}

export interface FactorPerformance {
  factor: string;
  dailyReturn: number;
  monthReturn: number;
  yearReturn: number;
  sharpe: number;
  maxDrawdown: number;
  winRate: number;
}

export interface FactorSignal {
  factor: string;
  direction: 'long' | 'short' | 'neutral';
  strength: number;
  ic: number; // 信息系数
  message: string;
}

/**
 * 单因子IC计算 (Rank IC)
 */
export function calculateFactorIC(
  factorValues: number[],
  nextReturns: number[]
): number {
  if (factorValues.length !== nextReturns.length || factorValues.length < 3) return 0;

  const n = factorValues.length;
  const factorRank = rankArray(factorValues);
  const returnRank = rankArray(nextReturns);

  const factorMean = factorRank.reduce((a, b) => a + b, 0) / n;
  const returnMean = returnRank.reduce((a, b) => a + b, 0) / n;

  let cov = 0, varF = 0, varR = 0;
  for (let i = 0; i < n; i++) {
    const df = factorRank[i] - factorMean;
    const dr = returnRank[i] - returnMean;
    cov += df * dr;
    varF += df * df;
    varR += dr * dr;
  }

  if (varF === 0 || varR === 0) return 0;
  return Math.round((cov / Math.sqrt(varF * varR)) * 10000) / 10000;
}

function rankArray(arr: number[]): number[] {
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array(arr.length);
  for (let i = 0; i < indexed.length; i++) {
    ranks[indexed[i].i] = i + 1;
  }
  return ranks;
}

/**
 * 多因子合成
 */
export function compositeFactorScore(
  exposures: FactorExposure[],
  weights: Record<string, number> = {
    marketBeta: 0.1,
    sizeFactor: 0.15,
    valueFactor: 0.2,
    momentumFactor: 0.2,
    qualityFactor: 0.2,
    lowVolFactor: 0.15,
  }
): { ticker: string; name: string; score: number; rank: number; percentile: number }[] {
  // 标准化每个因子
  const factors = Object.keys(weights) as (keyof FactorExposure)[];
  const normalized = exposures.map((exp) => {
    const scores: Record<string, number> = {};
    for (const f of factors) {
      const values = exposures.map((e) => e[f] as number);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
      scores[f as string] = std > 0 ? ((exp[f] as number) - mean) / std : 0;
    }

    let composite = 0;
    for (const f of factors) {
      composite += scores[f as string] * (weights[f as string] ?? 0);
    }

    return {
      ticker: exp.ticker,
      name: exp.name,
      score: Math.round(composite * 100) / 100,
      rank: 0,
      percentile: 0,
    };
  });

  normalized.sort((a, b) => b.score - a.score);
  normalized.forEach((n, i) => {
    n.rank = i + 1;
    n.percentile = Math.round(((normalized.length - i) / normalized.length) * 100);
  });

  return normalized;
}

/**
 * 因子收益归因
 */
export function factorAttribution(
  portfolioReturns: number[],
  factorReturns: Map<string, number[]>
): {
  factorContributions: Record<string, number>;
  alpha: number;
  rSquared: number;
} {
  const factorNames = Array.from(factorReturns.keys());
  const n = portfolioReturns.length;

  // 简化线性回归 (最小二乘)
  const factorContributions: Record<string, number> = {};
  let totalExplained = 0;

  for (const factor of factorNames) {
    const fReturns = factorReturns.get(factor)!;
    const minLen = Math.min(n, fReturns.length);

    let cov = 0, varF = 0;
    for (let i = 0; i < minLen; i++) {
      cov += portfolioReturns[i] * fReturns[i];
      varF += fReturns[i] * fReturns[i];
    }

    const beta = varF > 0 ? cov / varF : 0;
    const contribution = beta * (fReturns.reduce((a, b) => a + b, 0) / minLen);
    factorContributions[factor] = Math.round(contribution * 10000) / 10000;
    totalExplained += Math.abs(contribution);
  }

  const totalReturn = portfolioReturns.reduce((a, b) => a + b, 0) / n;
  const alpha = Math.round((totalReturn - totalExplained) * 10000) / 10000;
  const rSquared = Math.min(1, Math.round((totalExplained / Math.abs(totalReturn || 1)) * 100) / 100);

  return { factorContributions, alpha, rSquared };
}

/**
 * 因子信号生成
 */
export function generateFactorSignals(
  performances: FactorPerformance[]
): FactorSignal[] {
  return performances.map((p) => {
    let direction: 'long' | 'short' | 'neutral';
    if (p.monthReturn > 1 && p.sharpe > 0.5) direction = 'long';
    else if (p.monthReturn < -1 && p.sharpe < -0.5) direction = 'short';
    else direction = 'neutral';

    const ic = Math.min(1, Math.abs(p.sharpe) / 2); // 简化IC

    let message: string;
    if (direction === 'long') message = `${p.factor}因子表现强劲，月收益${p.monthReturn.toFixed(1)}%`;
    else if (direction === 'short') message = `${p.factor}因子表现疲弱，月收益${p.monthReturn.toFixed(1)}%`;
    else message = `${p.factor}因子表现平稳`;

    return {
      factor: p.factor,
      direction,
      strength: Math.min(100, Math.round(Math.abs(p.monthReturn) * 10 + p.winRate * 30)),
      ic: Math.round(ic * 100) / 100,
      message,
    };
  });
}
