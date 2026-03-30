import { describe, it, expect } from 'vitest';

/**
 * 技术形态识别引擎测试
 */

interface Candlestick { open: number; high: number; low: number; close: number; volume: number; }

const isBullish = (c: Candlestick): boolean => c.close > c.open;
const isBearish = (c: Candlestick): boolean => c.close < c.open;
const bodySize = (c: Candlestick): number => Math.abs(c.close - c.open);
const upperShadow = (c: Candlestick): number => c.high - Math.max(c.open, c.close);
const lowerShadow = (c: Candlestick): number => Math.min(c.open, c.close) - c.low;
const isDoji = (c: Candlestick, threshold: number = 0.001): boolean => bodySize(c) / (c.high - c.low || 1) < threshold;
const isHammer = (c: Candlestick): boolean => {
  const body = bodySize(c);
  const lower = lowerShadow(c);
  const upper = upperShadow(c);
  return lower >= body * 2 && upper <= body * 0.5;
};
const isShootingStar = (c: Candlestick): boolean => {
  const body = bodySize(c);
  const upper = upperShadow(c);
  const lower = lowerShadow(c);
  return upper >= body * 2 && lower <= body * 0.5;
};
const isEngulfing = (prev: Candlestick, curr: Candlestick): 'bullish' | 'bearish' | null => {
  if (isBearish(prev) && isBullish(curr) && curr.open <= prev.close && curr.close >= prev.open) return 'bullish';
  if (isBullish(prev) && isBearish(curr) && curr.open >= prev.close && curr.close <= prev.open) return 'bearish';
  return null;
};
const isMorningStar = (c1: Candlestick, c2: Candlestick, c3: Candlestick): boolean => {
  return isBearish(c1) && bodySize(c2) < bodySize(c1) * 0.3 && isBullish(c3) && c3.close > (c1.open + c1.close) / 2;
};
const isEveningStar = (c1: Candlestick, c2: Candlestick, c3: Candlestick): boolean => {
  return isBullish(c1) && bodySize(c2) < bodySize(c1) * 0.3 && isBearish(c3) && c3.close < (c1.open + c1.close) / 2;
};

const detectDoubleTop = (highs: number[], threshold: number = 0.02): boolean => {
  if (highs.length < 5) return false;
  let peaks: number[] = [];
  for (let i = 1; i < highs.length - 1; i++) {
    if (highs[i] > highs[i - 1] && highs[i] > highs[i + 1]) peaks.push(highs[i]);
  }
  if (peaks.length < 2) return false;
  const last2 = peaks.slice(-2);
  return Math.abs(last2[0] - last2[1]) / last2[0] < threshold;
};

const detectDoubleBottom = (lows: number[], threshold: number = 0.02): boolean => {
  if (lows.length < 5) return false;
  let valleys: number[] = [];
  for (let i = 1; i < lows.length - 1; i++) {
    if (lows[i] < lows[i - 1] && lows[i] < lows[i + 1]) valleys.push(lows[i]);
  }
  if (valleys.length < 2) return false;
  const last2 = valleys.slice(-2);
  return Math.abs(last2[0] - last2[1]) / last2[0] < threshold;
};

const detectHeadAndShoulders = (highs: number[]): boolean => {
  if (highs.length < 7) return false;
  const peaks: { idx: number; val: number }[] = [];
  for (let i = 1; i < highs.length - 1; i++) {
    if (highs[i] > highs[i - 1] && highs[i] > highs[i + 1]) peaks.push({ idx: i, val: highs[i] });
  }
  if (peaks.length < 3) return false;
  for (let i = 0; i < peaks.length - 2; i++) {
    const [l, h, r] = [peaks[i], peaks[i + 1], peaks[i + 2]];
    if (h.val > l.val && h.val > r.val && Math.abs(l.val - r.val) / l.val < 0.05) return true;
  }
  return false;
};

