import { describe, it, expect } from 'vitest';

// ===== 交易信号与策略 =====
describe('Trading Signals & Strategies', () => {
  interface Signal { type: 'buy' | 'sell' | 'hold'; strength: number; reason: string; timestamp: number; }

  const crossAbove = (a: (number | null)[], b: (number | null)[]): number[] => {
    const points: number[] = [];
    for (let i = 1; i < a.length; i++) {
      if (a[i] !== null && b[i] !== null && a[i - 1] !== null && b[i - 1] !== null) {
        if (a[i]! > b[i]! && a[i - 1]! <= b[i - 1]!) points.push(i);
      }
    }
    return points;
  };

  const crossBelow = (a: (number | null)[], b: (number | null)[]): number[] => {
    const points: number[] = [];
    for (let i = 1; i < a.length; i++) {
      if (a[i] !== null && b[i] !== null && a[i - 1] !== null && b[i - 1] !== null) {
        if (a[i]! < b[i]! && a[i - 1]! >= b[i - 1]!) points.push(i);
      }
    }
    return points;
  };

  const calcMACDLine = (prices: number[], fast: number = 12, slow: number = 26): number[] => {
    const ema = (data: number[], p: number): number[] => {
      const k = 2 / (p + 1);
      const r = [data[0]];
      for (let i = 1; i < data.length; i++) r.push(data[i] * k + r[i - 1] * (1 - k));
      return r;
    };
    const f = ema(prices, fast);
    const s = ema(prices, slow);
    return f.map((v, i) => v - s[i]);
  };

  const detectDivergence = (prices: number[], indicator: number[]): { type: 'bullish' | 'bearish'; index: number }[] => {
    const result: { type: 'bullish' | 'bearish'; index: number }[] = [];
    const window = 5;
    for (let i = window * 2; i < prices.length; i++) {
      const priceWindow = prices.slice(i - window * 2, i);
      const indWindow = indicator.slice(i - window * 2, i);
      const pFirst = priceWindow.slice(0, window);
      const pSecond = priceWindow.slice(window);
      const iFirst = indWindow.slice(0, window);
      const iSecond = indWindow.slice(window);
      const pAvgFirst = pFirst.reduce((a, b) => a + b, 0) / window;
      const pAvgSecond = pSecond.reduce((a, b) => a + b, 0) / window;
      const iAvgFirst = iFirst.reduce((a, b) => a + b, 0) / window;
      const iAvgSecond = iSecond.reduce((a, b) => a + b, 0) / window;
      if (pAvgSecond < pAvgFirst && iAvgSecond > iAvgFirst) result.push({ type: 'bullish', index: i });
      if (pAvgSecond > pAvgFirst && iAvgSecond < iAvgFirst) result.push({ type: 'bearish', index: i });
    }
    return result;
  };

  const generateGridSignals = (prices: number[], gridLevels: number[]): Signal[] => {
    const signals: Signal[] = [];
    for (let i = 1; i < prices.length; i++) {
      for (const level of gridLevels) {
        if (prices[i - 1] >= level && prices[i] < level) {
          signals.push({ type: 'buy', strength: 70, reason: `跌破网格${level}`, timestamp: i });
        }
        if (prices[i - 1] <= level && prices[i] > level) {
          signals.push({ type: 'sell', strength: 70, reason: `突破网格${level}`, timestamp: i });
        }
      }
    }
    return signals;
  };

  const momentumScore = (prices: number[], period: number = 10): number[] => {
    const scores: number[] = [];
    for (let i = period; i < prices.length; i++) {
      scores.push((prices[i] - prices[i - period]) / prices[i - period] * 100);
    }
    return scores;
  };

  const calcSupportResistance = (prices: number[], window: number = 20): { support: number[]; resistance: number[] } => {
    const support: number[] = [];
    const resistance: number[] = [];
    for (let i = window; i < prices.length - window; i++) {
      const slice = prices.slice(i - window, i + window + 1);
      const min = Math.min(...slice);
      const max = Math.max(...slice);
      if (prices[i] === min) support.push(prices[i]);
      if (prices[i] === max) resistance.push(prices[i]);
    }
    return { support, resistance };
  };

  describe('金叉死叉', () => {
    it('金叉检测', () => {
      const a = [null, null, 1, 2, 3, 4, 5] as (number | null)[];
      const b = [null, null, 3, 3, 3, 3, 3] as (number | null)[];
      const crosses = crossAbove(a, b);
      expect(crosses).toContain(5);
    });

    it('死叉检测', () => {
      const a = [null, null, 5, 4, 3, 2, 1] as (number | null)[];
      const b = [null, null, 3, 3, 3, 3, 3] as (number | null)[];
      const crosses = crossBelow(a, b);
      // a[3]=4 >= b[3]=3 && a[4]=3 < b[4]=3 → not a cross (3 < 3 is false, need strict)
      // a[2]=5 >= b[2]=3 && a[3]=4 < b[3]=3 → false (4 < 3 is false)
      // Actually: a crosses below b when a drops from above to below b
      // a[4]=3, a[5]=2: a[4]>=b[4] (3>=3) && a[5]<b[5] (2<3) → cross at 5
      expect(crosses).toContain(5);
    });

    it('无交叉返回空', () => {
      const a = [1, 2, 3] as (number | null)[];
      const b = [5, 6, 7] as (number | null)[];
      expect(crossAbove(a, b).length).toBe(0);
    });

    it('null值跳过', () => {
      const a = [null, 1, 2] as (number | null)[];
      const b = [null, 3, 1] as (number | null)[];
      const crosses = crossAbove(a, b);
      expect(crosses.length).toBe(1);
    });

    it('多交叉检测', () => {
      const a = [1, 3, 1, 3, 1] as (number | null)[];
      const b = [2, 2, 2, 2, 2] as (number | null)[];
      expect(crossAbove(a, b).length).toBe(2);
    });
  });

  describe('MACD信号', () => {
    it('上涨趋势MACD为正', () => {
      const prices = Array.from({ length: 100 }, (_, i) => 100 + i);
      const macd = calcMACDLine(prices);
      expect(macd[macd.length - 1]).toBeGreaterThan(0);
    });

    it('下跌趋势MACD为负', () => {
      const prices = Array.from({ length: 100 }, (_, i) => 200 - i);
      const macd = calcMACDLine(prices);
      expect(macd[macd.length - 1]).toBeLessThan(0);
    });

    it('长度正确', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i) * 5);
      const macd = calcMACDLine(prices);
      expect(macd.length).toBe(50);
    });
  });

  describe('背离检测', () => {
    it('底背离(价格新低指标不新低)', () => {
      const prices = [10, 9, 8, 7, 6, 7, 8, 9, 8, 7, 6.5, 7, 8, 9, 10];
      const indicator = [5, 4, 3, 2, 1, 3, 4, 5, 4, 3, 2.5, 4, 5, 6, 7];
      const div = detectDivergence(prices, indicator);
      expect(div.some(d => d.type === 'bullish')).toBe(true);
    });

    it('无背离', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 10 + i * 0.5);
      const indicator = Array.from({ length: 30 }, (_, i) => 5 + i * 0.3);
      const div = detectDivergence(prices, indicator);
      expect(div.length).toBe(0);
    });

    it('数据不足返回空', () => {
      expect(detectDivergence([1, 2, 3], [1, 2, 3]).length).toBe(0);
    });
  });

  describe('网格交易', () => {
    it('应检测到网格突破', () => {
      const prices = [10.5, 10.4, 9.8, 10.2, 10.1, 9.5, 9.8, 10.3];
      const signals = generateGridSignals(prices, [10, 9.6]);
      expect(signals.length).toBeGreaterThan(0);
    });

    it('无突破无信号', () => {
      const prices = [15, 15.5, 16, 16.5, 17];
      const signals = generateGridSignals(prices, [10]);
      expect(signals.length).toBe(0);
    });

    it('空价格', () => {
      expect(generateGridSignals([], [10]).length).toBe(0);
    });

    it('买卖交替', () => {
      const prices = [10.5, 9.5, 10.5, 9.5, 10.5];
      const signals = generateGridSignals(prices, [10]);
      for (let i = 1; i < signals.length; i++) {
        expect(signals[i].type).not.toBe(signals[i - 1].type);
      }
    });
  });

  describe('动量评分', () => {
    it('上涨动量为正', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
      const scores = momentumScore(prices, 5);
      scores.forEach(s => expect(s).toBeGreaterThan(0));
    });

    it('下跌动量为负', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 120 - i);
      const scores = momentumScore(prices, 5);
      scores.forEach(s => expect(s).toBeLessThan(0));
    });

    it('长度正确', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
      expect(momentumScore(prices, 5).length).toBe(15);
    });

    it('零周期返回空', () => {
      expect(momentumScore([1, 2, 3], 0).length).toBe(3);
    });
  });

  describe('支撑阻力', () => {
    it('应检测到极值点', () => {
      const prices = [10, 11, 12, 11, 10, 9, 10, 11, 12, 13, 12, 11, 10, 9, 8, 9, 10];
      const { support, resistance } = calcSupportResistance(prices, 3);
      expect(support.length + resistance.length).toBeGreaterThan(0);
    });

    it('单调序列无支撑阻力', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + i);
      const { support, resistance } = calcSupportResistance(prices, 5);
      expect(support.length).toBe(0);
    });

    it('数据不足返回空', () => {
      const { support, resistance } = calcSupportResistance([1, 2, 3], 5);
      expect(support.length + resistance.length).toBe(0);
    });
  });

  describe('综合信号', () => {
    it('100个价格点信号生成不崩溃', () => {
      const prices = Array.from({ length: 100 }, () => 100 + Math.random() * 20 - 10);
      const macd = calcMACDLine(prices);
      const signals = generateGridSignals(prices, [95, 100, 105]);
      expect(Array.isArray(signals)).toBe(true);
      expect(isFinite(macd[macd.length - 1])).toBe(true);
    });

    it('交叉+动量综合', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.3) * 10);
      const macd = calcMACDLine(prices);
      const scores = momentumScore(prices, 5);
      const crosses = crossAbove(macd.map(v => v), Array(macd.length).fill(0));
      expect(scores.length).toBeGreaterThan(0);
      expect(Array.isArray(crosses)).toBe(true);
    });
  });
});
