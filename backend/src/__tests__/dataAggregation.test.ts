import { describe, it, expect } from 'vitest';
import {
  aggregateOHLCV,
  calculateVWAP,
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateATR,
} from '../services/dataAggregation';

const sampleData = [
  { open: 10, high: 12, low: 9, close: 11, volume: 1000, timestamp: 1 },
  { open: 11, high: 13, low: 10, close: 12, volume: 1500, timestamp: 2 },
  { open: 12, high: 14, low: 11, close: 13, volume: 2000, timestamp: 3 },
  { open: 13, high: 15, low: 12, close: 14, volume: 1800, timestamp: 4 },
  { open: 14, high: 16, low: 13, close: 15, volume: 2200, timestamp: 5 },
];

describe('aggregateOHLCV', () => {
  it('should return empty for empty input', () => {
    expect(aggregateOHLCV([], 1)).toEqual([]);
  });

  it('should aggregate data within interval', () => {
    const result = aggregateOHLCV(sampleData, 10);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should maintain OHLCV integrity', () => {
    const result = aggregateOHLCV(sampleData, 10);
    for (const candle of result) {
      expect(candle.high).toBeGreaterThanOrEqual(candle.open);
      expect(candle.high).toBeGreaterThanOrEqual(candle.close);
      expect(candle.low).toBeLessThanOrEqual(candle.open);
      expect(candle.low).toBeLessThanOrEqual(candle.close);
      expect(candle.volume).toBeGreaterThan(0);
    }
  });
});

describe('calculateVWAP', () => {
  it('should return correct length', () => {
    const vwap = calculateVWAP(sampleData);
    expect(vwap).toHaveLength(sampleData.length);
  });

  it('should calculate reasonable VWAP values', () => {
    const vwap = calculateVWAP(sampleData);
    for (const v of vwap) {
      expect(v).toBeGreaterThan(0);
    }
  });

  it('should return empty for empty input', () => {
    expect(calculateVWAP([])).toEqual([]);
  });
});

describe('calculateSMA', () => {
  it('should return correct length', () => {
    const sma = calculateSMA([1, 2, 3, 4, 5], 3);
    expect(sma).toHaveLength(5);
  });

  it('should have NaN for insufficient data', () => {
    const sma = calculateSMA([1, 2, 3, 4, 5], 3);
    expect(isNaN(sma[0])).toBe(true);
    expect(isNaN(sma[1])).toBe(true);
  });

  it('should calculate correct values', () => {
    const sma = calculateSMA([10, 20, 30, 40, 50], 3);
    expect(sma[2]).toBe(20); // (10+20+30)/3
    expect(sma[3]).toBe(30); // (20+30+40)/3
    expect(sma[4]).toBe(40); // (30+40+50)/3
  });
});

describe('calculateEMA', () => {
  it('should return correct length', () => {
    const ema = calculateEMA([1, 2, 3, 4, 5], 3);
    expect(ema).toHaveLength(5);
  });

  it('should start with first value', () => {
    const ema = calculateEMA([100, 200, 300], 3);
    expect(ema[0]).toBe(100);
  });

  it('should produce smoothed values', () => {
    const ema = calculateEMA([10, 20, 30, 40, 50], 3);
    // Each value should be between prev and current
    for (let i = 1; i < ema.length; i++) {
      expect(ema[i]).toBeGreaterThan(ema[i - 1]);
    }
  });
});

describe('calculateRSI', () => {
  it('should return correct length', () => {
    const prices = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64];
    const rsi = calculateRSI(prices, 14);
    expect(rsi).toHaveLength(prices.length);
  });

  it('should have NaN for insufficient data', () => {
    const prices = [1, 2, 3, 4, 5];
    const rsi = calculateRSI(prices, 14);
    const nanCount = rsi.filter(isNaN).length;
    expect(nanCount).toBeGreaterThan(0);
  });

  it('should return values between 0 and 100', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i * Math.sin(i));
    const rsi = calculateRSI(prices, 14);
    for (const v of rsi) {
      if (!isNaN(v)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('calculateMACD', () => {
  it('should return macd, signal, and histogram', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 100 + i);
    const result = calculateMACD(prices);
    expect(result.macd).toHaveLength(prices.length);
    expect(result.signal).toHaveLength(prices.length);
    expect(result.histogram).toHaveLength(prices.length);
  });

  it('histogram should equal macd minus signal', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 100 + i);
    const result = calculateMACD(prices);
    for (let i = 0; i < prices.length; i++) {
      if (!isNaN(result.macd[i]) && !isNaN(result.signal[i])) {
        expect(result.histogram[i]).toBeCloseTo(result.macd[i] - result.signal[i], 10);
      }
    }
  });
});

describe('calculateBollingerBands', () => {
  it('should return upper, middle, lower', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
    const result = calculateBollingerBands(prices, 20, 2);
    expect(result.upper).toHaveLength(prices.length);
    expect(result.middle).toHaveLength(prices.length);
    expect(result.lower).toHaveLength(prices.length);
  });

  it('upper should be above middle, middle above lower', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
    const result = calculateBollingerBands(prices, 20, 2);
    for (let i = 19; i < prices.length; i++) {
      expect(result.upper[i]).toBeGreaterThan(result.middle[i]);
      expect(result.middle[i]).toBeGreaterThan(result.lower[i]);
    }
  });
});

describe('calculateATR', () => {
  it('should return correct length', () => {
    const atr = calculateATR(
      [10, 11, 12, 13, 14],
      [8, 9, 10, 11, 12],
      [9, 10, 11, 12, 13],
      3
    );
    expect(atr).toHaveLength(5);
  });

  it('should return positive values', () => {
    const atr = calculateATR(
      [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
      [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
      [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
      14
    );
    for (const v of atr) {
      if (!isNaN(v)) {
        expect(v).toBeGreaterThan(0);
      }
    }
  });
});
