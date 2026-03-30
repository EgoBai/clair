import { describe, it, expect } from 'vitest';

// Volatility calculations
function calculateVolatility(prices: number[], period: number): number[] {
  const result: number[] = [];
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }
  for (let i = 0; i < returns.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const slice = returns.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
      const variance = slice.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (slice.length - 1);
      result.push(Math.sqrt(variance) * Math.sqrt(252));
    }
  }
  return result;
}

function calculateATR(highs: number[], lows: number[], closes: number[], period: number): number[] {
  const tr: number[] = [highs[0] - lows[0]];
  for (let i = 1; i < highs.length; i++) {
    tr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
  }
  const atr: number[] = [];
  for (let i = 0; i < tr.length; i++) {
    if (i < period - 1) {
      atr.push(NaN);
    } else if (i === period - 1) {
      atr.push(tr.slice(0, period).reduce((a, b) => a + b, 0) / period);
    } else {
      atr.push((atr[i - 1] * (period - 1) + tr[i]) / period);
    }
  }
  return atr;
}

function calculateBollingerBands(prices: number[], period: number, stdDev: number) {
  const sma = calculateSMA(prices, period);
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      lower.push(NaN);
    } else {
      const slice = prices.slice(i - period + 1, i + 1);
      const mean = sma[i]!;
      const std = Math.sqrt(slice.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / period);
      upper.push(mean + stdDev * std);
      lower.push(mean - stdDev * std);
    }
  }
  return { sma, upper, lower };
}

function calculateSMA(prices: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += prices[j];
      result.push(sum / period);
    }
  }
  return result;
}

function calculateHistoricalVolatility(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

function calculateMaxDrawdown(prices: number[]): { maxDrawdown: number; peak: number; trough: number } {
  let peak = prices[0];
  let maxDrawdown = 0;
  let trough = prices[0];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > peak) {
      peak = prices[i];
    }
    const drawdown = (peak - prices[i]) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      trough = prices[i];
    }
  }
  return { maxDrawdown, peak, trough };
}

function calculateSharpeRatio(returns: number[], riskFreeRate: number = 0.03): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const annualizedReturn = mean * 252;
  const std = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1));
  const annualizedVol = std * Math.sqrt(252);
  if (annualizedVol === 0) return 0;
  return (annualizedReturn - riskFreeRate) / annualizedVol;
}

function calculateSortinoRatio(returns: number[], riskFreeRate: number = 0.03): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const annualizedReturn = mean * 252;
  const downside = returns.filter(r => r < 0);
  if (downside.length === 0) return Infinity;
  const downsideStd = Math.sqrt(downside.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downside.length);
  const annualizedDownside = downsideStd * Math.sqrt(252);
  if (annualizedDownside === 0) return Infinity;
  return (annualizedReturn - riskFreeRate) / annualizedDownside;
}

function calculateCalmarRatio(annualReturn: number, maxDrawdown: number): number {
  if (maxDrawdown === 0) return annualReturn > 0 ? Infinity : 0;
  return annualReturn / maxDrawdown;
}

function calculateBeta(stockReturns: number[], marketReturns: number[]): number {
  if (stockReturns.length !== marketReturns.length || stockReturns.length < 2) return 0;
  const stockMean = stockReturns.reduce((a, b) => a + b, 0) / stockReturns.length;
  const marketMean = marketReturns.reduce((a, b) => a + b, 0) / marketReturns.length;
  let covariance = 0;
  let marketVariance = 0;
  for (let i = 0; i < stockReturns.length; i++) {
    covariance += (stockReturns[i] - stockMean) * (marketReturns[i] - marketMean);
    marketVariance += Math.pow(marketReturns[i] - marketMean, 2);
  }
  if (marketVariance === 0) return 0;
  return covariance / marketVariance;
}

function calculateAlpha(stockReturn: number, marketReturn: number, beta: number, riskFreeRate: number = 0.03): number {
  return stockReturn - (riskFreeRate + beta * (marketReturn - riskFreeRate));
}

