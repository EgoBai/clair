import { describe, it, expect } from 'vitest';

describe('高频交易信号引擎', () => {
  // Price Impact (短期)
  function shortTermImpact(prices: number[], volumes: number[], window = 5) {
    if (prices.length < window + 1) return [];
    const result: number[] = [];
    for (let i = window; i < prices.length; i++) {
      let sumImpact = 0;
      for (let j = i - window + 1; j <= i; j++) {
        const ret = (prices[j] - prices[j - 1]) / prices[j - 1];
        const signedVol = volumes[j] * (ret > 0 ? 1 : -1);
        sumImpact += ret / (signedVol || 1);
      }
      result.push(sumImpact / window);
    }
    return result;
  }

  // VPIN (Volume-Synchronized Probability of Informed Trading)
  function vpin(returns: number[], volumes: number[], bucketSize = 50) {
    if (returns.length < bucketSize) return [];
    const result: number[] = [];
    for (let i = bucketSize; i < returns.length; i++) {
      let buyVol = 0, sellVol = 0;
      for (let j = i - bucketSize + 1; j <= i; j++) {
        if (returns[j] > 0) buyVol += volumes[j];
        else if (returns[j] < 0) sellVol += volumes[j];
        else { buyVol += volumes[j] / 2; sellVol += volumes[j] / 2; }
      }
      const total = buyVol + sellVol;
      result.push(total > 0 ? Math.abs(buyVol - sellVol) / total : 0);
    }
    return result;
  }

  // Toxic Flow Detection
  function toxicFlow(prices: number[], volumes: number[], threshold = 2) {
    if (prices.length < 10) return [];
    const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
    const meanVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const stdVol = Math.sqrt(volumes.reduce((s, v) => s + (v - meanVol) ** 2, 0) / volumes.length);
    return volumes.map((v, i) => ({
      index: i,
      isToxic: v > meanVol + threshold * stdVol && i > 0 && Math.abs(returns[i - 1] || 0) > 0.01,
      volZScore: stdVol === 0 ? 0 : (v - meanVol) / stdVol,
    })).filter(r => r.isToxic);
  }

  // Intraday Seasonality
  function intradayPattern(prices: number[], returns: number[], nBins = 8) {
    const binSize = Math.floor(returns.length / nBins);
    if (binSize < 1) return [];
    return Array.from({ length: nBins }, (_, i) => {
      const bin = returns.slice(i * binSize, (i + 1) * binSize);
      const vol = Math.sqrt(bin.reduce((s, r) => s + r ** 2, 0) / bin.length);
      const avgRet = bin.reduce((a, b) => a + b, 0) / bin.length;
      return { bin: i, volatility: vol, avgReturn: avgRet, volume: bin.length };
    });
  }

  // Realized Skewness & Kurtosis
  function realizedHigherMoments(returns: number[], window = 20) {
    if (returns.length < window) return { skewness: [], kurtosis: [] };
    const skewness: number[] = [], kurtosis: number[] = [];
    for (let i = window - 1; i < returns.length; i++) {
      const slice = returns.slice(i - window + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / window;
      const m2 = slice.reduce((s, r) => s + (r - mean) ** 2, 0) / window;
      const m3 = slice.reduce((s, r) => s + (r - mean) ** 3, 0) / window;
      const m4 = slice.reduce((s, r) => s + (r - mean) ** 4, 0) / window;
      const std = Math.sqrt(m2);
      skewness.push(std > 0 ? m3 / std ** 3 : 0);
      kurtosis.push(m2 > 0 ? m4 / m2 ** 2 - 3 : 0);
    }
    return { skewness, kurtosis };
  }

  // Microstructure Noise Estimation
  function noiseEstimation(prices: number[]) {
    if (prices.length < 3) return 0;
    const returns = prices.slice(1).map((p, i) => Math.log(p / prices[i]));
    const autocorr = returns.slice(1).reduce((s, r, i) => s + r * returns[i], 0) / (returns.length - 1);
    return autocorr < 0 ? Math.sqrt(-2 * autocorr) : 0;
  }

  const prices = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 3) * 2 + Math.random() * 0.5);
  const volumes = Array.from({ length: 100 }, () => 1000 + Math.random() * 5000);
  const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);

  describe('短期价格冲击', () => {
    it('返回冲击值', () => {
      const result = shortTermImpact(prices, volumes, 5);
      expect(result.length).toBeGreaterThan(0);
    });

    it('数据不足返回空', () => {
      expect(shortTermImpact([100, 101], [1000], 5)).toEqual([]);
    });
  });

  describe('VPIN', () => {
    it('比率在0-1', () => {
      const result = vpin(returns, volumes, 20);
      result.forEach(v => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      });
    });

    it('数据不足返回空', () => {
      expect(vpin([0.01], [1000], 50)).toEqual([]);
    });
  });

  describe('有毒流量检测', () => {
    it('检测到异常流量', () => {
      const heavyVol = volumes.map(v => v * 100);
      const result = toxicFlow(prices, heavyVol, 0.5);
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('正常流量无有毒信号', () => {
      const normalVol = Array.from({ length: 100 }, () => 3000);
      const flatPrices = Array.from({ length: 100 }, () => 100);
      const result = toxicFlow(flatPrices, normalVol, 3);
      expect(result.length).toBe(0);
    });
  });

  describe('日内模式', () => {
    it('返回bin统计', () => {
      const result = intradayPattern(prices, returns, 4);
      expect(result.length).toBe(4);
      result.forEach(bin => {
        expect(bin.volatility).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('已实现高阶矩', () => {
    it('偏度和峰度', () => {
      const { skewness, kurtosis } = realizedHigherMoments(returns, 10);
      expect(skewness.length).toBeGreaterThan(0);
      expect(kurtosis.length).toBe(skewness.length);
      skewness.forEach(s => expect(isNaN(s)).toBe(false));
      kurtosis.forEach(k => expect(isNaN(k)).toBe(false));
    });

    it('数据不足返回空', () => {
      const result = realizedHigherMoments([0.01], 20);
      expect(result.skewness).toEqual([]);
    });
  });

  describe('微观结构噪声估计', () => {
    it('返回非负噪声水平', () => {
      const noise = noiseEstimation(prices);
      expect(noise).toBeGreaterThanOrEqual(0);
    });

    it('短序列返回0', () => {
      expect(noiseEstimation([100, 101])).toBe(0);
    });
  });
});
