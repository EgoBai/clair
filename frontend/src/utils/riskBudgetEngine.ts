/**
 * Risk Budgeting & Portfolio Construction Engine
 * 风险预算与组合构建引擎 - 基于风险平价/风险预算的资产配置
 */

export interface Asset {
  code: string;
  name: string;
  expectedReturn: number;
  volatility: number;
  sector?: string;
  region?: string;
}

export interface RiskBudget {
  code: string;
  targetRisk: number; // 0-1, proportion of total risk budget
  minWeight: number;
  maxWeight: number;
}

export interface OptimizationResult {
  weights: Record<string, number>;
  expectedReturn: number;
  expectedVolatility: number;
  sharpeRatio: number;
  riskContributions: Record<string, number>;
  diversificationRatio: number;
}

export interface EfficientFrontierPoint {
  targetReturn: number;
  weights: Record<string, number>;
  volatility: number;
  sharpeRatio: number;
}

export interface StressTestScenario {
  name: string;
  shocks: Record<string, number>; // asset -> return shock
  description?: string;
}

export interface StressTestResult {
  scenario: string;
  portfolioReturn: number;
  individualReturns: Record<string, number>;
  maxDrawdown: number;
}

export function calculateCovarianceMatrix(
  returns: Record<string, number[]>
): Record<string, Record<string, number>> {
  const codes = Object.keys(returns);
  const n = returns[codes[0]]?.length ?? 0;
  const matrix: Record<string, Record<string, number>> = {};

  for (const c1 of codes) {
    matrix[c1] = {};
    const mean1 = returns[c1].reduce((a, b) => a + b, 0) / n;
    for (const c2 of codes) {
      const mean2 = returns[c2].reduce((a, b) => a + b, 0) / n;
      let cov = 0;
      for (let i = 0; i < n; i++) {
        cov += (returns[c1][i] - mean1) * (returns[c2][i] - mean2);
      }
      matrix[c1][c2] = cov / (n - 1);
    }
  }

  return matrix;
}

export function calculateCorrelationFromCovariance(
  covariance: Record<string, Record<string, number>>
): Record<string, Record<string, number>> {
  const codes = Object.keys(covariance);
  const correlation: Record<string, Record<string, number>> = {};

  for (const c1 of codes) {
    correlation[c1] = {};
    const vol1 = Math.sqrt(covariance[c1][c1]);
    for (const c2 of codes) {
      const vol2 = Math.sqrt(covariance[c2][c2]);
      correlation[c1][c2] = vol1 * vol2 > 0 ? covariance[c1][c2] / (vol1 * vol2) : 0;
    }
  }

  return correlation;
}

export function calculatePortfolioVariance(
  weights: Record<string, number>,
  covariance: Record<string, Record<string, number>>
): number {
  const codes = Object.keys(weights);
  let variance = 0;
  for (const c1 of codes) {
    for (const c2 of codes) {
      variance += weights[c1] * weights[c2] * (covariance[c1]?.[c2] ?? 0);
    }
  }
  return variance;
}

export function calculatePortfolioReturn(
  weights: Record<string, number>,
  expectedReturns: Record<string, number>
): number {
  let totalReturn = 0;
  for (const [code, weight] of Object.entries(weights)) {
    totalReturn += weight * (expectedReturns[code] ?? 0);
  }
  return totalReturn;
}

export function calculateRiskContributions(
  weights: Record<string, number>,
  covariance: Record<string, Record<string, number>>
): Record<string, number> {
  const codes = Object.keys(weights);
  const portfolioVariance = calculatePortfolioVariance(weights, covariance);
  const portfolioVol = Math.sqrt(portfolioVariance);
  const contributions: Record<string, number> = {};

  if (portfolioVol === 0) {
    for (const code of codes) contributions[code] = 0;
    return contributions;
  }

  let totalRiskContrib = 0;
  for (const c1 of codes) {
    let marginalContrib = 0;
    for (const c2 of codes) {
      marginalContrib += weights[c2] * (covariance[c1]?.[c2] ?? 0);
    }
    contributions[c1] = weights[c1] * marginalContrib / portfolioVol;
    totalRiskContrib += contributions[c1];
  }

  // Normalize to percentages
  const normalized: Record<string, number> = {};
  for (const code of codes) {
    normalized[code] = totalRiskContrib > 0 ? contributions[code] / totalRiskContrib : 0;
  }

  return normalized;
}

