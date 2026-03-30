import { describe, it, expect } from 'vitest';

// Candlestick pattern detection
describe('Candlestick Pattern Detection', () => {
  interface Candle {
    open: number; high: number; low: number; close: number; volume: number;
  }

  const isDoji = (c: Candle, threshold = 0.1) => {
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    return range > 0 && body / range < threshold;
  };

  const isHammer = (c: Candle) => {
    const body = Math.abs(c.close - c.open);
    const lowerShadow = Math.min(c.open, c.close) - c.low;
    const upperShadow = c.high - Math.max(c.open, c.close);
    const range = c.high - c.low;
    return range > 0 && lowerShadow >= 2 * body && upperShadow <= body * 0.3;
  };

  const isEngulfing = (prev: Candle, curr: Candle, bullish: boolean) => {
    if (bullish) {
      return prev.close < prev.open && curr.close > curr.open &&
        curr.open <= prev.close && curr.close >= prev.open;
    } else {
      return prev.close > prev.open && curr.close < curr.open &&
        curr.open >= prev.close && curr.close <= prev.open;
    }
  };

  const isMarubozu = (c: Candle, threshold = 0.05) => {
    const body = Math.abs(c.close - c.open);
    const upperShadow = c.high - Math.max(c.open, c.close);
    const lowerShadow = Math.min(c.open, c.close) - c.low;
    const range = c.high - c.low;
    return range > 0 && body / range > (1 - threshold) * 2 / (2 + threshold);
  };

  const isSpinningTop = (c: Candle) => {
    const body = Math.abs(c.close - c.open);
    const upperShadow = c.high - Math.max(c.open, c.close);
    const lowerShadow = Math.min(c.open, c.close) - c.low;
    const range = c.high - c.low;
    return range > 0 && body / range < 0.3 &&
      upperShadow > body && lowerShadow > body;
  };

  describe('Doji', () => {
    it('should detect perfect doji', () => {
      expect(isDoji({ open: 10, high: 11, low: 9, close: 10, volume: 1000 })).toBe(true);
    });

    it('should detect near doji', () => {
      expect(isDoji({ open: 10, high: 11, low: 9, close: 10.05, volume: 1000 })).toBe(true);
    });

    it('should not detect doji with large body', () => {
      expect(isDoji({ open: 10, high: 11, low: 9, close: 10.9, volume: 1000 })).toBe(false);
    });

    it('should handle zero range', () => {
      expect(isDoji({ open: 10, high: 10, low: 10, close: 10, volume: 1000 })).toBe(false);
    });

    it('should handle doji with no shadows', () => {
      expect(isDoji({ open: 10, high: 10, low: 10, close: 10, volume: 0 })).toBe(false);
    });

    it('should detect doji with long shadows', () => {
      expect(isDoji({ open: 10, high: 15, low: 5, close: 10.1, volume: 5000 })).toBe(true);
    });
  });

  describe('Hammer', () => {
    it('should detect hammer', () => {
      // body=0.1, lowerShadow=2, upperShadow=0.02, 2 >= 0.2 ✓, 0.02 <= 0.03 ✓
      expect(isHammer({ open: 10, high: 10.12, low: 8, close: 10.1, volume: 1000 })).toBe(true);
    });

    it('should not detect hammer with large upper shadow', () => {
      expect(isHammer({ open: 10, high: 12, low: 8, close: 10.1, volume: 1000 })).toBe(false);
    });

    it('should not detect hammer with small lower shadow', () => {
      expect(isHammer({ open: 10, high: 11, low: 9.5, close: 10.1, volume: 1000 })).toBe(false);
    });

    it('should handle inverted hammer not detected', () => {
      expect(isHammer({ open: 10, high: 12, low: 10, close: 9.9, volume: 1000 })).toBe(false);
    });

    it('should handle doji not as hammer', () => {
      expect(isHammer({ open: 10, high: 11, low: 9, close: 10, volume: 1000 })).toBe(false);
    });
  });

  describe('Engulfing', () => {
    it('should detect bullish engulfing', () => {
      const prev = { open: 10, high: 10.5, low: 9, close: 9.5, volume: 1000 };
      const curr = { open: 9, high: 11, low: 8.5, close: 10.5, volume: 2000 };
      expect(isEngulfing(prev, curr, true)).toBe(true);
    });

    it('should detect bearish engulfing', () => {
      const prev = { open: 9, high: 11, low: 8.5, close: 10.5, volume: 1000 };
      const curr = { open: 11, high: 11.5, low: 8.5, close: 9, volume: 2000 };
      expect(isEngulfing(prev, curr, false)).toBe(true);
    });

    it('should not detect when prev is same direction', () => {
      const prev = { open: 9, high: 11, low: 8.5, close: 10.5, volume: 1000 };
      const curr = { open: 10, high: 12, low: 9, close: 11, volume: 2000 };
      expect(isEngulfing(prev, curr, true)).toBe(false);
    });

    it('should not detect when no engulfing', () => {
      const prev = { open: 10, high: 10.5, low: 9, close: 9.5, volume: 1000 };
      const curr = { open: 9.5, high: 10, low: 9, close: 9.8, volume: 1000 };
      expect(isEngulfing(prev, curr, true)).toBe(false);
    });
  });

  describe('Marubozu', () => {
    it('should detect bullish marubozu', () => {
      expect(isMarubozu({ open: 10, high: 15, low: 10, close: 15, volume: 5000 })).toBe(true);
    });

    it('should detect bearish marubozu', () => {
      expect(isMarubozu({ open: 15, high: 15, low: 10, close: 10, volume: 5000 })).toBe(true);
    });

    it('should not detect with shadows', () => {
      expect(isMarubozu({ open: 10, high: 16, low: 9, close: 15, volume: 5000 })).toBe(false);
    });

    it('should not detect doji as marubozu', () => {
      expect(isMarubozu({ open: 10, high: 11, low: 9, close: 10, volume: 1000 })).toBe(false);
    });
  });

  describe('Spinning Top', () => {
    it('should detect spinning top', () => {
      expect(isSpinningTop({ open: 10, high: 12, low: 8, close: 10.2, volume: 1000 })).toBe(true);
    });

    it('should not detect marubozu as spinning top', () => {
      expect(isSpinningTop({ open: 10, high: 15, low: 10, close: 15, volume: 5000 })).toBe(false);
    });

    it('should not detect with small shadows', () => {
      expect(isSpinningTop({ open: 10, high: 10.3, low: 9.8, close: 10.2, volume: 1000 })).toBe(false);
    });

    it('should handle zero range', () => {
      expect(isSpinningTop({ open: 10, high: 10, low: 10, close: 10, volume: 0 })).toBe(false);
    });
  });

  // Pattern sequence analysis
  describe('Pattern Sequence Analysis', () => {
    const findPatternSequence = (candles: Candle[], patternFn: (c: Candle) => boolean) => {
      return candles.reduce<number[]>((acc, c, i) => {
        if (patternFn(c)) acc.push(i);
        return acc;
      }, []);
    };

    it('should find all doji in sequence', () => {
      const candles: Candle[] = [
        { open: 10, high: 11, low: 9, close: 10, volume: 1000 },
        { open: 10, high: 12, low: 8, close: 11, volume: 2000 },
        { open: 11, high: 12, low: 10, close: 11.05, volume: 1500 },
      ];
      const dojis = findPatternSequence(candles, c => isDoji(c));
      expect(dojis).toContain(0);
      expect(dojis).toContain(2);
    });

    it('should return empty when no patterns', () => {
      const candles: Candle[] = [
        { open: 10, high: 15, low: 10, close: 15, volume: 5000 },
        { open: 15, high: 20, low: 15, close: 20, volume: 5000 },
      ];
      expect(findPatternSequence(candles, c => isDoji(c))).toEqual([]);
    });

    it('should handle empty candles', () => {
      expect(findPatternSequence([], c => isDoji(c))).toEqual([]);
    });

    it('should find all hammers', () => {
      // isHammer: body = |close-open|, lowerShadow = min(open,close)-low, upperShadow = high-max(open,close)
      // needs: lowerShadow >= 2*body AND upperShadow <= body*0.3
      const candles: Candle[] = [
        { open: 10, high: 10.003, low: 8, close: 10.01, volume: 1000 },  // body=0.01, lower=2, upper=0 <= 0.003
        { open: 12, high: 12.003, low: 10, close: 12.01, volume: 1000 }, // body=0.01, lower=2, upper=0 <= 0.003
      ];
      const hammers = findPatternSequence(candles, c => isHammer(c));
      expect(hammers).toHaveLength(2);
    });
  });

  // Three-candle patterns
  describe('Three-Candle Patterns', () => {
    const isMorningStar = (c1: Candle, c2: Candle, c3: Candle) => {
      const body1 = Math.abs(c1.close - c1.open);
      const body2 = Math.abs(c2.close - c2.open);
      const body3 = Math.abs(c3.close - c3.open);
      const range1 = c1.high - c1.low;
      return c1.close < c1.open && // bearish
        body2 < body1 * 0.3 && // small body
        c3.close > c3.open && // bullish
        c3.close > (c1.open + c1.close) / 2 && // closes above midpoint
        body3 > body1 * 0.5; // significant third candle
    };

    it('should detect morning star', () => {
      const c1 = { open: 15, high: 15.5, low: 9, close: 10, volume: 5000 };
      const c2 = { open: 10.1, high: 10.5, low: 9.5, close: 10.3, volume: 1000 };
      const c3 = { open: 10.5, high: 16, low: 10, close: 15, volume: 6000 };
      expect(isMorningStar(c1, c2, c3)).toBe(true);
    });

    it('should not detect when third is bearish', () => {
      const c1 = { open: 15, high: 15.5, low: 9, close: 10, volume: 5000 };
      const c2 = { open: 10.1, high: 10.5, low: 9.5, close: 10.3, volume: 1000 };
      const c3 = { open: 10.5, high: 11, low: 9, close: 9.5, volume: 3000 };
      expect(isMorningStar(c1, c2, c3)).toBe(false);
    });

    it('should not detect when first is bullish', () => {
      const c1 = { open: 10, high: 15, low: 9.5, close: 15, volume: 5000 };
      const c2 = { open: 15.1, high: 15.5, low: 14.5, close: 15.3, volume: 1000 };
      const c3 = { open: 15.5, high: 20, low: 15, close: 19, volume: 6000 };
      expect(isMorningStar(c1, c2, c3)).toBe(false);
    });

    it('should handle small third candle', () => {
      const c1 = { open: 15, high: 15.5, low: 9, close: 10, volume: 5000 };
      const c2 = { open: 10.1, high: 10.5, low: 9.5, close: 10.3, volume: 1000 };
      const c3 = { open: 10.5, high: 11, low: 10, close: 10.8, volume: 500 };
      expect(isMorningStar(c1, c2, c3)).toBe(false);
    });
  });

  // Volume confirmation
  describe('Volume Confirmation', () => {
    const volumeConfirms = (candle: Candle, avgVolume: number, multiplier = 1.5) => {
      return candle.volume > avgVolume * multiplier;
    };

    it('should confirm high volume', () => {
      expect(volumeConfirms({ open: 10, high: 11, low: 9, close: 10.5, volume: 2000 }, 1000)).toBe(true);
    });

    it('should not confirm low volume', () => {
      expect(volumeConfirms({ open: 10, high: 11, low: 9, close: 10.5, volume: 1000 }, 1000)).toBe(false);
    });

    it('should handle custom multiplier', () => {
      expect(volumeConfirms({ open: 10, high: 11, low: 9, close: 10.5, volume: 3000 }, 1000, 2)).toBe(true);
      expect(volumeConfirms({ open: 10, high: 11, low: 9, close: 10.5, volume: 1500 }, 1000, 2)).toBe(false);
    });

    it('should handle zero avg volume', () => {
      expect(volumeConfirms({ open: 10, high: 11, low: 9, close: 10.5, volume: 1 }, 0)).toBe(true);
    });

    it('should handle zero volume', () => {
      expect(volumeConfirms({ open: 10, high: 11, low: 9, close: 10.5, volume: 0 }, 1000)).toBe(false);
    });

    it('should handle exact threshold', () => {
      expect(volumeConfirms({ open: 10, high: 11, low: 9, close: 10.5, volume: 1500 }, 1000)).not.toBe(true);
    });
  });

  // Support and resistance levels
  describe('Support and Resistance', () => {
    const findLevels = (prices: number[], lookback = 3) => {
      const supports: number[] = [];
      const resistances: number[] = [];
      for (let i = lookback; i < prices.length - lookback; i++) {
        const slice = prices.slice(i - lookback, i + lookback + 1);
        const mid = prices[i];
        if (mid === Math.min(...slice)) supports.push(mid);
        if (mid === Math.max(...slice)) resistances.push(mid);
      }
      return { supports, resistances };
    };

    it('should find support levels', () => {
      const prices = [10, 9, 8, 7, 8, 9, 10];
      const { supports } = findLevels(prices, 2);
      expect(supports).toContain(7);
    });

    it('should find resistance levels', () => {
      const prices = [5, 6, 7, 8, 7, 6, 5];
      const { resistances } = findLevels(prices, 2);
      expect(resistances).toContain(8);
    });

    it('should handle insufficient data', () => {
      const { supports, resistances } = findLevels([1, 2, 3], 5);
      expect(supports).toHaveLength(0);
      expect(resistances).toHaveLength(0);
    });

    it('should find multiple levels', () => {
      const prices = [10, 8, 10, 8, 10, 8, 10];
      const { supports } = findLevels(prices, 1);
      expect(supports.length).toBeGreaterThan(0);
    });

    it('should handle flat prices', () => {
      const prices = Array(10).fill(5);
      const { supports, resistances } = findLevels(prices, 2);
      expect(supports.length + resistances.length).toBeGreaterThan(0);
    });

    it('should handle empty prices', () => {
      const { supports, resistances } = findLevels([], 2);
      expect(supports).toHaveLength(0);
      expect(resistances).toHaveLength(0);
    });

    it('should handle ascending prices', () => {
      const prices = Array.from({ length: 20 }, (_, i) => i);
      const { supports, resistances } = findLevels(prices, 3);
      expect(supports).toHaveLength(0);
      expect(resistances).toHaveLength(0);
    });
  });
});
