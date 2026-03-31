/**
 * 量化多因子模型引擎 - 因子暴露/收益归因/因子动量/组合优化
 */

export interface FactorData {
  ticker: string;
  factors: Record<string, number>; // 因子名称 -> 因子值
  returns: number; // 收益率(%)
}

export interface FactorExposure {
  factor: string;
  exposure: number;
  tStat: number;
  pValue: number;
  significant: boolean;
}

export interface FactorModel {
  factors: string[];
  exposures: FactorExposure[];
  alpha: number;
  rSquared: number;
  residualVol: number;
  factorReturns: Record<string, number>;
}

export interface FactorMomentum {
  factor: string;
  momentum1m: number;
  momentum3m: number;
  momentum6m: number;
  momentum12m: number;
  trend: 'accelerating' | 'decelerating' | 'reversing' | 'stable';
  signal: 'long' | 'short' | 'neutral';
}

export interface FactorCorrelationMatrix {
  factors: string[];
  matrix: number[][];
  regime: 'normal' | 'crisis' | 'rotation';
  diversificationScore: number; // 0-100
}

/**
 * 线性回归求因子暴露
 */
export function estimateFactorModel(
  data: FactorData[],
  factors: string[],
): FactorModel {
  if (data.length < factors.length + 1) {
    return {
      factors,
      exposures: factors.map(f => ({ factor: f, exposure: 0, tStat: 0, pValue: 1, significant: false })),
      alpha: 0, rSquared: 0, residualVol: 0, factorReturns: {},
    };
  }

  const n = data.length;
  const k = factors.length;

  // 构建 X 矩阵和 Y 向量
  const X: number[][] = data.map(d => factors.map(f => d.factors[f] || 0));
  const Y: number[] = data.map(d => d.returns);

  // OLS: β = (X'X)^-1 X'Y (简化实现)
  const means = factors.map((_, j) => X.reduce((s, row) => s + row[j], 0) / n);
  const yMean = Y.reduce((a, b) => a + b, 0) / n;

  // 中心化
  const Xc = X.map(row => row.map((v, j) => v - means[j]));
  const Yc = Y.map(v => v - yMean);

  // X'X
  const XtX: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      for (let r = 0; r < n; r++) {
        XtX[i][j] += Xc[r][i] * Xc[r][j];
      }
    }
  }

  // X'Y
  const XtY: number[] = Array(k).fill(0);
  for (let i = 0; i < k; i++) {
    for (let r = 0; r < n; r++) {
      XtY[i] += Xc[r][i] * Yc[r];
    }
  }

  // 解方程 (使用对角近似)
  const beta: number[] = factors.map((_, i) => {
    const diag = XtX[i][i] || 1;
    return XtY[i] / diag;
  });

  // 预测值和残差
  const predicted = Xc.map(row => row.reduce((s, v, j) => s + v * beta[j], 0) + yMean);
  const residuals = Y.map((y, i) => y - predicted[i]);
  const ssRes = residuals.reduce((s, r) => s + r * r, 0);
  const ssTot = Y.reduce((s, y) => s + (y - yMean) ** 2, 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  // 残差波动率
  const residualVol = Math.sqrt(ssRes / Math.max(1, n - k - 1));

  // Alpha
  const alpha = yMean - factors.reduce((s, f, i) => s + beta[i] * means[i], 0);

  // t统计量和p值
  const exposures: FactorExposure[] = factors.map((factor, i) => {
    const se = Math.sqrt(residualVol ** 2 / (XtX[i][i] || 1));
    const tStat = se > 0 ? beta[i] / se : 0;
    // 简化 p-value (正态近似)
    const pValue = 2 * (1 - normalCDF(Math.abs(tStat)));
    return {
      factor,
      exposure: Math.round(beta[i] * 10000) / 10000,
      tStat: Math.round(tStat * 100) / 100,
      pValue: Math.round(pValue * 10000) / 10000,
      significant: pValue < 0.05,
    };
  });

  // 因子收益率
  const factorReturns: Record<string, number> = {};
  factors.forEach((f, i) => { factorReturns[f] = Math.round(beta[i] * 10000) / 10000; });

  return {
    factors,
    exposures,
    alpha: Math.round(alpha * 10000) / 10000,
    rSquared: Math.round(rSquared * 10000) / 10000,
    residualVol: Math.round(residualVol * 10000) / 10000,
    factorReturns,
  };
}

/**
 * 因子动量分析
 */
export function analyzeFactorMomentum(
  factor: string,
  monthlyReturns: number[],
): FactorMomentum {
  const len = monthlyReturns.length;

  const momentum1m = len >= 1 ? monthlyReturns[len - 1] : 0;
  const momentum3m = len >= 3 ? monthlyReturns.slice(-3).reduce((a, b) => a + b, 0) / 3 : momentum1m;
  const momentum6m = len >= 6 ? monthlyReturns.slice(-6).reduce((a, b) => a + b, 0) / 6 : momentum3m;
  const momentum12m = len >= 12 ? monthlyReturns.slice(-12).reduce((a, b) => a + b, 0) / 12 : momentum6m;

  let trend: FactorMomentum['trend'];
  if (Math.abs(momentum1m) > Math.abs(momentum3m) * 1.5) trend = 'accelerating';
  else if (Math.abs(momentum1m) < Math.abs(momentum3m) * 0.5) trend = 'decelerating';
  else if ((momentum1m > 0 && momentum3m < 0) || (momentum1m < 0 && momentum3m > 0)) trend = 'reversing';
  else trend = 'stable';

  let signal: FactorMomentum['signal'];
  if (momentum3m > 0.5 && momentum6m > 0) signal = 'long';
  else if (momentum3m < -0.5 && momentum6m < 0) signal = 'short';
  else signal = 'neutral';

  return {
    factor,
    momentum1m: Math.round(momentum1m * 100) / 100,
    momentum3m: Math.round(momentum3m * 100) / 100,
    momentum6m: Math.round(momentum6m * 100) / 100,
    momentum12m: Math.round(momentum12m * 100) / 100,
    trend,
    signal,
  };
}

/**
 * 因子相关性矩阵
 */
export function calculateFactorCorrelation(
  factorReturns: Record<string, number[]>,
): FactorCorrelationMatrix {
  const factors = Object.keys(factorReturns);
  const n = factors.length;

  if (n < 2) {
    return { factors, matrix: [[1]], regime: 'normal', diversificationScore: 0 };
  }

  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1;
      } else {
        const corr = pearsonCorrelation(factorReturns[factors[i]], factorReturns[factors[j]]);
        matrix[i][j] = corr;
        matrix[j][i] = corr;
      }
    }
  }

  // 平均非对角相关性
  let totalCorr = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      totalCorr += Math.abs(matrix[i][j]);
      count++;
    }
  }
  const avgCorr = count > 0 ? totalCorr / count : 0;

  let regime: FactorCorrelationMatrix['regime'];
  if (avgCorr > 0.7) regime = 'crisis';
  else if (avgCorr > 0.5) regime = 'rotation';
  else regime = 'normal';

  const diversificationScore = Math.round((1 - avgCorr) * 100);

  return { factors, matrix: matrix.map(row => row.map(v => Math.round(v * 100) / 100)), regime, diversificationScore };
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const px = x[i] - mx, py = y[i] - my;
    num += px * py; dx += px * px; dy += py * py;
  }
  return Math.sqrt(dx * dy) > 0 ? num / Math.sqrt(dx * dy) : 0;
}

function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}
