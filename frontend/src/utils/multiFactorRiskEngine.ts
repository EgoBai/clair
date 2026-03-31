/**
 * 多因子风险模型引擎
 * 基于Barra/CNE因子模型的风险分解和归因
 */

export interface FactorExposure {
  factor: string;
  exposure: number;
  return_: number;
}

export interface StockFactorData {
  symbol: string;
  returns: number[];
  exposures: FactorExposure[];
}

export interface FactorRiskResult {
  factors: string[];
  factorReturns: number[];
  factorCovariance: number[][];
  specificRisk: number[];
  totalRisk: number;
  systematicRisk: number;
  specificRiskPct: number;
  marginalContributions: { factor: string; contribution: number; pct: number }[];
  riskDecomposition: { symbol: string; totalRisk: number; systematic: number; specific: number }[];
}

/**
 * 协方差矩阵计算
 */
function covariance(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (x[i] - mx) * (y[i] - my);
  return sum / (n - 1);
}

/**
 * 矩阵乘法
 */
function matMul(A: number[][], B: number[][]): number[][] {
  const m = A.length, n = B[0].length, p = B.length;
  const result: number[][] = Array.from({ length: m }, () => Array(n).fill(0));
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < p; k++)
        result[i][j] += A[i][k] * B[k][j];
  return result;
}

/**
 * 构建多因子风险模型
 */
export function buildFactorRiskModel(stocks: StockFactorData[]): FactorRiskResult {
  if (stocks.length === 0) {
    return {
      factors: [], factorReturns: [], factorCovariance: [],
      specificRisk: [], totalRisk: 0, systematicRisk: 0,
      specificRiskPct: 0, marginalContributions: [], riskDecomposition: [],
    };
  }

  const factors = stocks[0].exposures.map(e => e.factor);
  const n = factors.length;
  const m = stocks.length;

  // 因子收益矩阵: 每个股票在每个时间点的因子暴露 × 收益率
  const factorReturns: number[] = factors.map((_, fi) => {
    const returns = stocks.map(s => s.exposures[fi]?.return_ || 0);
    return returns.reduce((a, b) => a + b, 0) / returns.length;
  });

  // 因子协方差矩阵
  const factorCovariance: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      const ri = stocks.map(s => s.exposures[i]?.return_ || 0);
      const rj = stocks.map(s => s.exposures[j]?.return_ || 0);
      return covariance(ri, rj);
    })
  );

  // 暴露矩阵 X (m × n)
  const X: number[][] = stocks.map(s => s.exposures.map(e => e.exposure));

  // 特质风险
  const specificRisk = stocks.map(s => {
    const variance = s.returns.length > 1
      ? s.returns.reduce((sum, r) => sum + r * r, 0) / s.returns.length
      : 0;
    return Math.sqrt(Math.max(0, variance));
  });

  // 系统性风险 = X * F * X'
  const XF = matMul(X, factorCovariance);
  const XFXt = matMul(XF, X[0].map((_, j) => X.map(row => row[j])) as unknown as number[][]);
  
  // 简化: 取对角线
  const systematicVar = XFXt.map((row, i) => Math.max(0, row[i] || 0));
  const systematicRisk = Math.sqrt(systematicVar.reduce((a, b) => a + b, 0) / m);
  
  const specificVar = specificRisk.reduce((s, r) => s + r * r, 0) / m;
  const totalRisk = Math.sqrt(systematicVar.reduce((a, b) => a + b, 0) + specificVar);
  const specificRiskPct = totalRisk > 0 ? Math.round(specificVar / (totalRisk * totalRisk) * 100) / 100 : 0;

  // 边际风险贡献
  const marginalContributions = factors.map((factor, i) => {
    const contrib = Math.abs(factorReturns[i]) * Math.sqrt(Math.max(0, factorCovariance[i][i]));
    return { factor, contribution: Math.round(contrib * 10000) / 10000, pct: 0 };
  });
  const totalContrib = marginalContributions.reduce((s, m) => s + m.contribution, 0);
  marginalContributions.forEach(m => {
    m.pct = totalContrib > 0 ? Math.round(m.contribution / totalContrib * 100) / 100 : 0;
  });

  // 个股风险分解
  const riskDecomposition = stocks.map((s, i) => {
    const sys = Math.sqrt(Math.max(0, systematicVar[i]));
    const spec = specificRisk[i];
    return {
      symbol: s.symbol,
      totalRisk: Math.round((sys + spec) * 10000) / 10000,
      systematic: Math.round(sys * 10000) / 10000,
      specific: Math.round(spec * 10000) / 10000,
    };
  });

  return {
    factors,
    factorReturns: factorReturns.map(r => Math.round(r * 10000) / 10000),
    factorCovariance,
    specificRisk,
    totalRisk: Math.round(totalRisk * 10000) / 10000,
    systematicRisk: Math.round(systematicRisk * 10000) / 10000,
    specificRiskPct,
    marginalContributions: marginalContributions.sort((a, b) => b.contribution - a.contribution),
    riskDecomposition,
  };
}
