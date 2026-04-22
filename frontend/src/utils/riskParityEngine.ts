/**
 * 风险平价引擎
 * - 等风险贡献权重
 * - 最大分散化组合
 * - 最小方差组合
 * - 风险预算分配
 */

export interface AssetData {
  name: string;
  expectedReturn: number;
  volatility: number;
}

export interface CovarianceMatrix {
  assets: string[];
  matrix: number[][];
}

export interface RiskParityResult {
  weights: Record<string, number>;
  riskContributions: Record<string, number>;
  portfolioVolatility: number;
  portfolioReturn: number;
  sharpeRatio: number;
  diversificationRatio: number;
}

export interface RiskBudget {
  asset: string;
  targetRiskPct: number; // 目标风险贡献百分比
}

export class RiskParityEngine {
  /**
   * 等风险贡献权重(迭代法)
   */
  calculateRiskParity(assets: AssetData[], covMatrix: CovarianceMatrix): RiskParityResult {
    const n = assets.length;
    if (n === 0) return this.emptyResult();

    // 初始权重 = 1/n
    let weights = Array(n).fill(1 / n);

    // 迭代求解等风险贡献
    for (let iter = 0; iter < 100; iter++) {
      const riskContribs = this.calcRiskContributions(weights, covMatrix.matrix);
      const targetRisk = 1 / n;

      const newWeights = [];
      for (let i = 0; i < n; i++) {
        const adjust = riskContribs[i] > 0 ? targetRisk / riskContribs[i] : 1;
        newWeights.push(weights[i] * Math.pow(adjust, 0.5));
      }

      // 归一化
      const sum = newWeights.reduce((a, b) => a + b, 0);
      weights = newWeights.map(w => w / sum);
    }

    return this.buildResult(assets, weights, covMatrix.matrix);
  }

  /**
   * 最大分散化组合
   */
  calculateMaxDiversification(assets: AssetData[], covMatrix: CovarianceMatrix): RiskParityResult {
    const n = assets.length;
    if (n === 0) return this.emptyResult();

    const vols = assets.map(a => a.volatility);

    // 初始: 按1/vol加权
    let weights = vols.map(v => v > 0 ? 1 / v : 0.01);
    const sum = weights.reduce((a, b) => a + b, 0);
    weights = weights.map(w => w / sum);

    // 迭代优化分散化比率
    for (let iter = 0; iter < 50; iter++) {
      const portVol = this.portfolioVol(weights, covMatrix.matrix);
      const weightedVol = weights.reduce((s, w, i) => s + w * vols[i], 0);

      // 梯度方向
      const grad = [];
      for (let i = 0; i < n; i++) {
        const marginalRisk = this.marginalRisk(weights, covMatrix.matrix, i);
        grad.push(vols[i] / weightedVol - marginalRisk / portVol);
      }

      // 更新权重
      for (let i = 0; i < n; i++) {
        weights[i] += grad[i] * 0.1;
        weights[i] = Math.max(0.01, weights[i]);
      }

      const newSum = weights.reduce((a, b) => a + b, 0);
      weights = weights.map(w => w / newSum);
    }

    return this.buildResult(assets, weights, covMatrix.matrix);
  }

  /**
   * 最小方差组合
   */
  calculateMinVariance(assets: AssetData[], covMatrix: CovarianceMatrix): RiskParityResult {
    const n = assets.length;
    if (n === 0) return this.emptyResult();

    // 初始: 等权
    let weights = Array(n).fill(1 / n);

    // 梯度下降最小化方差
    for (let iter = 0; iter < 100; iter++) {
      const grad = [];
      for (let i = 0; i < n; i++) {
        let g = 0;
        for (let j = 0; j < n; j++) {
          g += weights[j] * covMatrix.matrix[i][j];
        }
        grad.push(g);
      }

      for (let i = 0; i < n; i++) {
        weights[i] -= grad[i] * 0.01;
        weights[i] = Math.max(0.01, weights[i]);
      }

      const sum = weights.reduce((a, b) => a + b, 0);
      weights = weights.map(w => w / sum);
    }

    return this.buildResult(assets, weights, covMatrix.matrix);
  }

