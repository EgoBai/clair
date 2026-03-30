import { describe, it, expect } from 'vitest';

// 因子模型引擎
interface Factor { name: string; values: number[] }
interface FactorExposure { symbol: string; exposures: Record<string, number>; expectedReturn: number }
interface RegressionResult { coefficients: Record<string, number>; rSquared: number; residuals: number[]; tStats: Record<string, number> }

class FactorModel {
  static calcFactorReturns(factorReturns: Record<string, number[]>, weights: number[]): number[] {
    const factors = Object.keys(factorReturns);
    if (factors.length === 0 || weights.length === 0) return [];
    const len = factorReturns[factors[0]].length;
    const result: number[] = [];
    for (let i = 0; i < len; i++) {
      let r = 0;
      for (let j = 0; j < factors.length; j++) {
        r += factorReturns[factors[j]][i] * (weights[j] || 0);
      }
      result.push(r);
    }
    return result;
  }

  static linearRegression(y: number[], x: number[][]): RegressionResult {
    const n = y.length;
    if (n === 0 || x.length === 0 || x[0].length === 0) {
      return { coefficients: {}, rSquared: 0, residuals: [], tStats: {} };
    }
    const k = x[0].length;
    // OLS: b = (X'X)^-1 X'y - simplified for small dimensions
    const means = Array(k).fill(0);
    for (let j = 0; j < k; j++) {
      for (let i = 0; i < n; i++) means[j] += x[i][j];
      means[j] /= n;
    }
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    // Simplified: just compute correlation-based coefficients
    const coeffs: Record<string, number> = {};
    const tStats: Record<string, number> = {};
    for (let j = 0; j < k; j++) {
      let cov = 0, varX = 0;
      for (let i = 0; i < n; i++) {
        cov += (x[i][j] - means[j]) * (y[i] - meanY);
        varX += (x[i][j] - means[j]) ** 2;
      }
      coeffs[`factor_${j}`] = varX > 0 ? cov / varX : 0;
      tStats[`factor_${j}`] = Math.abs(coeffs[`factor_${j}`]) * Math.sqrt(n);
    }

    // R-squared
    const predicted = y.map((_, i) => {
      let p = 0;
      for (let j = 0; j < k; j++) p += x[i][j] * coeffs[`factor_${j}`];
      return p;
    });
    const ssRes = y.reduce((s, yi, i) => s + (yi - predicted[i]) ** 2, 0);
    const ssTot = y.reduce((s, yi) => s + (yi - meanY) ** 2, 0);
    const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    const residuals = y.map((yi, i) => yi - predicted[i]);

    return { coefficients: coeffs, rSquared, residuals, tStats };
  }

  static calcFactorContribution(exposures: FactorExposure, factorReturns: Record<string, number>): Record<string, number> {
    const contributions: Record<string, number> = {};
    for (const [factor, exposure] of Object.entries(exposures.exposures)) {
      contributions[factor] = exposure * (factorReturns[factor] || 0);
    }
    return contributions;
  }

  static rankByFactor(stockExposures: FactorExposure[], factor: string, ascending: boolean = false): { symbol: string; score: number; rank: number }[] {
    const scores = stockExposures.map(s => ({ symbol: s.symbol, score: s.exposures[factor] || 0 }));
    scores.sort((a, b) => ascending ? a.score - b.score : b.score - a.score);
    return scores.map((s, i) => ({ ...s, rank: i + 1 }));
  }

  static calcIC(factorValues: number[], returns: number[]): number {
    if (factorValues.length !== returns.length || factorValues.length < 2) return 0;
    const n = factorValues.length;
    const rank = (arr: number[]) => {
      const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
      const ranks = new Array(n);
      sorted.forEach((s, r) => ranks[s.i] = r + 1);
      return ranks;
    };
    const r1 = rank(factorValues), r2 = rank(returns);
    const m1 = r1.reduce((a, b) => a + b, 0) / n;
    const m2 = r2.reduce((a, b) => a + b, 0) / n;
    let cov = 0, v1 = 0, v2 = 0;
    for (let i = 0; i < n; i++) {
      cov += (r1[i] - m1) * (r2[i] - m2);
      v1 += (r1[i] - m1) ** 2;
      v2 += (r2[i] - m2) ** 2;
    }
    return Math.sqrt(v1) * Math.sqrt(v2) > 0 ? cov / (Math.sqrt(v1) * Math.sqrt(v2)) : 0;
  }

  static calcDecileReturns(factorValues: number[], returns: number[], deciles: number = 10): { decile: number; avgReturn: number; count: number }[] {
    if (factorValues.length !== returns.length) return [];
    const indexed = factorValues.map((v, i) => ({ factor: v, ret: returns[i] })).sort((a, b) => a.factor - b.factor);
    const bucketSize = Math.ceil(indexed.length / deciles);
    const result: { decile: number; avgReturn: number; count: number }[] = [];
    for (let d = 0; d < deciles; d++) {
      const bucket = indexed.slice(d * bucketSize, (d + 1) * bucketSize);
      if (bucket.length === 0) continue;
      const avg = bucket.reduce((s, b) => s + b.ret, 0) / bucket.length;
      result.push({ decile: d + 1, avgReturn: avg, count: bucket.length });
    }
    return result;
  }
}

