/**
 * Portfolio Risk Budgeting Engine
 * 
 * 组合风险预算引擎 - 风险平价、风险贡献分解、最优风险分配
 */

export interface Asset {
  name: string;
  weight: number;
  volatility: number;
  expectedReturn: number;
  beta: number;
}

export interface PortfolioRisk {
  totalRisk: number;
  diversificationRatio: number;
  riskContributions: RiskContribution[];
  sharpeRatio: number;
  maxDrawdown: number;
  var95: number;
  cvar95: number;
}

export interface RiskContribution {
  asset: string;
  weight: number;
  marginalRisk: number;
  riskContribution: number;
  riskContributionPct: number;
}

export interface RiskBudgetAllocation {
  allocations: { asset: string; weight: number; targetRisk: number }[];
  totalRisk: number;
  isBalanced: boolean;
}

// ===== Variance-Covariance Matrix =====

export function buildCovarianceMatrix(
  assets: Asset[],
  correlations: number[][]
): number[][] {
  const n = assets.length;
  const cov: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      cov[i][j] = assets[i].volatility * assets[j].volatility * (correlations[i]?.[j] ?? (i === j ? 1 : 0));
    }
  }

  return cov;
}

// ===== Portfolio Variance =====

export function portfolioVariance(
  weights: number[],
  covMatrix: number[][]
): number {
  const n = weights.length;
  let variance = 0;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      variance += weights[i] * weights[j] * covMatrix[i][j];
    }
  }

  return variance;
}

// ===== Portfolio Risk =====

export function portfolioRisk(
  weights: number[],
  covMatrix: number[][]
): number {
  return Math.sqrt(Math.max(0, portfolioVariance(weights, covMatrix)));
}

// ===== Marginal Risk Contribution =====

export function marginalRiskContribution(
  weights: number[],
  covMatrix: number[][],
  assetIndex: number
): number {
  const n = weights.length;
  let marginalVar = 0;

  for (let j = 0; j < n; j++) {
    marginalVar += weights[j] * covMatrix[assetIndex][j];
  }

  const totalVar = portfolioVariance(weights, covMatrix);
  if (totalVar <= 0) return 0;

  return marginalVar / Math.sqrt(totalVar);
}

// ===== Risk Contribution Decomposition =====

export function riskContributionDecomposition(
  assets: Asset[],
  covMatrix: number[][]
): RiskContribution[] {
  const weights = assets.map((a) => a.weight);
  const totalRisk = portfolioRisk(weights, covMatrix);

  return assets.map((asset, i) => {
    const mrc = marginalRiskContribution(weights, covMatrix, i);
    const rc = weights[i] * mrc;
    const rcPct = totalRisk > 0 ? (rc / totalRisk) * 100 : 0;

    return {
      asset: asset.name,
      weight: asset.weight,
      marginalRisk: Math.round(mrc * 10000) / 10000,
      riskContribution: Math.round(rc * 10000) / 10000,
      riskContributionPct: Math.round(rcPct * 100) / 100,
    };
  });
}

// ===== Diversification Ratio =====

export function diversificationRatio(
  weights: number[],
  volatilities: number[],
  covMatrix: number[][]
): number {
  const weightedVol = weights.reduce((s, w, i) => s + w * volatilities[i], 0);
  const pRisk = portfolioRisk(weights, covMatrix);

  if (pRisk <= 0) return 1;
  return weightedVol / pRisk;
}

// ===== VaR and CVaR =====

export function calculateVaR(
  expectedReturn: number,
  risk: number,
  confidence: number = 0.95,
  holdingPeriod: number = 1
): number {
  const zScore = confidence === 0.95 ? 1.645 : confidence === 0.99 ? 2.326 : 1.645;
  return -(expectedReturn * holdingPeriod - zScore * risk * Math.sqrt(holdingPeriod));
}