describe('波动率与风险指标', () => {
  const prices = [100, 102, 98, 103, 107, 105, 110, 108, 112, 115, 113, 118, 120, 117, 122];
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }

  describe('波动率计算', () => {
    it('应该正确计算年化波动率', () => {
      const vol = calculateHistoricalVolatility(returns);
      expect(vol).toBeGreaterThan(0);
      expect(vol).toBeLessThan(5);
    });

    it('空数据应该返回0', () => {
      expect(calculateHistoricalVolatility([])).toBe(0);
    });

    it('单一数据应该返回0', () => {
      expect(calculateHistoricalVolatility([0.01])).toBe(0);
    });

    it('所有收益相同时波动率为0', () => {
      expect(calculateHistoricalVolatility([0.01, 0.01, 0.01])).toBe(0);
    });

    it('应该正确计算滚动波动率', () => {
      const vol = calculateVolatility(prices, 5);
      expect(vol.length).toBe(prices.length - 1);
      expect(isNaN(vol[0])).toBe(true);
      expect(isNaN(vol[3])).toBe(true);
      expect(isNaN(vol[4])).toBe(false);
    });

    it('波动率应该为非负值', () => {
      const vol = calculateVolatility(prices, 5);
      for (const v of vol) {
        if (!isNaN(v)) expect(v).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('ATR计算', () => {
    const highs = [105, 108, 103, 110, 115];
    const lows = [98, 100, 95, 102, 107];
    const closes = [102, 105, 98, 108, 112];

    it('应该正确计算ATR', () => {
      const atr = calculateATR(highs, lows, closes, 3);
      expect(atr.length).toBe(5);
      expect(isNaN(atr[0])).toBe(true);
      expect(isNaN(atr[1])).toBe(true);
      expect(isNaN(atr[2])).toBe(false);
    });

    it('ATR应该为非负值', () => {
      const atr = calculateATR(highs, lows, closes, 3);
      for (const a of atr) {
        if (!isNaN(a)) expect(a).toBeGreaterThanOrEqual(0);
      }
    });

    it('ATR应该等于首日TR均值（period=3）', () => {
      const atr = calculateATR(highs, lows, closes, 3);
      const tr0 = highs[0] - lows[0];
      const tr1 = Math.max(highs[1] - lows[1], Math.abs(highs[1] - closes[0]), Math.abs(lows[1] - closes[0]));
      const tr2 = Math.max(highs[2] - lows[2], Math.abs(highs[2] - closes[1]), Math.abs(lows[2] - closes[1]));
      expect(atr[2]).toBeCloseTo((tr0 + tr1 + tr2) / 3);
    });
  });

  describe('布林带计算', () => {
    it('应该返回三条线', () => {
      const { sma, upper, lower } = calculateBollingerBands(prices, 5, 2);
      expect(sma.length).toBe(prices.length);
      expect(upper.length).toBe(prices.length);
      expect(lower.length).toBe(prices.length);
    });

    it('上轨应该大于中轨', () => {
      const { sma, upper } = calculateBollingerBands(prices, 5, 2);
      for (let i = 4; i < prices.length; i++) {
        expect(upper[i]).toBeGreaterThan(sma[i]!);
      }
    });

    it('下轨应该小于中轨', () => {
      const { sma, lower } = calculateBollingerBands(prices, 5, 2);
      for (let i = 4; i < prices.length; i++) {
        expect(lower[i]).toBeLessThan(sma[i]!);
      }
    });

    it('上下轨应该对称', () => {
      const { sma, upper, lower } = calculateBollingerBands(prices, 5, 2);
      for (let i = 4; i < prices.length; i++) {
        expect(upper[i]! - sma[i]!).toBeCloseTo(sma[i]! - lower[i]!);
      }
    });
  });

  describe('最大回撤', () => {
    it('应该正确计算最大回撤', () => {
      const testPrices = [100, 110, 105, 120, 90, 95, 115];
      const result = calculateMaxDrawdown(testPrices);
      expect(result.maxDrawdown).toBeCloseTo((120 - 90) / 120);
      expect(result.peak).toBe(120);
      expect(result.trough).toBe(90);
    });

    it('单调上涨时回撤为0', () => {
      const upPrices = [1, 2, 3, 4, 5];
      const result = calculateMaxDrawdown(upPrices);
      expect(result.maxDrawdown).toBe(0);
    });

    it('单调下跌时回撤应该很大', () => {
      const downPrices = [100, 90, 80, 70, 60];
      const result = calculateMaxDrawdown(downPrices);
      expect(result.maxDrawdown).toBeCloseTo(0.4);
    });

    it('单一价格回撤为0', () => {
      const result = calculateMaxDrawdown([100]);
      expect(result.maxDrawdown).toBe(0);
    });
  });

  describe('夏普比率', () => {
    it('应该正确计算', () => {
      const sharpe = calculateSharpeRatio([0.01, 0.02, -0.01, 0.015, 0.005]);
      expect(typeof sharpe).toBe('number');
      expect(isFinite(sharpe)).toBe(true);
    });

    it('零波动时返回0', () => {
      expect(calculateSharpeRatio([0.01, 0.01, 0.01])).toBe(0);
    });

    it('空数据返回0', () => {
      expect(calculateSharpeRatio([])).toBe(0);
    });

    it('正收益应该有正夏普', () => {
      const sharpe = calculateSharpeRatio([0.01, 0.02, 0.01, 0.015, 0.02]);
      expect(sharpe).toBeGreaterThan(0);
    });
  });

  describe('索提诺比率', () => {
    it('应该只考虑下行波动', () => {
      const sortino = calculateSortinoRatio([0.01, -0.02, 0.01, -0.01, 0.02]);
      expect(typeof sortino).toBe('number');
    });

    it('无亏损时返回Infinity', () => {
      const sortino = calculateSortinoRatio([0.01, 0.02, 0.01]);
      expect(sortino).toBe(Infinity);
    });

    it('空数据返回0', () => {
      expect(calculateSortinoRatio([])).toBe(0);
    });
  });

  describe('Calmar比率', () => {
    it('应该正确计算', () => {
      const calmar = calculateCalmarRatio(0.15, 0.1);
      expect(calmar).toBeCloseTo(1.5);
    });

    it('零回撤时返回Infinity（正收益）', () => {
      expect(calculateCalmarRatio(0.15, 0)).toBe(Infinity);
    });

    it('零回撤零收益返回0', () => {
      expect(calculateCalmarRatio(0, 0)).toBe(0);
    });
  });

  describe('Beta和Alpha', () => {
    it('Beta应该正确计算', () => {
      const stockRet = [0.02, 0.01, -0.01, 0.03, 0.01];
      const marketRet = [0.01, 0.005, -0.005, 0.015, 0.005];
      const beta = calculateBeta(stockRet, marketRet);
      expect(beta).toBeGreaterThan(0);
    });

    it('Beta=0时Alpha等于股票收益减无风险利率', () => {
      const alpha = calculateAlpha(0.15, 0.10, 0, 0.03);
      expect(alpha).toBeCloseTo(0.12);
    });

    it('Beta=1时Alpha等于超额收益差', () => {
      const alpha = calculateAlpha(0.15, 0.10, 1, 0.03);
      expect(alpha).toBeCloseTo(0.05);
    });
  });
});
