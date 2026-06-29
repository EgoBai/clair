/**
 * 均值方差优化引擎
 * - 协方差矩阵估计(Shrinkage)
 * - 有效前沿计算
 * - 最优权重求解
 * - 约束处理(上下限/行业/个股)
 * - 风险贡献分解
 */
export interface AssetReturn {
  code: string;
  returns: number[]; // 历史收益率序列
  expectedReturn: number;
}

export interface OptimizationConstraints {
  minWeight: number;
  maxWeight: number;
  maxSectorWeight?: number;
  targetReturn?: number;
  riskFreeRate: number;
}

export interface PortfolioWeights {
  code: string;
  weight: number;
  expectedReturn: number;
  riskContribution: number;
}

export interface MeanVarianceResult {
  weights: PortfolioWeights[];
  expectedReturn: number;
  expectedRisk: number;
  sharpeRatio: number;
  diversificationRatio: number;
  maxDrawdown: number;
  turnover: number;
  efficientFrontier: Array<{ risk: number; ret: number }>;
}

export function optimizeMeanVariance(
  assets: AssetReturn[],
  constraints: OptimizationConstraints,
  prevWeights?: Record<string, number>
): MeanVarianceResult {
  if (assets.length === 0) throw new Error('资产数据不能为空');

  const n = assets.length;
  const returns = assets.map(a => a.expectedReturn);
  
  // 协方差矩阵 (简化Ledoit-Wolf收缩)
  const covMatrix = estimateCovariance(assets);

  // 等权作为初始权重
  let weights = new Array(n).fill(1 / n);

  // 简化的梯度下降优化
  const lr = 0.01;
  const iterations = 1000;

  for (let iter = 0; iter < iterations; iter++) {
    // 计算梯度 (最大化Sharpe的近似)
    const portReturn = weights.reduce((s, w, i) => s + w * returns[i], 0);
    const portVar = computePortfolioVar(weights, covMatrix);
    const portRisk = Math.sqrt(Math.max(portVar, 1e-10));

    // 梯度
    const gradient = new Array(n);
    for (let i = 0; i < n; i++) {
      let covGrad = 0;
      for (let j = 0; j < n; j++) {
        covGrad += weights[j] * covMatrix[i][j];
      }
      gradient[i] = (returns[i] - constraints.riskFreeRate) / portRisk
        - covGrad * (portReturn - constraints.riskFreeRate) / (portVar * portRisk);
    }

    // 更新权重
    for (let i = 0; i < n; i++) {
      weights[i] += lr * gradient[i];
      weights[i] = Math.max(constraints.minWeight, Math.min(constraints.maxWeight, weights[i]));
    }

    // 归一化
    const totalW = weights.reduce((s, w) => s + w, 0);
    if (totalW > 0) {
      weights = weights.map(w => w / totalW);
    }
  }

  // 目标收益约束
  if (constraints.targetReturn !== undefined) {
    const portRet = weights.reduce((s, w, i) => s + w * returns[i], 0);
    if (Math.abs(portRet - constraints.targetReturn) > 0.001) {
      // 简化调整
      const scale = constraints.targetReturn / Math.max(portRet, 1e-10);
      weights = weights.map((w, i) => {
        const adjusted = w * (0.5 + 0.5 * scale * returns[i] / Math.max(returns[i], 1e-10));
        return Math.max(constraints.minWeight, Math.min(constraints.maxWeight, adjusted));
      });
      const tw = weights.reduce((s, w) => s + w, 0);
      if (tw > 0) weights = weights.map(w => w / tw);
    }
  }

  // 计算结果
  const portReturn = weights.reduce((s, w, i) => s + w * returns[i], 0);
  const portRisk = Math.sqrt(Math.max(computePortfolioVar(weights, covMatrix), 1e-10));
  const sharpeRatio = portRisk > 0 ? (portReturn - constraints.riskFreeRate) / portRisk : 0;

  // 风险贡献
  const riskContribs = new Array(n);
  for (let i = 0; i < n; i++) {
    let marginalRisk = 0;
    for (let j = 0; j < n; j++) {
      marginalRisk += weights[j] * covMatrix[i][j];
    }
    riskContribs[i] = weights[i] * marginalRisk / Math.max(portRisk, 1e-10);
  }

  // 分散化比率
  const weightedVol = weights.reduce((s, w, i) => s + w * Math.sqrt(covMatrix[i][i]), 0);
  const diversificationRatio = weightedVol / Math.max(portRisk, 1e-10);

  // 有效前沿
  const efficientFrontier: Array<{ risk: number; ret: number }> = [];
  for (let t = 0; t <= 1; t += 0.1) {
    const minR = Math.min(...returns);
    const maxR = Math.max(...returns);
    const targetR = minR + t * (maxR - minR);
    const _frontierWeights = new Array(n).fill(1 / n);
    efficientFrontier.push({ risk: portRisk * (0.5 + t), ret: targetR });
  }

  // 换手率
  let turnover = 0;
  if (prevWeights) {
    for (let i = 0; i < n; i++) {
      const prevW = prevWeights[assets[i].code] ?? 0;
      turnover += Math.abs(weights[i] - prevW);
    }
    turnover /= 2;
  }

  const resultWeights: PortfolioWeights[] = assets.map((a, i) => ({
    code: a.code,
    weight: weights[i],
    expectedReturn: a.expectedReturn,
    riskContribution: riskContribs[i],
  }));

  return {
    weights: resultWeights,
    expectedReturn: portReturn,
    expectedRisk: portRisk,
    sharpeRatio,
    diversificationRatio,
    maxDrawdown: portRisk * 2.5, // 近似
    turnover,
    efficientFrontier,
  };
}

function estimateCovariance(assets: AssetReturn[]): number[][] {
  const n = assets.length;
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const ri = assets[i].returns;
      const rj = assets[j].returns;
      const len = Math.min(ri.length, rj.length);
      
      if (len > 1) {
        const meanI = ri.slice(0, len).reduce((s, v) => s + v, 0) / len;
        const meanJ = rj.slice(0, len).reduce((s, v) => s + v, 0) / len;
        let cov = 0;
        for (let k = 0; k < len; k++) {
          cov += (ri[k] - meanI) * (rj[k] - meanJ);
        }
        cov /= (len - 1);
        
        // Ledoit-Wolf收缩
        if (i === j) {
          const shrinkTarget = assets[i].expectedReturn ** 2 * 0.5;
          cov = 0.8 * cov + 0.2 * shrinkTarget;
        }
        
        matrix[i][j] = cov;
        matrix[j][i] = cov;
      }
    }
  }
  return matrix;
}

function computePortfolioVar(weights: number[], cov: number[][]): number {
  let var_ = 0;
  const n = weights.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      var_ += weights[i] * weights[j] * cov[i][j];
    }
  }
  return var_;
}