  /**
   * 自定义风险预算
   */
  calculateRiskBudget(assets: AssetData[], covMatrix: CovarianceMatrix, budgets: RiskBudget[]): RiskParityResult {
    const n = assets.length;
    if (n === 0) return this.emptyResult();

    const targets = assets.map(a => {
      const b = budgets.find(bu => bu.asset === a.name);
      return b ? b.targetRiskPct : 1 / n;
    });

    // 归一化目标
    const targetSum = targets.reduce((a, b) => a + b, 0);
    const normTargets = targets.map(t => t / targetSum);

    let weights = Array(n).fill(1 / n);

    for (let iter = 0; iter < 100; iter++) {
      const riskContribs = this.calcRiskContributions(weights, covMatrix.matrix);

      const newWeights = [];
      for (let i = 0; i < n; i++) {
        const adjust = riskContribs[i] > 0 ? normTargets[i] / riskContribs[i] : 1;
        newWeights.push(weights[i] * Math.pow(adjust, 0.5));
      }

      const sum = newWeights.reduce((a, b) => a + b, 0);
      weights = newWeights.map(w => w / sum);
    }

    return this.buildResult(assets, weights, covMatrix.matrix);
  }

  // 辅助方法
  private portfolioVol(weights: number[], cov: number[][]): number {
    let variance = 0;
    for (let i = 0; i < weights.length; i++) {
      for (let j = 0; j < weights.length; j++) {
        variance += weights[i] * weights[j] * cov[i][j];
      }
    }
    return Math.sqrt(Math.max(0, variance));
  }

  private marginalRisk(weights: number[], cov: number[][], i: number): number {
    let mr = 0;
    for (let j = 0; j < weights.length; j++) {
      mr += weights[j] * cov[i][j];
    }
    const portVol = this.portfolioVol(weights, cov);
    return portVol > 0 ? mr / portVol : 0;
  }

  private calcRiskContributions(weights: number[], cov: number[][]): number[] {
    const portVol = this.portfolioVol(weights, cov);
    if (portVol === 0) return weights.map(() => 1 / weights.length);

    const mrc: number[] = [];
    for (let i = 0; i < weights.length; i++) {
      mrc.push(this.marginalRisk(weights, cov, i));
    }

    const rc = weights.map((w, i) => w * mrc[i]);
    const totalRC = rc.reduce((a, b) => a + Math.abs(b), 0);
    return totalRC > 0 ? rc.map(r => Math.abs(r) / totalRC) : weights.map(() => 1 / weights.length);
  }

  private buildResult(assets: AssetData[], weights: number[], cov: number[][]): RiskParityResult {
    const n = assets.length;
    const weightMap: Record<string, number> = {};
    assets.forEach((a, i) => { weightMap[a.name] = Math.round(weights[i] * 10000) / 10000; });

    const riskContribs = this.calcRiskContributions(weights, cov);
    const rcMap: Record<string, number> = {};
    assets.forEach((a, i) => { rcMap[a.name] = Math.round(riskContribs[i] * 10000) / 10000; });

    const portVol = this.portfolioVol(weights, cov);
    const portReturn = weights.reduce((s, w, i) => s + w * assets[i].expectedReturn, 0);
    const weightedVol = weights.reduce((s, w, i) => s + w * assets[i].volatility, 0);
    const divRatio = portVol > 0 ? weightedVol / portVol : 1;

    return {
      weights: weightMap,
      riskContributions: rcMap,
      portfolioVolatility: Math.round(portVol * 10000) / 10000,
      portfolioReturn: Math.round(portReturn * 10000) / 10000,
      sharpeRatio: portVol > 0 ? Math.round(portReturn / portVol * 10000) / 10000 : 0,
      diversificationRatio: Math.round(divRatio * 10000) / 10000,
    };
  }

  private emptyResult(): RiskParityResult {
    return { weights: {}, riskContributions: {}, portfolioVolatility: 0, portfolioReturn: 0, sharpeRatio: 0, diversificationRatio: 0 };
  }
}

export default new RiskParityEngine();
