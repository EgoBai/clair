/**
 * 组合优化引擎 - Round 730
 * 均值方差、Black-Litterman等优化方法
 */
export interface AssetInfo {
  symbol: string;
  expectedReturn: number;
  volatility: number;
  weight: number;
}

export interface OptimizationConstraints {
  minWeight: number;
  maxWeight: number;
  maxTurnover?: number;
  sectorLimits?: Map<string, { min: number; max: number }>;
  riskBudget?: Map<string, number>;
}

export interface OptimizationResult {
  weights: Map<string, number>;
  expectedReturn: number;
  expectedRisk: number;
  sharpeRatio: number;
  efficientFrontier: { risk: number; return: number; weights: Map<string, number> }[];
}

export function optimizeMeanVariance(
  assets: AssetInfo[],
  covMatrix: number[][],
  riskFreeRate: number = 0.02,
  constraints?: OptimizationConstraints
): OptimizationResult {
  const n = assets.length;
  if (n === 0) {
    return {
      weights: new Map(),
      expectedReturn: 0,
      expectedRisk: 0,
      sharpeRatio: 0,
      efficientFrontier: [],
    };
  }

  // Simple mean-variance: maximize Sharpe ratio
  // Using equal-risk-contribution as starting point
  const weights = new Array(n).fill(1 / n);

  // Apply constraints
  const minW = constraints?.minWeight ?? 0;
  const maxW = constraints?.maxWeight ?? 1;

  // Iterative optimization (simplified)
  for (let iter = 0; iter < 50; iter++) {
    // Calculate current portfolio stats
    let portReturn = 0;
    let portVar = 0;
    for (let i = 0; i < n; i++) {
      portReturn += weights[i] * assets[i].expectedReturn;
      for (let j = 0; j < n; j++) {
        portVar += weights[i] * weights[j] * (covMatrix[i]?.[j] ?? 0);
      }
    }
    const portRisk = Math.sqrt(Math.max(portVar, 1e-10));
    const sharpe = portRisk > 0 ? (portReturn - riskFreeRate) / portRisk : 0;

    // Gradient ascent on Sharpe ratio
    for (let i = 0; i < n; i++) {
      let marginalReturn = assets[i].expectedReturn;
      let marginalRisk = 0;
      for (let j = 0; j < n; j++) {
        marginalRisk += weights[j] * (covMatrix[i]?.[j] ?? 0);
      }
      marginalRisk = portRisk > 0 ? marginalRisk / portRisk : 0;

      const grad = (marginalReturn - riskFreeRate - sharpe * marginalRisk) / portRisk;
      weights[i] += grad * 0.1;
      weights[i] = Math.max(minW, Math.min(maxW, weights[i]));
    }

    // Normalize
    const sum = weights.reduce((s, w) => s + w, 0);
    if (sum > 0) for (let i = 0; i < n; i++) weights[i] /= sum;
  }

  // Final stats
  let portReturn = 0, portVar = 0;
  for (let i = 0; i < n; i++) {
    portReturn += weights[i] * assets[i].expectedReturn;
    for (let j = 0; j < n; j++) {
      portVar += weights[i] * weights[j] * (covMatrix[i]?.[j] ?? 0);
    }
  }
  const portRisk = Math.sqrt(Math.max(portVar, 1e-10));
  const sharpe = portRisk > 0 ? (portReturn - riskFreeRate) / portRisk : 0;

  // Build efficient frontier
  const efficientFrontier: { risk: number; return: number; weights: Map<string, number> }[] = [];
  for (let targetReturn = portReturn * 0.5; targetReturn <= portReturn * 1.5; targetReturn += portReturn * 0.1) {
    const efWeights = new Array(n).fill(1 / n);
    // Simple: tilt toward higher-return assets for higher target
    for (let i = 0; i < n; i++) {
      efWeights[i] *= (1 + (assets[i].expectedReturn - portReturn) * 10);
      efWeights[i] = Math.max(minW, Math.min(maxW, efWeights[i]));
    }
    const sum = efWeights.reduce((s, w) => s + w, 0);
    for (let i = 0; i < n; i++) efWeights[i] /= sum;

    let efReturn = 0, efVar = 0;
    for (let i = 0; i < n; i++) {
      efReturn += efWeights[i] * assets[i].expectedReturn;
      for (let j = 0; j < n; j++) {
        efVar += efWeights[i] * efWeights[j] * (covMatrix[i]?.[j] ?? 0);
      }
    }
    const wMap = new Map<string, number>();
    for (let i = 0; i < n; i++) wMap.set(assets[i].symbol, efWeights[i]);
    efficientFrontier.push({ risk: Math.sqrt(Math.max(efVar, 0)), return: efReturn, weights: wMap });
  }

  const weightMap = new Map<string, number>();
  for (let i = 0; i < n; i++) weightMap.set(assets[i].symbol, weights[i]);

  return {
    weights: weightMap,
    expectedReturn: portReturn,
    expectedRisk: portRisk,
    sharpeRatio: sharpe,
    efficientFrontier,
  };
}

