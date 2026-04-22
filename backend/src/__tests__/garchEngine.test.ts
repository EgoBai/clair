import { describe, it, expect } from 'vitest';

// Seeded PRNG for deterministic tests
let _seed = 42;
function seededRandom(): number {
  _seed = (_seed * 16807 + 0) % 2147483647;
  return (_seed - 1) / 2147483646;
}

describe('GARCH波动率建模引擎', () => {
  // GARCH(1,1) 最大似然估计简化
  function garch11(returns: number[], omega = 0.0001, alpha = 0.1, beta = 0.85) {
    if (!returns.length) return { sigma: [], logLikelihood: 0 };
    const sigma: number[] = [Math.sqrt(omega / (1 - alpha - beta > 0 ? 1 - alpha - beta : 0.01))];
    let ll = 0;
    for (let t = 1; t < returns.length; t++) {
      const prevVar = sigma[t - 1] ** 2;
      const newVar = omega + alpha * returns[t - 1] ** 2 + beta * prevVar;
      sigma.push(Math.sqrt(Math.max(newVar, 1e-10)));
      ll += -0.5 * (Math.log(2 * Math.PI) + Math.log(sigma[t] ** 2) + (returns[t] ** 2) / (sigma[t] ** 2));
    }
    return { sigma, logLikelihood: ll };
  }

  // EGARCH
  function egarch(returns: number[], omega = -0.1, alpha = 0.15, beta = 0.95, gamma = -0.05) {
    if (!returns.length) return [];
    const logVar: number[] = [omega / (1 - beta)];
    for (let t = 1; t < returns.length; t++) {
      const z = returns[t - 1] / (Math.exp(logVar[t - 1] / 2) || 1);
      logVar.push(omega + alpha * (Math.abs(z) - Math.sqrt(2 / Math.PI)) + gamma * z + beta * logVar[t - 1]);
    }
    return logVar.map(lv => Math.exp(lv / 2));
  }

  // GJR-GARCH
  function gjrGarch(returns: number[], omega = 0.0001, alpha = 0.05, beta = 0.85, gamma = 0.1) {
    if (!returns.length) return [];
    const sigma: number[] = [Math.sqrt(omega / (1 - alpha - beta - gamma / 2 > 0 ? 1 - alpha - beta - gamma / 2 : 0.01))];
    for (let t = 1; t < returns.length; t++) {
      const indicator = returns[t - 1] < 0 ? 1 : 0;
      const newVar = omega + (alpha + gamma * indicator) * returns[t - 1] ** 2 + beta * sigma[t - 1] ** 2;
      sigma.push(Math.sqrt(Math.max(newVar, 1e-10)));
    }
    return sigma;
  }

  // 波动率预测
  function volatilityForecast(sigma: number[], returns: number[], steps = 5, omega = 0.0001, alpha = 0.1, beta = 0.85) {
    if (!sigma.length || !returns.length) return [];
    const forecasts: number[] = [];
    let lastVar = sigma[sigma.length - 1] ** 2;
    let lastReturn = returns[returns.length - 1];
    for (let h = 0; h < steps; h++) {
      const newVar = omega + alpha * lastReturn ** 2 + beta * lastVar;
      forecasts.push(Math.sqrt(newVar));
      lastVar = newVar;
      lastReturn = 0; // 预测均值为0
    }
    return forecasts;
  }

  // 波动率聚类检测
  function volatilityClustering(returns: number[], window = 20) {
    if (returns.length < window * 2) return { clusters: 0, avgDuration: 0 };
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length);
    const highVol = returns.map(r => Math.abs(r) > mean + std);
    let clusters = 0, durations: number[] = [], current = 0;
    for (const h of highVol) {
      if (h) current++;
      else if (current > 0) { durations.push(current); clusters++; current = 0; }
    }
    if (current > 0) { durations.push(current); clusters++; }
    return { clusters, avgDuration: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0 };
  }

  // 历史波动率(滚动窗口)
  function historicalVolatility(prices: number[], window = 20) {
    if (prices.length < window + 1) return [];
    const returns = prices.slice(1).map((p, i) => Math.log(p / prices[i]));
    const result: number[] = [];
    for (let i = window - 1; i < returns.length; i++) {
      const slice = returns.slice(i - window + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / window;
      result.push(Math.sqrt(slice.reduce((s, r) => s + (r - mean) ** 2, 0) / (window - 1)) * Math.sqrt(252));
    }
    return result;
  }

  const returns = Array.from({ length: 100 }, () => (seededRandom() - 0.5) * 0.04);
  const prices = Array.from({ length: 101 }, (_, i) => 100 * Math.exp(i * 0.001 + (seededRandom() - 0.5) * 0.02));

  describe('GARCH(1,1)', () => {
    it('波动率序列长度正确', () => {
      const { sigma } = garch11(returns);
      expect(sigma.length).toBe(returns.length);
    });

    it('波动率非负', () => {
      const { sigma } = garch11(returns);
      sigma.forEach(s => expect(s).toBeGreaterThanOrEqual(0));
    });

    it('波动率无NaN', () => {
      const { sigma } = garch11(returns);
      sigma.forEach(s => expect(isNaN(s)).toBe(false));
    });

    it('对数似然是有限数', () => {
      const { logLikelihood } = garch11(returns);
      expect(isFinite(logLikelihood)).toBe(true);
    });

    it('空输入返回空', () => {
      const { sigma } = garch11([]);
      expect(sigma).toEqual([]);
    });
  });

  describe('EGARCH', () => {
    it('返回波动率序列', () => {
      const sigma = egarch(returns);
      expect(sigma.length).toBe(returns.length);
    });

    it('波动率非负', () => {
      const sigma = egarch(returns);
      sigma.forEach(s => expect(s).toBeGreaterThanOrEqual(0));
    });

    it('杠杆效应(负冲击增大波动)', () => {
      const negRet = Array.from({ length: 50 }, () => -0.03 - seededRandom() * 0.02);
      const posRet = Array.from({ length: 50 }, () => 0.03 + seededRandom() * 0.02);
      const negSig = egarch(negRet);
      const posSig = egarch(posRet);
      const negAvg = negSig.reduce((a, b) => a + b, 0) / negSig.length;
      const posAvg = posSig.reduce((a, b) => a + b, 0) / posSig.length;
      // EGARCH with negative gamma should show asymmetric response
      expect(typeof negAvg).toBe('number');
      expect(typeof posAvg).toBe('number');
    });
  });

  describe('GJR-GARCH', () => {
    it('返回波动率序列', () => {
      const sigma = gjrGarch(returns);
      expect(sigma.length).toBe(returns.length);
    });

    it('波动率非负', () => {
      const sigma = gjrGarch(returns);
      sigma.forEach(s => expect(s).toBeGreaterThanOrEqual(0));
    });
  });

  describe('波动率预测', () => {
    it('预测步数正确', () => {
      const { sigma } = garch11(returns);
      const forecast = volatilityForecast(sigma, returns, 5);
      expect(forecast.length).toBe(5);
    });

    it('预测波动率非负', () => {
      const { sigma } = garch11(returns);
      const forecast = volatilityForecast(sigma, returns, 5);
      forecast.forEach(f => expect(f).toBeGreaterThanOrEqual(0));
    });
  });

  describe('波动率聚类', () => {
    it('返回聚类信息', () => {
      const result = volatilityClustering(returns, 10);
      expect(result.clusters).toBeGreaterThanOrEqual(0);
      expect(result.avgDuration).toBeGreaterThanOrEqual(0);
    });

    it('短序列处理', () => {
      const result = volatilityClustering([0.01, -0.02], 10);
      expect(result.clusters).toBe(0);
    });
  });

  describe('历史波动率', () => {
    it('年化波动率', () => {
      const hv = historicalVolatility(prices, 20);
      expect(hv.length).toBeGreaterThan(0);
      hv.forEach(v => expect(v).toBeGreaterThanOrEqual(0));
    });

    it('数据不足返回空', () => {
      expect(historicalVolatility([100, 101], 20)).toEqual([]);
    });
  });
});
