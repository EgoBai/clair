import { describe, it, expect } from 'vitest';

// 投资组合优化引擎测试
describe('投资组合优化引擎', () => {
  describe('协方差矩阵', () => {
    function covariance(a: number[], b: number[]): number {
      if (a.length !== b.length || a.length === 0) return 0;
      const n = a.length;
      const meanA = a.reduce((s, v) => s + v, 0) / n;
      const meanB = b.reduce((s, v) => s + v, 0) / n;
      return a.reduce((s, v, i) => s + (v - meanA) * (b[i] - meanB), 0) / n;
    }

    function covarianceMatrix(returns: number[][]): number[][] {
      const n = returns.length;
      const matrix: number[][] = [];
      for (let i = 0; i < n; i++) {
        matrix[i] = [];
        for (let j = 0; j < n; j++) {
          matrix[i][j] = covariance(returns[i], returns[j]);
        }
      }
      return matrix;
    }

    it('协方差矩阵对角线为方差', () => {
      const returns = [[0.01, 0.02, -0.01], [0.02, 0.01, 0.01]];
      const matrix = covarianceMatrix(returns);
      expect(matrix[0][0]).toBeGreaterThan(0);
      expect(matrix[1][1]).toBeGreaterThan(0);
    });

    it('矩阵对称', () => {
      const returns = [[0.01, 0.02, -0.01, 0.03], [0.02, 0.01, 0.01, -0.01]];
      const matrix = covarianceMatrix(returns);
      expect(matrix[0][1]).toBeCloseTo(matrix[1][0], 10);
    });

    it('完全正相关', () => {
      const a = [1, 2, 3, 4, 5];
      const b = [2, 4, 6, 8, 10];
      expect(covariance(a, b)).toBeGreaterThan(0);
    });

    it('完全负相关', () => {
      const a = [1, 2, 3, 4, 5];
      const b = [5, 4, 3, 2, 1];
      expect(covariance(a, b)).toBeLessThan(0);
    });

    it('不相关返回0', () => {
      const a = [1, -1, 1, -1];
      const b = [1, 1, -1, -1];
      expect(covariance(a, b)).toBeCloseTo(0, 10);
    });
  });

  describe('相关系数', () => {
    function correlation(a: number[], b: number[]): number {
      if (a.length !== b.length || a.length === 0) return 0;
      const n = a.length;
      const meanA = a.reduce((s, v) => s + v, 0) / n;
      const meanB = b.reduce((s, v) => s + v, 0) / n;
      const cov = a.reduce((s, v, i) => s + (v - meanA) * (b[i] - meanB), 0) / n;
      const stdA = Math.sqrt(a.reduce((s, v) => s + (v - meanA) ** 2, 0) / n);
      const stdB = Math.sqrt(b.reduce((s, v) => s + (v - meanB) ** 2, 0) / n);
      if (stdA === 0 || stdB === 0) return 0;
      return cov / (stdA * stdB);
    }

    it('完美正相关为1', () => {
      expect(correlation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBeCloseTo(1, 5);
    });

    it('完美负相关为-1', () => {
      expect(correlation([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])).toBeCloseTo(-1, 5);
    });

    it('相同序列相关为1', () => {
      expect(correlation([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
    });

    it('常数序列返回0', () => {
      expect(correlation([5, 5, 5], [1, 2, 3])).toBe(0);
    });

    it('范围在[-1, 1]', () => {
      const r = correlation([1, 3, 2, 5, 4], [2, 1, 4, 3, 5]);
      expect(r).toBeGreaterThanOrEqual(-1);
      expect(r).toBeLessThanOrEqual(1);
    });
  });

  describe('组合收益率计算', () => {
    function portfolioReturn(weights: number[], returns: number[]): number {
      if (weights.length !== returns.length) return 0;
      return weights.reduce((s, w, i) => s + w * returns[i], 0);
    }

    it('等权组合收益率', () => {
      expect(portfolioReturn([0.5, 0.5], [0.1, 0.2])).toBeCloseTo(0.15, 5);
    });

    it('全仓单资产', () => {
      expect(portfolioReturn([1, 0], [0.1, 0.2])).toBeCloseTo(0.1, 5);
    });

    it('零权重收益率为0', () => {
      expect(portfolioReturn([0, 0], [0.1, 0.2])).toBe(0);
    });

    it('权重和不为1也可计算', () => {
      expect(portfolioReturn([0.3, 0.3], [0.1, 0.2])).toBeCloseTo(0.09, 5);
    });
  });

  describe('组合波动率计算', () => {
    function portfolioVariance(weights: number[], covMatrix: number[][]): number {
      const n = weights.length;
      let variance = 0;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          variance += weights[i] * weights[j] * covMatrix[i][j];
        }
      }
      return variance;
    }

    it('单资产波动率等于方差', () => {
      expect(portfolioVariance([1], [[0.04]])).toBeCloseTo(0.04, 5);
    });

    it('分散化降低波动率', () => {
      const cov = [[0.04, 0.01], [0.01, 0.04]];
      const singleAsset = portfolioVariance([1, 0], cov);
      const diversified = portfolioVariance([0.5, 0.5], cov);
      expect(diversified).toBeLessThan(singleAsset);
    });

    it('负相关极大降低波动', () => {
      const cov = [[0.04, -0.03], [-0.03, 0.04]];
      const single = portfolioVariance([1, 0], cov);
      const equal = portfolioVariance([0.5, 0.5], cov);
      expect(equal).toBeLessThan(single);
    });

    it('空组合波动为0', () => {
      expect(portfolioVariance([], [])).toBe(0);
    });
  });

  describe('有效前沿计算', () => {
    function generateRandomPortfolios(n: number, assetCount: number): number[][] {
      const portfolios: number[][] = [];
      for (let i = 0; i < n; i++) {
        const raw = Array.from({ length: assetCount }, () => Math.random());
        const sum = raw.reduce((a, b) => a + b, 0);
        portfolios.push(raw.map(v => v / sum));
      }
      return portfolios;
    }

    it('生成指定数量的投资组合', () => {
      expect(generateRandomPortfolios(100, 3)).toHaveLength(100);
    });

    it('每个组合权重和为1', () => {
      const portfolios = generateRandomPortfolios(50, 4);
      portfolios.forEach(w => {
        expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
      });
    });

    it('所有权重非负', () => {
      const portfolios = generateRandomPortfolios(50, 3);
      portfolios.forEach(w => w.forEach(v => expect(v).toBeGreaterThanOrEqual(0)));
    });

    it('资产数量正确', () => {
      const portfolios = generateRandomPortfolios(10, 5);
      portfolios.forEach(w => expect(w).toHaveLength(5));
    });
  });

  describe('Black-Litterman模型', () => {
    function blackLittermanReturn(marketCapWeights: number[], equilibriumReturns: number[], views: { asset: number; viewReturn: number; confidence: number }[]): number[] {
      const adjusted = [...equilibriumReturns];
      for (const view of views) {
        const diff = view.viewReturn - equilibriumReturns[view.asset];
        adjusted[view.asset] += diff * view.confidence;
      }
      return adjusted;
    }

    it('无观点时返回均衡收益', () => {
      const eq = [0.08, 0.10, 0.06];
      const result = blackLittermanReturn([0.4, 0.4, 0.2], eq, []);
      expect(result).toEqual(eq);
    });

    it('高信心观点大幅调整', () => {
      const eq = [0.08, 0.10];
      const views = [{ asset: 0, viewReturn: 0.15, confidence: 0.9 }];
      const result = blackLittermanReturn([0.5, 0.5], eq, views);
      expect(result[0]).toBeGreaterThan(eq[0]);
    });

    it('低信心观点小幅调整', () => {
      const eq = [0.08, 0.10];
      const views = [{ asset: 0, viewReturn: 0.15, confidence: 0.1 }];
      const result = blackLittermanReturn([0.5, 0.5], eq, views);
      expect(result[0]).toBeCloseTo(0.087, 3);
    });
  });

  describe('风险贡献分解', () => {
    function riskContribution(weights: number[], covMatrix: number[][]): number[] {
      const n = weights.length;
      const totalVar = weights.reduce((s, w, i) => s + w * weights.reduce((t, v, j) => t + v * covMatrix[i][j], 0), 0);
      const marginalRisk: number[] = [];
      for (let i = 0; i < n; i++) {
        marginalRisk.push(weights.reduce((s, w, j) => s + w * covMatrix[i][j], 0) / Math.sqrt(totalVar || 1));
      }
      return weights.map((w, i) => w * marginalRisk[i]);
    }

    it('风险贡献非负', () => {
      const cov = [[0.04, 0.01], [0.01, 0.04]];
      const rc = riskContribution([0.5, 0.5], cov);
      rc.forEach(v => expect(v).toBeGreaterThanOrEqual(0));
    });

    it('等权等协方差时风险贡献相等', () => {
      const cov = [[0.04, 0.02], [0.02, 0.04]];
      const rc = riskContribution([0.5, 0.5], cov);
      expect(rc[0]).toBeCloseTo(rc[1], 5);
    });

    it('空组合返回空', () => {
      expect(riskContribution([], [])).toHaveLength(0);
    });
  });
});
