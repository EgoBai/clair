/**
 * Factor Attribution Engine
 *
 * Multi-factor model for decomposing portfolio/stock returns into factor contributions.
 * Supports Fama-French 3/5 factor models, momentum, quality, and custom factors.
 */

// ==================== Types ====================

export interface FactorReturn {
  factor: string;
  return: number;
  weight: number;
  contribution: number;
}

export interface FactorExposure {
  factor: string;
  exposure: number;
  tStat: number;
  significant: boolean;
}

export interface AttributionResult {
  totalReturn: number;
  factorReturns: FactorReturn[];
  alpha: number;
  rSquared: number;
  trackingError: number;
  informationRatio: number;
  residualReturn: number;
}

export interface FamaFrenchData {
  dates: string[];
  returns: number[];
  marketExcess: number[];
  smb: number[];
  hml: number[];
  rmw?: number[];
  cma?: number[];
  momentum?: number[];
}

export interface StockFactorData {
  symbol: string;
  returns: number[];
  marketBeta: number;
  sizeLoad: number;
  valueLoad: number;
  profitabilityLoad: number;
  investmentLoad: number;
  momentumLoad: number;
}

export interface FactorCorrelationMatrix {
  factors: string[];
  matrix: number[][];
}

export interface RollingAttribution {
  date: string;
  alpha: number;
  factorContributions: Record<string, number>;
  rSquared: number;
}

export interface FactorPerformanceSummary {
  factor: string;
  annualizedReturn: number;
  annualizedVolatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  bestMonth: number;
  worstMonth: number;
  hitRate: number;
}

export interface InteractionEffect {
  factors: [string, string];
  interactionCoefficient: number;
  tStat: number;
  significant: boolean;
}

// ==================== Core Math ====================

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function variance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
}

function std(arr: number[]): number {
  return Math.sqrt(variance(arr));
}

function covariance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (a[i] - ma) * (b[i] - mb);
  }
  return sum / (n - 1);
}

function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const cov = covariance(a, b);
  const sa = std(a.slice(0, n));
  const sb = std(b.slice(0, n));
  if (sa === 0 || sb === 0) return 0;
  return cov / (sa * sb);
}

// Simple OLS regression: y = Xβ + ε
function olsRegression(y: number[], X: number[][]): {
  coefficients: number[];
  residuals: number[];
  rSquared: number;
  standardErrors: number[];
  tStats: number[];
} {
  const n = y.length;
  if (n === 0 || X.length === 0) {
    return { coefficients: [], residuals: [], rSquared: 0, standardErrors: [], tStats: [] };
  }
  const k = X[0].length;

  // X'X
  const XtX: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      let sum = 0;
      for (let t = 0; t < n; t++) {
        sum += X[t][i] * X[t][j];
      }
      XtX[i][j] = sum;
    }
  }

  // X'y
  const Xty: number[] = Array(k).fill(0);
  for (let i = 0; i < k; i++) {
    let sum = 0;
    for (let t = 0; t < n; t++) {
      sum += X[t][i] * y[t];
    }
    Xty[i] = sum;
  }

  // Solve via Gauss-Jordan
  const coefficients = solveLinearSystem(XtX, Xty);

  // Residuals
  const residuals: number[] = [];
  for (let t = 0; t < n; t++) {
    let pred = 0;
    for (let i = 0; i < k; i++) {
      pred += X[t][i] * coefficients[i];
    }
    residuals.push(y[t] - pred);
  }

  // R-squared
  const yMean = mean(y);
  const ssTot = y.reduce((s, v) => s + (v - yMean) ** 2, 0);
  const ssRes = residuals.reduce((s, v) => s + v ** 2, 0);
  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  // Standard errors
  const mse = ssRes / (n - k);
  const XtXInv = invertMatrix(XtX);
  const standardErrors = XtXInv.map((row, i) => Math.sqrt(Math.max(0, mse * row[i])));
  const tStats = coefficients.map((c, i) => (standardErrors[i] === 0 ? 0 : c / standardErrors[i]));

  return { coefficients, residuals, rSquared, standardErrors, tStats };
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    if (Math.abs(aug[col][col]) < 1e-12) {
      aug[col][col] = 1e-12;
    }

    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= aug[i][j] * x[j];
    }
    x[i] /= aug[i][i];
  }
  return x;
}

function invertMatrix(M: number[][]): number[][] {
  const n = M.length;
  const aug = M.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    const pivot = aug[col][col] || 1e-12;
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }

  return aug.map(row => row.slice(n));
}

// ==================== Attribution Functions ====================

/**
 * Run Fama-French 3-factor attribution
 */
