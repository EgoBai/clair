import { describe, it, expect } from 'vitest';

describe('多资产配置引擎 (Multi-Asset Allocation)', () => {
  // 协方差矩阵
  function covarianceMatrix(returns: number[][]): number[][] {
    const n = returns.length;
    const t = returns[0]?.length || 0;
    if (t === 0) return [];
    const means = returns.map(r => r.reduce((s, v) => s + v, 0) / t);
    const cov: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        let sum = 0;
        for (let k = 0; k < t; k++) sum += (returns[i][k] - means[i]) * (returns[j][k] - means[j]);
        cov[i][j] = cov[j][i] = sum / (t - 1);
      }
    }
    return cov;
  }

  // 组合收益和风险
  function portfolioStats(weights: number[], expectedReturns: number[], covMatrix: number[][]): { ret: number; risk: number; sharpe: number } {
    const ret = weights.reduce((s, w, i) => s + w * expectedReturns[i], 0);
    let variance = 0;
    for (let i = 0; i < weights.length; i++)
      for (let j = 0; j < weights.length; j++)
        variance += weights[i] * weights[j] * covMatrix[i][j];
    const risk = Math.sqrt(Math.max(variance, 0));
    return { ret, risk, sharpe: risk > 0 ? ret / risk : 0 };
  }

  // 等权配置
  function equalWeight(n: number): number[] {
    return Array(n).fill(1 / n);
  }

  // 风险平价权重
  function riskParityWeights(covMatrix: number[][]): number[] {
    const n = covMatrix.length;
    if (n === 0) return [];
    const invVols = covMatrix.map((row, i) => 1 / Math.sqrt(row[i] || 1));
    const total = invVols.reduce((s, v) => s + v, 0);
    return invVols.map(v => v / total);
  }

  // 最大分散化权重
  function maxDiversificationWeights(covMatrix: number[][]): number[] {
    const n = covMatrix.length;
    if (n === 0) return [];
    const sigmas = covMatrix.map((row, i) => Math.sqrt(row[i]));
    const totalSigma = sigmas.reduce((s, v) => s + v, 0);
    // 简化近似
    const raw = sigmas.map(s => totalSigma / (s * n * n));
    const sum = raw.reduce((s, v) => s + v, 0);
    return raw.map(v => v / sum);
  }

  // Black-Litterman调整收益
  function blackLitterman(priorReturns: number[], tau: number, P: number[][], Q: number[], omega: number[][]): number[] {
    const n = priorReturns.length;
    const k = Q.length;
    const adjusted = [...priorReturns];
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < n; j++) {
        adjusted[j] += tau * P[i][j] * (Q[i] - P[i].reduce((s, v, idx) => s + v * priorReturns[idx], 0)) / (omega[i][i] || 1);
      }
    }
    return adjusted;
  }

  // 前沿效率检验 (给定风险水平下最大收益)
  function efficientFrontierPoint(targetRisk: number, expectedReturns: number[], covMatrix: number[][]): number {
    // 简化：等权 + 最优单资产的线性插值
    const n = expectedReturns.length;
    let bestRet = 0;
    for (let i = 0; i < n; i++) {
      const assetRisk = Math.sqrt(covMatrix[i][i]);
      if (assetRisk <= targetRisk) bestRet = Math.max(bestRet, expectedReturns[i]);
    }
    return bestRet;
  }

  it('协方差矩阵对称且对角为正', () => {
    const returns = [[0.01, -0.02, 0.015], [0.02, 0.01, -0.01]];
    const cov = covarianceMatrix(returns);
    expect(cov[0][1]).toBeCloseTo(cov[1][0], 6);
    expect(cov[0][0]).toBeGreaterThan(0);
  });

  it('等权配置', () => {
    const w = equalWeight(4);
    expect(w).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(w.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 10);
  });

  it('组合收益计算', () => {
    const stats = portfolioStats([0.5, 0.5], [0.08, 0.12], [[0.04, 0.01], [0.01, 0.09]]);
    expect(stats.ret).toBeCloseTo(0.10, 5);
    expect(stats.risk).toBeGreaterThan(0);
  });

  it('完全正相关组合风险', () => {
    const stats = portfolioStats([0.5, 0.5], [0.1, 0.1], [[0.04, 0.04], [0.04, 0.04]]);
    expect(stats.risk).toBeCloseTo(0.2, 5);
  });

  it('风险平价权重之和为1', () => {
    const w = riskParityWeights([[0.04, 0.01], [0.01, 0.09]]);
    expect(w.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 5);
  });

  it('高波动资产获低风险平价权重', () => {
    const w = riskParityWeights([[0.01, 0.001], [0.001, 0.09]]);
    expect(w[0]).toBeGreaterThan(w[1]); // 低波动资产权重更高
  });

  it('最大分散化权重之和为1', () => {
    const w = maxDiversificationWeights([[0.04, 0.01], [0.01, 0.09]]);
    expect(w.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 3);
  });

  it('Black-Litterman调整收益', () => {
    const prior = [0.08, 0.10];
    const P = [[1, -1]]; // 看好资产0相对资产1
    const Q = [0.03];
    const omega = [[0.001]];
    const adjusted = blackLitterman(prior, 0.05, P, Q, omega);
    expect(adjusted).toHaveLength(2);
    expect(adjusted[0]).toBeGreaterThan(adjusted[1]);
  });

  it('空协方差矩阵处理', () => {
    expect(covarianceMatrix([])).toEqual([]);
  });

  it('高效前沿收益不低于单资产', () => {
    const ret = efficientFrontierPoint(0.3, [0.05, 0.10], [[0.09, 0.02], [0.02, 0.04]]);
    expect(ret).toBeGreaterThanOrEqual(0.05);
  });

  it('零权重组合收益为零', () => {
    const stats = portfolioStats([0, 0], [0.08, 0.12], [[0.04, 0.01], [0.01, 0.09]]);
    expect(stats.ret).toBe(0);
  });

  it('单资产组合Sharpe比率', () => {
    const stats = portfolioStats([1], [0.10], [[0.04]]);
    expect(stats.sharpe).toBeCloseTo(0.5, 5);
  });
});
