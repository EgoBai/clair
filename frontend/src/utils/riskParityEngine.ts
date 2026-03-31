/**
 * Risk Parity Portfolio Engine
 *
 * 风险平价组合优化、波动率估计、再平衡信号
 */

export interface AssetReturn {
  symbol: string;
  returns: number[];
}

export interface CovarianceMatrix {
  symbols: string[];
  matrix: number[][];
}

export interface PortfolioWeight {
  symbol: string;
  weight: number;
  riskContribution: number;
}

export interface RiskParityResult {
  weights: PortfolioWeight[];
  totalRisk: number;
  diversificationRatio: number;
  sharpeRatio: number;
  maxDrawdown: number;
  rebalanceNeeded: boolean;
}

/**
 * 计算收益率的年化波动率
 */
export function calculateVolatility(returns: number[], annualize: boolean = true): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  return annualize ? std * Math.sqrt(252) : std;
}

/**
 * 计算协方差矩阵
 */
export function calculateCovarianceMatrix(assets: AssetReturn[]): CovarianceMatrix {
  const symbols = assets.map(a => a.symbol);
  const n = symbols.length;
  const minLen = Math.min(...assets.map(a => a.returns.length));

  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const ri = assets[i].returns.slice(0, minLen);
      const rj = assets[j].returns.slice(0, minLen);

      const meanI = ri.reduce((s, v) => s + v, 0) / minLen;
      const meanJ = rj.reduce((s, v) => s + v, 0) / minLen;

      let cov = 0;
      for (let k = 0; k < minLen; k++) {
        cov += (ri[k] - meanI) * (rj[k] - meanJ);
      }
      cov /= (minLen - 1);

      matrix[i][j] = cov;
      matrix[j][i] = cov;
    }
  }

  return { symbols, matrix };
}

/**
 * 风险平价权重计算（迭代法）
 */
export function calculateRiskParityWeights(
  covMatrix: CovarianceMatrix,
  maxIterations: number = 100,
  tolerance: number = 1e-8
): number[] {
  const n = covMatrix.symbols.length;
  if (n === 0) return [];
  if (n === 1) return [1];

  // Start with equal weights
  let weights = new Array(n).fill(1 / n);

  for (let iter = 0; iter < maxIterations; iter++) {
    // Calculate portfolio variance
    const variance = portfolioVariance(weights, covMatrix.matrix);
    if (variance <= 0) break;

    // Calculate marginal risk contributions
    const marginalRisk: number[] = [];
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < n; j++) {
        sum += weights[j] * covMatrix.matrix[i][j];
      }
      marginalRisk.push(sum / Math.sqrt(variance));
    }

    // Risk contribution = w_i * MRC_i
    const riskContrib = weights.map((w, i) => w * marginalRisk[i]);
    const targetRisk = Math.sqrt(variance) / n;

    // Update weights
    let newWeights = weights.map((w, i) => {
      return w * Math.pow(targetRisk / (riskContrib[i] || tolerance), 0.5);
    });

    // Normalize
    const sum = newWeights.reduce((s, v) => s + v, 0);
    newWeights = newWeights.map(w => w / sum);

    // Check convergence
    const maxDiff = Math.max(...newWeights.map((w, i) => Math.abs(w - weights[i])));
    weights = newWeights;

    if (maxDiff < tolerance) break;
  }

  return weights.map(w => Math.round(w * 10000) / 10000);
}

function portfolioVariance(weights: number[][], covMatrix: number[][]): number {
  const n = weights.length;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      variance += weights[i] * weights[j] * covMatrix[i][j];
    }
  }
  return variance;
}

/**
 * 完整风险平价分析
 */
export function analyzeRiskParity(
  assets: AssetReturn[],
  currentWeights?: number[]
): RiskParityResult {
  const covMatrix = calculateCovarianceMatrix(assets);
  const weights = calculateRiskParityWeights(covMatrix);

  const n = assets.length;
  const totalRisk = Math.sqrt(portfolioVariance(weights, covMatrix.matrix)) * Math.sqrt(252);

  // Risk contributions
  const riskContribs: number[] = [];
  const variance = portfolioVariance(weights, covMatrix.matrix);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      sum += weights[j] * covMatrix.matrix[i][j];
    }
    const mrc = sum / Math.sqrt(variance);
    riskContribs.push(weights[i] * mrc / Math.sqrt(variance) * Math.sqrt(252));
  }

  // Diversification ratio
  const individualRisks = assets.map(a => calculateVolatility(a.returns));
  const weightedRisk = weights.reduce((s, w, i) => s + w * individualRisks[i], 0);
  const diversificationRatio = weightedRisk > 0 ? weightedRisk / totalRisk : 1;

  // Sharpe ratio (assume 3% risk-free rate)
  const portfolioReturns = assets[0].returns.map((_, ti) =>
    weights.reduce((s, w, ai) => s + w * assets[ai].returns[ti], 0)
  );
  const meanReturn = portfolioReturns.reduce((s, r) => s + r, 0) / portfolioReturns.length * 252;
  const vol = calculateVolatility(portfolioReturns);
  const sharpeRatio = vol > 0 ? (meanReturn - 0.03) / vol : 0;

  // Max drawdown
  let peak = 0;
  let maxDD = 0;
  let cumReturn = 1;
  for (const r of portfolioReturns) {
    cumReturn *= (1 + r);
    if (cumReturn > peak) peak = cumReturn;
    const dd = (peak - cumReturn) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  // Rebalance check
  let rebalanceNeeded = false;
  if (currentWeights && currentWeights.length === n) {
    const maxDrift = Math.max(...weights.map((w, i) => Math.abs(w - (currentWeights[i] || 0))));
    rebalanceNeeded = maxDrift > 0.05;
  }

  return {
    weights: weights.map((w, i) => ({
      symbol: covMatrix.symbols[i],
      weight: w,
      riskContribution: riskContribs[i] || 0,
    })),
    totalRisk: Math.round(totalRisk * 10000) / 10000,
    diversificationRatio: Math.round(diversificationRatio * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    maxDrawdown: Math.round(maxDD * 10000) / 100,
    rebalanceNeeded,
  };
}
