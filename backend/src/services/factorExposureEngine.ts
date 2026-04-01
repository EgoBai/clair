/**
 * 因子暴露分析引擎 - Round 725
 * 分析投资组合对各风险因子的暴露
 */
export interface FactorData {
  name: string;
  returns: number[];
  description: string;
}

export interface StockExposure {
  symbol: string;
  returns: number[];
  exposures: Map<string, number>;
  alpha: number;
  rSquared: number;
  residualVol: number;
}

export interface PortfolioExposure {
  totalExposures: Map<string, number>;
  activeExposures: Map<string, number>;
  factorReturns: Map<string, number>;
  alpha: number;
  trackingError: number;
  informationRatio: number;
}

export function regressFactor(
  stockReturns: number[],
  factorReturns: number[]
): { beta: number; alpha: number; rSquared: number; residual: number } {
  const n = Math.min(stockReturns.length, factorReturns.length);
  if (n < 3) return { beta: 0, alpha: 0, rSquared: 0, residual: 0 };

  const meanY = stockReturns.slice(0, n).reduce((s, r) => s + r, 0) / n;
  const meanX = factorReturns.slice(0, n).reduce((s, r) => s + r, 0) / n;

  let covXY = 0, varX = 0;
  for (let i = 0; i < n; i++) {
    covXY += (stockReturns[i] - meanY) * (factorReturns[i] - meanX);
    varX += (factorReturns[i] - meanX) ** 2;
  }

  const beta = varX > 0 ? covXY / varX : 0;
  const alpha = meanY - beta * meanX;

  // R-squared
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = alpha + beta * factorReturns[i];
    ssRes += (stockReturns[i] - predicted) ** 2;
    ssTot += (stockReturns[i] - meanY) ** 2;
  }
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const residual = Math.sqrt(ssRes / Math.max(n - 2, 1));

  return { beta, alpha, rSquared: Math.max(0, Math.min(1, rSquared)), residual };
}

export function multiFactorRegression(
  stockReturns: number[],
  factors: FactorData[]
): StockExposure {
  if (factors.length === 0) {
    return {
      symbol: '',
      returns: stockReturns,
      exposures: new Map(),
      alpha: stockReturns.length > 0 ? stockReturns.reduce((s, r) => s + r, 0) / stockReturns.length : 0,
      rSquared: 0,
      residualVol: 0,
    };
  }

  const exposures = new Map<string, number>();
  const n = Math.min(stockReturns.length, ...factors.map(f => f.returns.length));

  // Simple OLS for multiple factors (using sequential regression)
  const residuals = [...stockReturns.slice(0, n)];
  let totalAlpha = 0;

  for (const factor of factors) {
    const result = regressFactor(residuals, factor.returns.slice(0, n));
    exposures.set(factor.name, result.beta);
    totalAlpha += result.alpha;
    // Update residuals
    for (let i = 0; i < n; i++) {
      residuals[i] -= result.beta * factor.returns[i];
    }
  }

  // Final stats
  const residualMean = residuals.reduce((s, r) => s + r, 0) / n;
  const residualVol = Math.sqrt(residuals.reduce((s, r) => s + (r - residualMean) ** 2, 0) / Math.max(n - 1, 1));

  // R-squared for full model
  const totalVar = stockReturns.slice(0, n).reduce((s, r) => {
    const mean = stockReturns.slice(0, n).reduce((a, b) => a + b, 0) / n;
    return s + (r - mean) ** 2;
  }, 0);
  const resVar = residuals.reduce((s, r) => s + r ** 2, 0);
  const rSquared = totalVar > 0 ? 1 - resVar / totalVar : 0;

  return {
    symbol: '',
    returns: stockReturns,
    exposures,
    alpha: totalAlpha,
    rSquared: Math.max(0, Math.min(1, rSquared)),
    residualVol,
  };
}

export function analyzePortfolioExposure(
  stockExposures: StockExposure[],
  weights: number[],
  benchmarkExposures: Map<string, number>
): PortfolioExposure {
  const factorNames = stockExposures.length > 0
    ? Array.from(stockExposures[0].exposures.keys())
    : [];

  const totalExposures = new Map<string, number>();
  const activeExposures = new Map<string, number>();
  const factorReturns = new Map<string, number>();

  for (const name of factorNames) {
    let totalExp = 0;
    for (let i = 0; i < stockExposures.length; i++) {
      totalExp += (weights[i] ?? 0) * (stockExposures[i].exposures.get(name) ?? 0);
    }
    totalExposures.set(name, totalExp);
    activeExposures.set(name, totalExp - (benchmarkExposures.get(name) ?? 0));
    factorReturns.set(name, 0); // placeholder
  }

  let totalAlpha = 0;
  for (let i = 0; i < stockExposures.length; i++) {
    totalAlpha += (weights[i] ?? 0) * stockExposures[i].alpha;
  }

  // Tracking error (simplified)
  let te = 0;
  for (const [name, active] of activeExposures) {
    te += active ** 2;
  }
  const trackingError = Math.sqrt(te);
  const informationRatio = trackingError > 0 ? totalAlpha / trackingError : 0;

  return {
    totalExposures,
    activeExposures,
    factorReturns,
    alpha: totalAlpha,
    trackingError,
    informationRatio,
  };
}

export function decomposeReturns(
  stockReturns: number[],
  factors: FactorData[]
): { factorContributions: Map<string, number>; alpha: number; totalReturn: number } {
  const regression = multiFactorRegression(stockReturns, factors);
  const totalReturn = stockReturns.reduce((s, r) => s + r, 0);
  const factorContributions = new Map<string, number>();

  for (const factor of factors) {
    const beta = regression.exposures.get(factor.name) ?? 0;
    const factorReturn = factor.returns.reduce((s, r) => s + r, 0);
    factorContributions.set(factor.name, beta * factorReturn);
  }

  return {
    factorContributions,
    alpha: regression.alpha * stockReturns.length,
    totalReturn,
  };
}
