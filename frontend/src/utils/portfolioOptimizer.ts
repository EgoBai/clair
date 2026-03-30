/**
 * 组合风险优化引擎
 * 均值方差优化、风险平价、Black-Litterman等
 */

export interface Asset {
  ticker: string;
  name: string;
  sector: string;
  expectedReturn: number;
  volatility: number;
  returns: number[];
}

export interface CovarianceMatrix {
  tickers: string[];
  matrix: number[][];
}

export interface PortfolioWeights {
  [ticker: string]: number;
}

export interface EfficientFrontierPoint {
  weights: PortfolioWeights;
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
}

export interface RiskBudget {
  ticker: string;
  targetRiskContribution: number;
  actualRiskContribution: number;
  weight: number;
}

export interface OptimizationResult {
  weights: PortfolioWeights;
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
  riskContributions: { [ticker: string]: number };
}

export function calculatePortfolioReturn(weights: PortfolioWeights, assets: Asset[]): number {
  let totalReturn = 0;
  for (const asset of assets) {
    totalReturn += (weights[asset.ticker] || 0) * asset.expectedReturn;
  }
  return totalReturn;
}

export function calculatePortfolioVolatility(
  weights: PortfolioWeights,
  assets: Asset[],
  covMatrix: CovarianceMatrix
): number {
  const tickers = assets.map(a => a.ticker);
  let variance = 0;
  
  for (let i = 0; i < tickers.length; i++) {
    for (let j = 0; j < tickers.length; j++) {
      const wi = weights[tickers[i]] || 0;
      const wj = weights[tickers[j]] || 0;
      const ci = covMatrix.tickers.indexOf(tickers[i]);
      const cj = covMatrix.tickers.indexOf(tickers[j]);
      if (ci >= 0 && cj >= 0) {
        variance += wi * wj * covMatrix.matrix[ci][cj];
      }
    }
  }
  
  return Math.sqrt(Math.max(0, variance));
}

export function calculateSharpeRatio(
  portfolioReturn: number,
  portfolioVolatility: number,
  riskFreeRate: number = 0.03
): number {
  return portfolioVolatility !== 0 ? (portfolioReturn - riskFreeRate) / portfolioVolatility : 0;
}

export function calculateRiskContributions(
  weights: PortfolioWeights,
  assets: Asset[],
  covMatrix: CovarianceMatrix
): { [ticker: string]: number } {
  const tickers = assets.map(a => a.ticker);
  const portfolioVol = calculatePortfolioVolatility(weights, assets, covMatrix);
  if (portfolioVol === 0) {
    const result: { [ticker: string]: number } = {};
    tickers.forEach(t => result[t] = 0);
    return result;
  }
  
  const marginalContributions: { [ticker: string]: number } = {};
  for (let i = 0; i < tickers.length; i++) {
    let mc = 0;
    for (let j = 0; j < tickers.length; j++) {
      const wj = weights[tickers[j]] || 0;
      const ci = covMatrix.tickers.indexOf(tickers[i]);
      const cj = covMatrix.tickers.indexOf(tickers[j]);
      if (ci >= 0 && cj >= 0) {
        mc += wj * covMatrix.matrix[ci][cj];
      }
    }
    marginalContributions[tickers[i]] = mc / portfolioVol;
  }
  
  const riskContributions: { [ticker: string]: number } = {};
  let totalRC = 0;
  for (const t of tickers) {
    riskContributions[t] = (weights[t] || 0) * marginalContributions[t];
    totalRC += riskContributions[t];
  }
  
  // Normalize to percentages
  if (totalRC !== 0) {
    for (const t of tickers) {
      riskContributions[t] = riskContributions[t] / totalRC;
    }
  }
  
  return riskContributions;
}

export function equalWeightPortfolio(assets: Asset[]): PortfolioWeights {
  const n = assets.length;
  const weights: PortfolioWeights = {};
  assets.forEach(a => weights[a.ticker] = 1 / n);
  return weights;
}

export function inverseVolatilityPortfolio(assets: Asset[]): PortfolioWeights {
  const weights: PortfolioWeights = {};
  let totalInvVol = 0;
  
  for (const asset of assets) {
    const invVol = asset.volatility !== 0 ? 1 / asset.volatility : 0;
    weights[asset.ticker] = invVol;
    totalInvVol += invVol;
  }
  
  if (totalInvVol > 0) {
    for (const ticker of Object.keys(weights)) {
      weights[ticker] /= totalInvVol;
    }
  }
  
  return weights;
}

