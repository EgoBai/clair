import { describe, it, expect } from 'vitest';

describe('投资组合优化与资产配置', () => {
  // 均值方差优化
  const meanVariance = (returns: number[][]) => {
    const n = returns.length;
    const means = returns.map(r => r.reduce((a, b) => a + b, 0) / r.length);
    const covMatrix: number[][] = [];
    for (let i = 0; i < n; i++) {
      covMatrix[i] = [];
      for (let j = 0; j < n; j++) {
        const meanI = means[i], meanJ = means[j];
        const cov = returns[i].reduce((s, v, k) => s + (v - meanI) * (returns[j][k] - meanJ), 0) / returns[i].length;
        covMatrix[i][j] = cov;
      }
    }
    return { means, covMatrix };
  };

  describe('均值方差', () => {
    it('单资产', () => {
      const result = meanVariance([[0.01, 0.02, 0.03]]);
      expect(result.means[0]).toBeCloseTo(0.02, 5);
    });
    it('双资产协方差', () => {
      const result = meanVariance([
        [0.01, 0.02, 0.03],
        [0.02, 0.04, 0.06],
      ]);
      expect(result.covMatrix[0][1]).toBeGreaterThan(0);
    });
    it('负相关资产', () => {
      const result = meanVariance([
        [0.01, 0.02, 0.03],
        [0.03, 0.02, 0.01],
      ]);
      expect(result.covMatrix[0][1]).toBeLessThan(0);
    });
    it('对角线为方差', () => {
      const result = meanVariance([[0.01, 0.02, 0.03]]);
      expect(result.covMatrix[0][0]).toBeGreaterThan(0);
    });
    it('协方差矩阵对称', () => {
      const result = meanVariance([
        [0.01, 0.03, 0.02],
        [0.02, 0.01, 0.03],
      ]);
      expect(result.covMatrix[0][1]).toBeCloseTo(result.covMatrix[1][0], 10);
    });
  });

  // 夏普比率
  const sharpeRatio = (returns: number[], riskFreeRate: number) => {
    if (returns.length === 0) return 0;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length);
    if (std === 0) return 0;
    return (mean - riskFreeRate) / std;
  };

  describe('夏普比率', () => {
    it('正夏普比率', () => {
      const result = sharpeRatio([0.02, 0.03, 0.01, 0.04], 0.005);
      expect(result).toBeGreaterThan(0);
    });
    it('负夏普比率', () => {
      const result = sharpeRatio([-0.01, -0.02, 0.01], 0.01);
      expect(result).toBeLessThan(0);
    });
    it('零波动率', () => {
      const result = sharpeRatio([0.02, 0.02, 0.02], 0.01);
      expect(result).toBe(0);
    });
    it('空数组', () => {
      expect(sharpeRatio([], 0.01)).toBe(0);
    });
    it('高夏普比率', () => {
      const result = sharpeRatio([0.10, 0.12, 0.08, 0.11], 0.02);
      expect(result).toBeGreaterThan(1);
    });
  });

  // 最大回撤
  const maxDrawdown = (values: number[]) => {
    if (values.length === 0) return { maxDrawdown: 0, peak: 0, trough: 0 };
    let peak = values[0], trough = values[0], maxDd = 0;
    let currentPeak = values[0];
    for (const v of values) {
      if (v > currentPeak) currentPeak = v;
      const dd = (currentPeak - v) / currentPeak;
      if (dd > maxDd) {
        maxDd = dd;
        peak = currentPeak;
        trough = v;
      }
    }
    return { maxDrawdown: maxDd, peak, trough };
  };

  describe('最大回撤', () => {
    it('单调上升', () => {
      const result = maxDrawdown([100, 110, 120, 130]);
      expect(result.maxDrawdown).toBe(0);
    });
    it('单调下降', () => {
      const result = maxDrawdown([100, 90, 80, 70]);
      expect(result.maxDrawdown).toBeCloseTo(0.3);
    });
    it('V型回撤', () => {
      const result = maxDrawdown([100, 120, 80, 130]);
      expect(result.maxDrawdown).toBeCloseTo(0.333, 2);
    });
    it('空数组', () => {
      const result = maxDrawdown([]);
      expect(result.maxDrawdown).toBe(0);
    });
    it('单值', () => {
      const result = maxDrawdown([100]);
      expect(result.maxDrawdown).toBe(0);
    });
    it('多次回撤取最大', () => {
      const result = maxDrawdown([100, 110, 90, 105, 80, 120]);
      // peak=110, trough=90 → dd=(110-90)/110=0.1818
      // later: peak=105? no, currentPeak goes 100→110→110→110→110, then trough=80 → dd=(110-80)/110=0.2727
      expect(result.maxDrawdown).toBeGreaterThan(0.15);
    });
  });

  // 索提诺比率
  const sortinoRatio = (returns: number[], targetReturn: number) => {
    if (returns.length === 0) return 0;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const downside = returns.filter(r => r < targetReturn);
    if (downside.length === 0) return Infinity;
    const downsideDev = Math.sqrt(downside.reduce((s, r) => s + (r - targetReturn) ** 2, 0) / returns.length);
    if (downsideDev === 0) return 0;
    return (mean - targetReturn) / downsideDev;
  };

  describe('索提诺比率', () => {
    it('正索提诺比率', () => {
      const result = sortinoRatio([0.02, 0.03, 0.01, 0.04], 0.005);
      expect(result).toBeGreaterThan(0);
    });
    it('全部高于目标', () => {
      const result = sortinoRatio([0.05, 0.06, 0.07], 0.01);
      expect(result).toBe(Infinity);
    });
    it('空数组', () => {
      expect(sortinoRatio([], 0.01)).toBe(0);
    });
    it('负索提诺', () => {
      const result = sortinoRatio([-0.02, -0.01, 0.01], 0.02);
      expect(result).toBeLessThan(0);
    });
  });

  // 资产配置权重优化
  const optimizeWeights = (expectedReturns: number[], riskTolerance: number) => {
    if (expectedReturns.length === 0) return [];
    const totalReturn = expectedReturns.reduce((a, b) => a + Math.max(0, b), 0);
    if (totalReturn === 0) return expectedReturns.map(() => 1 / expectedReturns.length);
    const raw = expectedReturns.map(r => Math.max(0, r) * riskTolerance + (1 - riskTolerance) / expectedReturns.length);
    const sum = raw.reduce((a, b) => a + b, 0);
    return raw.map(w => w / sum);
  };

  describe('资产配置权重', () => {
    it('权重和为1', () => {
      const weights = optimizeWeights([0.05, 0.08, 0.03], 0.5);
      const sum = weights.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 10);
    });
    it('高收益高权重', () => {
      const weights = optimizeWeights([0.05, 0.10, 0.03], 0.8);
      expect(weights[1]).toBeGreaterThan(weights[0]);
      expect(weights[1]).toBeGreaterThan(weights[2]);
    });
    it('空数组', () => {
      expect(optimizeWeights([], 0.5)).toEqual([]);
    });
    it('低风险容忍度均等化', () => {
      const weights = optimizeWeights([0.05, 0.10, 0.03], 0);
      expect(weights[0]).toBeCloseTo(weights[1], 2);
    });
    it('负收益率处理', () => {
      const weights = optimizeWeights([-0.02, 0.08, 0.03], 0.5);
      expect(weights[0]).toBeLessThan(weights[1]);
    });
  });

  // 再平衡信号
  const rebalanceSignal = (currentWeights: number[], targetWeights: number[], threshold: number) => {
    if (currentWeights.length !== targetWeights.length) return { needsRebalance: false, drifts: [] };
    const drifts = currentWeights.map((w, i) => Math.abs(w - targetWeights[i]));
    const maxDrift = Math.max(...drifts);
    const needsRebalance = maxDrift > threshold;
    const trades = targetWeights.map((tw, i) => tw - currentWeights[i]);
    return { needsRebalance, drifts, maxDrift, trades };
  };

  describe('再平衡信号', () => {
    it('无需再平衡', () => {
      const result = rebalanceSignal([0.4, 0.3, 0.3], [0.4, 0.3, 0.3], 0.05);
      expect(result.needsRebalance).toBe(false);
    });
    it('需要再平衡', () => {
      const result = rebalanceSignal([0.6, 0.2, 0.2], [0.4, 0.3, 0.3], 0.05);
      expect(result.needsRebalance).toBe(true);
    });
    it('最大偏移量', () => {
      const result = rebalanceSignal([0.5, 0.3, 0.2], [0.4, 0.3, 0.3], 0.05);
      expect(result.maxDrift).toBeCloseTo(0.1);
    });
    it('交易方向', () => {
      const result = rebalanceSignal([0.5, 0.2, 0.3], [0.4, 0.3, 0.3], 0.05);
      expect(result.trades!.length).toBe(3);
      expect(result.trades![0]).toBeLessThan(0);
      expect(result.trades![1]).toBeGreaterThan(0);
    });
    it('长度不匹配', () => {
      const result = rebalanceSignal([0.5, 0.5], [0.33, 0.33, 0.34], 0.05);
      expect(result.needsRebalance).toBe(false);
    });
  });

  // 相关系数矩阵
  const correlationMatrix = (returns: number[][]) => {
    const n = returns.length;
    const means = returns.map(r => r.reduce((a, b) => a + b, 0) / r.length);
    const stds = returns.map((r, i) => Math.sqrt(r.reduce((s, v) => s + (v - means[i]) ** 2, 0) / r.length));
    const matrix: number[][] = [];
    for (let i = 0; i < n; i++) {
      matrix[i] = [];
      for (let j = 0; j < n; j++) {
        if (stds[i] === 0 || stds[j] === 0) {
          matrix[i][j] = i === j ? 1 : 0;
        } else {
          const cov = returns[i].reduce((s, v, k) => s + (v - means[i]) * (returns[j][k] - means[j]), 0) / returns[i].length;
          matrix[i][j] = cov / (stds[i] * stds[j]);
        }
      }
    }
    return matrix;
  };

  describe('相关系数矩阵', () => {
    it('对角线为1', () => {
      const matrix = correlationMatrix([[0.01, 0.02, 0.03]]);
      expect(matrix[0][0]).toBe(1);
    });
    it('完全正相关', () => {
      const matrix = correlationMatrix([
        [0.01, 0.02, 0.03],
        [0.01, 0.02, 0.03],
      ]);
      expect(matrix[0][1]).toBeCloseTo(1);
    });
    it('完全负相关', () => {
      const matrix = correlationMatrix([
        [0.01, 0.02, 0.03],
        [0.03, 0.02, 0.01],
      ]);
      expect(matrix[0][1]).toBeCloseTo(-1);
    });
    it('矩阵对称', () => {
      const matrix = correlationMatrix([
        [0.01, 0.03, 0.02, 0.04],
        [0.02, 0.01, 0.04, 0.03],
      ]);
      expect(matrix[0][1]).toBeCloseTo(matrix[1][0], 10);
    });
    it('相关系数范围[-1,1]', () => {
      const matrix = correlationMatrix([
        [0.01, 0.02, 0.03, 0.01],
        [0.03, 0.01, 0.02, 0.04],
      ]);
      expect(matrix[0][1]).toBeGreaterThanOrEqual(-1);
      expect(matrix[0][1]).toBeLessThanOrEqual(1);
    });
  });
});
