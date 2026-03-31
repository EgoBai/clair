/**
 * 投资组合优化引擎
 * 支持: 均值方差优化、最大夏普比率、最小方差、风险平价
 */

export interface AssetReturn {
  symbol: string;
  returns: number[]; // 日收益率序列
  expectedReturn: number;
  volatility: number;
}

export interface CovarianceMatrix {
  symbols: string[];
  matrix: number[][];
}

export interface PortfolioWeights {
  [symbol: string]: number;
}

export interface OptimizationResult {
  weights: PortfolioWeights;
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
}

export interface EfficientFrontierPoint {
  targetReturn: number;
  volatility: number;
  weights: PortfolioWeights;
  sharpeRatio: number;
}

/**
 * 计算协方差矩阵
 */
export function calculateCovarianceMatrix(assets: AssetReturn[]): CovarianceMatrix {
  const symbols = assets.map(a => a.symbol);
  const n = assets.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const cov = calculateCovariance(assets[i].returns, assets[j].returns);
      matrix[i][j] = cov;
      matrix[j][i] = cov;
    }
  }

  return { symbols, matrix };
}

/**
 * 计算两个序列的协方差
 */
function calculateCovariance(x: number[], y: number[]): number {
  const len = Math.min(x.length, y.length);
  if (len < 2) return 0;

  const meanX = x.slice(0, len).reduce((a, b) => a + b, 0) / len;
  const meanY = y.slice(0, len).reduce((a, b) => a + b, 0) / len;

  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += (x[i] - meanX) * (y[i] - meanY);
  }
  return sum / (len - 1);
}

/**
 * 最小方差组合
 * 使用解析法求解 (权重 = Σ⁻¹·1 / 1ᵀ·Σ⁻¹·1)
 */
export function minimumVariancePortfolio(
  covMatrix: CovarianceMatrix,
  constraints?: { min?: number; max?: number }
): PortfolioWeights {
  const { symbols, matrix } = covMatrix;
  const n = symbols.length;
  if (n === 0) return {};

  const minW = constraints?.min ?? 0;
  const maxW = constraints?.max ?? 1;

  // 对于单资产，直接返回100%权重
  if (n === 1) {
    return { [symbols[0]]: 1 };
  }

  // 尝试解析解
  const inv = invertMatrix(matrix);
  if (inv) {
    const ones = new Array(n).fill(1);
    const invOnes = multiplyMatrixVector(inv, ones);
    const sumInvOnes = invOnes.reduce((a, b) => a + b, 0);

    if (Math.abs(sumInvOnes) > 1e-10) {
      const rawWeights = invOnes.map(w => w / sumInvOnes);
      // 应用约束
      const clamped = clampWeights(rawWeights, minW, maxW);
      return Object.fromEntries(symbols.map((s, i) => [s, clamped[i]]));
    }
  }

  // 回退: 等权重
  const equalW = 1 / n;
  return Object.fromEntries(symbols.map(s => [s, equalW]));
}

/**
 * 最大夏普比率组合 (给定无风险利率)
 */
