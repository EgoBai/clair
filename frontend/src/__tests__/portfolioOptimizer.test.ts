import { describe, it, expect } from 'vitest';

/**
 * 组合优化 / 风险管理逻辑测试
 */

describe('PortfolioOptimizer', () => {
  describe('等权组合', () => {
    const equalWeight = (n: number) => Array(n).fill(1 / n);

    it('应该分配等权重', () => {
      const weights = equalWeight(4);
      expect(weights).toEqual([0.25, 0.25, 0.25, 0.25]);
    });

    it('权重之和应为1', () => {
      const weights = equalWeight(7);
      const sum = weights.reduce((a, b) => a + b);
      expect(sum).toBeCloseTo(1, 10);
    });
  });

  describe('风险平价', () => {
    const riskParity = (vols: number[]) => {
      const invVols = vols.map(v => 1 / v);
      const total = invVols.reduce((a, b) => a + b);
      return invVols.map(v => v / total);
    };

    it('低波动率资产应该有更高权重', () => {
      const weights = riskParity([0.1, 0.2, 0.3]);
      expect(weights[0]).toBeGreaterThan(weights[1]);
      expect(weights[1]).toBeGreaterThan(weights[2]);
    });

    it('权重之和应为1', () => {
      const weights = riskParity([0.15, 0.20, 0.25]);
      const sum = weights.reduce((a, b) => a + b);
      expect(sum).toBeCloseTo(1, 10);
    });
  });

  describe('有效前沿', () => {
    const portfolioReturn = (weights: number[], returns: number[]) => {
      return weights.reduce((s, w, i) => s + w * returns[i], 0);
    };

    const portfolioRisk = (weights: number[], covariance: number[][]) => {
      let variance = 0;
      for (let i = 0; i < weights.length; i++) {
        for (let j = 0; j < weights.length; j++) {
          variance += weights[i] * weights[j] * covariance[i][j];
        }
      }
      return Math.sqrt(variance);
    };

    it('应该计算组合收益率', () => {
      const ret = portfolioReturn([0.5, 0.5], [0.1, 0.2]);
      expect(ret).toBeCloseTo(0.15, 5);
    });

    it('应该计算组合风险', () => {
      const cov = [[0.04, 0.01], [0.01, 0.09]];
      const risk = portfolioRisk([0.5, 0.5], cov);
      expect(risk).toBeGreaterThan(0);
    });
  });

  describe('最大回撤约束', () => {
    const withinMaxDrawdown = (navSeries: number[], maxDD: number) => {
      let peak = navSeries[0];
      for (const nav of navSeries) {
        if (nav > peak) peak = nav;
        const dd = (peak - nav) / peak;
        if (dd > maxDD) return false;
      }
      return true;
    };

    it('未超过最大回撤应该通过', () => {
      const nav = [100, 110, 105, 115, 120];
      expect(withinMaxDrawdown(nav, 0.1)).toBe(true);
    });

    it('超过最大回撤应该拒绝', () => {
      const nav = [100, 110, 90, 95, 100];
      expect(withinMaxDrawdown(nav, 0.1)).toBe(false);
    });
  });
});

describe('RiskBudgetEngine', () => {
  describe('VaR 计算', () => {
    const calcVaR = (returns: number[], confidence: number) => {
      const sorted = [...returns].sort((a, b) => a - b);
      const index = Math.floor((1 - confidence) * sorted.length);
      return sorted[index];
    };

    it('应该计算 95% VaR', () => {
      const returns = Array(100).fill(0).map((_, i) => (i - 50) / 1000);
      const var95 = calcVaR(returns, 0.95);
      expect(var95).toBeLessThan(0);
    });

    it('99% VaR 应该比 95% VaR 更极端', () => {
      const returns = Array(100).fill(0).map((_, i) => (i - 50) / 1000);
      const var95 = calcVaR(returns, 0.95);
      const var99 = calcVaR(returns, 0.99);
      expect(var99).toBeLessThan(var95);
    });
  });

  describe('CVaR (Expected Shortfall)', () => {
    const calcCVaR = (returns: number[], confidence: number) => {
      const sorted = [...returns].sort((a, b) => a - b);
      const cutoff = Math.floor((1 - confidence) * sorted.length);
      const tail = sorted.slice(0, cutoff + 1);
      return tail.reduce((a, b) => a + b) / tail.length;
    };

    it('CVaR 应该比 VaR 更极端', () => {
      const returns = Array(100).fill(0).map((_, i) => (i - 50) / 1000);
      const sorted = [...returns].sort((a, b) => a - b);
      const var95 = sorted[5];
      const cvar95 = calcCVaR(returns, 0.95);
      expect(cvar95).toBeLessThanOrEqual(var95);
    });
  });

  describe('风险预算分配', () => {
    const riskBudgetAllocation = (vols: number[], targetRisk: number) => {
      const invVols = vols.map(v => 1 / v);
      const total = invVols.reduce((a, b) => a + b);
      return invVols.map(v => (v / total) * targetRisk);
    };

    it('应该按风险预算分配', () => {
      const allocations = riskBudgetAllocation([0.1, 0.2], 0.1);
      expect(allocations[0]).toBeGreaterThan(allocations[1]);
    });
  });
});
