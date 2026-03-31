import { describe, it, expect } from 'vitest';

describe('市场微观结构流动性引擎', () => {
  // Amihud非流动性比率
  function amihudIlliquidity(prices: number[], volumes: number[], window = 20) {
    if (prices.length < window + 1 || volumes.length < window) return [];
    const returns = prices.slice(1).map((p, i) => Math.abs(p - prices[i]) / prices[i]);
    const result: number[] = [];
    for (let i = window - 1; i < returns.length; i++) {
      let sum = 0;
      for (let j = i - window + 1; j <= i; j++) {
        sum += volumes[j] > 0 ? returns[j] / volumes[j] : 0;
      }
      result.push(sum / window);
    }
    return result;
  }

  // Roll (1984) 有效价差估计
  function rollSpread(prices: number[]) {
    if (prices.length < 3) return 0;
    const changes = prices.slice(1).map((p, i) => p - prices[i]);
    const mean = changes.reduce((a, b) => a + b, 0) / changes.length;
    const adjusted = changes.map(c => c - mean);
    const cov = adjusted.slice(1).reduce((s, c, i) => s + c * adjusted[i], 0) / (adjusted.length - 1);
    return cov < 0 ? 2 * Math.sqrt(-cov) : 0;
  }

  // Turnover ratio
  function turnoverRatio(volumes: number[], sharesOutstanding: number, window = 20) {
    if (volumes.length < window) return [];
    const result: number[] = [];
    for (let i = window - 1; i < volumes.length; i++) {
      const avgVol = volumes.slice(i - window + 1, i + 1).reduce((a, b) => a + b, 0) / window;
      result.push(avgVol / sharesOutstanding);
    }
    return result;
  }

  // Bid-Ask Spread Proxy (High-Low)
  function hlSpreadProxy(highs: number[], lows: number[], closes: number[], window = 20) {
    if (highs.length < window) return [];
    const result: number[] = [];
    for (let i = window - 1; i < highs.length; i++) {
      let sum = 0;
      for (let j = i - window + 1; j <= i; j++) {
        const hl = (highs[j] - lows[j]) / closes[j];
        sum += 2 * Math.sqrt(Math.abs(hl));
      }
      result.push(sum / window);
    }
    return result;
  }

  // Pastor-Stambaugh Liquidity
  function pastorStambaugh(prices: number[], volumes: number[], marketReturns: number[]) {
    if (prices.length < 3) return { gamma: 0, liquidityBeta: 0 };
    const returns = prices.slice(1).map((p, i) => p - prices[i]);
    // Simplified: regression of returns on signed volume
    const n = Math.min(returns.length, volumes.length - 1, marketReturns.length);
    const signedVol = volumes.slice(0, n).map((v, i) => {
      return i > 0 ? (v - volumes[i - 1]) * (returns[i] > 0 ? 1 : -1) : 0;
    });
    const meanSV = signedVol.reduce((a, b) => a + b, 0) / n;
    const meanRet = returns.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const cov = signedVol.reduce((s, v, i) => s + (v - meanSV) * (returns[i] - meanRet), 0) / n;
    const varSV = signedVol.reduce((s, v) => s + (v - meanSV) ** 2, 0) / n;
    return { gamma: varSV === 0 ? 0 : cov / varSV, liquidityBeta: Math.abs(cov) };
  }

  // Liquidity-adjusted VaR
  function liquidityAdjustedVaR(returns: number[], liquidityCost: number[], confidence = 0.95) {
    if (returns.length < 2 || liquidityCost.length < 2) return 0;
    const combined = returns.map((r, i) => r - (liquidityCost[i] || 0));
    const sorted = [...combined].sort((a, b) => a - b);
    const idx = Math.floor((1 - confidence) * sorted.length);
    return Math.abs(sorted[idx]);
  }

  const n = 60;
  const prices = Array.from({ length: n }, (_, i) => 100 + Math.sin(i / 5) * 5 + Math.random() * 2);
  const volumes = Array.from({ length: n }, () => 10000 + Math.random() * 50000);
  const highs = prices.map(p => p + Math.random() * 2);
  const lows = prices.map(p => p - Math.random() * 2);
  const closes = prices.map(p => p + (Math.random() - 0.5));
  const marketRet = Array.from({ length: n }, () => (Math.random() - 0.5) * 0.03);

  describe('Amihud非流动性', () => {
    it('比率计算正确', () => {
      const result = amihudIlliquidity(prices, volumes, 10);
      expect(result.length).toBeGreaterThan(0);
      result.forEach(v => expect(v).toBeGreaterThanOrEqual(0));
    });

    it('数据不足返回空', () => {
      expect(amihudIlliquidity([100], [1000], 10)).toEqual([]);
    });
  });

  describe('Roll有效价差', () => {
    it('返回非负值', () => {
      const spread = rollSpread(prices);
      expect(spread).toBeGreaterThanOrEqual(0);
    });

    it('短序列返回0', () => {
      expect(rollSpread([100, 101])).toBe(0);
    });
  });

  describe('换手率', () => {
    it('比率计算正确', () => {
      const result = turnoverRatio(volumes, 1000000, 10);
      expect(result.length).toBeGreaterThan(0);
      result.forEach(v => expect(v).toBeGreaterThanOrEqual(0));
    });
  });

  describe('HL价差代理', () => {
    it('价差非负', () => {
      const result = hlSpreadProxy(highs, lows, closes, 10);
      result.forEach(v => expect(v).toBeGreaterThanOrEqual(0));
    });

    it('数据不足返回空', () => {
      expect(hlSpreadProxy([1], [1], [1], 10)).toEqual([]);
    });
  });

  describe('Pastor-Stambaugh流动性', () => {
    it('返回gamma和beta', () => {
      const result = pastorStambaugh(prices, volumes, marketRet);
      expect(typeof result.gamma).toBe('number');
      expect(typeof result.liquidityBeta).toBe('number');
    });
  });

  describe('流动性调整VaR', () => {
    it('返回非负值', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.05);
      const liqCost = Array.from({ length: 100 }, () => Math.random() * 0.002);
      const var95 = liquidityAdjustedVaR(returns, liqCost, 0.95);
      expect(var95).toBeGreaterThanOrEqual(0);
    });

    it('99% VaR >= 95% VaR', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.05);
      const liqCost = Array.from({ length: 100 }, () => Math.random() * 0.002);
      const var95 = liquidityAdjustedVaR(returns, liqCost, 0.95);
      const var99 = liquidityAdjustedVaR(returns, liqCost, 0.99);
      expect(var99).toBeGreaterThanOrEqual(var95 - 0.001);
    });
  });
});
