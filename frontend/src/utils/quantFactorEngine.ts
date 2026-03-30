/**
 * 量化因子引擎
 * 多因子模型构建、因子暴露度计算、因子收益归因
 */

export interface Factor {
  name: string;
  category: 'value' | 'growth' | 'momentum' | 'quality' | 'size' | 'volatility' | 'liquidity';
  values: { ticker: string; value: number }[];
}

export interface FactorExposure {
  ticker: string;
  exposures: { [factorName: string]: number };
  expectedReturn: number;
  risk: number;
}

export interface FactorReturn {
  factorName: string;
  periodReturn: number;
  tStat: number;
  significant: boolean;
}

export interface FactorModel {
  factors: Factor[];
  returns: FactorReturn[];
  rSquared: number;
  residualRisk: number;
}

export interface FactorIC {
  factorName: string;
  ic: number; // Information Coefficient
  ir: number; // Information Ratio
  rankIC: number;
  icStd: number;
}

export function calculateZScore(values: number[]): number[] {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1 || 1));
  return std > 0 ? values.map(v => (v - mean) / std) : values.map(() => 0);
}

export function normalizeFactor(factor: Factor): Factor {
  const vals = factor.values.map(v => v.value);
  const zScores = calculateZScore(vals);
  return {
    ...factor,
    values: factor.values.map((v, i) => ({ ticker: v.ticker, value: zScores[i] })),
  };
}

export function winsorize(values: number[], limit: number = 3): number[] {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1 || 1));
  return values.map(v => {
    if (v > mean + limit * std) return mean + limit * std;
    if (v < mean - limit * std) return mean - limit * std;
    return v;
  });
}

export function calculateFactorExposures(
  factors: Factor[],
  ticker: string
): FactorExposure {
  const exposures: { [key: string]: number } = {};
  for (const factor of factors) {
    const val = factor.values.find(v => v.ticker === ticker);
    exposures[factor.name] = val?.value || 0;
  }
  
  // Simple expected return from factor exposures
  const expectedReturn = Object.values(exposures).reduce((s, e) => s + e, 0) / (Object.keys(exposures).length || 1);
  const risk = Math.sqrt(Object.values(exposures).reduce((s, e) => s + e ** 2, 0) / (Object.keys(exposures).length || 1));
  
  return { ticker, exposures, expectedReturn, risk };
}

export function calculateFactorReturns(
  factors: Factor[],
  stockReturns: { ticker: string; return: number }[]
): FactorReturn[] {
  return factors.map(factor => {
    const vals = factor.values.map(v => {
      const ret = stockReturns.find(r => r.ticker === v.ticker);
      return { factorValue: v.value, stockReturn: ret?.return || 0 };
    });
    
    // Simple cross-sectional regression approximation
    const n = vals.length;
    if (n < 2) return { factorName: factor.name, periodReturn: 0, tStat: 0, significant: false };
    
    const meanX = vals.reduce((s, v) => s + v.factorValue, 0) / n;
    const meanY = vals.reduce((s, v) => s + v.stockReturn, 0) / n;
    
    let num = 0, den = 0;
    for (const v of vals) {
      num += (v.factorValue - meanX) * (v.stockReturn - meanY);
      den += (v.factorValue - meanX) ** 2;
    }
    
    const beta = den !== 0 ? num / den : 0;
    const residuals = vals.map(v => v.stockReturn - beta * v.factorValue);
    const residualVar = residuals.reduce((s, r) => s + r ** 2, 0) / (n - 2 || 1);
    const se = den > 0 ? Math.sqrt(residualVar / den) : 0;
    const tStat = se !== 0 ? beta / se : 0;
    
    return {
      factorName: factor.name,
      periodReturn: beta,
      tStat,
      significant: Math.abs(tStat) > 1.96,
    };
  });
}

export function calculateFactorIC(
  factor: Factor,
  forwardReturns: { ticker: string; return: number }[]
): FactorIC {
  const paired = factor.values.map(v => {
    const ret = forwardReturns.find(r => r.ticker === v.ticker);
    return { factorValue: v.value, stockReturn: ret?.return || 0 };
  }).filter(p => p.factorValue !== undefined && p.stockReturn !== undefined);
  
  if (paired.length < 3) {
    return { factorName: factor.name, ic: 0, ir: 0, rankIC: 0, icStd: 0 };
  }
  
  // Pearson IC
  const n = paired.length;
  const meanX = paired.reduce((s, p) => s + p.factorValue, 0) / n;
  const meanY = paired.reduce((s, p) => s + p.stockReturn, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (const p of paired) {
    num += (p.factorValue - meanX) * (p.stockReturn - meanY);
    denX += (p.factorValue - meanX) ** 2;
    denY += (p.stockReturn - meanY) ** 2;
  }
  const ic = denX > 0 && denY > 0 ? num / Math.sqrt(denX * denY) : 0;
  
  // Rank IC (Spearman)
  const sortedFactor = [...paired].sort((a, b) => a.factorValue - b.factorValue);
  const sortedReturn = [...paired].sort((a, b) => a.stockReturn - b.stockReturn);
  let d2Sum = 0;
  for (let i = 0; i < n; i++) {
    const d = sortedFactor.indexOf(paired[i]) - sortedReturn.indexOf(paired[i]);
    d2Sum += d * d;
  }
  const rankIC = 1 - (6 * d2Sum) / (n * (n * n - 1));
  
  return { factorName: factor.name, ic, ir: ic / (Math.abs(ic) * 0.3 || 1), rankIC, icStd: 0.3 };
}

export function buildMultiFactorModel(
  factors: Factor[],
  stockReturns: { ticker: string; return: number }[]
): FactorModel {
  const returns = calculateFactorReturns(factors, stockReturns);
  
  // Calculate R-squared (simplified)
  const totalVariance = stockReturns.reduce((s, r) => s + r.return ** 2, 0);
  const explainedVariance = returns.reduce((s, r) => s + r.periodReturn ** 2, 0);
  const rSquared = totalVariance > 0 ? Math.min(1, explainedVariance / totalVariance) : 0;
  
  const residualRisk = Math.sqrt(Math.max(0, 1 - rSquared));
  
  return { factors, returns, rSquared, residualRisk };
}

export function neutralizeFactors(
  exposures: FactorExposure[],
  factorsToNeutralize: string[]
): FactorExposure[] {
  return exposures.map(exp => {
    const newExposures = { ...exp.exposures };
    for (const f of factorsToNeutralize) {
      newExposures[f] = 0;
    }
    
    const expectedReturn = Object.values(newExposures).reduce((s, e) => s + e, 0) / (Object.keys(newExposures).length || 1);
    const risk = Math.sqrt(Object.values(newExposures).reduce((s, e) => s + e ** 2, 0) / (Object.keys(newExposures).length || 1));
    
    return { ...exp, exposures: newExposures, expectedReturn, risk };
  });
}

export function compositeFactorScore(
  exposures: FactorExposure[],
  weights: { [factorName: string]: number }
): { ticker: string; score: number; rank: number }[] {
  const scores = exposures.map(exp => {
    let score = 0;
    let totalWeight = 0;
    for (const [factor, weight] of Object.entries(weights)) {
      score += (exp.exposures[factor] || 0) * weight;
      totalWeight += Math.abs(weight);
    }
    return { ticker: exp.ticker, score: totalWeight > 0 ? score / totalWeight : 0, rank: 0 };
  });
  
  scores.sort((a, b) => b.score - a.score);
  scores.forEach((s, i) => s.rank = i + 1);
  return scores;
}