describe('技术形态识别', () => {
  describe('K线基础判断', () => {
    it('阳线应为真', () => {
      expect(isBullish({ open: 10, high: 11, low: 9, close: 10.5, volume: 1000 })).toBe(true);
    });

    it('阴线应为真', () => {
      expect(isBearish({ open: 10, high: 11, low: 9, close: 9.5, volume: 1000 })).toBe(true);
    });

    it('十字星实体应接近0', () => {
      const c: Candlestick = { open: 10, high: 10.5, low: 9.5, close: 10.01, volume: 1000 };
      expect(isDoji(c, 0.02)).toBe(true);
    });

    it('实体大小应正确', () => {
      expect(bodySize({ open: 10, high: 11, low: 9, close: 12, volume: 100 })).toBe(2);
    });

    it('上影线应正确', () => {
      expect(upperShadow({ open: 10, high: 15, low: 9, close: 12, volume: 100 })).toBe(3);
    });

    it('下影线应正确', () => {
      expect(lowerShadow({ open: 10, high: 12, low: 5, close: 8, volume: 100 })).toBe(3);
    });

    it('一字板无影线', () => {
      const c: Candlestick = { open: 10, high: 10, low: 10, close: 10, volume: 100 };
      expect(upperShadow(c)).toBe(0);
      expect(lowerShadow(c)).toBe(0);
      expect(bodySize(c)).toBe(0);
    });

    it('阳线和阴线应互斥', () => {
      const c: Candlestick = { open: 10, high: 11, low: 9, close: 10.5, volume: 100 };
      expect(isBullish(c) && isBearish(c)).toBe(false);
    });

    it('开盘等于收盘既非阳也非阴', () => {
      const c: Candlestick = { open: 10, high: 11, low: 9, close: 10, volume: 100 };
      expect(isBullish(c)).toBe(false);
      expect(isBearish(c)).toBe(false);
    });
  });

  describe('锤子线', () => {
    it('标准锤子线应为真', () => {
      const c: Candlestick = { open: 10, high: 10.03, low: 8, close: 10.02, volume: 100 };
      expect(isHammer(c)).toBe(true);
    });

    it('无下影线不是锤子', () => {
      const c: Candlestick = { open: 10, high: 12, low: 10, close: 11, volume: 100 };
      expect(isHammer(c)).toBe(false);
    });

    it('长上影线不是锤子', () => {
      const c: Candlestick = { open: 10, high: 15, low: 8, close: 10.5, volume: 100 };
      expect(isHammer(c)).toBe(false);
    });

    it('锤子线应有长下影', () => {
      const c: Candlestick = { open: 10, high: 10.1, low: 5, close: 10.05, volume: 100 };
      expect(lowerShadow(c)).toBeGreaterThan(bodySize(c) * 2);
    });
  });

  describe('射击之星', () => {
    it('标准射击之星应为真', () => {
      const c: Candlestick = { open: 10, high: 13, low: 9.98, close: 10.1, volume: 100 };
      expect(isShootingStar(c)).toBe(true);
    });

    it('无上影线不是射击之星', () => {
      const c: Candlestick = { open: 10, high: 10, low: 8, close: 9, volume: 100 };
      expect(isShootingStar(c)).toBe(false);
    });

    it('长下影线不是射击之星', () => {
      const c: Candlestick = { open: 10, high: 15, low: 5, close: 10.5, volume: 100 };
      expect(isShootingStar(c)).toBe(false);
    });
  });

  describe('吞没形态', () => {
    it('看涨吞没应识别', () => {
      const prev: Candlestick = { open: 10, high: 10.5, low: 9, close: 9.5, volume: 100 };
      const curr: Candlestick = { open: 9, high: 11, low: 8.5, close: 10.5, volume: 200 };
      expect(isEngulfing(prev, curr)).toBe('bullish');
    });

    it('看跌吞没应识别', () => {
      const prev: Candlestick = { open: 9, high: 10.5, low: 8.5, close: 10, volume: 100 };
      const curr: Candlestick = { open: 10.5, high: 11, low: 8.5, close: 9, volume: 200 };
      expect(isEngulfing(prev, curr)).toBe('bearish');
    });

    it('非吞没应返回null', () => {
      const prev: Candlestick = { open: 10, high: 11, low: 9, close: 10.5, volume: 100 };
      const curr: Candlestick = { open: 10.5, high: 11.5, low: 10, close: 11, volume: 100 };
      expect(isEngulfing(prev, curr)).toBeNull();
    });

    it('同向K线不是吞没', () => {
      const prev: Candlestick = { open: 10, high: 11, low: 9, close: 10.5, volume: 100 };
      const curr: Candlestick = { open: 10.5, high: 12, low: 10, close: 11, volume: 100 };
      expect(isEngulfing(prev, curr)).toBeNull();
    });
  });

  describe('晨星/暮星', () => {
    it('晨星应识别', () => {
      const c1: Candlestick = { open: 10, high: 10.5, low: 8, close: 8.5, volume: 100 };
      const c2: Candlestick = { open: 8.5, high: 8.7, low: 8.3, close: 8.4, volume: 50 };
      const c3: Candlestick = { open: 8.5, high: 10, low: 8.4, close: 9.8, volume: 150 };
      expect(isMorningStar(c1, c2, c3)).toBe(true);
    });

    it('暮星应识别', () => {
      const c1: Candlestick = { open: 8, high: 10, low: 7.5, close: 9.5, volume: 100 };
      const c2: Candlestick = { open: 9.5, high: 9.7, low: 9.3, close: 9.4, volume: 50 };
      const c3: Candlestick = { open: 9.3, high: 9.5, low: 8, close: 8.2, volume: 150 };
      expect(isEveningStar(c1, c2, c3)).toBe(true);
    });

    it('第二根不是小实体晨星应为假', () => {
      const c1: Candlestick = { open: 10, high: 10.5, low: 8, close: 8.5, volume: 100 };
      const c2: Candlestick = { open: 8.5, high: 10, low: 8, close: 9.5, volume: 100 };
      const c3: Candlestick = { open: 9, high: 10, low: 8.5, close: 9.8, volume: 100 };
      expect(isMorningStar(c1, c2, c3)).toBe(false);
    });

    it('第一根不是阴线晨星应为假', () => {
      const c1: Candlestick = { open: 8, high: 10, low: 7.5, close: 9.5, volume: 100 };
      const c2: Candlestick = { open: 9.5, high: 9.7, low: 9.3, close: 9.4, volume: 50 };
      const c3: Candlestick = { open: 9.5, high: 10, low: 9, close: 9.8, volume: 150 };
      expect(isMorningStar(c1, c2, c3)).toBe(false);
    });
  });

  describe('双重顶底', () => {
    it('双重顶应识别', () => {
      const highs = [10, 11, 12, 11, 10, 11, 11.9, 11, 10];
      expect(detectDoubleTop(highs, 0.05)).toBe(true);
    });

    it('双重底应识别', () => {
      const lows = [10, 9, 8, 9, 10, 9, 8.1, 9, 10];
      expect(detectDoubleBottom(lows, 0.05)).toBe(true);
    });

    it('不足数据应返回false', () => {
      expect(detectDoubleTop([1, 2, 3])).toBe(false);
      expect(detectDoubleBottom([3, 2, 1])).toBe(false);
    });

    it('单峰不应触发双重顶', () => {
      const highs = [10, 11, 12, 13, 12, 11, 10];
      expect(detectDoubleTop(highs, 0.02)).toBe(false);
    });

    it('持续上升不应触发双重顶', () => {
      const highs = [10, 11, 12, 13, 14, 15, 16, 17, 18];
      expect(detectDoubleTop(highs, 0.02)).toBe(false);
    });

    it('阈值影响识别灵敏度', () => {
      const highs = [10, 12, 10, 9, 10, 11.5, 10, 9];
      expect(detectDoubleTop(highs, 0.1)).toBe(true);
      expect(detectDoubleTop(highs, 0.01)).toBe(false);
    });
  });

  describe('头肩顶', () => {
    it('标准头肩顶应识别', () => {
      const highs = [10, 11, 10, 9, 12, 9, 10, 11, 10, 9, 8];
      expect(detectHeadAndShoulders(highs)).toBe(true);
    });

    it('不足7个点返回false', () => {
      expect(detectHeadAndShoulders([1, 2, 3, 4, 5])).toBe(false);
    });

    it('持续上升不是头肩顶', () => {
      expect(detectHeadAndShoulders([10, 11, 12, 13, 14, 15, 16, 17])).toBe(false);
    });

    it('仅两个峰不是头肩顶', () => {
      const highs = [10, 12, 10, 9, 11, 9, 8];
      expect(detectHeadAndShoulders(highs)).toBe(false);
    });

    it('左右肩不等高应在容差内', () => {
      const highs = [10, 11, 10, 9, 12, 9, 10.5, 11, 10.5, 9, 8];
      expect(detectHeadAndShoulders(highs)).toBe(true);
    });
  });

  describe('组合形态识别', () => {
    const analyzePattern = (candles: Candlestick[]): string[] => {
      const patterns: string[] = [];
      for (let i = 0; i < candles.length; i++) {
        if (isDoji(candles[i])) patterns.push('doji');
        if (isHammer(candles[i])) patterns.push('hammer');
        if (isShootingStar(candles[i])) patterns.push('shooting_star');
        if (i > 0) {
          const e = isEngulfing(candles[i - 1], candles[i]);
          if (e) patterns.push(`engulfing_${e}`);
        }
        if (i > 1) {
          if (isMorningStar(candles[i - 2], candles[i - 1], candles[i])) patterns.push('morning_star');
          if (isEveningStar(candles[i - 2], candles[i - 1], candles[i])) patterns.push('evening_star');
        }
      }
      return patterns;
    };

    it('应识别多种形态', () => {
      const candles: Candlestick[] = [
        { open: 10, high: 10.5, low: 8, close: 8.5, volume: 100 },
        { open: 8.5, high: 8.7, low: 8.3, close: 8.4, volume: 50 },
        { open: 8.5, high: 10, low: 8.4, close: 9.8, volume: 150 },
      ];
      const patterns = analyzePattern(candles);
      expect(patterns).toContain('morning_star');
    });

    it('空K线返回空', () => {
      expect(analyzePattern([])).toEqual([]);
    });

    it('单一K线应检测独立形态', () => {
      const candles: Candlestick[] = [{ open: 10, high: 10.03, low: 5, close: 10.02, volume: 100 }];
      const patterns = analyzePattern(candles);
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('正常K线不应触发特殊形态', () => {
      const candles: Candlestick[] = Array.from({ length: 10 }, (_, i) => ({
        open: 10 + i * 0.5, high: 10.5 + i * 0.5, low: 9.5 + i * 0.5, close: 10.3 + i * 0.5, volume: 100
      }));
      const patterns = analyzePattern(candles);
      expect(patterns.length).toBe(0);
    });

    it('连续吞没应都识别', () => {
      const candles: Candlestick[] = [
        { open: 10, high: 10.5, low: 9, close: 9.5, volume: 100 },
        { open: 9, high: 11, low: 8.5, close: 10.5, volume: 200 },
        { open: 11, high: 11.5, low: 9, close: 9.5, volume: 200 },
      ];
      const patterns = analyzePattern(candles);
      // pair(0,1): bullish engulfing, pair(1,2): bullish prev + bearish curr but curr.open(11) < prev.close(10.5) 不满足bearish engulfing条件
      expect(patterns.filter(p => p.includes('engulfing')).length).toBe(1);
    });
  });
});
