import { describe, it, expect } from 'vitest';

// ===== 金融数学与风险引擎 =====
describe('Financial Math & Risk Engine', () => {
  // 年化收益率
  const annualizedReturn = (totalReturn: number, years: number): number => {
    if (years <= 0) return 0;
    return Math.pow(1 + totalReturn, 1 / years) - 1;
  };

  // 波动率(年化)
  const annualizedVolatility = (dailyReturns: number[]): number => {
    if (dailyReturns.length < 2) return 0;
    const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (dailyReturns.length - 1);
    return Math.sqrt(variance * 252);
  };

  // 索提诺比率
  const sortinoRatio = (returns: number[], riskFreeRate: number = 0): number => {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const downside = returns.filter(r => r < riskFreeRate);
    if (downside.length === 0) return Infinity;
    const downsideVariance = downside.reduce((s, r) => s + (r - riskFreeRate) ** 2, 0) / returns.length;
    const downsideDev = Math.sqrt(downsideVariance);
    return downsideDev > 0 ? (mean - riskFreeRate) / downsideDev * Math.sqrt(252) : 0;
  };

  // 信息比率
  const informationRatio = (portfolioReturns: number[], benchmarkReturns: number[]): number => {
    if (portfolioReturns.length !== benchmarkReturns.length || portfolioReturns.length < 2) return 0;
    const excessReturns = portfolioReturns.map((r, i) => r - benchmarkReturns[i]);
    const meanExcess = excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length;
    const trackingError = Math.sqrt(excessReturns.reduce((s, r) => s + (r - meanExcess) ** 2, 0) / (excessReturns.length - 1));
    return trackingError > 0 ? meanExcess / trackingError : 0;
  };

  // 最大回撤持续时间
  const maxDrawdownDuration = (equity: number[]): { duration: number; startIndex: number; endIndex: number } => {
    if (equity.length === 0) return { duration: 0, startIndex: 0, endIndex: 0 };
    let peakIdx = 0, maxDur = 0, startIdx = 0, endIdx = 0;
    let currentStart = 0;
    for (let i = 1; i < equity.length; i++) {
      if (equity[i] >= equity[peakIdx]) {
        peakIdx = i;
        currentStart = i;
      } else {
        const dur = i - currentStart;
        if (dur > maxDur) {
          maxDur = dur;
          startIdx = currentStart;
          endIdx = i;
        }
      }
    }
    return { duration: maxDur, startIndex: startIdx, endIndex: endIdx };
  };

  // Calmar比率
  const calmarRatio = (annualizedReturn: number, maxDrawdown: number): number => {
    return maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;
  };

  // VaR (Value at Risk)
  const calculateVaR = (returns: number[], confidence: number = 0.95): number => {
    const sorted = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sorted.length);
    return -sorted[Math.max(0, index)];
  };

  // CVaR (Conditional VaR)
  const calculateCVaR = (returns: number[], confidence: number = 0.95): number => {
    const sorted = [...returns].sort((a, b) => a - b);
    const cutoff = Math.floor((1 - confidence) * sorted.length);
    const tail = sorted.slice(0, Math.max(1, cutoff));
    return -tail.reduce((a, b) => a + b, 0) / tail.length;
  };

  // Omega比率
  const omegaRatio = (returns: number[], threshold: number = 0): number => {
    let gains = 0, losses = 0;
    for (const r of returns) {
      if (r > threshold) gains += r - threshold;
      else losses += threshold - r;
    }
    return losses > 0 ? gains / losses : Infinity;
  };

  // Kelly准则
  const kellyCriterion = (winRate: number, avgWin: number, avgLoss: number): number => {
    if (avgLoss === 0) return 0;
    const b = avgWin / avgLoss;
    return (winRate * b - (1 - winRate)) / b;
  };

  // 移动平均收敛
  const ema = (data: number[], period: number): number[] => {
    if (data.length === 0) return [];
    const k = 2 / (period + 1);
    const result = [data[0]];
    for (let i = 1; i < data.length; i++) {
      result.push(data[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  };

  // RSI计算
  const calculateRSI = (prices: number[], period: number = 14): number[] => {
    if (prices.length < period + 1) return [];
    const rsi: number[] = [];
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= period; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff > 0) avgGain += diff;
      else avgLoss += Math.abs(diff);
    }
    avgGain /= period;
    avgLoss /= period;
    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    for (let i = period + 1; i < prices.length; i++) {
      const diff = prices[i] - prices[i - 1];
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? Math.abs(diff) : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    }
    return rsi;
  };

  // ATR (Average True Range)
  const calculateATR = (highs: number[], lows: number[], closes: number[], period: number = 14): number[] => {
    if (highs.length < 2) return [];
    const tr: number[] = [];
    for (let i = 1; i < highs.length; i++) {
      tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
    }
    const atr: number[] = [];
    let sum = 0;
    for (let i = 0; i < period && i < tr.length; i++) sum += tr[i];
    atr.push(sum / Math.min(period, tr.length));
    for (let i = period; i < tr.length; i++) {
      atr.push((atr[atr.length - 1] * (period - 1) + tr[i]) / period);
    }
    return atr;
  };

  // 布林带
  const bollingerBands = (prices: number[], period: number = 20, multiplier: number = 2): { upper: number[]; middle: number[]; lower: number[] } => {
    const upper: number[] = [], middle: number[] = [], lower: number[] = [];
    for (let i = period - 1; i < prices.length; i++) {
      const slice = prices.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const std = Math.sqrt(slice.reduce((s, p) => s + (p - mean) ** 2, 0) / period);
      middle.push(mean);
      upper.push(mean + multiplier * std);
      lower.push(mean - multiplier * std);
    }
    return { upper, middle, lower };
  };

  describe('年化收益率', () => {
    it('一年', () => {
      expect(annualizedReturn(0.1, 1)).toBeCloseTo(0.1);
    });

    it('两年复合', () => {
      expect(annualizedReturn(0.21, 2)).toBeCloseTo(0.1);
    });

    it('零收益', () => {
      expect(annualizedReturn(0, 1)).toBe(0);
    });

    it('负收益', () => {
      expect(annualizedReturn(-0.1, 1)).toBeCloseTo(-0.1);
    });

    it('零年返回零', () => {
      expect(annualizedReturn(0.1, 0)).toBe(0);
    });
  });

  describe('波动率', () => {
    it('零波动率', () => {
      const returns = Array(100).fill(0.001);
      expect(annualizedVolatility(returns)).toBeCloseTo(0);
    });

    it('常数波动率', () => {
      const returns = Array.from({ length: 100 }, (_, i) => i % 2 === 0 ? 0.01 : -0.01);
      expect(annualizedVolatility(returns)).toBeGreaterThan(0);
    });

    it('数据不足返回零', () => {
      expect(annualizedVolatility([0.01])).toBe(0);
    });

    it('空数组返回零', () => {
      expect(annualizedVolatility([])).toBe(0);
    });
  });

  describe('索提诺比率', () => {
    it('正收益', () => {
      const returns = Array(50).fill(0.01).concat(Array(10).fill(-0.005));
      expect(sortinoRatio(returns, 0)).toBeGreaterThan(0);
    });

    it('全部超额收益返回Infinity', () => {
      expect(sortinoRatio([0.01, 0.02, 0.03], -0.01)).toBe(Infinity);
    });
  });

  describe('信息比率', () => {
    it('正信息比率', () => {
      const portfolio = [0.02, 0.01, 0.03, -0.01, 0.02];
      const benchmark = [0.01, 0.01, 0.02, -0.01, 0.01];
      expect(informationRatio(portfolio, benchmark)).toBeGreaterThan(0);
    });

    it('长度不匹配返回零', () => {
      expect(informationRatio([1], [1, 2])).toBe(0);
    });
  });

  describe('最大回撤持续时间', () => {
    it('无回撤', () => {
      const result = maxDrawdownDuration([100, 110, 120, 130]);
      expect(result.duration).toBe(0);
    });

    it('有回撤', () => {
      const result = maxDrawdownDuration([100, 90, 80, 95, 110]);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('空数组', () => {
      expect(maxDrawdownDuration([])).toEqual({ duration: 0, startIndex: 0, endIndex: 0 });
    });
  });

  describe('Calmar比率', () => {
    it('正比率', () => {
      expect(calmarRatio(0.15, 0.1)).toBeCloseTo(1.5);
    });

    it('零回撤返回零', () => {
      expect(calmarRatio(0.15, 0)).toBe(0);
    });
  });

  describe('VaR', () => {
    it('95%置信度', () => {
      const returns = Array.from({ length: 100 }, (_, i) => (i - 50) / 1000);
      const var95 = calculateVaR(returns, 0.95);
      expect(var95).toBeGreaterThan(0);
    });

    it('100%置信度', () => {
      const returns = [-0.05, -0.03, -0.01, 0.01, 0.03];
      expect(calculateVaR(returns, 1.0)).toBe(0.05);
    });
  });

  describe('CVaR', () => {
    it('95% CVaR', () => {
      const returns = Array.from({ length: 100 }, (_, i) => (i - 50) / 1000);
      const cvar = calculateCVaR(returns, 0.95);
      expect(cvar).toBeGreaterThan(0);
    });
  });

  describe('Omega比率', () => {
    it('正Omega', () => {
      expect(omegaRatio([0.02, 0.01, -0.01, 0.03])).toBeGreaterThan(1);
    });

    it('全部正收益', () => {
      expect(omegaRatio([0.01, 0.02, 0.03], 0)).toBe(Infinity);
    });

    it('零阈值', () => {
      expect(omegaRatio([-0.01, 0.01], 0)).toBeCloseTo(1);
    });
  });

  describe('Kelly准则', () => {
    it('正Kelly', () => {
      expect(kellyCriterion(0.6, 2, 1)).toBeGreaterThan(0);
    });

    it('50%胜率等盈亏', () => {
      expect(kellyCriterion(0.5, 1, 1)).toBeCloseTo(0);
    });

    it('高胜率高盈亏', () => {
      expect(kellyCriterion(0.7, 3, 1)).toBeGreaterThan(0.3);
    });

    it('零平均损失', () => {
      expect(kellyCriterion(0.5, 1, 0)).toBe(0);
    });
  });

  describe('EMA', () => {
    it('常数数据', () => {
      const result = ema([10, 10, 10, 10], 3);
      expect(result[result.length - 1]).toBeCloseTo(10);
    });

    it('空数组', () => {
      expect(ema([], 3)).toEqual([]);
    });

    it('单元素', () => {
      expect(ema([5], 3)).toEqual([5]);
    });

    it('递增数据', () => {
      const result = ema([1, 2, 3, 4, 5], 3);
      expect(result[result.length - 1]).toBeGreaterThan(result[0]);
    });
  });

  describe('RSI', () => {
    it('全部上涨RSI=100', () => {
      const prices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
      const rsi = calculateRSI(prices, 14);
      expect(rsi[rsi.length - 1]).toBe(100);
    });

    it('数据不足返回空', () => {
      expect(calculateRSI([1, 2, 3], 14)).toEqual([]);
    });

    it('RSI在0-100之间', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 10);
      const rsi = calculateRSI(prices, 14);
      rsi.forEach(v => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('ATR', () => {
    it('计算正确', () => {
      const highs = [10, 12, 11, 13, 14];
      const lows = [8, 10, 9, 11, 12];
      const closes = [9, 11, 10, 12, 13];
      const atr = calculateATR(highs, lows, closes, 2);
      expect(atr.length).toBeGreaterThan(0);
      atr.forEach(v => expect(v).toBeGreaterThan(0));
    });

    it('数据不足返回空', () => {
      expect(calculateATR([10], [8], [9], 14)).toEqual([]);
    });
  });

  describe('布林带', () => {
    it('上轨大于中轨大于下轨', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i * 0.5) * 5);
      const bb = bollingerBands(prices, 10);
      for (let i = 0; i < bb.upper.length; i++) {
        expect(bb.upper[i]).toBeGreaterThan(bb.middle[i]);
        expect(bb.middle[i]).toBeGreaterThan(bb.lower[i]);
      }
    });

    it('常数价格带宽为零', () => {
      const prices = Array(20).fill(100);
      const bb = bollingerBands(prices, 20);
      expect(bb.upper[0]).toBeCloseTo(bb.lower[0]);
    });
  });
});