export function maxSharpePortfolio(
  assets: Asset[],
  covMatrix: CovarianceMatrix,
  riskFreeRate: number = 0.03,
  maxIterations: number = 100
): OptimizationResult {
  const tickers = assets.map(a => a.ticker);
  const n = tickers.length;
  
  // Simple gradient ascent for max sharpe
  let weights: PortfolioWeights = {};
  tickers.forEach(t => weights[t] = 1 / n);
  
  const learningRate = 0.01;
  
  for (let iter = 0; iter < maxIterations; iter++) {
    const ret = calculatePortfolioReturn(weights, assets);
    const vol = calculatePortfolioVolatility(weights, assets, covMatrix);
    const sharpe = calculateSharpeRatio(ret, vol, riskFreeRate);
    
    // Gradient: approximate numerical gradient
    for (const t of tickers) {
      const eps = 0.001;
      const wPlus = { ...weights, [t]: weights[t] + eps };
      const retPlus = calculatePortfolioReturn(wPlus, assets);
      const volPlus = calculatePortfolioVolatility(wPlus, assets, covMatrix);
      const sharpePlus = calculateSharpeRatio(retPlus, volPlus, riskFreeRate);
      
      weights[t] += (sharpePlus - sharpe) / eps * learningRate;
    }
    
    // Normalize weights
    let sum = Object.values(weights).reduce((s, w) => s + Math.max(0, w), 0);
    if (sum > 0) {
      for (const t of tickers) {
        weights[t] = Math.max(0, weights[t]) / sum;
      }
    }
  }
  
  const expectedReturn = calculatePortfolioReturn(weights, assets);
  const volatility = calculatePortfolioVolatility(weights, assets, covMatrix);
  const sharpeRatio = calculateSharpeRatio(expectedReturn, volatility, riskFreeRate);
  const riskContributions = calculateRiskContributions(weights, assets, covMatrix);
  
  return { weights, expectedReturn, volatility, sharpeRatio, riskContributions };
}

export function minVariancePortfolio(
  assets: Asset[],
  covMatrix: CovarianceMatrix
): OptimizationResult {
  const tickers = assets.map(a => a.ticker);
  const n = tickers.length;
  
  // Use inverse covariance method for unconstrained min variance
  // For simplicity, use iterative approach
  let weights: PortfolioWeights = {};
  tickers.forEach(t => weights[t] = 1 / n);
  
  const learningRate = 0.01;
  const maxIterations = 200;
  
  for (let iter = 0; iter < maxIterations; iter++) {
    // Gradient of variance
    for (const ti of tickers) {
      let grad = 0;
      const ci = covMatrix.tickers.indexOf(ti);
      for (const tj of tickers) {
        const cj = covMatrix.tickers.indexOf(tj);
        if (ci >= 0 && cj >= 0) {
          grad += 2 * weights[tj] * covMatrix.matrix[ci][cj];
        }
      }
      weights[ti] -= learningRate * grad;
    }
    
    // Project to simplex
    let sum = Object.values(weights).reduce((s, w) => s + Math.max(0.001, w), 0);
    for (const t of tickers) {
      weights[t] = Math.max(0.001, weights[t]) / sum;
    }
  }
  
  const expectedReturn = calculatePortfolioReturn(weights, assets);
  const volatility = calculatePortfolioVolatility(weights, assets, covMatrix);
  const sharpeRatio = calculateSharpeRatio(expectedReturn, volatility, 0.03);
  const riskContributions = calculateRiskContributions(weights, assets, covMatrix);
  
  return { weights, expectedReturn, volatility, sharpeRatio, riskContributions };
}

export function riskParityPortfolio(
  assets: Asset[],
  covMatrix: CovarianceMatrix
): OptimizationResult {
  const tickers = assets.map(a => a.ticker);
  const n = tickers.length;
  
  // Start with inverse volatility weights
  let weights = inverseVolatilityPortfolio(assets);
  
  const maxIterations = 200;
  const targetRC = 1 / n; // Equal risk contribution
  
  for (let iter = 0; iter < maxIterations; iter++) {
    const rc = calculateRiskContributions(weights, assets, covMatrix);
    
    // Adjust weights toward equal risk contribution
    for (const t of tickers) {
      const currentRC = rc[t] || 0;
      const ratio = currentRC !== 0 ? targetRC / currentRC : 1;
      weights[t] *= Math.pow(ratio, 0.5);
    }
    
    // Normalize
    let sum = Object.values(weights).reduce((s, w) => s + w, 0);
    if (sum > 0) {
      for (const t of tickers) {
        weights[t] /= sum;
      }
    }
  }
  
  const expectedReturn = calculatePortfolioReturn(weights, assets);
  const volatility = calculatePortfolioVolatility(weights, assets, covMatrix);
  const sharpeRatio = calculateSharpeRatio(expectedReturn, volatility, 0.03);
  const riskContributions = calculateRiskContributions(weights, assets, covMatrix);
  
  return { weights, expectedReturn, volatility, sharpeRatio, riskContributions };
}