export function blackLitterman(
  marketCapWeights: Map<string, number>,
  covMatrix: number[][],
  views: { assets: string[]; weights: number[]; expectedReturn: number; confidence: number }[],
  tau: number = 0.05,
  riskFreeRate: number = 0.02
): Map<string, number> {
  const assets = Array.from(marketCapWeights.keys());
  const n = assets.length;
  if (n === 0) return new Map();

  // Market equilibrium returns
  const w = assets.map(a => marketCapWeights.get(a) ?? 0);
  const marketReturns: number[] = [];
  for (let i = 0; i < n; i++) {
    let risk = 0;
    for (let j = 0; j < n; j++) {
      risk += w[j] * (covMatrix[i]?.[j] ?? 0);
    }
    marketReturns.push(riskFreeRate + risk); // Implied equilibrium
  }

  // Apply views
  const adjustedReturns = [...marketReturns];
  for (const view of views) {
    for (let i = 0; i < view.assets.length; i++) {
      const idx = assets.indexOf(view.assets[i]);
      if (idx >= 0) {
        adjustedReturns[idx] += view.confidence * (view.expectedReturn - marketReturns[idx]) * view.weights[i];
      }
    }
  }

  // Re-optimize with adjusted returns
  const newWeights = new Array(n).fill(1 / n);
  for (let iter = 0; iter < 30; iter++) {
    for (let i = 0; i < n; i++) {
      newWeights[i] *= (1 + adjustedReturns[i] * 10);
      newWeights[i] = Math.max(0.01, Math.min(0.5, newWeights[i]));
    }
    const sum = newWeights.reduce((s, v) => s + v, 0);
    for (let i = 0; i < n; i++) newWeights[i] /= sum;
  }

  const result = new Map<string, number>();
  for (let i = 0; i < n; i++) result.set(assets[i], newWeights[i]);
  return result;
}

export function calculateTurnover(
  oldWeights: Map<string, number>,
  newWeights: Map<string, number>
): number {
  let turnover = 0;
  const allSymbols = new Set([...oldWeights.keys(), ...newWeights.keys()]);
  for (const symbol of allSymbols) {
    turnover += Math.abs((newWeights.get(symbol) ?? 0) - (oldWeights.get(symbol) ?? 0));
  }
  return turnover / 2;
}

export function riskBudgeting(
  assets: AssetInfo[],
  covMatrix: number[][],
  riskBudgets: number[]
): Map<string, number> {
  const n = assets.length;
  if (n === 0) return new Map();

  const weights = new Array(n).fill(1 / n);
  const totalBudget = riskBudgets.reduce((s, b) => s + b, 0);
  const budgets = riskBudgets.map(b => totalBudget > 0 ? b / totalBudget : 1 / n);

  for (let iter = 0; iter < 50; iter++) {
    let portVar = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        portVar += weights[i] * weights[j] * (covMatrix[i]?.[j] ?? 0);
      }
    }
    const portVol = Math.sqrt(Math.max(portVar, 1e-10));

    for (let i = 0; i < n; i++) {
      let marginalRisk = 0;
      for (let j = 0; j < n; j++) {
        marginalRisk += weights[j] * (covMatrix[i]?.[j] ?? 0);
      }
      const rc = (weights[i] * marginalRisk) / portVol;
      const targetRC = budgets[i] * portVol;
      if (rc > 0) weights[i] *= targetRC / rc;
      weights[i] = Math.max(0.01, Math.min(0.5, weights[i]));
    }

    const sum = weights.reduce((s, w) => s + w, 0);
    for (let i = 0; i < n; i++) weights[i] /= sum;
  }

  const result = new Map<string, number>();
  for (let i = 0; i < n; i++) result.set(assets[i].symbol, weights[i]);
  return result;
}
