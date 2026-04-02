/**
 * 组合风险分解引擎
 * 将组合总风险分解为系统性风险和特异性风险
 */

export interface AssetWeight {
  symbol: string;
  weight: number;
  expectedReturn: number;
  volatility: number;
  beta: number;
}

export interface CovarianceMatrix {
  symbols: string[];
  matrix: number[][];
}

export interface RiskDecomposition {
  totalRisk: number;
  systematicRisk: number;
  specificRisk: number;
  diversificationRatio: number;
  componentRisks: ComponentRisk[];
  marginalContributions: MarginalContribution[];
  correlationStats: CorrelationStats;
}

export interface ComponentRisk {
  symbol: string;
  weight: number;
  marginalContribution: number;
  componentContribution: number;
  percentContribution: number;
}

export interface MarginalContribution {
  symbol: string;
  riskContribution: number;
  sharpeImpact: number;
}

export interface CorrelationStats {
  avgCorrelation: number;
  maxCorrelation: number;
  minCorrelation: number;
  eigenValues: number[];
  concentrationIndex: number;
}

/**
 * 从收益率矩阵估计协方差矩阵
 */
export function estimateCovariance(returns: Record<string, number[]>): CovarianceMatrix {
  const symbols = Object.keys(returns);
  const n = symbols.length;
  if (n === 0) return { symbols: [], matrix: [[]] };

  const minLen = Math.min(...symbols.map(s => returns[s].length));
  if (minLen < 2) {
    return { symbols, matrix: Array.from({ length: n }, () => new Array(n).fill(0)) };
  }

  const means = symbols.map(s => returns[s].slice(0, minLen).reduce((a, b) => a + b, 0) / minLen);
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let cov = 0;
      for (let k = 0; k < minLen; k++) {
        cov += (returns[symbols[i]][k] - means[i]) * (returns[symbols[j]][k] - means[j]);
      }
      cov /= (minLen - 1);
      matrix[i][j] = cov;
      matrix[j][i] = cov;
    }
  }

  return { symbols, matrix };
}

/**
 * 计算组合总风险 (sqrt(w' * Cov * w))
 */
export function computePortfolioRisk(weights: number[], covariance: number[][]): number {
  const n = weights.length;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      variance += weights[i] * weights[j] * covariance[i][j];
    }
  }
  return Math.sqrt(Math.max(0, variance));
}

/**
 * 计算边际风险贡献
 */
export function computeMarginalRiskContributions(
  weights: number[],
  covariance: number[][],
): number[] {
  const n = weights.length;
  const portfolioRisk = computePortfolioRisk(weights, covariance);
  if (portfolioRisk < 1e-10) return new Array(n).fill(0);

  const marginalContribs: number[] = [];
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      sum += weights[j] * covariance[i][j];
    }
    marginalContribs.push(sum / portfolioRisk);
  }
  return marginalContribs;
}

/**
 * 计算组合Beta
 */
export function computePortfolioBeta(weights: number[], betas: number[]): number {
  return weights.reduce((sum, w, i) => sum + w * betas[i], 0);
}

/**
 * 分解系统性风险和特异性风险
 */