export function maxSharpePortfolio(
  assets: AssetReturn[],
  covMatrix: CovarianceMatrix,
  riskFreeRate: number = 0.02 / 252
): OptimizationResult {
  const { symbols, matrix } = covMatrix;
  const n = symbols.length;

  if (n === 0) {
    return { weights: {}, expectedReturn: 0, volatility: 0, sharpeRatio: 0 };
  }

  if (n === 1) {
    const a = assets[0];
    const sr = a.volatility > 0 ? (a.expectedReturn - riskFreeRate) / a.volatility : 0;
    return {
      weights: { [symbols[0]]: 1 },
      expectedReturn: a.expectedReturn,
      volatility: a.volatility,
      sharpeRatio: sr
    };
  }

  // 最大夏普: w ∝ Σ⁻¹·(μ - rf·1)
  const excessReturns = assets.map(a => a.expectedReturn - riskFreeRate);
  const inv = invertMatrix(matrix);

  if (inv) {
    const invExcess = multiplyMatrixVector(inv, excessReturns);
    const sumInvExcess = invExcess.reduce((a, b) => a + b, 0);

    if (Math.abs(sumInvExcess) > 1e-10) {
      const rawWeights = invExcess.map(w => w / sumInvExcess);
      const clamped = clampWeights(rawWeights, 0, 1);
      const normWeights = normalizeWeights(clamped);
      const weights = Object.fromEntries(symbols.map((s, i) => [s, normWeights[i]]));

      const portReturn = calculatePortfolioReturn(assets, normWeights);
      const portVol = calculatePortfolioVolatility(covMatrix, normWeights);
      const sr = portVol > 0 ? (portReturn - riskFreeRate) / portVol : 0;

      return { weights, expectedReturn: portReturn, volatility: portVol, sharpeRatio: sr };
    }
  }

  // 回退: 等权重
  const eqW = 1 / n;
  const weights = Object.fromEntries(symbols.map(s => [s, eqW]));
  const wArr = new Array(n).fill(eqW);
  const portReturn = calculatePortfolioReturn(assets, wArr);
  const portVol = calculatePortfolioVolatility(covMatrix, wArr);
  const sr = portVol > 0 ? (portReturn - riskFreeRate) / portVol : 0;

  return { weights, expectedReturn: portReturn, volatility: portVol, sharpeRatio: sr };
}

/**
 * 生成有效前沿
 */
export function generateEfficientFrontier(
  assets: AssetReturn[],
  covMatrix: CovarianceMatrix,
  numPoints: number = 20,
  riskFreeRate: number = 0.02 / 252
): EfficientFrontierPoint[] {
  const n = assets.length;
  if (n === 0) return [];

  const minRet = Math.min(...assets.map(a => a.expectedReturn));
  const maxRet = Math.max(...assets.map(a => a.expectedReturn));
  const step = (maxRet - minRet) / Math.max(numPoints - 1, 1);

  const frontier: EfficientFrontierPoint[] = [];

  for (let i = 0; i < numPoints; i++) {
    const targetReturn = minRet + step * i;
    const result = minVarianceForTargetReturn(assets, covMatrix, targetReturn);
    if (result) {
      const sr = result.volatility > 0 ? (result.expectedReturn - riskFreeRate) / result.volatility : 0;
      frontier.push({
        targetReturn,
        volatility: result.volatility,
        weights: result.weights,
        sharpeRatio: sr
      });
    }
  }

  return frontier;
}

/**
 * 风险平价组合 (Risk Parity)
 * 每个资产对组合风险的贡献相等
 */
export function riskParityPortfolio(
  covMatrix: CovarianceMatrix,
  maxIterations: number = 1000,
  tolerance: number = 1e-8
): PortfolioWeights {
  const { symbols, matrix } = covMatrix;
  const n = symbols.length;
  if (n === 0) return {};
  if (n === 1) return { [symbols[0]]: 1 };

  // 迭代求解: 从等权重开始
  let weights = new Array(n).fill(1 / n);

  for (let iter = 0; iter < maxIterations; iter++) {
    const sigma = Math.sqrt(multiplyQuadratic(weights, matrix));
    if (sigma < 1e-10) break;

    // 计算边际风险贡献
    const mrc: number[] = [];
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < n; j++) {
        sum += matrix[i][j] * weights[j];
      }
      mrc.push(sum / sigma);
    }

    // 风险贡献 = w_i * MRC_i
    const rc = weights.map((w, i) => w * mrc[i]);
    const targetRC = sigma / n;

    // 更新权重
    const newWeights = weights.map((w, i) => {
      if (rc[i] < 1e-10) return w;
      return w * (targetRC / rc[i]);
    });

    // 归一化
    const sum = newWeights.reduce((a, b) => a + b, 0);
    const normalized = newWeights.map(w => w / sum);

    // 检查收敛
    const diff = normalized.reduce((acc, w, i) => acc + Math.abs(w - weights[i]), 0);
    weights = normalized;

    if (diff < tolerance) break;
  }

  return Object.fromEntries(symbols.map((s, i) => [s, weights[i]]));
}

