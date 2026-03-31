/**
 * Black-Litterman模型引擎
 * - 先验收益估计(市场均衡)
 * - 投资者观点融合
 * - 后验收益计算
 * - 不确定性调整
 * - 最终权重
 */
export interface MarketCap {
  code: string;
  marketCap: number;
  weight: number; // 市场权重
}

export interface InvestorView {
  assets: number[]; // 资产权重(相对观点)
  expectedReturn: number; // 观点预期收益
  confidence: number; // 0-1
}

export interface BlackLittermanInput {
  marketCaps: MarketCap[];
  covMatrix: number[][];
  riskFreeRate: number;
  views: InvestorView[];
  tau: number; // 不确定性参数(通常0.02-0.05)
}

export interface BlackLittermanResult {
  priorReturns: number[];
  posteriorReturns: number[];
  adjustedWeights: Array<{ code: string; weight: number; excessReturn: number }>;
  viewImpact: Array<{ viewIndex: number; weightChange: number }>;
  uncertainty: number[];
  sharpeRatio: number;
}

export function blackLitterman(input: BlackLittermanInput): BlackLittermanResult {
  const { marketCaps, covMatrix, riskFreeRate, views, tau } = input;
  const n = marketCaps.length;
  const k = views.length;

  // 市场权重
  const wMkt = marketCaps.map(m => m.weight);

  // 风险厌恶系数
  const portVar = wMkt.reduce((s, wi, i) =>
    s + wi * wMkt.reduce((ss, wj, j) => ss + wj * covMatrix[i][j], 0), 0);
  const mktReturn = wMkt.reduce((s, w, i) => s + w * (riskFreeRate + 1), 0); // 简化
  const riskAversion = (mktReturn - riskFreeRate) / Math.max(portVar, 1e-10);

  // 先验收益: Π = δ * Σ * w_mkt
  const priorReturns = new Array(n);
  for (let i = 0; i < n; i++) {
    priorReturns[i] = riskFreeRate + riskAversion * wMkt.reduce((s, wj, j) => s + covMatrix[i][j] * wj, 0);
  }

  if (k === 0) {
    // 无观点，返回先验
    return {
      priorReturns,
      posteriorReturns: priorReturns,
      adjustedWeights: marketCaps.map((m, i) => ({
        code: m.code,
        weight: m.weight,
        excessReturn: priorReturns[i] - riskFreeRate,
      })),
      viewImpact: [],
      uncertainty: new Array(n).fill(0),
      sharpeRatio: 0,
    };
  }

  // 观点矩阵 P (k x n)
  const P = views.map(v => v.assets);
  // 观点收益 Q
  const Q = views.map(v => v.expectedReturn);
  // 观点不确定性 Omega (k x k diagonal)
  const Omega = views.map(v => {
    const pSigma = v.assets.reduce((s, pi, i) =>
      s + pi * v.assets.reduce((ss, pj, j) => ss + pj * covMatrix[i][j], 0), 0);
    return (1 / Math.max(v.confidence, 0.01) - 1) * tau * pSigma;
  });

  // 后验收益: μ = [(τΣ)^(-1) + P'Ω^(-1)P]^(-1) * [(τΣ)^(-1)Π + P'Ω^(-1)Q]
  // 简化为: μ = Π + τΣP'[PτΣP' + Ω]^(-1)(Q - PΠ)
  
  const tauSigma = covMatrix.map(row => row.map(v => tau * v));
  
  // P * Π
  const PPi = P.map(row => row.reduce((s, p, i) => s + p * priorReturns[i], 0));
  
  // Q - PΠ
  const diff = Q.map((q, i) => q - PPi[i]);
  
  // P * τΣ * P' + Ω (k x k)
  const M = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => {
      let val = 0;
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) {
          val += P[i][a] * tauSigma[a][b] * P[j][b];
        }
      }
      return i === j ? val + Omega[i] : val;
    })
  );

  // 求M的逆(简化: 对角近似)
  const MInv = M.map((row, i) => {
    const inv = row.map((v, j) => i === j ? 1 / Math.max(v, 1e-10) : 0);
    return inv;
  });

  // M^(-1) * (Q - PΠ)
  const MInvDiff = MInv.map(row => row.reduce((s, v, j) => s + v * diff[j], 0));

  // 后验收益
  const posteriorReturns = priorReturns.map((pi, i) => {
    let adjustment = 0;
    for (let j = 0; j < k; j++) {
      let ptSigma = 0;
      for (let b = 0; b < n; b++) {
        ptSigma += tauSigma[i][b] * P[j][b];
      }
      adjustment += ptSigma * MInvDiff[j];
    }
    return pi + adjustment;
  });

  // 不确定性
  const uncertainty = new Array(n);
  for (let i = 0; i < n; i++) {
    uncertainty[i] = Math.sqrt(tauSigma[i][i]);
  }

  // 视点影响
  const viewImpact = views.map((v, vi) => {
    const weightChange = v.assets.reduce((s, a, i) => s + a * (posteriorReturns[i] - priorReturns[i]), 0);
    return { viewIndex: vi, weightChange };
  });

  // 最终权重 (按后验收益调整)
  const totalExcess = posteriorReturns.reduce((s, r) => s + Math.max(r - riskFreeRate, 0), 0);
  const adjustedWeights = marketCaps.map((m, i) => ({
    code: m.code,
    weight: totalExcess > 0 ? Math.max(riskFreeRate, posteriorReturns[i] - riskFreeRate) / totalExcess : m.weight,
    excessReturn: posteriorReturns[i] - riskFreeRate,
  }));

  // Sharpe
  const newPortRet = adjustedWeights.reduce((s, w) => s + w.weight * w.excessReturn, 0) + riskFreeRate;
  const newPortRisk = Math.sqrt(adjustedWeights.reduce((s, wi, i) =>
    s + wi.weight * adjustedWeights.reduce((ss, wj, j) => ss + wj.weight * covMatrix[i][j], 0), 0));
  const sharpeRatio = newPortRisk > 0 ? (newPortRet - riskFreeRate) / newPortRisk : 0;

  return {
    priorReturns,
    posteriorReturns,
    adjustedWeights,
    viewImpact,
    uncertainty,
    sharpeRatio,
  };
}
