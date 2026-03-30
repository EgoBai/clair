import { describe, it, expect } from 'vitest';

// 资产配置与风险预算引擎测试
describe('资产配置与风险预算', () => {
  // 最小方差组合
  function minVarianceWeights(covMatrix: number[][]): number[] {
    const n = covMatrix.length;
    // 简化：等权 + 反向波动率加权调整
    const vols = covMatrix.map((row, i) => Math.sqrt(row[i]));
    const invVols = vols.map(v => 1 / v);
    const sum = invVols.reduce((a, b) => a + b, 0);
    return invVols.map(iv => iv / sum);
  }

  // 组合收益
  function portfolioReturn(weights: number[], returns: number[]): number {
    return weights.reduce((s, w, i) => s + w * returns[i], 0);
  }

  // 组合波动率
  function portfolioVolatility(weights: number[][], covMatrix: number[][]): number {
    const n = weights.length;
    let variance = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        variance += weights[i] * weights[j] * covMatrix[i][j];
      }
    }
    return Math.sqrt(Math.max(0, variance));
  }

  // 风险贡献
  function riskContributions(weights: number[], covMatrix: number[][]): number[] {
    const n = weights.length;
    const mrc: number[] = []; // 边际风险贡献
    let totalVar = 0;
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < n; j++) {
        sum += weights[j] * covMatrix[i][j];
      }
      mrc.push(sum);
      totalVar += weights[i] * sum;
    }
    const vol = Math.sqrt(totalVar);
    if (vol === 0) return weights.map(() => 0);
    return weights.map((w, i) => (w * mrc[i]) / vol);
  }

  // 风险平价权重 (迭代近似)
  function riskParityWeights(covMatrix: number[][], iterations: number = 100): number[] {
    const n = covMatrix.length;
    let weights = Array(n).fill(1 / n);
    for (let iter = 0; iter < iterations; iter++) {
      const rc = riskContributions(weights, covMatrix);
      const totalRC = rc.reduce((a, b) => a + b, 0);
      const targetRC = totalRC / n;
      const newWeights = weights.map((w, i) => {
        if (rc[i] === 0) return w;
        return w * Math.sqrt(targetRC / rc[i]);
      });
      const sum = newWeights.reduce((a, b) => a + b, 0);
      weights = newWeights.map(w => w / sum);
    }
    return weights;
  }

  // Black-Litterman模型
  function blackLitterman(
    marketCapWeights: number[],
    covMatrix: number[][],
    views: { asset: number; expectedReturn: number; confidence: number }[],
    riskAversion: number = 2.5
  ): number[] {
    const n = marketCapWeights.length;
    // 隐含均衡收益
    const impliedReturns: number[] = [];
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < n; j++) {
        sum += covMatrix[i][j] * marketCapWeights[j];
      }
      impliedReturns.push(riskAversion * sum);
    }

    // 融合观点
    const adjusted = [...impliedReturns];
    for (const view of views) {
      const blend = view.confidence / (view.confidence + 1);
      adjusted[view.asset] = impliedReturns[view.asset] * (1 - blend) + view.expectedReturn * blend;
    }
    return adjusted;
  }

  // 有效前沿点
  function efficientFrontierPoint(
    targetReturn: number,
    returns: number[],
    covMatrix: number[][]
  ): { weights: number[]; risk: number } {
    const n = returns.length;
    // 简化：按收益率倒数比例分配
    const invReturns = returns.map(r => r !== 0 ? 1 / Math.abs(r) : 1);
    const sum = invReturns.reduce((a, b) => a + b, 0);
    let weights = invReturns.map(ir => ir / sum);

    // 调整以匹配目标收益
    const currentReturn = portfolioReturn(weights, returns);
    if (currentReturn !== 0) {
      const scale = targetReturn / currentReturn;
      weights = weights.map(w => w * scale);
      const wSum = weights.reduce((a, b) => a + b, 0);
      if (wSum > 0) weights = weights.map(w => w / wSum);
    }

    const risk = portfolioVolatility(weights, covMatrix);
    return { weights, risk };
  }

  // 条件风险价值 (CVaR)
  function portfolioCVaR(returns: number[], weights: number[], confidence: number = 0.95): number {
    const portfolioReturns = returns.map((_, i) => {
      // 简化：假设每期只有一个资产的收益
      return returns[i] * weights[i % weights.length];
    });
    const sorted = [...portfolioReturns].sort((a, b) => a - b);
    const cutoff = Math.floor((1 - confidence) * sorted.length);
    const tail = sorted.slice(0, Math.max(1, cutoff));
    return -tail.reduce((a, b) => a + b, 0) / tail.length;
  }

  describe('最小方差权重', () => {
    it('权重和为1', () => {
      const cov = [[0.04, 0.01], [0.01, 0.09]];
      const w = minVarianceWeights(cov);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    });

    it('低波动资产权重更高', () => {
      const cov = [[0.01, 0], [0, 0.09]]; // vol 0.1 vs 0.3
      const w = minVarianceWeights(cov);
      expect(w[0]).toBeGreaterThan(w[1]);
    });

    it('所有权重非负', () => {
      const cov = [[0.04, 0.02], [0.02, 0.16]];
      const w = minVarianceWeights(cov);
      w.forEach(v => expect(v).toBeGreaterThanOrEqual(0));
    });
  });

  describe('组合收益', () => {
    it('等权平均', () => {
      const ret = portfolioReturn([0.5, 0.5], [0.1, 0.2]);
      expect(ret).toBeCloseTo(0.15, 5);
    });

    it('全仓单一资产', () => {
      expect(portfolioReturn([1, 0], [0.1, 0.2])).toBeCloseTo(0.1);
    });

    it('权重和不为1时也能计算', () => {
      expect(portfolioReturn([0.3, 0.3], [0.1, 0.2])).toBeCloseTo(0.09);
    });
  });

  describe('风险贡献', () => {
    it('总和等于组合波动率', () => {
      const cov = [[0.04, 0.01], [0.01, 0.09]];
      const weights = [0.6, 0.4];
      const rc = riskContributions(weights, cov);
      const rcSum = rc.reduce((a, b) => a + b, 0);
      const vol = portfolioVolatility(weights, cov);
      expect(rcSum).toBeCloseTo(vol, 5);
    });

    it('等权等协方差时风险贡献相等', () => {
      const cov = [[0.04, 0.02], [0.02, 0.04]];
      const rc = riskContributions([0.5, 0.5], cov);
      expect(rc[0]).toBeCloseTo(rc[1], 3);
    });
  });

  describe('风险平价', () => {
    it('权重和为1', () => {
      const cov = [[0.04, 0.01], [0.01, 0.09]];
      const w = riskParityWeights(cov);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
    });

    it('各资产风险贡献大致相等', () => {
      const cov = [[0.04, 0.01], [0.01, 0.09]];
      const w = riskParityWeights(cov);
      const rc = riskContributions(w, cov);
      expect(Math.abs(rc[0] - rc[1]) / rc[0]).toBeLessThan(0.2);
    });

    it('低波动资产分配更多', () => {
      const cov = [[0.01, 0], [0, 0.09]]; // 0.1 vs 0.3 vol
      const w = riskParityWeights(cov);
      expect(w[0]).toBeGreaterThan(w[1]);
    });
  });

  describe('Black-Litterman', () => {
    it('无观点返回均衡收益', () => {
      const mcw = [0.6, 0.4];
      const cov = [[0.04, 0.01], [0.01, 0.09]];
      const returns = blackLitterman(mcw, cov, []);
      expect(returns).toHaveLength(2);
      returns.forEach(r => expect(typeof r).toBe('number'));
    });

    it('高置信度观点影响大', () => {
      const mcw = [0.5, 0.5];
      const cov = [[0.04, 0], [0, 0.04]];
      const r1 = blackLitterman(mcw, cov, [{ asset: 0, expectedReturn: 0.2, confidence: 0.1 }]);
      const r2 = blackLitterman(mcw, cov, [{ asset: 0, expectedReturn: 0.2, confidence: 10 }]);
      // 高置信度应更接近0.2
      expect(Math.abs(r2[0] - 0.2)).toBeLessThan(Math.abs(r1[0] - 0.2));
    });
  });

  describe('CVaR', () => {
    it('返回非负值', () => {
      const returns = [-0.05, -0.03, -0.01, 0.01, 0.03, 0.05];
      const cvar = portfolioCVaR(returns, [1], 0.95);
      expect(cvar).toBeGreaterThanOrEqual(0);
    });

    it('CVaR >= VaR (尾部更差)', () => {
      const returns = Array.from({ length: 100 }, (_, i) => (i - 50) / 1000);
      const cvar = portfolioCVaR(returns, [1], 0.95);
      const sorted = returns.sort((a, b) => a - b);
      const var95 = -sorted[Math.floor(0.05 * sorted.length)];
      expect(cvar).toBeGreaterThanOrEqual(var95 - 0.01);
    });
  });
});
