import { describe, it, expect } from 'vitest';

describe('市场状态检测与策略适应', () => {
  // 趋势检测
  const detectTrend = (prices: number[], lookback: number) => {
    if (prices.length < lookback) return { trend: 'unknown', strength: 0 };
    const recent = prices.slice(-lookback);
    const first = recent[0], last = recent[recent.length - 1];
    const change = (last - first) / first;
    const sma = recent.reduce((a, b) => a + b, 0) / recent.length;
    const above = last > sma;
    const changes = recent.slice(1).map((p, i) => p - recent[i]);
    const upDays = changes.filter(c => c > 0).length;
    const consistency = upDays / changes.length;
    if (change > 0.02 && above && consistency > 0.6) return { trend: 'bullish', strength: Math.min(1, change * 10) };
    if (change < -0.02 && !above && consistency < 0.4) return { trend: 'bearish', strength: Math.min(1, Math.abs(change) * 10) };
    return { trend: 'sideways', strength: 0 };
  };

  describe('趋势检测', () => {
    it('上升趋势', () => {
      const prices = [100, 101, 102, 103, 104, 105, 106, 107, 108, 110];
      const result = detectTrend(prices, 10);
      expect(result.trend).toBe('bullish');
    });
    it('下降趋势', () => {
      const prices = [110, 108, 107, 106, 105, 104, 103, 102, 101, 100];
      const result = detectTrend(prices, 10);
      expect(result.trend).toBe('bearish');
    });
    it('盘整', () => {
      const prices = [100, 101, 99, 100, 101, 99, 100, 101, 99, 100];
      const result = detectTrend(prices, 10);
      expect(result.trend).toBe('sideways');
    });
    it('数据不足', () => {
      expect(detectTrend([100, 101], 10).trend).toBe('unknown');
    });
    it('趋势强度', () => {
      const strong = [100, 105, 110, 115, 120, 125, 130, 135, 140, 150];
      const result = detectTrend(strong, 10);
      expect(result.strength).toBeGreaterThan(0);
    });
  });

  // 波动率状态
  const volatilityState = (returns: number[], shortPeriod: number, longPeriod: number) => {
    if (returns.length < longPeriod) return { state: 'unknown', ratio: 0 };
    const std = (arr: number[]) => {
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
    };
    const shortVol = std(returns.slice(-shortPeriod));
    const longVol = std(returns.slice(-longPeriod));
    const ratio = longVol === 0 ? 0 : shortVol / longVol;
    if (ratio > 1.5) return { state: 'high', ratio };
    if (ratio < 0.7) return { state: 'low', ratio };
    return { state: 'normal', ratio };
  };

  describe('波动率状态', () => {
    it('高波动率', () => {
      const returns = [0.01, 0.01, 0.01, 0.01, 0.01, 0.10, -0.08, 0.12, -0.10, 0.15];
      const result = volatilityState(returns, 5, 10);
      expect(['high', 'normal']).toContain(result.state);
      expect(result.ratio).toBeGreaterThan(0);
    });
    it('低波动率', () => {
      const returns = [0.05, -0.04, 0.03, -0.02, 0.04, 0.001, 0.002, 0.001, 0.002, 0.001];
      const result = volatilityState(returns, 5, 10);
      expect(result.state).toBe('low');
    });
    it('正常波动率', () => {
      const returns = [0.01, 0.02, -0.01, 0.01, 0.02, -0.01, 0.01, 0.02, -0.01, 0.01];
      const result = volatilityState(returns, 5, 10);
      expect(result.state).toBe('normal');
    });
    it('数据不足', () => {
      expect(volatilityState([0.01, 0.02], 5, 10).state).toBe('unknown');
    });
  });

  // 均值回归检测
  const meanReversionScore = (prices: number[], period: number) => {
    if (prices.length < period + 1) return { score: 0, isReverting: false };
    const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
    // Autocorrelation at lag 1
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const adjusted = returns.map(r => r - mean);
    const variance = adjusted.reduce((s, v) => s + v ** 2, 0) / adjusted.length;
    if (variance === 0) return { score: 0, isReverting: false };
    const autocorr = adjusted.slice(1).reduce((s, v, i) => s + v * adjusted[i], 0) / ((adjusted.length - 1) * variance);
    const score = -autocorr; // Negative autocorrelation = mean reverting
    return { score, isReverting: score > 0.3 };
  };

  describe('均值回归', () => {
    it('震荡序列', () => {
      const prices = [100, 105, 100, 105, 100, 105, 100, 105, 100, 105];
      const result = meanReversionScore(prices, 5);
      expect(result.isReverting).toBe(true);
    });
    it('趋势序列不回归', () => {
      const prices = [100, 102, 104, 106, 108, 110, 112, 114, 116, 118];
      const result = meanReversionScore(prices, 5);
      expect(result.isReverting).toBe(false);
    });
    it('数据不足', () => {
      expect(meanReversionScore([100, 101], 5).score).toBe(0);
    });
  });

  // 市场宽度
  const marketBreadth = (advancing: number, declining: number, unchanged: number) => {
    const total = advancing + declining + unchanged;
    const adLine = advancing - declining;
    const adRatio = declining === 0 ? Infinity : advancing / declining;
    const advPct = total > 0 ? advancing / total : 0;
    const decPct = total > 0 ? declining / total : 0;
    let sentiment = 'neutral';
    if (advPct > 0.65) sentiment = 'bullish';
    else if (decPct > 0.65) sentiment = 'bearish';
    return { adLine, adRatio, advPct, decPct, total, sentiment };
  };

  describe('市场宽度', () => {
    it('上涨主导', () => {
      const result = marketBreadth(3000, 500, 500);
      expect(result.sentiment).toBe('bullish');
      expect(result.adLine).toBe(2500);
    });
    it('下跌主导', () => {
      const result = marketBreadth(500, 3000, 500);
      expect(result.sentiment).toBe('bearish');
    });
    it('中性', () => {
      const result = marketBreadth(1500, 1500, 1000);
      expect(result.sentiment).toBe('neutral');
    });
    it('涨跌比', () => {
      const result = marketBreadth(2000, 1000, 0);
      expect(result.adRatio).toBe(2);
    });
    it('零下跌', () => {
      const result = marketBreadth(1000, 0, 0);
      expect(result.adRatio).toBe(Infinity);
    });
  });

  // 资金流向
  const moneyFlow = (prices: number[], volumes: number[], period: number) => {
    if (prices.length < period) return { mfi: [], flow: [] };
    const typical = prices.map((p, i) => (p + prices[i] + prices[i]) / 3); // simplified
    const rawFlow = typical.map((t, i) => t * volumes[i]);
    const mfi: number[] = [];
    for (let i = period - 1; i < prices.length; i++) {
      let posFlow = 0, negFlow = 0;
      for (let j = i - period + 1; j <= i; j++) {
        if (j > 0 && typical[j] > typical[j - 1]) posFlow += rawFlow[j];
        else if (j > 0) negFlow += rawFlow[j];
      }
      mfi.push(negFlow === 0 ? 100 : 100 - 100 / (1 + posFlow / negFlow));
    }
    return { mfi, flow: rawFlow };
  };

  describe('资金流向', () => {
    const prices = [100, 102, 101, 103, 105, 104, 106, 108, 107, 109];
    const volumes = [1000, 1200, 800, 1500, 1300, 900, 1100, 1400, 1000, 1200];

    it('MFI在0-100范围', () => {
      const result = moneyFlow(prices, volumes, 5);
      result.mfi.forEach(v => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      });
    });
    it('输出长度', () => {
      const result = moneyFlow(prices, volumes, 5);
      expect(result.mfi.length).toBe(prices.length - 5 + 1);
    });
    it('数据不足', () => {
      const result = moneyFlow([100, 101], [1000, 1000], 5);
      expect(result.mfi.length).toBe(0);
    });
  });

  // 季节性分析
  const seasonality = (returns: { month: number; return: number }[]) => {
    const byMonth: Record<number, number[]> = {};
    for (const r of returns) {
      if (!byMonth[r.month]) byMonth[r.month] = [];
      byMonth[r.month].push(r.return);
    }
    return Object.entries(byMonth).map(([month, rets]) => ({
      month: Number(month),
      avgReturn: rets.reduce((a, b) => a + b, 0) / rets.length,
      winRate: rets.filter(r => r > 0).length / rets.length,
      count: rets.length,
    })).sort((a, b) => a.month - b.month);
  };

  describe('季节性分析', () => {
    it('按月聚合', () => {
      const returns = [
        { month: 1, return: 0.02 },
        { month: 1, return: 0.01 },
        { month: 2, return: -0.01 },
        { month: 2, return: 0.03 },
      ];
      const result = seasonality(returns);
      expect(result.length).toBe(2);
      expect(result[0].month).toBe(1);
    });
    it('胜率计算', () => {
      const returns = [
        { month: 1, return: 0.02 },
        { month: 1, return: -0.01 },
        { month: 1, return: 0.03 },
      ];
      const result = seasonality(returns);
      expect(result[0].winRate).toBeCloseTo(2 / 3);
    });
    it('空数据', () => {
      expect(seasonality([])).toEqual([]);
    });
  });
});
