import { describe, it, expect } from 'vitest';

describe('高级金融计算引擎', () => {
  // CAPM模型
  const capm = (riskFreeRate: number, beta: number, marketReturn: number) => {
    return riskFreeRate + beta * (marketReturn - riskFreeRate);
  };

  describe('CAPM模型', () => {
    it('预期收益率', () => {
      expect(capm(0.03, 1.0, 0.10)).toBeCloseTo(0.10);
    });
    it('高Beta', () => {
      expect(capm(0.03, 1.5, 0.10)).toBeCloseTo(0.135);
    });
    it('低Beta', () => {
      expect(capm(0.03, 0.5, 0.10)).toBeCloseTo(0.065);
    });
    it('零Beta', () => {
      expect(capm(0.03, 0, 0.10)).toBeCloseTo(0.03);
    });
    it('负Beta', () => {
      const result = capm(0.03, -0.5, 0.10);
      expect(result).toBeLessThan(0.03);
    });
  });

  // Black-Scholes期权定价
  const blackScholes = (S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put') => {
    const d1 = (Math.log(S / K) + (r + sigma ** 2 / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    const normCDF = (x: number) => {
      const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
      const sign = x < 0 ? -1 : 1;
      x = Math.abs(x) / Math.sqrt(2);
      const t = 1.0 / (1.0 + p * x);
      const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
      return 0.5 * (1.0 + sign * y);
    };
    if (type === 'call') {
      return S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
    }
    return K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
  };

  describe('Black-Scholes期权定价', () => {
    it('看涨期权为正', () => {
      const price = blackScholes(100, 100, 1, 0.05, 0.2, 'call');
      expect(price).toBeGreaterThan(0);
    });
    it('看跌期权为正', () => {
      const price = blackScholes(100, 100, 1, 0.05, 0.2, 'put');
      expect(price).toBeGreaterThan(0);
    });
    it('看涨看跌平价关系', () => {
      const S = 100, K = 100, T = 1, r = 0.05, sigma = 0.2;
      const call = blackScholes(S, K, T, r, sigma, 'call');
      const put = blackScholes(S, K, T, r, sigma, 'put');
      // C - P = S - K * e^(-rT)
      expect(call - put).toBeCloseTo(S - K * Math.exp(-r * T), 1);
    });
    it('深度实值看涨', () => {
      const price = blackScholes(200, 100, 1, 0.05, 0.2, 'call');
      expect(price).toBeGreaterThan(95);
    });
    it('高波动率更贵', () => {
      const low = blackScholes(100, 100, 1, 0.05, 0.1, 'call');
      const high = blackScholes(100, 100, 1, 0.05, 0.5, 'call');
      expect(high).toBeGreaterThan(low);
    });
  });

  // 希腊字母计算
  const greeks = (S: number, K: number, T: number, r: number, sigma: number) => {
    const d1 = (Math.log(S / K) + (r + sigma ** 2 / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    const normPDF = (x: number) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
    const delta = 0.5 * (1 + erf(d1 / Math.sqrt(2))); // simplified
    const gamma = normPDF(d1) / (S * sigma * Math.sqrt(T));
    const theta = -(S * normPDF(d1) * sigma) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * delta;
    const vega = S * normPDF(d1) * Math.sqrt(T);
    const rho = K * T * Math.exp(-r * T) * delta;
    return { delta, gamma, theta, vega: vega / 100, rho: rho / 100 };
  };
  const erf = (x: number) => {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
  };

  describe('希腊字母', () => {
    it('Delta在[0,1]范围', () => {
      const g = greeks(100, 100, 1, 0.05, 0.2);
      expect(g.delta).toBeGreaterThan(0);
      expect(g.delta).toBeLessThan(1);
    });
    it('Gamma为正', () => {
      const g = greeks(100, 100, 1, 0.05, 0.2);
      expect(g.gamma).toBeGreaterThan(0);
    });
    it('Vega为正', () => {
      const g = greeks(100, 100, 1, 0.05, 0.2);
      expect(g.vega).toBeGreaterThan(0);
    });
    it('ATM Delta约0.5', () => {
      const g = greeks(100, 100, 1, 0.05, 0.2);
      expect(g.delta).toBeCloseTo(0.5, 0);
    });
  });

  // 蒙特卡洛模拟
  const monteCarloVaR = (returns: number[], confidence: number, simulations: number) => {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length);
    const results: number[] = [];
    for (let i = 0; i < simulations; i++) {
      const u1 = Math.random(), u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      results.push(mean + z * std);
    }
    results.sort((a, b) => a - b);
    const idx = Math.floor((1 - confidence) * results.length);
    return { var: -results[idx], mean, std, simulations };
  };

  describe('蒙特卡洛VaR', () => {
    it('VaR为正', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.48) * 0.02);
      const result = monteCarloVaR(returns, 0.95, 1000);
      expect(result.var).toBeGreaterThan(0);
    });
    it('高置信度VaR更大', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.48) * 0.02);
      const var95 = monteCarloVaR(returns, 0.95, 1000);
      const var99 = monteCarloVaR(returns, 0.99, 1000);
      expect(var99.var).toBeGreaterThanOrEqual(var95.var);
    });
    it('模拟次数正确', () => {
      const returns = [0.01, 0.02, -0.01, 0.03];
      const result = monteCarloVaR(returns, 0.95, 500);
      expect(result.simulations).toBe(500);
    });
  });

  // 因子收益率分解
  const factorDecomposition = (stockReturns: number[], factorReturns: number[][]) => {
    const n = factorReturns.length;
    const means = factorReturns.map(f => f.reduce((a, b) => a + b, 0) / f.length);
    const stockMean = stockReturns.reduce((a, b) => a + b, 0) / stockReturns.length;
    // Simple OLS: beta = cov(r, f) / var(f)
    const betas = factorReturns.map((f, i) => {
      const fMean = means[i];
      const cov = stockReturns.reduce((s, r, k) => s + (r - stockMean) * (f[k] - fMean), 0) / f.length;
      const fVar = f.reduce((s, v) => s + (v - fMean) ** 2, 0) / f.length;
      return fVar === 0 ? 0 : cov / fVar;
    });
    const alpha = stockMean - betas.reduce((s, b, i) => s + b * means[i], 0);
    return { alpha, betas };
  };

  describe('因子分解', () => {
    it('单因子', () => {
      const stock = [0.02, 0.04, 0.06, 0.03, 0.05];
      const factor = [[0.01, 0.02, 0.03, 0.015, 0.025]];
      const result = factorDecomposition(stock, factor);
      expect(result.betas.length).toBe(1);
      expect(result.betas[0]).toBeGreaterThan(0);
    });
    it('多因子', () => {
      const stock = [0.02, 0.03, 0.01, 0.04, 0.02];
      const factors = [
        [0.01, 0.02, 0.01, 0.03, 0.01],
        [0.005, 0.01, 0.002, 0.01, 0.01],
      ];
      const result = factorDecomposition(stock, factors);
      expect(result.betas.length).toBe(2);
    });
    it('零方差因子', () => {
      const stock = [0.02, 0.03, 0.01];
      const factor = [[0.01, 0.01, 0.01]];
      const result = factorDecomposition(stock, factor);
      expect(result.betas[0]).toBe(0);
    });
  });

  // 波动率曲面插值
  const interpolateVol = (knownStrikes: number[], knownVols: number[], targetStrike: number) => {
    if (knownStrikes.length === 0) return 0;
    if (knownStrikes.length === 1) return knownVols[0];
    const sorted = knownStrikes.map((s, i) => ({ strike: s, vol: knownVols[i] })).sort((a, b) => a.strike - b.strike);
    if (targetStrike <= sorted[0].strike) return sorted[0].vol;
    if (targetStrike >= sorted[sorted.length - 1].strike) return sorted[sorted.length - 1].vol;
    for (let i = 0; i < sorted.length - 1; i++) {
      if (targetStrike >= sorted[i].strike && targetStrike <= sorted[i + 1].strike) {
        const t = (targetStrike - sorted[i].strike) / (sorted[i + 1].strike - sorted[i].strike);
        return sorted[i].vol + t * (sorted[i + 1].vol - sorted[i].vol);
      }
    }
    return 0;
  };

  describe('波动率插值', () => {
    it('线性插值', () => {
      const result = interpolateVol([90, 110], [0.25, 0.15], 100);
      expect(result).toBeCloseTo(0.20);
    });
    it('边界外推-左', () => {
      const result = interpolateVol([90, 100, 110], [0.25, 0.20, 0.15], 80);
      expect(result).toBe(0.25);
    });
    it('边界外推-右', () => {
      const result = interpolateVol([90, 100, 110], [0.25, 0.20, 0.15], 120);
      expect(result).toBe(0.15);
    });
    it('单点', () => {
      expect(interpolateVol([100], [0.20], 100)).toBe(0.20);
    });
    it('空数据', () => {
      expect(interpolateVol([], [], 100)).toBe(0);
    });
    it('精确匹配', () => {
      const result = interpolateVol([90, 100, 110], [0.25, 0.20, 0.15], 100);
      expect(result).toBe(0.20);
    });
  });

  // 收益率曲线拟合
  const yieldCurveFit = (maturities: number[], yields: number[], method: 'linear' | 'quadratic' = 'linear') => {
    if (maturities.length < 2) return { coefficients: [], r2: 0 };
    const n = maturities.length;
    if (method === 'linear') {
      const sumX = maturities.reduce((a, b) => a + b, 0);
      const sumY = yields.reduce((a, b) => a + b, 0);
      const sumXY = maturities.reduce((s, x, i) => s + x * yields[i], 0);
      const sumX2 = maturities.reduce((s, x) => s + x * x, 0);
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      const yMean = sumY / n;
      const ssRes = maturities.reduce((s, x, i) => s + (yields[i] - (intercept + slope * x)) ** 2, 0);
      const ssTot = yields.reduce((s, y) => s + (y - yMean) ** 2, 0);
      const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
      return { coefficients: [intercept, slope], r2 };
    }
    return { coefficients: [0, 0, 0], r2: 0 };
  };

  describe('收益率曲线拟合', () => {
    it('完美线性', () => {
      const m = [1, 2, 3, 4, 5];
      const y = [0.01, 0.02, 0.03, 0.04, 0.05];
      const result = yieldCurveFit(m, y);
      expect(result.r2).toBeCloseTo(1);
      expect(result.coefficients[1]).toBeCloseTo(0.01);
    });
    it('R²在[0,1]', () => {
      const m = [1, 2, 3, 4, 5];
      const y = [0.01, 0.03, 0.02, 0.05, 0.04];
      const result = yieldCurveFit(m, y);
      expect(result.r2).toBeGreaterThanOrEqual(0);
      expect(result.r2).toBeLessThanOrEqual(1);
    });
    it('数据不足', () => {
      const result = yieldCurveFit([1], [0.01]);
      expect(result.coefficients).toEqual([]);
    });
  });
});
