import { describe, it, expect } from 'vitest';

// Candlestick pattern detection
interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
}

function bodySize(candle: OHLC): number {
  return Math.abs(candle.close - candle.open);
}

function upperShadow(candle: OHLC): number {
  return candle.high - Math.max(candle.open, candle.close);
}

function lowerShadow(candle: OHLC): number {
  return Math.min(candle.open, candle.close) - candle.low;
}

function isBullish(candle: OHLC): boolean {
  return candle.close > candle.open;
}

function isBearish(candle: OHLC): boolean {
  return candle.close < candle.open;
}

function isDoji(candle: OHLC, threshold: number = 0.001): boolean {
  const range = candle.high - candle.low;
  if (range === 0) return true;
  return bodySize(candle) / range < threshold;
}

function isHammer(candle: OHLC): boolean {
  const body = bodySize(candle);
  const lower = lowerShadow(candle);
  const upper = upperShadow(candle);
  return lower >= 2 * body && upper <= body * 0.3;
}

function isInvertedHammer(candle: OHLC): boolean {
  const body = bodySize(candle);
  const upper = upperShadow(candle);
  const lower = lowerShadow(candle);
  return upper >= 2 * body && lower <= body * 0.3;
}

function isMarubozu(candle: OHLC): boolean {
  const body = bodySize(candle);
  return upperShadow(candle) < body * 0.05 && lowerShadow(candle) < body * 0.05;
}

function isSpinningTop(candle: OHLC): boolean {
  const body = bodySize(candle);
  const range = candle.high - candle.low;
  if (range === 0) return false;
  const upper = upperShadow(candle);
  const lower = lowerShadow(candle);
  return body / range < 0.3 && upper > body && lower > body;
}

function isEngulfing(prev: OHLC, curr: OHLC): 'bullish' | 'bearish' | null {
  if (isBearish(prev) && isBullish(curr) && curr.open <= prev.close && curr.close >= prev.open) {
    return 'bullish';
  }
  if (isBullish(prev) && isBearish(curr) && curr.open >= prev.close && curr.close <= prev.open) {
    return 'bearish';
  }
  return null;
}

function isMorningStar(c1: OHLC, c2: OHLC, c3: OHLC): boolean {
  const avgBody = (bodySize(c1) + bodySize(c3)) / 2;
  return isBearish(c1) && bodySize(c2) < avgBody * 0.3 && isBullish(c3) && c3.close > (c1.open + c1.close) / 2;
}

function isEveningStar(c1: OHLC, c2: OHLC, c3: OHLC): boolean {
  const avgBody = (bodySize(c1) + bodySize(c3)) / 2;
  return isBullish(c1) && bodySize(c2) < avgBody * 0.3 && isBearish(c3) && c3.close < (c1.open + c1.close) / 2;
}

function isThreeWhiteSoldiers(candles: OHLC[]): boolean {
  if (candles.length < 3) return false;
  for (let i = 0; i < 3; i++) {
    if (!isBullish(candles[i])) return false;
    if (i > 0 && candles[i].close <= candles[i - 1].close) return false;
  }
  return true;
}

function isThreeBlackCrows(candles: OHLC[]): boolean {
  if (candles.length < 3) return false;
  for (let i = 0; i < 3; i++) {
    if (!isBearish(candles[i])) return false;
    if (i > 0 && candles[i].close >= candles[i - 1].close) return false;
  }
  return true;
}

function isHarami(prev: OHLC, curr: OHLC): 'bullish' | 'bearish' | null {
  const prevBody = bodySize(prev);
  const currBody = bodySize(curr);
  if (currBody >= prevBody) return null;
  if (isBearish(prev) && isBullish(curr) && curr.open > prev.close && curr.close < prev.open) {
    return 'bullish';
  }
  if (isBullish(prev) && isBearish(curr) && curr.open < prev.close && curr.close > prev.open) {
    return 'bearish';
  }
  return null;
}