export function decomposeRisk(
  assets: AssetWeight[],
  covariance: CovarianceMatrix,
  marketVariance: number,
): RiskDecomposition {
  const n = assets.length;
  const weights = assets.map(a => a.weight);
  const betas = assets.map(a => a.beta);

  const totalRisk = computePortfolioRisk(weights, covariance.matrix);
  const portfolioBeta = computePortfolioBeta(weights, betas);
  const systematicRisk = Math.abs(portfolioBeta) * Math.sqrt(Math.max(0, marketVariance));
  const specificRisk = Math.sqrt(Math.max(0, totalRisk ** 2 - systematicRisk ** 2));

  const marginalContribs = computeMarginalRiskContributions(weights, covariance.matrix);

  const componentRisks: ComponentRisk[] = assets.map((a, i) => ({
    symbol: a.symbol,
    weight: a.weight,
    marginalContribution: marginalContribs[i],
    componentContribution: a.weight * marginalContribs[i],
    percentContribution: totalRisk > 0 ? (a.weight * marginalContribs[i]) / totalRisk : 0,
  }));

  const marginalContributions: MarginalContribution[] = assets.map((a, i) => ({
    symbol: a.symbol,
    riskContribution: a.weight * marginalContribs[i],
    sharpeImpact: a.volatility > 0 ? a.expectedReturn / a.volatility - marginalContribs[i] : 0,
  }));

  // 相关性统计
  const corrMatrix = covarianceToCorrelation(covariance.matrix);
  const correlations: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      correlations.push(corrMatrix[i][j]);
    }
  }

  const avgCorrelation = correlations.length > 0
    ? correlations.reduce((s, v) => s + v, 0) / correlations.length : 0;

  const eigenValues = computeEigenValues(corrMatrix);
  const diversificationRatio = totalRisk > 0
    ? weights.reduce((s, w, i) => s + w * assets[i].volatility, 0) / totalRisk : 1;

  const correlationStats: CorrelationStats = {
    avgCorrelation,
    maxCorrelation: correlations.length > 0 ? Math.max(...correlations) : 0,
    minCorrelation: correlations.length > 0 ? Math.min(...correlations) : 0,
    eigenValues,
    concentrationIndex: eigenValues.length > 0 ? eigenValues[0] / eigenValues.reduce((s, v) => s + v, 0) : 0,
  };

  return {
    totalRisk,
    systematicRisk,
    specificRisk,
    diversificationRatio,
    componentRisks,
    marginalContributions,
    correlationStats,
  };
}

/**
 * 协方差转相关系数
 */
export function covarianceToCorrelation(covariance: number[][]): number[][] {
  const n = covariance.length;
  const stdDevs = covariance.map((row, i) => Math.sqrt(Math.max(0, covariance[i][i])));
  const corr: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      corr[i][j] = stdDevs[i] > 0 && stdDevs[j] > 0
        ? covariance[i][j] / (stdDevs[i] * stdDevs[j]) : (i === j ? 1 : 0);
    }
  }
  return corr;
}

/**
 * 幂迭代法计算最大特征值
 */
export function computeEigenValues(matrix: number[][], maxIter = 100): number[] {
  const n = matrix.length;
  if (n === 0) return [];
  if (n === 1) return [matrix[0][0]];

  const eigenValues: number[] = [];
  let remaining = matrix.map(row => [...row]);

  for (let e = 0; e < Math.min(n, 3); e++) {
    let v = new Array(n).fill(1 / Math.sqrt(n));

    for (let iter = 0; iter < maxIter; iter++) {
      const Av = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          Av[i] += remaining[i][j] * v[j];
        }
      }
      const norm = Math.sqrt(Av.reduce((s, x) => s + x * x, 0));
      if (norm < 1e-10) break;
      v = Av.map(x => x / norm);
    }

    // Rayleigh quotient
    let eigenValue = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        eigenValue += v[i] * remaining[i][j] * v[j];
      }
    }
    eigenValues.push(eigenValue);

    // Deflate
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        remaining[i][j] -= eigenValue * v[i] * v[j];
      }
    }
  }

  return eigenValues.sort((a, b) => b - a);
}

/**
 * 计算风险预算组合的权重调整建议
 */
export function suggestRiskBudgetAdjustments(
  assets: AssetWeight[],
  covariance: CovarianceMatrix,
  riskBudgets: number[],
): { symbol: string; currentWeight: number; suggestedWeight: number; riskGap: number }[] {
  const weights = assets.map(a => a.weight);
  const marginalContribs = computeMarginalRiskContributions(weights, covariance.matrix);
  const totalRisk = computePortfolioRisk(weights, covariance.matrix);
  const totalBudget = riskBudgets.reduce((s, b) => s + b, 0);

  return assets.map((a, i) => {
    const currentRiskPct = totalRisk > 0 ? (weights[i] * marginalContribs[i]) / totalRisk : 0;
    const targetRiskPct = totalBudget > 0 ? riskBudgets[i] / totalBudget : 0;
    const riskGap = currentRiskPct - targetRiskPct;
    const suggestedWeight = riskGap > 0
      ? weights[i] * (1 - riskGap * 0.5)
      : weights[i] * (1 + Math.abs(riskGap) * 0.5);

    return {
      symbol: a.symbol,
      currentWeight: weights[i],
      suggestedWeight: Math.max(0, Math.min(1, suggestedWeight)),
      riskGap,
    };
  });
}
