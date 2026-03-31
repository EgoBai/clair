/**
 * 因子分析引擎
 * 支持: Fama-French三因子、动量因子、自定义因子回归分析
 */

export interface FactorData {
  name: string;
  returns: number[];
}

export interface StockReturn {
  symbol: string;
  returns: number[];
}

export interface FactorRegressionResult {
  alpha: number; // 截距 (alpha)
  betas: { [factorName: string]: number }; // 因子暴露
  tStats: { [factorName: string]: number }; // t统计量
  rSquared: number;
  adjustedRSquared: number;
  residualStd: number;
  residuals: number[];
}

export interface FactorContribution {
  factorName: string;
  exposure: number;
  factorReturn: number;
  contribution: number; // exposure * factorReturn
  contributionPct: number; // 占总收益比例
}

export interface ICAnalysis {
  factorName: string;
  ic: number; // Information Coefficient
  icStd: number;
  icir: number; // IC / IC_Std
  hitRate: number; // IC > 0 的比例
  periods: number;
}

/**
 * 多因子回归: r = α + β₁F₁ + β₂F₂ + ... + ε
 * 使用普通最小二乘法 (OLS)
 */
export function multiFactorRegression(
  stockReturns: number[],
  factors: FactorData[]
): FactorRegressionResult {
  const n = stockReturns.length;
  const k = factors.length;

  if (n < k + 2 || k === 0) {
    return {
      alpha: 0,
      betas: {},
      tStats: {},
      rSquared: 0,
      adjustedRSquared: 0,
      residualStd: 0,
      residuals: []
    };
  }

  // 构建设计矩阵 X = [1, F1, F2, ...]
  const X: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = [1]; // 截距项
    for (const factor of factors) {
      row.push(i < factor.returns.length ? factor.returns[i] : 0);
    }
    X.push(row);
  }

  // OLS: β = (X'X)⁻¹X'y
  const Xt = transpose(X);
  const XtX = multiplyMatrices(Xt, X);
  const XtXInv = invertMatrix(XtX);

  if (!XtXInv) {
    return {
      alpha: 0,
      betas: Object.fromEntries(factors.map(f => [f.name, 0])),
      tStats: Object.fromEntries(factors.map(f => [f.name, 0])),
      rSquared: 0,
      adjustedRSquared: 0,
      residualStd: 0,
      residuals: new Array(n).fill(0)
    };
  }

  const Xty = multiplyMatrixVector(Xt, stockReturns);
  const beta = multiplyMatrixVector(XtXInv, Xty);

  // 计算预测值和残差
  const predicted = X.map(row => row.reduce((sum, x, j) => sum + x * beta[j], 0));
  const residuals = stockReturns.map((y, i) => y - predicted[i]);

  // R²
  const yMean = stockReturns.reduce((a, b) => a + b, 0) / n;
  const ssTot = stockReturns.reduce((acc, y) => acc + (y - yMean) ** 2, 0);
  const ssRes = residuals.reduce((acc, r) => acc + r ** 2, 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const adjustedRSquared = 1 - (1 - rSquared) * (n - 1) / (n - k - 1);

  // 残差标准差
  const residualStd = Math.sqrt(ssRes / (n - k - 1));

  // t统计量 = β / SE(β), SE(β) = sqrt(diag((X'X)⁻¹) * σ²)
  const se = XtXInv.map((row, i) => Math.sqrt(row[i] * ssRes / (n - k - 1)));
  const tStats: { [key: string]: number } = {};
  for (let i = 0; i < k; i++) {
    tStats[factors[i].name] = se[i + 1] > 0 ? beta[i + 1] / se[i + 1] : 0;
  }

  return {
    alpha: beta[0],
    betas: Object.fromEntries(factors.map((f, i) => [f.name, beta[i + 1]])),
    tStats,
    rSquared,
    adjustedRSquared,
    residualStd,
    residuals
  };
}

/**
 * 计算因子收益归因
 */
export function factorAttribution(
  exposures: { [factor: string]: number },
  factorReturns: { [factor: string]: number }
): FactorContribution[] {
  const contributions: FactorContribution[] = [];
  let totalReturn = 0;

  for (const [factorName, exposure] of Object.entries(exposures)) {
    const factorReturn = factorReturns[factorName] ?? 0;
    const contribution = exposure * factorReturn;
    totalReturn += contribution;
    contributions.push({
      factorName,
      exposure,
      factorReturn,
      contribution,
      contributionPct: 0
    });
  }

  // 计算百分比
  if (Math.abs(totalReturn) > 1e-10) {
    for (const c of contributions) {
      c.contributionPct = c.contribution / totalReturn;
    }
  }

  return contributions;
}