// Risk Parity optimization (iterative)
export function riskParityAllocation(
  covariance: Record<string, Record<string, number>>,
  maxIterations: number = 1000,
  tolerance: number = 1e-8
): Record<string, number> {
  const codes = Object.keys(covariance);
  const n = codes.length;
  if (n === 0) return {};

  // Start with equal weights
  let weights: Record<string, number> = {};
  for (const code of codes) weights[code] = 1 / n;

  const targetRisk = 1 / n; // Equal risk contribution

  for (let iter = 0; iter < maxIterations; iter++) {
    const riskContribs = calculateRiskContributions(weights, covariance);
    const portfolioVol = Math.sqrt(calculatePortfolioVariance(weights, covariance));

    let maxDiff = 0;
    const newWeights: Record<string, number> = {};

    for (const code of codes) {
      const currentRisk = riskContribs[code];
      const diff = currentRisk - targetRisk;
      maxDiff = Math.max(maxDiff, Math.abs(diff));

      // Newton-like update
      if (portfolioVol > 0) {
        let marginalRisk = 0;
        for (const c2 of codes) {
          marginalRisk += weights[c2] * (covariance[code]?.[c2] ?? 0);
        }
        const step = marginalRisk > 0 ? weights[code] * (targetRisk / currentRisk) : weights[code];
        newWeights[code] = Math.max(0.001, step);
      } else {
        newWeights[code] = weights[code];
      }
    }

    // Normalize
    const total = Object.values(newWeights).reduce((a, b) => a + b, 0);
    for (const code of codes) {
      weights[code] = newWeights[code] / total;
    }

    if (maxDiff < tolerance) break;
  }

  return weights;
}

// Risk Budgeting allocation
export function riskBudgetAllocation(
  budgets: RiskBudget[],
  covariance: Record<string, Record<string, number>>,
  maxIterations: number = 1000,
  tolerance: number = 1e-8
): Record<string, number> {
  const codes = budgets.map(b => b.code);
  const n = codes.length;
  if (n === 0) return {};

  let weights: Record<string, number> = {};
  for (const budget of budgets) {
    weights[budget.code] = (budget.minWeight + budget.maxWeight) / 2;
  }

  // Normalize initial weights
  let total = Object.values(weights).reduce((a, b) => a + b, 0);
  for (const code of codes) weights[code] /= total;

  for (let iter = 0; iter < maxIterations; iter++) {
    const riskContribs = calculateRiskContributions(weights, covariance);
    const portfolioVol = Math.sqrt(calculatePortfolioVariance(weights, covariance));

    let maxDiff = 0;
    const newWeights: Record<string, number> = {};

    for (const budget of budgets) {
      const code = budget.code;
      const currentRisk = riskContribs[code];
      const targetRisk = budget.targetRisk;
      const diff = currentRisk - targetRisk;
      maxDiff = Math.max(maxDiff, Math.abs(diff));

      if (portfolioVol > 0 && currentRisk > 0) {
        const ratio = targetRisk / currentRisk;
        newWeights[code] = weights[code] * Math.pow(ratio, 0.5);
      } else {
        newWeights[code] = weights[code];
      }

      // Apply constraints
      newWeights[code] = Math.max(budget.minWeight, Math.min(budget.maxWeight, newWeights[code]));
    }

    // Normalize
    total = Object.values(newWeights).reduce((a, b) => a + b, 0);
    for (const code of codes) {
      weights[code] = newWeights[code] / total;
    }

    if (maxDiff < tolerance) break;
  }

  return weights;
}