export function famaFrench3Factor(
  stockReturns: number[],
  marketExcess: number[],
  smb: number[],
  hml: number[]
): AttributionResult {
  const n = Math.min(stockReturns.length, marketExcess.length, smb.length, hml.length);
  const y = stockReturns.slice(0, n);
  const X = Array.from({ length: n }, (_, i) => [1, marketExcess[i], smb[i], hml[i]]);

  const reg = olsRegression(y, X);

  const factorNames = ['Market', 'SMB', 'HML'];
  const factorReturns: FactorReturn[] = factorNames.map((name, i) => {
    const factorData = [marketExcess, smb, hml][i].slice(0, n);
    const ret = mean(factorData) * 252;
    const weight = reg.coefficients[i + 1];
    return {
      factor: name,
      return: ret,
      weight,
      contribution: weight * ret,
    };
  });

  const alpha = reg.coefficients[0] * 252;
  const residualStd = std(reg.residuals) * Math.sqrt(252);
  const totalReturn = mean(y) * 252;
  const trackingError = residualStd;
  const informationRatio = trackingError === 0 ? 0 : alpha / trackingError;

  return {
    totalReturn,
    factorReturns,
    alpha,
    rSquared: reg.rSquared,
    trackingError,
    informationRatio,
    residualReturn: mean(reg.residuals) * 252,
  };
}

/**
 * Run Fama-French 5-factor attribution
 */
export function famaFrench5Factor(
  stockReturns: number[],
  marketExcess: number[],
  smb: number[],
  hml: number[],
  rmw: number[],
  cma: number[]
): AttributionResult {
  const n = Math.min(stockReturns.length, marketExcess.length, smb.length, hml.length, rmw.length, cma.length);
  const y = stockReturns.slice(0, n);
  const X = Array.from({ length: n }, (_, i) => [1, marketExcess[i], smb[i], hml[i], rmw[i], cma[i]]);

  const reg = olsRegression(y, X);

  const factorNames = ['Market', 'SMB', 'HML', 'RMW', 'CMA'];
  const factorReturns: FactorReturn[] = factorNames.map((name, i) => {
    const factorData = [marketExcess, smb, hml, rmw, cma][i].slice(0, n);
    const ret = mean(factorData) * 252;
    const weight = reg.coefficients[i + 1];
    return {
      factor: name,
      return: ret,
      weight,
      contribution: weight * ret,
    };
  });

  const alpha = reg.coefficients[0] * 252;
  const residualStd = std(reg.residuals) * Math.sqrt(252);
  const totalReturn = mean(y) * 252;

  return {
    totalReturn,
    factorReturns,
    alpha,
    rSquared: reg.rSquared,
    trackingError: residualStd,
    informationRatio: residualStd === 0 ? 0 : alpha / residualStd,
    residualReturn: mean(reg.residuals) * 252,
  };
}

/**
 * Custom factor attribution with user-defined factors
 */
export function customFactorAttribution(
  stockReturns: number[],
  factors: Record<string, number[]>
): AttributionResult {
  const factorNames = Object.keys(factors);
  const factorArrays = factorNames.map(f => factors[f]);
  const n = Math.min(stockReturns.length, ...factorArrays.map(f => f.length));

  const y = stockReturns.slice(0, n);
  const X = Array.from({ length: n }, (_, i) => [1, ...factorArrays.map(f => f[i])]);

  const reg = olsRegression(y, X);

  const factorReturns: FactorReturn[] = factorNames.map((name, i) => {
    const ret = mean(factorArrays[i].slice(0, n)) * 252;
    const weight = reg.coefficients[i + 1];
    return {
      factor: name,
      return: ret,
      weight,
      contribution: weight * ret,
    };
  });

  const alpha = reg.coefficients[0] * 252;
  const totalReturn = mean(y) * 252;
  const residualStd = std(reg.residuals) * Math.sqrt(252);

  return {
    totalReturn,
    factorReturns,
    alpha,
    rSquared: reg.rSquared,
    trackingError: residualStd,
    informationRatio: residualStd === 0 ? 0 : alpha / residualStd,
    residualReturn: mean(reg.residuals) * 252,
  };
}

/**
 * Calculate factor exposures (betas) with significance
 */
export function calculateFactorExposures(
  stockReturns: number[],
  factors: Record<string, number[]>
): FactorExposure[] {
  const _result = customFactorAttribution(stockReturns, factors);
  const factorNames = Object.keys(factors);
  const factorArrays = factorNames.map(f => factors[f]);
  const n = Math.min(stockReturns.length, ...factorArrays.map(f => f.length));
  const y = stockReturns.slice(0, n);
  const X = Array.from({ length: n }, (_, i) => [1, ...factorArrays.map(f => f[i])]);
  const reg = olsRegression(y, X);

  return factorNames.map((name, i) => ({
    factor: name,
    exposure: reg.coefficients[i + 1],
    tStat: reg.tStats[i + 1],
    significant: Math.abs(reg.tStats[i + 1]) > 1.96,
  }));
}