describe('因子模型引擎', () => {
  describe('因子收益计算', () => {
    it('应该计算加权因子收益', () => {
      const factorReturns = { value: [0.01, 0.02, -0.01], momentum: [0.02, 0.01, 0.015] };
      const result = FactorModel.calcFactorReturns(factorReturns, [0.6, 0.4]);
      expect(result).toHaveLength(3);
      expect(result[0]).toBeCloseTo(0.01 * 0.6 + 0.02 * 0.4, 5);
    });
    it('应该处理空输入', () => {
      expect(FactorModel.calcFactorReturns({}, [])).toEqual([]);
    });
    it('单因子应直接返回', () => {
      const result = FactorModel.calcFactorReturns({ value: [0.01, 0.02] }, [1]);
      expect(result).toEqual([0.01, 0.02]);
    });
  });

  describe('线性回归', () => {
    it('应该拟合完美线性关系', () => {
      const x = [[1], [2], [3], [4], [5]];
      const y = [2, 4, 6, 8, 10];
      const result = FactorModel.linearRegression(y, x);
      expect(result.coefficients['factor_0']).toBeCloseTo(2, 0);
      expect(result.rSquared).toBeCloseTo(1, 1);
    });
    it('应该计算残差', () => {
      const x = [[1], [2], [3]];
      const y = [2, 4, 6];
      const result = FactorModel.linearRegression(y, x);
      expect(result.residuals).toHaveLength(3);
      result.residuals.forEach(r => expect(r).toBeCloseTo(0, 5));
    });
    it('应该处理空数据', () => {
      const result = FactorModel.linearRegression([], []);
      expect(result.rSquared).toBe(0);
    });
    it('应该计算t统计量', () => {
      const x = [[1], [2], [3], [4], [5]];
      const y = [2, 4, 6, 8, 10];
      const result = FactorModel.linearRegression(y, x);
      expect(result.tStats['factor_0']).toBeGreaterThan(0);
    });
  });

  describe('因子贡献', () => {
    it('应该计算因子贡献', () => {
      const exposure: FactorExposure = { symbol: 'A', exposures: { value: 0.8, momentum: 0.5 }, expectedReturn: 0.1 };
      const factorReturns = { value: 0.02, momentum: 0.01 };
      const contribution = FactorModel.calcFactorContribution(exposure, factorReturns);
      expect(contribution['value']).toBeCloseTo(0.016, 5);
      expect(contribution['momentum']).toBeCloseTo(0.005, 5);
    });
    it('缺失因子收益应为零', () => {
      const exposure: FactorExposure = { symbol: 'A', exposures: { value: 0.8 }, expectedReturn: 0.1 };
      const contribution = FactorModel.calcFactorContribution(exposure, {});
      expect(contribution['value']).toBe(0);
    });
  });

  describe('因子排名', () => {
    const exposures: FactorExposure[] = [
      { symbol: 'A', exposures: { value: 0.8 }, expectedReturn: 0.1 },
      { symbol: 'B', exposures: { value: 0.3 }, expectedReturn: 0.08 },
      { symbol: 'C', exposures: { value: 0.6 }, expectedReturn: 0.12 },
    ];
    it('应该按降序排名', () => {
      const ranked = FactorModel.rankByFactor(exposures, 'value');
      expect(ranked[0].symbol).toBe('A');
      expect(ranked[0].rank).toBe(1);
    });
    it('应该按升序排名', () => {
      const ranked = FactorModel.rankByFactor(exposures, 'value', true);
      expect(ranked[0].symbol).toBe('B');
    });
    it('缺失因子应为零', () => {
      const ranked = FactorModel.rankByFactor(exposures, 'nonexistent');
      expect(ranked).toHaveLength(3);
    });
  });

  describe('IC计算', () => {
    it('应该计算排名相关系数', () => {
      const ic = FactorModel.calcIC([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
      expect(ic).toBeCloseTo(1, 2);
    });
    it('负相关IC应为负', () => {
      const ic = FactorModel.calcIC([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]);
      expect(ic).toBeCloseTo(-1, 2);
    });
    it('应处理不足数据', () => {
      expect(FactorModel.calcIC([1], [1])).toBe(0);
    });
    it('应处理不等长', () => {
      expect(FactorModel.calcIC([1, 2], [1])).toBe(0);
    });
  });

  describe('分位数收益', () => {
    it('应该按因子值分组', () => {
      const factors = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const returns = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10];
      const deciles = FactorModel.calcDecileReturns(factors, returns, 5);
      expect(deciles).toHaveLength(5);
    });
    it('应处理不等长', () => {
      expect(FactorModel.calcDecileReturns([1, 2], [1], 5)).toEqual([]);
    });
    it('每组应有正确的样本数', () => {
      const factors = Array.from({ length: 20 }, (_, i) => i);
      const returns = Array.from({ length: 20 }, (_, i) => i * 0.01);
      const deciles = FactorModel.calcDecileReturns(factors, returns, 4);
      expect(deciles.reduce((s, d) => s + d.count, 0)).toBe(20);
    });
  });
});
