import { describe, it, expect } from 'vitest';

// ===== K线形态识别完整版 =====
describe('Complete Candlestick Pattern Recognition', () => {
  interface OHLC { open: number; high: number; low: number; close: number; }

  const bodySize = (c: OHLC) => Math.abs(c.close - c.open);
  const upperShadow = (c: OHLC) => c.high - Math.max(c.close, c.open);
  const lowerShadow = (c: OHLC) => Math.min(c.close, c.open) - c.low;
  const range = (c: OHLC) => c.high - c.low;
  const isBullish = (c: OHLC) => c.close > c.open;
  const isBearish = (c: OHLC) => c.close < c.open;
  const isDoji = (c: OHLC) => bodySize(c) < range(c) * 0.1;

  // 单根形态
  const isHammer = (c: OHLC) => {
    const b = bodySize(c), u = upperShadow(c), l = lowerShadow(c), r = range(c);
    return r > 0 && b < r * 0.3 && l > b * 2 && u < b;
  };

  const isShootingStar = (c: OHLC) => {
    const b = bodySize(c), u = upperShadow(c), l = lowerShadow(c), r = range(c);
    return r > 0 && b < r * 0.3 && u > b * 2 && l < b;
  };

  const isMarubozu = (c: OHLC) => {
    const b = bodySize(c), u = upperShadow(c), l = lowerShadow(c);
    return b > 0 && u < b * 0.05 && l < b * 0.05;
  };

  const isSpinningTop = (c: OHLC) => {
    const b = bodySize(c), u = upperShadow(c), l = lowerShadow(c), r = range(c);
    return r > 0 && b < r * 0.3 && u > b && l > b;
  };

  // 双根形态
  const isBullishEngulfing = (prev: OHLC, curr: OHLC) =>
    isBearish(prev) && isBullish(curr) && curr.open <= prev.close && curr.close >= prev.open;

  const isBearishEngulfing = (prev: OHLC, curr: OHLC) =>
    isBullish(prev) && isBearish(curr) && curr.open >= prev.close && curr.close <= prev.open;

  const isPiercingLine = (prev: OHLC, curr: OHLC) => {
    if (!isBearish(prev) || !isBullish(curr)) return false;
    const mid = (prev.open + prev.close) / 2;
    return curr.open < prev.close && curr.close > mid && curr.close < prev.open;
  };

  const isDarkCloudCover = (prev: OHLC, curr: OHLC) => {
    if (!isBullish(prev) || !isBearish(curr)) return false;
    const mid = (prev.open + prev.close) / 2;
    return curr.open > prev.close && curr.close < mid && curr.close > prev.open;
  };

  const isTweezerTop = (prev: OHLC, curr: OHLC) =>
    isBullish(prev) && isBearish(curr) && Math.abs(prev.high - curr.high) < range(prev) * 0.05;

  const isTweezerBottom = (prev: OHLC, curr: OHLC) =>
    isBearish(prev) && isBullish(curr) && Math.abs(prev.low - curr.low) < range(prev) * 0.05;

  // 三根形态
  const isMorningStar = (c1: OHLC, c2: OHLC, c3: OHLC) =>
    isBearish(c1) && bodySize(c2) < range(c1) * 0.15 && isBullish(c3) && c3.close > (c1.open + c1.close) / 2;

  const isEveningStar = (c1: OHLC, c2: OHLC, c3: OHLC) =>
    isBullish(c1) && bodySize(c2) < range(c1) * 0.15 && isBearish(c3) && c3.close < (c1.open + c1.close) / 2;

  const isThreeWhiteSoldiers = (c1: OHLC, c2: OHLC, c3: OHLC) =>
    isBullish(c1) && isBullish(c2) && isBullish(c3) && c2.close > c1.close && c3.close > c2.close;

  const isThreeBlackCrows = (c1: OHLC, c2: OHLC, c3: OHLC) =>
    isBearish(c1) && isBearish(c2) && isBearish(c3) && c2.close < c1.close && c3.close < c2.close;

  const isThreeInsideUp = (prev: OHLC, c1: OHLC, c2: OHLC) =>
    isBearish(prev) && bodySize(c1) < bodySize(prev) && c1.high < prev.open && c1.low > prev.close && isBullish(c2) && c2.close > prev.open;

  const isThreeOutsideUp = (prev: OHLC, c1: OHLC, c2: OHLC) =>
    isBearish(prev) && isBullishEngulfing(prev, c1) && isBullish(c2) && c2.close > c1.close;

  // 批量识别
  const recognizePatterns = (candles: OHLC[]): string[] => {
    const patterns: string[] = [];
    for (let i = 0; i < candles.length; i++) {
      if (isHammer(candles[i])) patterns.push(`锤子线@${i}`);
      if (isShootingStar(candles[i])) patterns.push(`射击之星@${i}`);
      if (isMarubozu(candles[i])) patterns.push(`光头光脚@${i}`);
      if (isDoji(candles[i])) patterns.push(`十字星@${i}`);
      if (isSpinningTop(candles[i])) patterns.push(`纺锤线@${i}`);
      if (i > 0) {
        if (isBullishEngulfing(candles[i - 1], candles[i])) patterns.push(`看涨吞没@${i}`);
        if (isBearishEngulfing(candles[i - 1], candles[i])) patterns.push(`看跌吞没@${i}`);
        if (isPiercingLine(candles[i - 1], candles[i])) patterns.push(`刺透@${i}`);
        if (isDarkCloudCover(candles[i - 1], candles[i])) patterns.push(`乌云盖顶@${i}`);
        if (isTweezerTop(candles[i - 1], candles[i])) patterns.push(`平顶@${i}`);
        if (isTweezerBottom(candles[i - 1], candles[i])) patterns.push(`平底@${i}`);
      }
      if (i > 1) {
        if (isMorningStar(candles[i - 2], candles[i - 1], candles[i])) patterns.push(`启明星@${i}`);
        if (isEveningStar(candles[i - 2], candles[i - 1], candles[i])) patterns.push(`黄昏星@${i}`);
        if (isThreeWhiteSoldiers(candles[i - 2], candles[i - 1], candles[i])) patterns.push(`三白兵@${i}`);
        if (isThreeBlackCrows(candles[i - 2], candles[i - 1], candles[i])) patterns.push(`三黑鸦@${i}`);
      }
    }
    return patterns;
  };

  describe('单根形态', () => {
    it('锤子线', () => {
      expect(isHammer({ open: 10, high: 10.1, low: 9, close: 10.05 })).toBe(true);
    });

    it('非锤子线(上影线长)', () => {
      expect(isHammer({ open: 10, high: 11, low: 9.9, close: 10.1 })).toBe(false);
    });

    it('射击之星', () => {
      expect(isShootingStar({ open: 10, high: 11, low: 9.95, close: 9.9 })).toBe(true);
    });

    it('光头光脚阳线', () => {
      expect(isMarubozu({ open: 10, high: 11, low: 10, close: 11 })).toBe(true);
    });

    it('非光头光脚(有影线)', () => {
      expect(isMarubozu({ open: 10, high: 11.5, low: 9.5, close: 11 })).toBe(false);
    });

    it('十字星', () => {
      expect(isDoji({ open: 10, high: 10.5, low: 9.5, close: 10.02 })).toBe(true);
    });

    it('纺锤线', () => {
      expect(isSpinningTop({ open: 10, high: 11, low: 9, close: 10.2 })).toBe(true);
    });

    it('零范围不识别', () => {
      expect(isHammer({ open: 10, high: 10, low: 10, close: 10 })).toBe(false);
    });
  });

  describe('双根形态', () => {
    it('看涨吞没', () => {
      expect(isBullishEngulfing({ open: 11, high: 11.2, low: 10, close: 10.5 }, { open: 10, high: 11.5, low: 9.8, close: 11.2 })).toBe(true);
    });

    it('看跌吞没', () => {
      expect(isBearishEngulfing({ open: 10, high: 11.5, low: 9.8, close: 11 }, { open: 11.2, high: 11.5, low: 9.5, close: 9.8 })).toBe(true);
    });

    it('刺透形态', () => {
      expect(isPiercingLine({ open: 12, high: 12.2, low: 10, close: 10.5 }, { open: 10, high: 11.5, low: 9.8, close: 11.3 })).toBe(true);
    });

    it('乌云盖顶', () => {
      expect(isDarkCloudCover({ open: 10, high: 12, low: 9.8, close: 11.5 }, { open: 12, high: 12.5, low: 10.5, close: 10.7 })).toBe(true);
    });

    it('平顶', () => {
      expect(isTweezerTop({ open: 10, high: 11, low: 9.5, close: 10.8 }, { open: 10.9, high: 11.02, low: 9.8, close: 10 })).toBe(true);
    });

    it('平底', () => {
      expect(isTweezerBottom({ open: 11, high: 11.5, low: 9.5, close: 10 }, { open: 10.1, high: 10.8, low: 9.48, close: 10.5 })).toBe(true);
    });
  });

  describe('三根形态', () => {
    it('启明星', () => {
      expect(isMorningStar(
        { open: 12, high: 12.2, low: 10, close: 10.5 },
        { open: 10.3, high: 10.6, low: 10.1, close: 10.4 },
        { open: 10.5, high: 12, low: 10.4, close: 11.8 },
      )).toBe(true);
    });

    it('黄昏星', () => {
      expect(isEveningStar(
        { open: 10, high: 12, low: 9.8, close: 11.5 },
        { open: 11.6, high: 11.8, low: 11.4, close: 11.5 },
        { open: 11.4, high: 11.6, low: 10, close: 10.2 },
      )).toBe(true);
    });

    it('三白兵', () => {
      expect(isThreeWhiteSoldiers(
        { open: 10, high: 11, low: 9.8, close: 10.8 },
        { open: 10.9, high: 11.5, low: 10.7, close: 11.2 },
        { open: 11.3, high: 12, low: 11.1, close: 11.8 },
      )).toBe(true);
    });

    it('三黑鸦', () => {
      expect(isThreeBlackCrows(
        { open: 12, high: 12.2, low: 11, close: 11.2 },
        { open: 11.1, high: 11.3, low: 10.5, close: 10.6 },
        { open: 10.5, high: 10.7, low: 9.8, close: 10 },
      )).toBe(true);
    });

    it('非启明星(第二根太大)', () => {
      expect(isMorningStar(
        { open: 12, high: 12.2, low: 10, close: 10.5 },
        { open: 10, high: 11.5, low: 9.5, close: 11 },
        { open: 11, high: 12, low: 10.8, close: 11.8 },
      )).toBe(false);
    });
  });

  describe('批量识别', () => {
    it('混合形态批量识别', () => {
      const candles: OHLC[] = [
        { open: 12, high: 12.2, low: 11, close: 11.2 },
        { open: 10.5, high: 10.6, low: 9, close: 10.05 }, // 锤子
        { open: 10, high: 11.5, low: 9.8, close: 11.2 },  // 看涨吞没
        { open: 11.3, high: 12, low: 11.1, close: 11.8 },  // 三白兵 start
        { open: 11.9, high: 12.5, low: 11.7, close: 12.3 },
      ];
      const patterns = recognizePatterns(candles);
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('空数据无形态', () => {
      expect(recognizePatterns([])).toEqual([]);
    });

    it('单根K线识别', () => {
      const patterns = recognizePatterns([{ open: 10, high: 10.1, low: 9, close: 10.05 }]);
      expect(patterns.some(p => p.includes('锤子线'))).toBe(true);
    });

    it('20根随机K线不崩溃', () => {
      const candles = Array.from({ length: 20 }, () => ({
        open: 100 + Math.random() * 10,
        high: 100 + Math.random() * 15,
        low: 100 - Math.random() * 5,
        close: 100 + Math.random() * 10,
      }));
      const patterns = recognizePatterns(candles);
      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  describe('形态辅助函数', () => {
    it('实体大小', () => {
      expect(bodySize({ open: 10, high: 11, low: 9, close: 10.8 })).toBeCloseTo(0.8);
    });

    it('上影线', () => {
      expect(upperShadow({ open: 10, high: 11, low: 9, close: 10.5 })).toBeCloseTo(0.5);
    });

    it('下影线', () => {
      expect(lowerShadow({ open: 10, high: 11, low: 9, close: 10.5 })).toBeCloseTo(1);
    });

    it('阳线判断', () => {
      expect(isBullish({ open: 10, high: 11, low: 9, close: 10.5 })).toBe(true);
    });

    it('阴线判断', () => {
      expect(isBearish({ open: 10.5, high: 11, low: 9, close: 10 })).toBe(true);
    });

    it('十字星判断', () => {
      expect(isDoji({ open: 10, high: 10.5, low: 9.5, close: 10.02 })).toBe(true);
      expect(isDoji({ open: 10, high: 10.5, low: 9.5, close: 10.4 })).toBe(false);
    });
  });
});
