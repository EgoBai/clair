/**
 * 风险平价引擎
 * - 等风险贡献权重
 * - 波动率估计
 * - 相关性估计
 * - 杠杆调整
 * - 再平衡信号
 */
export interface RiskParityInput {
  code: string;
  returns: number[];
  expectedReturn: number;
}

export interface RiskParityResult {
  weights: Array<{ code: string; weight: number; riskContribution: number }>;
  portfolioRisk: number;
  portfolioReturn: number;
  leverage: number;
  diversificationRatio: number;
  riskBudgetUsed: number;
  rebalanceNeeded: boolean;
  sharpeRatio: number;
}

export function computeRiskParity(
  assets: RiskParityInput[],
  riskBudget?: number[],
  riskFreeRate: number = 0.03
): RiskParityResult {
  if (assets.length === 0) throw new Error('资产数据不能为空');

  const n = assets.length;
  const budget = riskBudget ?? new Array(n).fill(1 / n);

  // 计算协方差矩阵
  const cov = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const ri = assets[i].returns;
      const rj = assets[j].returns;
      const len = Math.min(ri.length, rj.length);
      if (len > 1) {
        const mi = ri.slice(0, len).reduce((s, v) => s + v, 0) / len;
        const mj = rj.slice(0, len).reduce((s, v) => s + v, 0) / len;
        let c = 0;
        for (let k = 0; k < len; k++) {
          c += (ri[k] - mi) * (rj[k] - mj);
        }
        c /= (len - 1);
        cov[i][j] = c;
        cov[j][i] = c;
      }
    }
  }

  // 迭代求解等风险贡献权重
  let weights = new Array(n).fill(1 / n);
  const iterations = 500;
  const lr = 0.01;

  for (let iter = 0; iter < iterations; iter++) {
    const portVar = computeVar(weights, cov);
    const portfolioRisk = Math.sqrt(Math.max(portVar, 1e-10));

    // 边际风险贡献
    const marginalRisk = new Array(n);
    for (let i = 0; i < n; i++) {
      marginalRisk[i] = weights.reduce((s, w, j) => s + w * cov[i][j], 0) / portfolioRisk;
    }

    // 风险贡献
    const riskContrib = weights.map((w, i) => w * marginalRisk[i]);
    const totalRC = riskContrib.reduce((s, v) => s + v, 0);

    // 目标风险贡献
    const targetRC = budget.map(b => b * portfolioRisk);

    // 调整权重
    for (let i = 0; i < n; i++) {
      const error = riskContrib[i] - targetRC[i];
      weights[i] -= lr * error / Math.max(Math.abs(marginalRisk[i]), 0.001);
      weights[i] = Math.max(0.001, weights[i]);
    }

    // 归一化
    const totalW = weights.reduce((s, w) => s + w, 0);
    weights = weights.map(w => w / totalW);
  }

  // 计算结果
  const portVar2 = computeVar(weights, cov);
  const portfolioRisk = Math.sqrt(Math.max(portVar2, 1e-10));
  const portfolioReturn = weights.reduce((s, w, i) => s + w * assets[i].expectedReturn, 0);

  // 风险贡献
  const marginalRisk = weights.map((_, i) =>
    weights.reduce((s, w, j) => s + w * cov[i][j], 0) / portfolioRisk
  );
  const riskContrib = weights.map((w, i) => w * marginalRisk[i]);
  const totalRC = riskContrib.reduce((s, v) => s + v, 0);
  const normRC = riskContrib.map(rc => rc / Math.max(totalRC, 1e-10));

  // 杠杆 (目标波动率调整)
  const targetVol = 0.1; // 10%
  const leverage = portfolioRisk > 0 ? targetVol / portfolioRisk : 1;

  // 分散化比率
  const weightedVol = weights.reduce((s, w, i) => s + w * Math.sqrt(cov[i][i]), 0);
  const diversificationRatio = weightedVol / Math.max(portfolioRisk, 1e-10);

  // 风险预算使用
  const riskBudgetUsed = normRC.reduce((s, rc, i) => s + Math.abs(rc - budget[i]), 0) / n;

  const rebalanceNeeded = riskBudgetUsed > 0.05;
  const sharpeRatio = portfolioRisk > 0 ? (portfolioReturn - riskFreeRate) / portfolioRisk : 0;

  return {
    weights: assets.map((a, i) => ({ code: a.code, weight: weights[i], riskContribution: normRC[i] })),
    portfolioRisk,
    portfolioReturn,
    leverage,
    diversificationRatio,
    riskBudgetUsed,
    rebalanceNeeded,
    sharpeRatio,
  };
}

function computeVar(w: number[], cov: number[][]): number {
  let v = 0;
  const n = w.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      v += w[i] * w[j] * cov[i][j];
    }
  }
  return v;
}
