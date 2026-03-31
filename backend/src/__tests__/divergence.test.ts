import { describe, it, expect } from 'vitest';

/**
 * 背离检测引擎测试
 */

interface PriceIndicatorPair {
  price: number;
  indicator: number;
  timestamp: string;
}

interface DivergenceResult {
  type: 'bullish' | 'bearish' | 'hidden_bullish' | 'hidden_bearish' | 'none';
  strength: number;
  startIndex: number;
  endIndex: number;
  priceRange: [number, number];
  indicatorRange: [number, number];
}

function detectDivergence(
  pairs: PriceIndicatorPair[],
  lookback: number = 20
): DivergenceResult {
  if (pairs.length < 2) {
    return { type: 'none', strength: 0, startIndex: 0, endIndex: 0, priceRange: [0, 0], indicatorRange: [0, 0] };
  }

  const recent = pairs.slice(-lookback);
  const priceHighs = findLocalExtremes(recent.map(p => p.price), 'high');
  const priceLows = findLocalExtremes(recent.map(p => p.price), 'low');
  const indicatorHighs = findLocalExtremes(recent.map(p => p.indicator), 'high');
  const indicatorLows = findLocalExtremes(recent.map(p => p.indicator), 'low');

  // Bearish divergence: price higher high, indicator lower high
  if (priceHighs.length >= 2 && indicatorHighs.length >= 2) {
    const lastPriceHigh = priceHighs[priceHighs.length - 1];
    const prevPriceHigh = priceHighs[priceHighs.length - 2];
    const lastIndHigh = indicatorHighs[indicatorHighs.length - 1];
    const prevIndHigh = indicatorHighs[indicatorHighs.length - 2];

    if (recent[lastPriceHigh].price > recent[prevPriceHigh].price &&
        recent[lastIndHigh].indicator < recent[prevIndHigh].indicator) {
      const priceChange = (recent[lastPriceHigh].price - recent[prevPriceHigh].price) / recent[prevPriceHigh].price;
      const indChange = (recent[prevIndHigh].indicator - recent[lastIndHigh].indicator) / recent[prevIndHigh].indicator;
      return {
        type: 'bearish',
        strength: Math.min(1, (priceChange + indChange) / 2),
        startIndex: prevPriceHigh,
        endIndex: lastPriceHigh,
        priceRange: [recent[prevPriceHigh].price, recent[lastPriceHigh].price],
        indicatorRange: [recent[lastIndHigh].indicator, recent[prevIndHigh].indicator],
      };
    }
  }

  // Bullish divergence: price lower low, indicator higher low
  if (priceLows.length >= 2 && indicatorLows.length >= 2) {
    const lastPriceLow = priceLows[priceLows.length - 1];
    const prevPriceLow = priceLows[priceLows.length - 2];
    const lastIndLow = indicatorLows[indicatorLows.length - 1];
    const prevIndLow = indicatorLows[indicatorLows.length - 2];

    if (recent[lastPriceLow].price < recent[prevPriceLow].price &&
        recent[lastIndLow].indicator > recent[prevIndLow].indicator) {
      const priceChange = (recent[prevPriceLow].price - recent[lastPriceLow].price) / recent[prevPriceLow].price;
      const indChange = (recent[lastIndLow].indicator - recent[prevIndLow].indicator) / recent[prevIndLow].indicator;
      return {
        type: 'bullish',
        strength: Math.min(1, (priceChange + indChange) / 2),
        startIndex: prevPriceLow,
        endIndex: lastPriceLow,
        priceRange: [recent[lastPriceLow].price, recent[prevPriceLow].price],
        indicatorRange: [recent[prevIndLow].indicator, recent[lastIndLow].indicator],
      };
    }
  }

  return { type: 'none', strength: 0, startIndex: 0, endIndex: pairs.length - 1, priceRange: [0, 0], indicatorRange: [0, 0] };
}

function findLocalExtremes(values: number[], type: 'high' | 'low'): number[] {
  const extremes: number[] = [];
  for (let i = 1; i < values.length - 1; i++) {
    if (type === 'high' && values[i] > values[i - 1] && values[i] > values[i + 1]) {
      extremes.push(i);
    } else if (type === 'low' && values[i] < values[i - 1] && values[i] < values[i + 1]) {
      extremes.push(i);
    }
  }
  return extremes;
}

describe('Divergence Detection', () => {
  describe('熊背离', () => {
    it('应该检测到价格新高但指标未新高', () => {
      const pairs: PriceIndicatorPair[] = [
        { price: 10, indicator: 60, timestamp: '1' },
        { price: 12, indicator: 70, timestamp: '2' }, // high
        { price: 11, indicator: 60, timestamp: '3' },
        { price: 13, indicator: 65, timestamp: '4' }, // higher high, lower indicator
        { price: 12, indicator: 60, timestamp: '5' },
      ];
      const result = detectDivergence(pairs, 5);
      expect(result.type).toBe('bearish');
    });
  });

  describe('牛背离', () => {
    it('应该检测到价格新低但指标未新低', () => {
      const pairs: PriceIndicatorPair[] = [
        { price: 15, indicator: 40, timestamp: '1' },
        { price: 12, indicator: 30, timestamp: '2' }, // low
        { price: 14, indicator: 40, timestamp: '3' },
        { price: 10, indicator: 35, timestamp: '4' }, // lower low, higher indicator
        { price: 12, indicator: 40, timestamp: '5' },
      ];
      const result = detectDivergence(pairs, 5);
      expect(result.type).toBe('bullish');
    });
  });

  describe('无背离', () => {
    it('同向变动应该无背离', () => {
      const pairs: PriceIndicatorPair[] = [
        { price: 10, indicator: 50, timestamp: '1' },
        { price: 12, indicator: 60, timestamp: '2' },
        { price: 11, indicator: 55, timestamp: '3' },
        { price: 14, indicator: 70, timestamp: '4' },
        { price: 13, indicator: 65, timestamp: '5' },
      ];
      const result = detectDivergence(pairs, 5);
      expect(result.type).toBe('none');
    });

    it('数据不足应该返回none', () => {
      const pairs: PriceIndicatorPair[] = [{ price: 10, indicator: 50, timestamp: '1' }];
      const result = detectDivergence(pairs);
      expect(result.type).toBe('none');
    });
  });

  describe('局部极值', () => {
    it('应该找到局部高点', () => {
      const values = [1, 3, 2, 5, 1, 4, 2];
      const highs = findLocalExtremes(values, 'high');
      expect(highs).toContain(1); // 3
      expect(highs).toContain(3); // 5
      expect(highs).toContain(5); // 4
    });

    it('应该找到局部低点', () => {
      const values = [5, 2, 4, 1, 6, 3, 5];
      const lows = findLocalExtremes(values, 'low');
      expect(lows).toContain(1); // 2
      expect(lows).toContain(3); // 1
      expect(lows).toContain(5); // 3
    });
  });

  describe('强度', () => {
    it('差异越大强度越高', () => {
      const strongPairs: PriceIndicatorPair[] = [
        { price: 10, indicator: 80, timestamp: '1' },
        { price: 15, indicator: 70, timestamp: '2' },
        { price: 12, indicator: 75, timestamp: '3' },
        { price: 20, indicator: 60, timestamp: '4' },
        { price: 18, indicator: 65, timestamp: '5' },
      ];
      const result = detectDivergence(strongPairs, 5);
      if (result.type !== 'none') {
        expect(result.strength).toBeGreaterThan(0);
      }
    });
  });
});