/**
 * Rolling factor attribution over a window
 */
export function rollingAttribution(
  stockReturns: number[],
  factors: Record<string, number[]>,
  window: number = 60
): RollingAttribution[] {
  const factorNames = Object.keys(factors);
  const factorArrays = factorNames.map(f => factors[f]);
  const n = Math.min(stockReturns.length, ...factorArrays.map(f => f.length));
  const results: RollingAttribution[] = [];

  for (let end = window; end <= n; end++) {
    const start = end - window;
    const windowReturns = stockReturns.slice(start, end);
    const windowFactors: Record<string, number[]> = {};
    for (const name of factorNames) {
      windowFactors[name] = factors[name].slice(start, end);
    }

    const attr = customFactorAttribution(windowReturns, windowFactors);
    const contributions: Record<string, number> = {};
    for (const fr of attr.factorReturns) {
      contributions[fr.factor] = fr.contribution;
    }

    results.push({
      date: `day_${end}`,
      alpha: attr.alpha,
      factorContributions: contributions,
      rSquared: attr.rSquared,
    });
  }

  return results;
}

/**
 * Factor correlation matrix
 */
export function factorCorrelationMatrix(factors: Record<string, number[]>): FactorCorrelationMatrix {
  const names = Object.keys(factors);
  const matrix: number[][] = names.map(a =>
    names.map(b => correlation(factors[a], factors[b]))
  );
  return { factors: names, matrix };
}

/**
 * Brinson-style attribution: allocation + selection effects
 */
export function brinsonAttribution(
  portfolioWeights: Record<string, number>,
  benchmarkWeights: Record<string, number>,
  portfolioReturns: Record<string, number>,
  benchmarkReturns: Record<string, number>
): {
  allocationEffect: Record<string, number>;
  selectionEffect: Record<string, number>;
  interactionEffect: Record<string, number>;
  totalAllocation: number;
  totalSelection: number;
  totalInteraction: number;
} {
  const sectors = Object.keys(portfolioWeights);
  const totalBenchReturn = sectors.reduce((s, sec) => s + (benchmarkWeights[sec] || 0) * (benchmarkReturns[sec] || 0), 0);

  const allocationEffect: Record<string, number> = {};
  const selectionEffect: Record<string, number> = {};
  const interactionEffect: Record<string, number> = {};

  for (const sec of sectors) {
    const pw = portfolioWeights[sec] || 0;
    const bw = benchmarkWeights[sec] || 0;
    const pr = portfolioReturns[sec] || 0;
    const br = benchmarkReturns[sec] || 0;

    allocationEffect[sec] = (pw - bw) * (br - totalBenchReturn);
    selectionEffect[sec] = bw * (pr - br);
    interactionEffect[sec] = (pw - bw) * (pr - br);
  }

  return {
    allocationEffect,
    selectionEffect,
    interactionEffect,
    totalAllocation: Object.values(allocationEffect).reduce((s, v) => s + v, 0),
    totalSelection: Object.values(selectionEffect).reduce((s, v) => s + v, 0),
    totalInteraction: Object.values(interactionEffect).reduce((s, v) => s + v, 0),
  };
}

/**
 * Factor performance summary statistics
 */
export function factorPerformanceSummary(factorReturns: number[]): FactorPerformanceSummary {
  const annualizedReturn = mean(factorReturns) * 252;
  const vol = std(factorReturns) * Math.sqrt(252);
  const sharpe = vol === 0 ? 0 : annualizedReturn / vol;

  // Max drawdown
  let peak = factorReturns[0] || 0;
  let cumReturn = 0;
  let maxDD = 0;
  for (const r of factorReturns) {
    cumReturn += r;
    if (cumReturn > peak) peak = cumReturn;
    const dd = peak - cumReturn;
    if (dd > maxDD) maxDD = dd;
  }

  // Monthly aggregation (assuming 21 trading days per month)
  const monthlyReturns: number[] = [];
  for (let i = 0; i < factorReturns.length; i += 21) {
    const slice = factorReturns.slice(i, i + 21);
    monthlyReturns.push(slice.reduce((s, v) => s + v, 0));
  }

  const bestMonth = monthlyReturns.length > 0 ? Math.max(...monthlyReturns) : 0;
  const worstMonth = monthlyReturns.length > 0 ? Math.min(...monthlyReturns) : 0;
  const hitRate = factorReturns.length === 0 ? 0 : factorReturns.filter(r => r > 0).length / factorReturns.length;

  return {
    factor: '',
    annualizedReturn,
    annualizedVolatility: vol,
    sharpeRatio: sharpe,
    maxDrawdown: maxDD,
    bestMonth,
    worstMonth,
    hitRate,
  };
}

