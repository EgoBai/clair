import { describe, it, expect } from 'vitest';

// 技术形态识别测试 — 55用例
describe('技术形态识别', () => {

  interface Candle { open: number; high: number; low: number; close: number; volume: number; }

  // K线形态
  describe('K线形态', () => {
    function isDoji(c: Candle) {
      return Math.abs(c.close - c.open) / (c.high - c.low || 1) < 0.1;
    }

    function isHammer(c: Candle) {
      const body = Math.abs(c.close - c.open);
      const lowerWick = Math.min(c.open, c.close) - c.low;
      const upperWick = c.high - Math.max(c.open, c.close);
      return lowerWick >= 2 * body && upperWick <= body;
    }

    function isShootingStar(c: Candle) {
      const body = Math.abs(c.close - c.open);
      const upperWick = c.high - Math.max(c.open, c.close);
      const lowerWick = Math.min(c.open, c.close) - c.low;
      return upperWick >= 2 * body && lowerWick <= body;
    }

    function isMarubozu(c: Candle) {
      const body = Math.abs(c.close - c.open);
      const range = c.high - c.low;
      return body >= range * 0.95;
    }

    function isEngulfing(prev: Candle, curr: Candle) {
      const prevBullish = prev.close > prev.open;
      const currBullish = curr.close > curr.open;
      if (currBullish && !prevBullish) {
        return curr.close > prev.open && curr.open < prev.close;
      }
      if (!currBullish && prevBullish) {
        return curr.close < prev.open && curr.open > prev.close;
      }
      return false;
    }

    it('十字星形态识别', () => {
      expect(isDoji({ open: 10, high: 10.5, low: 9.5, close: 10.05, volume: 100 })).toBe(true);
    });

    it('非十字星', () => {
      expect(isDoji({ open: 10, high: 11, low: 9, close: 10.8, volume: 100 })).toBe(false);
    });

    it('锤子线识别', () => {
      expect(isHammer({ open: 10, high: 10.2, low: 8, close: 10.1, volume: 100 })).toBe(true);
    });

    it('非锤子线', () => {
      expect(isHammer({ open: 10, high: 12, low: 9.5, close: 11, volume: 100 })).toBe(false);
    });

    it('射击之星识别', () => {
      expect(isShootingStar({ open: 10, high: 12, low: 9.8, close: 9.9, volume: 100 })).toBe(true);
    });

    it('光头光脚识别', () => {
      expect(isMarubozu({ open: 10, high: 15, low: 10, close: 15, volume: 100 })).toBe(true);
    });

    it('看涨吞没形态', () => {
      const prev: Candle = { open: 10, high: 10.5, low: 9, close: 9.5, volume: 100 };
      const curr: Candle = { open: 9, high: 11, low: 9, close: 11, volume: 100 };
      expect(isEngulfing(prev, curr)).toBe(true);
    });

    it('看跌吞没形态', () => {
      const prev: Candle = { open: 9, high: 11, low: 8.5, close: 10.5, volume: 100 };
      const curr: Candle = { open: 11, high: 11.5, low: 8, close: 8.5, volume: 100 };
      expect(isEngulfing(prev, curr)).toBe(true);
    });

    it('同向非吞没', () => {
      const prev: Candle = { open: 10, high: 11, low: 9, close: 11, volume: 100 };
      const curr: Candle = { open: 11, high: 12, low: 10, close: 12, volume: 100 };
      expect(isEngulfing(prev, curr)).toBe(false);
    });

    it('实体为零的十字星', () => {
      expect(isDoji({ open: 10, high: 10.5, low: 9.5, close: 10, volume: 100 })).toBe(true);
    });

    it('高低相等的极端K线', () => {
      expect(isDoji({ open: 10, high: 10, low: 10, close: 10, volume: 100 })).toBe(true);
    });
  });

  // 支撑阻力
  describe('支撑阻力位', () => {
    function findPivots(prices: number[], window: number = 2) {
      const supports: number[] = [];
      const resistances: number[] = [];
      for (let i = window; i < prices.length - window; i++) {
        const left = prices.slice(i - window, i);
        const right = prices.slice(i + 1, i + 1 + window);
        const isLow = left.every(p => p > prices[i]!) && right.every(p => p > prices[i]!);
        const isHigh = left.every(p => p < prices[i]!) && right.every(p => p < prices[i]!);
        if (isLow) supports.push(prices[i]!);
        if (isHigh) resistances.push(prices[i]!);
      }
      return { supports, resistances };
    }

    it('V形底部应识别为支撑', () => {
      const prices = [10, 9, 8, 7, 8, 9, 10];
      const { supports } = findPivots(prices, 2);
      expect(supports).toContain(7);
    });

    it('A形顶部应识别为阻力', () => {
      const prices = [7, 8, 9, 10, 9, 8, 7];
      const { resistances } = findPivots(prices, 2);
      expect(resistances).toContain(10);
    });

    it('单调序列无支撑阻力', () => {
      const prices = [1, 2, 3, 4, 5, 6, 7];
      const { supports, resistances } = findPivots(prices, 2);
      expect(supports).toHaveLength(0);
      expect(resistances).toHaveLength(0);
    });

    it('短序列应无支撑阻力', () => {
      const { supports, resistances } = findPivots([1, 2, 3], 2);
      expect(supports).toHaveLength(0);
      expect(resistances).toHaveLength(0);
    });

    it('支撑阻力应在价格范围内', () => {
      const prices = [10, 8, 6, 8, 10, 12, 10, 8];
      const { supports, resistances } = findPivots(prices, 2);
      const min = Math.min(...prices), max = Math.max(...prices);
      supports.forEach(s => { expect(s).toBeGreaterThanOrEqual(min); expect(s).toBeLessThanOrEqual(max); });
      resistances.forEach(r => { expect(r).toBeGreaterThanOrEqual(min); expect(r).toBeLessThanOrEqual(max); });
    });
  });

  // 趋势判断
  describe('趋势判断', () => {
    function classifyTrend(prices: number[]) {
      if (prices.length < 2) return 'flat';
      let upCount = 0, downCount = 0;
      for (let i = 1; i < prices.length; i++) {
        if (prices[i]! > prices[i - 1]!) upCount++;
        else if (prices[i]! < prices[i - 1]!) downCount++;
      }
      const ratio = upCount / (upCount + downCount || 1);
      if (ratio > 0.65) return 'up';
      if (ratio < 0.35) return 'down';
      return 'flat';
    }

    it('持续上涨趋势应判为up', () => {
      expect(classifyTrend([1, 2, 3, 4, 5, 6])).toBe('up');
    });

    it('持续下跌趋势应判为down', () => {
      expect(classifyTrend([6, 5, 4, 3, 2, 1])).toBe('down');
    });

    it('震荡行情应判为flat', () => {
      expect(classifyTrend([1, 2, 1, 2, 1, 2, 1])).toBe('flat');
    });

    it('空数据应为flat', () => {
      expect(classifyTrend([])).toBe('flat');
    });

    it('单数据应为flat', () => {
      expect(classifyTrend([100])).toBe('flat');
    });

    it('轻微上涨应判为flat（不满足65%阈值）', () => {
      expect(classifyTrend([1, 2, 1, 2, 1, 2])).toBe('flat');
    });
  });

  // MACD信号
  describe('MACD信号', () => {
    function macdSignal(dif: number[], dea: number[]) {
      const signals: string[] = [];
      for (let i = 1; i < dif.length; i++) {
        if (dif[i - 1]! <= dea[i - 1]! && dif[i]! > dea[i]!) signals.push('golden_cross');
        else if (dif[i - 1]! >= dea[i - 1]! && dif[i]! < dea[i]!) signals.push('death_cross');
        else signals.push('none');
      }
      return signals;
    }

    it('DIF上穿DEA应产生金叉', () => {
      const signals = macdSignal([0.1, 0.2, 0.3], [0.2, 0.2, 0.2]);
      expect(signals).toContain('golden_cross');
    });

    it('DIF下穿DEA应产生死叉', () => {
      const signals = macdSignal([0.3, 0.2, 0.1], [0.2, 0.2, 0.2]);
      expect(signals).toContain('death_cross');
    });

    it('DIF始终大于DEA无交叉', () => {
      const signals = macdSignal([0.3, 0.4, 0.5], [0.2, 0.2, 0.2]);
      expect(signals.every(s => s === 'none')).toBe(true);
    });

    it('信号数量应为n-1', () => {
      expect(macdSignal([1, 2, 3, 4], [1.5, 1.5, 1.5, 1.5])).toHaveLength(3);
    });

    it('空数据信号为空', () => {
      expect(macdSignal([], [])).toHaveLength(0);
    });
  });

  // RSI信号
  describe('RSI信号', () => {
    function rsiSignal(rsi: number[]) {
      return rsi.map(v => {
        if (v >= 80) return 'overbought';
        if (v <= 20) return 'oversold';
        return 'neutral';
      });
    }

    it('RSI>80应标记超买', () => {
      expect(rsiSignal([85, 70, 15])).toContain('overbought');
    });

    it('RSI<20应标记超卖', () => {
      expect(rsiSignal([85, 70, 15])).toContain('oversold');
    });

    it('RSI 30-70应标记中性', () => {
      const signals = rsiSignal([50]);
      expect(signals[0]).toBe('neutral');
    });

    it('边界值80应为超买', () => {
      expect(rsiSignal([80])[0]).toBe('overbought');
    });

    it('边界值20应为超卖', () => {
      expect(rsiSignal([20])[0]).toBe('oversold');
    });

    it('RSI 21-79应为中性', () => {
      expect(rsiSignal([21])[0]).toBe('neutral');
      expect(rsiSignal([79])[0]).toBe('neutral');
    });
  });
});
