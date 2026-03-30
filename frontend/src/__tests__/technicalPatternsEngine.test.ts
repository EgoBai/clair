import { describe, it, expect } from 'vitest';

describe('Technical Patterns Engine', () => {
  // K线形态
  const isDoji = (open: number, close: number, high: number, low: number, threshold: number = 0.001): boolean => {
    const body = Math.abs(close - open);
    const range = high - low;
    return range > 0 && body / range < threshold;
  };

  const isHammer = (open: number, close: number, high: number, low: number): boolean => {
    const body = Math.abs(close - open);
    const lowerWick = Math.min(open, close) - low;
    const upperWick = high - Math.max(open, close);
    return lowerWick > body * 2 && upperWick < body * 0.5;
  };

  const isEngulfing = (prev: { open: number; close: number }, curr: { open: number; close: number }): 'bullish' | 'bearish' | null => {
    const prevBullish = prev.close > prev.open;
    const currBullish = curr.close > curr.open;
    if (!prevBullish && currBullish && curr.open <= prev.close && curr.close >= prev.open) return 'bullish';
    if (prevBullish && !currBullish && curr.open >= prev.close && curr.close <= prev.open) return 'bearish';
    return null;
  };

  const isMorningStar = (candles: { open: number; close: number }[]): boolean => {
    if (candles.length < 3) return false;
    const [c1, c2, c3] = candles;
    return c1.close < c1.open && Math.abs(c2.close - c2.open) < Math.abs(c1.close - c1.open) * 0.3 && c3.close > c3.open && c3.close > (c1.open + c1.close) / 2;
  };

  describe('K线形态', () => {
    it('十字星', () => expect(isDoji(100, 100.005, 105, 95)).toBe(true));
    it('非十字星', () => expect(isDoji(100, 110, 115, 95)).toBe(false));
    it('锤子线', () => expect(isHammer(100, 101, 101.4, 90)).toBe(true));
    it('非锤子线', () => expect(isHammer(100, 90, 110, 80)).toBe(false));
    it('看涨吞没', () => {
      expect(isEngulfing({ open: 100, close: 90 }, { open: 88, close: 102 })).toBe('bullish');
    });
    it('看跌吞没', () => {
      expect(isEngulfing({ open: 90, close: 100 }, { open: 102, close: 88 })).toBe('bearish');
    });
    it('无吞没', () => {
      expect(isEngulfing({ open: 100, close: 105 }, { open: 103, close: 108 })).toBeNull();
    });
    it('启明星', () => {
      expect(isMorningStar([
        { open: 100, close: 90 },
        { open: 89, close: 89.5 },
        { open: 90, close: 98 },
      ])).toBe(true);
    });
    it('非启明星', () => {
      expect(isMorningStar([
        { open: 100, close: 110 },
        { open: 111, close: 112 },
        { open: 113, close: 114 },
      ])).toBe(false);
    });
    it('数据不足', () => {
      expect(isMorningStar([{ open: 1, close: 2 }])).toBe(false);
    });
  });

  // 趋势线
  const linearRegression = (x: number[], y: number[]): { slope: number; intercept: number; r2: number } => {
    const n = x.length;
    const mx = x.reduce((a, b) => a + b, 0) / n;
    const my = y.reduce((a, b) => a + b, 0) / n;
    let ssxy = 0, ssxx = 0, ssyy = 0;
    for (let i = 0; i < n; i++) {
      ssxy += (x[i] - mx) * (y[i] - my);
      ssxx += (x[i] - mx) ** 2;
      ssyy += (y[i] - my) ** 2;
    }
    const slope = ssxx === 0 ? 0 : ssxy / ssxx;
    const intercept = my - slope * mx;
    const r2 = ssyy === 0 ? 1 : (ssxy ** 2) / (ssxx * ssyy);
    return { slope, intercept, r2 };
  };

  describe('趋势线', () => {
    it('完美线性', () => {
      const { r2 } = linearRegression([1, 2, 3], [2, 4, 6]);
      expect(r2).toBeCloseTo(1);
    });
    it('斜率正', () => {
      const { slope } = linearRegression([1, 2, 3], [1, 3, 5]);
      expect(slope).toBeCloseTo(2);
    });
    it('截距', () => {
      const { intercept } = linearRegression([0, 1, 2], [5, 7, 9]);
      expect(intercept).toBeCloseTo(5);
    });
    it('水平线斜率零', () => {
      const { slope } = linearRegression([1, 2, 3], [5, 5, 5]);
      expect(slope).toBeCloseTo(0);
    });
    it('R²范围', () => {
      const { r2 } = linearRegression([1, 2, 3, 4], [1, 3, 2, 4]);
      expect(r2).toBeGreaterThanOrEqual(0);
      expect(r2).toBeLessThanOrEqual(1);
    });
  });

  // 支撑阻力
  const findSupportResistance = (prices: number[], window: number = 3): { support: number[]; resistance: number[] } => {
    const support: number[] = [];
    const resistance: number[] = [];
    for (let i = window; i < prices.length - window; i++) {
      const left = prices.slice(i - window, i);
      const right = prices.slice(i + 1, i + window + 1);
      if (prices[i] <= Math.min(...left) && prices[i] <= Math.min(...right)) support.push(i);
      if (prices[i] >= Math.max(...left) && prices[i] >= Math.max(...right)) resistance.push(i);
    }
    return { support, resistance };
  };

  describe('支撑阻力', () => {
    it('找到支撑', () => {
      const { support } = findSupportResistance([5, 4, 3, 2, 3, 4, 5, 4, 3, 2, 3], 2);
      expect(support.length).toBeGreaterThan(0);
    });
    it('找到阻力', () => {
      const { resistance } = findSupportResistance([2, 3, 4, 5, 4, 3, 2, 3, 4, 5, 4], 2);
      expect(resistance.length).toBeGreaterThan(0);
    });
    it('单调无支撑阻力', () => {
      const { support, resistance } = findSupportResistance([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(support.length).toBe(0);
      expect(resistance.length).toBe(0);
    });
    it('窗口限制', () => {
      const { support } = findSupportResistance([3, 2, 3], 1);
      expect(support.length).toBeGreaterThan(0);
    });
  });

  // 背离检测
  const detectDivergence = (prices: number[], indicator: number[]): { type: 'bullish' | 'bearish' | null; index: number }[] => {
    const results: { type: 'bullish' | 'bearish' | null; index: number }[] = [];
    for (let i = 2; i < prices.length; i++) {
      if (prices[i] < prices[i - 2] && indicator[i] > indicator[i - 2]) {
        results.push({ type: 'bullish', index: i });
      } else if (prices[i] > prices[i - 2] && indicator[i] < indicator[i - 2]) {
        results.push({ type: 'bearish', index: i });
      }
    }
    return results;
  };

  describe('背离检测', () => {
    it('底背离', () => {
      const r = detectDivergence([10, 9, 8], [20, 25, 30]);
      expect(r[0].type).toBe('bullish');
    });
    it('顶背离', () => {
      const r = detectDivergence([8, 9, 10], [30, 25, 20]);
      expect(r[0].type).toBe('bearish');
    });
    it('无背离', () => {
      const r = detectDivergence([1, 2, 3], [10, 20, 30]);
      expect(r.length).toBe(0);
    });
    it('长度不足', () => {
      expect(detectDivergence([1, 2], [1, 2]).length).toBe(0);
    });
  });

  // 形态评分
  const patternScore = (patterns: { name: string; reliability: number; direction: 'bullish' | 'bearish' }[]): { bullish: number; bearish: number } => {
    let bullish = 0, bearish = 0;
    for (const p of patterns) {
      if (p.direction === 'bullish') bullish += p.reliability;
      else bearish += p.reliability;
    }
    return { bullish, bearish };
  };

  describe('形态评分', () => {
    it('多头评分', () => {
      const { bullish } = patternScore([
        { name: '锤子', reliability: 0.7, direction: 'bullish' },
        { name: '吞没', reliability: 0.8, direction: 'bullish' },
      ]);
      expect(bullish).toBeCloseTo(1.5);
    });
    it('空头评分', () => {
      const { bearish } = patternScore([
        { name: '黄昏星', reliability: 0.9, direction: 'bearish' },
      ]);
      expect(bearish).toBeCloseTo(0.9);
    });
    it('混合评分', () => {
      const { bullish, bearish } = patternScore([
        { name: '锤子', reliability: 0.7, direction: 'bullish' },
        { name: '射击星', reliability: 0.6, direction: 'bearish' },
      ]);
      expect(bullish).toBeGreaterThan(0);
      expect(bearish).toBeGreaterThan(0);
    });
    it('空形态', () => {
      const { bullish, bearish } = patternScore([]);
      expect(bullish).toBe(0);
      expect(bearish).toBe(0);
    });
  });

  // 成交量形态
  const volumeBreakout = (prices: number[], volumes: number[], lookback: number = 20): boolean[] => {
    const signals: boolean[] = [];
    for (let i = lookback; i < prices.length; i++) {
      const avgVol = volumes.slice(i - lookback, i).reduce((a, b) => a + b, 0) / lookback;
      const priceUp = prices[i] > prices[i - 1];
      signals.push(priceUp && volumes[i] > avgVol * 1.5);
    }
    return signals;
  };

  describe('成交量形态', () => {
    it('放量突破', () => {
      const prices = Array(25).fill(100); prices[24] = 105;
      const vols = Array(25).fill(100); vols[24] = 200;
      const signals = volumeBreakout(prices, vols);
      expect(signals[signals.length - 1]).toBe(true);
    });
    it('缩量上涨不触发', () => {
      const prices = Array(25).fill(100); prices[24] = 105;
      const vols = Array(25).fill(100); vols[24] = 50;
      const signals = volumeBreakout(prices, vols);
      expect(signals[signals.length - 1]).toBe(false);
    });
    it('下跌不触发', () => {
      const prices = Array(25).fill(100); prices[24] = 95;
      const vols = Array(25).fill(100); vols[24] = 200;
      const signals = volumeBreakout(prices, vols);
      expect(signals[signals.length - 1]).toBe(false);
    });
    it('结果长度', () => {
      expect(volumeBreakout(Array(30).fill(1), Array(30).fill(1)).length).toBe(10);
    });
  });
});