/**
 * Detect interaction effects between factor pairs
 */
export function detectInteractionEffects(
  stockReturns: number[],
  factors: Record<string, number[]>
): InteractionEffect[] {
  const names = Object.keys(factors);
  const interactions: InteractionEffect[] = [];

  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const interaction: number[] = [];
      const n = Math.min(factors[names[i]].length, factors[names[j]].length);
      for (let k = 0; k < n; k++) {
        interaction.push(factors[names[i]][k] * factors[names[j]][k]);
      }

      const extendedFactors: Record<string, number[]> = {
        ...factors,
        [`${names[i]}_x_${names[j]}`]: interaction,
      };

      try {
        const result = customFactorAttribution(stockReturns, extendedFactors);
        const interactionFR = result.factorReturns.find(f => f.factor === `${names[i]}_x_${names[j]}`);
        if (interactionFR) {
          const n2 = Math.min(stockReturns.length, ...Object.values(extendedFactors).map(f => f.length));
          const y = stockReturns.slice(0, n2);
          const factorArrs = Object.values(extendedFactors);
          const X = Array.from({ length: n2 }, (_, idx) => [1, ...factorArrs.map(f => f[idx])]);
          const reg = olsRegression(y, X);
          const interactionIdx = Object.keys(extendedFactors).indexOf(`${names[i]}_x_${names[j]}`);

          interactions.push({
            factors: [names[i], names[j]],
            interactionCoefficient: interactionFR.weight,
            tStat: reg.tStats[interactionIdx + 1] || 0,
            significant: Math.abs(reg.tStats[interactionIdx + 1] || 0) > 1.96,
          });
        }
      } catch {
        // Skip if regression fails
      }
    }
  }

  return interactions;
}

/**
 * Multi-stock portfolio factor attribution
 */
export function portfolioFactorAttribution(
  weights: Record<string, number>,
  stockReturns: Record<string, number[]>,
  factors: Record<string, number[]>
): AttributionResult {
  const symbols = Object.keys(weights);
  const minLen = Math.min(...symbols.map(s => stockReturns[s]?.length || 0));

  // Weighted portfolio returns
  const portfolioReturns: number[] = [];
  for (let i = 0; i < minLen; i++) {
    let ret = 0;
    for (const sym of symbols) {
      ret += (weights[sym] || 0) * (stockReturns[sym]?.[i] || 0);
    }
    portfolioReturns.push(ret);
  }

  return customFactorAttribution(portfolioReturns, factors);
}

/**
 * Factor contribution decomposition (absolute vs relative)
 */
export function decomposeContributions(
  attribution: AttributionResult
): {
  absolute: FactorReturn[];
  relative: FactorReturn[];
  totalFactorContribution: number;
  activeAlpha: number;
} {
  const totalFactorContribution = attribution.factorReturns.reduce((s, f) => s + f.contribution, 0);

  const absolute = attribution.factorReturns.map(f => ({ ...f }));

  const relative = attribution.factorReturns.map(f => ({
    ...f,
    contribution: totalFactorContribution === 0 ? 0 : f.contribution / totalFactorContribution,
  }));

  return {
    absolute,
    relative,
    totalFactorContribution,
    activeAlpha: attribution.alpha,
  };
}

/**
 * Marginal contribution to risk by factor
 */
export function marginalContributionToRisk(
  stockReturns: number[],
  factors: Record<string, number[]>
): Record<string, number> {
  const exposures = calculateFactorExposures(stockReturns, factors);
  const covMatrix = factorCorrelationMatrix(factors);
  const factorNames = Object.keys(factors);

  const mcr: Record<string, number> = {};
  const totalVol = std(stockReturns) * Math.sqrt(252);

  for (let i = 0; i < factorNames.length; i++) {
    let riskContrib = 0;
    const exposureI = exposures[i]?.exposure || 0;

    for (let j = 0; j < factorNames.length; j++) {
      const exposureJ = exposures[j]?.exposure || 0;
      const factorVolJ = std(factors[factorNames[j]]) * Math.sqrt(252);
      riskContrib += exposureI * exposureJ * covMatrix.matrix[i][j] * factorVolJ * factorVolJ;
    }

    mcr[factorNames[i]] = totalVol === 0 ? 0 : riskContrib / totalVol;
  }

  return mcr;
}