// Mean-Variance Optimization (Markowitz)
export function meanVarianceOptimize(
  expectedReturns: Record<string, number>,
  covariance: Record<string, Record<string, number>>,
  targetReturn: number,
  constraints?: { min?: Record<string, number>; max?: Record<string, number> }
): OptimizationResult {
  const codes = Object.keys(expectedReturns);
  const n = codes.length;

  // Simplified: use equal-weight as starting point, then adjust
  let weights: Record<string, number> = {};
  for (const code of codes) weights[code] = 1 / n;

  // Gradient descent toward target return
  const learningRate = 0.01;
  const maxIter = 500;

  for (let iter = 0; iter < maxIter; iter++) {
    const currentReturn = calculatePortfolioReturn(weights, expectedReturns);
    const diff = currentReturn - targetReturn;

    if (Math.abs(diff) < 0.0001) break;

    // Adjust weights toward target return
    for (const code of codes) {
      const ret = expectedReturns[code];
      weights[code] += learningRate * (ret - currentReturn) * diff;
      weights[code] = Math.max(
        constraints?.min?.[code] ?? 0.01,
        Math.min(constraints?.max?.[code] ?? 1, weights[code])
      );
    }

    // Normalize
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const code of codes) weights[code] /= total;
  }

  const portReturn = calculatePortfolioReturn(weights, expectedReturns);
  const portVariance = calculatePortfolioVariance(weights, covariance);
  const portVol = Math.sqrt(portVariance);
  const riskContribs = calculateRiskContributions(weights, covariance);

  // Diversification ratio
  let weightedVol = 0;
  for (const code of codes) {
    weightedVol += weights[code] * Math.sqrt(covariance[code]?.[code] ?? 0);
  }
  const divRatio = portVol > 0 ? weightedVol / portVol : 1;

  return {
    weights,
    expectedReturn: portReturn,
    expectedVolatility: portVol,
    sharpeRatio: portVol > 0 ? portReturn / portVol : 0,
    riskContributions: riskContribs,
    diversificationRatio: divRatio,
  };
}

// Generate efficient frontier
export function generateEfficientFrontier(
  expectedReturns: Record<string, number>,
  covariance: Record<string, Record<string, number>>,
  points: number = 20,
  constraints?: { min?: Record<string, number>; max?: Record<string, number> }
): EfficientFrontierPoint[] {
  const returns = Object.values(expectedReturns);
  const minReturn = Math.min(...returns);
  const maxReturn = Math.max(...returns);
  const step = (maxReturn - minReturn) / (points - 1);

  const frontier: EfficientFrontierPoint[] = [];

  for (let i = 0; i < points; i++) {
    const targetReturn = minReturn + step * i;
    const result = meanVarianceOptimize(expectedReturns, covariance, targetReturn, constraints);
    frontier.push({
      targetReturn,
      weights: result.weights,
      volatility: result.expectedVolatility,
      sharpeRatio: result.sharpeRatio,
    });
  }

  return frontier;
}

// Maximum Sharpe ratio portfolio
export function maxSharpePortfolio(
  expectedReturns: Record<string, number>,
  covariance: Record<string, Record<string, number>>,
  riskFreeRate: number = 0,
  constraints?: { min?: Record<string, number>; max?: Record<string, number> }
): OptimizationResult {
  const codes = Object.keys(expectedReturns);
  const n = codes.length;

  let weights: Record<string, number> = {};
  for (const code of codes) weights[code] = 1 / n;

  let bestSharpe = -Infinity;
  let bestWeights = { ...weights };

  // Grid search over return targets
  const returns = Object.values(expectedReturns);
  const minRet = Math.min(...returns);
  const maxRet = Math.max(...returns);

  for (let i = 0; i <= 50; i++) {
    const target = minRet + (maxRet - minRet) * i / 50;
    const result = meanVarianceOptimize(expectedReturns, covariance, target, constraints);
    const sharpe = result.expectedVolatility > 0
      ? (result.expectedReturn - riskFreeRate) / result.expectedVolatility
      : 0;
    if (sharpe > bestSharpe) {
      bestSharpe = sharpe;
      bestWeights = { ...result.weights };
    }
  }

  return meanVarianceOptimize(expectedReturns, covariance,
    calculatePortfolioReturn(bestWeights, expectedReturns), constraints);
}

// Minimum variance portfolio
export function minVariancePortfolio(
  covariance: Record<string, Record<string, number>>,
  constraints?: { min?: Record<string, number>; max?: Record<string, number> }
): OptimizationResult {
  const codes = Object.keys(covariance);
  const n = codes.length;

  let weights: Record<string, number> = {};
  for (const code of codes) weights[code] = 1 / n;

  // Iteratively minimize variance
  for (let iter = 0; iter < 500; iter++) {
    const riskContribs = calculateRiskContributions(weights, covariance);
    const totalVar = calculatePortfolioVariance(weights, covariance);

    if (totalVar === 0) break;

    for (const code of codes) {
      const contrib = riskContribs[code];
      weights[code] *= Math.pow(1 / Math.max(contrib, 0.001), 0.1);
      weights[code] = Math.max(
        constraints?.min?.[code] ?? 0.01,
        Math.min(constraints?.max?.[code] ?? 1, weights[code])
      );
    }

    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const code of codes) weights[code] /= total;
  }

  const expectedReturns: Record<string, number> = {};
  for (const code of codes) expectedReturns[code] = 0;

  return meanVarianceOptimize(expectedReturns, covariance, 0, constraints);
}

