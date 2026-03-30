import { describe, it, expect } from 'vitest';

describe('量化模型与策略引擎', () => {

  // 均值回归策略
  const meanReversionSignal = (prices: number[], lookback: number = 20, threshold: number = 2) => {
    if (prices.length < lookback) return { signal: 'hold' as const, zscore: 0 };
    const window = prices.slice(-lookback);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const std = Math.sqrt(window.reduce((a, b) => a + (b - mean) ** 2, 0) / window.length);
    if (std === 0) return { signal: 'hold' as const, zscore: 0 };
    const current = prices[prices.length - 1];
    const zscore = (current - mean) / std;
    if (zscore < -threshold) return { signal: 'buy' as const, zscore };
    if (zscore > threshold) return { signal: 'sell' as const, zscore };
    return { signal: 'hold' as const, zscore };
  };

  describe('均值回归策略', () => {
    it('超卖信号', () => {
      const prices = Array(19).fill(100).concat([80]);
      const result = meanReversionSignal(prices, 20, 1.5);
      expect(result.signal).toBe('buy');
      expect(result.zscore).toBeLessThan(-1.5);
    });
    it('超买信号', () => {
      const prices = Array(19).fill(100).concat([120]);
      const result = meanReversionSignal(prices, 20, 1.5);
      expect(result.signal).toBe('sell');
      expect(result.zscore).toBeGreaterThan(1.5);
    });
    it('持有信号', () => {
      const prices = Array(20).fill(100);
      const result = meanReversionSignal(prices, 20, 2);
      expect(result.signal).toBe('hold');
    });
    it('数据不足', () => {
      const result = meanReversionSignal([1, 2, 3], 20, 2);
      expect(result.signal).toBe('hold');
      expect(result.zscore).toBe(0);
    });
    it('常数数组无波动', () => {
      const prices = Array(20).fill(50);
      const result = meanReversionSignal(prices);
      expect(result.signal).toBe('hold');
      expect(result.zscore).toBe(0);
    });
  });

  // 动量策略
  const momentumSignal = (prices: number[], shortPeriod: number = 5, longPeriod: number = 20) => {
    if (prices.length < longPeriod) return { signal: 'hold' as const, shortMA: 0, longMA: 0 };
    const shortMA = prices.slice(-shortPeriod).reduce((a, b) => a + b, 0) / shortPeriod;
    const longMA = prices.slice(-longPeriod).reduce((a, b) => a + b, 0) / longPeriod;
    if (shortMA > longMA * 1.02) return { signal: 'buy' as const, shortMA, longMA };
    if (shortMA < longMA * 0.98) return { signal: 'sell' as const, shortMA, longMA };
    return { signal: 'hold' as const, shortMA, longMA };
  };

  describe('动量策略', () => {
    it('上升动量', () => {
      const prices = Array(15).fill(100).concat(Array(5).fill(110));
      const result = momentumSignal(prices);
      expect(result.signal).toBe('buy');
      expect(result.shortMA).toBeGreaterThan(result.longMA);
    });
    it('下降动量', () => {
      const prices = Array(15).fill(100).concat(Array(5).fill(90));
      const result = momentumSignal(prices);
      expect(result.signal).toBe('sell');
    });
    it('无明显趋势', () => {
      const prices = Array(20).fill(100);
      const result = momentumSignal(prices);
      expect(result.signal).toBe('hold');
    });
    it('数据不足返回hold', () => {
      const result = momentumSignal([1, 2, 3], 5, 20);
      expect(result.signal).toBe('hold');
    });
  });

  // 布林带策略
  const bollingerBandSignal = (prices: number[], period: number = 20, multiplier: number = 2) => {
    if (prices.length < period) return { signal: 'hold' as const, upper: 0, lower: 0, middle: 0 };
    const window = prices.slice(-period);
    const middle = window.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(window.reduce((a, b) => a + (b - middle) ** 2, 0) / period);
    const upper = middle + multiplier * std;
    const lower = middle - multiplier * std;
    const current = prices[prices.length - 1];
    if (current <= lower) return { signal: 'buy' as const, upper, lower, middle };
    if (current >= upper) return { signal: 'sell' as const, upper, lower, middle };
    return { signal: 'hold' as const, upper, lower, middle };
  };

  describe('布林带策略', () => {
    it('价格触下轨', () => {
      const prices = Array(19).fill(100).concat([70]);
      const result = bollingerBandSignal(prices);
      expect(result.signal).toBe('buy');
      expect(result.lower).toBeGreaterThan(0);
    });
    it('价格触上轨', () => {
      const prices = Array(19).fill(100).concat([130]);
      const result = bollingerBandSignal(prices);
      expect(result.signal).toBe('sell');
    });
    it('通道内持有', () => {
      const prices = [95, 100, 105, 98, 102, 99, 101, 97, 103, 96, 104, 100, 100, 99, 101, 98, 102, 100, 100, 100];
      const result = bollingerBandSignal(prices);
      expect(result.signal).toBe('hold');
    });
    it('上轨>中轨>下轨', () => {
      const prices = [95, 100, 105, 98, 102, 99, 101, 97, 103, 96, 104, 100, 100, 99, 101, 98, 102, 100, 100, 100];
      const result = bollingerBandSignal(prices);
      expect(result.upper).toBeGreaterThan(result.middle);
      expect(result.middle).toBeGreaterThan(result.lower);
    });
  });

  // 波动率突破策略
  const volatilityBreakout = (highs: number[], lows: number[], closes: number[], period: number = 20) => {
    if (closes.length < period + 1) return { signal: 'hold' as const, atr: 0 };
    const trs: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
      trs.push(tr);
    }
    const atr = trs.slice(-period).reduce((a, b) => a + b, 0) / period;
    const current = closes[closes.length - 1];
    const prevHigh = Math.max(...highs.slice(-period, -1));
    const prevLow = Math.min(...lows.slice(-period, -1));
    if (current > prevHigh + atr * 0.5) return { signal: 'buy' as const, atr };
    if (current < prevLow - atr * 0.5) return { signal: 'sell' as const, atr };
    return { signal: 'hold' as const, atr };
  };

  describe('波动率突破策略', () => {
    it('向上突破', () => {
      const highs = Array(20).fill(105);
      const lows = Array(20).fill(95);
      const closes = Array(20).fill(100);
      highs.push(115); lows.push(105); closes.push(112);
      const result = volatilityBreakout(highs, lows, closes);
      expect(result.signal).toBe('buy');
      expect(result.atr).toBeGreaterThan(0);
    });
    it('向下突破', () => {
      const highs = Array(20).fill(105);
      const lows = Array(20).fill(95);
      const closes = Array(20).fill(100);
      highs.push(95); lows.push(85); closes.push(88);
      const result = volatilityBreakout(highs, lows, closes);
      expect(result.signal).toBe('sell');
    });
    it('无突破持有', () => {
      const highs = Array(21).fill(105);
      const lows = Array(21).fill(95);
      const closes = Array(21).fill(100);
      const result = volatilityBreakout(highs, lows, closes);
      expect(result.signal).toBe('hold');
    });
  });

  // 风险价值 VaR
  const calculateVaR = (returns: number[], confidence: number = 0.95) => {
    if (returns.length === 0) return 0;
    const sorted = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sorted.length);
    return -sorted[Math.max(0, index)];
  };

  describe('风险价值 VaR', () => {
    it('正态分布VaR', () => {
      const returns = [-3, -2, -1, 0, 1, 2, 3, -0.5, 0.5, 1.5];
      const var95 = calculateVaR(returns, 0.95);
      expect(var95).toBeGreaterThan(0);
    });
    it('全正收益VaR为0', () => {
      const returns = [1, 2, 3, 4, 5];
      const var95 = calculateVaR(returns, 0.95);
      expect(var95).toBeLessThanOrEqual(0);
    });
    it('空数组', () => {
      expect(calculateVaR([])).toBe(0);
    });
    it('99%置信度更高VaR', () => {
      const returns = Array.from({ length: 100 }, (_, i) => i - 50);
      const var95 = calculateVaR(returns, 0.95);
      const var99 = calculateVaR(returns, 0.99);
      expect(var99).toBeGreaterThanOrEqual(var95);
    });
  });

  // Beta 系数
  const calculateBeta = (stockReturns: number[], marketReturns: number[]) => {
    if (stockReturns.length !== marketReturns.length || stockReturns.length < 2) return 0;
    const n = stockReturns.length;
    const meanStock = stockReturns.reduce((a, b) => a + b, 0) / n;
    const meanMarket = marketReturns.reduce((a, b) => a + b, 0) / n;
    let cov = 0, varM = 0;
    for (let i = 0; i < n; i++) {
      cov += (stockReturns[i] - meanStock) * (marketReturns[i] - meanMarket);
      varM += (marketReturns[i] - meanMarket) ** 2;
    }
    if (varM === 0) return 0;
    return cov / varM;
  };

  describe('Beta 系数', () => {
    it('完全正相关Beta=1', () => {
      const market = [1, 2, 3, 4, 5];
      const stock = [1, 2, 3, 4, 5];
      expect(calculateBeta(stock, market)).toBeCloseTo(1);
    });
    it('Beta=2 高波动', () => {
      const market = [1, 2, 3, 4, 5];
      const stock = [2, 4, 6, 8, 10];
      expect(calculateBeta(stock, market)).toBeCloseTo(2);
    });
    it('负Beta', () => {
      const market = [1, 2, 3, 4, 5];
      const stock = [5, 4, 3, 2, 1];
      expect(calculateBeta(stock, market)).toBeLessThan(0);
    });
    it('数据不足', () => {
      expect(calculateBeta([1], [1])).toBe(0);
    });
    it('零方差市场', () => {
      expect(calculateBeta([1, 2, 3], [5, 5, 5])).toBe(0);
    });
  });

  // 信息比率
  const informationRatio = (portfolioReturns: number[], benchmarkReturns: number[]) => {
    if (portfolioReturns.length !== benchmarkReturns.length || portfolioReturns.length < 2) return 0;
    const excessReturns = portfolioReturns.map((r, i) => r - benchmarkReturns[i]);
    const mean = excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length;
    const std = Math.sqrt(excessReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / excessReturns.length);
    if (std === 0) return 0;
    return mean / std;
  };

  describe('信息比率', () => {
    it('超额收益为正', () => {
      const portfolio = [2, 4, 3, 6, 5];
      const benchmark = [1, 2, 3, 4, 5];
      expect(informationRatio(portfolio, benchmark)).toBeGreaterThan(0);
    });
    it('超额收益为负', () => {
      const portfolio = [1, 2, 3, 4, 5];
      const benchmark = [2, 4, 3, 6, 5];
      expect(informationRatio(portfolio, benchmark)).toBeLessThan(0);
    });
    it('无超额收益', () => {
      const returns = [1, 2, 3, 4, 5];
      expect(informationRatio(returns, returns)).toBe(0);
    });
    it('数据不足', () => {
      expect(informationRatio([1], [1])).toBe(0);
    });
  });

  // Treynor 比率
  const treynorRatio = (portfolioReturn: number, riskFreeRate: number, beta: number) => {
    if (beta === 0) return 0;
    return (portfolioReturn - riskFreeRate) / beta;
  };

  describe('Treynor 比率', () => {
    it('正Beta正超额', () => {
      expect(treynorRatio(12, 3, 1.2)).toBeCloseTo(7.5);
    });
    it('零Beta', () => {
      expect(treynorRatio(12, 3, 0)).toBe(0);
    });
    it('负Beta', () => {
      const result = treynorRatio(8, 3, -0.5);
      expect(result).toBeLessThan(0);
    });
  });

  // Calmar 比率
  const calmarRatio = (annualReturn: number, maxDrawdown: number) => {
    if (maxDrawdown === 0) return 0;
    return annualReturn / maxDrawdown;
  };

  describe('Calmar 比率', () => {
    it('正回撤正收益', () => {
      expect(calmarRatio(15, 10)).toBeCloseTo(1.5);
    });
    it('零回撤', () => {
      expect(calmarRatio(10, 0)).toBe(0);
    });
    it('负收益', () => {
      expect(calmarRatio(-5, 10)).toBeLessThan(0);
    });
  });

  // Sortino 比率
  const sortinoRatio = (returns: number[], riskFreeRate: number = 0) => {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const downside = returns.filter(r => r < riskFreeRate);
    if (downside.length === 0) return 0;
    const downsideVar = downside.reduce((a, b) => a + (b - riskFreeRate) ** 2, 0) / returns.length;
    const downsideStd = Math.sqrt(downsideVar);
    if (downsideStd === 0) return 0;
    return (mean - riskFreeRate) / downsideStd;
  };

  describe('Sortino 比率', () => {
    it('正常计算', () => {
      const returns = [2, -1, 3, -2, 4, -0.5, 1];
      const result = sortinoRatio(returns, 0);
      expect(result).toBeGreaterThan(0);
    });
    it('全正收益', () => {
      const returns = [1, 2, 3, 4, 5];
      expect(sortinoRatio(returns, 0)).toBe(0);
    });
    it('负均值', () => {
      const returns = [-2, -1, -3, -2, -4];
      const result = sortinoRatio(returns, 0);
      expect(result).toBeLessThan(0);
    });
  });

  // 最大回撤持续期
  const maxDrawdownDuration = (equity: number[]) => {
    if (equity.length === 0) return { maxDuration: 0, currentDuration: 0 };
    let peak = equity[0];
    let maxDuration = 0;
    let currentDuration = 0;
    for (let i = 0; i < equity.length; i++) {
      if (equity[i] >= peak) {
        peak = equity[i];
        currentDuration = 0;
      } else {
        currentDuration++;
        maxDuration = Math.max(maxDuration, currentDuration);
      }
    }
    return { maxDuration, currentDuration };
  };

  describe('最大回撤持续期', () => {
    it('持续下跌', () => {
      const equity = [100, 95, 90, 85, 80, 75];
      const result = maxDrawdownDuration(equity);
      expect(result.maxDuration).toBe(5);
    });
    it('上涨无回撤', () => {
      const equity = [100, 105, 110, 115, 120];
      const result = maxDrawdownDuration(equity);
      expect(result.maxDuration).toBe(0);
    });
    it('空数组', () => {
      const result = maxDrawdownDuration([]);
      expect(result.maxDuration).toBe(0);
    });
    it('波动回撤', () => {
      const equity = [100, 90, 95, 85, 100, 80];
      const result = maxDrawdownDuration(equity);
      expect(result.maxDuration).toBeGreaterThan(0);
    });
  });

  // 仓位管理 - Kelly公式
  const kellyCriterion = (winRate: number, avgWin: number, avgLoss: number) => {
    if (avgLoss === 0) return 0;
    const b = avgWin / avgLoss;
    const kelly = winRate - (1 - winRate) / b;
    return Math.max(0, Math.min(kelly, 1));
  };

  describe('Kelly公式仓位管理', () => {
    it('60%胜率正Kelly', () => {
      const result = kellyCriterion(0.6, 100, 80);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(1);
    });
    it('50%胜率2:1盈亏比', () => {
      const result = kellyCriterion(0.5, 2, 1);
      expect(result).toBeGreaterThan(0);
    });
    it('低胜率负Kelly归零', () => {
      const result = kellyCriterion(0.3, 1, 3);
      expect(result).toBe(0);
    });
    it('零平均亏损', () => {
      expect(kellyCriterion(0.5, 100, 0)).toBe(0);
    });
    it('100%胜率', () => {
      expect(kellyCriterion(1, 100, 50)).toBe(1);
    });
  });
});
