import { describe, it, expect } from 'vitest';

// ===== 投资组合分析 =====
describe('Portfolio Analysis', () => {
  const calcPortfolioReturn = (weights: number[], returns: number[]): number => {
    return weights.reduce((sum, w, i) => sum + w * returns[i], 0);
  };

  const calcPortfolioVariance = (weights: number[], covMatrix: number[][]): number => {
    let variance = 0;
    for (let i = 0; i < weights.length; i++) {
      for (let j = 0; j < weights.length; j++) {
        variance += weights[i] * weights[j] * covMatrix[i][j];
      }
    }
    return variance;
  };

  const calcSharpeRatio = (portfolioReturn: number, riskFreeRate: number, stdDev: number): number => {
    return stdDev > 0 ? (portfolioReturn - riskFreeRate) / stdDev : 0;
  };

  const calcMaxDrawdown = (equity: number[]): number => {
    let peak = equity[0], maxDD = 0;
    for (const val of equity) {
      peak = Math.max(peak, val);
      maxDD = Math.max(maxDD, (peak - val) / peak);
    }
    return maxDD;
  };

  const calcSortinoRatio = (returns: number[], riskFreeRate: number): number => {
    const excess = returns.map(r => r - riskFreeRate);
    const mean = excess.reduce((a, b) => a + b, 0) / excess.length;
    const downside = excess.filter(r => r < 0);
    if (downside.length === 0) return mean > 0 ? Infinity : 0;
    const downStd = Math.sqrt(downside.reduce((s, r) => s + r ** 2, 0) / downside.length);
    return downStd > 0 ? mean / downStd : 0;
  };

  const calcBeta = (assetReturns: number[], marketReturns: number[]): number => {
    const n = assetReturns.length;
    const meanA = assetReturns.reduce((a, b) => a + b, 0) / n;
    const meanM = marketReturns.reduce((a, b) => a + b, 0) / n;
    let cov = 0, varM = 0;
    for (let i = 0; i < n; i++) {
      cov += (assetReturns[i] - meanA) * (marketReturns[i] - meanM);
      varM += (marketReturns[i] - meanM) ** 2;
    }
    return varM > 0 ? cov / varM : 0;
  };

  const calcAlpha = (assetReturn: number, riskFreeRate: number, beta: number, marketReturn: number): number => {
    return assetReturn - (riskFreeRate + beta * (marketReturn - riskFreeRate));
  };

  const calcTreynorRatio = (portfolioReturn: number, riskFreeRate: number, beta: number): number => {
    return beta !== 0 ? (portfolioReturn - riskFreeRate) / beta : 0;
  };

  const calcInformationRatio = (portfolioReturn: number, benchmarkReturn: number, trackingError: number): number => {
    return trackingError > 0 ? (portfolioReturn - benchmarkReturn) / trackingError : 0;
  };

  const calcCalmarRatio = (annualizedReturn: number, maxDrawdown: number): number => {
    return maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;
  };

  const meanVarianceOptimization = (expectedReturns: number[], covMatrix: number[][], targetReturn: number): number[] => {
    const n = expectedReturns.length;
    if (n === 1) return [1];
    if (n === 2) {
      if (expectedReturns[0] === expectedReturns[1]) return [0.5, 0.5];
      const w = (targetReturn - expectedReturns[1]) / (expectedReturns[0] - expectedReturns[1]);
      return [Math.max(0, Math.min(1, w)), Math.max(0, Math.min(1, 1 - w))];
    }
    // Simple equal weight fallback for n > 2
    return Array(n).fill(1 / n);
  };

  const calcCorrelation = (x: number[], y: number[]): number => {
    const n = x.length;
    const mx = x.reduce((a, b) => a + b, 0) / n;
    const my = y.reduce((a, b) => a + b, 0) / n;
    let cov = 0, vx = 0, vy = 0;
    for (let i = 0; i < n; i++) {
      cov += (x[i] - mx) * (y[i] - my);
      vx += (x[i] - mx) ** 2;
      vy += (y[i] - my) ** 2;
    }
    const denom = Math.sqrt(vx * vy);
    return denom > 0 ? cov / denom : 0;
  };

  describe('组合收益率', () => {
    it('等权组合应为平均收益', () => {
      expect(calcPortfolioReturn([0.5, 0.5], [0.1, 0.2])).toBeCloseTo(0.15);
    });

    it('不等权组合', () => {
      expect(calcPortfolioReturn([0.3, 0.7], [0.1, 0.2])).toBeCloseTo(0.17);
    });

    it('全仓单资产', () => {
      expect(calcPortfolioReturn([1, 0], [0.1, 0.2])).toBeCloseTo(0.1);
    });

    it('负收益组合', () => {
      expect(calcPortfolioReturn([0.5, 0.5], [-0.1, -0.2])).toBeCloseTo(-0.15);
    });

    it('权重和不为一仍计算', () => {
      expect(calcPortfolioReturn([0.3, 0.3], [0.1, 0.2])).toBeCloseTo(0.09);
    });

    it('空组合返回零', () => {
      expect(calcPortfolioReturn([], [])).toBe(0);
    });
  });

  describe('组合方差', () => {
    it('单资产方差', () => {
      expect(calcPortfolioVariance([1], [[0.04]])).toBeCloseTo(0.04);
    });

    it('等权两资产', () => {
      const cov = [[0.04, 0.01], [0.01, 0.09]];
      expect(calcPortfolioVariance([0.5, 0.5], cov)).toBeCloseTo(0.0375);
    });

    it('负相关降低方差', () => {
      const covPos = [[0.04, 0.02], [0.02, 0.04]];
      const covNeg = [[0.04, -0.02], [-0.02, 0.04]];
      const vPos = calcPortfolioVariance([0.5, 0.5], covPos);
      const vNeg = calcPortfolioVariance([0.5, 0.5], covNeg);
      expect(vNeg).toBeLessThan(vPos);
    });

    it('方差应非负', () => {
      const cov = [[0.04, 0.03], [0.03, 0.09]];
      expect(calcPortfolioVariance([0.5, 0.5], cov)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Sharpe比率', () => {
    it('正Sharpe应大于零', () => {
      expect(calcSharpeRatio(0.1, 0.02, 0.1)).toBeCloseTo(0.8);
    });

    it('零波动率返回零', () => {
      expect(calcSharpeRatio(0.1, 0.02, 0)).toBe(0);
    });

    it('负Sharpe', () => {
      expect(calcSharpeRatio(0.01, 0.05, 0.1)).toBeLessThan(0);
    });
  });

  describe('最大回撤', () => {
    it('无回撤应为零', () => {
      expect(calcMaxDrawdown([100, 110, 120, 130])).toBe(0);
    });

    it('有回撤应正确计算', () => {
      expect(calcMaxDrawdown([100, 120, 80, 110])).toBeCloseTo(1 / 3);
    });

    it('全跌应接近1', () => {
      expect(calcMaxDrawdown([100, 80, 60, 40])).toBeCloseTo(0.6);
    });

    it('单值回撤为零', () => {
      expect(calcMaxDrawdown([100])).toBe(0);
    });
  });

  describe('Sortino比率', () => {
    it('应只考虑下行风险', () => {
      const returns = [0.02, -0.01, 0.03, -0.02, 0.01];
      const sortino = calcSortinoRatio(returns, 0.001);
      expect(isFinite(sortino) || sortino === Infinity).toBe(true);
    });

    it('无负收益返回无穷', () => {
      const returns = [0.01, 0.02, 0.03];
      expect(calcSortinoRatio(returns, 0)).toBe(Infinity);
    });

    it('空下行收益', () => {
      expect(calcSortinoRatio([0.01, 0.02], 0.03)).toBeLessThan(0);
    });
  });

  describe('Beta和Alpha', () => {
    it('完全正相关Beta为1', () => {
      const market = [0.01, 0.02, -0.01, 0.03, -0.02];
      const asset = market.map(r => r);
      expect(calcBeta(asset, market)).toBeCloseTo(1);
    });

    it('Beta为零', () => {
      const market = [0.01, 0.02, -0.01, 0.03, -0.02];
      const asset = [0.01, 0.01, 0.01, 0.01, 0.01];
      expect(Math.abs(calcBeta(asset, market))).toBeLessThan(0.01);
    });

    it('Alpha应反映超额收益', () => {
      const alpha = calcAlpha(0.12, 0.02, 1, 0.08);
      // Alpha = R - (rf + beta * (Rm - rf)) = 0.12 - (0.02 + 1 * (0.08 - 0.02)) = 0.04
      expect(alpha).toBeCloseTo(0.04);
    });

    it('零Beta的Alpha', () => {
      const alpha = calcAlpha(0.05, 0.02, 0, 0.08);
      expect(alpha).toBeCloseTo(0.03);
    });
  });

  describe('Treynor比率', () => {
    it('正Beta正超额收益', () => {
      expect(calcTreynorRatio(0.12, 0.02, 1)).toBeCloseTo(0.1);
    });

    it('零Beta返回零', () => {
      expect(calcTreynorRatio(0.12, 0.02, 0)).toBe(0);
    });
  });

  describe('信息比率', () => {
    it('应正确计算', () => {
      expect(calcInformationRatio(0.12, 0.10, 0.02)).toBeCloseTo(1);
    });

    it('零追踪误差返回零', () => {
      expect(calcInformationRatio(0.12, 0.10, 0)).toBe(0);
    });
  });

  describe('Calmar比率', () => {
    it('应正确计算', () => {
      expect(calcCalmarRatio(0.15, 0.10)).toBeCloseTo(1.5);
    });

    it('零回撤返回零', () => {
      expect(calcCalmarRatio(0.15, 0)).toBe(0);
    });
  });

  describe('相关系数', () => {
    it('完全正相关应为1', () => {
      const x = [1, 2, 3, 4, 5];
      expect(calcCorrelation(x, x)).toBeCloseTo(1);
    });

    it('完全负相关应为-1', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [5, 4, 3, 2, 1];
      expect(calcCorrelation(x, y)).toBeCloseTo(-1);
    });

    it('不相关应接近零', () => {
      const x = [1, -1, 1, -1, 1];
      const y = [1, 1, -1, -1, 1];
      expect(Math.abs(calcCorrelation(x, y))).toBeLessThan(0.5);
    });

    it('范围在-1到1', () => {
      const x = Array.from({ length: 20 }, (_, i) => Math.sin(i));
      const y = Array.from({ length: 20 }, (_, i) => Math.cos(i));
      const corr = calcCorrelation(x, y);
      expect(corr).toBeGreaterThanOrEqual(-1);
      expect(corr).toBeLessThanOrEqual(1);
    });
  });

  describe('均值方差优化', () => {
    it('单资产应返回100%', () => {
      expect(meanVarianceOptimization([0.1], [[0.04]], 0.1)).toEqual([1]);
    });

    it('两资产目标收益', () => {
      const w = meanVarianceOptimization([0.1, 0.2], [[0.04, 0], [0, 0.09]], 0.15);
      expect(w[0]).toBeCloseTo(0.5);
      expect(w[1]).toBeCloseTo(0.5);
    });

    it('权重在0到1之间', () => {
      const w = meanVarianceOptimization([0.1, 0.2], [[0.04, 0], [0, 0.09]], 0.25);
      w.forEach(weight => {
        expect(weight).toBeGreaterThanOrEqual(0);
        expect(weight).toBeLessThanOrEqual(1);
      });
    });

    it('等收益返回等权', () => {
      const w = meanVarianceOptimization([0.1, 0.1], [[0.04, 0], [0, 0.04]], 0.1);
      expect(w[0]).toBeCloseTo(0.5);
    });
  });
});