// Stress testing
export function runStressTest(
  weights: Record<string, number>,
  scenarios: StressTestScenario[]
): StressTestResult[] {
  return scenarios.map(scenario => {
    let portfolioReturn = 0;
    const individualReturns: Record<string, number> = {};

    for (const [code, weight] of Object.entries(weights)) {
      const shock = scenario.shocks[code] ?? 0;
      const assetReturn = weight * shock;
      portfolioReturn += assetReturn;
      individualReturns[code] = shock;
    }

    return {
      scenario: scenario.name,
      portfolioReturn,
      individualReturns,
      maxDrawdown: Math.min(portfolioReturn, 0),
    };
  });
}

// Tracking error calculation
export function calculateTrackingError(
  portfolioWeights: Record<string, number>,
  benchmarkWeights: Record<string, number>,
  covariance: Record<string, Record<string, number>>
): number {
  const codes = new Set([...Object.keys(portfolioWeights), ...Object.keys(benchmarkWeights)]);
  const activeWeights: Record<string, number> = {};

  for (const code of codes) {
    activeWeights[code] = (portfolioWeights[code] ?? 0) - (benchmarkWeights[code] ?? 0);
  }

  return Math.sqrt(calculatePortfolioVariance(activeWeights, covariance));
}

// Factor exposure calculation
export function calculateFactorExposures(
  weights: Record<string, number>,
  factorLoadings: Record<string, Record<string, number>>
): Record<string, number> {
  const factors = new Set<string>();
  for (const loadings of Object.values(factorLoadings)) {
    for (const factor of Object.keys(loadings)) factors.add(factor);
  }

  const exposures: Record<string, number> = {};
  for (const factor of factors) {
    exposures[factor] = 0;
    for (const [code, weight] of Object.entries(weights)) {
      exposures[factor] += weight * (factorLoadings[code]?.[factor] ?? 0);
    }
  }

  return exposures;
}

export class PortfolioConstructor {
  private assets: Asset[] = [];
  private covariance: Record<string, Record<string, number>> = {};

  addAssets(assets: Asset[]): void {
    this.assets.push(...assets);
  }

  setCovariance(covariance: Record<string, Record<string, number>>): void {
    this.covariance = covariance;
  }

  buildFromReturns(returns: Record<string, number[]>): void {
    this.covariance = calculateCovarianceMatrix(returns);
  }

  riskParity(): OptimizationResult {
    const weights = riskParityAllocation(this.covariance);
    return this.buildResult(weights);
  }

  riskBudget(budgets: RiskBudget[]): OptimizationResult {
    const weights = riskBudgetAllocation(budgets, this.covariance);
    return this.buildResult(weights);
  }

  meanVariance(targetReturn: number): OptimizationResult {
    const expectedReturns: Record<string, number> = {};
    for (const asset of this.assets) {
      expectedReturns[asset.code] = asset.expectedReturn;
    }
    return meanVarianceOptimize(expectedReturns, this.covariance, targetReturn);
  }

  efficientFrontier(points: number = 20): EfficientFrontierPoint[] {
    const expectedReturns: Record<string, number> = {};
    for (const asset of this.assets) {
      expectedReturns[asset.code] = asset.expectedReturn;
    }
    return generateEfficientFrontier(expectedReturns, this.covariance, points);
  }

  private buildResult(weights: Record<string, number>): OptimizationResult {
    const expectedReturns: Record<string, number> = {};
    for (const asset of this.assets) {
      expectedReturns[asset.code] = asset.expectedReturn;
    }
    const portReturn = calculatePortfolioReturn(weights, expectedReturns);
    const portVar = calculatePortfolioVariance(weights, this.covariance);
    const portVol = Math.sqrt(portVar);
    const riskContribs = calculateRiskContributions(weights, this.covariance);

    let weightedVol = 0;
    for (const [code, w] of Object.entries(weights)) {
      weightedVol += w * Math.sqrt(this.covariance[code]?.[code] ?? 0);
    }

    return {
      weights,
      expectedReturn: portReturn,
      expectedVolatility: portVol,
      sharpeRatio: portVol > 0 ? portReturn / portVol : 0,
      riskContributions: riskContribs,
      diversificationRatio: portVol > 0 ? weightedVol / portVol : 1,
    };
  }
}