export function calculateCVaR(
  expectedReturn: number,
  risk: number,
  confidence: number = 0.95,
  holdingPeriod: number = 1
): number {
  const zScore = confidence === 0.95 ? 1.645 : confidence === 0.99 ? 2.326 : 1.645;
  const pdf = Math.exp(-zScore * zScore / 2) / Math.sqrt(2 * Math.PI);
  const cvarFactor = pdf / (1 - confidence);
  return -(expectedReturn * holdingPeriod - cvarFactor * risk * Math.sqrt(holdingPeriod));
}

// ===== Full Portfolio Risk Analysis =====

export function analyzePortfolioRisk(
  assets: Asset[],
  correlations: number[][],
  riskFreeRate: number = 0.03
): PortfolioRisk {
  const weights = assets.map((a) => a.weight);
  const volatilities = assets.map((a) => a.volatility);
  const covMatrix = buildCovarianceMatrix(assets, correlations);

  const totalRisk = portfolioRisk(weights, covMatrix);
  const diversification = diversificationRatio(weights, volatilities, covMatrix);
  const riskContributions = riskContributionDecomposition(assets, covMatrix);

  const expectedReturn = assets.reduce(
    (s, a) => s + a.weight * a.expectedReturn,
    0
  );
  const sharpeRatio =
    totalRisk > 0 ? (expectedReturn - riskFreeRate) / totalRisk : 0;

  const var95 = calculateVaR(expectedReturn, totalRisk);
  const cvar95 = calculateCVaR(expectedReturn, totalRisk);

  // Simple max drawdown estimate (2x VaR)
  const maxDrawdown = var95 * 2;

  return {
    totalRisk: Math.round(totalRisk * 10000) / 10000,
    diversificationRatio: Math.round(diversification * 1000) / 1000,
    riskContributions,
    sharpeRatio: Math.round(sharpeRatio * 1000) / 1000,
    maxDrawdown: Math.round(maxDrawdown * 10000) / 10000,
    var95: Math.round(var95 * 10000) / 10000,
    cvar95: Math.round(cvar95 * 10000) / 10000,
  };
}

// ===== Risk Parity Allocation =====

export function riskParityAllocation(
  assets: Asset[],
  correlations: number[][],
  iterations: number = 100
): RiskBudgetAllocation {
  const n = assets.length;
  const targetRiskPct = 100 / n; // Equal risk budget
  const covMatrix = buildCovarianceMatrix(assets, correlations);

  // Start with equal weights
  let weights = Array(n).fill(1 / n);

  // Iterative algorithm to equalize risk contributions
  for (let iter = 0; iter < iterations; iter++) {
    const contributions: number[] = [];

    for (let i = 0; i < n; i++) {
      const mrc = marginalRiskContribution(weights, covMatrix, i);
      contributions.push(weights[i] * mrc);
    }

    const totalContrib = contributions.reduce((s, c) => s + c, 0);
    if (totalContrib <= 0) break;

    // Update weights
    const newWeights = contributions.map(
      (c) => (c / totalContrib) * (1 / n) * (weights.reduce((s, w, i) => s + (totalContrib / contributions[i]) * w, 0))
    );

    // Normalize
    const sum = newWeights.reduce((s, w) => s + Math.abs(w), 0);
    if (sum > 0) {
      weights = newWeights.map((w) => Math.abs(w) / sum);
    }
  }

  // Calculate final risk contributions
  const riskContribs = riskContributionDecomposition(
    assets.map((a, i) => ({ ...a, weight: weights[i] })),
    covMatrix
  );

  const totalRisk = portfolioRisk(weights, covMatrix);

  // Check if balanced (all risk contributions within 5% of target)
  const isBalanced = riskContribs.every(
    (rc) => Math.abs(rc.riskContributionPct - targetRiskPct) < 5
  );

  return {
    allocations: assets.map((a, i) => ({
      asset: a.name,
      weight: Math.round(weights[i] * 10000) / 10000,
      targetRisk: targetRiskPct,
    })),
    totalRisk: Math.round(totalRisk * 10000) / 10000,
    isBalanced,
  };
}
