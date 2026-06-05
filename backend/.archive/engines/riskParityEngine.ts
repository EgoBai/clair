/**
 * 风险平价引擎 - Round 724
 * 风险平价组合构建和风险预算分配
 */
export interface AssetReturn {
  symbol: string;
  returns: number[];
}

export interface RiskBudget {
  symbol: string;
  targetRisk: number; // 0-1
  minWeight: number;
  maxWeight: number;
}

export interface RiskParityResult {
  weights: Map<string, number>;
  riskContributions: Map<string, number>;
  portfolioVol: number;
  diversificationRatio: number;
  maxDrawdown: number;
}

export function calculateCovariance(returns1: number[], returns2: number[]): number {
  const n = Math.min(returns1.length, returns2.length);
  if (n < 2) return 0;
  const mean1 = returns1.slice(0, n).reduce((s, r) => s + r, 0) / n;
  const mean2 = returns2.slice(0, n).reduce((s, r) => s + r, 0) / n;
  let cov = 0;
  for (let i = 0; i < n; i++) {
    cov += (returns1[i] - mean1) * (returns2[i] - mean2);
  }
  return cov / (n - 1);
}

export function calculateVolatility(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance);
}

export function calculateMaxDrawdown(returns: number[]): number {
  if (returns.length === 0) return 0;
  let cumulative = 1;
  let peak = 1;
  let maxDD = 0;
  for (const r of returns) {
    cumulative *= (1 + r);
    if (cumulative > peak) peak = cumulative;
    const dd = (peak - cumulative) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

export function solveRiskParity(
  assets: AssetReturn[],
  budgets: RiskBudget[]
): RiskParityResult {
  const n = assets.length;
  if (n === 0) {
    return {
      weights: new Map(),
      riskContributions: new Map(),
      portfolioVol: 0,
      diversificationRatio: 0,
      maxDrawdown: 0,
    };
  }

  // Build covariance matrix
  const cov: number[][] = [];
  for (let i = 0; i < n; i++) {
    cov[i] = [];
    for (let j = 0; j < n; j++) {
      cov[i][j] = calculateCovariance(assets[i].returns, assets[j].returns);
    }
  }

  // Initialize equal weights respecting bounds
  const weights = new Array(n).fill(1 / n);
  for (let i = 0; i < n; i++) {
    const budget = budgets.find(b => b.symbol === assets[i].symbol);
    if (budget) {
      weights[i] = Math.max(budget.minWeight, Math.min(budget.maxWeight, weights[i]));
    }
  }
  // Normalize
  const totalW = weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < n; i++) weights[i] /= totalW;

  // Simple iterative risk parity (Newton-like)
  for (let iter = 0; iter < 100; iter++) {
    // Calculate portfolio variance
    let portVar = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        portVar += weights[i] * weights[j] * cov[i][j];
      }
    }
    const portVol = Math.sqrt(Math.max(portVar, 1e-10));

    // Risk contributions
    const rc: number[] = [];
    for (let i = 0; i < n; i++) {
      let marginalRisk = 0;
      for (let j = 0; j < n; j++) {
        marginalRisk += weights[j] * cov[i][j];
      }
      rc.push((weights[i] * marginalRisk) / portVol);
    }

    // Target risk contributions
    const totalRC = rc.reduce((s, r) => s + Math.abs(r), 0);
    const targetRC = totalRC / n;

    // Update weights
    const newWeights = [...weights];
    for (let i = 0; i < n; i++) {
      const adj = targetRC / (Math.abs(rc[i]) + 1e-10);
      newWeights[i] *= Math.pow(adj, 0.3);
      // Apply bounds
      const budget = budgets.find(b => b.symbol === assets[i].symbol);
      if (budget) {
        newWeights[i] = Math.max(budget.minWeight, Math.min(budget.maxWeight, newWeights[i]));
      }
    }

    // Normalize
    const sum = newWeights.reduce((s, w) => s + w, 0);
    for (let i = 0; i < n; i++) newWeights[i] /= sum;

    // Check convergence
    let diff = 0;
    for (let i = 0; i < n; i++) diff += Math.abs(newWeights[i] - weights[i]);
    for (let i = 0; i < n; i++) weights[i] = newWeights[i];
    if (diff < 1e-6) break;
  }

  // Final calculations
  let portVar = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      portVar += weights[i] * weights[j] * cov[i][j];
    }
  }
  const portfolioVol = Math.sqrt(Math.max(portVar, 1e-10));

  const finalRC: number[] = [];
  for (let i = 0; i < n; i++) {
    let mr = 0;
    for (let j = 0; j < n; j++) mr += weights[j] * cov[i][j];
    finalRC.push((weights[i] * mr) / portfolioVol);
  }

  // Diversification ratio
  let sumIndVol = 0;
  for (let i = 0; i < n; i++) {
    sumIndVol += weights[i] * Math.sqrt(Math.max(cov[i][i], 0));
  }
  const divRatio = portfolioVol > 0 ? sumIndVol / portfolioVol : 0;

  // Portfolio returns for max drawdown
  const minLen = Math.min(...assets.map(a => a.returns.length));
  const portReturns: number[] = [];
  for (let t = 0; t < minLen; t++) {
    let r = 0;
    for (let i = 0; i < n; i++) r += weights[i] * assets[i].returns[t];
    portReturns.push(r);
  }

  const weightMap = new Map<string, number>();
  const rcMap = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    weightMap.set(assets[i].symbol, weights[i]);
    rcMap.set(assets[i].symbol, finalRC[i]);
  }

  return {
    weights: weightMap,
    riskContributions: rcMap,
    portfolioVol,
    diversificationRatio: divRatio,
    maxDrawdown: calculateMaxDrawdown(portReturns),
  };
}

export function calculateCorrelationMatrix(assets: AssetReturn[]): number[][] {
  const n = assets.length;
  const corr: number[][] = [];
  for (let i = 0; i < n; i++) {
    corr[i] = [];
    for (let j = 0; j < n; j++) {
      const cov = calculateCovariance(assets[i].returns, assets[j].returns);
      const volI = calculateVolatility(assets[i].returns);
      const volJ = calculateVolatility(assets[j].returns);
      corr[i][j] = (volI > 0 && volJ > 0) ? cov / (volI * volJ) : (i === j ? 1 : 0);
    }
  }
  return corr;
}

export function stressTestPortfolio(
  weights: Map<string, number>,
  stressReturns: Map<string, number>
): { loss: number; stressedWeights: Map<string, number> } {
  let totalLoss = 0;
  const stressedWeights = new Map<string, number>();
  for (const [symbol, w] of weights) {
    const stressR = stressReturns.get(symbol) ?? 0;
    totalLoss += w * stressR;
  }
  // Recalculate weights after stress
  let totalValue = 0;
  for (const [symbol, w] of weights) {
    const stressR = stressReturns.get(symbol) ?? 0;
    totalValue += w * (1 + stressR);
  }
  for (const [symbol, w] of weights) {
    const stressR = stressReturns.get(symbol) ?? 0;
    stressedWeights.set(symbol, totalValue > 0 ? (w * (1 + stressR)) / totalValue : 0);
  }
  return { loss: totalLoss, stressedWeights };
}
