import { describe, it, expect } from 'vitest';

// 高级量化分析引擎测试
describe('高级量化分析引擎', () => {
  describe('动量因子计算', () => {
    function momentumFactor(prices: number[], period: number): number[] {
      const result: number[] = [];
      for (let i = period; i < prices.length; i++) {
        result.push((prices[i] - prices[i - period]) / prices[i - period]);
      }
      return result;
    }

    it('正确计算N日动量', () => {
      const prices = [100, 102, 105, 103, 108, 110];
      const mom = momentumFactor(prices, 3);
      expect(mom[0]).toBeCloseTo(0.03, 2);
      expect(mom[1]).toBeCloseTo(0.0588, 2);
    });

    it('价格不动时动量为0', () => {
      const prices = [100, 100, 100, 100];
      const mom = momentumFactor(prices, 1);
      expect(mom.every(v => v === 0)).toBe(true);
    });

    it('周期大于数据长度返回空', () => {
      expect(momentumFactor([1, 2, 3], 5)).toHaveLength(0);
    });

    it('1日动量等于收益率', () => {
      const prices = [100, 110, 99];
      const mom = momentumFactor(prices, 1);
      expect(mom[0]).toBeCloseTo(0.1, 5);
      expect(mom[1]).toBeCloseTo(-0.1, 5);
    });
  });

  describe('波动率计算', () => {
    function realizedVolatility(returns: number[], annualizeFactor = 252): number {
      if (returns.length < 2) return 0;
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
      return Math.sqrt(variance * annualizeFactor);
    }

    it('计算年化波动率', () => {
      const returns = [0.01, -0.02, 0.015, -0.005, 0.02];
      const vol = realizedVolatility(returns);
      expect(vol).toBeGreaterThan(0);
      expect(vol).toBeLessThan(2);
    });

    it('零收益率波动率为0', () => {
      expect(realizedVolatility([0, 0, 0, 0, 0])).toBe(0);
    });

    it('单个收益率返回0', () => {
      expect(realizedVolatility([0.01])).toBe(0);
    });

    it('年化因子增大波动率', () => {
      const returns = [0.01, -0.01, 0.005];
      const vol252 = realizedVolatility(returns, 252);
      const vol52 = realizedVolatility(returns, 52);
      expect(vol252).toBeGreaterThan(vol52);
    });
  });

  describe('Beta系数计算', () => {
    function calculateBeta(stockReturns: number[], marketReturns: number[]): number {
      if (stockReturns.length !== marketReturns.length || stockReturns.length === 0) return 0;
      const n = stockReturns.length;
      const stockMean = stockReturns.reduce((a, b) => a + b, 0) / n;
      const marketMean = marketReturns.reduce((a, b) => a + b, 0) / n;
      let cov = 0, mVar = 0;
      for (let i = 0; i < n; i++) {
        cov += (stockReturns[i] - stockMean) * (marketReturns[i] - marketMean);
        mVar += (marketReturns[i] - marketMean) ** 2;
      }
      return mVar === 0 ? 0 : cov / mVar;
    }

    it('完全正相关Beta=1', () => {
      const market = [0.01, 0.02, -0.01, 0.015];
      const stock = [0.01, 0.02, -0.01, 0.015];
      expect(calculateBeta(stock, market)).toBeCloseTo(1, 5);
    });

    it('2倍波动Beta=2', () => {
      const market = [0.01, 0.02, -0.01, 0.015];
      const stock = market.map(r => r * 2);
      expect(calculateBeta(stock, market)).toBeCloseTo(2, 5);
    });

    it('反向波动Beta为负', () => {
      const market = [0.01, 0.02, -0.01];
      const stock = market.map(r => -r);
      expect(calculateBeta(stock, market)).toBeCloseTo(-1, 5);
    });

    it('空数据返回0', () => {
      expect(calculateBeta([], [])).toBe(0);
    });

    it('长度不匹配返回0', () => {
      expect(calculateBeta([1, 2], [1])).toBe(0);
    });
  });

  describe('Alpha计算', () => {
    function calculateAlpha(stockReturn: number, marketReturn: number, riskFreeRate: number, beta: number): number {
      return stockReturn - (riskFreeRate + beta * (marketReturn - riskFreeRate));
    }

    it('正Alpha表示超额收益', () => {
      expect(calculateAlpha(0.15, 0.10, 0.03, 1)).toBeGreaterThan(0);
    });

    it('Beta=1时Alpha=股票收益-市场收益', () => {
      expect(calculateAlpha(0.15, 0.10, 0.03, 1)).toBeCloseTo(0.05, 5);
    });

    it('零Alpha表示市场收益', () => {
      expect(calculateAlpha(0.10, 0.10, 0.03, 1)).toBeCloseTo(0, 5);
    });

    it('高Beta降低Alpha', () => {
      const a1 = calculateAlpha(0.15, 0.10, 0.03, 1);
      const a2 = calculateAlpha(0.15, 0.10, 0.03, 2);
      expect(a1).toBeGreaterThan(a2);
    });
  });

  describe('夏普比率', () => {
    function sharpeRatio(returns: number[], riskFreeRate = 0.03, annualizeFactor = 252): number {
      if (returns.length < 2) return 0;
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const annualizedReturn = mean * annualizeFactor;
      const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
      const annualizedVol = Math.sqrt(variance * annualizeFactor);
      return annualizedVol === 0 ? 0 : (annualizedReturn - riskFreeRate) / annualizedVol;
    }

    it('高收益低波动夏普比高', () => {
      const returns = Array.from({ length: 252 }, () => 0.001);
      expect(sharpeRatio(returns)).toBeGreaterThan(0);
    });

    it('负收益夏普比为负', () => {
      const returns = Array.from({ length: 100 }, () => -0.001);
      expect(sharpeRatio(returns)).toBeLessThan(0);
    });

    it('数据不足返回0', () => {
      expect(sharpeRatio([0.01])).toBe(0);
    });
  });

  describe('最大回撤', () => {
    function maxDrawdown(prices: number[]): { maxDD: number; peakIndex: number; troughIndex: number } {
      if (prices.length === 0) return { maxDD: 0, peakIndex: 0, troughIndex: 0 };
      let peak = prices[0], peakIdx = 0, maxDD = 0, pIdx = 0, tIdx = 0;
      for (let i = 1; i < prices.length; i++) {
        if (prices[i] > peak) { peak = prices[i]; peakIdx = i; }
        const dd = (peak - prices[i]) / peak;
        if (dd > maxDD) { maxDD = dd; pIdx = peakIdx; tIdx = i; }
      }
      return { maxDD, peakIndex: pIdx, troughIndex: tIdx };
    }

    it('计算最大回撤', () => {
      const prices = [100, 120, 80, 110, 70, 130];
      const result = maxDrawdown(prices);
      expect(result.maxDD).toBeCloseTo(0.417, 2);
      expect(result.peakIndex).toBe(1);
      expect(result.troughIndex).toBe(4);
    });

    it('单调递增回撤为0', () => {
      expect(maxDrawdown([1, 2, 3, 4, 5]).maxDD).toBe(0);
    });

    it('单调递减回撤最大', () => {
      expect(maxDrawdown([100, 50, 25]).maxDD).toBeCloseTo(0.75, 5);
    });

    it('空数组返回0', () => {
      expect(maxDrawdown([]).maxDD).toBe(0);
    });

    it('单个价格回撤为0', () => {
      expect(maxDrawdown([100]).maxDD).toBe(0);
    });
  });

  describe('信息比率', () => {
    function informationRatio(portfolioReturns: number[], benchmarkReturns: number[]): number {
      if (portfolioReturns.length !== benchmarkReturns.length || portfolioReturns.length < 2) return 0;
      const activeReturns = portfolioReturns.map((r, i) => r - benchmarkReturns[i]);
      const mean = activeReturns.reduce((a, b) => a + b, 0) / activeReturns.length;
      const variance = activeReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (activeReturns.length - 1);
      const trackingError = Math.sqrt(variance);
      return trackingError === 0 ? 0 : mean / trackingError;
    }

    it('组合等于基准时IR为0', () => {
      const returns = [0.01, 0.02, -0.01];
      expect(informationRatio(returns, returns)).toBe(0);
    });

    it('组合持续优于基准IR为正', () => {
      const bench = [0.01, 0.015, 0.008, 0.012, 0.009];
      const port = [0.02, 0.025, 0.018, 0.022, 0.019];
      expect(informationRatio(port, bench)).toBeGreaterThan(0);
    });

    it('数据不足返回0', () => {
      expect(informationRatio([0.01], [0.01])).toBe(0);
    });
  });

  describe('卡尔曼滤波', () => {
    function kalmanFilter1D(observations: number[], processNoise: number, measurementNoise: number): number[] {
      if (observations.length === 0) return [];
      let x = observations[0];
      let p = 1;
      const result: number[] = [x];
      for (let i = 1; i < observations.length; i++) {
        const pPred = p + processNoise;
        const k = pPred / (pPred + measurementNoise);
        x = x + k * (observations[i] - x);
        p = (1 - k) * pPred;
        result.push(x);
      }
      return result;
    }

    it('平滑噪声数据', () => {
      const obs = [10, 12, 9, 11, 10, 13, 9, 11];
      const filtered = kalmanFilter1D(obs, 0.01, 1);
      expect(filtered.length).toBe(obs.length);
      expect(filtered[0]).toBe(10);
    });

    it('空数据返回空', () => {
      expect(kalmanFilter1D([], 0.1, 1)).toHaveLength(0);
    });

    it('常数序列滤波后仍为常数', () => {
      const obs = [5, 5, 5, 5, 5];
      const filtered = kalmanFilter1D(obs, 0.001, 0.001);
      filtered.forEach(v => expect(v).toBeCloseTo(5, 1));
    });
  });

  describe('分位数计算', () => {
    function quantile(arr: number[], q: number): number {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const pos = (sorted.length - 1) * q;
      const base = Math.floor(pos);
      const rest = pos - base;
      if (sorted[base + 1] !== undefined) {
        return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
      }
      return sorted[base];
    }

    it('中位数', () => {
      expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    });

    it('最小值', () => {
      expect(quantile([3, 1, 2], 0)).toBe(1);
    });

    it('最大值', () => {
      expect(quantile([3, 1, 2], 1)).toBe(3);
    });

    it('空数组返回0', () => {
      expect(quantile([], 0.5)).toBe(0);
    });

    it('单元素数组', () => {
      expect(quantile([42], 0.5)).toBe(42);
    });

    it('四分位数', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(quantile(data, 0.25)).toBeCloseTo(3.25, 1);
      expect(quantile(data, 0.75)).toBeCloseTo(7.75, 1);
    });
  });

  describe('Z-Score标准化', () => {
    function zScore(value: number, mean: number, stdDev: number): number {
      return stdDev === 0 ? 0 : (value - mean) / stdDev;
    }

    function zScoreArray(arr: number[]): number[] {
      if (arr.length === 0) return [];
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
      const stdDev = Math.sqrt(variance);
      return arr.map(v => stdDev === 0 ? 0 : (v - mean) / stdDev);
    }

    it('均值的Z-Score为0', () => {
      expect(zScore(50, 50, 10)).toBe(0);
    });

    it('高于均值Z-Score为正', () => {
      expect(zScore(60, 50, 10)).toBe(1);
    });

    it('低于均值Z-Score为负', () => {
      expect(zScore(40, 50, 10)).toBe(-1);
    });

    it('零标准差返回0', () => {
      expect(zScore(100, 50, 0)).toBe(0);
    });

    it('数组标准化后均值为0', () => {
      const result = zScoreArray([10, 20, 30, 40, 50]);
      const mean = result.reduce((a, b) => a + b, 0) / result.length;
      expect(mean).toBeCloseTo(0, 10);
    });

    it('空数组返回空', () => {
      expect(zScoreArray([])).toHaveLength(0);
    });
  });
});
