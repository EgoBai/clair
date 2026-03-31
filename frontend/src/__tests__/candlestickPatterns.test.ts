import { describe, it, expect } from 'vitest';

/**
 * CandlestickPattern / AdvancedCandlestickPatterns 高级K线形态逻辑测试
 */

describe('AdvancedCandlestickPatterns', () => {
  describe('早晨之星', () => {
    const isMorningStar = (
      c1: {open: number, close: number},
      c2: {open: number, close: number},
      c3: {open: number, close: number}
    ) => {
      const c1Bearish = c1.close < c1.open;
      const c2SmallBody = Math.abs(c2.close - c2.open) < Math.abs(c1.close - c1.open) * 0.3;
      const c3Bullish = c3.close > c3.open;
      const c3Engulfs = c3.close > (c1.open + c1.close) / 2;
      return c1Bearish && c2SmallBody && c3Bullish && c3Engulfs;
    };

    it('应该识别早晨之星', () => {
      expect(isMorningStar(
        { open: 110, close: 100 },
        { open: 101, close: 102 },
        { open: 101, close: 112 }
      )).toBe(true);
    });
  });

  describe('黄昏之星', () => {
    const isEveningStar = (
      c1: {open: number, close: number},
      c2: {open: number, close: number},
      c3: {open: number, close: number}
    ) => {
      const c1Bullish = c1.close > c1.open;
      const c2SmallBody = Math.abs(c2.close - c2.open) < Math.abs(c1.close - c1.open) * 0.3;
      const c3Bearish = c3.close < c3.open;
      const c3Engulfs = c3.close < (c1.open + c1.close) / 2;
      return c1Bullish && c2SmallBody && c3Bearish && c3Engulfs;
    };

    it('应该识别黄昏之星', () => {
      expect(isEveningStar(
        { open: 100, close: 110 },
        { open: 111, close: 110 },
        { open: 109, close: 98 }
      )).toBe(true);
    });
  });

  describe('三只乌鸦', () => {
    const isThreeBlackCrows = (candles: {open: number, close: number}[]) => {
      if (candles.length !== 3) return false;
      return candles.every(c => c.close < c.open) &&
             candles[1].close < candles[0].close &&
             candles[2].close < candles[1].close;
    };

    it('应该识别三只乌鸦', () => {
      expect(isThreeBlackCrows([
        { open: 110, close: 105 },
        { open: 106, close: 100 },
        { open: 101, close: 95 },
      ])).toBe(true);
    });

    it('非三只乌鸦应返回 false', () => {
      expect(isThreeBlackCrows([
        { open: 100, close: 105 },
        { open: 106, close: 100 },
        { open: 101, close: 95 },
      ])).toBe(false);
    });
  });

  describe('红三兵', () => {
    const isThreeWhiteSoldiers = (candles: {open: number, close: number}[]) => {
      if (candles.length !== 3) return false;
      return candles.every(c => c.close > c.open) &&
             candles[1].close > candles[0].close &&
             candles[2].close > candles[1].close;
    };

    it('应该识别红三兵', () => {
      expect(isThreeWhiteSoldiers([
        { open: 100, close: 105 },
        { open: 104, close: 110 },
        { open: 109, close: 115 },
      ])).toBe(true);
    });
  });

  describe('乌云盖顶', () => {
    const isDarkCloudCover = (c1: {open: number, close: number, high: number}, c2: {open: number, close: number}) => {
      const c1Bullish = c1.close > c1.open;
      const c2OpensAbove = c2.open > c1.close;
      const c2ClosesBelow = c2.close < (c1.open + c1.close) / 2;
      const c2Bearish = c2.close < c2.open;
      return c1Bullish && c2OpensAbove && c2ClosesBelow && c2Bearish;
    };

    it('应该识别乌云盖顶', () => {
      expect(isDarkCloudCover(
        { open: 100, close: 110, high: 112 },
        { open: 112, close: 103 }
      )).toBe(true);
    });
  });

  describe('刺透形态', () => {
    const isPiercingPattern = (c1: {open: number, close: number}, c2: {open: number, close: number}) => {
      const c1Bearish = c1.close < c1.open;
      const c2OpensBelow = c2.open < c1.close;
      const c2ClosesAbove = c2.close > (c1.open + c1.close) / 2;
      const c2Bullish = c2.close > c2.open;
      return c1Bearish && c2OpensBelow && c2ClosesAbove && c2Bullish;
    };

    it('应该识别刺透形态', () => {
      expect(isPiercingPattern(
        { open: 110, close: 100 },
        { open: 98, close: 107 }
      )).toBe(true);
    });
  });
});