/**
 * 因子IC分析 (信息系数)
 * IC = corr(factor_value, forward_return)
 */
export function calculateFactorIC(
  factorValues: number[],
  forwardReturns: number[],
  periods: number = 1
): ICAnalysis {
  const n = Math.min(factorValues.length, forwardReturns.length);

  if (n < 3) {
    return {
      factorName: '',
      ic: 0,
      icStd: 0,
      icir: 0,
      hitRate: 0,
      periods: 0
    };
  }

  // 计算滚动IC
  const ics: number[] = [];
  const windowSize = Math.max(periods, 20);

  for (let i = 0; i <= n - windowSize; i += periods) {
    const fv = factorValues.slice(i, i + windowSize);
    const fr = forwardReturns.slice(i, i + windowSize);
    const ic = pearsonCorrelation(fv, fr);
    if (!isNaN(ic)) ics.push(ic);
  }

  if (ics.length === 0) {
    return {
      factorName: '',
      ic: 0,
      icStd: 0,
      icir: 0,
      hitRate: 0,
      periods: 0
    };
  }

  const ic = ics.reduce((a, b) => a + b, 0) / ics.length;
  const icStd = Math.sqrt(ics.reduce((a, v) => a + (v - ic) ** 2, 0) / (ics.length - 1));
  const icir = icStd > 0 ? ic / icStd : 0;
  const hitRate = ics.filter(v => v > 0).length / ics.length;

  return {
    factorName: '',
    ic,
    icStd,
    icir,
    hitRate,
    periods: ics.length
  };
}

/**
 * 因子分组收益分析 (分位数回测)
 */
export function factorQuantileBacktest(
  factorValues: number[],
  forwardReturns: number[],
  numQuantiles: number = 5
): { quantile: number; avgReturn: number; count: number; sharpe: number }[] {
  const n = Math.min(factorValues.length, forwardReturns.length);
  if (n < numQuantiles) return [];

  // 按因子值排序并分组
  const indexed = factorValues.slice(0, n).map((v, i) => ({ value: v, return: forwardReturns[i] }));
  indexed.sort((a, b) => a.value - b.value);

  const groupSize = Math.floor(n / numQuantiles);
  const results: { quantile: number; avgReturn: number; count: number; sharpe: number }[] = [];

  for (let q = 0; q < numQuantiles; q++) {
    const start = q * groupSize;
    const end = q === numQuantiles - 1 ? n : (q + 1) * groupSize;
    const group = indexed.slice(start, end);

    const returns = group.map(g => g.return);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(returns.reduce((a, r) => a + (r - avgReturn) ** 2, 0) / (returns.length - 1));
    const sharpe = std > 0 ? avgReturn / std : 0;

    results.push({
      quantile: q + 1,
      avgReturn,
      count: group.length,
      sharpe
    });
  }

  return results;
}

/**
 * 因子相关性分析
 */
export function factorCorrelationMatrix(factors: FactorData[]): {
  names: string[];
  matrix: number[][];
} {
  const names = factors.map(f => f.name);
  const k = factors.length;
  const matrix: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));

  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      const corr = pearsonCorrelation(factors[i].returns, factors[j].returns);
      matrix[i][j] = corr;
      matrix[j][i] = corr;
    }
  }

  return { names, matrix };
}

// ===== Helper Functions =====

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return den > 0 ? num / den : 0;
}

function transpose(matrix: number[][]): number[][] {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const result: number[][] = [];
  for (let j = 0; j < cols; j++) {
    result.push([]);
    for (let i = 0; i < rows; i++) {
      result[j].push(matrix[i][j]);
    }
  }
  return result;
}

function multiplyMatrices(a: number[][], b: number[][]): number[][] {
  const rows = a.length;
  const cols = b[0].length;
  const inner = b.length;
  const result: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      for (let k = 0; k < inner; k++) {
        result[i][j] += a[i][k] * b[k][j];
      }
    }
  }
  return result;
}

function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  return matrix.map(row => row.reduce((sum, val, i) => sum + val * vector[i], 0));
}

function invertMatrix(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  if (n === 0) return null;

  const aug: number[][] = matrix.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  ]);

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) maxRow = k;
    }
    [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];

    if (Math.abs(aug[i][i]) < 1e-10) return null;

    const pivot = aug[i][i];
    for (let j = 0; j < 2 * n; j++) aug[i][j] /= pivot;

    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const factor = aug[k][i];
      for (let j = 0; j < 2 * n; j++) {
        aug[k][j] -= factor * aug[i][j];
      }
    }
  }

  return aug.map(row => row.slice(n));
}