export function generateEfficientFrontier(
  assets: Asset[],
  covMatrix: CovarianceMatrix,
  points: number = 20
): EfficientFrontierPoint[] {
  const frontier: EfficientFrontierPoint[] = [];
  
  // Get min and max return
  const returns = assets.map(a => a.expectedReturn);
  const minRet = Math.min(...returns);
  const maxRet = Math.max(...returns);
  
  for (let i = 0; i < points; i++) {
    const targetReturn = minRet + (maxRet - minRet) * i / (points - 1);
    
    // Simple allocation proportional to expected return
    const weights: PortfolioWeights = {};
    const tickers = assets.map(a => a.ticker);
    let totalRet = 0;
    for (const a of assets) {
      const r = Math.max(0, a.expectedReturn);
      weights[a.ticker] = r;
      totalRet += r;
    }
    
    if (totalRet > 0) {
      for (const t of tickers) weights[t] /= totalRet;
    }
    
    const vol = calculatePortfolioVolatility(weights, assets, covMatrix);
    const ret = calculatePortfolioReturn(weights, assets);
    const sharpe = calculateSharpeRatio(ret, vol);
    
    frontier.push({ weights, expectedReturn: ret, volatility: vol, sharpeRatio: sharpe });
  }
  
  return frontier;
}

export function calculateMaxDrawdown(returns: number[]): number {
  let cumulative = 1;
  let peak = 1;
  let maxDD = 0;
  
  for (const r of returns) {
    cumulative *= (1 + r);
    peak = Math.max(peak, cumulative);
    const dd = (peak - cumulative) / peak;
    maxDD = Math.max(maxDD, dd);
  }
  
  return maxDD;
}

export function calculateValueAtRisk(
  returns: number[],
  confidence: number = 0.95
): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const idx = Math.floor((1 - confidence) * sorted.length);
  return -sorted[Math.max(0, idx)];
}

export function calculateExpectedShortfall(
  returns: number[],
  confidence: number = 0.95
): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const cutoff = Math.floor((1 - confidence) * sorted.length);
  const tail = sorted.slice(0, cutoff + 1);
  if (tail.length === 0) return 0;
  return -tail.reduce((s, v) => s + v, 0) / tail.length;
}

export function applySectorConstraints(
  weights: PortfolioWeights,
  assets: Asset[],
  sectorLimits: { [sector: string]: { min: number; max: number } }
): PortfolioWeights {
  const adjusted = { ...weights };
  
  for (const [sector, limits] of Object.entries(sectorLimits)) {
    const sectorAssets = assets.filter(a => a.sector === sector);
    let sectorWeight = sectorAssets.reduce((s, a) => s + (adjusted[a.ticker] || 0), 0);
    
    if (sectorWeight > limits.max && sectorWeight > 0) {
      const scale = limits.max / sectorWeight;
      for (const a of sectorAssets) {
        adjusted[a.ticker] = (adjusted[a.ticker] || 0) * scale;
      }
    }
  }
  
  // Re-normalize
  const sum = Object.values(adjusted).reduce((s, w) => s + Math.max(0, w), 0);
  if (sum > 0) {
    for (const t of Object.keys(adjusted)) {
      adjusted[t] = Math.max(0, adjusted[t]) / sum;
    }
  }
  
  // Re-check constraints after normalization
  for (const [sector, limits] of Object.entries(sectorLimits)) {
    const sectorAssets = assets.filter(a => a.sector === sector);
    const sectorWeight = sectorAssets.reduce((s, a) => s + (adjusted[a.ticker] || 0), 0);
    if (sectorWeight > limits.max && sectorWeight > 0) {
      const scale = limits.max / sectorWeight;
      for (const a of sectorAssets) {
        adjusted[a.ticker] = (adjusted[a.ticker] || 0) * scale;
      }
    }
  }
  
  // Final normalization
  const finalSum = Object.values(adjusted).reduce((s, w) => s + Math.max(0, w), 0);
  if (finalSum > 0) {
    for (const t of Object.keys(adjusted)) {
      adjusted[t] = Math.max(0, adjusted[t]) / finalSum;
    }
  }
  
  return adjusted;
}