/**
 * 从收益率数据构建资产信息
 */
export function buildAssetReturns(
  data: Map<string, number[]>,
  annualizeFactor: number = 252
): AssetReturn[] {
  const assets: AssetReturn[] = [];

  for (const [symbol, prices] of data) {
    if (prices.length < 2) continue;

    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] > 0) {
        returns.push(Math.log(prices[i] / prices[i - 1]));
      }
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1);
    const vol = Math.sqrt(variance * annualizeFactor);
    const expRet = mean * annualizeFactor;

    assets.push({
      symbol,
      returns,
      expectedReturn: expRet,
      volatility: vol
    });
  }

  return assets;
}

// ===== Helper Functions =====

function invertMatrix(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  if (n === 0) return null;

  // 增广矩阵 [A | I]
  const aug: number[][] = matrix.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  ]);

  // 高斯-约旦消元
  for (let i = 0; i < n; i++) {
    // 找主元
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

function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  return matrix.map(row => row.reduce((sum, val, i) => sum + val * vector[i], 0));
}

function multiplyQuadratic(weights: number[], matrix: number[][]): number {
  let sum = 0;
  const n = weights.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sum += weights[i] * matrix[i][j] * weights[j];
    }
  }
  return sum;
}

function clampWeights(weights: number[], min: number, max: number): number[] {
  const clamped = weights.map(w => Math.max(min, Math.min(max, w)));
  const sum = clamped.reduce((a, b) => a + b, 0);
  if (sum > 0) return clamped.map(w => w / sum);
  return clamped;
}

function normalizeWeights(weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum > 0) return weights.map(w => w / sum);
  return weights;
}

function calculatePortfolioReturn(assets: AssetReturn[], weights: number[]): number {
  return assets.reduce((sum, a, i) => sum + a.expectedReturn * weights[i], 0);
}

function calculatePortfolioVolatility(covMatrix: CovarianceMatrix, weights: number[]): number {
  return Math.sqrt(multiplyQuadratic(weights, covMatrix.matrix));
}

function minVarianceForTargetReturn(
  assets: AssetReturn[],
  covMatrix: CovarianceMatrix,
  targetReturn: number
): OptimizationResult | null {
  const { symbols, matrix } = covMatrix;
  const n = symbols.length;

  // 简化: 使用等权重附近的解，通过调整找最接近目标收益的组合
  const inv = invertMatrix(matrix);
  if (!inv) return null;

  const ones = new Array(n).fill(1);
  const expectedReturns = assets.map(a => a.expectedReturn);

  // 拉格朗日乘数法
  const A = multiplyQuadratic(ones, matrix);
  const B = ones.reduce((sum, _, i) => sum + expectedReturns.reduce((s, r, j) => s + inv[i][j] * r, 0), 0);
  const C = multiplyQuadratic(expectedReturns, inv);

  const denom = A * C - B * B;
  if (Math.abs(denom) < 1e-10) return null;

  const lambda = (C - B * targetReturn) / denom;
  const gamma = (A * targetReturn - B) / denom;

  const weights: number[] = [];
  for (let i = 0; i < n; i++) {
    let w = 0;
    for (let j = 0; j < n; j++) {
      w += inv[i][j] * (lambda * ones[j] + gamma * expectedReturns[j]);
    }
    weights.push(w);
  }

  const clamped = clampWeights(weights, 0, 1);
  const portRet = calculatePortfolioReturn(assets, clamped);
  const portVol = calculatePortfolioVolatility(covMatrix, clamped);
  const portWeights = Object.fromEntries(symbols.map((s, i) => [s, clamped[i]]));

  return { weights: portWeights, expectedReturn: portRet, volatility: portVol, sharpeRatio: 0 };
}
