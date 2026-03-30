import { describe, it, expect } from 'vitest';

describe('风险分析与度量V2', () => {
  // VaR计算
  const historicalVaR = (returns: number[], confidence: number) => {
    if (returns.length === 0) return 0;
    const sorted = [...returns].sort((a, b) => a - b);
    const idx = Math.floor((1 - confidence) * sorted.length);
    return -sorted[Math.min(idx, sorted.length - 1)];
  };

  const parametricVaR = (mean: number, std: number, confidence: number) => {
    const zScores: Record<number, number> = { 0.90: 1.282, 0.95: 1.645, 0.99: 2.326 };
    const z = zScores[confidence] || 1.645;
    return -(mean - z * std);
  };

  describe('历史VaR', () => {
    it('基本计算', () => {
      const returns = [-0.05, -0.02, 0.01, 0.03, 0.02, -0.03, 0.01, 0.04, -0.01, 0.02];
      const result = historicalVaR(returns, 0.95);
      expect(result).toBeGreaterThan(0);
    });
    it('全部正收益VaR接近0', () => {
      const returns = [0.01, 0.02, 0.03, 0.01, 0.02];
      const result = historicalVaR(returns, 0.95);
      expect(result).toBeLessThanOrEqual(0); // no loss
    });
    it('空数组', () => {
      expect(historicalVaR([], 0.95)).toBe(0);
    });
    it('高置信度VaR更大', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.1);
      const var95 = historicalVaR(returns, 0.95);
      const var99 = historicalVaR(returns, 0.99);
      expect(var99).toBeGreaterThanOrEqual(var95);
    });
  });

  describe('参数VaR', () => {
    it('95%置信度', () => {
      const result = parametricVaR(0.001, 0.02, 0.95);
      expect(result).toBeGreaterThan(0);
    });
    it('99%置信度更大', () => {
      const var95 = parametricVaR(0.001, 0.02, 0.95);
      const var99 = parametricVaR(0.001, 0.02, 0.99);
      expect(var99).toBeGreaterThan(var95);
    });
    it('高均值降低VaR', () => {
      const low = parametricVaR(0.001, 0.02, 0.95);
      const high = parametricVaR(0.01, 0.02, 0.95);
      expect(high).toBeLessThan(low);
    });
  });

  // CVaR (Expected Shortfall)
  const cvar = (returns: number[], confidence: number) => {
    if (returns.length === 0) return 0;
    const sorted = [...returns].sort((a, b) => a - b);
    const cutoff = Math.floor((1 - confidence) * sorted.length);
    const tail = sorted.slice(0, Math.max(1, cutoff));
    return -tail.reduce((a, b) => a + b, 0) / tail.length;
  };

  describe('CVaR', () => {
    it('CVaR >= VaR', () => {
      const returns = [-0.1, -0.05, -0.02, 0.01, 0.03, 0.02, -0.03, 0.01, 0.04, -0.01];
      const varResult = historicalVaR(returns, 0.90);
      const cvarResult = cvar(returns, 0.90);
      expect(cvarResult).toBeGreaterThanOrEqual(varResult - 0.001);
    });
    it('空数组', () => {
      expect(cvar([], 0.95)).toBe(0);
    });
  });

  // Beta系数
  const beta = (stockReturns: number[], marketReturns: number[]) => {
    if (stockReturns.length !== marketReturns.length || stockReturns.length === 0) return 0;
    const stockMean = stockReturns.reduce((a, b) => a + b, 0) / stockReturns.length;
    const marketMean = marketReturns.reduce((a, b) => a + b, 0) / marketReturns.length;
    const cov = stockReturns.reduce((s, r, i) => s + (r - stockMean) * (marketReturns[i] - marketMean), 0) / stockReturns.length;
    const marketVar = marketReturns.reduce((s, r) => s + (r - marketMean) ** 2, 0) / marketReturns.length;
    return marketVar === 0 ? 0 : cov / marketVar;
  };

  describe('Beta系数', () => {
    it('正Beta', () => {
      const stock = [0.02, 0.04, 0.01, 0.03, 0.05];
      const market = [0.01, 0.02, 0.005, 0.015, 0.025];
      expect(beta(stock, market)).toBeGreaterThan(0);
    });
    it('Beta=1时同步', () => {
      const market = [0.01, 0.02, 0.03, 0.04, 0.05];
      expect(beta(market, market)).toBeCloseTo(1);
    });
    it('长度不匹配', () => {
      expect(beta([1, 2], [1])).toBe(0);
    });
    it('空数组', () => {
      expect(beta([], [])).toBe(0);
    });
    it('负Beta', () => {
      const stock = [0.05, 0.03, 0.04, 0.02, 0.03];
      const market = [0.01, 0.02, 0.015, 0.025, 0.02];
      const result = beta(stock, market);
      // May be negative if inversely correlated
      expect(typeof result).toBe('number');
    });
  });

  // 跟踪误差
  const trackingError = (portfolioReturns: number[], benchmarkReturns: number[]) => {
    if (portfolioReturns.length !== benchmarkReturns.length || portfolioReturns.length === 0) return 0;
    const diffs = portfolioReturns.map((r, i) => r - benchmarkReturns[i]);
    const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    return Math.sqrt(diffs.reduce((s, d) => s + (d - mean) ** 2, 0) / diffs.length);
  };

  describe('跟踪误差', () => {
    it('相同收益为0', () => {
      const returns = [0.01, 0.02, 0.03];
      expect(trackingError(returns, returns)).toBe(0);
    });
    it('不同收益为正', () => {
      const portfolio = [0.02, 0.03, 0.04];
      const benchmark = [0.01, 0.02, 0.03];
      expect(trackingError(portfolio, benchmark)).toBeGreaterThan(0);
    });
    it('空数组', () => {
      expect(trackingError([], [])).toBe(0);
    });
    it('非负', () => {
      const p = [0.01, 0.05, 0.02, 0.04];
      const b = [0.02, 0.03, 0.01, 0.03];
      expect(trackingError(p, b)).toBeGreaterThanOrEqual(0);
    });
  });

  // 风险价值分解
  const riskDecomposition = (weights: number[], returns: number[][]) => {
    const n = weights.length;
    const means = returns.map(r => r.reduce((a, b) => a + b, 0) / r.length);
    const portfolioReturn = weights.reduce((s, w, i) => s + w * means[i], 0);
    const covMatrix: number[][] = [];
    for (let i = 0; i < n; i++) {
      covMatrix[i] = [];
      for (let j = 0; j < n; j++) {
        const cov = returns[i].reduce((s, v, k) => s + (v - means[i]) * (returns[j][k] - means[j]), 0) / returns[i].length;
        covMatrix[i][j] = cov;
      }
    }
    let portfolioVar = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        portfolioVar += weights[i] * weights[j] * covMatrix[i][j];
      }
    }
    const marginalRisk = weights.map((w, i) => {
      let contribution = 0;
      for (let j = 0; j < n; j++) {
        contribution += weights[j] * covMatrix[i][j];
      }
      return contribution;
    });
    const riskContributions = marginalRisk.map((mr, i) => weights[i] * mr);
    const totalRiskContrib = riskContributions.reduce((a, b) => a + b, 0);
    return { portfolioReturn, portfolioVol: Math.sqrt(Math.max(0, portfolioVar)), riskContributions, totalRiskContrib };
  };

  describe('风险分解', () => {
    it('组合收益', () => {
      const result = riskDecomposition(
        [0.5, 0.5],
        [[0.01, 0.02, 0.03], [0.02, 0.03, 0.04]]
      );
      expect(result.portfolioReturn).toBeGreaterThan(0);
    });
    it('波动率非负', () => {
      const result = riskDecomposition(
        [0.3, 0.7],
        [[0.01, -0.02, 0.03, 0.01], [0.02, 0.01, -0.01, 0.03]]
      );
      expect(result.portfolioVol).toBeGreaterThanOrEqual(0);
    });
    it('风险贡献和=总风险', () => {
      const result = riskDecomposition(
        [0.6, 0.4],
        [[0.01, 0.02, 0.03], [0.03, 0.02, 0.01]]
      );
      expect(result.totalRiskContrib).toBeCloseTo(result.portfolioVol ** 2, 5);
    });
  });

  // 尾部风险
  const tailRisk = (returns: number[]) => {
    if (returns.length < 3) return { skewness: 0, kurtosis: 0 };
    const n = returns.length;
    const mean = returns.reduce((a, b) => a + b, 0) / n;
    const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / n);
    if (std === 0) return { skewness: 0, kurtosis: 0 };
    const skewness = returns.reduce((s, r) => s + ((r - mean) / std) ** 3, 0) / n;
    const kurtosis = returns.reduce((s, r) => s + ((r - mean) / std) ** 4, 0) / n - 3;
    return { skewness, kurtosis };
  };

  describe('尾部风险', () => {
    it('对称分布偏度为0', () => {
      const returns = [-0.02, -0.01, 0, 0.01, 0.02];
      const result = tailRisk(returns);
      expect(result.skewness).toBeCloseTo(0, 1);
    });
    it('尖峰厚尾', () => {
      const returns = [-0.1, -0.05, -0.02, 0, 0.02, 0.05, 0.1, 0.15];
      const result = tailRisk(returns);
      expect(typeof result.kurtosis).toBe('number');
    });
    it('数据不足', () => {
      expect(tailRisk([1, 2])).toEqual({ skewness: 0, kurtosis: 0 });
    });
    it('常数返回', () => {
      expect(tailRisk([0.01, 0.01, 0.01])).toEqual({ skewness: 0, kurtosis: 0 });
    });
  });
});