describe('K线形态检测', () => {
  describe('基础属性', () => {
    it('应该正确计算实体大小', () => {
      expect(bodySize({ open: 100, high: 110, low: 95, close: 105 })).toBe(5);
      expect(bodySize({ open: 105, high: 110, low: 95, close: 100 })).toBe(5);
    });

    it('应该正确计算上影线', () => {
      expect(upperShadow({ open: 100, high: 110, low: 95, close: 105 })).toBe(5);
    });

    it('应该正确计算下影线', () => {
      expect(lowerShadow({ open: 100, high: 110, low: 95, close: 105 })).toBe(5);
    });

    it('应该判断阳线', () => {
      expect(isBullish({ open: 100, high: 110, low: 95, close: 105 })).toBe(true);
    });

    it('应该判断阴线', () => {
      expect(isBearish({ open: 105, high: 110, low: 95, close: 100 })).toBe(true);
    });
  });

  describe('十字星', () => {
    it('应该识别十字星', () => {
      expect(isDoji({ open: 100, high: 110, low: 90, close: 100.01 })).toBe(true);
    });

    it('大实体不应该识别为十字星', () => {
      expect(isDoji({ open: 100, high: 110, low: 90, close: 108 })).toBe(false);
    });

    it('零范围应该返回true', () => {
      expect(isDoji({ open: 100, high: 100, low: 100, close: 100 })).toBe(true);
    });
  });

  describe('锤子线', () => {
    it('应该识别锤子线', () => {
      expect(isHammer({ open: 95, high: 96, low: 85, close: 96 })).toBe(true);
    });

    it('下影线不够长不应该识别', () => {
      expect(isHammer({ open: 100, high: 105, low: 98, close: 102 })).toBe(false);
    });
  });

  describe('倒锤子线', () => {
    it('应该识别倒锤子线', () => {
      expect(isInvertedHammer({ open: 98, high: 105, low: 97.99, close: 97.99 })).toBe(true);
    });
  });

  describe('光头光脚', () => {
    it('应该识别光头光脚', () => {
      expect(isMarubozu({ open: 100, high: 110, low: 100, close: 110 })).toBe(true);
    });

    it('有影线不应该识别', () => {
      expect(isMarubozu({ open: 100, high: 115, low: 95, close: 110 })).toBe(false);
    });
  });

  describe('纺锤线', () => {
    it('应该识别纺锤线', () => {
      expect(isSpinningTop({ open: 100, high: 110, low: 90, close: 101 })).toBe(true);
    });

    it('大实体不应该识别', () => {
      expect(isSpinningTop({ open: 100, high: 110, low: 90, close: 108 })).toBe(false);
    });
  });

  describe('吞没形态', () => {
    it('应该识别看涨吞没', () => {
      const prev = { open: 105, high: 106, low: 98, close: 100 };
      const curr = { open: 99, high: 108, low: 98, close: 107 };
      expect(isEngulfing(prev, curr)).toBe('bullish');
    });

    it('应该识别看跌吞没', () => {
      const prev = { open: 100, high: 108, low: 99, close: 107 };
      const curr = { open: 108, high: 109, low: 98, close: 99 };
      expect(isEngulfing(prev, curr)).toBe('bearish');
    });

    it('非吞没形态应该返回null', () => {
      const prev = { open: 100, high: 105, low: 95, close: 103 };
      const curr = { open: 102, high: 106, low: 101, close: 104 };
      expect(isEngulfing(prev, curr)).toBeNull();
    });
  });

  describe('启明星/黄昏星', () => {
    it('应该识别启明星', () => {
      const c1 = { open: 110, high: 111, low: 105, close: 106 };
      const c2 = { open: 105, high: 106, low: 104, close: 105 };
      const c3 = { open: 106, high: 112, low: 105, close: 111 };
      expect(isMorningStar(c1, c2, c3)).toBe(true);
    });

    it('应该识别黄昏星', () => {
      const c1 = { open: 100, high: 110, low: 99, close: 109 };
      const c2 = { open: 109, high: 111, low: 108, close: 110 };
      const c3 = { open: 108, high: 109, low: 100, close: 101 };
      expect(isEveningStar(c1, c2, c3)).toBe(true);
    });
  });

  describe('三白兵/三黑鸦', () => {
    it('应该识别三白兵', () => {
      const candles = [
        { open: 100, high: 105, low: 99, close: 104 },
        { open: 104, high: 109, low: 103, close: 108 },
        { open: 108, high: 113, low: 107, close: 112 },
      ];
      expect(isThreeWhiteSoldiers(candles)).toBe(true);
    });

    it('应该识别三黑鸦', () => {
      const candles = [
        { open: 112, high: 113, low: 108, close: 108 },
        { open: 108, high: 109, low: 103, close: 104 },
        { open: 104, high: 105, low: 99, close: 100 },
      ];
      expect(isThreeBlackCrows(candles)).toBe(true);
    });

    it('数据不足应该返回false', () => {
      expect(isThreeWhiteSoldiers([{ open: 1, high: 2, low: 0, close: 1.5 }])).toBe(false);
      expect(isThreeBlackCrows([{ open: 1, high: 2, low: 0, close: 0.5 }])).toBe(false);
    });
  });

  describe('孕线形态', () => {
    it('应该识别看涨孕线', () => {
      const prev = { open: 110, high: 112, low: 100, close: 101 };
      const curr = { open: 103, high: 108, low: 102, close: 107 };
      expect(isHarami(prev, curr)).toBe('bullish');
    });

    it('应该识别看跌孕线', () => {
      const prev = { open: 100, high: 112, low: 99, close: 111 };
      const curr = { open: 109, high: 110, low: 104, close: 105 };
      expect(isHarami(prev, curr)).toBe('bearish');
    });

    it('当前实体大于前一实体应该返回null', () => {
      const prev = { open: 100, high: 102, low: 99, close: 101 };
      const curr = { open: 99, high: 110, low: 98, close: 109 };
      expect(isHarami(prev, curr)).toBeNull();
    });
  });
});
